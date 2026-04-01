package com.festflow.backend.service;

import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.dto.EventUpsertRequestDto;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

@Service
public class AdminImportService {

    private final BoothService boothService;
    private final EventService eventService;

    public AdminImportService(BoothService boothService, EventService eventService) {
        this.boothService = boothService;
        this.eventService = eventService;
    }

    public int importBoothsCsv(MultipartFile file) throws IOException {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (first) {
                    first = false;
                    continue;
                }
                String[] values = line.split(",", -1);
                if (values.length < 4) continue;
                boothService.createBooth(new BoothUpsertRequestDto(
                        values[0].trim(),
                        Double.parseDouble(values[1].trim()),
                        Double.parseDouble(values[2].trim()),
                        values[3].trim(),
                        null,
                        null,
                        null,
                        null,
                        null
                ));
                count++;
            }
        }
        return count;
    }

    public int importEventsCsv(MultipartFile file) throws IOException {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (first) {
                    first = false;
                    continue;
                }
                String[] values = line.split(",", -1);
                if (values.length < 3) continue;
                eventService.createEvent(new EventUpsertRequestDto(
                        values[0].trim(),
                        LocalDateTime.parse(values[1].trim()),
                        LocalDateTime.parse(values[2].trim())
                ));
                count++;
            }
        }
        return count;
    }
}
