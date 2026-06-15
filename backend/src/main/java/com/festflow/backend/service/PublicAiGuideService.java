package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.AiBoothRecommendationDto;
import com.festflow.backend.dto.AiFestivalGuideDto;
import com.festflow.backend.dto.AiVisitorActionDto;
import com.festflow.backend.dto.AiVisitorGuideDto;
import com.festflow.backend.dto.AnalyticsDashboardDto;
import com.festflow.backend.dto.AnalyticsZoneCrowdDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.service.analytics.AnalyticsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
/**
 * [서비스 상세 주석] 방문자용 페이지별 AI 가이드를 제공합니다.
 * 이 클래스의 핵심은 scope에 따라 분석, 공연, 지도 등 화면별로 다른 안내를 생성합니다.
 * 주요 관심사는 AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class PublicAiGuideService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final String OPENAI_RESPONSES_PATH = "/v1/responses";
    private static final int VISITOR_GUIDE_MAX_OUTPUT_TOKENS = 520;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final AnalyticsService analyticsService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final AiCongestionService aiCongestionService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final BoothService boothService;
// [의존성 주석] Java 객체와 JSON 문자열을 서로 바꾸는 도구입니다. Python 모델/외부 API 입출력에서 자주 사용됩니다.
private final ObjectMapper objectMapper;
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
private final RestClient restClient;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String apiKey;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final String model;
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

    public PublicAiGuideService(
            AnalyticsService analyticsService,
            AiCongestionService aiCongestionService,
            EventService eventService,
            BoothService boothService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-5-mini}") String model
    ) {
        this.analyticsService = analyticsService;
        this.aiCongestionService = aiCongestionService;
        this.eventService = eventService;
        this.boothService = boothService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.model = model;
    }
/**
 * [상세 주석] guide 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 현재 축제 데이터를 바탕으로 방문자에게 보여줄 AI 가이드 전체를 만드는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiVisitorGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public AiVisitorGuideDto guide(String scope) {
        String normalizedScope = normalizeScope(scope);
        AiVisitorGuideDto fallback = switch (normalizedScope) {
            case "events" -> fallbackEvents();
            case "stage-map" -> fallbackStageMap();
            default -> fallbackAnalytics();
        };

        if (apiKey == null || apiKey.isBlank()) {
            return fallback;
        }

        String context = switch (normalizedScope) {
            case "events" -> eventsContext();
            case "stage-map" -> stageMapContext();
            default -> analyticsContext();
        };

        try {
            String response = generateText(normalizedScope, fallback.title(), context);
            return parseGuide(normalizedScope, fallback.title(), response, fallback);
        } catch (Exception ex) {
            return fallback;
        }
    }
/**
 * [상세 주석] fallbackAnalytics 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiVisitorGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private AiVisitorGuideDto fallbackAnalytics() {
        AiFestivalGuideDto guide = safeCongestionGuide();
        List<AiBoothRecommendationDto> predictions = safePredictions();
        AiBoothRecommendationDto avoid = firstOrNull(guide.avoidNow());
        AiBoothRecommendationDto good = firstOrNull(guide.recommendedNow());
        AiBoothRecommendationDto later = firstOrNull(predictions);

        List<String> bullets = new ArrayList<>();
        bullets.add(guide.headline());
        bullets.add(guide.summary());
        if (later != null) {
            bullets.add(later.boothName() + "은 30분 뒤 " + later.predictedLevel() + " 상태가 예상돼요.");
        }

        return new AiVisitorGuideDto(
                "analytics",
                "AI 혼잡도 가이드",
                "현재 혼잡도 데이터를 바탕으로 움직이기 좋은 동선을 정리했어요.",
                bullets,
                List.of(
                        action("지금 피할 곳", avoid == null ? "혼잡 구역 없음" : avoid.boothName(), avoid == null ? "즉시 피해야 할 구역은 아직 없어요." : "혼잡 위험이 높아 잠시 후 방문을 추천해요.", "danger"),
                        action("지금 가기 좋은 곳", good == null ? "가까운 여유 부스" : good.boothName(), good == null ? "대기 시간이 짧은 부스를 우선 확인해보세요." : "지금 방문 부담이 낮은 곳이에요.", "good"),
                        action("30분 뒤 주의", later == null ? "공연 주변" : later.boothName(), later == null ? "공연 시작 전후에는 무대 주변 이동을 여유 있게 잡아주세요." : "조금 뒤 더 붐빌 수 있어요.", "wait")
                ),
                guide.userActions().stream().limit(3).toList(),
                false
        );
    }
/**
 * [상세 주석] fallbackEvents 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiVisitorGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private AiVisitorGuideDto fallbackEvents() {
        List<EventResponseDto> events = sortedEvents();
        LocalDateTime now = LocalDateTime.now();
        List<EventResponseDto> upcoming = events.stream()
                .filter(event -> event.startTime() != null && !event.startTime().isBefore(now.minusMinutes(10)))
                .limit(3)
                .toList();
        EventResponseDto recommended = firstOrNull(upcoming);

        return new AiVisitorGuideDto(
                "events",
                "AI 공연 가이드",
                recommended == null
                        ? "오늘 공연 데이터를 확인해서 보기 좋은 순서로 정리했어요."
                        : recommended.title() + " 공연은 지금 확인하기 좋은 일정이에요.",
                List.of(
                        upcoming.isEmpty() ? "곧 시작하는 공연이 아직 없습니다." : "곧 시작하는 공연이 " + upcoming.size() + "개 있어요.",
                        "인기 공연은 시작 20분 전 이동을 추천해요.",
                        "여유롭게 보고 싶다면 보조무대와 버스킹 일정도 확인해보세요."
                ),
                List.of(
                        action("AI 추천 공연", recommended == null ? "전체 라인업" : recommended.title(), recommended == null ? "시간표 전체에서 원하는 공연을 골라보세요." : timeText(recommended) + " 시작 전에 이동하기 좋아요.", "good"),
                        action("곧 시작", upcoming.size() > 1 ? upcoming.get(1).title() : "다음 공연", upcoming.size() > 1 ? timeText(upcoming.get(1)) + " 일정이에요." : "다음 공연 시간을 확인해보세요.", "wait"),
                        action("혼잡 예상", "메인 스테이지", "인기 공연 시간대에는 미리 이동하는 편이 좋아요.", "danger")
                ),
                List.of("공연 시간", "현재 시각", "무대 이동 부담을 함께 봤어요."),
                false
        );
    }
/**
 * [상세 주석] fallbackStageMap 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiVisitorGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private AiVisitorGuideDto fallbackStageMap() {
        List<BoothResponseDto> booths = boothService.getAllBooths();
        List<BoothResponseDto> sorted = booths.stream()
                .sorted(Comparator.comparingInt((BoothResponseDto booth) -> value(booth.estimatedWaitMinutes())))
                .toList();
        BoothResponseDto good = firstOrNull(sorted);
        BoothResponseDto busy = booths.stream()
                .max(Comparator.comparingInt(booth -> value(booth.estimatedWaitMinutes())))
                .orElse(null);

        return new AiVisitorGuideDto(
                "stage-map",
                "AI 주변 부스 추천",
                "가까운 부스 중 대기 시간이 짧은 곳을 먼저 추천해드려요.",
                List.of(
                        good == null ? "지금 추천할 부스 데이터를 기다리고 있어요." : good.name() + "은 지금 비교적 가기 좋아요.",
                        busy == null ? "혼잡한 부스 정보가 아직 없어요." : busy.name() + "은 대기가 길어질 수 있어요.",
                        "대기 시간이 긴 곳은 나중에 다시 확인해보세요."
                ),
                List.of(
                        action("지금 가기 좋은 부스", good == null ? "여유 부스" : good.name(), good == null ? "대기 시간이 짧은 부스를 먼저 확인해보세요." : "대기 " + value(good.estimatedWaitMinutes()) + "분 기준이에요.", "good"),
                        action("잠시 피할 부스", busy == null ? "혼잡 부스 없음" : busy.name(), busy == null ? "현재 강한 혼잡 신호는 없어요." : "대기 " + value(busy.estimatedWaitMinutes()) + "분이라 나중에 가는 편이 좋아요.", "danger")
                ),
                List.of("대기 시간", "부스 운영 상태", "사용자 이동 흐름을 함께 참고했어요."),
                false
        );
    }
/**
 * [상세 주석] analyticsContext 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 대기시간은 방문 추천과 혼잡 위험 점수 계산에 직접 영향을 줍니다.
 * - riskScore는 여러 지표를 합산한 위험 점수이며, 구간에 따라 LOW/NORMAL/BUSY/RISK 같은 판단으로 바뀝니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private String analyticsContext() {
        AnalyticsDashboardDto dashboard = analyticsService.dashboard(15);
        List<AiBoothRecommendationDto> predictions = safePredictions().stream().limit(8).toList();
        return "페이지: AI 혼잡도 예측\n"
                + "전체 혼잡도: " + dashboard.overview().percent() + "% / " + dashboard.overview().level()
                + " / 변화 " + dashboard.overview().deltaPercent() + "%\n"
                + "구역별 혼잡도: " + dashboard.zones().stream()
                .sorted(Comparator.comparingInt(AnalyticsZoneCrowdDto::percent).reversed())
                .limit(8)
                .map(zone -> zone.zoneName() + "=" + zone.percent() + "%/" + zone.level() + "/변화" + zone.deltaPercent())
                .toList()
                + "\n30분 예측 후보: " + predictions.stream()
                .map(item -> item.boothName() + "=현재" + item.currentLevel() + ",예측" + item.predictedLevel() + ",위험" + item.riskScore() + ",대기" + item.waitMinutes())
                .toList();
    }
/**
 * [상세 주석] eventsContext 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private String eventsContext() {
        LocalDateTime now = LocalDateTime.now();
        return "페이지: AI 공연 가이드\n현재시각: " + now + "\n공연 목록: "
                + sortedEvents().stream()
                .limit(12)
                .map(event -> event.title() + "/" + timeText(event) + "/" + value(event.status()) + "/" + value(event.liveMessage()))
                .toList();
    }
/**
 * [상세 주석] stageMapContext 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private String stageMapContext() {
        return "페이지: AI 주변 부스 추천\n부스 목록: " + boothService.getAllBooths().stream()
                .sorted(Comparator.comparingInt((BoothResponseDto booth) -> value(booth.estimatedWaitMinutes())).reversed())
                .limit(12)
                .map(booth -> booth.name() + "/카테고리 " + value(booth.category()) + "/대기 " + value(booth.estimatedWaitMinutes()) + "분/재고 " + value(booth.remainingStock()) + "/좌석 " + value(booth.reservationAvailableSeats()))
                .toList();
    }
/**
 * [상세 주석] generateText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String generateText(String scope, String title, String context) throws Exception {
        Map<String, Object> request = Map.of(
                "model", model,
                "instructions",
                "You are Fest-A AI for festival visitors. Write in friendly Korean. "
                        + "Use only the supplied data. Return only valid JSON with this shape: "
                        + "{\"summary\":\"short sentence\",\"bullets\":[\"2-3 visitor-facing lines\"],"
                        + "\"actions\":[{\"title\":\"short label\",\"target\":\"place or event\",\"description\":\"actionable reason\",\"tone\":\"good|wait|danger|info\"}],"
                        + "\"reasons\":[\"why the AI recommends this\"]}. "
                        + "Focus on what the visitor should do in the next 30 minutes.",
                "input", "scope=" + scope + "\ntitle=" + title + "\n" + context,
                "max_output_tokens", VISITOR_GUIDE_MAX_OUTPUT_TOKENS,
                "reasoning", Map.of("effort", "minimal"),
                "text", Map.of("verbosity", "low")
        );
        String response = restClient.post()
                .uri(OPENAI_RESPONSES_PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBearerAuth(apiKey))
                .body(request)
                .retrieve()
                .body(String.class);
        return extractAnswer(response);
    }
/**
 * [상세 주석] parseGuide 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiVisitorGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private AiVisitorGuideDto parseGuide(String scope, String title, String generatedText, AiVisitorGuideDto fallback) throws Exception {
        if (generatedText == null || generatedText.isBlank()) {
            return fallback;
        }

        String text = cleanJson(generatedText);
        try {
            JsonNode root = objectMapper.readTree(text);
            List<AiVisitorActionDto> actions = new ArrayList<>();
            JsonNode actionNodes = root.path("actions");
            if (actionNodes.isArray()) {
                for (JsonNode node : actionNodes) {
                    actions.add(action(
                            node.path("title").asText("AI 추천"),
                            node.path("target").asText("추천 장소"),
                            node.path("description").asText("지금 확인해보세요."),
                            node.path("tone").asText("info")
                    ));
                }
            }
            return new AiVisitorGuideDto(
                    scope,
                    title,
                    root.path("summary").asText(fallback.summary()),
                    readStringList(root.path("bullets"), fallback.bullets()),
                    actions.isEmpty() ? fallback.actions() : actions.stream().limit(4).toList(),
                    readStringList(root.path("reasons"), fallback.reasons()),
                    true
            );
        } catch (Exception ex) {
            return new AiVisitorGuideDto(
                    scope,
                    title,
                    generatedText.trim(),
                    List.of(generatedText.trim()),
                    fallback.actions(),
                    fallback.reasons(),
                    true
            );
        }
    }
/**
 * [상세 주석] extractAnswer 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extractAnswer(String response) throws Exception {
        JsonNode root = objectMapper.readTree(response);
        JsonNode outputText = root.path("output_text");
        if (outputText.isTextual()) {
            return outputText.asText();
        }
        JsonNode output = root.path("output");
        if (output.isArray()) {
            for (JsonNode item : output) {
                JsonNode content = item.path("content");
                if (!content.isArray()) continue;
                for (JsonNode contentItem : content) {
                    if ("output_text".equals(contentItem.path("type").asText()) && contentItem.path("text").isTextual()) {
                        return contentItem.path("text").asText();
                    }
                }
            }
        }
        return null;
    }
/**
 * [상세 주석] requestFactory 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SimpleClientHttpRequestFactory 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(4));
        factory.setReadTimeout(Duration.ofSeconds(12));
        return factory;
    }
/**
 * [상세 주석] sortedEvents 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<EventResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private List<EventResponseDto> sortedEvents() {
        return eventService.getAllEvents().stream()
                .sorted(Comparator.comparing(
                        EventResponseDto::startTime,
                        Comparator.nullsLast(Comparator.naturalOrder())
                ))
                .toList();
    }
/**
 * [상세 주석] safeCongestionGuide 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiFestivalGuideDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiFestivalGuideDto safeCongestionGuide() {
        try {
            return aiCongestionService.guide();
        } catch (Exception ex) {
            return new AiFestivalGuideDto(
                    LocalDateTime.now(),
                    "AI가 축제 데이터를 확인하고 있어요.",
                    "데이터가 쌓이면 더 정확한 추천을 보여드릴게요.",
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of("가까운 부스의 대기 시간을 먼저 확인해보세요."),
                    List.of()
            );
        }
    }
/**
 * [상세 주석] safePredictions 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<AiBoothRecommendationDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<AiBoothRecommendationDto> safePredictions() {
        try {
            return aiCongestionService.analyzeCurrent();
        } catch (Exception ex) {
            return List.of();
        }
    }
/**
 * [상세 주석] readStringList 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private List<String> readStringList(JsonNode node, List<String> fallback) {
        if (!node.isArray()) {
            return fallback;
        }
        List<String> result = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual() && !item.asText().isBlank()) {
                result.add(item.asText());
            }
        }
        return result.isEmpty() ? fallback : result.stream().limit(4).toList();
    }
/**
 * [상세 주석] cleanJson 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String cleanJson(String value) {
        String text = value.trim();
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```(?:json)?", "").replaceFirst("```$", "").trim();
        }
        return text;
    }
/**
 * [상세 주석] normalizeScope 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeScope(String scope) {
        String value = scope == null ? "analytics" : scope.trim().toLowerCase(Locale.ROOT);
        if (value.equals("stage") || value.equals("map")) return "stage-map";
        if (value.equals("event")) return "events";
        if (value.equals("analytics") || value.equals("events") || value.equals("stage-map")) return value;
        return "analytics";
    }
/**
 * [상세 주석] action 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiVisitorActionDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiVisitorActionDto action(String title, String target, String description, String tone) {
        String safeTone = switch (tone == null ? "" : tone) {
            case "good", "wait", "danger", "info" -> tone;
            default -> "info";
        };
        return new AiVisitorActionDto(title, target, description, safeTone);
    }
/**
 * [상세 주석] timeText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String timeText(EventResponseDto event) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("HH:mm");
        String start = event.startTime() == null ? "시간 미정" : event.startTime().format(formatter);
        String end = event.endTime() == null ? "" : " - " + event.endTime().format(formatter);
        return start + end;
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
 * [상세 주석] value 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String value(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }
/**
 * [상세 주석] firstOrNull 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: <T> T 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private <T> T firstOrNull(List<T> values) {
        return values == null || values.isEmpty() ? null : values.get(0);
    }
}
