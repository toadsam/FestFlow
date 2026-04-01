package com.festflow.backend.service;

import com.festflow.backend.dto.BoothLiveStatusRequestDto;
import com.festflow.backend.dto.BoothReorderRequestDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.GpsLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class BoothService {

    private static final double BOOTH_RADIUS_METERS = 80.0;

    private final BoothRepository boothRepository;
    private final GpsLogRepository gpsLogRepository;

    public BoothService(BoothRepository boothRepository, GpsLogRepository gpsLogRepository) {
        this.boothRepository = boothRepository;
        this.gpsLogRepository = gpsLogRepository;
    }

    public List<BoothResponseDto> getAllBooths() {
        return boothRepository.findAll().stream()
                .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                .map(this::toDto)
                .toList();
    }

    public BoothResponseDto getBoothById(Long boothId) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found"));

        return toDto(booth);
    }

    public BoothResponseDto createBooth(BoothUpsertRequestDto requestDto) {
        int nextOrder = requestDto.displayOrder() != null
                ? requestDto.displayOrder()
                : boothRepository.findTopByOrderByDisplayOrderDesc().map(Booth::getDisplayOrder).orElse(0) + 1;

        Booth saved = boothRepository.save(new Booth(
                requestDto.name(),
                requestDto.latitude(),
                requestDto.longitude(),
                requestDto.description(),
                nextOrder,
                requestDto.imageUrl() != null ? requestDto.imageUrl() : "https://picsum.photos/seed/festflow-default/800/450",
                requestDto.estimatedWaitMinutes(),
                requestDto.remainingStock(),
                requestDto.liveStatusMessage(),
                LocalDateTime.now()
        ));
        return toDto(saved);
    }

    public BoothResponseDto updateBooth(Long boothId, BoothUpsertRequestDto requestDto) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found"));

        booth.update(
                requestDto.name(),
                requestDto.latitude(),
                requestDto.longitude(),
                requestDto.description(),
                requestDto.displayOrder() != null ? requestDto.displayOrder() : booth.getDisplayOrder(),
                requestDto.imageUrl() != null ? requestDto.imageUrl() : booth.getImageUrl(),
                requestDto.estimatedWaitMinutes() != null ? requestDto.estimatedWaitMinutes() : booth.getEstimatedWaitMinutes(),
                requestDto.remainingStock() != null ? requestDto.remainingStock() : booth.getRemainingStock(),
                requestDto.liveStatusMessage() != null ? requestDto.liveStatusMessage() : booth.getLiveStatusMessage(),
                LocalDateTime.now()
        );

        return toDto(boothRepository.save(booth));
    }

    public BoothResponseDto updateBoothImage(Long boothId, String imageUrl) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found"));
        booth.setImageUrl(imageUrl);
        return toDto(boothRepository.save(booth));
    }

    public BoothResponseDto updateLiveStatus(Long boothId, BoothLiveStatusRequestDto requestDto) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found"));

        booth.setEstimatedWaitMinutes(requestDto.estimatedWaitMinutes());
        booth.setRemainingStock(requestDto.remainingStock());
        booth.setLiveStatusMessage(requestDto.liveStatusMessage());
        booth.setLiveStatusUpdatedAt(LocalDateTime.now());

        return toDto(boothRepository.save(booth));
    }

    public void reorderBooths(BoothReorderRequestDto requestDto) {
        int order = 1;
        for (Long id : requestDto.boothIds()) {
            Booth booth = boothRepository.findById(id)
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found: " + id));
            booth.setDisplayOrder(order++);
            boothRepository.save(booth);
        }
    }

    public void deleteBooth(Long boothId) {
        if (!boothRepository.existsById(boothId)) {
            throw new ResponseStatusException(NOT_FOUND, "Booth not found");
        }
        boothRepository.deleteById(boothId);
    }

    public CongestionResponseDto getCongestionByBoothId(Long boothId) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found"));

        LocalDateTime threshold = LocalDateTime.now().minusMinutes(15);
        List<GpsLog> recentLogs = gpsLogRepository.findByCreatedAtAfter(threshold);

        LocalDateTime now = LocalDateTime.now();
        double weightedScore = recentLogs.stream()
                .filter(log -> distanceInMeters(booth.getLatitude(), booth.getLongitude(), log.getLatitude(), log.getLongitude()) <= BOOTH_RADIUS_METERS)
                .mapToDouble(log -> timeWeight(log.getCreatedAt(), now))
                .sum();
        int weightedCount = (int) Math.round(weightedScore);

        return new CongestionResponseDto(booth.getId(), booth.getName(), convertLevel(weightedCount), weightedCount);
    }

    public List<CongestionResponseDto> getAllCongestions() {
        return getAllBooths().stream()
                .map(booth -> getCongestionByBoothId(booth.id()))
                .toList();
    }

    public CongestionResponseDto getMostCongestedBooth() {
        return getAllCongestions().stream()
                .max(Comparator.comparingInt(CongestionResponseDto::nearbyUserCount))
                .orElse(null);
    }

    private BoothResponseDto toDto(Booth booth) {
        return new BoothResponseDto(
                booth.getId(),
                booth.getName(),
                booth.getLatitude(),
                booth.getLongitude(),
                booth.getDescription(),
                booth.getDisplayOrder(),
                booth.getImageUrl(),
                booth.getEstimatedWaitMinutes(),
                booth.getRemainingStock(),
                booth.getLiveStatusMessage(),
                booth.getLiveStatusUpdatedAt()
        );
    }

    private String convertLevel(int count) {
        if (count < 3) {
            return "?ъ쑀";
        }
        if (count < 7) {
            return "蹂댄넻";
        }
        if (count < 12) {
            return "?쇱옟";
        }
        return "留ㅼ슦?쇱옟";
    }

    // 理쒓렐 15遺??곗씠?곗뿉 ?쒓컙 媛以묒튂瑜??곸슜?쒕떎. 理쒖떊 濡쒓렇?쇱닔濡??믪? 媛以묒튂瑜?以??
    private double timeWeight(LocalDateTime createdAt, LocalDateTime now) {
        long seconds = Duration.between(createdAt, now).toSeconds();
        double ratio = Math.max(0.0, Math.min(1.0, seconds / 900.0));
        return 1.0 - (ratio * 0.7);
    }

    private double distanceInMeters(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }
}
