package com.festflow.backend.dto;

public record AiMatchProfileUpdateDto(
        String currentNickname,
        String nickname,
        String gender,
        String intro,
        String meetPlace,
        String pin
) {
}
