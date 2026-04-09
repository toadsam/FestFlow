package com.festflow.backend.dto;

import com.festflow.backend.entity.ReservationStatus;

import java.time.LocalDateTime;

public record BoothReservationDto(
        Long id,
        Long boothId,
        Long tableId,
        String tableName,
        String userKey,
        Integer seatCount,
        ReservationStatus status,
        LocalDateTime reservedAt,
        LocalDateTime expiresAt,
        LocalDateTime checkedInAt,
        LocalDateTime expiredAt
) {
}

