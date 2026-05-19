package com.festflow.backend.service.notification;

import com.festflow.backend.service.sms.SolapiMessageClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AiMatchSmsNotifier {

    private static final Logger log = LoggerFactory.getLogger(AiMatchSmsNotifier.class);
    private static final String AI_MATCH_URL = "https://fest-flow-smoky.vercel.app/ai-match";

    private final SolapiMessageClient solapiMessageClient;
    private final boolean enabled;

    public AiMatchSmsNotifier(
            SolapiMessageClient solapiMessageClient,
            @Value("${app.ai-match.sms.enabled:true}") boolean enabled
    ) {
        this.solapiMessageClient = solapiMessageClient;
        this.enabled = enabled;
    }

    public void notifyRequestCreated(String targetPhoneNumber) {
        send(
                targetPhoneNumber,
                "[\uC544\uC8FC\uB300AI\uC18C\uAC1C\uD305\uBD80\uC2A4] \uC0C8 \uB370\uC774\uD2B8 \uC2E0\uCCAD\uC774 \uC654\uC5B4\uC694. "
                        + "\uC2E0\uCCAD\uD568\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694. "
                        + AI_MATCH_URL
        );
    }

    public void notifyRequestAccepted(String requesterPhoneNumber) {
        send(
                requesterPhoneNumber,
                "[\uC544\uC8FC\uB300AI\uC18C\uAC1C\uD305\uBD80\uC2A4] \uC2E0\uCCAD\uC774 \uC218\uB77D\uB410\uC5B4\uC694. "
                        + "\uACE7 \uAD00\uB9AC\uC790\uAC00 \uC5F0\uB77D\uD574 \uC77C\uC815\uC744 \uC870\uC728\uD574\uB4DC\uB9B4\uAC8C\uC694. "
                        + AI_MATCH_URL
        );
    }

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
