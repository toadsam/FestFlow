package com.festflow.backend.service;

import com.festflow.backend.dto.BoothLiveStatusRequestDto;
import com.festflow.backend.dto.BoothReorderRequestDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.BoothReservation;
import com.festflow.backend.entity.BoothReservationTable;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.BoothReservationRepository;
import com.festflow.backend.repository.BoothReservationTableRepository;
import com.festflow.backend.repository.GpsLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class BoothService {

    private static final double BOOTH_RADIUS_METERS = 80.0;
    private static final List<ReservationStatus> BLOCKING_RESERVATION_STATUSES = List.of(
            ReservationStatus.RESERVED,
            ReservationStatus.CHECKED_IN
    );

    private final BoothRepository boothRepository;
    private final GpsLogRepository gpsLogRepository;
    private final BoothReservationTableRepository boothReservationTableRepository;
    private final BoothReservationRepository boothReservationRepository;
    private final SimulationStateService simulationStateService;

    public BoothService(
            BoothRepository boothRepository,
            GpsLogRepository gpsLogRepository,
            BoothReservationTableRepository boothReservationTableRepository,
            BoothReservationRepository boothReservationRepository,
            SimulationStateService simulationStateService
    ) {
        this.boothRepository = boothRepository;
        this.gpsLogRepository = gpsLogRepository;
        this.boothReservationTableRepository = boothReservationTableRepository;
        this.boothReservationRepository = boothReservationRepository;
        this.simulationStateService = simulationStateService;
    }

    public List<BoothResponseDto> getAllBooths() {
        return boothRepository.findAll().stream()
                .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                .map(this::toDto)
                .toList();
    }

    public BoothResponseDto getBoothById(Long boothId) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));

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
        saved.setBoothIntro(requestDto.boothIntro());
        saved.setMenuImageUrl(requestDto.menuImageUrl());
        saved.setMenuBoardJson(requestDto.menuBoardJson());
        saved.updateContentInfo(
                requestDto.category(),
                requestDto.dayPart(),
                requestDto.openTime(),
                requestDto.closeTime(),
                requestDto.tags(),
                requestDto.contentJson(),
                requestDto.reservationEnabled()
        );
        return toDto(saved);
    }

    public BoothResponseDto updateBooth(Long boothId, BoothUpsertRequestDto requestDto) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));

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
        booth.setBoothIntro(requestDto.boothIntro() != null ? requestDto.boothIntro() : booth.getBoothIntro());
        booth.setMenuImageUrl(requestDto.menuImageUrl() != null ? requestDto.menuImageUrl() : booth.getMenuImageUrl());
        booth.setMenuBoardJson(requestDto.menuBoardJson() != null ? requestDto.menuBoardJson() : booth.getMenuBoardJson());
        booth.updateContentInfo(
                requestDto.category() != null ? requestDto.category() : booth.getCategory(),
                requestDto.dayPart() != null ? requestDto.dayPart() : booth.getDayPart(),
                requestDto.openTime() != null ? requestDto.openTime() : booth.getOpenTime(),
                requestDto.closeTime() != null ? requestDto.closeTime() : booth.getCloseTime(),
                requestDto.tags() != null ? requestDto.tags() : booth.getTags(),
                requestDto.contentJson() != null ? requestDto.contentJson() : booth.getContentJson(),
                requestDto.reservationEnabled() != null ? requestDto.reservationEnabled() : booth.getReservationEnabled()
        );

        return toDto(boothRepository.save(booth));
    }

    public BoothResponseDto updateBoothImage(Long boothId, String imageUrl) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));
        booth.setImageUrl(imageUrl);
        return toDto(boothRepository.save(booth));
    }
    public BoothResponseDto updateBoothMenuImage(Long boothId, String imageUrl) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));
        booth.setMenuImageUrl(imageUrl);
        return toDto(boothRepository.save(booth));
    }
    public BoothResponseDto updateLiveStatus(Long boothId, BoothLiveStatusRequestDto requestDto) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));

        booth.setEstimatedWaitMinutes(requestDto.estimatedWaitMinutes());
        booth.setRemainingStock(requestDto.remainingStock());
        booth.setLiveStatusMessage(requestDto.liveStatusMessage());
        booth.setBoothIntro(requestDto.boothIntro() != null ? requestDto.boothIntro() : booth.getBoothIntro());
        booth.setMenuImageUrl(requestDto.menuImageUrl() != null ? requestDto.menuImageUrl() : booth.getMenuImageUrl());
        booth.setMenuBoardJson(requestDto.menuBoardJson() != null ? requestDto.menuBoardJson() : booth.getMenuBoardJson());
        booth.updateContentInfo(
                requestDto.category() != null ? requestDto.category() : booth.getCategory(),
                requestDto.dayPart() != null ? requestDto.dayPart() : booth.getDayPart(),
                requestDto.openTime() != null ? requestDto.openTime() : booth.getOpenTime(),
                requestDto.closeTime() != null ? requestDto.closeTime() : booth.getCloseTime(),
                requestDto.tags() != null ? requestDto.tags() : booth.getTags(),
                requestDto.contentJson() != null ? requestDto.contentJson() : booth.getContentJson(),
                requestDto.reservationEnabled() != null ? requestDto.reservationEnabled() : booth.getReservationEnabled()
        );
        booth.setLiveStatusUpdatedAt(LocalDateTime.now());

        return toDto(boothRepository.save(booth));
    }

    public void reorderBooths(BoothReorderRequestDto requestDto) {
        int order = 1;
        for (Long id : requestDto.boothIds()) {
            Booth booth = boothRepository.findById(id)
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다: " + id));
            booth.setDisplayOrder(order++);
            boothRepository.save(booth);
        }
    }

    public void deleteBooth(Long boothId) {
        if (!boothRepository.existsById(boothId)) {
            throw new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다.");
        }
        boothRepository.deleteById(boothId);
    }

    public CongestionResponseDto getCongestionByBoothId(Long boothId) {
        Booth booth = boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));

        var simulated = simulationStateService.simulatedCongestion(booth.getId(), booth.getName());
        if (simulated.isPresent()) {
            return simulated.get();
        }

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
        ReservationSummary reservationSummary = getReservationSummary(booth);

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
                booth.getLiveStatusUpdatedAt(),
                booth.getBoothIntro(),
                booth.getMenuImageUrl(),
                booth.getMenuBoardJson(),
                booth.getCategory() != null ? booth.getCategory() : "\uC8FC\uC810",
                booth.getDayPart() != null ? booth.getDayPart() : "\uC57C\uAC04",
                booth.getOpenTime(),
                booth.getCloseTime(),
                booth.getTags(),
                booth.getContentJson(),
                booth.getReservationEnabled() != null ? booth.getReservationEnabled() : true,
                reservationSummary.tableCount(),
                reservationSummary.availableSeats(),
                reservationSummary.reservedTables(),
                reservationSummary.inUseTables()
        );
    }

    private ReservationSummary getReservationSummary(Booth booth) {
        List<BoothReservationTable> tables = boothReservationTableRepository
                .findByBoothIdOrderByDisplayOrderAscIdAsc(booth.getId());
        if (tables.isEmpty()) {
            return new ReservationSummary(0, 0, 0, 0);
        }

        List<BoothReservation> activeReservations = boothReservationRepository
                .findByBoothIdAndStatusInOrderByExpiresAtAsc(booth.getId(), BLOCKING_RESERVATION_STATUSES);
        Set<Long> blockedTableIds = activeReservations.stream()
                .map(reservation -> reservation.getTable().getId())
                .collect(Collectors.toSet());

        int availableSeats = tables.stream()
                .filter(table -> !blockedTableIds.contains(table.getId()))
                .mapToInt(table -> Math.max(0, table.getAvailableSeats()))
                .sum();

        long reservedTables = activeReservations.stream()
                .filter(reservation -> reservation.getStatus() == ReservationStatus.RESERVED)
                .map(reservation -> reservation.getTable().getId())
                .distinct()
                .count();
        long inUseTables = activeReservations.stream()
                .filter(reservation -> reservation.getStatus() == ReservationStatus.CHECKED_IN)
                .map(reservation -> reservation.getTable().getId())
                .distinct()
                .count();

        return new ReservationSummary(
                tables.size(),
                availableSeats,
                (int) reservedTables,
                (int) inUseTables
        );
    }

    private record ReservationSummary(
            int tableCount,
            int availableSeats,
            int reservedTables,
            int inUseTables
    ) {
    }

    private String convertLevel(int count) {
        if (count < 3) {
            return "여유";
        }
        if (count < 7) {
            return "보통";
        }
        if (count < 12) {
            return "혼잡";
        }
        return "매우혼잡";
    }

    // 최근 15분 GPS 로그에 시간 가중치를 적용한다.
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

