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
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class ReservationAuthService {

    private final ReservationVerificationCodeRepository verificationCodeRepository;
    private final ReservationUserAccountRepository userAccountRepository;
    private final ReservationAuthSessionRepository authSessionRepository;
    private final SmsSender smsSender;
    private final Random random = new Random();

    @Value("${app.sms.debug-return-code:true}")
    private boolean debugReturnCode;

    public ReservationAuthService(
            ReservationVerificationCodeRepository verificationCodeRepository,
            ReservationUserAccountRepository userAccountRepository,
            ReservationAuthSessionRepository authSessionRepository,
            SmsSender smsSender
    ) {
        this.verificationCodeRepository = verificationCodeRepository;
        this.userAccountRepository = userAccountRepository;
        this.authSessionRepository = authSessionRepository;
        this.smsSender = smsSender;
    }

    @Transactional
    public ReservationAuthSendCodeResponseDto sendCode(String rawPhoneNumber) {
        String phoneNumber = normalizePhoneNumber(rawPhoneNumber);
        LocalDateTime now = LocalDateTime.now();

        // 30초 쿨다운
        verificationCodeRepository.findFirstByPhoneNumberOrderByCreatedAtDesc(phoneNumber)
                .ifPresent(latest -> {
                    if (latest.getCreatedAt().plusSeconds(30).isAfter(now)) {
                        throw new ResponseStatusException(TOO_MANY_REQUESTS, "Please wait before requesting another code.");
                    }
                });

        // 10분 내 최대 5회 발송
        long recentCount = verificationCodeRepository.countByPhoneNumberAndCreatedAtAfter(phoneNumber, now.minusMinutes(10));
        if (recentCount >= 5) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "Too many verification requests. Try again later.");
        }

        String code = String.format("%06d", random.nextInt(1_000_000));
        LocalDateTime expiresAt = now.plusMinutes(3);

        verificationCodeRepository.save(new ReservationVerificationCode(phoneNumber, code, expiresAt, now));
        smsSender.sendVerificationCode(phoneNumber, code);

        return new ReservationAuthSendCodeResponseDto(
                phoneNumber,
                expiresAt,
                debugReturnCode ? code : null
        );
    }

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
        if (!latest.getCode().equals(code)) {
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

    @Transactional
    public String requireUserKey(String authToken) {
        String token = normalizeToken(authToken);
        if (token == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Reservation authentication is required.");
        }

        LocalDateTime now = LocalDateTime.now();
        ReservationAuthSession session = authSessionRepository.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid reservation authentication token."));

        if (session.isExpired(now)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Reservation authentication token has expired.");
        }

        return session.getUserAccount().getPhoneNumber();
    }

    @Transactional
    public String resolveUserKeyOrNull(String authToken) {
        String token = normalizeToken(authToken);
        if (token == null) {
            return null;
        }

        LocalDateTime now = LocalDateTime.now();
        return authSessionRepository.findByToken(token)
                .filter(session -> !session.isExpired(now))
                .map(session -> session.getUserAccount().getPhoneNumber())
                .orElse(null);
    }

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

    private String normalizeToken(String rawToken) {
        if (rawToken == null) {
            return null;
        }
        String trimmed = rawToken.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
