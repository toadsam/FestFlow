package com.festflow.backend.dto;

import com.festflow.backend.entity.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record OrderCreateRequestDto(
        @NotBlank @Size(max = 40) String tableLabel,
        @NotEmpty @Valid List<OrderCreateItemDto> items,
        @NotBlank @Size(max = 60) String depositorName,
        @Size(max = 30) String phoneNumber,
        @Size(max = 500) String request,
        PaymentMethod paymentMethod
) {
}
