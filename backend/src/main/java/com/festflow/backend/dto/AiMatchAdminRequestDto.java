package com.festflow.backend.dto;

import java.time.LocalDateTime;

public record AiMatchAdminRequestDto(
        Long id,
        Long profileId,
        String profileNickname,
        String profilePhoneNumber,
        String profileOriginalImageUrl,
        String profileImageUrl,
        Long requesterProfileId,
        String requesterNickname,
        String requesterPhoneNumber,
        String requesterOriginalImageUrl,
        String requesterImageUrl,
        String meetPlace,
        String message,
        String status,
        String statusReason,
        String connectionStatus,
        String adminNote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
