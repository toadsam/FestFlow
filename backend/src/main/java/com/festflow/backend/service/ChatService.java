package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.ChatEvidenceDto;
import com.festflow.backend.dto.ChatResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.LostItemResponseDto;
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

@Service
public class ChatService {

    private static final String OPENAI_RESPONSES_PATH = "/v1/responses";
    private static final int MAX_EVIDENCE = 8;

    private final BoothService boothService;
    private final EventService eventService;
    private final LostItemService lostItemService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public ChatService(
            BoothService boothService,
            EventService eventService,
            LostItemService lostItemService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-5-mini}") String model
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.lostItemService = lostItemService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.model = model;
    }

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
                    "max_output_tokens", 700
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

    private SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(20));
        return factory;
    }

    private RetrievalResult retrieveEvidence(String question) {
        List<EvidenceCandidate> candidates = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        String normalizedQuestion = normalize(question);
        Set<String> terms = terms(normalizedQuestion);
        LocalDateTime now = LocalDateTime.now();

        List<BoothResponseDto> booths = boothService.getAllBooths();
        Map<Long, CongestionResponseDto> congestionByBoothId = safeCongestionByBoothId();
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

    private Map<Long, CongestionResponseDto> safeCongestionByBoothId() {
        try {
            return boothService.getAllCongestions().stream()
                    .collect(Collectors.toMap(CongestionResponseDto::boothId, Function.identity(), (a, b) -> a));
        } catch (Exception ex) {
            return new HashMap<>();
        }
    }

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

    private int scoreLostItem(LostItemResponseDto item, String question, Set<String> terms) {
        int score = scoreText(terms, item.title(), item.description(), item.category(), item.foundLocation(), item.statusLabel());
        if (containsAny(question, "분실", "잃어", "잃어버", "찾", "지갑", "가방", "핸드폰", "휴대폰", "lost")) {
            score += 4;
        }
        return score;
    }

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

    private String resolveConfidence(RetrievalResult retrieval) {
        if (retrieval.evidence().size() >= 3 && retrieval.warnings().isEmpty()) {
            return "HIGH";
        }
        if (!retrieval.evidence().isEmpty()) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private String buildFallbackAnswer(String question, RetrievalResult retrieval) {
        if (retrieval.evidence().isEmpty()) {
            return "현재 질문과 직접 연결되는 축제 데이터를 찾지 못했어요. 부스, 공연, 혼잡도, 분실물처럼 앱에 등록된 정보로 다시 물어봐 주세요.";
        }
        ChatEvidenceDto top = retrieval.evidence().get(0);
        return switch (top.type()) {
            case "booth" -> top.label() + "를 먼저 확인해 보세요. 근거는 " + top.reason() + "입니다.";
            case "event" -> top.label() + " 일정이 가장 관련 있어 보여요. 근거는 " + top.reason() + "입니다.";
            case "lost_item" -> top.label() + " 분실물 항목이 질문과 가까워 보여요. 근거는 " + top.reason() + "입니다.";
            default -> "가장 관련 있는 근거는 " + top.label() + "입니다. " + top.reason();
        };
    }

    private String buildInstructions() {
        return """
                You are FestFlow's production festival AI assistant.
                Answer in Korean unless the user asks in another language.
                You must ground concrete claims only in the Evidence list.
                Do not invent booth names, event times, stock, wait times, congestion levels, reservations, locations, or lost items.
                If evidence is weak or missing, say what is unknown and suggest a safe next step.
                Do not expose private contact details.
                Use this answer structure when useful: 추천/답변, 근거, 주의, 다음 행동.
                Keep the answer concise and practical.
                """;
    }

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

    private String extractAnswer(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return null;
        }

        JsonNode root = objectMapper.readTree(response);
        JsonNode outputText = root.path("output_text");
        if (outputText.isTextual()) {
            return outputText.asText();
        }

        JsonNode output = root.path("output");
        if (output.isArray()) {
            for (JsonNode item : output) {
                JsonNode content = item.path("content");
                if (!content.isArray()) {
                    continue;
                }
                for (JsonNode contentItem : content) {
                    String type = contentItem.path("type").asText();
                    if ("output_text".equals(type) && contentItem.path("text").isTextual()) {
                        return contentItem.path("text").asText();
                    }
                }
            }
        }
        return null;
    }

    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

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

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase().trim();
    }

    private List<String> valuesOrEmpty(String... values) {
        List<String> result = new ArrayList<>();
        for (String value : values) {
            if (value != null) {
                result.add(value);
            }
        }
        return result;
    }

    private java.util.function.Predicate<ChatEvidenceDto> distinctEvidence() {
        Set<String> seen = new LinkedHashSet<>();
        return evidence -> seen.add(evidence.type() + ":" + evidence.id());
    }

    private String valueOrUnknown(Object value) {
        if (value == null) {
            return "미등록";
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? "미등록" : text;
    }

    private String stringify(LocalDateTime value) {
        return value == null ? null : value.toString();
    }

    private record EvidenceCandidate(int score, ChatEvidenceDto evidence) {
    }

    private record RetrievalResult(List<ChatEvidenceDto> evidence, List<String> warnings) {
    }
}
