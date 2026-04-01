package com.festflow.backend.controller.admin;

import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.service.AdminActionService;
import com.festflow.backend.service.AuditLogService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/actions")
public class AdminActionController {

    private final AdminActionService adminActionService;
    private final AuditLogService auditLogService;

    public AdminActionController(AdminActionService adminActionService, AuditLogService auditLogService) {
        this.adminActionService = adminActionService;
        this.auditLogService = auditLogService;
    }

    @PostMapping("/congestion-relief-notice")
    public NoticeResponseDto publishCongestionReliefNotice(Authentication authentication) {
        NoticeResponseDto notice = adminActionService.publishCongestionReliefNotice();
        auditLogService.log(authentication.getName(), "QUICK_ACTION", "NOTICE", notice.id(), "?쇱옟 ?꾪솕 ?덈궡 ?먮룞 諛쒗뻾");
        return notice;
    }

    @PostMapping("/events/{eventId}/start-notice")
    public NoticeResponseDto publishEventStartNotice(@PathVariable Long eventId, Authentication authentication) {
        NoticeResponseDto notice = adminActionService.publishEventStartNotice(eventId);
        auditLogService.log(authentication.getName(), "QUICK_ACTION", "NOTICE", notice.id(), "怨듭뿰 ?쒖옉 ?덈궡 諛쒗뻾");
        return notice;
    }
}
