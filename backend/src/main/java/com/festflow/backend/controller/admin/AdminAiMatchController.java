package com.festflow.backend.controller.admin;

import com.festflow.backend.dto.AiMatchAdminOverviewDto;
import com.festflow.backend.dto.AiMatchAdminNoteUpdateDto;
import com.festflow.backend.dto.AiMatchAdminPhonePurgeRequestDto;
import com.festflow.backend.dto.AiMatchAdminPhonePurgeResponseDto;
import com.festflow.backend.dto.AiMatchAdminRequestDto;
import com.festflow.backend.dto.AiMatchConnectionStatusUpdateDto;
import com.festflow.backend.service.AiMatchService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ai-match")
public class AdminAiMatchController {

    private final AiMatchService aiMatchService;

    public AdminAiMatchController(AiMatchService aiMatchService) {
        this.aiMatchService = aiMatchService;
    }

    @GetMapping("/overview")
    public AiMatchAdminOverviewDto getOverview() {
        return aiMatchService.getAdminOverview();
    }

    @PutMapping("/requests/{requestId}/connection-status")
    public AiMatchAdminRequestDto updateConnectionStatus(
            @PathVariable Long requestId,
            @RequestBody AiMatchConnectionStatusUpdateDto requestDto
    ) {
        return aiMatchService.updateConnectionStatus(requestId, requestDto);
    }

    @PutMapping("/requests/{requestId}/admin-note")
    public AiMatchAdminRequestDto updateAdminNote(
            @PathVariable Long requestId,
            @RequestBody AiMatchAdminNoteUpdateDto requestDto
    ) {
        return aiMatchService.updateAdminNote(requestId, requestDto);
    }

    @DeleteMapping("/profiles/{profileId}")
    public void deleteProfile(@PathVariable Long profileId) {
        aiMatchService.deleteProfileByAdmin(profileId);
    }

    @PostMapping("/phone-purge")
    public AiMatchAdminPhonePurgeResponseDto purgeByPhoneNumber(
            @Valid @RequestBody AiMatchAdminPhonePurgeRequestDto requestDto
    ) {
        return aiMatchService.purgeByPhoneNumber(requestDto);
    }
}
