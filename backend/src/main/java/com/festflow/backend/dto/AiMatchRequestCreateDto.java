package com.festflow.backend.dto;

public record AiMatchRequestCreateDto(
        String requesterNickname,
        String meetPlace,
        String message
) {
}
