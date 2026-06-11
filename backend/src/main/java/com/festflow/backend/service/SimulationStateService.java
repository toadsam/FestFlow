package com.festflow.backend.service;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.SimulationBoothPatchDto;
import com.festflow.backend.dto.SimulationBoothStateDto;
import com.festflow.backend.dto.SimulationPatchRequestDto;
import com.festflow.backend.dto.SimulationStatusDto;
import com.festflow.backend.entity.Booth;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class SimulationStateService {

    private static final int DEFAULT_TICK_SECONDS = 3;
    private static final int DEFAULT_JITTER_PERCENT = 12;
    private static final int MAX_PEOPLE_PER_BOOTH = 250;

    private final Map<Long, MutableBoothState> states = new ConcurrentHashMap<>();

    private boolean running;
    private String scenario = "manual";
    private int tickSeconds = DEFAULT_TICK_SECONDS;
    private int jitterPercent = DEFAULT_JITTER_PERCENT;
    private LocalDateTime updatedAt = LocalDateTime.now();

    public synchronized SimulationStatusDto snapshot(List<BoothResponseDto> booths, boolean enabled) {
        seedMissing(booths);
        removeMissing(booths.stream().map(BoothResponseDto::id).toList());
        return toStatus(booths, enabled);
    }

    public synchronized SimulationStatusDto patch(List<BoothResponseDto> booths, SimulationPatchRequestDto request, boolean enabled) {
        seedMissing(booths);
        if (request != null) {
            if (request.tickSeconds() != null) {
                tickSeconds = clamp(request.tickSeconds(), 1, 30);
            }
            if (request.jitterPercent() != null) {
                jitterPercent = clamp(request.jitterPercent(), 0, 50);
            }
            if (request.booths() != null) {
                for (SimulationBoothPatchDto patch : request.booths()) {
                    applyBoothPatch(patch);
                }
            }
            scenario = "manual";
            updatedAt = LocalDateTime.now();
        }
        return toStatus(booths, enabled);
    }

    public synchronized SimulationStatusDto applyScenario(List<BoothResponseDto> booths, String nextScenario, boolean enabled) {
        seedMissing(booths);
        String resolved = normalizeScenario(nextScenario);
        ThreadLocalRandom random = ThreadLocalRandom.current();
        Long surgeBoothId = booths.stream()
                .filter(this::isFoodBooth)
                .findFirst()
                .or(() -> booths.stream().findFirst())
                .map(BoothResponseDto::id)
                .orElse(null);

        for (BoothResponseDto booth : booths) {
            MutableBoothState state = states.get(booth.id());
            if (state == null) {
                continue;
            }
            switch (resolved) {
                case "lunch-peak" -> applyLunchPeak(state, booth, random);
                case "show-end" -> applyShowEnd(state, booth, random);
                case "single-booth-surge" -> applySingleBoothSurge(state, booth, surgeBoothId, random);
                case "emergency-flow" -> applyEmergencyFlow(state, booth, random);
                default -> applyCalm(state, booth, random);
            }
        }

        scenario = resolved;
        updatedAt = LocalDateTime.now();
        return toStatus(booths, enabled);
    }

    public synchronized List<SimulationTickState> tick(List<BoothResponseDto> booths) {
        seedMissing(booths);
        if (!running) {
            return List.of();
        }

        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (BoothResponseDto booth : booths) {
            MutableBoothState state = states.get(booth.id());
            if (state == null) {
                continue;
            }
            state.previousPeople = state.currentPeople;
            double perMinuteDelta = state.incomingPerMinute - state.outgoingPerMinute - state.servicePerMinute;
            state.carry += perMinuteDelta * (tickSeconds / 60.0);
            int deterministicDelta = consumeWholeDelta(state);
            int jitterDelta = jitterDelta(state.currentPeople, random);
            state.currentPeople = clamp(state.currentPeople + deterministicDelta + jitterDelta, 0, MAX_PEOPLE_PER_BOOTH);
            state.remainingStock = booth.remainingStock();
        }

        updatedAt = LocalDateTime.now();
        return booths.stream()
                .map(booth -> {
                    MutableBoothState state = states.get(booth.id());
                    if (state == null) {
                        return null;
                    }
                    return new SimulationTickState(
                            booth.id(),
                            estimateWaitMinutes(state),
                            booth.remainingStock(),
                            "시뮬레이션: 현재 " + state.currentPeople + "명 · " + levelForPeople(state.currentPeople)
                    );
                })
                .filter(item -> item != null)
                .toList();
    }

    public synchronized void start(List<BoothResponseDto> booths) {
        seedMissing(booths);
        running = true;
        updatedAt = LocalDateTime.now();
    }

    public synchronized void stop() {
        running = false;
        updatedAt = LocalDateTime.now();
    }

    public synchronized List<SimulationOriginalState> originalStates() {
        return states.values().stream()
                .sorted(Comparator.comparing(item -> item.boothId))
                .map(item -> new SimulationOriginalState(
                        item.boothId,
                        item.originalWaitMinutes,
                        item.originalRemainingStock,
                        item.originalLiveStatusMessage
                ))
                .toList();
    }

    public synchronized void clear(List<BoothResponseDto> booths) {
        states.clear();
        running = false;
        scenario = "manual";
        tickSeconds = DEFAULT_TICK_SECONDS;
        jitterPercent = DEFAULT_JITTER_PERCENT;
        updatedAt = LocalDateTime.now();
        seedMissing(booths);
    }

    public synchronized Optional<CongestionResponseDto> simulatedCongestion(Long boothId, String boothName) {
        if (!running) {
            return Optional.empty();
        }
        MutableBoothState state = states.get(boothId);
        if (state == null) {
            return Optional.empty();
        }
        return Optional.of(new CongestionResponseDto(
                boothId,
                boothName,
                levelForPeople(state.currentPeople),
                state.currentPeople
        ));
    }

    public synchronized boolean isRunning() {
        return running;
    }

    public synchronized List<SimulationBoothSnapshot> boothSnapshots(List<Booth> booths) {
        if (!running) {
            return List.of();
        }
        seedMissingEntities(booths);
        return booths.stream()
                .map(booth -> {
                    MutableBoothState state = states.get(booth.getId());
                    if (state == null) {
                        return null;
                    }
                    return new SimulationBoothSnapshot(
                            booth.getId(),
                            booth.getName(),
                            booth.getLatitude(),
                            booth.getLongitude(),
                            state.currentPeople,
                            state.previousPeople,
                            estimateWaitMinutes(state),
                            levelForPeople(state.currentPeople)
                    );
                })
                .filter(item -> item != null)
                .toList();
    }

    private SimulationStatusDto toStatus(List<BoothResponseDto> booths, boolean enabled) {
        List<SimulationBoothStateDto> boothStates = booths.stream()
                .map(booth -> {
                    MutableBoothState state = states.get(booth.id());
                    if (state == null) {
                        return null;
                    }
                    return new SimulationBoothStateDto(
                            booth.id(),
                            booth.name(),
                            state.currentPeople,
                            state.previousPeople,
                            state.incomingPerMinute,
                            state.outgoingPerMinute,
                            state.servicePerMinute,
                            estimateWaitMinutes(state),
                            levelForPeople(state.currentPeople),
                            booth.remainingStock()
                    );
                })
                .filter(item -> item != null)
                .toList();
        int totalPeople = boothStates.stream().mapToInt(SimulationBoothStateDto::currentPeople).sum();
        return new SimulationStatusDto(
                enabled,
                running,
                scenario,
                tickSeconds,
                jitterPercent,
                updatedAt,
                totalPeople,
                boothStates
        );
    }

    private void seedMissing(List<BoothResponseDto> booths) {
        for (BoothResponseDto booth : booths) {
            states.computeIfAbsent(booth.id(), ignored -> fromBooth(booth));
        }
    }

    private void seedMissingEntities(List<Booth> booths) {
        for (Booth booth : booths) {
            states.computeIfAbsent(booth.getId(), ignored -> fromBoothEntity(booth));
        }
    }

    private void removeMissing(List<Long> boothIds) {
        states.keySet().removeIf(id -> !boothIds.contains(id));
    }

    private MutableBoothState fromBooth(BoothResponseDto booth) {
        int service = defaultServicePerMinute(booth.category(), booth.name(), booth.tags());
        int wait = Math.max(0, booth.estimatedWaitMinutes() == null ? 0 : booth.estimatedWaitMinutes());
        int current = clamp(wait * service, 0, MAX_PEOPLE_PER_BOOTH);
        if (current == 0 && wait > 0) {
            current = Math.max(1, wait);
        }
        return new MutableBoothState(
                booth.id(),
                current,
                current,
                defaultIncomingPerMinute(wait),
                1,
                service,
                booth.estimatedWaitMinutes(),
                booth.remainingStock(),
                booth.liveStatusMessage(),
                booth.remainingStock()
        );
    }

    private MutableBoothState fromBoothEntity(Booth booth) {
        int service = defaultServicePerMinute(booth.getCategory(), booth.getName(), booth.getTags());
        int wait = Math.max(0, booth.getEstimatedWaitMinutes() == null ? 0 : booth.getEstimatedWaitMinutes());
        int current = clamp(wait * service, 0, MAX_PEOPLE_PER_BOOTH);
        return new MutableBoothState(
                booth.getId(),
                current,
                current,
                defaultIncomingPerMinute(wait),
                1,
                service,
                booth.getEstimatedWaitMinutes(),
                booth.getRemainingStock(),
                booth.getLiveStatusMessage(),
                booth.getRemainingStock()
        );
    }

    private void applyBoothPatch(SimulationBoothPatchDto patch) {
        if (patch == null || patch.boothId() == null) {
            return;
        }
        MutableBoothState state = states.get(patch.boothId());
        if (state == null) {
            return;
        }
        if (patch.currentPeople() != null) {
            state.currentPeople = clamp(patch.currentPeople(), 0, MAX_PEOPLE_PER_BOOTH);
        }
        if (patch.incomingPerMinute() != null) {
            state.incomingPerMinute = clamp(patch.incomingPerMinute(), 0, 120);
        }
        if (patch.outgoingPerMinute() != null) {
            state.outgoingPerMinute = clamp(patch.outgoingPerMinute(), 0, 120);
        }
        if (patch.servicePerMinute() != null) {
            state.servicePerMinute = clamp(patch.servicePerMinute(), 1, 120);
        }
        state.previousPeople = Math.min(state.previousPeople, MAX_PEOPLE_PER_BOOTH);
        state.carry = 0;
    }

    private void applyCalm(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        state.currentPeople = random.nextInt(0, isFoodBooth(booth) ? 12 : 8);
        state.previousPeople = state.currentPeople;
        state.incomingPerMinute = random.nextInt(1, 5);
        state.outgoingPerMinute = random.nextInt(1, 4);
        state.servicePerMinute = defaultServicePerMinute(booth.category(), booth.name(), booth.tags()) + 2;
        state.carry = 0;
    }

    private void applyLunchPeak(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        if (isFoodBooth(booth)) {
            state.currentPeople = random.nextInt(45, 86);
            state.incomingPerMinute = random.nextInt(18, 32);
            state.outgoingPerMinute = random.nextInt(2, 7);
            state.servicePerMinute = random.nextInt(4, 9);
        } else {
            state.currentPeople = random.nextInt(8, 28);
            state.incomingPerMinute = random.nextInt(4, 11);
            state.outgoingPerMinute = random.nextInt(1, 5);
            state.servicePerMinute = random.nextInt(7, 14);
        }
        state.previousPeople = state.currentPeople;
        state.carry = 0;
    }

    private void applyShowEnd(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        boolean food = isFoodBooth(booth);
        state.currentPeople = food ? random.nextInt(34, 76) : random.nextInt(18, 46);
        state.incomingPerMinute = food ? random.nextInt(14, 28) : random.nextInt(9, 18);
        state.outgoingPerMinute = random.nextInt(2, 7);
        state.servicePerMinute = food ? random.nextInt(5, 10) : random.nextInt(8, 15);
        state.previousPeople = state.currentPeople;
        state.carry = 0;
    }

    private void applySingleBoothSurge(MutableBoothState state, BoothResponseDto booth, Long surgeBoothId, ThreadLocalRandom random) {
        if (booth.id().equals(surgeBoothId)) {
            state.currentPeople = random.nextInt(90, 141);
            state.incomingPerMinute = random.nextInt(26, 42);
            state.outgoingPerMinute = random.nextInt(1, 5);
            state.servicePerMinute = random.nextInt(3, 7);
        } else {
            state.currentPeople = random.nextInt(4, 24);
            state.incomingPerMinute = random.nextInt(2, 9);
            state.outgoingPerMinute = random.nextInt(1, 5);
            state.servicePerMinute = defaultServicePerMinute(booth.category(), booth.name(), booth.tags()) + 1;
        }
        state.previousPeople = state.currentPeople;
        state.carry = 0;
    }

    private void applyEmergencyFlow(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        if (isSupportBooth(booth)) {
            state.currentPeople = random.nextInt(26, 58);
            state.incomingPerMinute = random.nextInt(10, 22);
            state.outgoingPerMinute = random.nextInt(3, 10);
            state.servicePerMinute = random.nextInt(10, 18);
        } else {
            state.currentPeople = random.nextInt(3, 22);
            state.incomingPerMinute = random.nextInt(1, 8);
            state.outgoingPerMinute = random.nextInt(1, 5);
            state.servicePerMinute = defaultServicePerMinute(booth.category(), booth.name(), booth.tags());
        }
        state.previousPeople = state.currentPeople;
        state.carry = 0;
    }

    private int estimateWaitMinutes(MutableBoothState state) {
        int service = Math.max(1, state.servicePerMinute);
        return clamp((int) Math.ceil(state.currentPeople / (double) service), 0, 180);
    }

    private String levelForPeople(int people) {
        if (people < 8) {
            return "여유";
        }
        if (people < 20) {
            return "보통";
        }
        if (people < 40) {
            return "혼잡";
        }
        return "매우 혼잡";
    }

    private int consumeWholeDelta(MutableBoothState state) {
        int whole = (int) state.carry;
        state.carry -= whole;
        return whole;
    }

    private int jitterDelta(int currentPeople, ThreadLocalRandom random) {
        if (jitterPercent <= 0 || currentPeople == 0) {
            return 0;
        }
        int max = Math.max(1, Math.min(8, (int) Math.round(currentPeople * (jitterPercent / 100.0) * 0.25)));
        return random.nextInt(-max, max + 1);
    }

    private int defaultServicePerMinute(String category, String name, String tags) {
        String text = normalize(category + " " + name + " " + tags);
        if (text.contains("응급") || text.contains("안내") || text.contains("본부")) {
            return 12;
        }
        if (text.contains("공연") || text.contains("무대")) {
            return 20;
        }
        if (text.contains("체험") || text.contains("이벤트")) {
            return 8;
        }
        return 5;
    }

    private int defaultIncomingPerMinute(int wait) {
        if (wait >= 30) {
            return 16;
        }
        if (wait >= 15) {
            return 10;
        }
        if (wait >= 5) {
            return 5;
        }
        return 2;
    }

    private boolean isFoodBooth(BoothResponseDto booth) {
        String text = normalize(booth.category() + " " + booth.name() + " " + booth.tags());
        return text.contains("주점")
                || text.contains("음식")
                || text.contains("푸드")
                || text.contains("메뉴")
                || text.contains("닭")
                || text.contains("치즈")
                || text.contains("카페");
    }

    private boolean isSupportBooth(BoothResponseDto booth) {
        String text = normalize(booth.category() + " " + booth.name() + " " + booth.tags());
        return text.contains("응급")
                || text.contains("안내")
                || text.contains("본부")
                || text.contains("케어")
                || text.contains("분실");
    }

    private String normalizeScenario(String value) {
        String normalized = normalize(value);
        return switch (normalized) {
            case "calm", "lunch-peak", "show-end", "single-booth-surge", "emergency-flow" -> normalized;
            default -> "calm";
        };
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static final class MutableBoothState {
        private final Long boothId;
        private int currentPeople;
        private int previousPeople;
        private int incomingPerMinute;
        private int outgoingPerMinute;
        private int servicePerMinute;
        private final Integer originalWaitMinutes;
        private final Integer originalRemainingStock;
        private final String originalLiveStatusMessage;
        private Integer remainingStock;
        private double carry;

        private MutableBoothState(
                Long boothId,
                int currentPeople,
                int previousPeople,
                int incomingPerMinute,
                int outgoingPerMinute,
                int servicePerMinute,
                Integer originalWaitMinutes,
                Integer originalRemainingStock,
                String originalLiveStatusMessage,
                Integer remainingStock
        ) {
            this.boothId = boothId;
            this.currentPeople = currentPeople;
            this.previousPeople = previousPeople;
            this.incomingPerMinute = incomingPerMinute;
            this.outgoingPerMinute = outgoingPerMinute;
            this.servicePerMinute = servicePerMinute;
            this.originalWaitMinutes = originalWaitMinutes;
            this.originalRemainingStock = originalRemainingStock;
            this.originalLiveStatusMessage = originalLiveStatusMessage;
            this.remainingStock = remainingStock;
        }
    }

    public record SimulationTickState(
            Long boothId,
            Integer estimatedWaitMinutes,
            Integer remainingStock,
            String liveStatusMessage
    ) {
    }

    public record SimulationOriginalState(
            Long boothId,
            Integer estimatedWaitMinutes,
            Integer remainingStock,
            String liveStatusMessage
    ) {
    }

    public record SimulationBoothSnapshot(
            Long boothId,
            String boothName,
            double latitude,
            double longitude,
            int currentPeople,
            int previousPeople,
            int estimatedWaitMinutes,
            String congestionLevel
    ) {
    }
}
