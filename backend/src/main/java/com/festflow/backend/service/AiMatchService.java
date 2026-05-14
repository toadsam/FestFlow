package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchProfileResponseDto;
import com.festflow.backend.dto.AiMatchRequestCreateDto;
import com.festflow.backend.dto.AiMatchRequestResponseDto;
import com.festflow.backend.entity.AiMatchProfile;
import com.festflow.backend.entity.AiMatchRequest;
import com.festflow.backend.repository.AiMatchProfileRepository;
import com.festflow.backend.repository.AiMatchRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class AiMatchService {

    private final AiMatchProfileRepository profileRepository;
    private final AiMatchRequestRepository requestRepository;
    private final UploadStorageService uploadStorageService;
    private final AiImageGenerationService aiImageGenerationService;

    public AiMatchService(
            AiMatchProfileRepository profileRepository,
            AiMatchRequestRepository requestRepository,
            UploadStorageService uploadStorageService,
            AiImageGenerationService aiImageGenerationService
    ) {
        this.profileRepository = profileRepository;
        this.requestRepository = requestRepository;
        this.uploadStorageService = uploadStorageService;
        this.aiImageGenerationService = aiImageGenerationService;
    }

    @Transactional(readOnly = true)
    public List<AiMatchProfileResponseDto> getProfiles() {
        return profileRepository.findAllByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                .map(this::toProfileDto)
                .toList();
    }

    @Transactional
    public AiMatchImagePreviewDto createImagePreview(MultipartFile file) throws IOException {
        if (!aiImageGenerationService.isConfigured()) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }
        String originalImageUrl = uploadStorageService.saveImage(file, "ai-profile-original");
        String generatedImageUrl = aiImageGenerationService.generateFestivalProfileImage(
                originalImageUrl,
                "",
                ""
        );
        return new AiMatchImagePreviewDto(originalImageUrl, generatedImageUrl);
    }

    @Transactional
    public AiMatchProfileResponseDto createProfile(
            String nickname,
            String gender,
            String intro,
            String meetPlace,
            boolean consent,
            MultipartFile file,
            String originalImageUrl,
            String generatedImageUrl
    ) throws IOException {
        if (!consent) {
            throw new ResponseStatusException(BAD_REQUEST, "Public profile consent is required.");
        }

        String safeNickname = trimRequired(nickname, "nickname", 40);
        String safeGender = trimRequired(gender, "gender", 20);
        String safeIntro = trimRequired(intro, "intro", 500);
        String safeMeetPlace = trimRequired(meetPlace, "meetPlace", 120);
        if (!aiImageGenerationService.isConfigured()) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }
        String safeOriginalImageUrl = trimOrNull(originalImageUrl);
        String safeGeneratedImageUrl = trimOrNull(generatedImageUrl);
        if (safeGeneratedImageUrl != null) {
            uploadStorageService.resolveUploadUrl(safeGeneratedImageUrl);
            if (safeOriginalImageUrl != null) {
                uploadStorageService.resolveUploadUrl(safeOriginalImageUrl);
            }
        } else {
            safeOriginalImageUrl = uploadStorageService.saveImage(file, "ai-profile-original");
            safeGeneratedImageUrl = aiImageGenerationService.generateFestivalProfileImage(
                    safeOriginalImageUrl,
                    safeNickname,
                    safeIntro
            );
        }

        AiMatchProfile saved = profileRepository.save(new AiMatchProfile(
                safeNickname,
                safeGender,
                safeIntro,
                safeMeetPlace,
                safeOriginalImageUrl,
                safeGeneratedImageUrl,
                true
        ));
        return toProfileDto(saved);
    }

    @Transactional(readOnly = true)
    public List<AiMatchRequestResponseDto> getRequests(Long profileId) {
        List<AiMatchRequest> requests = profileId == null
                ? requestRepository.findAllByOrderByCreatedAtDesc()
                : requestRepository.findAllByProfileIdOrderByCreatedAtDesc(profileId);
        return requests.stream()
                .map(this::toRequestDto)
                .toList();
    }

    @Transactional
    public AiMatchRequestResponseDto createRequest(Long profileId, AiMatchRequestCreateDto requestDto) {
        AiMatchProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "AI match profile not found."));
        String requesterNickname = trimRequired(requestDto.requesterNickname(), "requesterNickname", 40);
        String meetPlace = trimRequired(requestDto.meetPlace(), "meetPlace", 120);
        String message = trimRequired(requestDto.message(), "message", 500);

        AiMatchRequest saved = requestRepository.save(new AiMatchRequest(
                profile,
                requesterNickname,
                meetPlace,
                message
        ));
        return toRequestDto(saved);
    }

    private AiMatchProfileResponseDto toProfileDto(AiMatchProfile profile) {
        return new AiMatchProfileResponseDto(
                profile.getId(),
                profile.getNickname(),
                profile.getGender(),
                profile.getIntro(),
                profile.getMeetPlace(),
                profile.getOriginalImageUrl(),
                profile.getGeneratedImageUrl(),
                profile.getCreatedAt()
        );
    }

    private AiMatchRequestResponseDto toRequestDto(AiMatchRequest request) {
        return new AiMatchRequestResponseDto(
                request.getId(),
                request.getProfile().getId(),
                request.getProfile().getNickname(),
                request.getRequesterNickname(),
                request.getMeetPlace(),
                request.getMessage(),
                request.getCreatedAt()
        );
    }

    private String trimRequired(String value, String field, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, field + " is required.");
        }
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(BAD_REQUEST, field + " must be " + maxLength + " characters or shorter.");
        }
        return trimmed;
    }

    private String trimOrNull(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
