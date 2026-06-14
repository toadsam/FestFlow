package com.festflow.backend.service;

import com.festflow.backend.dto.ReservationAuthSendCodeResponseDto;
import com.festflow.backend.dto.ReservationAuthVerifyResponseDto;
import com.festflow.backend.entity.ReservationAuthSession;
import com.festflow.backend.entity.ReservationUserAccount;
import com.festflow.backend.entity.ReservationVerificationCode;
import com.festflow.backend.repository.ReservationAuthSessionRepository;
import com.festflow.backend.repository.ReservationUserAccountRepository;
import com.festflow.backend.repository.ReservationVerificationCodeRepository;
import com.festflow.backend.service.sms.SmsSender;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.security.SecureRandom;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;
/**
 * [서비스 상세 주석] 예약 사용자 전화번호 인증과 토큰 발급을 처리합니다.
 * 이 클래스의 핵심은 예약/조회/체크인 권한을 관리자 JWT가 아니라 예약 전용 토큰으로 분리합니다.
 * 주요 관심사는 DB 조회/저장, SMS 연동입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class ReservationAuthService {
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final ReservationVerificationCodeRepository verificationCodeRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final ReservationUserAccountRepository userAccountRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final ReservationAuthSessionRepository authSessionRepository;
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
private final SmsSender smsSender;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final PasswordEncoder passwordEncoder;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final SecureRandom random = new SecureRandom();

    @Value("${app.sms.max-verify-attempts:5}")
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private int maxVerifyAttempts;
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
    public ReservationAuthService(
            ReservationVerificationCodeRepository verificationCodeRepository,
            ReservationUserAccountRepository userAccountRepository,
            ReservationAuthSessionRepository authSessionRepository,
            SmsSender smsSender,
            PasswordEncoder passwordEncoder
    ) {
        this.verificationCodeRepository = verificationCodeRepository;
        this.userAccountRepository = userAccountRepository;
        this.authSessionRepository = authSessionRepository;
        this.smsSender = smsSender;
        this.passwordEncoder = passwordEncoder;
    }
/**
 * [상세 주석] sendCode 메서드는 SMS나 외부 알림을 보내는 흐름을 담당합니다.
 * 한줄 요약: 예약 인증번호를 만들고 SMS로 발송하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationAuthSendCodeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    @Transactional
    public ReservationAuthSendCodeResponseDto sendCode(String rawPhoneNumber) {
        String phoneNumber = normalizePhoneNumber(rawPhoneNumber);
        LocalDateTime now = LocalDateTime.now();
        String code = generateVerificationCode();
        LocalDateTime expiresAt = now.plusMinutes(3);

        verificationCodeRepository.save(new ReservationVerificationCode(
                phoneNumber,
                passwordEncoder.encode(code),
                expiresAt,
                now
        ));
        smsSender.sendVerificationCode(phoneNumber, code);

        return new ReservationAuthSendCodeResponseDto(phoneNumber, expiresAt);
    }
/**
 * [상세 주석] verifyCode 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationAuthVerifyResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public ReservationAuthVerifyResponseDto verifyCode(String rawPhoneNumber, String rawCode) {
        String phoneNumber = normalizePhoneNumber(rawPhoneNumber);
        String code = normalizeCode(rawCode);
        LocalDateTime now = LocalDateTime.now();

        ReservationVerificationCode latest = verificationCodeRepository.findFirstByPhoneNumberOrderByCreatedAtDesc(phoneNumber)
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Verification code was not requested."));

        if (latest.isUsed()) {
            throw new ResponseStatusException(BAD_REQUEST, "Verification code is already used.");
        }
        if (latest.isExpired(now)) {
            throw new ResponseStatusException(BAD_REQUEST, "Verification code has expired.");
        }
        if (!matchesVerificationCode(latest.getCode(), code)) {
            int attempts = latest.incrementFailedAttempts();
            if (attempts >= Math.max(1, maxVerifyAttempts)) {
                latest.markUsed(now);
                verificationCodeRepository.save(latest);
                throw new ResponseStatusException(TOO_MANY_REQUESTS, "Too many verification attempts. Request a new code.");
            }
            verificationCodeRepository.save(latest);
            throw new ResponseStatusException(BAD_REQUEST, "Verification code is incorrect.");
        }

        latest.markUsed(now);
        verificationCodeRepository.save(latest);

        ReservationUserAccount account = userAccountRepository.findByPhoneNumber(phoneNumber)
                .orElseGet(() -> userAccountRepository.save(new ReservationUserAccount(phoneNumber, now)));
        account.markVerified(now);
        userAccountRepository.save(account);

        String token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        LocalDateTime expiresAt = now.plusHours(12);
        authSessionRepository.save(new ReservationAuthSession(account, token, now, expiresAt));

        return new ReservationAuthVerifyResponseDto(token, account.getPhoneNumber(), expiresAt);
    }
/**
 * [상세 주석] requireUserKey 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public String requireUserKey(String authToken) {
        String token = normalizeToken(authToken);
        if (token == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Reservation authentication is required.");
        }

        String statelessPhoneNumber = resolveStatelessReservationToken(token);
        if (statelessPhoneNumber != null) {
            return statelessPhoneNumber;
        }

        LocalDateTime now = LocalDateTime.now();
        ReservationAuthSession session = authSessionRepository.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid reservation authentication token."));

        if (session.isExpired(now)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Reservation authentication token has expired.");
        }

        return session.getUserAccount().getPhoneNumber();
    }
/**
 * [상세 주석] resolveUserKeyOrNull 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional
    public String resolveUserKeyOrNull(String authToken) {
        String token = normalizeToken(authToken);
        if (token == null) {
            return null;
        }

        try {
            String statelessPhoneNumber = resolveStatelessReservationToken(token);
            if (statelessPhoneNumber != null) {
                return statelessPhoneNumber;
            }
        } catch (ResponseStatusException ignored) {
            return null;
        }

        LocalDateTime now = LocalDateTime.now();
        return authSessionRepository.findByToken(token)
                .filter(session -> !session.isExpired(now))
                .map(session -> session.getUserAccount().getPhoneNumber())
                .orElse(null);
    }
/**
 * [상세 주석] normalizePhoneNumber 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizePhoneNumber(String rawPhoneNumber) {
        if (rawPhoneNumber == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Phone number is required.");
        }

        String digitsOnly = rawPhoneNumber.replaceAll("[^0-9]", "");
        if (digitsOnly.length() < 10 || digitsOnly.length() > 15) {
            throw new ResponseStatusException(BAD_REQUEST, "Phone number format is invalid.");
        }
        return digitsOnly;
    }
/**
 * [상세 주석] normalizeCode 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeCode(String rawCode) {
        if (rawCode == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Verification code is required.");
        }
        String trimmed = rawCode.trim();
        if (!trimmed.matches("\\d{6}")) {
            throw new ResponseStatusException(BAD_REQUEST, "Verification code format is invalid.");
        }
        return trimmed;
    }
/**
 * [상세 주석] normalizeToken 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeToken(String rawToken) {
        if (rawToken == null) {
            return null;
        }
        String trimmed = rawToken.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
/**
 * [상세 주석] generateVerificationCode 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String generateVerificationCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }
/**
 * [상세 주석] createStatelessReservationToken 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String createStatelessReservationToken(String phoneNumber, LocalDateTime expiresAt) {
        long epochMillis = expiresAt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "reservation-" + phoneNumber + "-" + epochMillis + "-"
                + UUID.randomUUID().toString().replace("-", "");
    }
/**
 * [상세 주석] resolveStatelessReservationToken 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String resolveStatelessReservationToken(String token) {
        String[] parts = token.split("-", 4);
        if (parts.length != 4 || !"reservation".equals(parts[0])) {
            return null;
        }

        try {
            long expiresAtMillis = Long.parseLong(parts[2]);
            if (System.currentTimeMillis() > expiresAtMillis) {
                throw new ResponseStatusException(UNAUTHORIZED, "Reservation authentication token has expired.");
            }
            return normalizePhoneNumber(parts[1]);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid reservation authentication token.");
        }
    }
/**
 * [상세 주석] matchesVerificationCode 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private boolean matchesVerificationCode(String storedCode, String inputCode) {
        if (storedCode == null || storedCode.isBlank()) {
            return false;
        }

        // Backward compatibility for rows created before hashing rollout.
        if (storedCode.matches("\\d{6}")) {
            return storedCode.equals(inputCode);
        }

        return passwordEncoder.matches(inputCode, storedCode);
    }
}
