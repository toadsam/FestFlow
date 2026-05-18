package com.festflow.backend.dto;

import java.time.LocalDateTime;

public record AiMatchRequestResponseDto(
        Long id,
        Long profileId,
        String profileNickname,
        Long requesterProfileId,
        String requesterNickname,
        String meetPlace,
        String message,
        String status,
        String statusReason,
        String meetupPlace,
        LocalDateTime meetupAt,
        Long meetupProposerProfileId,
        String meetupProposerNickname,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
