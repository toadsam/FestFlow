package com.festflow.backend.service;

import com.festflow.backend.dto.AiBoothRecommendationDto;
import com.festflow.backend.dto.AiFestivalGuideDto;
import com.festflow.backend.dto.AiModelPredictionDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.repository.BoothReservationRepository;
import com.festflow.backend.repository.GpsLogRepository;
import com.festflow.backend.service.FestivalSnapshotService.FestivalSnapshot;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
/**
 * [서비스 상세 주석] AI 혼잡도 예측과 방문 추천을 만드는 핵심 서비스입니다.
 * 이 클래스의 핵심은 GPS, 예약, 공연, 대기시간, 재고 데이터를 feature로 만들고 Python 모델 결과와 fallback 판단을 합칩니다.
 * 주요 관심사는 DB 조회/저장, AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AiCongestionService {
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final FestivalSnapshotService snapshotService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final AiDecisionLogService decisionLogService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final PythonCongestionModelService pythonCongestionModelService;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final GpsLogRepository gpsLogRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final BoothReservationRepository boothReservationRepository;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public AiCongestionService(
            FestivalSnapshotService snapshotService,
            AiDecisionLogService decisionLogService,
            PythonCongestionModelService pythonCongestionModelService,
            GpsLogRepository gpsLogRepository,
            BoothReservationRepository boothReservationRepository
    ) {
        this.snapshotService = snapshotService;
        this.decisionLogService = decisionLogService;
        this.pythonCongestionModelService = pythonCongestionModelService;
        this.gpsLogRepository = gpsLogRepository;
        this.boothReservationRepository = boothReservationRepository;
    }
/**
 * [상세 주석] guide 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 현재 축제 데이터를 바탕으로 방문자에게 보여줄 AI 가이드 전체를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiFestivalGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 대기시간은 방문 추천과 혼잡 위험 점수 계산에 직접 영향을 줍니다.
 * - riskScore는 여러 지표를 합산한 위험 점수이며, 구간에 따라 LOW/NORMAL/BUSY/RISK 같은 판단으로 바뀝니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
                        .comparing((AiBoothRecommendationDto dto) -> modelLevelRank(dto.predictedLevel()))
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
/**
 * [상세 주석] analyzeCurrent 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 현재 축제 스냅샷을 가져와 부스별 AI 혼잡도 추천 목록을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<AiBoothRecommendationDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public List<AiBoothRecommendationDto> analyzeCurrent() {
        return analyze(snapshotService.current());
    }
/**
 * [상세 주석] analyze 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 축제 스냅샷 안의 모든 부스를 돌면서 AI 추천 결과를 계산하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: List<AiBoothRecommendationDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 공연이 곧 시작되는지는 혼잡도 예측과 추천 판단에 추가 위험 요소로 반영됩니다.
 * - riskScore는 여러 지표를 합산한 위험 점수이며, 구간에 따라 LOW/NORMAL/BUSY/RISK 같은 판단으로 바뀝니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private List<AiBoothRecommendationDto> analyze(FestivalSnapshot snapshot) {
        boolean eventSoon = hasEventStartingSoon(snapshot.events(), snapshot.capturedAt());
        Map<Long, AiModelPredictionDto> modelPredictions = modelPredictions(snapshot, eventSoon);
        return snapshot.booths().stream()
                .map(booth -> analyzeBooth(snapshot, booth, eventSoon, modelPredictions.get(booth.id())))
                .sorted(Comparator.comparingInt(AiBoothRecommendationDto::riskScore).reversed())
                .toList();
    }
/**
 * [상세 주석] recordGuideDecision 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 처리 결과나 운영 지표를 나중에 확인할 수 있도록 기록하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] analyzeBooth 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 부스 하나의 GPS, 예약, 대기시간, 재고를 보고 위험 점수와 추천 여부를 계산하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiBoothRecommendationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 부스 하나에 대해 GPS 인원, 예약 수, 체크인 수, 좌석, 대기시간, 재고를 모두 모읍니다.
 * - 각 요소를 점수화해 riskScore를 만들고 0~100 범위로 제한합니다.
 * - Python 모델 결과가 있으면 예측 등급으로 사용하고, 없으면 규칙 기반 fallback 예측을 사용합니다.
 * - 위험 점수와 대기시간, 재고, 예약 가능 좌석을 보고 지금 추천할 수 있는 부스인지 판단합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiBoothRecommendationDto analyzeBooth(
            FestivalSnapshot snapshot,
            BoothResponseDto booth,
            boolean eventSoon,
            AiModelPredictionDto modelPrediction
    ) {
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
        String fallbackPredictedLevel = displayPredictedLevel(predictedScore);
        TemporalFeatures temporal = temporalFeatures(snapshot, booth, eventSoon);
        List<String> modelFactors = modelFactors(booth, crowdCount, activeReservations, checkedInReservations, availableSeats, waitMinutes, remainingStock, eventSoon, temporal);
        AiModelPredictionDto aiModel = modelPrediction != null
                ? modelPrediction
                : AiModelPredictionDto.fallback(fallbackPredictedLevel, modelFactors, "MODEL_UNAVAILABLE");
        String finalPredictedLevel = aiModel.displayPredictedLevel() == null ? fallbackPredictedLevel : aiModel.displayPredictedLevel();
        boolean recommendedNow = riskScore <= 45
                && waitMinutes <= 15
                && remainingStock > 0
                && (!Boolean.TRUE.equals(booth.reservationEnabled()) || availableSeats > 0);

        return new AiBoothRecommendationDto(
                booth.id(),
                booth.name(),
                booth.category(),
                congestion == null ? "UNKNOWN" : congestion.level(),
                finalPredictedLevel,
                riskLevel(riskScore),
                riskScore,
                crowdCount,
                (int) activeReservations,
                (int) checkedInReservations,
                booth.reservationAvailableSeats(),
                booth.estimatedWaitMinutes(),
                booth.remainingStock(),
                recommendedNow,
                reasons(booth, crowdCount, activeReservations, checkedInReservations, availableSeats, waitMinutes, remainingStock, eventSoon, riskScore),
                aiModel
        );
    }
/**
 * [상세 주석] modelPredictions 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 각 부스의 feature를 만들어 Python 혼잡도 모델에 한 번에 예측을 요청하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Map<Long, AiModelPredictionDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 공연이 곧 시작되는지는 혼잡도 예측과 추천 판단에 추가 위험 요소로 반영됩니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * - 예약 가능 좌석이 없거나 적으면 혼잡 위험이 높다고 판단하는 근거가 됩니다.
 * - 대기시간은 방문 추천과 혼잡 위험 점수 계산에 직접 영향을 줍니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private Map<Long, AiModelPredictionDto> modelPredictions(FestivalSnapshot snapshot, boolean eventSoon) {
        List<PythonCongestionModelService.ModelPredictionRequest> requests = snapshot.booths().stream()
                .map(booth -> {
                    CongestionResponseDto congestion = snapshot.congestionByBoothId().get(booth.id());
                    int crowdCount = congestion == null ? 0 : congestion.nearbyUserCount();
                    long activeReservations = snapshot.activeReservationCount(booth.id());
                    long checkedInReservations = snapshot.reservationCount(booth.id(), ReservationStatus.CHECKED_IN);
                    int availableSeats = value(booth.reservationAvailableSeats());
                    int waitMinutes = value(booth.estimatedWaitMinutes());
                    int remainingStock = booth.remainingStock() == null ? 99 : Math.max(0, booth.remainingStock());
                    TemporalFeatures temporal = temporalFeatures(snapshot, booth, eventSoon);
                    List<String> factors = modelFactors(booth, crowdCount, activeReservations, checkedInReservations, availableSeats, waitMinutes, remainingStock, eventSoon, temporal);
                    return new PythonCongestionModelService.ModelPredictionRequest(
                            booth.id(),
                            modelFeatures(snapshot, booth, crowdCount, activeReservations, checkedInReservations, availableSeats, waitMinutes, remainingStock, eventSoon, temporal),
                            factors
                    );
                })
                .toList();
        return pythonCongestionModelService.predictBatch(requests);
    }
/**
 * [상세 주석] temporalFeatures 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: TemporalFeatures 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 조건/분기 설명:
 * - 현재 시점과 직전 구간을 비교해 시간 변화량 feature를 계산합니다.
 * - 최근 5분/15분 GPS 변화량, 15분 예약 증가량, 체크인 증가량, 대기시간 변화 추정값을 만듭니다.
 * - 정적인 현재값뿐 아니라 '방금 증가했는지'를 모델이 볼 수 있게 하는 부분입니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private TemporalFeatures temporalFeatures(FestivalSnapshot snapshot, BoothResponseDto booth, boolean eventSoon) {
        LocalDateTime now = snapshot.capturedAt();
        int currentGps5m = gpsNearbyBetween(booth, now.minusMinutes(5), now);
        int previousGps5m = gpsNearbyBetween(booth, now.minusMinutes(10), now.minusMinutes(5));
        int currentGps15m = gpsNearbyBetween(booth, now.minusMinutes(15), now);
        int previousGps15m = gpsNearbyBetween(booth, now.minusMinutes(30), now.minusMinutes(15));
        int reservationDelta15m = (int) boothReservationRepository.countByBoothIdAndReservedAtBetween(
                booth.id(),
                now.minusMinutes(15),
                now
        );
        int checkedInDelta15m = (int) boothReservationRepository.countByBoothIdAndCheckedInAtBetween(
                booth.id(),
                now.minusMinutes(15),
                now
        );
        int waitDelta15m = (int) Math.round(
                ((currentGps15m - previousGps15m) * 0.2)
                        + (reservationDelta15m * 0.9)
                        + (eventSoon ? 5 : 0)
        );
        return new TemporalFeatures(
                currentGps5m - previousGps5m,
                currentGps15m - previousGps15m,
                reservationDelta15m,
                checkedInDelta15m,
                waitDelta15m
        );
    }
/**
 * [상세 주석] gpsNearbyBetween 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 특정 시간 구간의 GPS 로그 중 부스 반경 안에 들어온 로그만 세는 메서드입니다.
 * - 시간 조건과 거리 조건을 모두 통과한 로그 수가 해당 구간의 주변 인원 추정값이 됩니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private int gpsNearbyBetween(BoothResponseDto booth, LocalDateTime from, LocalDateTime to) {
        return (int) gpsLogRepository.findByCreatedAtAfter(from).stream()
                .filter(log -> log.getCreatedAt() != null && !log.getCreatedAt().isBefore(from) && log.getCreatedAt().isBefore(to))
                .filter(log -> distanceInMeters(booth.latitude(), booth.longitude(), log.getLatitude(), log.getLongitude()) <= 80.0)
                .count();
    }
/**
 * [상세 주석] modelFeatures 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Python 모델이 이해할 수 있도록 현재 상태값을 feature Map으로 정리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: Map<String, Object>입니다. id나 key로 결과를 빠르게 찾기 위한 구조입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - Python 모델에 넘길 feature Map을 만드는 메서드입니다.
 * - 시간대, 피크 여부, 공연 인기도, 무대 예상 인원, GPS 변화량, 예약 변화량, 좌석, 대기시간, 재고를 key-value 형태로 담습니다.
 * - Java 서버는 이 Map을 JSON으로 바꾸고 Python 모델은 같은 key 이름을 기준으로 예측합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Map<String, Object> modelFeatures(
            FestivalSnapshot snapshot,
            BoothResponseDto booth,
            int crowdCount,
            long activeReservations,
            long checkedInReservations,
            int availableSeats,
            int waitMinutes,
            int remainingStock,
            boolean eventSoon,
            TemporalFeatures temporal
    ) {
        int hour = snapshot.capturedAt().getHour();
        int stageCapacity = 4000;
        String artistPopularity = artistPopularity(snapshot.events(), snapshot.capturedAt(), eventSoon);
        int expectedStageCrowd = expectedStageCrowd(hour, artistPopularity, eventSoon);

        Map<String, Object> features = new HashMap<>();
        features.put("scenario_day", snapshot.capturedAt().getDayOfYear());
        features.put("hour", hour);
        features.put("is_peak_time", isPeakTime(hour) ? 1 : 0);
        features.put("artist_popularity_score", popularityScore(artistPopularity));
        features.put("stage_capacity", stageCapacity);
        features.put("expected_stage_crowd", expectedStageCrowd);
        features.put("stage_load_ratio", Math.round((expectedStageCrowd / (double) stageCapacity) * 1000.0) / 1000.0);
        features.put("is_night_booth", isNightBooth(booth, hour) ? 1 : 0);
        features.put("event_soon", eventSoon ? 1 : 0);
        features.put("minutes_to_next_event", minutesToNextEvent(snapshot.events(), snapshot.capturedAt()));
        features.put("gps_count_nearby", crowdCount);
        features.put("gps_delta_5m", temporal.gpsDelta5m());
        features.put("gps_delta_15m", temporal.gpsDelta15m());
        features.put("reservation_count", (int) activeReservations);
        features.put("reservation_delta_15m", temporal.reservationDelta15m());
        features.put("checked_in_count", (int) checkedInReservations);
        features.put("checked_in_delta_15m", temporal.checkedInDelta15m());
        features.put("available_seats", availableSeats);
        features.put("wait_minutes", waitMinutes);
        features.put("wait_delta_15m", temporal.waitDelta15m());
        features.put("remaining_stock", remainingStock);
        features.put("event_count_context", snapshot.events().size());
        features.put("zone_type", zoneType(booth));
        features.put("artist_popularity", artistPopularity);
        return features;
    }
/**
 * [상세 주석] modelFactors 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: AI 예측 카드에 보여줄 판단 근거 문장을 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 모델 결과와 함께 화면에 보여줄 설명 문구를 만드는 메서드입니다.
 * - GPS 인원, 대기시간, GPS 변화량, 예약 증가량, 좌석, 공연 임박 여부, 재고 상태를 사람이 읽을 수 있는 문자열로 정리합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<String> modelFactors(
            BoothResponseDto booth,
            int crowdCount,
            long activeReservations,
            long checkedInReservations,
            int availableSeats,
            int waitMinutes,
            int remainingStock,
            boolean eventSoon,
            TemporalFeatures temporal
    ) {
        List<String> factors = new ArrayList<>();
        factors.add("GPS 추정 인원 " + crowdCount + "명");
        factors.add("대기 시간 " + waitMinutes + "분");
        factors.add("GPS 변화량 5분 " + signed(temporal.gpsDelta5m()) + " / 15분 " + signed(temporal.gpsDelta15m()));
        factors.add("예약 증가 15분 +" + temporal.reservationDelta15m() + "건 / 체크인 증가 +" + temporal.checkedInDelta15m() + "건");
        factors.add("추정 대기 변화 15분 " + signed(temporal.waitDelta15m()) + "분");
        if (Boolean.TRUE.equals(booth.reservationEnabled())) {
            factors.add("예약 " + activeReservations + "건 / 체크인 " + checkedInReservations + "건");
            factors.add("예약 가능 좌석 " + availableSeats + "석");
        }
        if (eventSoon) {
            factors.add("30분 내 공연 시작");
        }
        if (remainingStock <= 10) {
            factors.add(remainingStock <= 0 ? "재고 소진" : "재고 10개 이하");
        }
        factors.add("구역 유형 " + zoneType(booth));
        return factors;
    }
/**
 * [상세 주석] reasons 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 방문 추천 또는 회피 추천의 이유를 사용자에게 보여줄 문장으로 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - AI 추천 카드에 표시할 판단 이유를 만드는 메서드입니다.
 * - 혼잡 인원, 대기시간, 예약/체크인, 좌석, 재고, 공연 임박 여부를 조건별로 문장에 추가합니다.
 * - riskScore 구간에 따라 지금 방문, 상황 확인 후 방문, 회피 권장 같은 최종 판단 문구를 붙입니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] hasEventStartingSoon 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private boolean hasEventStartingSoon(List<EventResponseDto> events, LocalDateTime now) {
        return events.stream()
                .map(EventResponseDto::startTime)
                .filter(startTime -> startTime != null && !startTime.isBefore(now.minusMinutes(5)))
                .anyMatch(startTime -> Duration.between(now, startTime).toMinutes() <= 30);
    }
/**
 * [상세 주석] headline 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: AI 가이드 상단에 보여줄 한 줄 제목을 상황별로 선택하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - avoidNow 목록이 비어 있지 않으면 가장 위험한 부스를 제목에 먼저 사용해 경고 메시지를 만듭니다.
 * - 피해야 할 곳이 없고 recommendedNow가 있으면 지금 방문하기 좋은 부스를 제목으로 사용합니다.
 * - insights 자체가 비어 있으면 아직 분석 데이터가 없다는 뜻이므로 데이터 수집 중 문구를 반환합니다.
 * - 위험도 추천도 모두 특별하지 않으면 현재 상황이 안정적이라는 기본 제목을 반환합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] isVisitorDestination 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 부스가 방문객에게 추천할 만한 목적지인지 판단하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 응급, 안내, 의무실, 쉼터, 분실물처럼 방문객에게 놀러 가라고 추천하면 안 되는 장소는 먼저 false로 제외합니다.
 * - 대기시간이 있거나 예약 가능 좌석이 있는 곳은 실제 방문 목적지일 가능성이 있으므로 추천 후보로 봅니다.
 * - 주점, 푸드, 체험, 이벤트, 공연, 굿즈, 음식 카테고리는 사용자가 찾아갈 가능성이 높은 목적지로 판단합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] summary 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: AI 가이드의 전체 상황 요약 문장을 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] userActions 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] operatorAlerts 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 운영자가 확인해야 할 혼잡, 재고, 스태프 경고 문장을 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * - riskScore는 여러 지표를 합산한 위험 점수이며, 구간에 따라 LOW/NORMAL/BUSY/RISK 같은 판단으로 바뀝니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] isPeakTime 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean isPeakTime(int hour) {
        return hour >= 18 && hour <= 22;
    }
/**
 * [상세 주석] isNightBooth 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean isNightBooth(BoothResponseDto booth, int hour) {
        String text = normalize(booth.category() + " " + booth.dayPart() + " " + booth.name() + " " + booth.tags());
        return hour >= 18 && (text.contains("주점")
                || text.contains("야간")
                || text.contains("푸드")
                || text.contains("food")
                || text.contains("pub")
                || text.contains("bar"));
    }
/**
 * [상세 주석] zoneType 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String zoneType(BoothResponseDto booth) {
        String text = normalize(booth.category() + " " + booth.name() + " " + booth.tags());
        if (text.contains("공연") || text.contains("무대") || text.contains("stage")) {
            return "STAGE";
        }
        if (text.contains("주점") || text.contains("pub") || text.contains("bar")) {
            return "PUB";
        }
        if (text.contains("푸드") || text.contains("음식") || text.contains("food") || text.contains("카페") || text.contains("디저트")) {
            return "FOOD";
        }
        if (text.contains("체험") || text.contains("이벤트") || text.contains("experience")) {
            return "EXPERIENCE";
        }
        if (text.contains("굿즈") || text.contains("goods")) {
            return "GOODS";
        }
        return "SAFETY";
    }
/**
 * [상세 주석] artistPopularity 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 공연이 곧 시작되는지는 혼잡도 예측과 추천 판단에 추가 위험 요소로 반영됩니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private String artistPopularity(List<EventResponseDto> events, LocalDateTime now, boolean eventSoon) {
        int hour = now.getHour();
        if (eventSoon && isPeakTime(hour)) {
            return "HIGH";
        }
        boolean hasCurrentOrSoonEvent = events.stream()
                .filter(event -> event.startTime() != null)
                .anyMatch(event -> {
                    long minutes = Duration.between(now, event.startTime()).toMinutes();
                    return minutes >= -30 && minutes <= 60;
                });
        if (hasCurrentOrSoonEvent && isPeakTime(hour)) {
            return "MEDIUM";
        }
        return isPeakTime(hour) ? "MEDIUM" : "LOW";
    }
/**
 * [상세 주석] popularityScore 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int popularityScore(String popularity) {
        return switch (popularity) {
            case "HIGH" -> 3;
            case "MEDIUM" -> 2;
            default -> 1;
        };
    }
/**
 * [상세 주석] expectedStageCrowd 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 공연이 곧 시작되는지는 혼잡도 예측과 추천 판단에 추가 위험 요소로 반영됩니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int expectedStageCrowd(int hour, String artistPopularity, boolean eventSoon) {
        if (!isPeakTime(hour)) {
            return eventSoon ? 1100 : 450;
        }
        return switch (artistPopularity) {
            case "HIGH" -> 3800;
            case "MEDIUM" -> 2500;
            default -> 900;
        };
    }
/**
 * [상세 주석] minutesToNextEvent 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private int minutesToNextEvent(List<EventResponseDto> events, LocalDateTime now) {
        return events.stream()
                .map(EventResponseDto::startTime)
                .filter(startTime -> startTime != null && !startTime.isBefore(now.minusMinutes(5)))
                .mapToInt(startTime -> (int) Math.max(0, Duration.between(now, startTime).toMinutes()))
                .min()
                .orElse(180);
    }
/**
 * [상세 주석] normalize 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
/**
 * [상세 주석] signed 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String signed(int value) {
        return value >= 0 ? "+" + value : String.valueOf(value);
    }
/**
 * [상세 주석] distanceInMeters 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private double distanceInMeters(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }
/**
 * [상세 주석] displayPredictedLevel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String displayPredictedLevel(int score) {
        if (score >= 75) return "매우 혼잡";
        if (score >= 55) return "혼잡";
        if (score >= 30) return "보통";
        return "여유";
    }
/**
 * [상세 주석] modelLevelRank 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int modelLevelRank(String level) {
        String normalized = normalize(level);
        if (normalized.contains("low") || normalized.contains("여유")) return 0;
        if (normalized.contains("normal") || normalized.contains("보통")) return 1;
        if (normalized.contains("very_busy") || normalized.contains("매우")) return 3;
        if (normalized.contains("busy") || normalized.contains("혼잡")) return 2;
        return 4;
    }
/**
 * [상세 주석] riskLevel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String riskLevel(int score) {
        if (score >= 75) return "RISK";
        if (score >= 55) return "BUSY";
        if (score >= 30) return "NORMAL";
        return "LOW";
    }
/**
 * [상세 주석] predictedLevel 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String predictedLevel(int score) {
        if (score >= 75) return "매우 혼잡";
        if (score >= 55) return "혼잡";
        if (score >= 30) return "보통";
        return "여유";
    }
/**
 * [상세 주석] levelRank 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int levelRank(String level) {
        return switch (level) {
            case "여유" -> 0;
            case "보통" -> 1;
            case "혼잡" -> 2;
            case "매우 혼잡" -> 3;
            default -> 4;
        };
    }
/**
 * [상세 주석] value 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int value(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }
/**
 * [상세 주석] TemporalFeatures 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record TemporalFeatures(
            int gpsDelta5m,
            int gpsDelta15m,
            int reservationDelta15m,
            int checkedInDelta15m,
            int waitDelta15m
    ) {
    }
}
