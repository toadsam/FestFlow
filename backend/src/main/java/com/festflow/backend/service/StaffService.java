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

    private final StaffMemberRepository staffMemberRepository;
    private final StaffSessionRepository staffSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final NoticeService noticeService;
    private final BoothService boothService;
    private final StreamService streamService;
    private final boolean demoLoginEnabled;

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

    @Transactional(readOnly = true)
    public List<StaffMemberResponseDto> getAllStaffMembers() {
        return staffMemberRepository.findAll().stream()
                .sorted(Comparator.comparing(StaffMember::getStaffNo))
                .map(this::toDto)
                .toList();
    }

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

    @Transactional
    public StaffMemberResponseDto authenticateByToken(String staffToken) {
        DemoStaff demoStaff = resolveDemoStaffToken(staffToken);
        if (demoStaff != null) {
            return toDemoDto(demoStaff);
        }
        return toDto(requireStaffByToken(staffToken));
    }

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

    private boolean matchesStaffPin(String rawPin, StaffMember member) {
        try {
            return passwordEncoder.matches(rawPin, member.getPinHash());
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private DemoStaff resolveDemoStaffCredentials(String staffNo, String pin) {
        if (!demoLoginEnabled || staffNo == null || pin == null || !staffNo.equals(pin)) {
            return null;
        }
        return parseDemoStaffNumber(staffNo);
    }

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

    private String createDemoStaffToken(int staffNo, LocalDateTime expiresAt) {
        long epochMillis = expiresAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "demo-staff-" + staffNo + "-" + epochMillis + "-"
                + UUID.randomUUID().toString().replace("-", "");
    }

    private List<StaffMemberResponseDto> getDemoStaffMembers() {
        return java.util.stream.IntStream.rangeClosed(1, DEMO_STAFF_NAMES.size())
                .mapToObj(number -> toDemoDto(new DemoStaff(number, DEMO_STAFF_NAMES.get(number - 1))))
                .toList();
    }

    private StaffMemberResponseDto toDemoDto(DemoStaff staff) {
        StaffStatus status = staff.number() % 5 == 1 ? StaffStatus.URGENT
                : staff.number() % 3 == 1 ? StaffStatus.MOVING
                : StaffStatus.ON_DUTY;
        return toDemoDto(staff, status, staff.number() % 2 == 1 ? "입구 동선 안내" : "현장 순찰");
    }

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

    private String createStatelessStaffToken(StaffMember member, LocalDateTime expiresAt) {
        long epochMillis = expiresAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "staff-" + member.getId() + "-" + epochMillis + "-"
                + UUID.randomUUID().toString().replace("-", "");
    }

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

    private String toStatusLabel(StaffStatus status) {
        return switch (status) {
            case STANDBY -> "대기";
            case MOVING -> "이동";
            case ON_DUTY -> "업무중";
            case URGENT -> "긴급";
        };
    }

    private record DemoStaff(int number, String name) {
    }
}
