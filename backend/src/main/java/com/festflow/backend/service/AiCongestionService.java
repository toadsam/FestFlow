package com.festflow.backend.service;

import com.festflow.backend.dto.AiBoothRecommendationDto;
import com.festflow.backend.dto.AiFestivalGuideDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.service.FestivalSnapshotService.FestivalSnapshot;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class AiCongestionService {

    private final FestivalSnapshotService snapshotService;
    private final AiDecisionLogService decisionLogService;

    public AiCongestionService(
            FestivalSnapshotService snapshotService,
            AiDecisionLogService decisionLogService
    ) {
        this.snapshotService = snapshotService;
        this.decisionLogService = decisionLogService;
    }

    public AiFestivalGuideDto guide() {
        FestivalSnapshot snapshot = snapshotService.current();
        List<AiBoothRecommendationDto> insights = analyze(snapshot);

        List<AiBoothRecommendationDto> recommendedNow = insights.stream()
                .filter(this::isVisitorDestination)
                .filter(AiBoothRecommendationDto::recommendedNow)
                .sorted(Comparator
                        .comparingInt(AiBoothRecommendationDto::riskScore)
                        .thenComparing(dto -> value(dto.waitMinutes())))
                .limit(3)
                .toList();

        List<AiBoothRecommendationDto> avoidNow = insights.stream()
                .filter(dto -> dto.riskScore() >= 60)
                .sorted(Comparator.comparingInt(AiBoothRecommendationDto::riskScore).reversed())
                .limit(3)
                .toList();

        List<AiBoothRecommendationDto> recommendedLater = insights.stream()
                .filter(this::isVisitorDestination)
                .filter(dto -> dto.riskScore() < 70)
                .sorted(Comparator
                        .comparing((AiBoothRecommendationDto dto) -> levelRank(dto.predictedLevel()))
                        .thenComparingInt(AiBoothRecommendationDto::riskScore))
                .limit(3)
                .toList();

        AiFestivalGuideDto guide = new AiFestivalGuideDto(
                snapshot.capturedAt(),
                headline(insights, recommendedNow, avoidNow),
                summary(insights, recommendedNow, avoidNow),
                recommendedNow,
                avoidNow,
                recommendedLater,
                userActions(recommendedNow, avoidNow, snapshot),
                operatorAlerts(insights, snapshot)
        );
        recordGuideDecision(guide);
        return guide;
    }

    public List<AiBoothRecommendationDto> analyzeCurrent() {
        return analyze(snapshotService.current());
    }

    private List<AiBoothRecommendationDto> analyze(FestivalSnapshot snapshot) {
        boolean eventSoon = hasEventStartingSoon(snapshot.events(), snapshot.capturedAt());
        return snapshot.booths().stream()
                .map(booth -> analyzeBooth(snapshot, booth, eventSoon))
                .sorted(Comparator.comparingInt(AiBoothRecommendationDto::riskScore).reversed())
                .toList();
    }

    private void recordGuideDecision(AiFestivalGuideDto guide) {
        List<String> reasons = guide.recommendedNow().stream()
                .limit(3)
                .flatMap(dto -> dto.reasons().stream().limit(2))
                .toList();
        decisionLogService.record(
                "FESTIVAL_GUIDE",
                guide.headline(),
                guide.summary(),
                reasons,
                guide.operatorAlerts().stream().limit(3).toList()
        );
    }

    private AiBoothRecommendationDto analyzeBooth(FestivalSnapshot snapshot, BoothResponseDto booth, boolean eventSoon) {
        CongestionResponseDto congestion = snapshot.congestionByBoothId().get(booth.id());
        int crowdCount = congestion == null ? 0 : congestion.nearbyUserCount();
        long activeReservations = snapshot.activeReservationCount(booth.id());
        long checkedInReservations = snapshot.reservationCount(booth.id(), ReservationStatus.CHECKED_IN);
        int tableCount = value(booth.reservationTableCount());
        int availableSeats = value(booth.reservationAvailableSeats());
        int waitMinutes = value(booth.estimatedWaitMinutes());
        int remainingStock = booth.remainingStock() == null ? 99 : Math.max(0, booth.remainingStock());

        int riskScore = 0;
        riskScore += Math.min(30, crowdCount * 5);
        riskScore += Math.min(20, waitMinutes / 2);
        riskScore += Math.min(20, (int) activeReservations * 5);
        if (tableCount > 0) {
            riskScore += Math.min(15, (int) Math.round((activeReservations * 15.0) / tableCount));
        }
        if (availableSeats <= 0 && Boolean.TRUE.equals(booth.reservationEnabled())) {
            riskScore += 12;
        } else if (availableSeats <= 3 && Boolean.TRUE.equals(booth.reservationEnabled())) {
            riskScore += 8;
        } else if (availableSeats >= 10) {
            riskScore -= 5;
        }
        if (remainingStock <= 0) {
            riskScore += 15;
        } else if (remainingStock <= 10) {
            riskScore += 8;
        }
        if (eventSoon) {
            riskScore += 6;
        }
        riskScore = Math.max(0, Math.min(100, riskScore));

        int predictedScore = Math.min(100, riskScore + (eventSoon ? 8 : 0) + (activeReservations >= 2 ? 5 : 0));
        boolean recommendedNow = riskScore <= 45
                && waitMinutes <= 15
                && remainingStock > 0
                && (!Boolean.TRUE.equals(booth.reservationEnabled()) || availableSeats > 0);

        return new AiBoothRecommendationDto(
                booth.id(),
                booth.name(),
                booth.category(),
                congestion == null ? "UNKNOWN" : congestion.level(),
                predictedLevel(predictedScore),
                riskLevel(riskScore),
                riskScore,
                crowdCount,
                (int) activeReservations,
                (int) checkedInReservations,
                booth.reservationAvailableSeats(),
                booth.estimatedWaitMinutes(),
                booth.remainingStock(),
                recommendedNow,
                reasons(booth, crowdCount, activeReservations, checkedInReservations, availableSeats, waitMinutes, remainingStock, eventSoon, riskScore)
        );
    }

    private List<String> reasons(
            BoothResponseDto booth,
            int crowdCount,
            long activeReservations,
            long checkedInReservations,
            int availableSeats,
            int waitMinutes,
            int remainingStock,
            boolean eventSoon,
            int riskScore
    ) {
        List<String> reasons = new ArrayList<>();
        reasons.add("현재 주변 감지 인원 " + crowdCount + "명");
        if (waitMinutes > 0) {
            reasons.add("운영자가 입력한 예상 대기 " + waitMinutes + "분");
        }
        if (Boolean.TRUE.equals(booth.reservationEnabled())) {
            reasons.add("활성 예약 " + activeReservations + "건, 체크인 " + checkedInReservations + "건");
            reasons.add("예약 가능 좌석 " + availableSeats + "석");
        }
        if (remainingStock <= 10) {
            reasons.add(remainingStock <= 0 ? "재고 소진 상태" : "재고 10개 이하");
        }
        if (eventSoon) {
            reasons.add("30분 내 공연 시작 영향 반영");
        }
        if (riskScore <= 45) {
            reasons.add("AI 판단: 지금 방문 부담이 낮음");
        } else if (riskScore >= 75) {
            reasons.add("AI 판단: 혼잡 위험이 높아 우회 권장");
        } else {
            reasons.add("AI 판단: 상황 확인 후 방문 권장");
        }
        return reasons;
    }

    private boolean hasEventStartingSoon(List<EventResponseDto> events, LocalDateTime now) {
        return events.stream()
                .map(EventResponseDto::startTime)
                .filter(startTime -> startTime != null && !startTime.isBefore(now.minusMinutes(5)))
                .anyMatch(startTime -> Duration.between(now, startTime).toMinutes() <= 30);
    }

    private String headline(
            List<AiBoothRecommendationDto> insights,
            List<AiBoothRecommendationDto> recommendedNow,
            List<AiBoothRecommendationDto> avoidNow
    ) {
        if (!avoidNow.isEmpty()) {
            return avoidNow.get(0).boothName() + " 주변 혼잡 위험이 높습니다.";
        }
        if (!recommendedNow.isEmpty()) {
            return recommendedNow.get(0).boothName() + " 방문을 먼저 추천합니다.";
        }
        if (insights.isEmpty()) {
            return "AI가 축제 데이터를 수집하는 중입니다.";
        }
        return "현재 축제 상황은 안정적으로 보입니다.";
    }

    private boolean isVisitorDestination(AiBoothRecommendationDto dto) {
        String category = dto.category() == null ? "" : dto.category();
        if (category.contains("응급")
                || category.contains("안내")
                || category.contains("편의")
                || category.contains("상담")
                || category.contains("의무실")
                || category.contains("쉼터")
                || category.contains("휴식")
                || category.contains("분실물")) {
            return false;
        }
        return dto.waitMinutes() != null && dto.waitMinutes() > 0
                || dto.availableSeats() != null && dto.availableSeats() > 0
                || category.contains("주점")
                || category.contains("푸드")
                || category.contains("체험")
                || category.contains("이벤트")
                || category.contains("공연")
                || category.contains("굿즈")
                || category.contains("음식");
    }

    private String summary(
            List<AiBoothRecommendationDto> insights,
            List<AiBoothRecommendationDto> recommendedNow,
            List<AiBoothRecommendationDto> avoidNow
    ) {
        if (insights.isEmpty()) {
            return "부스 데이터가 아직 없어 AI 추천을 만들 수 없습니다.";
        }
        String best = recommendedNow.isEmpty() ? "추천 후보 없음" : recommendedNow.get(0).boothName();
        String risky = avoidNow.isEmpty() ? "즉시 우회가 필요한 부스 없음" : avoidNow.get(0).boothName();
        return "AI가 혼잡도, 예약, 체크인, 대기시간, 재고, 공연 임박도를 종합했습니다. 지금 추천: "
                + best + " / 주의: " + risky;
    }

    private List<String> userActions(
            List<AiBoothRecommendationDto> recommendedNow,
            List<AiBoothRecommendationDto> avoidNow,
            FestivalSnapshot snapshot
    ) {
        List<String> actions = new ArrayList<>();
        if (!recommendedNow.isEmpty()) {
            AiBoothRecommendationDto best = recommendedNow.get(0);
            actions.add(best.boothName() + "를 먼저 확인하세요. " + String.join(", ", best.reasons().stream().limit(2).toList()));
        }
        if (!avoidNow.isEmpty()) {
            actions.add(avoidNow.get(0).boothName() + " 주변은 혼잡 위험이 높아 우회 동선을 추천합니다.");
        }
        snapshot.events().stream()
                .filter(event -> event.startTime() != null)
                .filter(event -> !event.startTime().isBefore(snapshot.capturedAt()))
                .min(Comparator.comparing(EventResponseDto::startTime))
                .ifPresent(event -> actions.add("다음 공연 전에는 이동 시간을 여유 있게 잡으세요: " + event.title()));
        if (actions.isEmpty()) {
            actions.add("지도에서 가까운 부스를 확인하고 대기시간이 짧은 곳부터 방문하세요.");
        }
        return actions;
    }

    private List<String> operatorAlerts(List<AiBoothRecommendationDto> insights, FestivalSnapshot snapshot) {
        List<String> alerts = new ArrayList<>();
        insights.stream()
                .filter(dto -> dto.riskScore() >= 75)
                .limit(3)
                .forEach(dto -> alerts.add(dto.boothName() + " 혼잡 위험 " + dto.riskScore() + "점: 우회 공지 또는 대기열 정리가 필요합니다."));
        insights.stream()
                .filter(dto -> dto.remainingStock() != null && dto.remainingStock() <= 10)
                .limit(2)
                .forEach(dto -> alerts.add(dto.boothName() + " 재고 부족 가능성: 운영자 확인이 필요합니다."));
        long urgentStaff = snapshot.staff().stream()
                .filter(staff -> "URGENT".equals(staff.status()))
                .count();
        if (urgentStaff > 0) {
            alerts.add("긴급 상태 스태프 " + urgentStaff + "명: 위치와 메모를 우선 확인하세요.");
        }
        if (alerts.isEmpty()) {
            alerts.add("즉시 조치가 필요한 AI 경보는 없습니다.");
        }
        return alerts;
    }

    private String riskLevel(int score) {
        if (score >= 75) return "RISK";
        if (score >= 55) return "BUSY";
        if (score >= 30) return "NORMAL";
        return "LOW";
    }

    private String predictedLevel(int score) {
        if (score >= 75) return "매우 혼잡";
        if (score >= 55) return "혼잡";
        if (score >= 30) return "보통";
        return "여유";
    }

    private int levelRank(String level) {
        return switch (level) {
            case "여유" -> 0;
            case "보통" -> 1;
            case "혼잡" -> 2;
            case "매우 혼잡" -> 3;
            default -> 4;
        };
    }

    private int value(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }
}
