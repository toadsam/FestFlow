package com.festflow.backend.init;

import com.festflow.backend.entity.AdminUser;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.entity.Notice;
import com.festflow.backend.repository.AdminUserRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.EventRepository;
import com.festflow.backend.repository.NoticeRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

@Configuration
public class DataInitializer {

    @Bean
    public CommandLineRunner seedData(
            BoothRepository boothRepository,
            EventRepository eventRepository,
            AdminUserRepository adminUserRepository,
            NoticeRepository noticeRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            List<Booth> ajouBooths = List.of(
                    new Booth("Ajou Food Street A", 37.2832, 127.0451, "Ajou student center food booth", 1, "https://picsum.photos/seed/festflow-ajou-1/800/450", 7, 120, "Popular menu running now", LocalDateTime.now()),
                    new Booth("Ajou Game Zone B", 37.2824, 127.0439, "Mini game booth near Yulgok Hall", 2, "https://picsum.photos/seed/festflow-ajou-2/800/450", 5, 60, "Waiting line moving quickly", LocalDateTime.now()),
                    new Booth("Ajou Art Market C", 37.2817, 127.0447, "Student handmade market near Seongho Hall", 3, "https://picsum.photos/seed/festflow-ajou-3/800/450", 3, 35, "Limited goods available", LocalDateTime.now()),
                    new Booth("Ajou Experience Lounge D", 37.2829, 127.0428, "Experience booth at central plaza", 4, "https://picsum.photos/seed/festflow-ajou-4/800/450", 4, 80, "Photo booth open", LocalDateTime.now())
            );

            if (boothRepository.count() == 0) {
                boothRepository.saveAll(ajouBooths);
            } else {
                List<Booth> existing = boothRepository.findAll().stream()
                        .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                        .toList();

                if (!existing.isEmpty() && existing.get(0).getLatitude() > 37.4) {
                    int limit = Math.min(existing.size(), ajouBooths.size());
                    for (int i = 0; i < limit; i++) {
                        Booth target = existing.get(i);
                        Booth source = ajouBooths.get(i);
                        target.update(
                                source.getName(),
                                source.getLatitude(),
                                source.getLongitude(),
                                source.getDescription(),
                                i + 1,
                                source.getImageUrl(),
                                source.getEstimatedWaitMinutes(),
                                source.getRemainingStock(),
                                source.getLiveStatusMessage(),
                                LocalDateTime.now()
                        );
                        boothRepository.save(target);
                    }
                }
            }

            if (eventRepository.count() == 0) {
                LocalDateTime now = LocalDateTime.now();
                eventRepository.saveAll(List.of(
                        new FestivalEvent("Ajou Opening Parade", now.minusHours(3), now.minusHours(2), "DONE"),
                        new FestivalEvent("Yulgok Hall Band Live", now.minusMinutes(20), now.plusMinutes(40), "LIVE"),
                        new FestivalEvent("Central Plaza DJ Night", now.plusHours(2), now.plusHours(4), "PLANNED")
                ));
            }

            if (adminUserRepository.count() == 0) {
                adminUserRepository.save(new AdminUser("admin", passwordEncoder.encode("admin1234"), "ADMIN"));
            }

            if (noticeRepository.count() == 0) {
                noticeRepository.save(new Notice(
                        "Rain Notice",
                        "After 18:00, outdoor stages may move to Ajou gym sub stage due to rain.",
                        "?곗쿇",
                        true
                ));
            }
        };
    }
}
