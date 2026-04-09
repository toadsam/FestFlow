package com.festflow.backend.service;

import com.festflow.backend.dto.BoothReservationConfigRequestDto;
import com.festflow.backend.dto.BoothReservationDto;
import com.festflow.backend.dto.BoothReservationStateDto;
import com.festflow.backend.dto.ReservationCreateRequestDto;
import com.festflow.backend.dto.ReservationPenaltyDto;
import com.festflow.backend.dto.ReservationTableDto;
import com.festflow.backend.dto.ReservationTableUpsertDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.BoothReservation;
import com.festflow.backend.entity.BoothReservationTable;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.entity.ReservationUserState;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.BoothReservationRepository;
import com.festflow.backend.repository.BoothReservationTableRepository;
import com.festflow.backend.repository.ReservationUserStateRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;

@Service
public class ReservationService {

    private final BoothRepository boothRepository;
    private final BoothReservationTableRepository boothReservationTableRepository;
    private final BoothReservationRepository boothReservationRepository;
    private final ReservationUserStateRepository reservationUserStateRepository;

    public ReservationService(
            BoothRepository boothRepository,
            BoothReservationTableRepository boothReservationTableRepository,
            BoothReservationRepository boothReservationRepository,
            ReservationUserStateRepository reservationUserStateRepository
    ) {
        this.boothRepository = boothRepository;
        this.boothReservationTableRepository = boothReservationTableRepository;
        this.boothReservationRepository = boothReservationRepository;
        this.reservationUserStateRepository = reservationUserStateRepository;
    }

    @Transactional
    public BoothReservationStateDto getBoothReservationState(Long boothId, String userKey) {
        Booth booth = findBooth(boothId);
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        List<ReservationTableDto> tableDtos = boothReservationTableRepository.findByBoothIdOrderByDisplayOrderAscIdAsc(boothId).stream()
                .map(this::toTableDto)
                .toList();

        List<BoothReservationDto> activeReservations = boothReservationRepository
                .findByBoothIdAndStatusOrderByExpiresAtAsc(boothId, ReservationStatus.RESERVED)
                .stream()
                .map(this::toReservationDto)
                .toList();

        BoothReservationDto myReservation = null;
        ReservationPenaltyDto penalty = null;

        String normalizedUserKey = normalizeUserKey(userKey);
        if (normalizedUserKey != null) {
            myReservation = boothReservationRepository
                    .findFirstByUserKeyAndStatusOrderByReservedAtDesc(normalizedUserKey, ReservationStatus.RESERVED)
                    .map(this::toReservationDto)
                    .orElse(null);

            penalty = reservationUserStateRepository.findByUserKey(normalizedUserKey)
                    .map(state -> toPenaltyDto(state, now))
                    .orElse(new ReservationPenaltyDto(0, null, false));
        }

        return new BoothReservationStateDto(
                sanitizeReservationMinutes(booth.getMaxReservationMinutes()),
                tableDtos,
                activeReservations,
                myReservation,
                penalty
        );
    }

    @Transactional
    public BoothReservationStateDto upsertBoothReservationConfig(Long boothId, BoothReservationConfigRequestDto requestDto) {
        Booth booth = findBooth(boothId);
        booth.setMaxReservationMinutes(sanitizeReservationMinutes(requestDto.maxReservationMinutes()));
        boothRepository.save(booth);

        List<ReservationTableUpsertDto> requestTables = requestDto.tables() == null ? List.of() : requestDto.tables();
        List<BoothReservationTable> existingTables = boothReservationTableRepository.findByBoothIdOrderByDisplayOrderAscIdAsc(boothId);
        Map<Long, BoothReservationTable> existingById = new HashMap<>();
        for (BoothReservationTable table : existingTables) {
            existingById.put(table.getId(), table);
        }

        List<BoothReservationTable> toSave = new ArrayList<>();
        List<Long> keepIds = new ArrayList<>();

        for (int i = 0; i < requestTables.size(); i++) {
            ReservationTableUpsertDto dto = requestTables.get(i);
            int totalSeats = sanitizeTotalSeats(dto.totalSeats());
            int availableSeats = sanitizeAvailableSeats(dto.availableSeats(), totalSeats);
            String tableName = (dto.tableName() == null || dto.tableName().isBlank()) ? "Table " + (i + 1) : dto.tableName().trim();

            if (dto.id() != null && existingById.containsKey(dto.id())) {
                BoothReservationTable target = existingById.get(dto.id());
                target.update(tableName, totalSeats, availableSeats, i + 1);
                toSave.add(target);
                keepIds.add(target.getId());
            } else {
                toSave.add(new BoothReservationTable(booth, tableName, totalSeats, availableSeats, i + 1));
            }
        }

        for (BoothReservationTable table : existingTables) {
            if (!keepIds.contains(table.getId())) {
                boothReservationTableRepository.delete(table);
            }
        }

        boothReservationTableRepository.saveAll(toSave);
        return getBoothReservationState(boothId, null);
    }

    @Transactional
    public BoothReservationDto createReservation(Long boothId, ReservationCreateRequestDto requestDto) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        String userKey = normalizeUserKey(requestDto.userKey());
        if (userKey == null) {
            throw new ResponseStatusException(CONFLICT, "User key is required.");
        }

        ReservationUserState userState = reservationUserStateRepository.findByUserKey(userKey)
                .orElseGet(() -> reservationUserStateRepository.save(new ReservationUserState(userKey)));

        if (userState.isBlocked(now)) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "Reservation is temporarily blocked due to repeated no-shows.");
        }

        Optional<BoothReservation> activeReservation = boothReservationRepository
                .findFirstByUserKeyAndStatusOrderByReservedAtDesc(userKey, ReservationStatus.RESERVED);
        if (activeReservation.isPresent()) {
            throw new ResponseStatusException(CONFLICT, "Only one active reservation is allowed per user.");
        }

        Booth booth = findBooth(boothId);
        BoothReservationTable table = boothReservationTableRepository.findById(requestDto.tableId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Table not found."));

        if (!table.getBooth().getId().equals(boothId)) {
            throw new ResponseStatusException(CONFLICT, "Selected table does not belong to this booth.");
        }

        int seatCount = requestDto.seatCount() == null ? 1 : Math.max(1, requestDto.seatCount());
        if (table.getAvailableSeats() < seatCount) {
            throw new ResponseStatusException(CONFLICT, "Not enough available seats in this table.");
        }

        table.setAvailableSeats(table.getAvailableSeats() - seatCount);
        boothReservationTableRepository.save(table);

        BoothReservation created = boothReservationRepository.save(new BoothReservation(
                booth,
                table,
                userKey,
                seatCount,
                ReservationStatus.RESERVED,
                now,
                now.plusMinutes(sanitizeReservationMinutes(booth.getMaxReservationMinutes()))
        ));

        return toReservationDto(created);
    }

    @Transactional
    public BoothReservationDto checkIn(Long boothId, Long reservationId) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        BoothReservation reservation = boothReservationRepository.findByIdAndBoothId(reservationId, boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Reservation not found."));

        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            throw new ResponseStatusException(CONFLICT, "Reservation is no longer active.");
        }

        if (reservation.getExpiresAt().isBefore(now)) {
            expireReservation(reservation, now);
            throw new ResponseStatusException(CONFLICT, "Reservation has expired.");
        }

        reservation.markCheckedIn(now);
        boothReservationRepository.save(reservation);
        return toReservationDto(reservation);
    }

    private void expireStaleReservations(LocalDateTime now) {
        List<BoothReservation> expired = boothReservationRepository.findByStatusAndExpiresAtBefore(ReservationStatus.RESERVED, now);
        for (BoothReservation reservation : expired) {
            expireReservation(reservation, now);
        }
    }

    private void expireReservation(BoothReservation reservation, LocalDateTime now) {
        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            return;
        }

        reservation.markExpired(now);
        boothReservationRepository.save(reservation);

        BoothReservationTable table = reservation.getTable();
        int restoredSeats = Math.min(table.getTotalSeats(), table.getAvailableSeats() + reservation.getSeatCount());
        table.setAvailableSeats(restoredSeats);
        boothReservationTableRepository.save(table);

        ReservationUserState userState = reservationUserStateRepository.findByUserKey(reservation.getUserKey())
                .orElseGet(() -> new ReservationUserState(reservation.getUserKey()));
        userState.registerNoShow(now);
        reservationUserStateRepository.save(userState);
    }

    private Booth findBooth(Long boothId) {
        return boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found."));
    }

    private ReservationTableDto toTableDto(BoothReservationTable table) {
        return new ReservationTableDto(
                table.getId(),
                table.getTableName(),
                table.getTotalSeats(),
                table.getAvailableSeats(),
                table.getDisplayOrder()
        );
    }

    private BoothReservationDto toReservationDto(BoothReservation reservation) {
        return new BoothReservationDto(
                reservation.getId(),
                reservation.getBooth().getId(),
                reservation.getTable().getId(),
                reservation.getTable().getTableName(),
                reservation.getUserKey(),
                reservation.getSeatCount(),
                reservation.getStatus(),
                reservation.getReservedAt(),
                reservation.getExpiresAt(),
                reservation.getCheckedInAt(),
                reservation.getExpiredAt()
        );
    }

    private ReservationPenaltyDto toPenaltyDto(ReservationUserState state, LocalDateTime now) {
        return new ReservationPenaltyDto(
                state.getNoShowCount(),
                state.getBlockedUntil(),
                state.isBlocked(now)
        );
    }

    private int sanitizeReservationMinutes(Integer rawMinutes) {
        if (rawMinutes == null || rawMinutes < 1) {
            return 10;
        }
        return Math.min(rawMinutes, 120);
    }

    private int sanitizeTotalSeats(Integer rawTotalSeats) {
        if (rawTotalSeats == null || rawTotalSeats < 1) {
            return 1;
        }
        return Math.min(rawTotalSeats, 30);
    }

    private int sanitizeAvailableSeats(Integer rawAvailableSeats, int totalSeats) {
        if (rawAvailableSeats == null) {
            return totalSeats;
        }
        if (rawAvailableSeats < 0) {
            return 0;
        }
        return Math.min(rawAvailableSeats, totalSeats);
    }

    private String normalizeUserKey(String userKey) {
        if (userKey == null) {
            return null;
        }
        String normalized = userKey.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.length() > 120) {
            return normalized.substring(0, 120);
        }
        return normalized;
    }
}

