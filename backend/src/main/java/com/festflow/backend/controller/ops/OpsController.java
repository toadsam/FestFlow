package com.festflow.backend.controller.ops;

import com.festflow.backend.dto.BoothLiveStatusRequestDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.OpsBoothBootstrapDto;
import com.festflow.backend.dto.OpsMasterBootstrapDto;
import com.festflow.backend.service.AdminDashboardService;
import com.festflow.backend.service.AuditLogService;
import com.festflow.backend.service.BoothService;
import com.festflow.backend.service.EventService;
import com.festflow.backend.service.NoticeService;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final AdminDashboardService adminDashboardService;
    private final AuditLogService auditLogService;
    private final StreamService streamService;

    public OpsController(
            BoothService boothService,
            EventService eventService,
            NoticeService noticeService,
            AdminDashboardService adminDashboardService,
            AuditLogService auditLogService,
            StreamService streamService
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
        this.adminDashboardService = adminDashboardService;
        this.auditLogService = auditLogService;
        this.streamService = streamService;
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

    @PutMapping("/master/booths/{id}/live-status")
    public BoothResponseDto updateMasterBoothLiveStatus(
            @PathVariable Long id,
            @RequestBody BoothLiveStatusRequestDto requestDto,
            Authentication authentication
    ) {
        BoothResponseDto updated = boothService.updateLiveStatus(id, requestDto);
        auditLogService.log(authentication.getName(), "OPS_MASTER_LIVE_STATUS", "BOOTH", id, "대기/잔여/운영메모 갱신");
        streamService.publishBooths(boothService.getAllBooths());
        return updated;
    }

    @GetMapping("/booth/{id}/bootstrap")
    public OpsBoothBootstrapDto boothBootstrap(@PathVariable Long id, Authentication authentication) {
        ensureBoothAccess(authentication, id);
        return new OpsBoothBootstrapDto(
                boothService.getBoothById(id),
                boothService.getCongestionByBoothId(id)
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
        auditLogService.log(authentication.getName(), "OPS_BOOTH_LIVE_STATUS", "BOOTH", id, "담당 부스 실시간 정보 갱신");
        streamService.publishBooths(boothService.getAllBooths());
        return updated;
    }

    private void ensureBoothAccess(Authentication authentication, Long requestedBoothId) {
        boolean isMaster = authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_OPS_MASTER".equals(a.getAuthority()));
        if (isMaster) {
            return;
        }

        Object detail = authentication.getDetails();
        if (!(detail instanceof Long allowedBoothId) || !allowedBoothId.equals(requestedBoothId)) {
            throw new ResponseStatusException(FORBIDDEN, "해당 부스에 대한 권한이 없습니다.");
        }
    }
}

