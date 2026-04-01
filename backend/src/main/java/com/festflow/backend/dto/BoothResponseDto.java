package com.festflow.backend.dto;

import java.time.LocalDateTime;

public record BoothResponseDto(
        Long id,
        String name,
        double latitude,
        double longitude,
        String description,
        Integer displayOrder,
        String imageUrl,
        Integer estimatedWaitMinutes,
        Integer remainingStock,
        String liveStatusMessage,
        LocalDateTime liveStatusUpdatedAt
) {
}

