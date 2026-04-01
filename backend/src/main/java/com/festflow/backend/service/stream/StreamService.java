package com.festflow.backend.service.stream;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class StreamService {

    private final List<SseEmitter> congestionEmitters = new CopyOnWriteArrayList<>();
    private final List<SseEmitter> eventEmitters = new CopyOnWriteArrayList<>();
    private final List<SseEmitter> noticeEmitters = new CopyOnWriteArrayList<>();
    private final List<SseEmitter> boothEmitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribeCongestion() {
        return createEmitter(congestionEmitters);
    }

    public SseEmitter subscribeEvents() {
        return createEmitter(eventEmitters);
    }

    public SseEmitter subscribeNotices() {
        return createEmitter(noticeEmitters);
    }

    public SseEmitter subscribeBooths() {
        return createEmitter(boothEmitters);
    }

    public void publishCongestion(Object payload) {
        send(congestionEmitters, "congestion", payload);
    }

    public void publishEvents(Object payload) {
        send(eventEmitters, "events", payload);
    }

    public void publishNotices(Object payload) {
        send(noticeEmitters, "notices", payload);
    }

    public void publishBooths(Object payload) {
        send(boothEmitters, "booths", payload);
    }

    private SseEmitter createEmitter(List<SseEmitter> emitters) {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((e) -> emitters.remove(emitter));
        return emitter;
    }

    private void send(List<SseEmitter> emitters, String eventName, Object payload) {
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(payload));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }
}
