package com.festflow.backend.dto;

import java.time.LocalDateTime;

/** 운영진 시간표 한 줄. 누가 어디서 기다리는지, 확정인지 임시인지. */
public record AiMatchMeetupScheduleItemDto(
        LocalDateTime slotAt,
        boolean confirmed,
        LocalDateTime heldUntil,
        Long requestId,
        String connectionStatus,
        String requesterNickname,
        String requesterGender,
        String requesterPhoneNumber,
        String requesterWaitingPlace,
        String profileNickname,
        String profileGender,
        String profilePhoneNumber,
        String profileWaitingPlace
) {
}
