package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.TranslateRequestDto;
import com.festflow.backend.dto.TranslateResponseDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
/**
 * [서비스 상세 주석] 외부 번역 API를 호출해 문장을 번역합니다.
 * 이 클래스의 핵심은 HTTP 요청 구성, 응답 파싱, 실패 처리를 한 곳에 모읍니다.
 * 주요 관심사는 일반 서비스 로직입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class TranslateService {

    private static final Map<String, String> PRESET_KO_TO_EN = Map.of(
            "화장실은 저쪽입니다.", "The restroom is over there.",
            "분실물 센터는 본부 부스 옆에 있습니다.", "The lost-and-found center is next to the main booth.",
            "입구는 왼쪽, 출구는 오른쪽입니다.", "The entrance is on the left, and the exit is on the right.",
            "잠시만 기다려 주세요.", "Please wait a moment.",
            "도움이 필요하시면 저를 따라오세요.", "If you need help, please follow me."
    );

    private static final Map<String, String> PRESET_EN_TO_KO = Map.of(
            "Where is the restroom?", "화장실은 어디인가요?",
            "I lost my wallet.", "지갑을 잃어버렸어요.",
            "Where is the main stage?", "메인 무대가 어디인가요?",
            "Can you help me?", "도와주실 수 있나요?",
            "Thank you.", "감사합니다."
    );
// [의존성 주석] Java 객체와 JSON 문자열을 서로 바꾸는 도구입니다. Python 모델/외부 API 입출력에서 자주 사용됩니다.
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
    private final String googleEndpoint;
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

    public TranslateService(@Value("${app.translate.google-endpoint:https://translate.googleapis.com/translate_a/single}") String googleEndpoint) {
        this.googleEndpoint = googleEndpoint;
    }
/**
 * [상세 주석] translate 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: TranslateResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public TranslateResponseDto translate(TranslateRequestDto requestDto) {
        String text = requestDto.text().trim();
        String sourceLang = normalizeLang(requestDto.sourceLang());
        String targetLang = normalizeLang(requestDto.targetLang());
        long startedAt = System.currentTimeMillis();

        String preset = tryPreset(text, sourceLang, targetLang);
        if (preset != null) {
            long latency = System.currentTimeMillis() - startedAt;
            return new TranslateResponseDto(
                    preset,
                    sourceLang,
                    "preset",
                    0.99,
                    latency
            );
        }

        try {
            String translated = callGoogleTranslate(text, sourceLang, targetLang);
            long latency = System.currentTimeMillis() - startedAt;
            double confidence = translated.equalsIgnoreCase(text) ? 0.45 : 0.88;
            return new TranslateResponseDto(
                    translated,
                    sourceLang,
                    "google-translate",
                    confidence,
                    latency
            );
        } catch (Exception ignored) {
            // Fallback keeps service available even with external API failure.
            long latency = System.currentTimeMillis() - startedAt;
            String fallback = fallbackTranslate(text, sourceLang, targetLang, requestDto.contextHints());
            return new TranslateResponseDto(
                    fallback,
                    sourceLang,
                    "fallback",
                    0.35,
                    latency
            );
        }
    }
/**
 * [상세 주석] callGoogleTranslate 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String callGoogleTranslate(String text, String sourceLang, String targetLang) throws IOException, InterruptedException {
        String sourceParam = "auto".equals(sourceLang) ? "auto" : sourceLang;
        String encodedText = URLEncoder.encode(text, StandardCharsets.UTF_8);

        String url = googleEndpoint
                + "?client=gtx"
                + "&dt=t"
                + "&sl=" + sourceParam
                + "&tl=" + targetLang
                + "&q=" + encodedText;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new ResponseStatusException(BAD_GATEWAY, "Translate provider returned non-2xx status.");
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode sentences = root.path(0);
        if (!sentences.isArray() || sentences.isEmpty()) {
            throw new ResponseStatusException(BAD_GATEWAY, "Translate provider response shape is invalid.");
        }

        StringBuilder builder = new StringBuilder();
        for (JsonNode sentence : sentences) {
            JsonNode translated = sentence.path(0);
            if (translated.isTextual()) {
                builder.append(translated.asText());
            }
        }

        String translatedText = builder.toString().trim();
        if (translatedText.isEmpty()) {
            throw new ResponseStatusException(BAD_GATEWAY, "Translate provider returned empty text.");
        }
        return translatedText;
    }
/**
 * [상세 주석] fallbackTranslate 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private String fallbackTranslate(String text, String sourceLang, String targetLang, List<String> contextHints) {
        String contextPrefix = contextHints == null || contextHints.isEmpty()
                ? ""
                : "(" + String.join(" / ", contextHints.stream().limit(3).toList()) + ") ";
        if ("ko".equals(sourceLang) && "en".equals(targetLang)) {
            return contextPrefix + "[EN] " + text;
        }
        if ("en".equals(sourceLang) && "ko".equals(targetLang)) {
            return contextPrefix + "[KO] " + text;
        }
        return contextPrefix + text;
    }
/**
 * [상세 주석] tryPreset 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String tryPreset(String text, String sourceLang, String targetLang) {
        if ("ko".equals(sourceLang) && "en".equals(targetLang)) {
            return PRESET_KO_TO_EN.get(text);
        }
        if ("en".equals(sourceLang) && "ko".equals(targetLang)) {
            return PRESET_EN_TO_KO.get(text);
        }
        return null;
    }
/**
 * [상세 주석] normalizeLang 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeLang(String lang) {
        if (lang == null || lang.isBlank()) {
            return "auto";
        }
        String normalized = lang.toLowerCase(Locale.ROOT).trim();
        if (normalized.startsWith("ko")) {
            return "ko";
        }
        if (normalized.startsWith("en")) {
            return "en";
        }
        if ("auto".equals(normalized)) {
            return "auto";
        }
        return normalized;
    }
}

