package com.festflow.backend.service.sms;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
/**
 * [서비스 상세 주석] Solapi로 예약 인증번호 문자를 보냅니다.
 * 이 클래스의 핵심은 공통 SmsSender 인터페이스와 Solapi 전용 클라이언트를 연결합니다.
 * 주요 관심사는 SMS 연동입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Component
@ConditionalOnProperty(prefix = "app.sms", name = "provider", havingValue = "solapi")
public class SolapiSmsSender implements SmsSender {
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
    private final SolapiMessageClient solapiMessageClient;
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
    public SolapiSmsSender(SolapiMessageClient solapiMessageClient) {
        this.solapiMessageClient = solapiMessageClient;
    }
/**
 * [상세 주석] sendVerificationCode 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 인증번호 문자를 실제 SMS 구현체로 발송하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 문자 발송 문구를 만들고 설정된 SMS 구현체 또는 외부 문자 API를 호출합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Override
    public void sendVerificationCode(String phoneNumber, String code) {
        solapiMessageClient.sendText(phoneNumber, "[Fest-A] 인증번호 " + code + " 를 입력해주세요.");
    }
}
