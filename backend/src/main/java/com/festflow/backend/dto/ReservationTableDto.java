package com.festflow.backend.dto;

public record ReservationTableDto(
        Long id,
        String tableName,
        Integer totalSeats,
        Integer availableSeats,
        Integer displayOrder
) {
}

