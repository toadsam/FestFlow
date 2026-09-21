package com.festflow.backend.dto;

import java.util.List;

public record AiMatchMeetupScheduleDto(
        String date,
        List<String> dates,
        String boothName,
        int totalSlots,
        List<AiMatchMeetupScheduleItemDto> items
) {
}
