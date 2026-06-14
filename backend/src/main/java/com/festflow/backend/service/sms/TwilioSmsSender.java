package com.festflow.backend.service.sms;

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
/**
 * [서비스 상세 주석] Twilio API로 인증번호 문자를 보냅니다.
 * 이 클래스의 핵심은 같은 SmsSender 인터페이스로 SMS 업체 교체 가능성을 확보합니다.
 * 주요 관심사는 SMS 연동입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Component
@ConditionalOnProperty(prefix = "app.sms", name = "provider", havingValue = "twilio")
public class TwilioSmsSender implements SmsSender {

    @Value("${app.sms.twilio.account-sid}")
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private String accountSid;

    @Value("${app.sms.twilio.auth-token}")
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private String authToken;

    @Value("${app.sms.twilio.from-number}")
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private String fromNumber;
/**
 * [상세 주석] init 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 문자 발송에 필요한 내용을 만들고 SMS API로 전달하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @PostConstruct
    public void init() {
        Twilio.init(accountSid, authToken);
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
        String body = "[Fest-A] 인증번호는 " + code + " 입니다. 3분 내 입력하세요.";
        Message.creator(new PhoneNumber(toE164(phoneNumber)), new PhoneNumber(fromNumber), body).create();
    }
/**
 * [상세 주석] toE164 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String toE164(String phoneNumber) {
        if (phoneNumber.startsWith("0")) {
            return "+82" + phoneNumber.substring(1);
        }
        if (phoneNumber.startsWith("82")) {
            return "+" + phoneNumber;
        }
        if (phoneNumber.startsWith("+")) {
            return phoneNumber;
        }
        return "+82" + phoneNumber;
    }
}
