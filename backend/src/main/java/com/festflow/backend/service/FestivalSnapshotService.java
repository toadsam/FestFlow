package com.festflow.backend.service;

import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.StaffMemberResponseDto;
import com.festflow.backend.entity.BoothReservation;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.repository.BoothReservationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
/**
 * [서비스 상세 주석] 현재 축제 상태를 한 번에 모읍니다.
 * 이 클래스의 핵심은 AI와 운영 분석이 부스, 예약, 공연, 스태프 데이터를 한 번에 볼 수 있게 스냅샷으로 묶습니다.
 * 주요 관심사는 DB 조회/저장입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class FestivalSnapshotService {
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final NoticeService noticeService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final LostItemService lostItemService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final StaffService staffService;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final BoothReservationRepository boothReservationRepository;
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
    public FestivalSnapshotService(
            BoothService boothService,
            EventService eventService,
            NoticeService noticeService,
            LostItemService lostItemService,
            StaffService staffService,
            BoothReservationRepository boothReservationRepository
    ) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
        this.lostItemService = lostItemService;
        this.staffService = staffService;
        this.boothReservationRepository = boothReservationRepository;
    }
/**
 * [상세 주석] current 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 현재 축제 운영 상태를 한 번에 모아 스냅샷으로 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: FestivalSnapshot 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional(readOnly = true)
    public FestivalSnapshot current() {
        List<BoothResponseDto> booths = boothService.getAllBooths();
        List<CongestionResponseDto> congestions = safeCongestions();
        Map<Long, CongestionResponseDto> congestionByBoothId = congestions.stream()
                .collect(Collectors.toMap(CongestionResponseDto::boothId, Function.identity(), (a, b) -> a));
        List<BoothReservation> reservations = boothReservationRepository.findAll();
        List<EventResponseDto> events = eventService.getAllEvents();
        List<NoticeResponseDto> notices = noticeService.getActiveNotices();
        List<LostItemResponseDto> lostItems = lostItemService.getAll(true);
        List<StaffMemberResponseDto> staff = staffService.getAllStaffMembers();

        return new FestivalSnapshot(
                LocalDateTime.now(),
                booths,
                congestions,
                congestionByBoothId,
                reservations,
                events,
                notices,
                lostItems,
                staff
        );
    }
/**
 * [상세 주석] safeCongestions 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<CongestionResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<CongestionResponseDto> safeCongestions() {
        try {
            return boothService.getAllCongestions();
        } catch (Exception ex) {
            return List.of();
        }
    }
/**
 * [상세 주석] FestivalSnapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public record FestivalSnapshot(
            LocalDateTime capturedAt,
            List<BoothResponseDto> booths,
            List<CongestionResponseDto> congestions,
            Map<Long, CongestionResponseDto> congestionByBoothId,
            List<BoothReservation> reservations,
            List<EventResponseDto> events,
            List<NoticeResponseDto> notices,
            List<LostItemResponseDto> lostItems,
            List<StaffMemberResponseDto> staff
    ) {
/**
 * [상세 주석] reservationCount 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
public long reservationCount(Long boothId, ReservationStatus status) {
            return reservations.stream()
                    .filter(reservation -> reservation.getBooth().getId().equals(boothId))
                    .filter(reservation -> reservation.getStatus() == status)
                    .count();
        }
/**
 * [상세 주석] activeReservationCount 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
        public long activeReservationCount(Long boothId) {
            return reservations.stream()
                    .filter(reservation -> reservation.getBooth().getId().equals(boothId))
                    .filter(reservation -> reservation.getStatus() == ReservationStatus.RESERVED
                            || reservation.getStatus() == ReservationStatus.CHECKED_IN)
                    .count();
        }
    }
}
