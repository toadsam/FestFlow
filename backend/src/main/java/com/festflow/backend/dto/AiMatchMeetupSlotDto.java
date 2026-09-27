package com.festflow.backend.dto;

import java.time.LocalDateTime;

/** status: FREE(고를 수 있음) · HELD(다른 커플이 확정 대기 중) · TAKEN(확정됨) · PAST(지난 시간) · BUSY(두 사람 중 누군가의 다른 약속과 30분 안). mine 이면 내가 잡은 슬롯. */
public record AiMatchMeetupSlotDto(
        LocalDateTime startAt,
        String status,
        boolean mine
) {
}
