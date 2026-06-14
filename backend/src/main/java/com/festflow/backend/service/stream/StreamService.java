package com.festflow.backend.service.stream;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
/**
 * [서비스 상세 주석] SSE 연결과 실시간 이벤트 발행을 담당합니다.
 * 이 클래스의 핵심은 프론트 EventSource 연결을 보관하고 변경 이벤트가 생기면 브라우저로 밀어줍니다.
 * 주요 관심사는 SSE 실시간 갱신입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class StreamService {
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
    private final List<SseEmitter> congestionEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> eventEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> noticeEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> boothEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> staffEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> lostItemEmitters = new CopyOnWriteArrayList<>();
// [의존성 주석] 여러 값을 메모리에 보관하는 컬렉션입니다. SSE 연결 목록이나 임시 상태를 관리할 때 사용됩니다.
private final List<SseEmitter> reservationEmitters = new CopyOnWriteArrayList<>();
/**
 * [상세 주석] subscribeCongestion 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeCongestion() {
        return createEmitter(congestionEmitters);
    }
/**
 * [상세 주석] subscribeEvents 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeEvents() {
        return createEmitter(eventEmitters);
    }
/**
 * [상세 주석] subscribeNotices 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeNotices() {
        return createEmitter(noticeEmitters);
    }
/**
 * [상세 주석] subscribeBooths 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeBooths() {
        return createEmitter(boothEmitters);
    }
/**
 * [상세 주석] subscribeStaff 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeStaff() {
        return createEmitter(staffEmitters);
    }
/**
 * [상세 주석] subscribeLostItems 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeLostItems() {
        return createEmitter(lostItemEmitters);
    }
/**
 * [상세 주석] subscribeReservations 메서드는 프론트 EventSource가 구독할 SSE 연결을 만듭니다.
 * 한줄 요약: 프론트가 실시간 이벤트를 받을 수 있도록 SSE 구독 연결을 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    public SseEmitter subscribeReservations() {
        return createEmitter(reservationEmitters);
    }
/**
 * [상세 주석] publishCongestion 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishCongestion(Object payload) {
        send(congestionEmitters, "congestion", payload);
    }
/**
 * [상세 주석] publishEvents 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishEvents(Object payload) {
        send(eventEmitters, "events", payload);
    }
/**
 * [상세 주석] publishNotices 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishNotices(Object payload) {
        send(noticeEmitters, "notices", payload);
    }
/**
 * [상세 주석] publishBooths 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishBooths(Object payload) {
        send(boothEmitters, "booths", payload);
    }
/**
 * [상세 주석] publishStaff 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishStaff(Object payload) {
        send(staffEmitters, "staff", payload);
    }
/**
 * [상세 주석] publishLostItems 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishLostItems(Object payload) {
        send(lostItemEmitters, "lost-items", payload);
    }
/**
 * [상세 주석] publishReservations 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void publishReservations(Object payload) {
        send(reservationEmitters, "reservations", payload);
    }
/**
 * [상세 주석] createEmitter 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 프론트 SSE 연결을 만들고 연결 목록에 등록하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: SseEmitter 타입 값을 반환합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 프론트가 EventSource로 접속하면 SseEmitter를 만들고 목록에 저장합니다.
 * - 연결이 완료, timeout, error 상태가 되면 목록에서 제거해 죽은 연결이 계속 남지 않게 합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
    private SseEmitter createEmitter(List<SseEmitter> emitters) {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((e) -> emitters.remove(emitter));
        return emitter;
    }
/**
 * [상세 주석] send 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 등록된 SSE 연결들에게 이벤트 이름과 데이터를 보내는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 현재 연결된 모든 SseEmitter에 이벤트 이름과 payload를 전송합니다.
 * - 전송 중 IOException이 발생한 emitter는 죽은 연결로 보고 dead 목록에 모았다가 제거합니다.
 * 초보자 포인트: fetch처럼 한 번 응답하고 끝나는 구조가 아니라 연결을 유지해 서버가 계속 이벤트를 보내는 구조입니다.
 */
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
