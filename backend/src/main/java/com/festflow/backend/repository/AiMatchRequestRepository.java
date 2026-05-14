package com.festflow.backend.repository;

import com.festflow.backend.entity.AiMatchRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiMatchRequestRepository extends JpaRepository<AiMatchRequest, Long> {
    List<AiMatchRequest> findAllByOrderByCreatedAtDesc();

    List<AiMatchRequest> findAllByProfileIdOrderByCreatedAtDesc(Long profileId);
}
