package com.festflow.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record BoothUpsertRequestDto(
        @NotBlank String name,
        @NotNull Double latitude,
        @NotNull Double longitude,
        @NotBlank String description,
        Integer displayOrder,
        String imageUrl,
        Integer estimatedWaitMinutes,
        Integer remainingStock,
        String liveStatusMessage,
        String boothIntro,
        String menuImageUrl,
        String menuBoardJson
) {
}
