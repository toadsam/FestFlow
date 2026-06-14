package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchAdminOverviewDto;
import com.festflow.backend.dto.AiMatchAdminNoteUpdateDto;
import com.festflow.backend.dto.AiMatchAdminPhonePurgeRequestDto;
import com.festflow.backend.dto.AiMatchAdminPhonePurgeResponseDto;
import com.festflow.backend.dto.AiMatchAdminProfileDto;
import com.festflow.backend.dto.AiMatchAdminRequestDto;
import com.festflow.backend.dto.AiMatchConnectionStatusUpdateDto;
import com.festflow.backend.dto.AiMatchFavoriteResponseDto;
import com.festflow.backend.dto.AiMatchProfileAccessRequestDto;
import com.festflow.backend.dto.AiMatchProfileAccessResponseDto;
import com.festflow.backend.dto.AiMatchProfileDeleteDto;
import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchMeetupProposalDto;
import com.festflow.backend.dto.AiMatchPhoneCheckDto;
import com.festflow.backend.dto.AiMatchProfileResponseDto;
import com.festflow.backend.dto.AiMatchProfileUpdateDto;
import com.festflow.backend.dto.AiMatchRequestCreateDto;
import com.festflow.backend.dto.AiMatchRequestResponseDto;
import com.festflow.backend.entity.AiMatchFavorite;
import com.festflow.backend.entity.AiMatchPhoneUsage;
import com.festflow.backend.entity.AiMatchProfile;
import com.festflow.backend.entity.AiMatchRequest;
import com.festflow.backend.repository.AiMatchFavoriteRepository;
import com.festflow.backend.repository.AiMatchPhoneUsageRepository;
import com.festflow.backend.repository.AiMatchProfileRepository;
import com.festflow.backend.repository.AiMatchRequestRepository;
import com.festflow.backend.service.notification.AiMatchSmsNotifier;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
/**
 * [서비스 상세 주석] AI 매칭 프로필과 매칭 요청 상태를 관리합니다.
 * 이 클래스의 핵심은 프로필 저장, 이미지 저장, 상태 전이, 알림까지 한 흐름으로 묶습니다.
 * 주요 관심사는 DB 조회/저장, 파일 업로드, AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AiMatchService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final int MAX_SUCCESSFUL_IMAGE_CONVERSIONS_PER_PHONE = 2;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final AiMatchProfileRepository profileRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final AiMatchRequestRepository requestRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final AiMatchFavoriteRepository favoriteRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final AiMatchPhoneUsageRepository phoneUsageRepository;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final UploadStorageService uploadStorageService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final AiImageGenerationService aiImageGenerationService;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final AiMatchSmsNotifier aiMatchSmsNotifier;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final PasswordEncoder passwordEncoder;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public AiMatchService(
            AiMatchProfileRepository profileRepository,
            AiMatchRequestRepository requestRepository,
            AiMatchFavoriteRepository favoriteRepository,
            AiMatchPhoneUsageRepository phoneUsageRepository,
            UploadStorageService uploadStorageService,
            AiImageGenerationService aiImageGenerationService,
            AiMatchSmsNotifier aiMatchSmsNotifier,
            PasswordEncoder passwordEncoder
    ) {
        this.profileRepository = profileRepository;
        this.requestRepository = requestRepository;
        this.favoriteRepository = favoriteRepository;
        this.phoneUsageRepository = phoneUsageRepository;
        this.uploadStorageService = uploadStorageService;
        this.aiImageGenerationService = aiImageGenerationService;
        this.aiMatchSmsNotifier = aiMatchSmsNotifier;
        this.passwordEncoder = passwordEncoder;
    }
/**
 * [상세 주석] checkPhoneNumber 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 예약, 인증, 상태 조건이 맞는지 확인하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchPhoneCheckDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional(readOnly = true)
    public AiMatchPhoneCheckDto checkPhoneNumber(String phoneNumber) {
        String phoneNumberKey = normalizePhoneNumberKey(phoneNumber, true);
        AiMatchPhoneUsage phoneUsage = phoneUsageRepository.findByPhoneNumber(phoneNumberKey).orElse(null);
        int usedCount = phoneUsage == null ? 0 : phoneUsage.getSuccessfulImageConversionCount();
        int remainingCount = Math.max(0, MAX_SUCCESSFUL_IMAGE_CONVERSIONS_PER_PHONE - usedCount);

        if (phoneUsage != null && phoneUsage.isBlocked()) {
            return new AiMatchPhoneCheckDto(
                    phoneNumberKey,
                    false,
                    usedCount,
                    remainingCount,
                    "삭제된 프로필의 전화번호는 다시 가입할 수 없습니다."
            );
        }
        if (isPhoneNumberDeleted(phoneNumberKey)) {
            return new AiMatchPhoneCheckDto(
                    phoneNumberKey,
                    false,
                    usedCount,
                    remainingCount,
                    "삭제된 프로필의 전화번호는 다시 가입할 수 없습니다."
            );
        }
        if (isPhoneNumberInUse(phoneNumberKey, null)) {
            return new AiMatchPhoneCheckDto(
                    phoneNumberKey,
                    false,
                    usedCount,
                    remainingCount,
                    "이미 등록된 전화번호입니다."
            );
        }
        if (remainingCount <= 0) {
            return new AiMatchPhoneCheckDto(
                    phoneNumberKey,
                    false,
                    usedCount,
                    0,
                    "이 전화번호는 AI 이미지 변환 가능 횟수를 모두 사용했습니다."
            );
        }
        return new AiMatchPhoneCheckDto(
                phoneNumberKey,
                true,
                usedCount,
                remainingCount,
                "사용 가능한 전화번호입니다. AI 변환 " + remainingCount + "회 남았습니다."
        );
    }
/**
 * [상세 주석] createImagePreview 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: AiMatchImagePreviewDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 파일 업로드는 JSON.stringify가 아니라 FormData와 multipart/form-data 흐름으로 이해해야 합니다.
 */
    @Transactional
    public AiMatchImagePreviewDto createImagePreview(MultipartFile file, String phoneNumber) throws IOException {
        if (!aiImageGenerationService.isConfigured()) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "OPENAI_API_KEY is required for webtoon image conversion."
            );
        }
        String safePhoneNumberKey = normalizePhoneNumberKey(phoneNumber, true);
        AiMatchPhoneUsage phoneUsage = getOrCreatePhoneUsageForUpdate(safePhoneNumberKey);
        ensurePhoneNumberNotDeleted(safePhoneNumberKey);
        ensurePhoneCanGenerateImage(phoneUsage);

        String originalImageUrl = uploadStorageService.saveImage(file, "ai-profile-original");
        String generatedImageUrl = aiImageGenerationService.generateFestivalProfileImage(
                originalImageUrl,
                "",
                ""
        );
        phoneUsage.recordSuccessfulImageConversion();
        int usedCount = phoneUsage.getSuccessfulImageConversionCount();
        int remainingCount = Math.max(0, MAX_SUCCESSFUL_IMAGE_CONVERSIONS_PER_PHONE - usedCount);
        return new AiMatchImagePreviewDto(
                originalImageUrl,
                generatedImageUrl,
                usedCount,
                remainingCount,
                "AI 변환이 완료되었습니다. " + remainingCount + "회 남았습니다."
        );
    }
/**
 * [상세 주석] createProfile 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: AiMatchProfileResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
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
        String safeGender = normalizeGender(gender);
        String safeIntro = trimRequired(intro, "intro", 500);
        String safePin = trimRequired(pin, "pin", 20);
        String safePhoneNumber = normalizePhoneNumber(phoneNumber, true);
        String safePhoneNumberKey = normalizePhoneNumberKey(safePhoneNumber, true);
        String safeMeetPlace = trimRequired(meetPlace, "meetPlace", 120);
        AiMatchPhoneUsage phoneUsage = getOrCreatePhoneUsageForUpdate(safePhoneNumberKey);
        ensurePhoneNumberNotDeleted(safePhoneNumberKey);
        ensurePhoneCanRegister(phoneUsage);
        ensurePhoneNumberAvailable(safePhoneNumberKey, null);
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
            ensurePhoneCanGenerateImage(phoneUsage);
            safeOriginalImageUrl = uploadStorageService.saveImage(file, "ai-profile-original");
            safeGeneratedImageUrl = aiImageGenerationService.generateFestivalProfileImage(
                    safeOriginalImageUrl,
                    safeNickname,
                    safeIntro
            );
            phoneUsage.recordSuccessfulImageConversion();
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
/**
 * [상세 주석] accessProfile 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchProfileAccessResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional
    public AiMatchProfileAccessResponseDto accessProfile(AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        List<AiMatchRequest> receivedRequests = requestRepository.findAllByProfileIdOrderByCreatedAtDesc(profile.getId());
        List<AiMatchRequest> sentRequests = requestRepository.findAllByRequesterProfileIdOrderByCreatedAtDesc(profile.getId());
        closeRequestsWithInactiveParticipants(Stream.concat(receivedRequests.stream(), sentRequests.stream()).toList());
        return new AiMatchProfileAccessResponseDto(
                toProfileDto(profile),
                profile.getPhoneNumber(),
                toPhoneUsageDto(profile),
                receivedRequests.stream()
                        .map(this::toRequestDto)
                        .toList(),
                sentRequests.stream()
                        .map(this::toRequestDto)
                        .toList(),
                getDiscoverableProfiles(profile.getId()),
                favoriteRepository.findActiveProfileIdsByRequesterProfileId(profile.getId())
        );
    }
/**
 * [상세 주석] getAdminOverview 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AiMatchAdminOverviewDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] updateProfile 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchProfileResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public AiMatchProfileResponseDto updateProfile(Long profileId, AiMatchProfileUpdateDto requestDto) throws IOException {
        AiMatchProfile profile = authenticateProfile(requestDto.currentNickname(), requestDto.pin());
        if (!profile.getId().equals(profileId)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Profile credentials do not match this profile.");
        }

        String safeNickname = trimRequired(requestDto.nickname(), "nickname", 40);
        String safeGender = normalizeGender(requestDto.gender());
        String safeIntro = trimRequired(requestDto.intro(), "intro", 500);
        String safePhoneNumber = normalizePhoneNumber(requestDto.phoneNumber(), false);
        String safeMeetPlace = trimRequired(requestDto.meetPlace(), "meetPlace", 120);
        String safeOriginalImageUrl = trimOrNull(requestDto.originalImageUrl());
        String safeGeneratedImageUrl = trimOrNull(requestDto.generatedImageUrl());
        if (safePhoneNumber != null) {
            String requestedPhoneNumberKey = normalizePhoneNumberKey(safePhoneNumber, true);
            String currentPhoneNumberKey = phoneNumberKeyFromStored(profile.getPhoneNumber());
            if (currentPhoneNumberKey != null && !currentPhoneNumberKey.equals(requestedPhoneNumberKey)) {
                throw new ResponseStatusException(CONFLICT, "AI 과사용 방지를 위해 전화번호는 가입 후 변경할 수 없습니다.");
            }
            ensurePhoneNumberNotDeleted(requestedPhoneNumberKey);
            ensurePhoneCanRegister(getOrCreatePhoneUsageForUpdate(requestedPhoneNumberKey));
            ensurePhoneNumberAvailable(requestedPhoneNumberKey, profileId);
        }
        if (safeGeneratedImageUrl != null) {
            uploadStorageService.resolveUploadUrl(safeGeneratedImageUrl);
        }
        if (safeOriginalImageUrl != null) {
            uploadStorageService.resolveUploadUrl(safeOriginalImageUrl);
        }
        ensureNicknameAvailable(safeNickname, profileId);

        profile.updateProfile(
                safeNickname,
                safeGender,
                safeIntro,
                safeMeetPlace,
                safePhoneNumber,
                safeOriginalImageUrl,
                safeGeneratedImageUrl
        );
        return toProfileDto(profile);
    }
/**
 * [상세 주석] updateConnectionStatus 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchAdminRequestDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
/**
 * [상세 주석] updateAdminNote 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchAdminRequestDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
/**
 * [상세 주석] deleteProfile 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public void deleteProfile(Long profileId, AiMatchProfileDeleteDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.currentNickname(), requestDto.pin());
        if (!profile.getId().equals(profileId)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Profile credentials do not match this profile.");
        }
        profile.deactivate();
        favoriteRepository.deleteAllByRequesterProfileIdOrProfileId(profileId, profileId);
        blockPhoneNumber(profile.getPhoneNumber());
        closeRequestsForDeletedProfile(profileId);
    }
/**
 * [상세 주석] deleteProfileByAdmin 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public void deleteProfileByAdmin(Long profileId) {
        AiMatchProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "AI match profile not found."));
        profile.deactivate();
        favoriteRepository.deleteAllByRequesterProfileIdOrProfileId(profileId, profileId);
        blockPhoneNumber(profile.getPhoneNumber());
        closeRequestsForDeletedProfile(profileId);
    }
/**
 * [상세 주석] purgeByPhoneNumber 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchAdminPhonePurgeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional
    public AiMatchAdminPhonePurgeResponseDto purgeByPhoneNumber(AiMatchAdminPhonePurgeRequestDto requestDto) {
        String phoneNumberKey = normalizePhoneNumberKey(requestDto.phoneNumber(), true);
        List<AiMatchProfile> targetProfiles = profileRepository.findAll().stream()
                .filter(profile -> phoneNumberKey.equals(phoneNumberKeyFromStored(profile.getPhoneNumber())))
                .toList();
        List<Long> targetProfileIds = targetProfiles.stream()
                .map(AiMatchProfile::getId)
                .toList();
        List<String> imageUrls = targetProfiles.stream()
                .flatMap(profile -> Stream.of(profile.getOriginalImageUrl(), profile.getGeneratedImageUrl()))
                .filter(url -> url != null && !url.isBlank())
                .distinct()
                .toList();

        long deletedFavorites = targetProfileIds.isEmpty()
                ? 0
                : favoriteRepository.deleteAllReferencingProfileIds(targetProfileIds);
        long deletedRequests = targetProfileIds.isEmpty()
                ? 0
                : requestRepository.deleteAllReferencingProfileIds(targetProfileIds);
        if (!targetProfileIds.isEmpty()) {
            profileRepository.deleteAllByIdInBatch(targetProfileIds);
        }
        long deletedPhoneUsage = phoneUsageRepository.deleteByPhoneNumber(phoneNumberKey);
        ImageFileDeleteResult imageFileDeleteResult = deleteProfileImageFiles(imageUrls);

        return new AiMatchAdminPhonePurgeResponseDto(
                phoneNumberKey,
                targetProfileIds.size(),
                Math.toIntExact(deletedRequests),
                Math.toIntExact(deletedFavorites),
                Math.toIntExact(deletedPhoneUsage),
                imageFileDeleteResult.deletedCount(),
                imageFileDeleteResult.failedCount()
        );
    }
/**
 * [상세 주석] toggleFavorite 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchFavoriteResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 삭제 대상이 확인되면 Repository를 통해 DB에서 제거합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public AiMatchFavoriteResponseDto toggleFavorite(Long profileId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile requesterProfile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "AI match profile not found."));
        if (!"ACTIVE".equals(profile.getStatus())) {
            throw new ResponseStatusException(NOT_FOUND, "존재하지 않는 프로필입니다.");
        }
        if (requesterProfile.getId().equals(profile.getId())) {
            throw new ResponseStatusException(BAD_REQUEST, "자기 자신은 좋아요할 수 없습니다.");
        }

        boolean favorite = favoriteRepository
                .findByRequesterProfileIdAndProfileId(requesterProfile.getId(), profile.getId())
                .map(existing -> {
                    favoriteRepository.delete(existing);
                    return false;
                })
                .orElseGet(() -> {
                    favoriteRepository.save(new AiMatchFavorite(requesterProfile, profile));
                    return true;
                });

        return new AiMatchFavoriteResponseDto(
                profile.getId(),
                favorite,
                favoriteRepository.findActiveProfileIdsByRequesterProfileId(requesterProfile.getId())
        );
    }
/**
 * [상세 주석] createRequest 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
        String targetPhoneNumber = profile.getPhoneNumber();
        afterCommit(() -> aiMatchSmsNotifier.notifyRequestCreated(targetPhoneNumber));
        return toRequestDto(saved);
    }
/**
 * [상세 주석] acceptRequest 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public AiMatchRequestResponseDto acceptRequest(Long requestId, AiMatchProfileAccessRequestDto requestDto) {
        AiMatchProfile profile = authenticateProfile(requestDto.nickname(), requestDto.pin());
        AiMatchRequest request = requestRepository.findByIdAndProfileId(requestId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "데이트 신청을 찾을 수 없습니다."));
        ensureRequestParticipantsActive(request);
        ensurePendingRequest(request);
        request.accept();
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        String requesterPhoneNumber = requesterProfile == null ? "" : requesterProfile.getPhoneNumber();
        afterCommit(() -> aiMatchSmsNotifier.notifyRequestAccepted(requesterPhoneNumber));
        return toRequestDto(request);
    }
/**
 * [상세 주석] rejectRequest 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
/**
 * [상세 주석] cancelRequest 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 진행 중인 상태를 취소 상태로 바꾸는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
/**
 * [상세 주석] proposeMeetup 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] confirmMeetup 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] getDiscoverableProfiles 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: List<AiMatchProfileResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private List<AiMatchProfileResponseDto> getDiscoverableProfiles(Long viewerProfileId) {
        return profileRepository.findAllByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                .filter(profile -> !profile.getId().equals(viewerProfileId))
                .map(this::toProfileDto)
                .toList();
    }
/**
 * [상세 주석] closeRequestsForDeletedProfile 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void closeRequestsForDeletedProfile(Long profileId) {
        closeRequestsWithInactiveParticipants(requestRepository.findAllByProfileIdOrRequesterProfileId(profileId, profileId));
    }
/**
 * [상세 주석] deleteProfileImageFiles 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: ImageFileDeleteResult 타입 값을 반환합니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private ImageFileDeleteResult deleteProfileImageFiles(List<String> imageUrls) {
        int deletedCount = 0;
        int failedCount = 0;
        for (String imageUrl : imageUrls) {
            try {
                if (uploadStorageService.deleteUploadUrl(imageUrl)) {
                    deletedCount += 1;
                }
            } catch (Exception ignored) {
                failedCount += 1;
            }
        }
        return new ImageFileDeleteResult(deletedCount, failedCount);
    }
/**
 * [상세 주석] closeRequestsWithInactiveParticipants 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private void closeRequestsWithInactiveParticipants(List<AiMatchRequest> requests) {
        requests.stream()
                .filter(request -> !isRequestBetweenActiveProfiles(request))
                .forEach(this::cancelRequestIfOpen);
    }
/**
 * [상세 주석] cancelRequestIfOpen 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 진행 중인 상태를 취소 상태로 바꾸는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void cancelRequestIfOpen(AiMatchRequest request) {
        if (!"CANCELED".equals(request.getStatus()) && !"REJECTED".equals(request.getStatus())) {
            request.cancelForProfileDeleted();
            return;
        }
        if ("CANCELED".equals(request.getStatus()) && request.getStatusReason().isBlank()) {
            request.cancelForProfileDeleted();
        }
    }
/**
 * [상세 주석] isRequestBetweenActiveProfiles 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean isRequestBetweenActiveProfiles(AiMatchRequest request) {
        AiMatchProfile targetProfile = request.getProfile();
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        return targetProfile != null
                && requesterProfile != null
                && "ACTIVE".equals(targetProfile.getStatus())
                && "ACTIVE".equals(requesterProfile.getStatus());
    }
/**
 * [상세 주석] ensureRequestParticipantsActive 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensureRequestParticipantsActive(AiMatchRequest request) {
        if (!isRequestBetweenActiveProfiles(request)) {
            cancelRequestIfOpen(request);
            throw new ResponseStatusException(CONFLICT, "The other profile has been deleted.");
        }
    }
/**
 * [상세 주석] toProfileDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchProfileResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] toPhoneUsageDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchPhoneCheckDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiMatchPhoneCheckDto toPhoneUsageDto(AiMatchProfile profile) {
        String phoneNumberKey = phoneNumberKeyFromStored(profile.getPhoneNumber());
        AiMatchPhoneUsage phoneUsage = phoneNumberKey == null
                ? null
                : phoneUsageRepository.findByPhoneNumber(phoneNumberKey).orElse(null);
        int usedCount = phoneUsage == null ? 0 : phoneUsage.getSuccessfulImageConversionCount();
        int remainingCount = Math.max(0, MAX_SUCCESSFUL_IMAGE_CONVERSIONS_PER_PHONE - usedCount);
        boolean available = (phoneUsage == null || !phoneUsage.isBlocked()) && remainingCount > 0;
        String message = available
                ? "AI 변환 " + remainingCount + "회 남았습니다."
                : "이 전화번호는 AI 이미지 변환 가능 횟수를 모두 사용했습니다.";
        return new AiMatchPhoneCheckDto(
                phoneNumberKey == null ? "" : phoneNumberKey,
                available,
                usedCount,
                remainingCount,
                message
        );
    }
/**
 * [상세 주석] toAdminProfileDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchAdminProfileDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] authenticateProfile 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchProfile 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    private AiMatchProfile authenticateProfile(String nickname, String pin) {
        String safeNickname = trimRequired(nickname, "nickname", 40);
        String safePin = trimRequired(pin, "pin", 20);
        validatePin(safePin);
        AiMatchProfile profile = profileRepository.findByNicknameIgnoreCaseAndStatus(safeNickname, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "닉네임 또는 비밀번호가 올바르지 않습니다."));
        if (profile.getPinHash() == null || !passwordEncoder.matches(safePin, profile.getPinHash())) {
            throw new ResponseStatusException(UNAUTHORIZED, "닉네임 또는 비밀번호가 올바르지 않습니다.");
        }
        return profile;
    }
/**
 * [상세 주석] ensureNicknameAvailable 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensureNicknameAvailable(String nickname, Long profileId) {
        boolean duplicated = profileId == null
                ? profileRepository.existsByNicknameIgnoreCaseAndStatus(nickname, "ACTIVE")
                : profileRepository.existsByNicknameIgnoreCaseAndStatusAndIdNot(nickname, "ACTIVE", profileId);
        if (duplicated) {
            throw new ResponseStatusException(CONFLICT, "이미 사용 중인 닉네임입니다.");
        }
    }
/**
 * [상세 주석] validatePin 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void validatePin(String pin) {
        if (pin.length() < 4 || pin.length() > 10 || pin.matches(".*\\s.*")) {
            throw new ResponseStatusException(BAD_REQUEST, "비밀번호는 4~10자여야 합니다.");
        }
    }
/**
 * [상세 주석] normalizeGender 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeGender(String gender) {
        String safeGender = trimRequired(gender, "gender", 20);
        if ("남성".equals(safeGender) || "여성".equals(safeGender)) {
            return safeGender;
        }
        throw new ResponseStatusException(BAD_REQUEST, "성별은 남자 또는 여자만 선택할 수 있습니다.");
    }
/**
 * [상세 주석] toRequestDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchRequestResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiMatchRequestResponseDto toRequestDto(AiMatchRequest request) {
        AiMatchProfile profile = request.getProfile();
        AiMatchProfile requesterProfile = request.getRequesterProfile();
        return new AiMatchRequestResponseDto(
                request.getId(),
                profile == null ? null : profile.getId(),
                profile == null ? "" : profile.getNickname(),
                profile == null ? "" : profile.getOriginalImageUrl(),
                profile == null ? "" : profile.getGeneratedImageUrl(),
                requesterProfile == null ? null : requesterProfile.getId(),
                request.getRequesterNickname(),
                requesterProfile == null ? "" : requesterProfile.getOriginalImageUrl(),
                requesterProfile == null ? "" : requesterProfile.getGeneratedImageUrl(),
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
/**
 * [상세 주석] toAdminRequestDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: AiMatchAdminRequestDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
                request.getStatusReason(),
                request.getConnectionStatus(),
                request.getAdminNote(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }
/**
 * [상세 주석] isMatchedStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean isMatchedStatus(String status) {
        return "ACCEPTED".equals(status) || "PROPOSED".equals(status) || "CONFIRMED".equals(status);
    }
/**
 * [상세 주석] afterCommit 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void afterCommit(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
/**
 * [상세 주석] afterCommit 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
@Override
                public void afterCommit() {
                    task.run();
                }
            });
            return;
        }
        task.run();
    }
/**
 * [상세 주석] normalizeConnectionStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeConnectionStatus(String status) {
        String normalized = status == null ? "" : status.trim().toUpperCase();
        if ("WAITING".equals(normalized) || "COMPLETED".equals(normalized) || "FAILED".equals(normalized)) {
            return normalized;
        }
        throw new ResponseStatusException(BAD_REQUEST, "연결 상태가 올바르지 않습니다.");
    }
/**
 * [상세 주석] ensurePendingRequest 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensurePendingRequest(AiMatchRequest request) {
        if (!"PENDING".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "이미 처리된 데이트 신청입니다.");
        }
    }
/**
 * [상세 주석] getParticipatingRequest 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchRequest 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
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
/**
 * [상세 주석] ensureMeetupProposalAllowed 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensureMeetupProposalAllowed(AiMatchRequest request) {
        if (!"ACCEPTED".equals(request.getStatus()) && !"PROPOSED".equals(request.getStatus())) {
            throw new ResponseStatusException(CONFLICT, "약속을 조율할 수 있는 상태가 아닙니다.");
        }
    }
/**
 * [상세 주석] trimRequired 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
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
/**
 * [상세 주석] fieldLabel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String fieldLabel(String field) {
        return switch (field) {
            case "nickname" -> "닉네임";
            case "gender" -> "성별";
            case "intro" -> "자기소개";
            case "pin" -> "비밀번호";
            case "phoneNumber" -> "전화번호";
            case "meetPlace" -> "만날 장소";
            case "requesterNickname" -> "신청자 닉네임";
            case "message" -> "메시지";
            default -> field;
        };
    }
/**
 * [상세 주석] trimOrNull 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
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
    private String trimOrNull(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
/**
 * [상세 주석] trimOptional 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String trimOptional(String value, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(BAD_REQUEST, "입력값은 최대 " + maxLength + "자 이하로 입력해 주세요.");
        }
        return trimmed;
    }
/**
 * [상세 주석] getOrCreatePhoneUsageForUpdate 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: AiMatchPhoneUsage 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private AiMatchPhoneUsage getOrCreatePhoneUsageForUpdate(String phoneNumberKey) {
        return phoneUsageRepository.findByPhoneNumberForUpdate(phoneNumberKey)
                .orElseGet(() -> phoneUsageRepository.saveAndFlush(new AiMatchPhoneUsage(phoneNumberKey)));
    }
/**
 * [상세 주석] ensurePhoneCanRegister 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensurePhoneCanRegister(AiMatchPhoneUsage phoneUsage) {
        if (phoneUsage.isBlocked()) {
            throw new ResponseStatusException(CONFLICT, "삭제된 프로필의 전화번호는 다시 가입할 수 없습니다.");
        }
    }
/**
 * [상세 주석] ensurePhoneCanGenerateImage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensurePhoneCanGenerateImage(AiMatchPhoneUsage phoneUsage) {
        ensurePhoneCanRegister(phoneUsage);
        if (phoneUsage.getSuccessfulImageConversionCount() >= MAX_SUCCESSFUL_IMAGE_CONVERSIONS_PER_PHONE) {
            throw new ResponseStatusException(CONFLICT, "이 전화번호는 AI 이미지 변환 가능 횟수를 모두 사용했습니다.");
        }
    }
/**
 * [상세 주석] ensurePhoneNumberNotDeleted 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensurePhoneNumberNotDeleted(String phoneNumberKey) {
        if (isPhoneNumberDeleted(phoneNumberKey)) {
            throw new ResponseStatusException(CONFLICT, "삭제된 프로필의 전화번호는 다시 가입할 수 없습니다.");
        }
    }
/**
 * [상세 주석] blockPhoneNumber 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void blockPhoneNumber(String phoneNumber) {
        String phoneNumberKey = phoneNumberKeyFromStored(phoneNumber);
        if (phoneNumberKey == null) {
            return;
        }
        getOrCreatePhoneUsageForUpdate(phoneNumberKey).block();
    }
/**
 * [상세 주석] ensurePhoneNumberAvailable 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void ensurePhoneNumberAvailable(String phoneNumberKey, Long profileId) {
        if (isPhoneNumberInUse(phoneNumberKey, profileId)) {
            throw new ResponseStatusException(CONFLICT, "이미 사용 중인 전화번호입니다.");
        }
    }
/**
 * [상세 주석] isPhoneNumberInUse 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private boolean isPhoneNumberInUse(String phoneNumberKey, Long profileId) {
        return profileRepository.findAllByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                .filter(profile -> profileId == null || !profile.getId().equals(profileId))
                .map(profile -> phoneNumberKeyFromStored(profile.getPhoneNumber()))
                .anyMatch(phoneNumberKey::equals);
    }
/**
 * [상세 주석] isPhoneNumberDeleted 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private boolean isPhoneNumberDeleted(String phoneNumberKey) {
        return profileRepository.findAll().stream()
                .filter(profile -> "DELETED".equals(profile.getStatus()))
                .map(profile -> phoneNumberKeyFromStored(profile.getPhoneNumber()))
                .anyMatch(phoneNumberKey::equals);
    }
/**
 * [상세 주석] normalizePhoneNumberKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizePhoneNumberKey(String value, boolean required) {
        String normalized = normalizePhoneNumber(value, required);
        if (normalized == null) {
            return null;
        }
        return canonicalPhoneNumberKey(normalized.replaceAll("\\D", ""));
    }
/**
 * [상세 주석] phoneNumberKeyFromStored 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String phoneNumberKeyFromStored(String value) {
        String digitsOnly = value == null ? "" : value.replaceAll("\\D", "");
        return digitsOnly.isBlank() ? null : canonicalPhoneNumberKey(digitsOnly);
    }
/**
 * [상세 주석] canonicalPhoneNumberKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String canonicalPhoneNumberKey(String digitsOnly) {
        if (digitsOnly.startsWith("82") && digitsOnly.length() >= 10) {
            return "0" + digitsOnly.substring(2);
        }
        return digitsOnly;
    }
/**
 * [상세 주석] normalizePhoneNumber 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] ImageFileDeleteResult 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record ImageFileDeleteResult(int deletedCount, int failedCount) {
    }
}
