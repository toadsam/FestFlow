package com.festflow.backend.controller.admin;

import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.EventUpsertRequestDto;
import com.festflow.backend.service.EventService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/events")
public class AdminEventController {

    private final EventService eventService;

    public AdminEventController(EventService eventService) {
        this.eventService = eventService;
    }

    @PostMapping
    public EventResponseDto createEvent(@Valid @RequestBody EventUpsertRequestDto requestDto) {
        return eventService.createEvent(requestDto);
    }

    @PutMapping("/{id}")
    public EventResponseDto updateEvent(@PathVariable Long id, @Valid @RequestBody EventUpsertRequestDto requestDto) {
        return eventService.updateEvent(id, requestDto);
    }

    @DeleteMapping("/{id}")
    public void deleteEvent(@PathVariable Long id) {
        eventService.deleteEvent(id);
    }
}
