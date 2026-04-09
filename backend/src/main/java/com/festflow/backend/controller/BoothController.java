package com.festflow.backend.controller;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.BoothReservationDto;
import com.festflow.backend.dto.BoothReservationStateDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.ReservationCreateRequestDto;
import com.festflow.backend.service.BoothService;
import com.festflow.backend.service.ReservationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/booths")
public class BoothController {

    private final BoothService boothService;
    private final ReservationService reservationService;

    public BoothController(BoothService boothService, ReservationService reservationService) {
        this.boothService = boothService;
        this.reservationService = reservationService;
    }

    @GetMapping
    public List<BoothResponseDto> getBooths() {
        return boothService.getAllBooths();
    }

    @GetMapping("/{id}")
    public BoothResponseDto getBooth(@PathVariable Long id) {
        return boothService.getBoothById(id);
    }

    @GetMapping("/{id}/congestion")
    public CongestionResponseDto getCongestion(@PathVariable Long id) {
        return boothService.getCongestionByBoothId(id);
    }

    @GetMapping("/{id}/reservations")
    public BoothReservationStateDto getReservationState(@PathVariable Long id, @RequestParam(required = false) String userKey) {
        return reservationService.getBoothReservationState(id, userKey);
    }

    @PostMapping("/{id}/reservations")
    public BoothReservationDto createReservation(@PathVariable Long id, @Valid @RequestBody ReservationCreateRequestDto requestDto) {
        return reservationService.createReservation(id, requestDto);
    }
}

