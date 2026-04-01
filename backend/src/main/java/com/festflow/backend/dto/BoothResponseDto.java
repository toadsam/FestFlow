package com.festflow.backend.dto;

public record BoothResponseDto(
        Long id,
        String name,
        double latitude,
        double longitude,
        String description,
        Integer displayOrder,
        String imageUrl
) {
}

