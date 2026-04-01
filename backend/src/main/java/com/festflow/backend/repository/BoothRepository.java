package com.festflow.backend.repository;

import com.festflow.backend.entity.Booth;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoothRepository extends JpaRepository<Booth, Long> {
    Optional<Booth> findTopByOrderByDisplayOrderDesc();
}

