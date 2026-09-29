package com.festflow.backend.service.notification;

import com.festflow.backend.service.AiMatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 1분마다 곧 시작하는 소개팅 약속을 찾아 두 사람에게 대기 장소 알림 문자를 보낸다. */
@Component
public class AiMatchMeetupReminderJob {

    private static final Logger log = LoggerFactory.getLogger(AiMatchMeetupReminderJob.class);

    private final AiMatchService aiMatchService;

    public AiMatchMeetupReminderJob(AiMatchService aiMatchService) {
        this.aiMatchService = aiMatchService;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void sendReminders() {
        try {
            int sent = aiMatchService.sendDueMeetupReminders();
            if (sent > 0) {
                log.info("AI match meetup reminders sent for {} meetup(s).", sent);
            }
        } catch (RuntimeException e) {
            log.warn("AI match meetup reminder job failed.", e);
        }
    }
}
