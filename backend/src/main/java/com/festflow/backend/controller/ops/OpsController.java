package com.festflow.backend.controller.ops;

import com.festflow.backend.dto.BoothLiveStatusRequestDto;
import com.festflow.backend.dto.BoothReservationConfigRequestDto;
import com.festflow.backend.dto.BoothReservationDto;
import com.festflow.backend.dto.BoothReservationStateDto;
import com.festflow.backend.dto.BoothReorderRequestDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.EventUpsertRequestDto;
import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.NoticeUpsertRequestDto;
import com.festflow.backend.dto.OpsBoothBootstrapDto;
import com.festflow.backend.dto.OpsMasterBootstrapDto;
import com.festflow.backend.dto.ReservationCheckInByTokenRequestDto;
import com.festflow.backend.service.AdminActionService;
import com.festflow.backend.service.AdminDashboardService;
import com.festflow.backend.service.AuditLogService;
import com.festflow.backend.service.BoothService;
import com.festflow.backend.service.EventService;
import com.festflow.backend.service.NoticeService;
import com.festflow.backend.service.ReservationService;
import com.festflow.backend.service.stream.StreamService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.FORBIDDEN;

@RestController
@RequestMapping("/api/ops")
public class OpsController {

    private final BoothService boothService;
    private final EventService eventService;
    private final NoticeService noticeService;
    private final AdminActionService adminActionService;
    private final AdminDashboardService adminDashboardService;
    private final AuditLogService auditLogService;
    private final StreamService streamService;
    private final ReservationService reservationService;

    public OpsController(
            BoothService boothService,
            EventService eventService,
            NoticeService noticeService,
            AdminActionService adminActionService,
            AdminDashboardService adminDashboardService,
            AuditLogService auditLogService,
            StreamService streamService,
            ReservationService reservationService
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
        this.adminActionService = adminActionService;
        this.adminDashboardService = adminDashboardService;
        this.auditLogService = auditLogService;
        this.streamService = streamService;
        this.reservationService = reservationService;
    }

    @GetMapping("/master/bootstrap")
    public OpsMasterBootstrapDto masterBootstrap() {
        return new OpsMasterBootstrapDto(
                boothService.getAllBooths(),
                eventService.getAllEvents(),
                noticeService.getAllNotices(),
                adminDashboardService.getKpis(),
                auditLogService.getRecentLogs()
        );
    }

    @PostMapping("/master/notices")
    public NoticeResponseDto createNotice(@Valid @RequestBody NoticeUpsertRequestDto requestDto, Authentication authentication) {
        NoticeResponseDto created = noticeService.createNotice(requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_CREATE", "NOTICE", created.id(), created.title());
        return created;
    }

    @PutMapping("/master/notices/{id}")
    public NoticeResponseDto updateNotice(
            @PathVariable Long id,
            @Valid @RequestBody NoticeUpsertRequestDto requestDto,
            Authentication authentication
    ) {
        NoticeResponseDto updated = noticeService.updateNotice(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_UPDATE", "NOTICE", id, updated.title());
        return updated;
    }

    @DeleteMapping("/master/notices/{id}")
    public void deleteNotice(@PathVariable Long id, Authentication authentication) {
        noticeService.deleteNotice(id);
        auditLogService.log(authentication.getName(), "OPS_MASTER_DELETE", "NOTICE", id, "delete notice");
    }

    @PostMapping("/master/events")
    public EventResponseDto createEvent(@Valid @RequestBody EventUpsertRequestDto requestDto, Authentication authentication) {
        EventResponseDto created = eventService.createEvent(requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_CREATE", "EVENT", created.id(), created.title());
        streamService.publishEvents(eventService.getAllEvents());
        return created;
    }

    @PutMapping("/master/events/{id}")
    public EventResponseDto updateEvent(
            @PathVariable Long id,
            @Valid @RequestBody EventUpsertRequestDto requestDto,
            Authentication authentication
    ) {
        EventResponseDto updated = eventService.updateEvent(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_UPDATE", "EVENT", id, updated.title());
        streamService.publishEvents(eventService.getAllEvents());
        return updated;
    }

    @DeleteMapping("/master/events/{id}")
    public void deleteEvent(@PathVariable Long id, Authentication authentication) {
        eventService.deleteEvent(id);
        auditLogService.log(authentication.getName(), "OPS_MASTER_DELETE", "EVENT", id, "delete event");
        streamService.publishEvents(eventService.getAllEvents());
    }

    @PostMapping("/master/booths")
    public BoothResponseDto createBooth(@Valid @RequestBody BoothUpsertRequestDto requestDto, Authentication authentication) {
        BoothResponseDto created = boothService.createBooth(requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_CREATE", "BOOTH", created.id(), created.name());
        streamService.publishBooths(boothService.getAllBooths());
        return created;
    }

    @PutMapping("/master/booths/{id}")
    public BoothResponseDto updateBooth(
            @PathVariable Long id,
            @Valid @RequestBody BoothUpsertRequestDto requestDto,
            Authentication authentication
    ) {
        BoothResponseDto updated = boothService.updateBooth(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_UPDATE", "BOOTH", id, updated.name());
        streamService.publishBooths(boothService.getAllBooths());
        return updated;
    }

    @PutMapping("/master/booths/reorder")
    public void reorderBooths(@RequestBody BoothReorderRequestDto requestDto, Authentication authentication) {
        boothService.reorderBooths(requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_REORDER", "BOOTH", null, "reorder booths");
        streamService.publishBooths(boothService.getAllBooths());
    }

    @DeleteMapping("/master/booths/{id}")
    public void deleteBooth(@PathVariable Long id, Authentication authentication) {
        boothService.deleteBooth(id);
        auditLogService.log(authentication.getName(), "OPS_MASTER_DELETE", "BOOTH", id, "delete booth");
        streamService.publishBooths(boothService.getAllBooths());
    }

    @PutMapping("/master/booths/{id}/live-status")
    public BoothResponseDto updateMasterBoothLiveStatus(
            @PathVariable Long id,
            @RequestBody BoothLiveStatusRequestDto requestDto,
            Authentication authentication
    ) {
        BoothResponseDto updated = boothService.updateLiveStatus(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_LIVE_STATUS", "BOOTH", id, "update live status");
        streamService.publishBooths(boothService.getAllBooths());
        return updated;
    }

    @PostMapping("/master/actions/congestion-relief-notice")
    public NoticeResponseDto publishCongestionReliefNotice(Authentication authentication) {
        NoticeResponseDto created = adminActionService.publishCongestionReliefNotice();
        auditLogService.log(authentication.getName(), "OPS_MASTER_ACTION", "NOTICE", created.id(), "congestion relief notice");
        return created;
    }

    @PostMapping("/master/actions/events/{eventId}/start-notice")
    public NoticeResponseDto publishEventStartNotice(@PathVariable Long eventId, Authentication authentication) {
        NoticeResponseDto created = adminActionService.publishEventStartNotice(eventId);
        auditLogService.log(authentication.getName(), "OPS_MASTER_ACTION", "NOTICE", created.id(), "event start notice");
        return created;
    }

    @GetMapping("/booth/{id}/bootstrap")
    public OpsBoothBootstrapDto boothBootstrap(@PathVariable Long id, Authentication authentication) {
        ensureBoothAccess(authentication, id);
        return new OpsBoothBootstrapDto(
                boothService.getBoothById(id),
                boothService.getCongestionByBoothId(id),
                reservationService.getBoothReservationState(id, null)
        );
    }

    @PutMapping("/booth/{id}/live-status")
    public BoothResponseDto updateBoothLiveStatus(
            @PathVariable Long id,
            @RequestBody BoothLiveStatusRequestDto requestDto,
            Authentication authentication
    ) {
        ensureBoothAccess(authentication, id);
        BoothResponseDto updated = boothService.updateLiveStatus(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_BOOTH_LIVE_STATUS", "BOOTH", id, "update own booth live status");
        streamService.publishBooths(boothService.getAllBooths());
        return updated;
    }

    @GetMapping("/booth/{id}/reservations")
    public BoothReservationStateDto getBoothReservations(@PathVariable Long id, Authentication authentication) {
        ensureBoothAccess(authentication, id);
        return reservationService.getBoothReservationState(id, null);
    }

    @PutMapping("/booth/{id}/reservations/config")
    public BoothReservationStateDto upsertBoothReservationConfig(
            @PathVariable Long id,
            @Valid @RequestBody BoothReservationConfigRequestDto requestDto,
            Authentication authentication
    ) {
        ensureBoothAccess(authentication, id);
        BoothReservationStateDto updated = reservationService.upsertBoothReservationConfig(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_BOOTH_RESERVATION_CONFIG", "BOOTH", id, "update reservation config");
        return updated;
    }

    @PostMapping("/booth/{id}/reservations/{reservationId}/check-in")
    public BoothReservationDto checkInBoothReservation(
            @PathVariable Long id,
            @PathVariable Long reservationId,
            Authentication authentication
    ) {
        ensureBoothAccess(authentication, id);
        BoothReservationDto checkedIn = reservationService.checkIn(id, reservationId);
        auditLogService.log(authentication.getName(), "OPS_BOOTH_RESERVATION_CHECKIN", "BOOTH", id, "reservation " + reservationId);
        return checkedIn;
    }

    @PostMapping("/booth/{id}/reservations/check-in/by-token")
    public BoothReservationDto checkInBoothReservationByToken(
            @PathVariable Long id,
            @Valid @RequestBody ReservationCheckInByTokenRequestDto requestDto,
            Authentication authentication
    ) {
        ensureBoothAccess(authentication, id);
        BoothReservationDto checkedIn = reservationService.checkInByToken(id, requestDto.token());
        auditLogService.log(authentication.getName(), "OPS_BOOTH_RESERVATION_CHECKIN_TOKEN", "BOOTH", id, "token check-in");
        return checkedIn;
    }

    private void ensureBoothAccess(Authentication authentication, Long requestedBoothId) {
        boolean isMaster = authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_OPS_MASTER".equals(a.getAuthority()));
        if (isMaster) {
            return;
        }

        Object detail = authentication.getDetails();
        if (!(detail instanceof Long allowedBoothId) || !allowedBoothId.equals(requestedBoothId)) {
            throw new ResponseStatusException(FORBIDDEN, "No permission for this booth.");
        }
    }
}
