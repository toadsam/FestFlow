package com.festflow.backend.dto;

public record BoothLiveStatusRequestDto(
        Integer estimatedWaitMinutes,
        Integer remainingStock,
        String liveStatusMessage
) {
}
