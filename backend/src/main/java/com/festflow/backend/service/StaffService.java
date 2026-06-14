package com.festflow.backend.service;

import com.festflow.backend.dto.AdminStaffUpdateRequestDto;
import com.festflow.backend.dto.StaffBootstrapDto;
import com.festflow.backend.dto.StaffLoginRequestDto;
import com.festflow.backend.dto.StaffLoginResponseDto;
import com.festflow.backend.dto.StaffMemberResponseDto;
import com.festflow.backend.dto.StaffStatusUpdateRequestDto;
import com.festflow.backend.entity.StaffMember;
import com.festflow.backend.entity.StaffSession;
import com.festflow.backend.entity.StaffStatus;
import com.festflow.backend.repository.StaffMemberRepository;
import com.festflow.backend.repository.StaffSessionRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;
/**
 * [서비스 상세 주석] 스태프 로그인, 세션, 상태 관리를 처리합니다.
 * 이 클래스의 핵심은 관리자와 별도의 스태프 인증 흐름으로 현장 운영 기능을 분리합니다.
 * 주요 관심사는 DB 조회/저장, SSE 실시간 갱신입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class StaffService {

    private static final List<String> DEMO_STAFF_NAMES = List.of(
            "강승완",
            "고나연",
            "고명범",
            "곽유나",
            "박종현",
            "권도희",
            "권태완",
            "김규민",
            "김나윤",
            "김민서",
            "김정연",
            "김정우",
            "김찬호",
            "김하은",
            "늑구",
            "맹쥰성",
            "정재훈"
    );
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final StaffMemberRepository staffMemberRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final StaffSessionRepository staffSessionRepository;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final PasswordEncoder passwordEncoder;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final NoticeService noticeService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final StreamService streamService;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final boolean demoLoginEnabled;
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

    public StaffService(
            StaffMemberRepository staffMemberRepository,
            StaffSessionRepository staffSessionRepository,
            PasswordEncoder passwordEncoder,
            NoticeService noticeService,
            BoothService boothService,
            StreamService streamService,
            @Value("${app.staff.demo-login.enabled:false}") boolean demoLoginEnabled
    ) {
        this.staffMemberRepository = staffMemberRepository;
        this.staffSessionRepository = staffSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.noticeService = noticeService;
        this.boothService = boothService;
        this.streamService = streamService;
        this.demoLoginEnabled = demoLoginEnabled;
    }
/**
 * [상세 주석] login 메서드는 로그인 정보를 검증하고 인증 결과를 반환합니다.
 * 한줄 요약: 로그인 정보를 검증하고 이후 요청에 사용할 인증 정보를 반환하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: StaffLoginResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public StaffLoginResponseDto login(StaffLoginRequestDto requestDto) {
        String normalizedNo = requestDto.staffNo().trim().toUpperCase();
        String pin = requestDto.pin().trim();
        DemoStaff demoStaff = resolveDemoStaffCredentials(normalizedNo, pin);
        if (demoStaff != null) {
            LocalDateTime expiresAt = LocalDateTime.now().plusHours(12);
            return new StaffLoginResponseDto(createDemoStaffToken(demoStaff.number(), expiresAt), expiresAt, toDemoDto(demoStaff));
        }

        StaffMember member = staffMemberRepository.findByStaffNoIgnoreCase(normalizedNo)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid staff credentials."));

        if (!matchesStaffPin(pin, member)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid staff credentials.");
        }

        LocalDateTime expiresAt = LocalDateTime.now().plusHours(12);
        String token = createStatelessStaffToken(member, expiresAt);

        return new StaffLoginResponseDto(token, expiresAt, toDto(member));
    }
/**
 * [상세 주석] bootstrap 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffBootstrapDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public StaffBootstrapDto bootstrap(String staffToken) {
        DemoStaff demoStaff = resolveDemoStaffToken(staffToken);
        if (demoStaff != null) {
            return new StaffBootstrapDto(
                    toDemoDto(demoStaff),
                    getDemoStaffMembers(),
                    noticeService.getActiveNotices(),
                    boothService.getAllBooths()
            );
        }

        StaffMember me = requireStaffByToken(staffToken);
        return new StaffBootstrapDto(
                toDto(me),
                getAllStaffMembers(),
                noticeService.getActiveNotices(),
                boothService.getAllBooths()
        );
    }
/**
 * [상세 주석] getAllStaffMembers 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 여러 데이터를 조회해 목록 형태로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<StaffMemberResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional(readOnly = true)
    public List<StaffMemberResponseDto> getAllStaffMembers() {
        return staffMemberRepository.findAll().stream()
                .sorted(Comparator.comparing(StaffMember::getStaffNo))
                .map(this::toDto)
                .toList();
    }
/**
 * [상세 주석] updateMyStatus 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    @Transactional
    public StaffMemberResponseDto updateMyStatus(String staffToken, StaffStatusUpdateRequestDto requestDto) {
        DemoStaff demoStaff = resolveDemoStaffToken(staffToken);
        if (demoStaff != null) {
            StaffStatus status = parseStatus(requestDto.status(), StaffStatus.ON_DUTY);
            return toDemoDto(demoStaff, status, normalizeText(requestDto.currentTask(), 250, "입구 동선 안내"));
        }

        StaffMember me = requireStaffByToken(staffToken);
        StaffStatus nextStatus = parseStatus(requestDto.status(), me.getStatus());
        String nextTask = normalizeText(requestDto.currentTask(), 250, me.getCurrentTask());
        String nextNote = normalizeText(requestDto.currentNote(), 1000, me.getCurrentNote());
        boolean nextLocationSharingEnabled = requestDto.locationSharingEnabled() != null
                ? requestDto.locationSharingEnabled()
                : Boolean.TRUE.equals(me.getLocationSharingEnabled());
        Double nextLatitude = requestDto.latitude() != null ? requestDto.latitude() : me.getLatitude();
        Double nextLongitude = requestDto.longitude() != null ? requestDto.longitude() : me.getLongitude();
        if (!nextLocationSharingEnabled) {
            nextLatitude = null;
            nextLongitude = null;
        }

        me.setLocationSharingEnabled(nextLocationSharingEnabled);
        me.updateRuntime(nextStatus, nextTask, nextNote, nextLatitude, nextLongitude, LocalDateTime.now());
        StaffMember saved = staffMemberRepository.save(me);
        streamService.publishStaff(getAllStaffMembers());
        return toDto(saved);
    }
/**
 * [상세 주석] updateByAdmin 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public StaffMemberResponseDto updateByAdmin(Long staffId, AdminStaffUpdateRequestDto requestDto) {
        StaffMember member = staffMemberRepository.findById(staffId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Staff member not found."));

        String nextName = normalizeText(requestDto.name(), 80, member.getName());
        String nextTeam = normalizeText(requestDto.team(), 40, member.getTeam());
        StaffStatus nextStatus = parseStatus(requestDto.status(), member.getStatus());
        String nextTask = normalizeText(requestDto.currentTask(), 250, member.getCurrentTask());
        String nextNote = normalizeText(requestDto.currentNote(), 1000, member.getCurrentNote());
        Double nextLatitude = requestDto.latitude() != null ? requestDto.latitude() : member.getLatitude();
        Double nextLongitude = requestDto.longitude() != null ? requestDto.longitude() : member.getLongitude();

        member.setName(nextName == null || nextName.isBlank() ? member.getName() : nextName);
        member.setTeam(nextTeam == null || nextTeam.isBlank() ? member.getTeam() : nextTeam);
        member.setAssignedBoothId(requestDto.assignedBoothId());
        member.updateRuntime(nextStatus, nextTask, nextNote, nextLatitude, nextLongitude, LocalDateTime.now());

        StaffMember saved = staffMemberRepository.save(member);
        streamService.publishStaff(getAllStaffMembers());
        return toDto(saved);
    }
/**
 * [상세 주석] logout 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public void logout(String staffToken) {
        if (staffToken == null || staffToken.isBlank()) {
            return;
        }
        if (resolveDemoStaffToken(staffToken) != null) {
            return;
        }
        staffSessionRepository.findByToken(staffToken).ifPresent(staffSessionRepository::delete);
    }
/**
 * [상세 주석] authenticateByToken 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public StaffMemberResponseDto authenticateByToken(String staffToken) {
        DemoStaff demoStaff = resolveDemoStaffToken(staffToken);
        if (demoStaff != null) {
            return toDemoDto(demoStaff);
        }
        return toDto(requireStaffByToken(staffToken));
    }
/**
 * [상세 주석] requireStaffByToken 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMember 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 삭제 대상이 확인되면 Repository를 통해 DB에서 제거합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    private StaffMember requireStaffByToken(String staffToken) {
        if (staffToken == null || staffToken.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "Staff token is required.");
        }

        StaffMember statelessMember = resolveStatelessStaffToken(staffToken);
        if (statelessMember != null) {
            return statelessMember;
        }

        LocalDateTime now = LocalDateTime.now();
        StaffSession session = staffSessionRepository.findByToken(staffToken)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid staff token."));
        if (session.getExpiresAt().isBefore(now)) {
            staffSessionRepository.delete(session);
            throw new ResponseStatusException(UNAUTHORIZED, "Staff session expired.");
        }

        session.touch(now);
        staffSessionRepository.save(session);
        return session.getStaffMember();
    }
/**
 * [상세 주석] matchesStaffPin 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean matchesStaffPin(String rawPin, StaffMember member) {
        try {
            return passwordEncoder.matches(rawPin, member.getPinHash());
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
/**
 * [상세 주석] resolveDemoStaffCredentials 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: DemoStaff 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private DemoStaff resolveDemoStaffCredentials(String staffNo, String pin) {
        if (!demoLoginEnabled || staffNo == null || pin == null || !staffNo.equals(pin)) {
            return null;
        }
        return parseDemoStaffNumber(staffNo);
    }
/**
 * [상세 주석] resolveDemoStaffToken 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: DemoStaff 타입 값을 반환합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private DemoStaff resolveDemoStaffToken(String token) {
        if (!demoLoginEnabled || token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("-", 5);
        if (parts.length != 5 || !"demo".equals(parts[0]) || !"staff".equals(parts[1])) {
            return null;
        }
        try {
            long expiresAtMillis = Long.parseLong(parts[3]);
            if (System.currentTimeMillis() > expiresAtMillis) {
                throw new ResponseStatusException(UNAUTHORIZED, "Staff session expired.");
            }
            return parseDemoStaffNumber(parts[2]);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid staff token.");
        }
    }
/**
 * [상세 주석] parseDemoStaffNumber 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: DemoStaff 타입 값을 반환합니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private DemoStaff parseDemoStaffNumber(String rawNumber) {
        try {
            int number = Integer.parseInt(rawNumber);
            if (number < 1 || number > DEMO_STAFF_NAMES.size()) {
                return null;
            }
            return new DemoStaff(number, DEMO_STAFF_NAMES.get(number - 1));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
/**
 * [상세 주석] createDemoStaffToken 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String createDemoStaffToken(int staffNo, LocalDateTime expiresAt) {
        long epochMillis = expiresAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "demo-staff-" + staffNo + "-" + epochMillis + "-"
                + UUID.randomUUID().toString().replace("-", "");
    }
/**
 * [상세 주석] getDemoStaffMembers 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<StaffMemberResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<StaffMemberResponseDto> getDemoStaffMembers() {
        return java.util.stream.IntStream.rangeClosed(1, DEMO_STAFF_NAMES.size())
                .mapToObj(number -> toDemoDto(new DemoStaff(number, DEMO_STAFF_NAMES.get(number - 1))))
                .toList();
    }
/**
 * [상세 주석] toDemoDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private StaffMemberResponseDto toDemoDto(DemoStaff staff) {
        StaffStatus status = staff.number() % 5 == 1 ? StaffStatus.URGENT
                : staff.number() % 3 == 1 ? StaffStatus.MOVING
                : StaffStatus.ON_DUTY;
        return toDemoDto(staff, status, staff.number() % 2 == 1 ? "입구 동선 안내" : "현장 순찰");
    }
/**
 * [상세 주석] toDemoDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private StaffMemberResponseDto toDemoDto(DemoStaff staff, StaffStatus status, String task) {
        return new StaffMemberResponseDto(
                (long) staff.number(),
                String.valueOf(staff.number()),
                staff.name(),
                staff.number() % 2 == 1 ? "운영" : "안전",
                status.name(),
                toStatusLabel(status),
                task,
                "",
                null,
                null,
                null,
                true,
                LocalDateTime.now()
        );
    }
/**
 * [상세 주석] createStatelessStaffToken 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String createStatelessStaffToken(StaffMember member, LocalDateTime expiresAt) {
        long epochMillis = expiresAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "staff-" + member.getId() + "-" + epochMillis + "-"
                + UUID.randomUUID().toString().replace("-", "");
    }
/**
 * [상세 주석] resolveStatelessStaffToken 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMember 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    private StaffMember resolveStatelessStaffToken(String token) {
        String[] parts = token.split("-", 4);
        if (parts.length != 4 || !"staff".equals(parts[0])) {
            return null;
        }

        try {
            Long staffId = Long.parseLong(parts[1]);
            long expiresAtMillis = Long.parseLong(parts[2]);
            if (System.currentTimeMillis() > expiresAtMillis) {
                throw new ResponseStatusException(UNAUTHORIZED, "Staff session expired.");
            }
            return staffMemberRepository.findById(staffId)
                    .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid staff token."));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid staff token.");
        }
    }
/**
 * [상세 주석] parseStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffStatus 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private StaffStatus parseStatus(String input, StaffStatus fallback) {
        if (input == null || input.isBlank()) {
            return fallback;
        }

        String normalized = input.trim().toUpperCase();
        return switch (normalized) {
            case "STANDBY", "대기" -> StaffStatus.STANDBY;
            case "MOVING", "이동" -> StaffStatus.MOVING;
            case "ON_DUTY", "업무중", "업무", "WORKING" -> StaffStatus.ON_DUTY;
            case "URGENT", "긴급" -> StaffStatus.URGENT;
            default -> fallback;
        };
    }
/**
 * [상세 주석] normalizeText 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeText(String input, int maxLength, String fallback) {
        if (input == null) {
            return fallback;
        }
        String trimmed = input.trim();
        if (trimmed.isBlank()) {
            return "";
        }
        if (trimmed.length() > maxLength) {
            return trimmed.substring(0, maxLength);
        }
        return trimmed;
    }
/**
 * [상세 주석] toDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StaffMemberResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private StaffMemberResponseDto toDto(StaffMember member) {
        StaffStatus status = member.getStatus() != null ? member.getStatus() : StaffStatus.STANDBY;
        return new StaffMemberResponseDto(
                member.getId(),
                member.getStaffNo(),
                member.getName() != null ? member.getName() : "스태프",
                member.getTeam() != null ? member.getTeam() : "운영",
                status.name(),
                toStatusLabel(status),
                member.getCurrentTask(),
                member.getCurrentNote(),
                member.getAssignedBoothId(),
                member.getLatitude(),
                member.getLongitude(),
                Boolean.TRUE.equals(member.getLocationSharingEnabled()),
                member.getLastUpdatedAt()
        );
    }
/**
 * [상세 주석] toStatusLabel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String toStatusLabel(StaffStatus status) {
        return switch (status) {
            case STANDBY -> "대기";
            case MOVING -> "이동";
            case ON_DUTY -> "업무중";
            case URGENT -> "긴급";
        };
    }
/**
 * [상세 주석] DemoStaff 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record DemoStaff(int number, String name) {
    }
}
