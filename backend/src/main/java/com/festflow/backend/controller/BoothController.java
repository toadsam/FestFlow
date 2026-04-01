package com.festflow.backend.controller;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.service.BoothService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/booths")
public class BoothController {

    private final BoothService boothService;

    public BoothController(BoothService boothService) {
        this.boothService = boothService;
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
}

