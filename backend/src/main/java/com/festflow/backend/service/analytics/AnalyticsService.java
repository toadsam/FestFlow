package com.festflow.backend.service.analytics;

import com.festflow.backend.dto.HeatPointDto;
import com.festflow.backend.dto.PopularBoothDto;
import com.festflow.backend.dto.TrafficHourlyDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.GpsLogRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnalyticsService {

    private final GpsLogRepository gpsLogRepository;
    private final BoothRepository boothRepository;

    public AnalyticsService(GpsLogRepository gpsLogRepository, BoothRepository boothRepository) {
        this.gpsLogRepository = gpsLogRepository;
        this.boothRepository = boothRepository;
    }

    public List<TrafficHourlyDto> trafficHourly() {
        LocalDateTime from = LocalDateTime.now().minusHours(24);
        List<GpsLog> logs = gpsLogRepository.findByCreatedAtAfter(from);

        Map<String, Long> countMap = new HashMap<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM-dd HH:00");
        for (GpsLog log : logs) {
            String key = log.getCreatedAt().withMinute(0).withSecond(0).withNano(0).format(formatter);
            countMap.put(key, countMap.getOrDefault(key, 0L) + 1);
        }

        return countMap.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> new TrafficHourlyDto(entry.getKey(), entry.getValue()))
                .toList();
    }

    public List<PopularBoothDto> popularBooths() {
        LocalDateTime from = LocalDateTime.now().minusMinutes(60);
        List<GpsLog> logs = gpsLogRepository.findByCreatedAtAfter(from);
        List<Booth> booths = boothRepository.findAll();

        return booths.stream()
                .map(booth -> {
                    long score = logs.stream()
                            .filter(log -> distanceInMeters(booth.getLatitude(), booth.getLongitude(), log.getLatitude(), log.getLongitude()) <= 100)
                            .count();
                    return new PopularBoothDto(booth.getId(), booth.getName(), score);
                })
                .sorted(Comparator.comparing(PopularBoothDto::score).reversed())
                .limit(10)
                .toList();
    }

    public List<HeatPointDto> congestionHeatmap() {
        LocalDateTime from = LocalDateTime.now().minusMinutes(60);
        List<GpsLog> logs = gpsLogRepository.findByCreatedAtAfter(from);
        Map<String, Long> cells = new HashMap<>();

        for (GpsLog log : logs) {
            double lat = Math.round(log.getLatitude() * 1000.0) / 1000.0;
            double lng = Math.round(log.getLongitude() * 1000.0) / 1000.0;
            String key = lat + "," + lng;
            cells.put(key, cells.getOrDefault(key, 0L) + 1);
        }

        return cells.entrySet().stream()
                .map(entry -> {
                    String[] split = entry.getKey().split(",");
                    return new HeatPointDto(Double.parseDouble(split[0]), Double.parseDouble(split[1]), entry.getValue());
                })
                .sorted(Comparator.comparing(HeatPointDto::intensity).reversed())
                .toList();
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
