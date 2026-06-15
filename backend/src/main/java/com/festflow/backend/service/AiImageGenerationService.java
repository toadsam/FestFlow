package com.festflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
/**
 * [서비스 상세 주석] AI 이미지 생성과 이미지 API 연동을 처리합니다.
 * 이 클래스의 핵심은 외부 AI API 호출은 실패할 수 있으므로 설정 확인, 예외 처리, 대체 흐름을 함께 둡니다.
 * 주요 관심사는 AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AiImageGenerationService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final String OPENAI_IMAGE_EDIT_PATH = "/v1/images/edits";
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final String OPENAI_RESPONSES_PATH = "/v1/responses";
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final UploadStorageService uploadStorageService;
// [의존성 주석] Java 객체와 JSON 문자열을 서로 바꾸는 도구입니다. Python 모델/외부 API 입출력에서 자주 사용됩니다.
private final ObjectMapper objectMapper;
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
private final RestClient restClient;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String apiKey;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final String textModel;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final String imageModel;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final boolean photoValidationEnabled;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */

    public AiImageGenerationService(
            UploadStorageService uploadStorageService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-5-mini}") String textModel,
            @Value("${app.openai.image-model:gpt-image-1.5}") String imageModel,
            @Value("${app.ai-match.photo-validation.enabled:true}") boolean photoValidationEnabled
    ) {
        this.uploadStorageService = uploadStorageService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.textModel = textModel;
        this.imageModel = imageModel;
        this.photoValidationEnabled = photoValidationEnabled;
    }
/**
 * [상세 주석] generateFestivalProfileImage 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 HTTP API를 호출하고 응답 JSON을 파싱합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public String generateFestivalProfileImage(String originalImageUrl, String nickname, String intro) throws IOException {
        if (!isConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }

        Path originalPath = uploadStorageService.resolveUploadUrl(originalImageUrl);
        ensureSupportedInput(originalPath);
        if (photoValidationEnabled) {
            ensureEligibleProfilePhoto(originalPath);
        }

        try {
            String response = createImageEdit(originalPath, "image[]", nickname, intro);
            byte[] imageBytes = extractGeneratedImage(response);
            return uploadStorageService.saveImageBytes(imageBytes, "ai-profile-webtoon", ".png");
        } catch (RestClientResponseException ex) {
            return retryWithSingleImageField(originalPath, nickname, intro);
        } catch (RestClientException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "OpenAI image conversion failed.",
                    ex
            );
        }
    }
/**
 * [상세 주석] isConfigured 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
/**
 * [상세 주석] retryWithSingleImageField 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 HTTP API를 호출하고 응답 JSON을 파싱합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String retryWithSingleImageField(
            Path originalPath,
            String nickname,
            String intro
    ) throws IOException {
        try {
            String response = createImageEdit(originalPath, "image", nickname, intro);
            byte[] imageBytes = extractGeneratedImage(response);
            return uploadStorageService.saveImageBytes(imageBytes, "ai-profile-webtoon", ".png");
        } catch (RestClientResponseException secondError) {
            throw toOpenAiException(secondError);
        } catch (RestClientException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "OpenAI image conversion failed.",
                    ex
            );
        }
    }
/**
 * [상세 주석] createImageEdit 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String createImageEdit(Path originalPath, String imageFieldName, String nickname, String intro) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("model", imageModel);
        body.add(imageFieldName, new FileSystemResource(originalPath));
        body.add("prompt", buildWebtoonPrompt(nickname, intro));
        body.add("size", "1024x1536");
        body.add("quality", "high");
        body.add("input_fidelity", "high");
        body.add("output_format", "png");
        body.add("n", "1");

        return restClient.post()
                .uri(OPENAI_IMAGE_EDIT_PATH)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .headers(headers -> headers.setBearerAuth(apiKey))
                .body(body)
                .retrieve()
                .body(String.class);
    }
/**
 * [상세 주석] ensureEligibleProfilePhoto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 HTTP API를 호출하고 응답 JSON을 파싱합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensureEligibleProfilePhoto(Path originalPath) throws IOException {
        String imageDataUrl = toImageDataUrl(originalPath);
        Map<String, Object> body = Map.of(
                "model", textModel,
                "store", false,
                "max_output_tokens", 220,
                "reasoning", Map.of("effort", "minimal"),
                "text", Map.of("verbosity", "low"),
                "input", List.of(Map.of(
                        "role", "user",
                        "content", List.of(
                                Map.of(
                                        "type", "input_text",
                                        "text", """
                                                Validate this image before AI profile portrait conversion.
                                                Accept normal real-person photos, including passport-style headshots, ID-style portraits, selfies, indoor portraits, plain-background profile photos, and low-resolution photos, when one main human face is visible.
                                                Reject only these clear cases:
                                                - no visible human face
                                                - multiple prominent people or group photo
                                                - landscape, background-only photo, object, animal, food, product, or document
                                                - screenshot, code/editor screen, app/browser screen, meme, poster, or text-heavy image
                                                - drawing, illustration, anime, cartoon, or already generated portrait
                                                Return only compact JSON:
                                                {"accepted":true|false,"category":"valid_person_photo|no_face|group_photo|background_or_object|screenshot_or_text|drawing_or_generated|uncertain","reason":"short Korean reason"}
                                                If uncertain, use {"accepted":true,"category":"uncertain","reason":"확실히 부적합하지 않음"}.
                                                """
                                ),
                                Map.of(
                                        "type", "input_image",
                                        "image_url", imageDataUrl,
                                        "detail", "low"
                                )
                        )
                ))
        );

        try {
            String response = restClient.post()
                    .uri(OPENAI_RESPONSES_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .headers(headers -> headers.setBearerAuth(apiKey))
                    .body(body)
                    .retrieve()
                    .body(String.class);
            validatePhotoCheckResponse(response);
        } catch (RestClientResponseException ex) {
            throw toOpenAiException(ex);
        } catch (RestClientException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "사진 확인 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
                    ex
            );
        }
    }
/**
 * [상세 주석] validatePhotoCheckResponse 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void validatePhotoCheckResponse(String response) throws IOException {
        JsonNode root = objectMapper.readTree(response);
        String outputText = extractResponseOutputText(root);
        if (outputText.isBlank()) {
            return;
        }

        JsonNode result;
        try {
            result = objectMapper.readTree(stripCodeFence(outputText));
        } catch (Exception ignored) {
            return;
        }

        boolean accepted = result.path("accepted").asBoolean(true);
        String category = result.path("category").asText("uncertain");
        if (!accepted && shouldRejectUploadedPhoto(category)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "AI_MATCH_PHOTO_REJECTED:" + rejectionMessage(category)
            );
        }
    }
/**
 * [상세 주석] shouldRejectUploadedPhoto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean shouldRejectUploadedPhoto(String category) {
        String normalized = category == null ? "" : category.toLowerCase(Locale.ROOT);
        return normalized.equals("no_face")
                || normalized.equals("group_photo")
                || normalized.equals("background_or_object")
                || normalized.equals("screenshot_or_text")
                || normalized.equals("drawing_or_generated");
    }
/**
 * [상세 주석] rejectionMessage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String rejectionMessage(String category) {
        String normalized = category == null ? "" : category.toLowerCase(Locale.ROOT);
        if (normalized.equals("no_face")) {
            return "사람 얼굴이 보이는 사진으로 인식되지 않았습니다. 정면 얼굴이 잘 보이는 1인 사진을 올려 주세요.";
        }
        if (normalized.equals("group_photo")) {
            return "단체 사진은 사용할 수 없습니다. 본인 한 명의 얼굴이 잘 보이는 사진을 올려 주세요.";
        }
        if (normalized.equals("background_or_object")) {
            return "배경, 사물, 풍경 사진은 사용할 수 없습니다. 사람 얼굴이 잘 보이는 사진을 올려 주세요.";
        }
        if (normalized.equals("screenshot_or_text")) {
            return "스크린샷, 코드 화면, 문서 이미지는 사용할 수 없습니다. 실제 사람 사진을 올려 주세요.";
        }
        if (normalized.equals("drawing_or_generated")) {
            return "그림, 애니메이션, 이미 생성된 AI 사진은 사용할 수 없습니다. 실제 사람 사진을 올려 주세요.";
        }
        return "정면 얼굴이 잘 보이는 1인 실제 사진을 올려 주세요.";
    }
/**
 * [상세 주석] extractResponseOutputText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extractResponseOutputText(JsonNode root) {
        String directText = root.path("output_text").asText("");
        if (!directText.isBlank()) {
            return directText;
        }
        for (JsonNode outputItem : root.path("output")) {
            for (JsonNode contentItem : outputItem.path("content")) {
                if ("output_text".equals(contentItem.path("type").asText(""))) {
                    String text = contentItem.path("text").asText("");
                    if (!text.isBlank()) {
                        return text;
                    }
                }
            }
        }
        return "";
    }
/**
 * [상세 주석] stripCodeFence 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String stripCodeFence(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replaceFirst("^```(?:json)?\\s*", "");
            trimmed = trimmed.replaceFirst("\\s*```$", "");
        }
        return trimmed.trim();
    }
/**
 * [상세 주석] toImageDataUrl 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String toImageDataUrl(Path imagePath) throws IOException {
        String contentType = contentTypeForImage(imagePath);
        String encoded = Base64.getEncoder().encodeToString(Files.readAllBytes(imagePath));
        return "data:" + contentType + ";base64," + encoded;
    }
/**
 * [상세 주석] contentTypeForImage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String contentTypeForImage(Path imagePath) throws IOException {
        String probed = Files.probeContentType(imagePath);
        if (probed != null && probed.startsWith("image/")) {
            return probed;
        }
        String filename = imagePath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (filename.endsWith(".webp")) {
            return "image/webp";
        }
        return "image/png";
    }
/**
 * [상세 주석] extractGeneratedImage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: byte[] 타입 값을 반환합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private byte[] extractGeneratedImage(String response) throws IOException {
        JsonNode root = objectMapper.readTree(response);
        String b64Json = root.path("data").path(0).path("b64_json").asText("");
        if (b64Json.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "OpenAI image response did not include generated image data."
            );
        }
        return Base64.getDecoder().decode(b64Json);
    }
/**
 * [상세 주석] buildWebtoonPrompt 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 응답 문구나 요청 payload처럼 다음 단계에서 쓸 데이터를 조립하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String buildWebtoonPrompt(String nickname, String intro) {
        return """
                Edit the uploaded person photo into a clean Korean webtoon portrait while keeping the same real person recognizable.
                This should be a true webtoon-style redraw, not a photoreal retouch and not a totally different character.
                Preserve the source person's identity very closely: face shape, eye shape and spacing, eyebrows, nose bridge and tip, lips, jawline, hairstyle, hair length, expression, age impression, and camera angle.
                Do not beautify, idolize, age-change, slim the face, enlarge the eyes, sharpen the jaw, change hairstyle, or change skin tone.
                Use visible but tasteful webtoon styling: clean line art around the eyes, nose, lips, jaw, and hair; flat but soft cel shading; simplified skin texture; illustrated hair strands; and slightly posterized colors.
                Keep the composition and clothing close to the original.
                Remove flashy neon glow, purple-orange gradients, lens flare, futuristic lighting, and synthetic beauty-filter effects.
                Keep the background simple and understated so the face remains the focus.
                Avoid anime exaggeration, chibi style, doll-like skin, fantasy styling, dramatic makeup, glossy idol styling, and over-rendered realism.
                Keep the result friendly, non-sexual, fully clothed, and appropriate for a public campus festival dating profile.
                Do not include text, logos, watermarks, UI, QR codes, or captions inside the image.
                Profile nickname context: %s
                Profile intro context: %s
                """.formatted(safePromptText(nickname, 40), safePromptText(intro, 180));
    }
/**
 * [상세 주석] ensureSupportedInput 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensureSupportedInput(Path originalPath) {
        String filename = originalPath.getFileName().toString().toLowerCase();
        if (!(filename.endsWith(".jpg")
                || filename.endsWith(".jpeg")
                || filename.endsWith(".png")
                || filename.endsWith(".webp"))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Webtoon AI conversion supports JPG, PNG, or WEBP images."
            );
        }
    }
/**
 * [상세 주석] toOpenAiException 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ResponseStatusException입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 HTTP API를 호출하고 응답 JSON을 파싱합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private ResponseStatusException toOpenAiException(RestClientResponseException ex) {
        String detail = extractOpenAiError(ex.getResponseBodyAsString());
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                toUserFacingOpenAiError(ex.getStatusCode().value(), detail),
                ex
        );
    }
/**
 * [상세 주석] toUserFacingOpenAiError 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String toUserFacingOpenAiError(int upstreamStatus, String detail) {
        String normalized = detail == null ? "" : detail.toLowerCase(Locale.ROOT);
        if (upstreamStatus == 401 || normalized.contains("invalid api key") || normalized.contains("incorrect api key")) {
            return "OpenAI API 키가 올바르지 않습니다. OPENAI_API_KEY 환경변수를 확인해 주세요.";
        }
        if (normalized.contains("insufficient_quota")
                || normalized.contains("quota")
                || normalized.contains("billing")
                || normalized.contains("credit")) {
            return "OpenAI 사용량 한도 또는 결제 크레딧이 부족합니다. OpenAI 결제/Usage 한도를 확인해 주세요.";
        }
        if (upstreamStatus == 429 || normalized.contains("rate limit") || normalized.contains("too many requests")) {
            return "OpenAI 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.";
        }
        if (normalized.contains("model") || normalized.contains("does not exist")) {
            return "OpenAI 모델 설정이 올바르지 않습니다. OPENAI_MODEL 또는 OPENAI_IMAGE_MODEL 값을 확인해 주세요.";
        }
        if (normalized.contains("policy")
                || normalized.contains("safety")
                || normalized.contains("moderation")
                || normalized.contains("content")) {
            return "이 사진은 AI 변환을 진행할 수 없습니다. 정면 얼굴이 잘 보이는 일반 프로필 사진으로 다시 올려 주세요.";
        }
        return detail == null || detail.isBlank()
                ? "OpenAI 이미지 변환 요청에 실패했습니다. 서버 로그를 확인해 주세요."
                : "OpenAI 이미지 변환 요청에 실패했습니다: " + detail;
    }
/**
 * [상세 주석] extractOpenAiError 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extractOpenAiError(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return "";
        }
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            String message = root.path("error").path("message").asText("");
            return message.length() > 240 ? message.substring(0, 240) : message;
        } catch (Exception ignored) {
            return "";
        }
    }
/**
 * [상세 주석] safePromptText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String safePromptText(String value, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() <= maxLength) {
            return trimmed;
        }
        return trimmed.substring(0, maxLength);
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
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(120));
        return factory;
    }
}
