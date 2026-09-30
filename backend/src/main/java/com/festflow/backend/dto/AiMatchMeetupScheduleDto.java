package com.festflow.backend.dto;

import java.util.List;

public record AiMatchMeetupScheduleDto(
        String date,
        List<String> dates,
        String boothName,
        int totalSlots,
        int slotMinutes,
        /** 시간표를 만든 서버 시각. 화면 시계와 어긋나도 남은 시간을 맞게 보여 주려고 준다. */
        java.time.LocalDateTime serverNow,
        List<AiMatchMeetupScheduleItemDto> items
) {
}
