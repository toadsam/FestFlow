package com.festflow.backend.controller.stream;

import com.festflow.backend.service.stream.StreamService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/stream")
public class StreamController {

    private final StreamService streamService;

    public StreamController(StreamService streamService) {
        this.streamService = streamService;
    }

    @GetMapping(value = "/congestion", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter congestion() {
        return streamService.subscribeCongestion();
    }

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events() {
        return streamService.subscribeEvents();
    }

    @GetMapping(value = "/notices", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter notices() {
        return streamService.subscribeNotices();
    }

    @GetMapping(value = "/booths", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter booths() {
        return streamService.subscribeBooths();
    }
}
