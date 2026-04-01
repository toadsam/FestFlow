package com.festflow.backend.service;

import com.festflow.backend.dto.GpsLogRequestDto;
import com.festflow.backend.dto.GpsLogResponseDto;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.repository.GpsLogRepository;
import org.springframework.stereotype.Service;

@Service
public class GpsService {

    private final GpsLogRepository gpsLogRepository;

    public GpsService(GpsLogRepository gpsLogRepository) {
        this.gpsLogRepository = gpsLogRepository;
    }

    public GpsLogResponseDto saveGpsLog(GpsLogRequestDto requestDto) {
        GpsLog saved = gpsLogRepository.save(new GpsLog(requestDto.latitude(), requestDto.longitude()));
        return new GpsLogResponseDto(saved.getId(), saved.getCreatedAt(), "GPS \uB85C\uADF8\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }
}

