package com.festflow.backend.service;

import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.LostItemStatusUpdateRequestDto;
import com.festflow.backend.entity.LostItem;
import com.festflow.backend.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

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
        String note = requestDto.resolveNote() == null ? null : requestDto.resolveNote().trim();
        item.updateStatus(nextStatus, note);
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "REGISTERED";
        }
        String normalized = status.trim().toUpperCase();
        if ("RETURNED".equals(normalized)) {
            return "RETURNED";
        }
        return "REGISTERED";
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
                "RETURNED".equals(item.getStatus()) ? "수령 완료" : "보관 중",
                item.getReporterType(),
                item.getReporterRef(),
                item.getResolveNote(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }
}

