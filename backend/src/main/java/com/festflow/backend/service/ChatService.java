package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.AiBoothRecommendationDto;
import com.festflow.backend.dto.AiFestivalGuideDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.ChatEvidenceDto;
import com.festflow.backend.dto.ChatResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.NoticeResponseDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
/**
 * [서비스 상세 주석] 축제 안내 챗봇 답변을 생성합니다.
 * 이 클래스의 핵심은 AI API가 가능하면 모델 답변을 만들고, 실패하거나 설정이 없으면 fallback 답변으로 서비스 중단을 막습니다.
 * 주요 관심사는 AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class ChatService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final String OPENAI_RESPONSES_PATH = "/v1/responses";
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int MAX_EVIDENCE = 5;
    private static final int CHAT_MAX_OUTPUT_TOKENS = 320;
    private static final List<KnowledgeChunk> STATIC_KNOWLEDGE = List.of(
            new KnowledgeChunk(1L, "예약 안내", "예약 가능한 부스는 부스 상세 화면에서 예약 상태와 테이블 현황을 먼저 확인한 뒤 예약해야 합니다. 예약이 꺼진 부스는 현장 이용 방식입니다.", "faq", null),
            new KnowledgeChunk(2L, "혼잡도 안내", "혼잡도는 주변 GPS 및 운영 데이터 기반 참고값입니다. 안전 이동이 필요하면 여유 또는 보통 단계의 부스를 우선 추천합니다.", "faq", null),
            new KnowledgeChunk(3L, "분실물 안내", "분실물을 찾을 때는 물품 종류, 색상, 특징, 잃어버린 위치와 시간을 함께 알려주면 등록된 분실물과 더 잘 대조할 수 있습니다.", "faq", null),
            new KnowledgeChunk(4L, "공연 안내", "공연 추천은 현재 시간, 공연 시작/종료 시간, 진행 상태를 기준으로 안내합니다. 지연 또는 취소 공지가 있으면 공지를 우선 확인해야 합니다.", "faq", null),
            new KnowledgeChunk(5L, "응급 안내", "응급 상황이나 몸이 좋지 않은 경우 응급 부스 또는 종합 안내 데스크로 이동하고, 심각한 상황은 현장 스태프에게 즉시 알려야 합니다.", "safety", null)
    );
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final LostItemService lostItemService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final NoticeService noticeService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final AiCongestionService aiCongestionService;
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

    public ChatService(
            BoothService boothService,
            EventService eventService,
            LostItemService lostItemService,
            NoticeService noticeService,
            AiCongestionService aiCongestionService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-5-mini}") String model
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.lostItemService = lostItemService;
        this.noticeService = noticeService;
        this.aiCongestionService = aiCongestionService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.model = model;
    }
/**
 * [상세 주석] answer 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ChatResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 HTTP API를 호출하고 응답 JSON을 파싱합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public ChatResponseDto answer(String question) {
        RetrievalResult retrieval = retrieveEvidence(question);
        String confidence = resolveConfidence(retrieval);

        if (apiKey == null || apiKey.isBlank()) {
            List<String> warnings = new ArrayList<>(retrieval.warnings());
            warnings.add("AI API 키가 설정되지 않아 기본 안내로 응답했습니다.");
            return new ChatResponseDto(buildFallbackAnswer(question, retrieval), confidence, retrieval.evidence(), warnings);
        }

        try {
            Map<String, Object> request = Map.of(
                    "model", model,
                    "instructions", buildInstructions(),
                    "input", buildInput(question, retrieval),
                    "max_output_tokens", CHAT_MAX_OUTPUT_TOKENS,
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

            String answer = extractAnswer(response);
            if (answer == null || answer.isBlank()) {
                List<String> warnings = new ArrayList<>(retrieval.warnings());
                warnings.add("AI 응답을 해석하지 못해 기본 안내를 표시했습니다.");
                return new ChatResponseDto(buildFallbackAnswer(question, retrieval), confidence, retrieval.evidence(), warnings);
            }
            return new ChatResponseDto(answer.trim(), confidence, retrieval.evidence(), retrieval.warnings());
        } catch (RestClientException ex) {
            List<String> warnings = new ArrayList<>(retrieval.warnings());
            warnings.add("AI 연결에 실패해 근거 기반 기본 안내를 표시했습니다.");
            return new ChatResponseDto(buildFallbackAnswer(question, retrieval), confidence, retrieval.evidence(), warnings);
        } catch (Exception ex) {
            List<String> warnings = new ArrayList<>(retrieval.warnings());
            warnings.add("AI 답변 생성 중 오류가 발생해 기본 안내를 표시했습니다.");
            return new ChatResponseDto(buildFallbackAnswer(question, retrieval), confidence, retrieval.evidence(), warnings);
        }
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
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(8));
        return factory;
    }
/**
 * [상세 주석] retrieveEvidence 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: RetrievalResult 타입 값을 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private RetrievalResult retrieveEvidence(String question) {
        List<EvidenceCandidate> candidates = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        String normalizedQuestion = normalize(question);
        Set<String> terms = terms(normalizedQuestion);
        LocalDateTime now = LocalDateTime.now();
        boolean wantsLostItems = wantsLostItems(normalizedQuestion);
        boolean wantsEvents = wantsEvents(normalizedQuestion);
        boolean wantsBooths = wantsBooths(normalizedQuestion) || (!wantsLostItems && !wantsEvents);
        boolean wantsCongestion = wantsCongestion(normalizedQuestion);
        boolean wantsKnowledge = wantsKnowledge(normalizedQuestion);

        if (wantsBooths) {
            List<BoothResponseDto> booths = boothService.getAllBooths();
            Map<Long, CongestionResponseDto> congestionByBoothId = wantsCongestion ? safeCongestionByBoothId() : Map.of();
            for (BoothResponseDto booth : booths) {
                CongestionResponseDto congestion = congestionByBoothId.get(booth.id());
                int score = scoreBooth(booth, congestion, normalizedQuestion, terms);
                if (score <= 0) {
                    continue;
                }

                if (booth.liveStatusUpdatedAt() != null && Duration.between(booth.liveStatusUpdatedAt(), now).toMinutes() > 15) {
                    warnings.add(booth.name() + " 운영 상태는 15분 이상 지난 정보일 수 있습니다.");
                }

                candidates.add(new EvidenceCandidate(
                        score,
                        new ChatEvidenceDto(
                                "booth",
                                booth.id(),
                                booth.name(),
                                boothReason(booth, congestion),
                                stringify(booth.liveStatusUpdatedAt())
                        )
                ));
            }
        }

        if (wantsEvents) {
            List<EventResponseDto> events = eventService.getAllEvents();
            for (EventResponseDto event : events) {
                int score = scoreEvent(event, normalizedQuestion, terms, now);
                if (score <= 0) {
                    continue;
                }
                candidates.add(new EvidenceCandidate(
                        score,
                        new ChatEvidenceDto(
                                "event",
                                event.id(),
                                event.title(),
                                eventReason(event, now),
                                stringify(event.statusUpdatedAt())
                        )
                ));
            }
        }

        if (wantsLostItems) {
            List<LostItemResponseDto> lostItems = lostItemService.getAll(true);
            for (LostItemResponseDto item : lostItems) {
                int score = scoreLostItem(item, normalizedQuestion, terms);
                if (score <= 0) {
                    continue;
                }
                candidates.add(new EvidenceCandidate(
                        score,
                        new ChatEvidenceDto(
                                "lost_item",
                                item.id(),
                                item.title(),
                                lostItemReason(item),
                                stringify(item.updatedAt() != null ? item.updatedAt() : item.createdAt())
                        )
                ));
            }
        }

        if (wantsCongestion || wantsBooths) {
            addAiRecommendationEvidence(candidates);
        }

        if (wantsKnowledge || candidates.isEmpty()) {
            addNoticeEvidence(candidates, normalizedQuestion, terms);
            addStaticKnowledgeEvidence(candidates, normalizedQuestion, terms);
        }

        List<ChatEvidenceDto> evidence = candidates.stream()
                .sorted(Comparator.comparingInt(EvidenceCandidate::score).reversed())
                .map(EvidenceCandidate::evidence)
                .filter(distinctEvidence())
                .limit(MAX_EVIDENCE)
                .toList();

        if (evidence.isEmpty()) {
            warnings.add("질문과 직접 연결되는 축제 데이터 근거를 찾지 못했습니다.");
        }

        return new RetrievalResult(evidence, warnings);
    }
/**
 * [상세 주석] addAiRecommendationEvidence 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private void addAiRecommendationEvidence(List<EvidenceCandidate> candidates) {
        try {
            AiFestivalGuideDto guide = aiCongestionService.guide();
            guide.recommendedNow().stream()
                    .limit(3)
                    .forEach(item -> candidates.add(new EvidenceCandidate(
                            8,
                            new ChatEvidenceDto(
                                    "ai_recommendation",
                                    item.boothId(),
                                    item.boothName(),
                                    aiRecommendationReason(item, false),
                                    null
                            )
                    )));
            guide.avoidNow().stream()
                    .limit(2)
                    .forEach(item -> candidates.add(new EvidenceCandidate(
                            6,
                            new ChatEvidenceDto(
                                    "ai_warning",
                                    item.boothId(),
                                    item.boothName(),
                                    aiRecommendationReason(item, true),
                                    null
                            )
                    )));
        } catch (Exception ex) {
            // AI guide evidence is optional; the chatbot can still answer from raw festival data.
        }
    }
/**
 * [상세 주석] aiRecommendationReason 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * - 예약 가능 좌석이 없거나 적으면 혼잡 위험이 높다고 판단하는 근거가 됩니다.
 * - 대기시간은 방문 추천과 혼잡 위험 점수 계산에 직접 영향을 줍니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String aiRecommendationReason(AiBoothRecommendationDto item, boolean avoid) {
        List<String> parts = new ArrayList<>();
        if (avoid) {
            parts.add("지금은 잠시 피하는 편이 좋습니다");
        } else {
            parts.add("지금 방문하기 좋은 후보입니다");
        }
        parts.add("주변 감지 인원 " + Math.max(0, item.currentCrowdCount()) + "명");
        if (item.waitMinutes() != null) {
            parts.add("예상 대기 " + Math.max(0, item.waitMinutes()) + "분");
        }
        if (item.availableSeats() != null) {
            parts.add(item.availableSeats() > 0
                    ? "예약 가능 좌석 " + item.availableSeats() + "석"
                    : "예약 가능 좌석 없음");
        }
        if (item.remainingStock() != null) {
            parts.add(item.remainingStock() > 10
                    ? "재고 여유"
                    : "재고가 적어질 수 있음");
        }
        return String.join(", ", parts);
    }
/**
 * [상세 주석] wantsBooths 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean wantsBooths(String question) {
        return containsAny(question, "부스", "booth", "먹", "음식", "메뉴", "추천", "대기", "재고", "예약", "주점", "포토", "체험", "굿즈", "상품", "식사");
    }
/**
 * [상세 주석] wantsEvents 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean wantsEvents(String question) {
        return containsAny(question, "공연", "이벤트", "일정", "무대", "시작", "라인업", "event");
    }
/**
 * [상세 주석] wantsLostItems 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean wantsLostItems(String question) {
        return containsAny(question, "분실", "잃어", "잃어버", "찾", "지갑", "가방", "핸드폰", "휴대폰", "lost", "물건");
    }
/**
 * [상세 주석] wantsCongestion 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean wantsCongestion(String question) {
        return containsAny(question, "혼잡", "붐비", "사람", "여유", "한산", "지금 추천", "지금 기준");
    }
/**
 * [상세 주석] wantsKnowledge 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean wantsKnowledge(String question) {
        return containsAny(
                question,
                "공지", "안내", "방법", "어떻게", "규칙", "주의", "안전", "응급", "우천", "비", "예약", "분실", "도움", "faq"
        );
    }
/**
 * [상세 주석] addNoticeEvidence 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void addNoticeEvidence(List<EvidenceCandidate> candidates, String question, Set<String> terms) {
        try {
            for (NoticeResponseDto notice : noticeService.getActiveNotices()) {
                int score = scoreText(terms, notice.title(), notice.content(), notice.category());
                if (containsAny(question, "공지", "안내", "우천", "비", "긴급", "분실")) {
                    score += 2;
                }
                if (score <= 0) {
                    continue;
                }

                candidates.add(new EvidenceCandidate(
                        score,
                        new ChatEvidenceDto(
                                "notice",
                                notice.id(),
                                notice.title(),
                                noticeReason(notice),
                                stringify(notice.updatedAt() != null ? notice.updatedAt() : notice.createdAt())
                        )
                ));
            }
        } catch (Exception ex) {
            // 공지 검색 실패는 다른 근거 검색에 영향을 주지 않는다.
        }
    }
/**
 * [상세 주석] addStaticKnowledgeEvidence 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void addStaticKnowledgeEvidence(List<EvidenceCandidate> candidates, String question, Set<String> terms) {
        for (KnowledgeChunk chunk : STATIC_KNOWLEDGE) {
            int score = scoreText(terms, chunk.title(), chunk.content(), chunk.category());
            if (chunkMatchesIntent(question, chunk)) {
                score += 3;
            }
            if (score <= 0) {
                continue;
            }

            candidates.add(new EvidenceCandidate(
                    score,
                    new ChatEvidenceDto(
                            "knowledge",
                            chunk.id(),
                            chunk.title(),
                            chunk.content(),
                            stringify(chunk.updatedAt())
                    )
            ));
        }
    }
/**
 * [상세 주석] chunkMatchesIntent 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean chunkMatchesIntent(String question, KnowledgeChunk chunk) {
        return switch (chunk.title()) {
            case "예약 안내" -> containsAny(question, "예약", "테이블", "자리");
            case "혼잡도 안내" -> containsAny(question, "혼잡", "붐비", "사람", "여유", "한산");
            case "분실물 안내" -> containsAny(question, "분실", "잃어", "찾", "지갑", "가방", "핸드폰", "휴대폰");
            case "공연 안내" -> containsAny(question, "공연", "무대", "라인업", "시작", "일정");
            case "응급 안내" -> containsAny(question, "응급", "아파", "다쳤", "안전", "도움");
            default -> false;
        };
    }
/**
 * [상세 주석] safeCongestionByBoothId 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: Map<Long, CongestionResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private Map<Long, CongestionResponseDto> safeCongestionByBoothId() {
        try {
            return boothService.getAllCongestions().stream()
                    .collect(Collectors.toMap(CongestionResponseDto::boothId, Function.identity(), (a, b) -> a));
        } catch (Exception ex) {
            return new HashMap<>();
        }
    }
/**
 * [상세 주석] scoreBooth 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int scoreBooth(BoothResponseDto booth, CongestionResponseDto congestion, String question, Set<String> terms) {
        int score = scoreText(terms, booth.name(), booth.description(), booth.category(), booth.tags(), booth.contentJson(), booth.liveStatusMessage());
        if (containsAny(question, "부스", "booth", "먹", "음식", "메뉴", "추천", "대기", "재고", "예약")) {
            score += 2;
        }
        if (containsAny(question, "혼잡", "붐비", "사람", "여유", "한산") && congestion != null) {
            score += 2;
        }
        if (containsAny(question, "빨리", "대기", "줄") && booth.estimatedWaitMinutes() != null && booth.estimatedWaitMinutes() <= 10) {
            score += 3;
        }
        if (containsAny(question, "예약") && Boolean.TRUE.equals(booth.reservationEnabled())) {
            score += 3;
        }
        return score;
    }
/**
 * [상세 주석] scoreEvent 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int scoreEvent(EventResponseDto event, String question, Set<String> terms, LocalDateTime now) {
        int score = scoreText(terms, event.title(), event.status(), event.liveMessage());
        if (containsAny(question, "공연", "이벤트", "일정", "무대", "시작", "event")) {
            score += 4;
        }
        if (event.startTime() != null && event.endTime() != null && !event.endTime().isBefore(now)) {
            score += 2;
        }
        if (containsAny(question, "곧", "다음", "지금") && event.startTime() != null && !event.startTime().isBefore(now.minusMinutes(5))) {
            score += 3;
        }
        return score;
    }
/**
 * [상세 주석] scoreLostItem 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int scoreLostItem(LostItemResponseDto item, String question, Set<String> terms) {
        int score = scoreText(terms, item.title(), item.description(), item.category(), item.foundLocation(), item.statusLabel());
        if (containsAny(question, "분실", "잃어", "잃어버", "찾", "지갑", "가방", "핸드폰", "휴대폰", "lost")) {
            score += 4;
        }
        return score;
    }
/**
 * [상세 주석] scoreText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
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
    private int scoreText(Set<String> terms, String... values) {
        String target = normalize(String.join(" ", valuesOrEmpty(values)));
        int score = 0;
        for (String term : terms) {
            if (term.length() >= 2 && target.contains(term)) {
                score += 2;
            }
        }
        return score;
    }
/**
 * [상세 주석] boothReason 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String boothReason(BoothResponseDto booth, CongestionResponseDto congestion) {
        List<String> parts = new ArrayList<>();
        parts.add("카테고리 " + valueOrUnknown(booth.category()));
        if (booth.estimatedWaitMinutes() != null) {
            parts.add("대기 " + booth.estimatedWaitMinutes() + "분");
        }
        if (booth.remainingStock() != null) {
            parts.add("재고 " + booth.remainingStock());
        }
        if (congestion != null) {
            parts.add("혼잡도 " + congestion.level() + " (" + congestion.nearbyUserCount() + "명)");
        }
        if (booth.liveStatusMessage() != null && !booth.liveStatusMessage().isBlank()) {
            parts.add("상태: " + booth.liveStatusMessage());
        }
        return String.join(", ", parts);
    }
/**
 * [상세 주석] eventReason 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String eventReason(EventResponseDto event, LocalDateTime now) {
        List<String> parts = new ArrayList<>();
        parts.add(event.startTime() + " - " + event.endTime());
        parts.add("상태 " + valueOrUnknown(event.status()));
        if (event.startTime() != null && event.startTime().isAfter(now)) {
            parts.add("시작까지 약 " + Duration.between(now, event.startTime()).toMinutes() + "분");
        }
        if (event.liveMessage() != null && !event.liveMessage().isBlank()) {
            parts.add("안내: " + event.liveMessage());
        }
        return String.join(", ", parts);
    }
/**
 * [상세 주석] lostItemReason 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String lostItemReason(LostItemResponseDto item) {
        List<String> parts = new ArrayList<>();
        parts.add("카테고리 " + valueOrUnknown(item.category()));
        parts.add("발견 위치 " + valueOrUnknown(item.foundLocation()));
        parts.add("상태 " + valueOrUnknown(item.statusLabel()));
        if (item.description() != null && !item.description().isBlank()) {
            parts.add("설명: " + item.description());
        }
        return String.join(", ", parts);
    }
/**
 * [상세 주석] noticeReason 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String noticeReason(NoticeResponseDto notice) {
        List<String> parts = new ArrayList<>();
        parts.add("공지 분류 " + valueOrUnknown(notice.category()));
        if (notice.content() != null && !notice.content().isBlank()) {
            parts.add(notice.content());
        }
        return String.join(", ", parts);
    }
/**
 * [상세 주석] resolveConfidence 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String resolveConfidence(RetrievalResult retrieval) {
        if (retrieval.evidence().size() >= 3 && retrieval.warnings().isEmpty()) {
            return "HIGH";
        }
        if (!retrieval.evidence().isEmpty()) {
            return "MEDIUM";
        }
        return "LOW";
    }
/**
 * [상세 주석] buildFallbackAnswer 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 응답 문구나 요청 payload처럼 다음 단계에서 쓸 데이터를 조립하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String buildFallbackAnswer(String question, RetrievalResult retrieval) {
        if (retrieval.evidence().isEmpty()) {
            return "지금 질문과 바로 연결되는 축제 데이터를 찾지 못했어요. 부스, 공연, 대기 시간, 예약 가능 여부처럼 구체적으로 다시 물어봐 주세요.";
        }
        ChatEvidenceDto top = retrieval.evidence().get(0);
        return switch (top.type()) {
            case "booth" -> top.label() + "부터 확인해 보세요. " + top.reason() + "라서 지금 움직이기 좋습니다.";
            case "event" -> top.label() + " 일정을 먼저 확인해 보세요. " + top.reason();
            case "lost_item" -> top.label() + " 항목이 질문과 가장 가까워 보여요. " + top.reason();
            default -> top.label() + " 정보가 가장 관련 있어요. " + top.reason();
        };
    }
/**
 * [상세 주석] buildInstructions 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 응답 문구나 요청 payload처럼 다음 단계에서 쓸 데이터를 조립하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - riskScore는 여러 지표를 합산한 위험 점수이며, 구간에 따라 LOW/NORMAL/BUSY/RISK 같은 판단으로 바뀝니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
private String buildInstructions() {
        return """
                You are Fest-A's production festival AI assistant.
                Answer in Korean unless the user asks in another language.
                You must ground concrete claims only in the Evidence list.
                Do not invent booth names, event times, stock, wait times, congestion levels, reservations, locations, or lost items.
                If evidence is weak or missing, say what is unknown and suggest a safe next step.
                Do not expose private contact details.
                Use short action-first answers.
                Prefer this structure: 추천/답변, 이유, 다음 행동.
                Keep the answer under 5 Korean lines when possible.
                Do not mention internal scores or labels such as riskScore, LOW, MEDIUM, HIGH, RISK, or BUSY.
                Explain with visitor-facing facts: nearby people, wait time, available seats, stock, event timing, and whether it is easy to visit now.
                Answer in this order: recommendation, reason, next action.
                """;
    }
/**
 * [상세 주석] buildInput 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 응답 문구나 요청 payload처럼 다음 단계에서 쓸 데이터를 조립하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String buildInput(String question, RetrievalResult retrieval) throws Exception {
        return """
                Current server time: %s
                Confidence from server retrieval: %s
                Warnings: %s
                Evidence JSON:
                %s

                User question:
                %s
                """.formatted(
                LocalDateTime.now(),
                resolveConfidence(retrieval),
                objectMapper.writeValueAsString(retrieval.warnings()),
                objectMapper.writeValueAsString(retrieval.evidence()),
                question
        );
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
        if (response == null || response.isBlank()) {
            return null;
        }

        JsonNode root = objectMapper.readTree(response);
        return firstNonBlank(
                extractResponseText(root.path("output_text")),
                extractResponseText(root.path("output")),
                extractResponseText(root.path("content")),
                extractResponseText(root.path("message"))
        );
    }
/**
 * [상세 주석] extractResponseText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extractResponseText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }

        if (node.isTextual()) {
            return node.asText();
        }

        if (node.isArray()) {
            for (JsonNode item : node) {
                String text = extractResponseText(item);
                if (text != null && !text.isBlank()) {
                    return text;
                }
            }
            return null;
        }

        if (!node.isObject()) {
            return null;
        }

        String type = node.path("type").asText("");
        if (("output_text".equals(type) || "text".equals(type) || "message".equals(type))
                && node.path("text").isTextual()) {
            return node.path("text").asText();
        }

        JsonNode text = node.path("text");
        if (text.isObject() && text.path("value").isTextual()) {
            return text.path("value").asText();
        }

        return firstNonBlank(
                extractResponseText(node.path("output_text")),
                extractResponseText(node.path("content")),
                extractResponseText(node.path("message")),
                extractResponseText(node.path("output")),
                extractResponseText(text)
        );
    }
/**
 * [상세 주석] firstNonBlank 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
/**
 * [상세 주석] containsAny 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
/**
 * [상세 주석] terms 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Set<String> 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Set<String> terms(String normalizedQuestion) {
        String[] rawTerms = normalizedQuestion.split("[^\\p{IsAlphabetic}\\p{IsDigit}가-힣]+");
        Set<String> result = new LinkedHashSet<>();
        for (String term : rawTerms) {
            if (term != null && term.length() >= 2) {
                result.add(term);
            }
        }
        return result;
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
        return value == null ? "" : value.toLowerCase().trim();
    }
/**
 * [상세 주석] valuesOrEmpty 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<String> valuesOrEmpty(String... values) {
        List<String> result = new ArrayList<>();
        for (String value : values) {
            if (value != null) {
                result.add(value);
            }
        }
        return result;
    }
/**
 * [상세 주석] distinctEvidence 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: java.util.function.Predicate<ChatEvidenceDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private java.util.function.Predicate<ChatEvidenceDto> distinctEvidence() {
        Set<String> seen = new LinkedHashSet<>();
        return evidence -> seen.add(evidence.type() + ":" + evidence.id());
    }
/**
 * [상세 주석] valueOrUnknown 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String valueOrUnknown(Object value) {
        if (value == null) {
            return "미등록";
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? "미등록" : text;
    }
/**
 * [상세 주석] stringify 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String stringify(LocalDateTime value) {
        return value == null ? null : value.toString();
    }
/**
 * [상세 주석] EvidenceCandidate 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record EvidenceCandidate(int score, ChatEvidenceDto evidence) {
    }
/**
 * [상세 주석] RetrievalResult 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record RetrievalResult(List<ChatEvidenceDto> evidence, List<String> warnings) {
    }
/**
 * [상세 주석] KnowledgeChunk 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record KnowledgeChunk(Long id, String title, String content, String category, LocalDateTime updatedAt) {
    }
}
