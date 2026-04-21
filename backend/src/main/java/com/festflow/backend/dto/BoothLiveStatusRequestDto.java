package com.festflow.backend.dto;

public record BoothLiveStatusRequestDto(
        Integer estimatedWaitMinutes,
        Integer remainingStock,
        String liveStatusMessage,
        String boothIntro,
        String menuImageUrl,
        String menuBoardJson
) {
}
