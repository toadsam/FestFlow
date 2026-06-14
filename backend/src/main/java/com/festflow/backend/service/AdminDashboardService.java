package com.festflow.backend.service;

import com.festflow.backend.dto.AdminDashboardKpiDto;
import com.festflow.backend.dto.CongestionKpiDto;
import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.repository.GpsLogRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
/**
 * [서비스 상세 주석] 관리자 대시보드 KPI를 계산합니다.
 * 이 클래스의 핵심은 여러 Repository에서 가져온 원본 데이터를 화면 카드에 맞는 숫자와 요약 DTO로 바꿉니다.
 * 주요 관심사는 DB 조회/저장입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AdminDashboardService {

    private static final Set<String> UPCOMING_STATUSES = Set.of(
            "\uC608\uC815",
            "\uB300\uAE30\uC911",
            "\uACE7 \uC2DC\uC791"
    );
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final GpsLogRepository gpsLogRepository;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
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
    public AdminDashboardService(GpsLogRepository gpsLogRepository, BoothService boothService, EventService eventService) {
        this.gpsLogRepository = gpsLogRepository;
        this.boothService = boothService;
        this.eventService = eventService;
    }
/**
 * [상세 주석] getKpis 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: AdminDashboardKpiDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public AdminDashboardKpiDto getKpis() {
        LocalDateTime now = LocalDateTime.now();

        // 오늘 00:00부터 현재까지 들어온 GPS 로그 수를 "오늘 총 방문자" 지표로 사용한다.
        LocalDateTime startOfDay = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        long todayVisitors = gpsLogRepository.countByCreatedAtBetween(startOfDay, now);

        // 현재 시점 기준 가장 혼잡한 부스를 계산한다.
        List<CongestionResponseDto> congestions = boothService.getAllCongestions();
        CongestionKpiDto mostCongested = congestions.stream()
                .max(Comparator.comparingInt(CongestionResponseDto::nearbyUserCount))
                .map(item -> new CongestionKpiDto(item.boothId(), item.boothName(), item.level(), item.nearbyUserCount()))
                .orElse(null);

        // 30분 이내 시작 예정 공연 중 가장 가까운 공연을 KPI로 노출한다.
        EventResponseDto upcoming = eventService.getAllEvents().stream()
                .filter(event -> UPCOMING_STATUSES.contains(event.status()))
                .filter(event -> event.startTime() != null)
                .filter(event -> !event.startTime().isBefore(now) && !event.startTime().isAfter(now.plusMinutes(30)))
                .min(Comparator.comparing(EventResponseDto::startTime))
                .orElse(null);

        return new AdminDashboardKpiDto(todayVisitors, mostCongested, upcoming);
    }
}
