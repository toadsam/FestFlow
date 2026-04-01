package com.festflow.backend.controller;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.security.JwtService;
import com.festflow.backend.service.BoothService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(BoothController.class)
@AutoConfigureMockMvc(addFilters = false)
class BoothControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BoothService boothService;

    @MockBean
    private JwtService jwtService;

    @Test
    void getBoothsReturnsList() throws Exception {
        Mockito.when(boothService.getAllBooths()).thenReturn(List.of(
                new BoothResponseDto(1L, "Booth A", 37.1, 127.1, "desc", 1, "img", 5, 20, "running", null)
        ));

        mockMvc.perform(get("/api/booths"))
                .andExpect(status().isOk());
    }

    @Test
    void getCongestionReturnsData() throws Exception {
        Mockito.when(boothService.getCongestionByBoothId(1L))
                .thenReturn(new CongestionResponseDto(1L, "Booth A", "보통", 4));

        mockMvc.perform(get("/api/booths/1/congestion"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nearbyUserCount").value(4));
    }
}
