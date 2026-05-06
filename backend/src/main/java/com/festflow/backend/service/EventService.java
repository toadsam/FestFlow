package com.festflow.backend.service;

import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.EventUpsertRequestDto;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.repository.EventRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class EventService {

    private final EventRepository eventRepository;
    private final StreamService streamService;

    public EventService(EventRepository eventRepository, StreamService streamService) {
        this.eventRepository = eventRepository;
        this.streamService = streamService;
    }

    public List<EventResponseDto> getAllEvents() {
        LocalDateTime now = LocalDateTime.now();

        return eventRepository.findAll().stream()
                .sorted(Comparator.comparing(FestivalEvent::getStartTime))
                .map(event -> {
                    String status = resolveStatus(event, now);
                    return toDto(event, status);
                })
                .toList();
    }

    public EventResponseDto createEvent(EventUpsertRequestDto requestDto) {
        FestivalEvent event = new FestivalEvent(
                requestDto.title(),
                requestDto.startTime(),
                requestDto.endTime(),
                "\uC608\uC815",
                requestDto.imageUrl(),
                requestDto.imageCredit(),
                requestDto.imageFocus()
        );
        event.setStatusOverride(requestDto.statusOverride());
        event.update(
                requestDto.title(),
                requestDto.startTime(),
                requestDto.endTime(),
                requestDto.imageUrl(),
                requestDto.imageCredit(),
                requestDto.imageFocus(),
                requestDto.statusOverride(),
                requestDto.liveMessage(),
                requestDto.delayMinutes()
        );
        FestivalEvent saved = eventRepository.save(event);
        return toDto(saved, resolveStatus(saved, LocalDateTime.now()));
    }

    public EventResponseDto getEventById(Long eventId) {
        FestivalEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "공연을 찾을 수 없습니다."));
        return toDto(event, resolveStatus(event, LocalDateTime.now()));
    }

    public EventResponseDto updateEvent(Long eventId, EventUpsertRequestDto requestDto) {
        FestivalEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "공연을 찾을 수 없습니다."));

        event.update(
                requestDto.title(),
                requestDto.startTime(),
                requestDto.endTime(),
                requestDto.imageUrl(),
                requestDto.imageCredit(),
                requestDto.imageFocus(),
                requestDto.statusOverride(),
                requestDto.liveMessage(),
                requestDto.delayMinutes()
        );
        FestivalEvent saved = eventRepository.save(event);
        return toDto(saved, resolveStatus(saved, LocalDateTime.now()));
    }

    public void deleteEvent(Long eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new ResponseStatusException(NOT_FOUND, "공연을 찾을 수 없습니다.");
        }
        eventRepository.deleteById(eventId);
    }

    @Scheduled(fixedDelay = 30000)
    public void broadcastEventUpdates() {
        streamService.publishEvents(getAllEvents());
    }

    private EventResponseDto toDto(FestivalEvent event, String status) {
        return new EventResponseDto(
                event.getId(),
                event.getTitle(),
                event.getStartTime(),
                event.getEndTime(),
                status,
                event.getImageUrl(),
                event.getImageCredit(),
                event.getImageFocus(),
                event.getStatusOverride(),
                event.getLiveMessage(),
                event.getDelayMinutes(),
                event.getStatusUpdatedAt()
        );
    }

    private String resolveStatus(FestivalEvent event, LocalDateTime now) {
        if (event.getStatusOverride() != null && !event.getStatusOverride().isBlank()) {
            String override = event.getStatusOverride();
            if (!override.equals(event.getStatus())) {
                event.setStatus(override);
                eventRepository.save(event);
            }
            return override;
        }

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
