package com.festflow.backend.dto;

import java.util.List;

public record SimulationPatchRequestDto(
        Integer tickSeconds,
        Integer jitterPercent,
        List<SimulationBoothPatchDto> booths
) {
}
