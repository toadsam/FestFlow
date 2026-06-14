package com.festflow.backend.service.sms;
/**
 * [서비스 상세 주석] SMS 인증번호 발송 기능의 공통 인터페이스입니다.
 * 이 클래스의 핵심은 예약 인증 서비스가 특정 SMS 업체에 직접 의존하지 않게 합니다.
 * 주요 관심사는 SMS 연동입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
public interface SmsSender {
    /**
     * [상세 주석]
     * 한줄 요약: 전화번호와 인증번호를 받아 실제 SMS 발송 구현체로 전달하는 메서드입니다.
     * 처리 흐름: 예약 인증 서비스는 이 인터페이스만 호출하고, 실제 발송은 Aligo/Solapi/Twilio/Noop 구현체가 담당합니다.
     * 초보자 포인트: 인터페이스를 쓰면 SMS 업체를 바꿔도 호출하는 쪽 코드는 거의 바꾸지 않아도 됩니다.
     */
    void sendVerificationCode(String phoneNumber, String code);
}
