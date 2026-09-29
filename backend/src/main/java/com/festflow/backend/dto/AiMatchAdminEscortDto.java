package com.festflow.backend.dto;

/**
 * 대기 장소 → 부스 안내 단계 바꾸기. side: REQUESTER / PROFILE.
 * stage: NONE(아직) · ARRIVED(대기 장소 도착) · DEPARTED(스태프 출발) · PICKED_UP(스태프와 만남) · AT_BOOTH(부스 도착).
 */
public record AiMatchAdminEscortDto(
        String side,
        String stage
) {
}
