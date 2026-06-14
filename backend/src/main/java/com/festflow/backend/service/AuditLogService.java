package com.festflow.backend.service;

import com.festflow.backend.dto.AuditLogResponseDto;
import com.festflow.backend.entity.AuditLog;
import com.festflow.backend.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

import java.util.List;
/**
 * [서비스 상세 주석] 관리자 작업 이력을 기록합니다.
 * 이 클래스의 핵심은 운영 중 누가 어떤 작업을 했는지 추적할 수 있게 로그 Entity를 남깁니다.
 * 주요 관심사는 DB 조회/저장입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AuditLogService {
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final AuditLogRepository auditLogRepository;
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
    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }
/**
 * [상세 주석] log 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    public void log(String adminUsername, String action, String targetType, Long targetId, String details) {
        auditLogRepository.save(new AuditLog(
                adminUsername != null ? adminUsername : "unknown",
                action,
                targetType,
                targetId,
                details
        ));
    }
/**
 * [상세 주석] getRecentLogs 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<AuditLogResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public List<AuditLogResponseDto> getRecentLogs() {
        return auditLogRepository.findTop50ByOrderByCreatedAtDesc().stream()
                .map(log -> new AuditLogResponseDto(
                        log.getId(),
                        log.getAdminUsername(),
                        log.getAction(),
                        log.getTargetType(),
                        log.getTargetId(),
                        log.getDetails(),
                        log.getCreatedAt()
                ))
                .toList();
    }
}
