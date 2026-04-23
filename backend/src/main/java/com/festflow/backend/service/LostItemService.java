package com.festflow.backend.service;

import com.festflow.backend.dto.LostItemClaimRequestDto;
import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.LostItemStatusUpdateRequestDto;
import com.festflow.backend.dto.LostItemUpdateRequestDto;
import com.festflow.backend.entity.LostItem;
import com.festflow.backend.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class LostItemService {

    private final LostItemRepository lostItemRepository;

    public LostItemService(LostItemRepository lostItemRepository) {
        this.lostItemRepository = lostItemRepository;
    }

    @Transactional(readOnly = true)
    public List<LostItemResponseDto> getAll() {
        return lostItemRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public LostItemResponseDto create(
            String title,
            String description,
            String category,
            String foundLocation,
            String finderContact,
            String imageUrl,
            String reporterType,
            String reporterRef
    ) {
        LostItem saved = lostItemRepository.save(new LostItem(
                title,
                description,
                category,
                foundLocation,
                finderContact,
                imageUrl,
                "REGISTERED",
                reporterType,
                reporterRef
        ));
        return toDto(saved);
    }

    @Transactional
    public LostItemResponseDto updateStatus(Long id, LostItemStatusUpdateRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        String nextStatus = normalizeStatus(requestDto.status());
        String note = trimOrNull(requestDto.resolveNote());

        item.update(
                item.getTitle(),
                item.getDescription(),
                item.getCategory(),
                item.getFoundLocation(),
                item.getFinderContact(),
                item.getImageUrl(),
                nextStatus,
                note
        );
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }

    @Transactional
    public LostItemResponseDto update(Long id, LostItemUpdateRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));

        String title = trimRequired(requestDto.title(), "title");
        String description = trimRequired(requestDto.description(), "description");
        String category = trimOrDefault(requestDto.category(), "ETC");
        String foundLocation = trimRequired(requestDto.foundLocation(), "foundLocation");
        String finderContact = trimOrNull(requestDto.finderContact());
        String imageUrl = trimOrNull(requestDto.imageUrl());
        String status = normalizeStatus(requestDto.status());
        String resolveNote = trimOrNull(requestDto.resolveNote());

        item.update(
                title,
                description,
                category,
                foundLocation,
                finderContact,
                imageUrl,
                status,
                resolveNote
        );
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }

    @Transactional
    public LostItemResponseDto claim(Long id, LostItemClaimRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        if ("RETURNED".equals(item.getStatus())) {
            throw new ResponseStatusException(BAD_REQUEST, "Already returned item cannot be claimed.");
        }

        String claimantName = trimRequired(requestDto.claimantName(), "claimantName");
        String claimantContact = trimRequired(requestDto.claimantContact(), "claimantContact");
        String claimantNote = trimOrNull(requestDto.claimantNote());

        item.markClaim(claimantName, claimantContact, claimantNote, "OWNER_CLAIMED");
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }

    @Transactional
    public void delete(Long id) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        lostItemRepository.delete(item);
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "REGISTERED";
        }
        String normalized = status.trim().toUpperCase();
        if ("OWNER_CLAIMED".equals(normalized)) {
            return "OWNER_CLAIMED";
        }
        if ("RETURNED".equals(normalized)) {
            return "RETURNED";
        }
        return "REGISTERED";
    }

    private String trimRequired(String value, String field) {
        String trimmed = trimOrNull(value);
        if (trimmed == null) {
            throw new ResponseStatusException(BAD_REQUEST, field + " is required.");
        }
        return trimmed;
    }

    private String trimOrDefault(String value, String fallback) {
        String trimmed = trimOrNull(value);
        return trimmed == null ? fallback : trimmed;
    }

    private String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed;
    }

    private LostItemResponseDto toDto(LostItem item) {
        return new LostItemResponseDto(
                item.getId(),
                item.getTitle(),
                item.getDescription(),
                item.getCategory(),
                item.getFoundLocation(),
                item.getFinderContact(),
                item.getImageUrl(),
                item.getStatus(),
                statusLabel(item.getStatus()),
                item.getReporterType(),
                item.getReporterRef(),
                item.getResolveNote(),
                item.getClaimantName(),
                item.getClaimantContact(),
                item.getClaimantNote(),
                item.getClaimedAt(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }

    private String statusLabel(String status) {
        if ("RETURNED".equals(status)) {
            return "Returned";
        }
        if ("OWNER_CLAIMED".equals(status)) {
            return "Owner Claimed";
        }
        return "Registered";
    }
}
