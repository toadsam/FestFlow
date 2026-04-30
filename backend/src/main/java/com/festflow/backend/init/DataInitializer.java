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
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;

@Configuration
public class DataInitializer {

    @Value("${app.init.admin.username:}")
    private String initialAdminUsername;

    @Value("${app.init.admin.password:}")
    private String initialAdminPassword;

    @Value("${app.init.simple-demo-credentials:false}")
    private boolean simpleDemoCredentials;

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
            LocalDateTime now = LocalDateTime.now();

            if (boothRepository.count() == 0) {
                boothRepository.saveAll(seedBooths(now));
            }

            if (eventRepository.count() == 0) {
                eventRepository.saveAll(seedEvents(now));
            }

            if (noticeRepository.count() == 0) {
                noticeRepository.save(new Notice(
                        "운영 안내",
                        "축제 현장 상황에 따라 부스 운영 시간과 공연 시작 시간이 조정될 수 있습니다.",
                        "안내",
                        true
                ));
            }

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

            List<Booth> booths = boothRepository.findAll().stream()
                    .sorted(Comparator.comparing(Booth::getDisplayOrder))
                    .toList();
            if (staffMemberRepository.count() == 0) {
                staffMemberRepository.saveAll(seedStaff(booths, passwordEncoder));
            } else if (simpleDemoCredentials) {
                simplifyStaffCredentials(staffMemberRepository, passwordEncoder);
            }
        };
    }

    private List<Booth> seedBooths(LocalDateTime now) {
        return List.of(
                booth("공과대학 주점", 37.2832, 127.0451, "공과대학 학생회가 운영하는 야간 주점입니다.", 1, 7, 120, "대표 메뉴 판매 중", now, "주점", "야간", "18:00", "01:00", "주류, 안주, 야간", true),
                booth("소프트웨어학과 주점", 37.2822, 127.0455, "게임 콘셉트로 꾸민 주점입니다.", 2, 8, 70, "주문 처리 원활", now, "주점", "야간", "18:00", "01:00", "주류, 게임", true),
                booth("닭강정 푸드트럭", 37.2817, 127.0447, "닭강정과 감자튀김을 판매하는 먹거리 부스입니다.", 3, 4, 90, "바로 주문 가능", now, "푸드", "상시", "11:00", "23:30", "간식, 포장", false),
                booth("타코야키 스테이션", 37.2829, 127.0428, "따뜻한 타코야키와 음료를 제공합니다.", 4, 8, 55, "10분 단위 조리 중", now, "푸드", "야간", "17:00", "00:30", "일식, 인기", false),
                booth("VR 리듬 챌린지", 37.2830, 127.0441, "VR 리듬 게임을 체험하고 랭킹에 도전하는 부스입니다.", 5, 6, 30, "2인 체험 가능", now, "체험", "주간", "12:00", "20:00", "VR, 랭킹", false),
                booth("AI 캐리커처", 37.2822, 127.0449, "현장 사진으로 AI 캐리커처 이미지를 만드는 체험 부스입니다.", 6, 9, 40, "출력 대기 있음", now, "체험", "상시", "13:00", "22:00", "AI, 포토", false),
                booth("스탬프 미션 센터", 37.2819, 127.0436, "축제 구역을 돌며 스탬프를 모으는 이벤트 접수처입니다.", 7, 2, 200, "기념품 여유", now, "이벤트", "주간", "10:00", "19:00", "미션, 경품", false),
                booth("공식 굿즈샵", 37.2834, 127.0443, "티셔츠, 스티커, 응원봉 등 축제 공식 굿즈를 판매합니다.", 8, 3, 45, "인기 상품 재입고", now, "굿즈", "상시", "11:00", "22:00", "굿즈, 기념품", false),
                booth("종합 안내 데스크", 37.2816, 127.0440, "행사 위치, 분실물, 시간 변경을 안내하는 중앙 데스크입니다.", 9, 1, 999, "상시 안내 가능", now, "안내", "상시", "10:00", "01:00", "안내, 분실물", false),
                booth("응급 케어 스팟", 37.2820, 127.0427, "간단한 응급 처치와 휴식 공간을 제공하는 안전 부스입니다.", 10, 0, 999, "생수 및 휴식 가능", now, "응급", "상시", "10:00", "01:00", "응급, 휴식", false)
        );
    }

    private Booth booth(String name, double latitude, double longitude, String description, Integer displayOrder,
                        Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage,
                        LocalDateTime liveStatusUpdatedAt, String category, String dayPart, String openTime,
                        String closeTime, String tags, Boolean reservationEnabled) {
        Booth booth = new Booth(
                name,
                latitude,
                longitude,
                description,
                displayOrder,
                "https://picsum.photos/seed/festflow-" + displayOrder + "/800/450",
                estimatedWaitMinutes,
                remainingStock,
                liveStatusMessage,
                liveStatusUpdatedAt
        );
        booth.updateContentInfo(category, dayPart, LocalTime.parse(openTime), LocalTime.parse(closeTime), tags, null, reservationEnabled);
        return booth;
    }

    private List<FestivalEvent> seedEvents(LocalDateTime now) {
        return List.of(
                new FestivalEvent("오프닝 공연", now.plusMinutes(30), now.plusMinutes(70), "예정", null, null, null),
                new FestivalEvent("밴드 라이브", now.plusHours(2), now.plusHours(3), "예정", null, null, null),
                new FestivalEvent("댄스팀 쇼케이스", now.plusHours(3).plusMinutes(30), now.plusHours(4).plusMinutes(20), "예정", null, null, null),
                new FestivalEvent("DJ 피날레", now.plusHours(5), now.plusHours(6), "예정", null, null, null)
        );
    }

    private List<StaffMember> seedStaff(List<Booth> booths, PasswordEncoder passwordEncoder) {
        return java.util.stream.IntStream.range(0, 12)
                .mapToObj(i -> createStaff(i, booths, passwordEncoder))
                .toList();
    }

    private StaffMember createStaff(int index, List<Booth> booths, PasswordEncoder passwordEncoder) {
        Booth booth = booths.isEmpty() ? null : booths.get(index % booths.size());
        StaffStatus status = index % 5 == 0 ? StaffStatus.URGENT : index % 3 == 0 ? StaffStatus.MOVING : StaffStatus.ON_DUTY;
        String number = String.valueOf(index + 1);
        return new StaffMember(
                number,
                passwordEncoder.encode(number),
                "스태프 " + number,
                index % 2 == 0 ? "운영" : "안전",
                status,
                index % 2 == 0 ? "입구 동선 안내" : "현장 순찰",
                "",
                booth != null ? booth.getId() : null,
                booth != null ? booth.getLatitude() : null,
                booth != null ? booth.getLongitude() : null,
                LocalDateTime.now().minusMinutes(index)
        );
    }

    private void simplifyStaffCredentials(
            StaffMemberRepository staffMemberRepository,
            PasswordEncoder passwordEncoder
    ) {
        List<StaffMember> staff = staffMemberRepository.findAll().stream()
                .sorted(Comparator.comparing(StaffMember::getId))
                .toList();
        for (int i = 0; i < staff.size(); i++) {
            String number = String.valueOf(i + 1);
            StaffMember member = staff.get(i);
            member.updateCredentials(number, passwordEncoder.encode(number));
            member.setName("스태프 " + number);
            member.setTeam(i % 2 == 0 ? "운영" : "안전");
        }
        staffMemberRepository.saveAll(staff);
    }
}
