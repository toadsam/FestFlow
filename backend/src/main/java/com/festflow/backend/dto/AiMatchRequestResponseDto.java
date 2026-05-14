package com.festflow.backend.dto;

import java.time.LocalDateTime;

public record AiMatchRequestResponseDto(
        Long id,
        Long profileId,
        String profileNickname,
        String requesterNickname,
        String meetPlace,
        String message,
        LocalDateTime createdAt
) {
}
