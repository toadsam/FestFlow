package com.festflow.backend.service;

import com.festflow.backend.dto.AiDecisionLogDto;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
/**
 * [서비스 상세 주석] AI 판단 결과와 근거를 최근 로그로 남깁니다.
 * 이 클래스의 핵심은 AI 추천이 왜 나왔는지 화면과 발표에서 설명할 수 있게 제목, 요약, 이유를 저장합니다.
 * 주요 관심사는 AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AiDecisionLogService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final int MAX_LOGS = 30;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
    private final Deque<AiDecisionLogDto> logs = new ConcurrentLinkedDeque<>();
/**
 * [상세 주석] record 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 처리 결과나 운영 지표를 나중에 확인할 수 있도록 기록하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void record(
            String type,
            String title,
            String summary,
            List<String> reasons,
            List<String> actions
    ) {
        logs.addFirst(new AiDecisionLogDto(
                LocalDateTime.now(),
                type,
                title,
                summary,
                safeList(reasons),
                safeList(actions)
        ));
        trim();
    }
/**
 * [상세 주석] recent 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 목록 데이터를 조건에 맞게 걸러내고 변환해 결과를 만드는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<AiDecisionLogDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public List<AiDecisionLogDto> recent() {
        return logs.stream().limit(MAX_LOGS).toList();
    }
/**
 * [상세 주석] safeList 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private List<String> safeList(List<String> values) {
        return values == null ? List.of() : List.copyOf(values);
    }
/**
 * [상세 주석] trim 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void trim() {
        while (logs.size() > MAX_LOGS) {
            logs.pollLast();
        }
    }
}
