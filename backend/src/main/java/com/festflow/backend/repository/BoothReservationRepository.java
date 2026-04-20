package com.festflow.backend.repository;

import com.festflow.backend.entity.BoothReservation;
import com.festflow.backend.entity.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface BoothReservationRepository extends JpaRepository<BoothReservation, Long> {
    List<BoothReservation> findByBoothIdAndStatusOrderByExpiresAtAsc(Long boothId, ReservationStatus status);

    Optional<BoothReservation> findByIdAndBoothId(Long id, Long boothId);

    Optional<BoothReservation> findFirstByUserKeyAndStatusOrderByReservedAtDesc(String userKey, ReservationStatus status);

    List<BoothReservation> findByStatusAndExpiresAtBefore(ReservationStatus status, LocalDateTime expiresAt);
}

