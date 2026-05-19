package com.festflow.backend.dto;

public record AiMatchProfileUpdateDto(
        String currentNickname,
        String nickname,
        String gender,
        String intro,
        String phoneNumber,
        String meetPlace,
        String originalImageUrl,
        String generatedImageUrl,
        String pin
) {
}
