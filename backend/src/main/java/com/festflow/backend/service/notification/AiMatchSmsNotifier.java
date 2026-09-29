package com.festflow.backend.service.notification;

import com.festflow.backend.service.sms.SolapiMessageClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AiMatchSmsNotifier {

    private static final Logger log = LoggerFactory.getLogger(AiMatchSmsNotifier.class);
    private static final String PREFIX = "[아주대 사주소개팅] ";
    // 제안·취소를 반복해 상대 폰에 문자를 쏟아붓지 못하게, 조율 문자는 번호당 이 간격 안에 한 번만 보낸다.
    // 약속 확정 문자는 꼭 받아야 하므로 이 제한을 받지 않는다.
    private static final Duration NEGOTIATION_COOLDOWN = Duration.ofMinutes(2);
    private static final String[] DAY_NAMES = {"월", "화", "수", "목", "금", "토", "일"};

    private final SolapiMessageClient solapiMessageClient;
    private final boolean enabled;
    // 문자 속 링크. 도메인을 바꾸면 APP_PUBLIC_URL 만 바꾸면 된다(예: https://www.ajoufesta.com).
    private final String aiMatchUrl;
    private final Map<String, Instant> lastNegotiationSms = new ConcurrentHashMap<>();

    public AiMatchSmsNotifier(
            SolapiMessageClient solapiMessageClient,
            @Value("${app.ai-match.sms.enabled:true}") boolean enabled,
            @Value("${app.public-url:https://fest-flow-smoky.vercel.app}") String publicUrl
    ) {
        this.solapiMessageClient = solapiMessageClient;
        this.enabled = enabled;
        this.aiMatchUrl = publicUrl.trim().replaceAll("/+$", "") + "/ai-match";
    }

    public void notifyRequestCreated(String targetPhoneNumber) {
        send(targetPhoneNumber, PREFIX + "새 데이트 신청이 왔어요. 신청함을 확인해 주세요. " + aiMatchUrl);
    }

    public void notifyRequestAccepted(String requesterPhoneNumber) {
        send(requesterPhoneNumber, PREFIX + "신청이 수락됐어요. 신청함에서 만날 시간을 골라 주세요. " + aiMatchUrl);
    }

    /** 상대가 시간을 처음 제안했거나(counter=false) 내 제안 대신 다른 시간을 제안했을 때(counter=true). */
    public void notifyMeetupProposed(String phoneNumber, LocalDateTime meetupAt, int holdMinutes, boolean counter) {
        String lead = counter ? "상대가 다른 시간을 제안했어요: " : "상대가 만날 시간을 제안했어요: ";
        sendNegotiation(phoneNumber, PREFIX + lead + timeLabel(meetupAt) + ". "
                + holdMinutes + "분 안에 확정하지 않으면 자리가 풀려요. " + aiMatchUrl);
    }

    /** 상대가 내가 제안한 시간을 거절했을 때. */
    public void notifyMeetupDeclined(String proposerPhoneNumber) {
        sendNegotiation(proposerPhoneNumber, PREFIX + "상대가 제안한 시간을 거절했어요. 다른 시간을 골라 주세요. " + aiMatchUrl);
    }

    /** 상대가 자기가 보낸 시간 제안을 거둬들였을 때. */
    public void notifyMeetupWithdrawn(String phoneNumber) {
        sendNegotiation(phoneNumber, PREFIX + "상대가 시간 제안을 취소했어요. 신청함에서 다시 시간을 맞춰 주세요. " + aiMatchUrl);
    }

    /** 내가 제안한 시간을 상대가 확정했을 때. 확정 뒤엔 바꿀 수 없다는 것도 같이 알린다. */
    public void notifyMeetupConfirmed(String proposerPhoneNumber, LocalDateTime meetupAt) {
        send(proposerPhoneNumber, PREFIX + "약속이 확정됐어요: " + timeLabel(meetupAt)
                + " · 총학생회 소개팅 부스. 확정된 약속은 바꾸거나 취소할 수 없어요. " + aiMatchUrl);
    }

    /** 약속 전 알림. 각자 기다릴 곳과 도착 시각(약속 5분 전)을 알린다. */
    public void notifyMeetupReminder(String phoneNumber, LocalDateTime meetupAt, String waitingPlace) {
        if (meetupAt == null) return;
        LocalDateTime arriveBy = meetupAt.minusMinutes(5);
        send(phoneNumber, PREFIX + "오늘 " + String.format("%02d:%02d", meetupAt.getHour(), meetupAt.getMinute())
                + " 약속이에요. " + String.format("%02d:%02d", arriveBy.getHour(), arriveBy.getMinute())
                + "까지 " + waitingPlace + "(으)로 와 주세요. 도착하면 앱에서 '도착했어요'를 눌러 주세요. " + aiMatchUrl);
    }

    static String timeLabel(LocalDateTime at) {
        if (at == null) return "";
        DayOfWeek day = at.getDayOfWeek();
        return String.format("%d/%d(%s) %02d:%02d",
                at.getMonthValue(), at.getDayOfMonth(), DAY_NAMES[day.getValue() - 1], at.getHour(), at.getMinute());
    }

    private void sendNegotiation(String phoneNumber, String text) {
        if (phoneNumber == null || phoneNumber.isBlank()) {
            return;
        }
        String key = phoneNumber.replaceAll("\\D", "");
        Instant now = Instant.now();
        Instant last = lastNegotiationSms.get(key);
        if (last != null && Duration.between(last, now).compareTo(NEGOTIATION_COOLDOWN) < 0) {
            log.info("AI match negotiation SMS skipped (cooldown).");
            return;
        }
        lastNegotiationSms.put(key, now);
        if (lastNegotiationSms.size() > 5_000) {
            lastNegotiationSms.values().removeIf(at -> Duration.between(at, now).compareTo(NEGOTIATION_COOLDOWN) > 0);
        }
        send(phoneNumber, text);
    }

    private void send(String phoneNumber, String text) {
        if (!enabled || !solapiMessageClient.isEnabled() || phoneNumber == null || phoneNumber.isBlank()) {
            return;
        }
        try {
            solapiMessageClient.sendText(phoneNumber, text);
        } catch (RuntimeException e) {
            log.warn("Failed to send AI match SMS notification.", e);
        }
    }
}
