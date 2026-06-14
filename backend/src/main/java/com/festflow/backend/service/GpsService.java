package com.festflow.backend.service;

import com.festflow.backend.dto.GpsLogRequestDto;
import com.festflow.backend.dto.GpsLogResponseDto;
import com.festflow.backend.entity.GpsLog;
import com.festflow.backend.repository.GpsLogRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.stereotype.Service;
/**
 * [서비스 상세 주석] 사용자 GPS 로그를 저장하고 혼잡도 갱신을 유발합니다.
 * 이 클래스의 핵심은 위치 로그 저장 후 SSE로 혼잡도 화면을 새로고침 없이 갱신하게 합니다.
 * 주요 관심사는 DB 조회/저장, SSE 실시간 갱신입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class GpsService {
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final GpsLogRepository gpsLogRepository;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final StreamService streamService;
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
    public GpsService(GpsLogRepository gpsLogRepository, BoothService boothService, StreamService streamService) {
        this.gpsLogRepository = gpsLogRepository;
        this.boothService = boothService;
        this.streamService = streamService;
    }
/**
 * [상세 주석] saveGpsLog 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: GpsLogResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    public GpsLogResponseDto saveGpsLog(GpsLogRequestDto requestDto) {
        GpsLog saved = gpsLogRepository.save(new GpsLog(requestDto.latitude(), requestDto.longitude()));
        streamService.publishCongestion(boothService.getAllCongestions());
        return new GpsLogResponseDto(saved.getId(), saved.getCreatedAt(), "GPS \uB85C\uADF8\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }
}
