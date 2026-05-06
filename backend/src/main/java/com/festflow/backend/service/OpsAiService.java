package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.AiAssistRequestDto;
import com.festflow.backend.dto.AiAssistResponseDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.StaffMemberResponseDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class OpsAiService {

    private static final String OPENAI_RESPONSES_PATH = "/v1/responses";

    private final BoothService boothService;
    private final EventService eventService;
    private final NoticeService noticeService;
    private final LostItemService lostItemService;
    private final StaffService staffService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public OpsAiService(
            BoothService boothService,
            EventService eventService,
            NoticeService noticeService,
            LostItemService lostItemService,
            StaffService staffService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-5-mini}") String model
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
        this.lostItemService = lostItemService;
        this.staffService = staffService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.model = model;
    }

    public AiAssistResponseDto masterBriefing() {
        OpsSnapshot snapshot = snapshot();
        List<String> highlights = masterHighlights(snapshot);
        List<String> actions = masterActions(snapshot);
        String fallback = String.join("\n", highlights);
        String summary = generateText(
                "운영 총괄용 현재 상황 브리핑을 한국어로 5줄 이하로 작성하세요. 위험도와 즉시 할 일을 먼저 말하세요.",
                snapshot.context("master briefing"),
                fallback
        );
        return new AiAssistResponseDto(
                "AI 운영 브리핑",
                summary,
                highlights,
                actions,
                null,
                null,
                null,
                confidence(highlights)
        );
    }

    public AiAssistResponseDto masterNoticeDraft(AiAssistRequestDto requestDto) {
        OpsSnapshot snapshot = snapshot();
        String type = safe(requestDto.type(), "안내");
        String prompt = safe(requestDto.prompt(), "");
        String fallbackTitle = noticeTitle(type, snapshot);
        String fallbackContent = noticeContent(type, snapshot);
        String generated = generateText(
                "축제 운영 공지 초안을 작성하세요. 반드시 '제목:'과 '내용:' 형식으로만 답하세요. 내용은 2문장 이하로 짧고 공손하게 작성하세요.",
                snapshot.context("notice draft") + "\n공지 유형: " + type + "\n추가 요청: " + prompt,
                "제목: " + fallbackTitle + "\n내용: " + fallbackContent
        );
        Draft draft = parseDraft(generated, fallbackTitle, fallbackContent);
        return new AiAssistResponseDto(
                "AI 공지 초안",
                "초안을 확인한 뒤 필요한 부분을 수정하고 등록하세요.",
                List.of("AI는 공지를 직접 발행하지 않습니다.", "관리자가 확인 후 등록해야 합니다."),
                List.of("문구 확인", "공지 입력칸에 반영", "활성 여부 확인 후 등록"),
                draft.title(),
                draft.content(),
                noticeCategory(type),
                "MEDIUM"
        );
    }

    public AiAssistResponseDto staffZoneSummary(String staffToken) {
        StaffMemberResponseDto me = staffService.authenticateByToken(staffToken);
        BoothResponseDto booth = assignedBooth(me);
        CongestionResponseDto congestion = booth != null ? safeCongestion(booth.id()) : null;
        List<NoticeResponseDto> notices = noticeService.getActiveNotices().stream().limit(3).toList();
        String context = staffContext(me, booth, congestion, notices);
        String summary = generateText(
                "스태프 본인에게 보여줄 담당 구역 요약을 한국어로 4줄 이하로 작성하세요. 바로 해야 할 행동을 포함하세요.",
                context,
                staffFallback(me, booth, congestion)
        );
        return new AiAssistResponseDto(
                "내 구역 AI 요약",
                summary,
                staffHighlights(me, booth, congestion, notices),
                staffActions(me, booth, congestion),
                null,
                null,
                null,
                booth != null ? "HIGH" : "MEDIUM"
        );
    }

    public AiAssistResponseDto staffLostItemAssist(String staffToken, AiAssistRequestDto requestDto) {
        staffService.authenticateByToken(staffToken);
        String prompt = safe(requestDto.prompt(), "");
        List<LostItemResponseDto> matches = lostItemMatches(prompt).stream().limit(5).toList();
        List<String> highlights = matches.stream()
                .map(item -> item.title() + " · " + item.category() + " · " + item.foundLocation() + " · " + item.statusLabel())
                .toList();
        String context = "방문객 설명: " + prompt + "\n후보:\n" + String.join("\n", highlights);
        String summary = generateText(
                "스태프가 방문객에게 안내할 분실물 응대 문구를 한국어로 짧게 작성하세요. 연락처는 말하지 말고 후보 확인 절차를 안내하세요.",
                context,
                highlights.isEmpty() ? "비슷한 분실물을 찾지 못했습니다. 색상, 물품 종류, 잃어버린 위치를 더 확인해 주세요." : "유사 후보가 있습니다. 분실물 센터에서 사진과 상세 설명을 확인해 주세요."
        );
        return new AiAssistResponseDto(
                "분실물 응대 AI",
                summary,
                highlights,
                List.of("물품 특징 추가 확인", "사진/상세 설명 대조", "소유자 확인 절차 진행"),
                null,
                null,
                null,
                matches.isEmpty() ? "LOW" : "HIGH"
        );
    }

    public AiAssistResponseDto staffReplyDraft(String staffToken, AiAssistRequestDto requestDto) {
        StaffMemberResponseDto me = staffService.authenticateByToken(staffToken);
        BoothResponseDto booth = assignedBooth(me);
        String prompt = safe(requestDto.prompt(), "");
        String summary = generateText(
                "스태프가 방문객에게 바로 말할 수 있는 짧고 친절한 한국어 응대 문구를 작성하세요. 모르는 내용은 확인 후 안내하겠다고 말하세요.",
                staffContext(me, booth, booth != null ? safeCongestion(booth.id()) : null, noticeService.getActiveNotices().stream().limit(3).toList())
                        + "\n방문객 질문/상황: " + prompt,
                "확인 후 바로 안내드리겠습니다. 가까운 스태프 또는 본부에서도 도움을 받으실 수 있습니다."
        );
        return new AiAssistResponseDto(
                "응대 문구 초안",
                summary,
                List.of("방문객에게 바로 읽어줄 수 있는 문구입니다."),
                List.of("상황 확인", "필요 시 본부 연결"),
                null,
                null,
                null,
                "MEDIUM"
        );
    }

    private SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(4));
        factory.setReadTimeout(Duration.ofSeconds(14));
        return factory;
    }

    private String generateText(String instructions, String input, String fallback) {
        if (apiKey == null || apiKey.isBlank()) {
            return fallback;
        }
        try {
            Map<String, Object> request = Map.of(
                    "model", model,
                    "instructions", instructions,
                    "input", input,
                    "max_output_tokens", 380
            );
            String response = restClient.post()
                    .uri(OPENAI_RESPONSES_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .headers(headers -> headers.setBearerAuth(apiKey))
                    .body(request)
                    .retrieve()
                    .body(String.class);
            String text = extractAnswer(response);
            return text == null || text.isBlank() ? fallback : text.trim();
        } catch (Exception ex) {
            return fallback;
        }
    }

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

    private OpsSnapshot snapshot() {
        List<BoothResponseDto> booths = boothService.getAllBooths();
        List<EventResponseDto> events = eventService.getAllEvents();
        List<NoticeResponseDto> notices = noticeService.getActiveNotices();
        List<LostItemResponseDto> lostItems = lostItemService.getAll(true);
        List<StaffMemberResponseDto> staff = staffService.getAllStaffMembers();
        List<CongestionResponseDto> congestions;
        try {
            congestions = boothService.getAllCongestions();
        } catch (Exception ex) {
            congestions = List.of();
        }
        return new OpsSnapshot(booths, events, notices, lostItems, staff, congestions);
    }

    private List<String> masterHighlights(OpsSnapshot snapshot) {
        List<String> result = new ArrayList<>();
        snapshot.congestions().stream()
                .max(Comparator.comparingInt(CongestionResponseDto::nearbyUserCount))
                .ifPresent(item -> result.add("최고 혼잡: " + item.boothName() + " · " + item.level() + " · " + item.nearbyUserCount() + "명"));
        snapshot.booths().stream()
                .filter(booth -> booth.estimatedWaitMinutes() != null)
                .max(Comparator.comparingInt(BoothResponseDto::estimatedWaitMinutes))
                .ifPresent(booth -> result.add("최장 대기: " + booth.name() + " · " + booth.estimatedWaitMinutes() + "분"));
        long lowStock = snapshot.booths().stream()
                .filter(booth -> booth.remainingStock() != null && booth.remainingStock() <= 10)
                .count();
        result.add("재고 10개 이하 부스: " + lowStock + "곳");
        long urgentStaff = snapshot.staff().stream().filter(staff -> "URGENT".equals(staff.status())).count();
        result.add("긴급 상태 스태프: " + urgentStaff + "명");
        long activeLost = snapshot.lostItems().stream().filter(item -> !"RETURNED".equals(item.status())).count();
        result.add("미반환 분실물: " + activeLost + "건");
        snapshot.events().stream()
                .filter(event -> event.startTime() != null && event.startTime().isAfter(LocalDateTime.now()))
                .min(Comparator.comparing(EventResponseDto::startTime))
                .ifPresent(event -> result.add("다음 공연: " + event.title() + " · " + event.startTime().toLocalTime()));
        return result;
    }

    private List<String> masterActions(OpsSnapshot snapshot) {
        List<String> actions = new ArrayList<>();
        if (snapshot.congestions().stream().anyMatch(item -> item.nearbyUserCount() >= 12)) {
            actions.add("혼잡 완화 공지 초안을 만들고 우회 동선을 안내하세요.");
        }
        if (snapshot.booths().stream().anyMatch(booth -> booth.remainingStock() != null && booth.remainingStock() <= 10)) {
            actions.add("재고 부족 부스에 품절/공급 상태 확인을 요청하세요.");
        }
        if (snapshot.staff().stream().anyMatch(staff -> "URGENT".equals(staff.status()))) {
            actions.add("긴급 상태 스태프 위치와 메모를 먼저 확인하세요.");
        }
        if (actions.isEmpty()) {
            actions.add("현재는 큰 위험 신호가 적습니다. 부스 대기시간과 공지 상태를 주기적으로 확인하세요.");
        }
        return actions;
    }

    private String noticeTitle(String type, OpsSnapshot snapshot) {
        if ("congestion".equals(type)) return "혼잡 구역 우회 안내";
        if ("lost".equals(type)) return "분실물 센터 이용 안내";
        if ("booth".equals(type)) return "부스 운영 상태 안내";
        if ("event".equals(type)) return "공연 일정 안내";
        return "축제 운영 안내";
    }

    private String noticeContent(String type, OpsSnapshot snapshot) {
        if ("congestion".equals(type)) {
            return snapshot.congestions().stream()
                    .max(Comparator.comparingInt(CongestionResponseDto::nearbyUserCount))
                    .map(item -> item.boothName() + " 주변이 혼잡합니다. 안전을 위해 여유 있는 통로를 이용해 주세요.")
                    .orElse("일부 구역이 혼잡할 수 있습니다. 현장 스태프 안내에 따라 이동해 주세요.");
        }
        if ("lost".equals(type)) return "분실물은 분실물 센터에서 확인할 수 있습니다. 물품 특징과 발견 위치를 스태프에게 알려 주세요.";
        if ("booth".equals(type)) return "일부 부스의 대기시간과 재고가 변동될 수 있습니다. 방문 전 부스 상세 정보를 확인해 주세요.";
        if ("event".equals(type)) return "공연 일정은 현장 상황에 따라 변동될 수 있습니다. 최신 안내를 확인해 주세요.";
        return "안전하고 원활한 축제 이용을 위해 현장 안내를 확인해 주세요.";
    }

    private String noticeCategory(String type) {
        if ("lost".equals(type)) return "분실물";
        if ("congestion".equals(type)) return "긴급";
        return "안내";
    }

    private Draft parseDraft(String generated, String fallbackTitle, String fallbackContent) {
        String title = fallbackTitle;
        String content = fallbackContent;
        if (generated != null) {
            for (String line : generated.split("\\R")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("제목:")) title = trimmed.substring(3).trim();
                if (trimmed.startsWith("내용:")) content = trimmed.substring(3).trim();
            }
        }
        return new Draft(title.isBlank() ? fallbackTitle : title, content.isBlank() ? fallbackContent : content);
    }

    private BoothResponseDto assignedBooth(StaffMemberResponseDto me) {
        if (me.assignedBoothId() == null) return null;
        try {
            return boothService.getBoothById(me.assignedBoothId());
        } catch (Exception ex) {
            return null;
        }
    }

    private CongestionResponseDto safeCongestion(Long boothId) {
        try {
            return boothService.getCongestionByBoothId(boothId);
        } catch (Exception ex) {
            return null;
        }
    }

    private String staffContext(StaffMemberResponseDto me, BoothResponseDto booth, CongestionResponseDto congestion, List<NoticeResponseDto> notices) {
        return "스태프: " + me.name() + " / " + me.team() + " / 상태 " + me.statusLabel()
                + "\n현재 업무: " + safe(me.currentTask(), "미입력")
                + "\n메모: " + safe(me.currentNote(), "미입력")
                + "\n담당 부스: " + (booth == null ? "미배정" : booth.name() + " / 대기 " + booth.estimatedWaitMinutes() + "분 / 재고 " + booth.remainingStock())
                + "\n혼잡도: " + (congestion == null ? "미확인" : congestion.level() + " / " + congestion.nearbyUserCount() + "명")
                + "\n활성 공지: " + notices.stream().map(NoticeResponseDto::title).toList();
    }

    private String staffFallback(StaffMemberResponseDto me, BoothResponseDto booth, CongestionResponseDto congestion) {
        if (booth == null) {
            return "현재 담당 부스가 없습니다. 팀 지시와 중요 공지를 먼저 확인해 주세요.";
        }
        return booth.name() + " 담당입니다. 대기 " + value(booth.estimatedWaitMinutes()) + "분, 재고 " + value(booth.remainingStock())
                + ", 혼잡도 " + (congestion == null ? "미확인" : congestion.level()) + "입니다.";
    }

    private List<String> staffHighlights(StaffMemberResponseDto me, BoothResponseDto booth, CongestionResponseDto congestion, List<NoticeResponseDto> notices) {
        List<String> result = new ArrayList<>();
        result.add("상태: " + me.statusLabel());
        result.add("담당: " + (booth == null ? "미배정" : booth.name()));
        if (congestion != null) result.add("혼잡도: " + congestion.level() + " · " + congestion.nearbyUserCount() + "명");
        if (!notices.isEmpty()) result.add("중요 공지: " + notices.get(0).title());
        return result;
    }

    private List<String> staffActions(StaffMemberResponseDto me, BoothResponseDto booth, CongestionResponseDto congestion) {
        List<String> actions = new ArrayList<>();
        if (booth != null && booth.remainingStock() != null && booth.remainingStock() <= 10) actions.add("재고 부족 가능성을 운영자에게 보고하세요.");
        if (booth != null && booth.estimatedWaitMinutes() != null && booth.estimatedWaitMinutes() >= 20) actions.add("대기열 정리와 예상 대기시간 안내를 강화하세요.");
        if (congestion != null && congestion.nearbyUserCount() >= 12) actions.add("혼잡 완화를 위해 주변 동선을 정리하세요.");
        if (actions.isEmpty()) actions.add("현재 상태를 유지하고 문의 응대와 위치 공유를 계속하세요.");
        return actions;
    }

    private List<LostItemResponseDto> lostItemMatches(String prompt) {
        Set<String> terms = new LinkedHashSet<>(List.of(safe(prompt, "").toLowerCase().split("[^\\p{IsAlphabetic}\\p{IsDigit}가-힣]+")));
        return lostItemService.getAll(true).stream()
                .filter(item -> scoreLostItem(item, terms) > 0)
                .sorted(Comparator.comparingInt((LostItemResponseDto item) -> scoreLostItem(item, terms)).reversed())
                .toList();
    }

    private int scoreLostItem(LostItemResponseDto item, Set<String> terms) {
        String target = (safe(item.title(), "") + " " + safe(item.description(), "") + " " + safe(item.category(), "") + " " + safe(item.foundLocation(), "")).toLowerCase();
        int score = 0;
        for (String term : terms) {
            if (term != null && term.length() >= 2 && target.contains(term)) score++;
        }
        return score;
    }

    private String confidence(List<String> highlights) {
        return highlights.size() >= 4 ? "HIGH" : "MEDIUM";
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String value(Object value) {
        return value == null ? "-" : String.valueOf(value);
    }

    private record OpsSnapshot(
            List<BoothResponseDto> booths,
            List<EventResponseDto> events,
            List<NoticeResponseDto> notices,
            List<LostItemResponseDto> lostItems,
            List<StaffMemberResponseDto> staff,
            List<CongestionResponseDto> congestions
    ) {
        String context(String purpose) {
            return "목적: " + purpose
                    + "\n부스: " + booths.stream().limit(12).map(booth -> booth.name() + "/대기 " + booth.estimatedWaitMinutes() + "/재고 " + booth.remainingStock()).toList()
                    + "\n혼잡: " + congestions.stream().limit(8).map(item -> item.boothName() + "/" + item.level() + "/" + item.nearbyUserCount()).toList()
                    + "\n공연: " + events.stream().limit(8).map(event -> event.title() + "/" + event.status() + "/" + event.startTime()).toList()
                    + "\n공지: " + notices.stream().limit(5).map(NoticeResponseDto::title).toList()
                    + "\n분실물: " + lostItems.stream().limit(8).map(item -> item.title() + "/" + item.statusLabel()).toList()
                    + "\n스태프: " + staff.stream().limit(12).map(member -> member.name() + "/" + member.statusLabel() + "/" + member.currentTask()).toList();
        }
    }

    private record Draft(String title, String content) {
    }
}
