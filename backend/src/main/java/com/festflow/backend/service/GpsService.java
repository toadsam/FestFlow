package com.festflow.backend.service;

import com.festflow.backend.dto.GpsLogRequestDto;
import com.festflow.backend.dto.GpsLogResponseDto;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.repository.GpsLogRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.stereotype.Service;

@Service
public class GpsService {

    private final GpsLogRepository gpsLogRepository;
    private final BoothService boothService;
    private final StreamService streamService;

    public GpsService(GpsLogRepository gpsLogRepository, BoothService boothService, StreamService streamService) {
        this.gpsLogRepository = gpsLogRepository;
        this.boothService = boothService;
        this.streamService = streamService;
    }

    public GpsLogResponseDto saveGpsLog(GpsLogRequestDto requestDto) {
        GpsLog saved = gpsLogRepository.save(new GpsLog(requestDto.latitude(), requestDto.longitude()));
        streamService.publishCongestion(boothService.getAllCongestions());
        return new GpsLogResponseDto(saved.getId(), saved.getCreatedAt(), "GPS \uB85C\uADF8\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }
}
