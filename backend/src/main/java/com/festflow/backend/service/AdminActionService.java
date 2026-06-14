package com.festflow.backend.service;

import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.NoticeUpsertRequestDto;
import org.springframework.stereotype.Service;
/**
 * [서비스 상세 주석] 관리자 빠른 조치 기능을 처리합니다.
 * 이 클래스의 핵심은 혼잡 완화 공지처럼 여러 도메인 서비스를 한 번에 묶어 운영자가 바로 실행할 수 있게 합니다.
 * 주요 관심사는 SSE 실시간 갱신입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AdminActionService {
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final NoticeService noticeService;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public AdminActionService(BoothService boothService, EventService eventService, NoticeService noticeService) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
    }
/**
 * [상세 주석] publishCongestionReliefNotice 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: NoticeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public NoticeResponseDto publishCongestionReliefNotice() {
        CongestionResponseDto mostCongested = boothService.getMostCongestedBooth();
        String targetBooth = mostCongested != null ? mostCongested.boothName() : "현장 전체";

        return noticeService.createNotice(new NoticeUpsertRequestDto(
                "혼잡 완화 안내",
                targetBooth + " 주변이 매우 붐빕니다. 중앙광장 우회 동선을 이용해 주세요.",
                "긴급",
                true
        ));
    }
/**
 * [상세 주석] publishEventStartNotice 메서드는 SSE 실시간 이벤트를 프론트로 발행합니다.
 * 한줄 요약: 변경 내용을 실시간 SSE 이벤트로 프론트에 알리는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: NoticeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public NoticeResponseDto publishEventStartNotice(Long eventId) {
        EventResponseDto event = eventService.getEventById(eventId);

        return noticeService.createNotice(new NoticeUpsertRequestDto(
                "공연 시작 안내",
                "지금부터 '" + event.title() + "' 공연이 시작됩니다. 관객석으로 이동해 주세요.",
                "긴급",
                true
        ));
    }
}
