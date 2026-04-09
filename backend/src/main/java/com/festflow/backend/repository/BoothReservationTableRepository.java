package com.festflow.backend.repository;

import com.festflow.backend.entity.BoothReservationTable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BoothReservationTableRepository extends JpaRepository<BoothReservationTable, Long> {
    List<BoothReservationTable> findByBoothIdOrderByDisplayOrderAscIdAsc(Long boothId);
}

