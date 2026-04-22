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

    private final StaffMemberRepository staffMemberRepository;
    private final StaffSessionRepository staffSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final NoticeService noticeService;
    private final BoothService boothService;
    private final StreamService streamService;

    public StaffService(
            StaffMemberRepository staffMemberRepository,
            StaffSessionRepository staffSessionRepository,
            PasswordEncoder passwordEncoder,
            NoticeService noticeService,
            BoothService boothService,
            StreamService streamService
    ) {
        this.staffMemberRepository = staffMemberRepository;
        this.staffSessionRepository = staffSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.noticeService = noticeService;
        this.boothService = boothService;
        this.streamService = streamService;
    }

    @Transactional
    public StaffLoginResponseDto login(StaffLoginRequestDto requestDto) {
        String normalizedNo = requestDto.staffNo().trim().toUpperCase();
        StaffMember member = staffMemberRepository.findByStaffNoIgnoreCase(normalizedNo)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid staff credentials."));

        if (!passwordEncoder.matches(requestDto.pin().trim(), member.getPinHash())) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid staff credentials.");
        }

        LocalDateTime now = LocalDateTime.now();
        staffSessionRepository.deleteByExpiresAtBefore(now.minusMinutes(1));

        String token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        LocalDateTime expiresAt = now.plusHours(12);
        staffSessionRepository.save(new StaffSession(member, token, now, expiresAt));

        return new StaffLoginResponseDto(token, expiresAt, toDto(member));
    }

    @Transactional
    public StaffBootstrapDto bootstrap(String staffToken) {
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
        StaffMember me = requireStaffByToken(staffToken);
        StaffStatus nextStatus = parseStatus(requestDto.status(), me.getStatus());
        String nextTask = normalizeText(requestDto.currentTask(), 250, me.getCurrentTask());
        String nextNote = normalizeText(requestDto.currentNote(), 1000, me.getCurrentNote());
        Double nextLatitude = requestDto.latitude() != null ? requestDto.latitude() : me.getLatitude();
        Double nextLongitude = requestDto.longitude() != null ? requestDto.longitude() : me.getLongitude();

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
        staffSessionRepository.findByToken(staffToken).ifPresent(staffSessionRepository::delete);
    }

    private StaffMember requireStaffByToken(String staffToken) {
        if (staffToken == null || staffToken.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "Staff token is required.");
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
        return new StaffMemberResponseDto(
                member.getId(),
                member.getStaffNo(),
                member.getName(),
                member.getTeam(),
                member.getStatus().name(),
                toStatusLabel(member.getStatus()),
                member.getCurrentTask(),
                member.getCurrentNote(),
                member.getAssignedBoothId(),
                member.getLatitude(),
                member.getLongitude(),
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
}

