package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchAdminOverviewDto;
import com.festflow.backend.dto.AiMatchAdminNoteUpdateDto;
import com.festflow.backend.dto.AiMatchAdminProfileDto;
import com.festflow.backend.dto.AiMatchAdminRequestDto;
import com.festflow.backend.dto.AiMatchConnectionStatusUpdateDto;
import com.festflow.backend.dto.AiMatchProfileAccessRequestDto;
import com.festflow.backend.dto.AiMatchProfileAccessResponseDto;
import com.festflow.backend.dto.AiMatchProfileDeleteDto;
import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchMeetupProposalDto;
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
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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
            String phoneNumber,
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
        String safePhoneNumber = normalizePhoneNumber(phoneNumber, true);
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
                safePhoneNumber,
                safeMeetPlace,
                safeOriginalImageUrl,
                safeGeneratedImageUrl,
                true
        ));
        return toProfileDto(saved);
    }

    @Transactional
    public AiMatchProfileAccessResponseDto accessProfile(AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        List<AiMatchRequest> receivedRequests = requestRepository.findAllByProfileIdOrderByCreatedAtDesc(profile.getId());
        List<AiMatchRequest> sentRequests = requestRepository.findAllByRequesterProfileIdOrderByCreatedAtDesc(profile.getId());
        closeRequestsWithInactiveParticipants(Stream.concat(receivedRequests.stream(), sentRequests.stream()).toList());
        return new AiMatchProfileAccessResponseDto(
                toProfileDto(profile),
                receivedRequests.stream()
                        .map(this::toRequestDto)
                        .toList(),
                sentRequests.stream()
                        .map(this::toRequestDto)
                        .toList(),
                getDiscoverableProfiles(profile.getId())
        );
    }

    @Transactional
    public AiMatchAdminOverviewDto getAdminOverview() {
        List<AiMatchProfile> profiles = profileRepository.findAll().stream()
                .sorted(Comparator.comparing(AiMatchProfile::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        List<AiMatchRequest> requests = requestRepository.findAllByOrderByCreatedAtDesc();
        closeRequestsWithInactiveParticipants(requests);
        Map<Long, Long> receivedCounts = requests.stream()
                .filter(request -> request.getProfile() != null && request.getProfile().getId() != null)
                .collect(Collectors.groupingBy(request -> request.getProfile().getId(), Collectors.counting()));
        Map<Long, Long> sentCounts = requests.stream()
                .map(AiMatchRequest::getRequesterProfile)
                .filter(profile -> profile != null && profile.getId() != null)
                .collect(Collectors.groupingBy(AiMatchProfile::getId, Collectors.counting()));
        Map<Long, Long> pendingReceivedCounts = requests.stream()
                .filter(request -> "PENDING".equals(request.getStatus()))
                .filter(request -> request.getProfile() != null && request.getProfile().getId() != null)
                .collect(Collectors.groupingBy(request -> request.getProfile().getId(), Collectors.counting()));
        Map<Long, Long> matchedCounts = requests.stream()
                .filter(request -> isMatchedStatus(request.getStatus()))
                .flatMap(request -> Stream.of(
                        request.getProfile() == null ? null : request.getProfile().getId(),
                        request.getRequesterProfile() == null ? null : request.getRequesterProfile().getId()
                ))
                .filter(id -> id != null)
                .collect(Collectors.groupingBy(id -> id, Collectors.counting()));

        List<AiMatchAdminProfileDto> profileDtos = profiles.stream()
                .map(profile -> toAdminProfileDto(
                        profile,
                        receivedCounts.getOrDefault(profile.getId(), 0L),
                        sentCounts.getOrDefault(profile.getId(), 0L),
                        pendingReceivedCounts.getOrDefault(profile.getId(), 0L),
                        matchedCounts.getOrDefault(profile.getId(), 0L)
                ))
                .toList();
        List<AiMatchAdminRequestDto> requestDtos = requests.stream()
                .map(this::toAdminRequestDto)
                .toList();

        return new AiMatchAdminOverviewDto(
                profiles.stream().filter(profile -> "ACTIVE".equals(profile.getStatus())).count(),
                profiles.size(),
                requests.size(),
                requests.stream().filter(request -> "PENDING".equals(request.getStatus())).count(),
                requests.stream().filter(request -> isMatchedStatus(request.getStatus())).count(),
                profileDtos,
                requestDtos
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
        String safePhoneNumber = normalizePhoneNumber(requestDto.phoneNumber(), false);
        String safeMeetPlace = trimRequired(requestDto.meetPlace(), "meetPlace", 120);
        ensureNicknameAvailable(safeNickname, profileId);

        profile.updateProfile(safeNickname, safeGender, safeIntro, safeMeetPlace, safePhoneNumber);
        return toProfileDto(profile);
    }

    @Transactional
    public AiMatchAdminRequestDto updateConnectionStatus(Long requestId, AiMatchConnectionStatusUpdateDto requestDto) {
        AiMatchRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensureRequestParticipantsActive(request);
        if (!isMatchedStatus(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "성사된 매치만 연결 상태를 변경할 수 있습니다.");
        }
        String safeConnectionStatus = normalizeConnectionStatus(requestDto.connectionStatus());
        request.updateConnectionStatus(safeConnectionStatus);
        return toAdminRequestDto(request);
    }

    @Transactional
    public AiMatchAdminRequestDto updateAdminNote(Long requestId, AiMatchAdminNoteUpdateDto requestDto) {
        AiMatchRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensureRequestParticipantsActive(request);
        if (!isMatchedStatus(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "성사된 매치만 관리자 메모를 남길 수 있습니다.");
        }
        String safeAdminNote = trimOptional(requestDto == null ? "" : requestDto.adminNote(), 1000);
        request.updateAdminNote(safeAdminNote);
        return toAdminRequestDto(request);
    }

    @Transactional
    public void deleteProfile(Long profileId, AiMatchProfileDeleteDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.currentNickname(), requestDto.pin());
        if (!profile.getId().equals(profileId)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Profile credentials do not match this profile.");
        }
        profile.deactivate();
        closeRequestsForDeletedProfile(profileId);
    }

    @Transactional
    public void deleteProfileByAdmin(Long profileId) {
        AiMatchProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "AI match profile not found."));
        profile.deactivate();
        closeRequestsForDeletedProfile(profileId);
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
        ensureRequestParticipantsActive(request);
        ensurePendingRequest(request);
        request.accept();
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto rejectRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensureRequestParticipantsActive(request);
        ensurePendingRequest(request);
        request.reject();
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto cancelRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndRequesterProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "보낸 데이트 신청을 찾을 수 없습니다."));
        if (!isRequestBetweenActiveProfiles(request)) {
            cancelRequestIfOpen(request);
            return toRequestDto(request);
        }
        ensurePendingRequest(request);
        request.cancel();
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto proposeMeetup(Long requestId, AiMatchMeetupProposalDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = getParticipatingRequest(requestId, profile);
        ensureRequestParticipantsActive(request);
        ensureMeetupProposalAllowed(request);

        String meetupPlace = trimRequired(requestDto.meetupPlace(), "meetPlace", 120);
        LocalDateTime meetupAt = requestDto.meetupAt();
        if (meetupAt == null) {
            throw new ResponseStatusException(BAD_REQUEST, "만날 시간을 선택해 주세요.");
        }
        if (meetupAt.isBefore(LocalDateTime.now().minusMinutes(1))) {
            throw new ResponseStatusException(BAD_REQUEST, "지나간 시간으로는 약속을 제안할 수 없습니다.");
        }

        request.proposeMeetup(meetupPlace, meetupAt, profile.getId(), profile.getNickname());
        return toRequestDto(request);
    }

    @Transactional
    public AiMatchRequestResponseDto confirmMeetup(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = getParticipatingRequest(requestId, profile);
        ensureRequestParticipantsActive(request);
        if (!"PROPOSED".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "확정할 약속 제안이 없습니다.");
        }
        if (request.getMeetupProposerProfileId() != null && request.getMeetupProposerProfileId().equals(profile.getId())) {
            throw new ResponseStatusException(CONFLICT, "상대방이 제안한 약속만 확정할 수 있습니다.");
        }

        request.confirmMeetup();
        return toRequestDto(request);
    }

    private List<AiMatchProfileResponseDto> getDiscoverableProfiles(Long viewerProfileId) {
        return profileRepository.findAllByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                .filter(profile -> !profile.getId().equals(viewerProfileId))
                .map(this::toProfileDto)
                .toList();
    }

    private void closeRequestsForDeletedProfile(Long profileId) {
        closeRequestsWithInactiveParticipants(requestRepository.findAllByProfileIdOrRequesterProfileId(profileId, profileId));
    }

    private void closeRequestsWithInactiveParticipants(List<AiMatchRequest> requests) {
        requests.stream()
                .filter(request -> !isRequestBetweenActiveProfiles(request))
                .forEach(this::cancelRequestIfOpen);
    }

    private void cancelRequestIfOpen(AiMatchRequest request) {
        if (!"CANCELED".equals(request.getStatus()) && !"REJECTED".equals(request.getStatus())) {
            request.cancelForProfileDeleted();
            return;
        }
        if ("CANCELED".equals(request.getStatus()) && request.getStatusReason().isBlank()) {
            request.cancelForProfileDeleted();
        }
    }

    private boolean isRequestBetweenActiveProfiles(AiMatchRequest request) {
        AiMatchProfile targetProfile = request.getProfile();
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        return targetProfile != null
                && requesterProfile != null
                && "ACTIVE".equals(targetProfile.getStatus())
                && "ACTIVE".equals(requesterProfile.getStatus());
    }

    private void ensureRequestParticipantsActive(AiMatchRequest request) {
        if (!isRequestBetweenActiveProfiles(request)) {
            cancelRequestIfOpen(request);
            throw new ResponseStatusException(CONFLICT, "The other profile has been deleted.");
        }
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

    private AiMatchAdminProfileDto toAdminProfileDto(
            AiMatchProfile profile,
            long receivedCount,
            long sentCount,
            long pendingReceivedCount,
            long matchedCount
    ) {
        return new AiMatchAdminProfileDto(
                profile.getId(),
                profile.getNickname(),
                profile.getGender(),
                profile.getIntro(),
                profile.getMeetPlace(),
                profile.getPhoneNumber(),
                profile.getOriginalImageUrl(),
                profile.getGeneratedImageUrl(),
                profile.getStatus(),
                Math.toIntExact(receivedCount),
                Math.toIntExact(sentCount),
                Math.toIntExact(pendingReceivedCount),
                Math.toIntExact(matchedCount),
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
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        return new AiMatchRequestResponseDto(
                request.getId(),
                request.getProfile().getId(),
                request.getProfile().getNickname(),
                requesterProfile == null ? null : requesterProfile.getId(),
                request.getRequesterNickname(),
                request.getMeetPlace(),
                request.getMessage(),
                request.getStatus(),
                request.getStatusReason(),
                request.getMeetupPlace(),
                request.getMeetupAt(),
                request.getMeetupProposerProfileId(),
                request.getMeetupProposerNickname(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }

    private AiMatchAdminRequestDto toAdminRequestDto(AiMatchRequest request) {
        AiMatchProfile profile = request.getProfile();
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        return new AiMatchAdminRequestDto(
                request.getId(),
                profile == null ? null : profile.getId(),
                profile == null ? "" : profile.getNickname(),
                profile == null ? "" : profile.getPhoneNumber(),
                profile == null ? "" : profile.getOriginalImageUrl(),
                profile == null ? "" : profile.getGeneratedImageUrl(),
                requesterProfile == null ? null : requesterProfile.getId(),
                request.getRequesterNickname(),
                requesterProfile == null ? "" : requesterProfile.getPhoneNumber(),
                requesterProfile == null ? "" : requesterProfile.getOriginalImageUrl(),
                requesterProfile == null ? "" : requesterProfile.getGeneratedImageUrl(),
                request.getMeetPlace(),
                request.getMessage(),
                request.getStatus(),
                request.getConnectionStatus(),
                request.getAdminNote(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }

    private boolean isMatchedStatus(String status) {
        return "ACCEPTED".equals(status) || "PROPOSED".equals(status) || "CONFIRMED".equals(status);
    }

    private String normalizeConnectionStatus(String status) {
        String normalized = status == null ? "" : status.trim().toUpperCase();
        if ("WAITING".equals(normalized) || "COMPLETED".equals(normalized) || "FAILED".equals(normalized)) {
            return normalized;
        }
        throw new ResponseStatusException(BAD_REQUEST, "연결 상태가 올바르지 않습니다.");
    }

    private void ensurePendingRequest(AiMatchRequest request) {
        if (!"PENDING".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "이미 처리된 데이트 신청입니다.");
        }
    }

    private AiMatchRequest getParticipatingRequest(Long requestId, AiMatchProfile profile) {
        AiMatchRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        boolean isParticipant = request.getProfile().getId().equals(profile.getId())
                || (requesterProfile != null && requesterProfile.getId().equals(profile.getId()));
        if (!isParticipant) {
            throw new ResponseStatusException(UNAUTHORIZED, "이 데이트 신청에 접근할 수 없습니다.");
        }
        return request;
    }

    private void ensureMeetupProposalAllowed(AiMatchRequest request) {
        if (!"ACCEPTED".equals(request.getStatus()) && !"PROPOSED".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "약속을 조율할 수 있는 상태가 아닙니다.");
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
            case "phoneNumber" -> "전화번호";
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

    private String trimOptional(String value, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(BAD_REQUEST, "입력값은 최대 " + maxLength + "자 이하로 입력해 주세요.");
        }
        return trimmed;
    }

    private String normalizePhoneNumber(String value, boolean required) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            if (required) {
                throw new ResponseStatusException(BAD_REQUEST, "전화번호를 입력해 주세요.");
            }
            return null;
        }
        if (trimmed.length() > 30 || !trimmed.matches("[0-9+()\\-\\s]+")) {
            throw new ResponseStatusException(BAD_REQUEST, "전화번호 형식이 올바르지 않습니다.");
        }
        String digitsOnly = trimmed.replaceAll("\\D", "");
        if (digitsOnly.length() < 8 || digitsOnly.length() > 15) {
            throw new ResponseStatusException(BAD_REQUEST, "전화번호 형식이 올바르지 않습니다.");
        }
        return trimmed;
    }
}
