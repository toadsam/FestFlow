package com.festflow.backend.repository;

import com.festflow.backend.entity.AiMatchRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiMatchRequestRepository extends JpaRepository<AiMatchRequest, Long> {
    List<AiMatchRequest> findAllByOrderByCreatedAtDesc();

    List<AiMatchRequest> findAllByProfileIdOrderByCreatedAtDesc(Long profileId);

    List<AiMatchRequest> findAllByRequesterProfileIdOrderByCreatedAtDesc(Long requesterProfileId);

    List<AiMatchRequest> findAllByProfileIdOrRequesterProfileId(Long profileId, Long requesterProfileId);

    boolean existsByRequesterProfileIdAndProfileIdAndStatus(Long requesterProfileId, Long profileId, String status);

    Optional<AiMatchRequest> findByIdAndProfileId(Long id, Long profileId);

    Optional<AiMatchRequest> findByIdAndRequesterProfileId(Long id, Long requesterProfileId);
}
