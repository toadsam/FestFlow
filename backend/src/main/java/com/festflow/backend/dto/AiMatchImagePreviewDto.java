package com.festflow.backend.dto;

public record AiMatchImagePreviewDto(
        String originalImageUrl,
        String generatedImageUrl
) {
}
