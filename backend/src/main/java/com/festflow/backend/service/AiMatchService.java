package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchProfileAccessRequestDto;
import com.festflow.backend.dto.AiMatchProfileAccessResponseDto;
import com.festflow.backend.dto.AiMatchProfileDeleteDto;
import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchProfileResponseDto;
import com.festflow.backend.dto.AiMatchProfileUpdateDto;
import com.festflow.backend.dto.AiMatchRequestCreateDto;
import com.festflow.backend.dto.AiMatchRequestResponseDto;
import com.festflow.backend.entity.AiMatchProfile;
import com.festflow.backend.entity.AiMatchRequest;
import com.festflow.backend.repository.AiMatchProfileRepository;
import com.festflow.backend.repository.AiMatchRequestRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class AiMatchService {

    private final AiMatchProfileRepository profileRepository;
    private final AiMatchRequestRepository requestRepository;
    private final UploadStorageService uploadStorageService;
    private final AiImageGenerationService aiImageGenerationService;
    private final PasswordEncoder passwordEncoder;

    public AiMatchService(
            AiMatchProfileRepository profileRepository,
            AiMatchRequestRepository requestRepository,
            UploadStorageService uploadStorageService,
            AiImageGenerationService aiImageGenerationService,
            PasswordEncoder passwordEncoder
    ) {
        this.profileRepository = profileRepository;
        this.requestRepository = requestRepository;
        this.uploadStorageService = uploadStorageService;
        this.aiImageGenerationService = aiImageGenerationService;
        this.passwordEncoder = passwordEncoder;
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
            String pin,
            String meetPlace,
            boolean consent,
            MultipartFile file,
            String originalImageUrl,
            String generatedImageUrl
    ) throws IOException {
        if (!consent) {
            throw new ResponseStatusException(BAD_REQUEST, "프로필 공개 동의가 필요합니다.");
        }

        String safeNickname = trimRequired(nickname, "nickname", 40);
        String safeGender = trimRequired(gender, "gender", 20);
        String safeIntro = trimRequired(intro, "intro", 500);
        String safePin = trimRequired(pin, "pin", 20);
        String safeMeetPlace = trimRequired(meetPlace, "meetPlace", 120);
        validatePin(safePin);
        ensureNicknameAvailable(safeNickname, null);
        if (!aiImageGenerationService.isConfigured()) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }
        String safeOriginalImageUrl = trimOrNull(originalImageUrl);
        String safeGeneratedImageUrl = trimOrNull(generatedImageUrl);
        if (safeGeneratedImageUrl == null && (file == null || file.isEmpty())) {
            throw new ResponseStatusException(BAD_REQUEST, "프로필 사진을 먼저 업로드해 주세요.");
        }
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
                passwordEncoder.encode(safePin),
                safeMeetPlace,
                safeOriginalImageUrl,
                safeGeneratedImageUrl,
                true
        ));
        return toProfileDto(saved);
    }

    @Transactional(readOnly = true)
    public AiMatchProfileAccessResponseDto accessProfile(AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        return new AiMatchProfileAccessResponseDto(
                toProfileDto(profile),
                requestRepository.findAllByProfileIdOrderByCreatedAtDesc(profile.getId()).stream()
                        .map(this::toRequestDto)
                        .toList(),
                requestRepository.findAllByRequesterProfileIdOrderByCreatedAtDesc(profile.getId()).stream()
                        .map(this::toRequestDto)
                        .toList(),
                getDiscoverableProfiles(profile.getId())
        );
    }

    @Transactional
    public AiMatchProfileResponseDto updateProfile(Long profileId, AiMatchProfileUpdateDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.currentNickname(), requestDto.pin());
        if (!profile.getId().equals(profileId)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Profile credentials do not match this profile.");
        }

        String safeNickname = trimRequired(requestDto.nickname(), "nickname", 40);
        String safeGender = trimRequired(requestDto.gender(), "gender", 20);
        String safeIntro = trimRequired(requestDto.intro(), "intro", 500);
        String safeMeetPlace = trimRequired(requestDto.meetPlace(), "meetPlace", 120);
        ensureNicknameAvailable(safeNickname, profileId);

        profile.updateProfile(safeNickname, safeGender, safeIntro, safeMeetPlace);
        return toProfileDto(profile);
    }

    @Transactional
    public void deleteProfile(Long profileId, AiMatchProfileDeleteDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.currentNickname(), requestDto.pin());
        if (!profile.getId().equals(profileId)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Profile credentials do not match this profile.");
        }
        profile.deactivate();
    }

    @Transactional
    public AiMatchRequestResponseDto createRequest(Long profileId, AiMatchRequestCreateDto requestDto) {
        AiMatchProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "AI match profile not found."));
        if (!"ACTIVE".equals(profile.getStatus())) {
            throw new ResponseStatusException(NOT_FOUND, "존재하지 않는 프로필입니다.");
        }
        AiMatchProfile requesterProfile = authenticateProfile(requestDto.requesterNickname(), requestDto.requesterPin());
        if (requesterProfile.getId().equals(profile.getId())) {
            throw new ResponseStatusException(BAD_REQUEST, "자기 자신에게는 데이트 신청을 보낼 수 없습니다.");
        }
        if (requestRepository.existsByRequesterProfileIdAndProfileIdAndStatus(requesterProfile.getId(), profile.getId(), "PENDING")) {
            throw new ResponseStatusException(CONFLICT, "이미 대기 중인 데이트 신청이 있습니다.");
        }
        String meetPlace = trimRequired(requestDto.meetPlace(), "meetPlace", 120);
        String message = trimRequired(requestDto.message(), "message", 500);

        AiMatchRequest saved = requestRepository.save(new AiMatchRequest(
                profile,
                requesterProfile,
                requesterProfile.getNickname(),
                meetPlace,
                message
        ));
        return toRequestDto(saved);
    }

    @Transactional
    public AiMatchRequestResponseDto acceptRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensurePendingRequest(request);
        request.accept();
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto rejectRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensurePendingRequest(request);
        request.reject();
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto cancelRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndRequesterProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "보낸 데이트 신청을 찾을 수 없습니다."));
        ensurePendingRequest(request);
        request.cancel();
        return toRequestDto(request);
    }

    private List<AiMatchProfileResponseDto> getDiscoverableProfiles(Long viewerProfileId) {
        return profileRepository.findAllByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                .filter(profile -> !profile.getId().equals(viewerProfileId))
                .map(this::toProfileDto)
                .toList();
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

    private AiMatchProfile authenticateProfile(String nickname, String pin) {
        String safeNickname = trimRequired(nickname, "nickname", 40);
        String safePin = trimRequired(pin, "pin", 20);
        validatePin(safePin);
        AiMatchProfile profile = profileRepository.findByNicknameIgnoreCaseAndStatus(safeNickname, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "닉네임 또는 PIN이 올바르지 않습니다."));
        if (profile.getPinHash() == null || !passwordEncoder.matches(safePin, profile.getPinHash())) {
            throw new ResponseStatusException(UNAUTHORIZED, "닉네임 또는 PIN이 올바르지 않습니다.");
        }
        return profile;
    }

    private void ensureNicknameAvailable(String nickname, Long profileId) {
        boolean duplicated = profileId == null
                ? profileRepository.existsByNicknameIgnoreCaseAndStatus(nickname, "ACTIVE")
                : profileRepository.existsByNicknameIgnoreCaseAndStatusAndIdNot(nickname, "ACTIVE", profileId);
        if (duplicated) {
            throw new ResponseStatusException(CONFLICT, "이미 사용 중인 닉네임입니다.");
        }
    }

    private void validatePin(String pin) {
        if (!pin.matches("\\d{4,6}")) {
            throw new ResponseStatusException(BAD_REQUEST, "PIN은 4~6자리 숫자여야 합니다.");
        }
    }

    private AiMatchRequestResponseDto toRequestDto(AiMatchRequest request) {
        return new AiMatchRequestResponseDto(
                request.getId(),
                request.getProfile().getId(),
                request.getProfile().getNickname(),
                request.getRequesterProfile().getId(),
                request.getRequesterNickname(),
                request.getMeetPlace(),
                request.getMessage(),
                request.getStatus(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }

    private void ensurePendingRequest(AiMatchRequest request) {
        if (!"PENDING".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "이미 처리된 데이트 신청입니다.");
        }
    }

    private String trimRequired(String value, String field, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, fieldLabel(field) + "을(를) 입력해 주세요.");
        }
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    fieldLabel(field) + "은(는) " + maxLength + "자 이하로 입력해 주세요."
            );
        }
        return trimmed;
    }

    private String fieldLabel(String field) {
        return switch (field) {
            case "nickname" -> "닉네임";
            case "gender" -> "성별";
            case "intro" -> "자기소개";
            case "pin" -> "PIN";
            case "meetPlace" -> "만날 장소";
            case "requesterNickname" -> "신청자 닉네임";
            case "message" -> "메시지";
            default -> field;
        };
    }

    private String trimOrNull(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
