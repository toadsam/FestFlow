package com.festflow.backend.dto;

import java.util.List;

public record AiMatchMeetupSlotsDto(
        String date,
        List<String> dates,
        int slotMinutes,
        int holdMinutes,
        String boothName,
        List<AiMatchMeetupSlotDto> slots
) {
}
