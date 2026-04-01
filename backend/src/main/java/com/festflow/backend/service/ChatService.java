package com.festflow.backend.service;

import com.festflow.backend.dto.ChatResponseDto;
import org.springframework.stereotype.Service;

@Service
public class ChatService {

    public ChatResponseDto answer(String question) {
        String lower = question.toLowerCase();

        // Simple keyword-based dummy responses for MVP.
        if (lower.contains("\uACF5\uC5F0") || lower.contains("event")) {
            return new ChatResponseDto("\uACF5\uC5F0 \uC815\uBCF4\uB294 \uC774\uBCA4\uD2B8 \uD0ED\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC788\uC5B4\uC694.");
        }
        if (lower.contains("\uBD80\uC2A4") || lower.contains("booth")) {
            return new ChatResponseDto("\uD648 \uD0ED\uC5D0\uC11C \uBD80\uC2A4 \uC704\uCE58\uC640 \uD63C\uC7A1\uB3C4\uB97C \uD568\uAED8 \uBCFC \uC218 \uC788\uC5B4\uC694.");
        }
        if (lower.contains("\uD63C\uC7A1") || lower.contains("\uC0AC\uB78C")) {
            return new ChatResponseDto("\uD63C\uC7A1\uB3C4\uB294 \uCD5C\uADFC GPS \uB85C\uADF8 \uAE30\uBC18\uC73C\uB85C \uACC4\uC0B0\uB3FC\uC694.");
        }
        return new ChatResponseDto("\uCD95\uC81C \uC548\uB0B4 \uCC57\uBD07\uC785\uB2C8\uB2E4. \uBD80\uC2A4, \uACF5\uC5F0, \uD63C\uC7A1\uB3C4\uB97C \uC9C8\uBB38\uD574 \uC8FC\uC138\uC694.");
    }
}
