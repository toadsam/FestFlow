package com.festflow.backend.dto;

public record BoothOrderItemDto(
        String name,
        Integer unitPrice,
        Integer quantity,
        Integer lineTotal
) {
}
