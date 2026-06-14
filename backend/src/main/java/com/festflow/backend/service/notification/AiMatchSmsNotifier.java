package com.festflow.backend.service.notification;

import com.festflow.backend.service.sms.SolapiMessageClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
/**
 * [서비스 상세 주석] AI 매칭 상태 변화 문자 알림을 보냅니다.
 * 이 클래스의 핵심은 매칭 요청/수락처럼 화면 밖에서도 알려야 하는 이벤트를 SMS로 전달합니다.
 * 주요 관심사는 SMS 연동, AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Component
public class AiMatchSmsNotifier {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final Logger log = LoggerFactory.getLogger(AiMatchSmsNotifier.class);
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
private static final String AI_MATCH_URL = "https://fest-flow-smoky.vercel.app/ai-match";
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
    private final SolapiMessageClient solapiMessageClient;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final boolean enabled;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */

    public AiMatchSmsNotifier(
            SolapiMessageClient solapiMessageClient,
            @Value("${app.ai-match.sms.enabled:true}") boolean enabled
    ) {
        this.solapiMessageClient = solapiMessageClient;
        this.enabled = enabled;
    }
/**
 * [상세 주석] notifyRequestCreated 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 문자 발송에 필요한 내용을 만들고 SMS API로 전달하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void notifyRequestCreated(String targetPhoneNumber) {
        send(
                targetPhoneNumber,
                "[\uC544\uC8FC\uB300AI\uC18C\uAC1C\uD305\uBD80\uC2A4] \uC0C8 \uB370\uC774\uD2B8 \uC2E0\uCCAD\uC774 \uC654\uC5B4\uC694. "
                        + "\uC2E0\uCCAD\uD568\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694. "
                        + AI_MATCH_URL
        );
    }
/**
 * [상세 주석] notifyRequestAccepted 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 문자 발송에 필요한 내용을 만들고 SMS API로 전달하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void notifyRequestAccepted(String requesterPhoneNumber) {
        send(
                requesterPhoneNumber,
                "[\uC544\uC8FC\uB300AI\uC18C\uAC1C\uD305\uBD80\uC2A4] \uC2E0\uCCAD\uC774 \uC218\uB77D\uB410\uC5B4\uC694. "
                        + "\uACE7 \uAD00\uB9AC\uC790\uAC00 \uC5F0\uB77D\uD574 \uC77C\uC815\uC744 \uC870\uC728\uD574\uB4DC\uB9B4\uAC8C\uC694. "
                        + AI_MATCH_URL
        );
    }
/**
 * [상세 주석] send 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 등록된 SSE 연결들에게 이벤트 이름과 데이터를 보내는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 문자 발송 문구를 만들고 설정된 SMS 구현체 또는 외부 문자 API를 호출합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 현재 연결된 모든 SseEmitter에 이벤트 이름과 payload를 전송합니다.
 * - 전송 중 IOException이 발생한 emitter는 죽은 연결로 보고 dead 목록에 모았다가 제거합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void send(String phoneNumber, String text) {
        if (!enabled || !solapiMessageClient.isEnabled()) {
            return;
        }
        try {
            solapiMessageClient.sendText(phoneNumber, text);
        } catch (RuntimeException e) {
            log.warn("Failed to send AI match SMS notification.", e);
        }
    }
}
