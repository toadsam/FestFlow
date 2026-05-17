package com.festflow.backend.service;

import com.festflow.backend.repository.ReservationAuthSessionRepository;
import com.festflow.backend.repository.ReservationUserAccountRepository;
import com.festflow.backend.repository.ReservationVerificationCodeRepository;
import com.festflow.backend.service.sms.SmsSender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ReservationAuthServiceTest {

    @Mock
    private ReservationVerificationCodeRepository verificationCodeRepository;

    @Mock
    private ReservationUserAccountRepository userAccountRepository;

    @Mock
    private ReservationAuthSessionRepository authSessionRepository;

    @Mock
    private SmsSender smsSender;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Test
    void resolveUserKeyOrNullIgnoresExpiredStatelessToken() {
        ReservationAuthService service = reservationAuthService();

        String userKey = service.resolveUserKeyOrNull("reservation-01012345678-1-deadbeef");

        assertThat(userKey).isNull();
        verifyNoInteractions(authSessionRepository);
    }

    @Test
    void requireUserKeyStillRejectsExpiredStatelessToken() {
        ReservationAuthService service = reservationAuthService();

        assertThatThrownBy(() -> service.requireUserKey("reservation-01012345678-1-deadbeef"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");
    }

    private ReservationAuthService reservationAuthService() {
        return new ReservationAuthService(
                verificationCodeRepository,
                userAccountRepository,
                authSessionRepository,
                smsSender,
                passwordEncoder
        );
    }
}
