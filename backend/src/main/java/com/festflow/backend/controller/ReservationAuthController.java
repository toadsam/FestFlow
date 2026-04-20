package com.festflow.backend.controller;

import com.festflow.backend.dto.ReservationAuthSendCodeRequestDto;
import com.festflow.backend.dto.ReservationAuthSendCodeResponseDto;
import com.festflow.backend.dto.ReservationAuthVerifyRequestDto;
import com.festflow.backend.dto.ReservationAuthVerifyResponseDto;
import com.festflow.backend.service.ReservationAuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reservations/auth")
public class ReservationAuthController {

    private final ReservationAuthService reservationAuthService;

    public ReservationAuthController(ReservationAuthService reservationAuthService) {
        this.reservationAuthService = reservationAuthService;
    }

    @PostMapping("/send-code")
    public ReservationAuthSendCodeResponseDto sendCode(@Valid @RequestBody ReservationAuthSendCodeRequestDto requestDto) {
        return reservationAuthService.sendCode(requestDto.phoneNumber());
    }

    @PostMapping("/verify-code")
    public ReservationAuthVerifyResponseDto verifyCode(@Valid @RequestBody ReservationAuthVerifyRequestDto requestDto) {
        return reservationAuthService.verifyCode(requestDto.phoneNumber(), requestDto.code());
    }
}

