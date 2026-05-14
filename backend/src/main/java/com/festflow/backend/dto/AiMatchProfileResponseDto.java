package com.festflow.backend.dto;

import java.time.LocalDateTime;

public record AiMatchProfileResponseDto(
        Long id,
        String nickname,
        String gender,
        String intro,
        String meetPlace,
        String originalImageUrl,
        String generatedImageUrl,
        LocalDateTime createdAt
) {
}
