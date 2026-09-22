package com.festflow.backend.dto;

import java.util.List;

public record AiMatchAdminOverviewDto(
        long activeProfileCount,
        long totalProfileCount,
        long totalRequestCount,
        long pendingRequestCount,
        long matchedRequestCount,
        List<AiMatchAdminProfileDto> profiles,
        List<AiMatchAdminRequestDto> requests,
        List<AiMatchReportDto> reports,
        long openReportCount,
        long pendingPhotoReviewCount
) {
}
