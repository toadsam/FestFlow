package com.festflow.backend.repository;

import com.festflow.backend.entity.AiMatchProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiMatchProfileRepository extends JpaRepository<AiMatchProfile, Long> {
    List<AiMatchProfile> findAllByStatusOrderByCreatedAtDesc(String status);
}
