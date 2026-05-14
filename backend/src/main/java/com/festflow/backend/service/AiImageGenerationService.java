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
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;

@Service
public class AiImageGenerationService {

    private static final String OPENAI_IMAGE_EDIT_PATH = "/v1/images/edits";

    private final UploadStorageService uploadStorageService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String imageModel;

    public AiImageGenerationService(
            UploadStorageService uploadStorageService,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.image-model:gpt-image-1.5}") String imageModel
    ) {
        this.uploadStorageService = uploadStorageService;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com")
                .requestFactory(requestFactory())
                .build();
        this.apiKey = apiKey;
        this.imageModel = imageModel;
    }

    public String generateFestivalProfileImage(String originalImageUrl, String nickname, String intro) throws IOException {
        if (!isConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }

        Path originalPath = uploadStorageService.resolveUploadUrl(originalImageUrl);
        ensureSupportedInput(originalPath);

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

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

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

    private String createImageEdit(Path originalPath, String imageFieldName, String nickname, String intro) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("model", imageModel);
        body.add(imageFieldName, new FileSystemResource(originalPath));
        body.add("prompt", buildWebtoonPrompt(nickname, intro));
        body.add("size", "1024x1536");
        body.add("quality", "medium");
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

    private String buildWebtoonPrompt(String nickname, String intro) {
        return """
                Make a realistic identity-preserving portrait edit of the uploaded person photo.
                The output should still look like the same real person from the source photo, not a new illustrated character.
                Keep at least 90 percent of the original facial identity: face shape, eye shape and spacing, eyelids, eyebrows, nose bridge and tip, lips, jawline, cheek structure, skin tone, hairstyle, hair length, expression, age impression, pose, and camera angle.
                Do not beautify, glamorize, idolize, age-change, slim the face, enlarge the eyes, sharpen the jaw, change hairstyle, change skin tone, or alter gender presentation.
                Keep the original photo composition, clothing, visible accessories, lighting direction, and background as much as possible.
                Apply only a very subtle webtoon-inspired finish: slightly cleaner skin texture, gentle line definition around facial features, mild cel-shading, and soft color polish.
                The result should look closer to a realistic photo with a light cartoon filter than to a full webtoon drawing.
                Avoid anime style, chibi style, fantasy style, doll-like skin, oversized eyes, dramatic makeup, and highly stylized character art.
                Keep the result friendly, non-sexual, fully clothed, and appropriate for a public campus festival dating profile.
                Do not include text, logos, watermarks, UI, QR codes, or captions inside the image.
                Profile nickname context: %s
                Profile intro context: %s
                """.formatted(safePromptText(nickname, 40), safePromptText(intro, 180));
    }

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

    private ResponseStatusException toOpenAiException(RestClientResponseException ex) {
        String detail = extractOpenAiError(ex.getResponseBodyAsString());
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                detail.isBlank() ? "OpenAI image conversion failed." : detail,
                ex
        );
    }

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

    private String safePromptText(String value, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() <= maxLength) {
            return trimmed;
        }
        return trimmed.substring(0, maxLength);
    }

    private SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(120));
        return factory;
    }
}
