package com.festflow.backend.init;

import com.festflow.backend.entity.AdminUser;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.entity.Notice;
import com.festflow.backend.entity.StaffMember;
import com.festflow.backend.entity.StaffStatus;
import com.festflow.backend.repository.AdminUserRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.EventRepository;
import com.festflow.backend.repository.NoticeRepository;
import com.festflow.backend.repository.StaffMemberRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.ArrayList;

@Configuration
public class DataInitializer {

    @Value("${app.init.admin.username:}")
    private String initialAdminUsername;

    @Value("${app.init.admin.password:}")
    private String initialAdminPassword;

    @Bean
    public CommandLineRunner seedData(
            BoothRepository boothRepository,
            EventRepository eventRepository,
            AdminUserRepository adminUserRepository,
            NoticeRepository noticeRepository,
            StaffMemberRepository staffMemberRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            List<Booth> departmentBooths = List.of(
                    new Booth("디지털미디어학과 네온주점", 37.2832, 127.0451, "디지털미디어학과에서 운영하는 테마 주점", 1, "https://picsum.photos/seed/festflow-ajou-1/800/450", 7, 120, "시그니처 음료 판매 중", LocalDateTime.now()),
                    new Booth("산업공학과 이음주점", 37.2824, 127.0439, "산업공학과 학생회가 운영하는 주점", 2, "https://picsum.photos/seed/festflow-ajou-2/800/450", 5, 60, "대기줄이 빠르게 줄고 있어요", LocalDateTime.now()),
                    new Booth("기계공학과 톱니주점", 37.2817, 127.0447, "기계공학과 동아리 연합 주점", 3, "https://picsum.photos/seed/festflow-ajou-3/800/450", 3, 35, "인기 메뉴 재고 여유", LocalDateTime.now()),
                    new Booth("첨단신소재공학과 합금주점", 37.2829, 127.0428, "첨단신소재공학과에서 준비한 축제 주점", 4, "https://picsum.photos/seed/festflow-ajou-4/800/450", 4, 80, "테이블 회전이 원활합니다", LocalDateTime.now()),
                    new Booth("전자공학과 파동주점", 37.2830, 127.0441, "전자공학과의 시그니처 야식 주점", 5, "https://picsum.photos/seed/festflow-ajou-5/800/450", 6, 95, "핫도그 세트 인기", LocalDateTime.now()),
                    new Booth("소프트웨어학과 버그제로주점", 37.2822, 127.0449, "소프트웨어학과 학생회 운영 주점", 6, "https://picsum.photos/seed/festflow-ajou-6/800/450", 8, 70, "주문 처리 원활", LocalDateTime.now()),
                    new Booth("화학공학과 비커주점", 37.2819, 127.0436, "화학공학과 실험실 콘셉트 주점", 7, "https://picsum.photos/seed/festflow-ajou-7/800/450", 4, 88, "대표 음료 할인 중", LocalDateTime.now()),
                    new Booth("건축학과 아치주점", 37.2827, 127.0454, "건축학과의 구조미 콘셉트 주점", 8, "https://picsum.photos/seed/festflow-ajou-8/800/450", 5, 65, "테이블 순환 빠름", LocalDateTime.now()),
                    new Booth("경영학과 스프레드시트주점", 37.2834, 127.0443, "경영학과 연합 운영 주점", 9, "https://picsum.photos/seed/festflow-ajou-9/800/450", 9, 50, "베스트 메뉴 매진 임박", LocalDateTime.now()),
                    new Booth("경제학과 균형주점", 37.2818, 127.0452, "경제학과 축제 운영위원회 주점", 10, "https://picsum.photos/seed/festflow-ajou-10/800/450", 3, 110, "좌석 여유 있음", LocalDateTime.now()),
                    new Booth("국어국문학과 활자주점", 37.2825, 127.0431, "국어국문학과 감성 포차", 11, "https://picsum.photos/seed/festflow-ajou-11/800/450", 4, 72, "감성 포토존 운영", LocalDateTime.now()),
                    new Booth("영어영문학과 리듬주점", 37.2831, 127.0429, "영어영문학과 뮤직 테마 주점", 12, "https://picsum.photos/seed/festflow-ajou-12/800/450", 6, 66, "음악 공연 예정", LocalDateTime.now()),
                    new Booth("심리학과 마음주점", 37.2816, 127.0440, "심리학과 상담 부스 연계 주점", 13, "https://picsum.photos/seed/festflow-ajou-13/800/450", 2, 98, "편안한 좌석 구역 운영", LocalDateTime.now()),
                    new Booth("사회학과 연결주점", 37.2820, 127.0427, "사회학과 커뮤니티 테마 주점", 14, "https://picsum.photos/seed/festflow-ajou-14/800/450", 5, 74, "단체석 일부 가능", LocalDateTime.now())
            );

            if (boothRepository.count() == 0) {
                boothRepository.saveAll(departmentBooths);
            } else {
                List<Booth> existing = boothRepository.findAll().stream()
                        .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                        .toList();

                if (shouldRefreshSeedBooths(existing)) {
                    int limit = Math.min(existing.size(), departmentBooths.size());
                    for (int i = 0; i < limit; i++) {
                        Booth target = existing.get(i);
                        Booth source = departmentBooths.get(i);
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

                    if (existing.size() < departmentBooths.size()) {
                        boothRepository.saveAll(departmentBooths.subList(existing.size(), departmentBooths.size()));
                    }
                }
            }

            if (eventRepository.count() == 0) {
                LocalDateTime now = LocalDateTime.now();
                eventRepository.saveAll(seedEvents(now));
            } else {
                List<FestivalEvent> existingEvents = eventRepository.findAll().stream()
                        .sorted(Comparator.comparing(FestivalEvent::getStartTime).thenComparing(FestivalEvent::getId))
                        .toList();

                if (shouldRefreshSeedEvents(existingEvents)) {
                    List<FestivalEvent> targetEvents = seedEvents(LocalDateTime.now());
                    int limit = Math.min(existingEvents.size(), targetEvents.size());

                    for (int i = 0; i < limit; i++) {
                        FestivalEvent target = existingEvents.get(i);
                        FestivalEvent source = targetEvents.get(i);
                        target.update(source.getTitle(), source.getStartTime(), source.getEndTime(), source.getImageUrl(), source.getImageCredit(), source.getImageFocus(), source.getStatusOverride(), source.getLiveMessage(), source.getDelayMinutes());
                        target.setStatus("예정");
                        eventRepository.save(target);
                    }

                    if (existingEvents.size() < targetEvents.size()) {
                        eventRepository.saveAll(targetEvents.subList(existingEvents.size(), targetEvents.size()));
                    }
                }
            }
            applyDefaultEventImages(eventRepository);

            if (adminUserRepository.count() == 0
                    && initialAdminUsername != null
                    && initialAdminPassword != null
                    && !initialAdminUsername.isBlank()
                    && !initialAdminPassword.isBlank()) {
                adminUserRepository.save(new AdminUser(
                        initialAdminUsername.trim(),
                        passwordEncoder.encode(initialAdminPassword),
                        "ADMIN"
                ));
            }

            if (noticeRepository.count() == 0) {
                noticeRepository.save(new Notice(
                        "우천 안내",
                        "18시 이후 우천 시 야외 무대가 아주체육관 보조무대로 변경될 수 있습니다.",
                        "우천",
                        true
                ));
            }

            if (staffMemberRepository.count() == 0) {
                List<Booth> orderedBooths = boothRepository.findAll().stream()
                        .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                        .toList();
                List<String> teams = List.of("운영", "안내", "안전", "무대", "부스지원", "미디어");
                List<String> tasks = List.of(
                        "입구 동선 안내",
                        "노천극장 인원 확인",
                        "부스 대기열 정리",
                        "분실물 대응",
                        "행사장 순찰",
                        "긴급 호출 대기",
                        "Q&A 응대",
                        "장비 점검"
                );

                List<StaffMember> seeds = new ArrayList<>();
                for (int i = 0; i < 55; i++) {
                    String staffNo = "S" + String.format("%03d", i + 1);
                    String pin = String.valueOf(7001 + i);
                    Booth booth = orderedBooths.isEmpty() ? null : orderedBooths.get(i % orderedBooths.size());
                    StaffStatus status = switch (i % 10) {
                        case 0 -> StaffStatus.URGENT;
                        case 1, 2, 3 -> StaffStatus.MOVING;
                        case 4, 5, 6, 7 -> StaffStatus.ON_DUTY;
                        default -> StaffStatus.STANDBY;
                    };

                    seeds.add(new StaffMember(
                            staffNo,
                            passwordEncoder.encode(pin),
                            "스태프 " + String.format("%02d", i + 1),
                            teams.get(i % teams.size()),
                            status,
                            tasks.get(i % tasks.size()),
                            "",
                            booth != null ? booth.getId() : null,
                            booth != null ? booth.getLatitude() : null,
                            booth != null ? booth.getLongitude() : null,
                            LocalDateTime.now().minusMinutes(i)
                    ));
                }
                staffMemberRepository.saveAll(seeds);
            }
        };
    }

    private boolean shouldRefreshSeedBooths(List<Booth> booths) {
        if (booths.isEmpty()) {
            return false;
        }
        String firstName = booths.get(0).getName();
        return firstName.contains("Ajou")
                || firstName.startsWith("아주 ")
                || firstName.startsWith("디지털미디어학과 ");
    }

    private boolean shouldRefreshSeedEvents(List<FestivalEvent> events) {
        if (events.isEmpty()) {
            return false;
        }
        if (events.size() <= 4) {
            return true;
        }

        String firstTitle = events.get(0).getTitle();
        return firstTitle.contains("Ajou")
                || firstTitle.contains("\uB9C8\uC2A4\uD130\uD53C\uC2A4")
                || firstTitle.equals("아주 축제 오프닝 퍼레이드")
                || firstTitle.equals("율곡관 밴드 라이브")
                || firstTitle.equals("중앙광장 DJ 나이트");
    }

    private List<FestivalEvent> seedEvents(LocalDateTime now) {
        return List.of(
                new FestivalEvent("\uB4DD\uADFC\uB4DD\uADFC \uD3EC\uC9D5 \uACF5\uC5F0", now.minusMinutes(25), now.plusMinutes(20), "\uC608\uC815", defaultEventImageUrl("\uB4DD\uADFC\uB4DD\uADFC \uD3EC\uC9D5 \uACF5\uC5F0"), defaultEventImageCredit("\uB4DD\uADFC\uB4DD\uADFC \uD3EC\uC9D5 \uACF5\uC5F0"), defaultEventImageFocus("\uB4DD\uADFC\uB4DD\uADFC \uD3EC\uC9D5 \uACF5\uC5F0")),
                new FestivalEvent("\uD558\uCE20\uD22C\uD558\uD2B8", now.plusMinutes(50), now.plusHours(1).plusMinutes(40), "\uC608\uC815", defaultEventImageUrl("\uD558\uCE20\uD22C\uD558\uD2B8"), defaultEventImageCredit("\uD558\uCE20\uD22C\uD558\uD2B8"), defaultEventImageFocus("\uD558\uCE20\uD22C\uD558\uD2B8")),
                new FestivalEvent("\uD558\uC774\uD0A4", now.plusHours(2), now.plusHours(3), "\uC608\uC815", defaultEventImageUrl("\uD558\uC774\uD0A4"), defaultEventImageCredit("\uD558\uC774\uD0A4"), defaultEventImageFocus("\uD558\uC774\uD0A4")),
                new FestivalEvent("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130", now.plusHours(3).plusMinutes(30), now.plusHours(4).plusMinutes(30), "\uC608\uC815", defaultEventImageUrl("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130"), defaultEventImageCredit("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130"), defaultEventImageFocus("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130")),
                new FestivalEvent("\uD0A4\uD0A4", now.plusHours(5), now.plusHours(6), "\uC608\uC815", defaultEventImageUrl("\uD0A4\uD0A4"), defaultEventImageCredit("\uD0A4\uD0A4"), defaultEventImageFocus("\uD0A4\uD0A4"))
        );
    }

    private void applyDefaultEventImages(EventRepository eventRepository) {
        eventRepository.findAll().forEach(event -> {
            if (event.getImageUrl() != null && !event.getImageUrl().isBlank()) {
                return;
            }
            String imageUrl = defaultEventImageUrl(event.getTitle());
            if (imageUrl == null) {
                return;
            }
            event.setImage(imageUrl, defaultEventImageCredit(event.getTitle()), defaultEventImageFocus(event.getTitle()));
            eventRepository.save(event);
        });
    }

    private String defaultEventImageUrl(String title) {
        if (title.contains("\uB4DD\uADFC\uB4DD\uADFC")) {
            return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Bodybuilder.jpg?width=900";
        }
        if (title.contains("\uD558\uCE20\uD22C\uD558\uD2B8")) {
            return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Hearts2Hearts_250515.jpg?width=900";
        }
        if (title.contains("\uD558\uC774\uD0A4")) {
            return "https://commons.wikimedia.org/wiki/Special:Redirect/file/H1-Key_in_February_2026.png?width=900";
        }
        if (title.contains("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130")) {
            return "https://commons.wikimedia.org/wiki/Special:Redirect/file/BABYMONSTER_in_Seattle.jpg?width=900";
        }
        if (title.contains("\uD0A4\uD0A4")) {
            return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Kiiikiii_250604.png?width=900";
        }
        return null;
    }

    private String defaultEventImageCredit(String title) {
        if (title.contains("\uB4DD\uADFC\uB4DD\uADFC")) {
            return "Wikimedia Commons / Bodybuilder.jpg";
        }
        if (title.contains("\uD558\uCE20\uD22C\uD558\uD2B8")) {
            return "Wikimedia Commons / Hearts2Hearts_250515.jpg";
        }
        if (title.contains("\uD558\uC774\uD0A4")) {
            return "Wikimedia Commons / H1-Key_in_February_2026.png";
        }
        if (title.contains("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130")) {
            return "Wikimedia Commons / BABYMONSTER_in_Seattle.jpg";
        }
        if (title.contains("\uD0A4\uD0A4")) {
            return "Wikimedia Commons / Kiiikiii_250604.png";
        }
        return null;
    }

    private String defaultEventImageFocus(String title) {
        if (title.contains("\uD558\uC774\uD0A4")) {
            return "57% 42%";
        }
        if (title.contains("\uD558\uCE20\uD22C\uD558\uD2B8")
                || title.contains("\uBCA0\uC774\uBE44\uBAAC\uC2A4\uD130")
                || title.contains("\uD0A4\uD0A4")) {
            return "center 42%";
        }
        if (title.contains("\uB4DD\uADFC\uB4DD\uADFC")) {
            return "center 35%";
        }
        return null;
    }
}
