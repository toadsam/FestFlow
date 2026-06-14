package com.festflow.backend.service;

import com.festflow.backend.dto.TranslateMetricsDto;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicLong;
/**
 * [서비스 상세 주석] 번역 API 성공/실패와 지연 시간을 집계합니다.
 * 이 클래스의 핵심은 외부 번역 기능이 안정적으로 동작하는지 운영자가 확인할 수 있게 합니다.
 * 주요 관심사는 일반 서비스 로직입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class TranslateMetricsService {
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
    private final AtomicLong totalRequests = new AtomicLong(0);
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final AtomicLong successCount = new AtomicLong(0);
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final AtomicLong failCount = new AtomicLong(0);
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final AtomicLong latencySumMs = new AtomicLong(0);
/**
 * [상세 주석] recordSuccess 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 처리 결과나 운영 지표를 나중에 확인할 수 있도록 기록하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void recordSuccess(long latencyMs) {
        totalRequests.incrementAndGet();
        successCount.incrementAndGet();
        latencySumMs.addAndGet(Math.max(0, latencyMs));
    }
/**
 * [상세 주석] recordFailure 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 처리 결과나 운영 지표를 나중에 확인할 수 있도록 기록하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void recordFailure() {
        totalRequests.incrementAndGet();
        failCount.incrementAndGet();
    }
/**
 * [상세 주석] snapshot 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: TranslateMetricsDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public TranslateMetricsDto snapshot() {
        long total = totalRequests.get();
        long success = successCount.get();
        long fail = failCount.get();
        long latencySum = latencySumMs.get();
        double successRate = total == 0 ? 0.0 : (double) success / total;
        double avgLatency = success == 0 ? 0.0 : (double) latencySum / success;
        return new TranslateMetricsDto(total, success, fail, successRate, avgLatency);
    }
}

