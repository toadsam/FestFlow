package com.festflow.backend.dto;

import jakarta.validation.constraints.NotNull;

public record GpsLogRequestDto(
        @NotNull Double latitude,
        @NotNull Double longitude
) {
}

