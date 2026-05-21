package com.festflow.backend.repository;

import com.festflow.backend.entity.AiMatchRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            delete from ai_match_requests
            where profile_id in (:profileIds)
               or requester_profile_id in (:profileIds)
               or meetup_proposer_profile_id in (:profileIds)
            """, nativeQuery = true)
    int deleteAllReferencingProfileIds(@Param("profileIds") List<Long> profileIds);
}
