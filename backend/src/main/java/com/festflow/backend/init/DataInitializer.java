package com.festflow.backend.init;

import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.entity.AdminUser;
import com.festflow.backend.repository.AdminUserRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.EventRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.List;

@Configuration
public class DataInitializer {

    @Bean
    public CommandLineRunner seedData(
            BoothRepository boothRepository,
            EventRepository eventRepository,
            AdminUserRepository adminUserRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            if (boothRepository.count() == 0) {
                boothRepository.saveAll(List.of(
                        new Booth("\uD478\uB4DC\uD2B8\uB7ED A", 37.5665, 126.9780, "\uB300\uD45C \uAC04\uC2DD\uACFC \uC74C\uB8CC\uB97C \uD310\uB9E4\uD558\uB294 \uC778\uAE30 \uBD80\uC2A4", 1, "https://picsum.photos/seed/festflow-booth-1/800/450"),
                        new Booth("\uAC8C\uC784\uC874 B", 37.5669, 126.9788, "\uBBF8\uB2C8 \uAC8C\uC784\uACFC \uACBD\uD488 \uC774\uBCA4\uD2B8 \uC9C4\uD589", 2, "https://picsum.photos/seed/festflow-booth-2/800/450"),
                        new Booth("\uD50C\uB9AC\uB9C8\uCF13 C", 37.5659, 126.9775, "\uD559\uC0DD \uCC3D\uC791 \uAD7F\uC988\uC640 \uC218\uACF5\uC608\uD488 \uD310\uB9E4", 3, "https://picsum.photos/seed/festflow-booth-3/800/450"),
                        new Booth("\uCCB4\uD5D8\uC874 D", 37.5673, 126.9771, "\uD3EC\uD1A0\uBD80\uC2A4 \uBC0F \uCCB4\uD5D8\uD615 \uD504\uB85C\uADF8\uB7A8 \uC6B4\uC601", 4, "https://picsum.photos/seed/festflow-booth-4/800/450")
                ));
            }

            if (eventRepository.count() == 0) {
                LocalDateTime now = LocalDateTime.now();
                eventRepository.saveAll(List.of(
                        new FestivalEvent("\uAC1C\uB9C9 \uACF5\uC5F0", now.minusHours(3), now.minusHours(2), "\uC885\uB8CC"),
                        new FestivalEvent("\uBC34\uB4DC \uB77C\uC774\uBE0C", now.minusMinutes(20), now.plusMinutes(40), "\uC9C4\uD589\uC911"),
                        new FestivalEvent("DJ \uB098\uC774\uD2B8", now.plusHours(2), now.plusHours(4), "\uC608\uC815")
                ));
            }

            if (adminUserRepository.count() == 0) {
                adminUserRepository.save(new AdminUser("admin", passwordEncoder.encode("admin1234"), "ADMIN"));
            }
        };
    }
}
