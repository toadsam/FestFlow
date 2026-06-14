package com.festflow.backend.service;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.SimulationFlowEventDto;
import com.festflow.backend.dto.SimulationBoothPatchDto;
import com.festflow.backend.dto.SimulationBoothStateDto;
import com.festflow.backend.dto.SimulationPatchRequestDto;
import com.festflow.backend.dto.SimulationStagePatchDto;
import com.festflow.backend.dto.SimulationStageStateDto;
import com.festflow.backend.dto.SimulationStatusDto;
import com.festflow.backend.entity.Booth;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
/**
 * [서비스 상세 주석] 시뮬레이션 내부 상태와 변화량을 계산합니다.
 * 이 클래스의 핵심은 메모리 상태를 기준으로 혼잡도, 대기시간, 재고 변화를 만들고 동시 접근을 제어합니다.
 * 주요 관심사는 일반 서비스 로직입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class SimulationStateService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final int DEFAULT_TICK_SECONDS = 3;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int DEFAULT_JITTER_PERCENT = 12;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int MAX_PEOPLE_PER_BOOTH = 250;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int MAX_STAGE_PEOPLE = 4000;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int STAGE_CAPACITY_HINT = 4000;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int STAGE_RADIUS_METERS = 55;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final int MAX_FLOW_EVENTS = 8;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final String STAGE_ZONE_KEY = "open-air-theater";
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final String STAGE_ZONE_NAME = "아주대 노천극장";
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final double STAGE_LATITUDE = 37.281785;
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final double STAGE_LONGITUDE = 127.045501;
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
    private final Map<Long, MutableBoothState> states = new ConcurrentHashMap<>();
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final Deque<SimulationFlowEventDto> flowEvents = new ArrayDeque<>();
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private MutableStageState stage = defaultStageState();
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
    private boolean running;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private String scenario = "manual";
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int tickSeconds = DEFAULT_TICK_SECONDS;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int jitterPercent = DEFAULT_JITTER_PERCENT;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private LocalDateTime updatedAt = LocalDateTime.now();
/**
 * [상세 주석] snapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: SimulationStatusDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public synchronized SimulationStatusDto snapshot(List<BoothResponseDto> booths, boolean enabled) {
        seedMissing(booths);
        removeMissing(booths.stream().map(BoothResponseDto::id).toList());
        return toStatus(booths, enabled);
    }
/**
 * [상세 주석] patch 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: SimulationStatusDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized SimulationStatusDto patch(List<BoothResponseDto> booths, SimulationPatchRequestDto request, boolean enabled) {
        seedMissing(booths);
        if (request != null) {
            if (request.tickSeconds() != null) {
                tickSeconds = clamp(request.tickSeconds(), 1, 30);
            }
            if (request.jitterPercent() != null) {
                jitterPercent = clamp(request.jitterPercent(), 0, 50);
            }
            if (request.stage() != null) {
                applyStagePatch(request.stage());
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
/**
 * [상세 주석] applyScenario 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: SimulationStatusDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
        applyStageScenario(resolved, random);
        flowEvents.clear();

        scenario = resolved;
        updatedAt = LocalDateTime.now();
        return toStatus(booths, enabled);
    }
/**
 * [상세 주석] tick 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 시뮬레이션 시간을 한 단계 진행시키고 변화량을 반영하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<SimulationTickState>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public synchronized List<SimulationTickState> tick(List<BoothResponseDto> booths) {
        seedMissing(booths);
        if (!running) {
            return List.of();
        }

        ThreadLocalRandom random = ThreadLocalRandom.current();
        flowEvents.clear();
        stage.previousPeople = stage.currentPeople;
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

        moveBoothsToStage(booths, consumeStageIncoming(), random);
        moveStageToBooths(booths, consumeStageOutgoing(), random);
        moveBetweenBooths(booths, random);
        stage.currentPeople = clamp(stage.currentPeople + jitterDelta(stage.currentPeople, random), 0, MAX_STAGE_PEOPLE);

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
/**
 * [상세 주석] start 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized void start(List<BoothResponseDto> booths) {
        seedMissing(booths);
        flowEvents.clear();
        running = true;
        updatedAt = LocalDateTime.now();
    }
/**
 * [상세 주석] stop 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized void stop() {
        running = false;
        updatedAt = LocalDateTime.now();
    }
/**
 * [상세 주석] originalStates 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<SimulationOriginalState>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] clear 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized void clear(List<BoothResponseDto> booths) {
        states.clear();
        stage = defaultStageState();
        flowEvents.clear();
        running = false;
        scenario = "manual";
        tickSeconds = DEFAULT_TICK_SECONDS;
        jitterPercent = DEFAULT_JITTER_PERCENT;
        updatedAt = LocalDateTime.now();
        seedMissing(booths);
    }
/**
 * [상세 주석] simulatedCongestion 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Optional<CongestionResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] isRunning 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized boolean isRunning() {
        return running;
    }
/**
 * [상세 주석] boothSnapshots 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<SimulationBoothSnapshot>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
/**
 * [상세 주석] stageSnapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: Optional<SimulationStageSnapshot>입니다. 결과가 있을 수도 없을 수도 있음을 표현합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public synchronized Optional<SimulationStageSnapshot> stageSnapshot() {
        if (!running) {
            return Optional.empty();
        }
        return Optional.of(new SimulationStageSnapshot(
                STAGE_ZONE_KEY,
                STAGE_ZONE_NAME,
                STAGE_LATITUDE,
                STAGE_LONGITUDE,
                STAGE_RADIUS_METERS,
                stage.currentPeople,
                stage.previousPeople,
                STAGE_CAPACITY_HINT,
                levelForStagePeople(stage.currentPeople)
        ));
    }
/**
 * [상세 주석] toStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: SimulationStatusDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
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
        int totalPeople = boothStates.stream().mapToInt(SimulationBoothStateDto::currentPeople).sum() + stage.currentPeople;
        return new SimulationStatusDto(
                enabled,
                running,
                scenario,
                tickSeconds,
                jitterPercent,
                updatedAt,
                totalPeople,
                boothStates,
                new SimulationStageStateDto(
                        STAGE_ZONE_KEY,
                        STAGE_ZONE_NAME,
                        stage.currentPeople,
                        stage.previousPeople,
                        stage.incomingPerMinute,
                        stage.outgoingPerMinute,
                        STAGE_CAPACITY_HINT,
                        levelForStagePeople(stage.currentPeople)
                ),
                List.copyOf(flowEvents)
        );
    }
/**
 * [상세 주석] seedMissing 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void seedMissing(List<BoothResponseDto> booths) {
        for (BoothResponseDto booth : booths) {
            states.computeIfAbsent(booth.id(), ignored -> fromBooth(booth));
        }
    }
/**
 * [상세 주석] seedMissingEntities 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void seedMissingEntities(List<Booth> booths) {
        for (Booth booth : booths) {
            states.computeIfAbsent(booth.getId(), ignored -> fromBoothEntity(booth));
        }
    }
/**
 * [상세 주석] removeMissing 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void removeMissing(List<Long> boothIds) {
        states.keySet().removeIf(id -> !boothIds.contains(id));
    }
/**
 * [상세 주석] fromBooth 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: MutableBoothState 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] fromBoothEntity 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: MutableBoothState 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] applyBoothPatch 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] applyStagePatch 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void applyStagePatch(SimulationStagePatchDto patch) {
        if (patch == null) {
            return;
        }
        if (patch.currentPeople() != null) {
            stage.currentPeople = clamp(patch.currentPeople(), 0, MAX_STAGE_PEOPLE);
        }
        if (patch.incomingPerMinute() != null) {
            stage.incomingPerMinute = clamp(patch.incomingPerMinute(), 0, 800);
        }
        if (patch.outgoingPerMinute() != null) {
            stage.outgoingPerMinute = clamp(patch.outgoingPerMinute(), 0, 800);
        }
        stage.previousPeople = Math.min(stage.previousPeople, MAX_STAGE_PEOPLE);
        stage.incomingCarry = 0;
        stage.outgoingCarry = 0;
    }
/**
 * [상세 주석] applyStageScenario 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void applyStageScenario(String resolved, ThreadLocalRandom random) {
        switch (resolved) {
            case "lunch-peak" -> {
                stage.currentPeople = random.nextInt(450, 900);
                stage.incomingPerMinute = random.nextInt(60, 130);
                stage.outgoingPerMinute = random.nextInt(120, 240);
            }
            case "show-end" -> {
                stage.currentPeople = random.nextInt(3000, 3900);
                stage.incomingPerMinute = random.nextInt(20, 80);
                stage.outgoingPerMinute = random.nextInt(360, 720);
            }
            case "single-booth-surge" -> {
                stage.currentPeople = random.nextInt(900, 1700);
                stage.incomingPerMinute = random.nextInt(80, 180);
                stage.outgoingPerMinute = random.nextInt(90, 210);
            }
            case "emergency-flow" -> {
                stage.currentPeople = random.nextInt(1200, 2600);
                stage.incomingPerMinute = random.nextInt(0, 50);
                stage.outgoingPerMinute = random.nextInt(280, 620);
            }
            default -> {
                stage.currentPeople = random.nextInt(180, 520);
                stage.incomingPerMinute = random.nextInt(20, 70);
                stage.outgoingPerMinute = random.nextInt(20, 70);
            }
        }
        stage.previousPeople = stage.currentPeople;
        stage.incomingCarry = 0;
        stage.outgoingCarry = 0;
    }
/**
 * [상세 주석] consumeStageIncoming 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int consumeStageIncoming() {
        stage.incomingCarry += stage.incomingPerMinute * (tickSeconds / 60.0);
        int whole = (int) stage.incomingCarry;
        stage.incomingCarry -= whole;
        return Math.max(0, whole);
    }
/**
 * [상세 주석] consumeStageOutgoing 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int consumeStageOutgoing() {
        stage.outgoingCarry += stage.outgoingPerMinute * (tickSeconds / 60.0);
        int whole = (int) stage.outgoingCarry;
        stage.outgoingCarry -= whole;
        return Math.max(0, whole);
    }
/**
 * [상세 주석] moveBoothsToStage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private void moveBoothsToStage(List<BoothResponseDto> booths, int requestedPeople, ThreadLocalRandom random) {
        if (requestedPeople <= 0 || booths.isEmpty()) {
            return;
        }
        int remaining = requestedPeople;
        List<BoothResponseDto> sources = booths.stream()
                .filter(booth -> states.containsKey(booth.id()))
                .sorted((left, right) -> Integer.compare(
                        states.get(right.id()).currentPeople,
                        states.get(left.id()).currentPeople
                ))
                .limit(4)
                .toList();

        for (BoothResponseDto source : sources) {
            if (remaining <= 0) {
                break;
            }
            MutableBoothState sourceState = states.get(source.id());
            if (sourceState == null || sourceState.currentPeople <= 2) {
                continue;
            }
            int moved = Math.min(remaining, Math.max(1, Math.min(sourceState.currentPeople / 8, random.nextInt(1, 5))));
            moved = Math.min(moved, sourceState.currentPeople);
            sourceState.currentPeople -= moved;
            stage.currentPeople = clamp(stage.currentPeople + moved, 0, MAX_STAGE_PEOPLE);
            remaining -= moved;
            addFlow(source.name(), STAGE_ZONE_NAME, moved, "공연 관람 이동");
        }
    }
/**
 * [상세 주석] moveStageToBooths 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private void moveStageToBooths(List<BoothResponseDto> booths, int requestedPeople, ThreadLocalRandom random) {
        if (requestedPeople <= 0 || booths.isEmpty() || stage.currentPeople <= 0) {
            return;
        }
        int remaining = Math.min(requestedPeople, stage.currentPeople);
        List<BoothResponseDto> targets = new ArrayList<>(booths.stream()
                .filter(this::isFoodBooth)
                .filter(booth -> states.containsKey(booth.id()))
                .sorted(Comparator.comparingInt(booth -> states.get(booth.id()).currentPeople))
                .limit(5)
                .toList());
        if (targets.isEmpty()) {
            targets = booths.stream()
                    .filter(booth -> states.containsKey(booth.id()))
                    .sorted(Comparator.comparingInt(booth -> states.get(booth.id()).currentPeople))
                    .limit(5)
                    .toList();
        }

        for (BoothResponseDto target : targets) {
            if (remaining <= 0) {
                break;
            }
            MutableBoothState targetState = states.get(target.id());
            if (targetState == null) {
                continue;
            }
            int moved = Math.min(remaining, random.nextInt(1, Math.max(2, Math.min(8, remaining) + 1)));
            stage.currentPeople -= moved;
            targetState.currentPeople = clamp(targetState.currentPeople + moved, 0, MAX_PEOPLE_PER_BOOTH);
            remaining -= moved;
            addFlow(STAGE_ZONE_NAME, target.name(), moved, scenario.equals("show-end") ? "공연 종료 후 주점 이동" : "무대 이탈");
        }
    }
/**
 * [상세 주석] moveBetweenBooths 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private void moveBetweenBooths(List<BoothResponseDto> booths, ThreadLocalRandom random) {
        if (booths.size() < 2) {
            return;
        }
        BoothResponseDto source = booths.stream()
                .filter(booth -> states.containsKey(booth.id()))
                .filter(booth -> states.get(booth.id()).currentPeople >= 24)
                .max(Comparator.comparingInt(booth -> states.get(booth.id()).currentPeople))
                .orElse(null);
        BoothResponseDto target = booths.stream()
                .filter(booth -> states.containsKey(booth.id()))
                .filter(booth -> source == null || !booth.id().equals(source.id()))
                .min(Comparator.comparingInt(booth -> states.get(booth.id()).currentPeople))
                .orElse(null);
        if (source == null || target == null) {
            return;
        }
        MutableBoothState sourceState = states.get(source.id());
        MutableBoothState targetState = states.get(target.id());
        if (sourceState == null || targetState == null || sourceState.currentPeople <= targetState.currentPeople + 12) {
            return;
        }
        int moved = Math.min(sourceState.currentPeople - 10, random.nextInt(1, 5));
        if (moved <= 0) {
            return;
        }
        sourceState.currentPeople -= moved;
        targetState.currentPeople = clamp(targetState.currentPeople + moved, 0, MAX_PEOPLE_PER_BOOTH);
        addFlow(source.name(), target.name(), moved, "혼잡 분산 이동");
    }
/**
 * [상세 주석] addFlow 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void addFlow(String from, String to, int people, String reason) {
        if (people <= 0) {
            return;
        }
        flowEvents.addFirst(new SimulationFlowEventDto(from, to, people, reason));
        while (flowEvents.size() > MAX_FLOW_EVENTS) {
            flowEvents.removeLast();
        }
    }
/**
 * [상세 주석] applyCalm 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void applyCalm(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        state.currentPeople = random.nextInt(0, isFoodBooth(booth) ? 12 : 8);
        state.previousPeople = state.currentPeople;
        state.incomingPerMinute = random.nextInt(1, 5);
        state.outgoingPerMinute = random.nextInt(1, 4);
        state.servicePerMinute = defaultServicePerMinute(booth.category(), booth.name(), booth.tags()) + 2;
        state.carry = 0;
    }
/**
 * [상세 주석] applyLunchPeak 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] applyShowEnd 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void applyShowEnd(MutableBoothState state, BoothResponseDto booth, ThreadLocalRandom random) {
        boolean food = isFoodBooth(booth);
        state.currentPeople = food ? random.nextInt(34, 76) : random.nextInt(18, 46);
        state.incomingPerMinute = food ? random.nextInt(14, 28) : random.nextInt(9, 18);
        state.outgoingPerMinute = random.nextInt(2, 7);
        state.servicePerMinute = food ? random.nextInt(5, 10) : random.nextInt(8, 15);
        state.previousPeople = state.currentPeople;
        state.carry = 0;
    }
/**
 * [상세 주석] applySingleBoothSurge 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] applyEmergencyFlow 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] estimateWaitMinutes 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int estimateWaitMinutes(MutableBoothState state) {
        int service = Math.max(1, state.servicePerMinute);
        return clamp((int) Math.ceil(state.currentPeople / (double) service), 0, 180);
    }
/**
 * [상세 주석] levelForPeople 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] levelForStagePeople 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String levelForStagePeople(int people) {
        double ratio = people / (double) STAGE_CAPACITY_HINT;
        if (ratio < 0.35) {
            return "여유";
        }
        if (ratio < 0.65) {
            return "보통";
        }
        if (ratio < 0.9) {
            return "혼잡";
        }
        return "매우 혼잡";
    }
/**
 * [상세 주석] consumeWholeDelta 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int consumeWholeDelta(MutableBoothState state) {
        int whole = (int) state.carry;
        state.carry -= whole;
        return whole;
    }
/**
 * [상세 주석] jitterDelta 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int jitterDelta(int currentPeople, ThreadLocalRandom random) {
        if (jitterPercent <= 0 || currentPeople == 0) {
            return 0;
        }
        int max = Math.max(1, Math.min(80, (int) Math.round(currentPeople * (jitterPercent / 100.0) * 0.25)));
        return random.nextInt(-max, max + 1);
    }
/**
 * [상세 주석] defaultServicePerMinute 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] defaultIncomingPerMinute 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] defaultStageState 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: MutableStageState 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private MutableStageState defaultStageState() {
        return new MutableStageState(280, 280, 35, 35);
    }
/**
 * [상세 주석] isFoodBooth 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] isSupportBooth 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean isSupportBooth(BoothResponseDto booth) {
        String text = normalize(booth.category() + " " + booth.name() + " " + booth.tags());
        return text.contains("응급")
                || text.contains("안내")
                || text.contains("본부")
                || text.contains("케어")
                || text.contains("분실");
    }
/**
 * [상세 주석] normalizeScenario 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeScenario(String value) {
        String normalized = normalize(value);
        return switch (normalized) {
            case "calm", "lunch-peak", "show-end", "single-booth-surge", "emergency-flow" -> normalized;
            default -> "calm";
        };
    }
/**
 * [상세 주석] normalize 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
/**
 * [상세 주석] clamp 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static final class MutableBoothState {
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final Long boothId;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int currentPeople;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int previousPeople;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int incomingPerMinute;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int outgoingPerMinute;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private int servicePerMinute;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final Integer originalWaitMinutes;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final Integer originalRemainingStock;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final String originalLiveStatusMessage;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private Integer remainingStock;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
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

    private static final class MutableStageState {
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int currentPeople;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int previousPeople;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int incomingPerMinute;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int outgoingPerMinute;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private double incomingCarry;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private double outgoingCarry;

        private MutableStageState(
                int currentPeople,
                int previousPeople,
                int incomingPerMinute,
                int outgoingPerMinute
        ) {
            this.currentPeople = currentPeople;
            this.previousPeople = previousPeople;
            this.incomingPerMinute = incomingPerMinute;
            this.outgoingPerMinute = outgoingPerMinute;
        }
    }
/**
 * [상세 주석] SimulationTickState 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public record SimulationTickState(
            Long boothId,
            Integer estimatedWaitMinutes,
            Integer remainingStock,
            String liveStatusMessage
    ) {
    }
/**
 * [상세 주석] SimulationOriginalState 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 재고가 부족하거나 소진된 경우 방문 추천에서 불리하게 작용하거나 운영 경고 이유가 됩니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public record SimulationOriginalState(
            Long boothId,
            Integer estimatedWaitMinutes,
            Integer remainingStock,
            String liveStatusMessage
    ) {
    }
/**
 * [상세 주석] SimulationBoothSnapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
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
/**
 * [상세 주석] SimulationStageSnapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public record SimulationStageSnapshot(
            String zoneKey,
            String zoneName,
            double latitude,
            double longitude,
            int radiusMeters,
            int currentPeople,
            int previousPeople,
            int capacityHint,
            String congestionLevel
    ) {
    }
}
