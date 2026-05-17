package com.festflow.backend.dto;

import java.util.List;

public record AiMatchProfileAccessResponseDto(
        AiMatchProfileResponseDto profile,
        List<AiMatchRequestResponseDto> receivedRequests,
        List<AiMatchRequestResponseDto> sentRequests,
        List<AiMatchProfileResponseDto> profiles
) {
}
