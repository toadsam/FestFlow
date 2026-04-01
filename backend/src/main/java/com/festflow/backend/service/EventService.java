package com.festflow.backend.service;

import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.repository.EventRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class EventService {

    private final EventRepository eventRepository;

    public EventService(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    public List<EventResponseDto> getAllEvents() {
        LocalDateTime now = LocalDateTime.now();

        return eventRepository.findAll().stream()
                .map(event -> {
                    String status = resolveStatus(event, now);
                    return new EventResponseDto(
                            event.getId(),
                            event.getTitle(),
                            event.getStartTime(),
                            event.getEndTime(),
                            status
                    );
                })
                .toList();
    }

    private String resolveStatus(FestivalEvent event, LocalDateTime now) {
        String status;
        if (now.isBefore(event.getStartTime())) {
            status = "\uC608\uC815";
        } else if (now.isAfter(event.getEndTime())) {
            status = "\uC885\uB8CC";
        } else {
            status = "\uC9C4\uD589\uC911";
        }

        if (!status.equals(event.getStatus())) {
            event.setStatus(status);
            eventRepository.save(event);
        }
        return status;
    }
}

