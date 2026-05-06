package com.festflow.backend.init;

import com.festflow.backend.entity.AdminUser;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.FestivalEvent;
import com.festflow.backend.entity.LostItem;
import com.festflow.backend.entity.Notice;
import com.festflow.backend.entity.StaffMember;
import com.festflow.backend.entity.StaffStatus;
import com.festflow.backend.repository.AdminUserRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.EventRepository;
import com.festflow.backend.repository.LostItemRepository;
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
import java.util.Set;

@Configuration
public class DataInitializer {

    private static final List<String> STAFF_NAMES = List.of(
            "강승완",
            "고나연",
            "고명범",
            "곽유나",
            "박종현",
            "권도희",
            "권태완",
            "김규민",
            "김나윤",
            "김민서",
            "김정연",
            "김정우",
            "김찬호",
            "김하은",
            "늑구",
            "맹쥰성",
            "정재훈"
    );

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
            LostItemRepository lostItemRepository,
            StaffMemberRepository staffMemberRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            LocalDateTime now = LocalDateTime.now();

            List<Booth> demoBooths = seedBooths(now);
            if (boothRepository.count() == 0) {
                boothRepository.saveAll(demoBooths);
            } else {
                seedMissingDemoBooths(boothRepository, demoBooths);
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

            seedDemoLostItems(lostItemRepository);

            seedInitialAdmin(adminUserRepository, passwordEncoder);

            List<Booth> booths = boothRepository.findAll().stream()
                    .sorted(Comparator.comparing(Booth::getDisplayOrder))
                    .toList();
            if (staffMemberRepository.count() == 0) {
                staffMemberRepository.saveAll(seedStaff(booths, passwordEncoder));
            } else if (simpleDemoCredentials) {
                syncDemoStaff(staffMemberRepository, booths, passwordEncoder);
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
                booth("응급 케어 스팟", 37.2820, 127.0427, "간단한 응급 처치와 휴식 공간을 제공하는 안전 부스입니다.", 10, 0, 999, "생수 및 휴식 가능", now, "응급", "상시", "10:00", "01:00", "응급, 휴식", false),
                booth("분실물 보관소", 37.2814, 127.0438, "습득물 접수, 보관, 본인 확인 후 반환을 처리하는 분실물 전용 부스입니다.", 11, 1, 999, "접수 및 반환 가능", now, "분실물", "상시", "10:00", "01:00", "분실물, 보관, 반환", false),
                booth("네컷 포토존", 37.2826, 127.0432, "축제 프레임으로 사진을 남길 수 있는 포토 부스입니다.", 12, 5, 80, "대기줄 짧음", now, "포토존", "상시", "11:00", "23:00", "사진, 추억, 포토카드", false),
                booth("야광 팔찌 만들기", 37.2828, 127.0447, "야간 공연 전 직접 야광 팔찌를 만드는 체험 부스입니다.", 13, 6, 65, "재료 여유", now, "체험", "야간", "16:00", "23:30", "공예, 야광, 체험", false),
                booth("청년 플리마켓", 37.2818, 127.0450, "학생 셀러가 직접 만든 소품과 중고 굿즈를 판매하는 마켓입니다.", 14, 3, 110, "셀러 8팀 운영 중", now, "플리마켓", "주간", "11:00", "18:00", "소품, 굿즈, 마켓", false),
                booth("모바일 충전 스테이션", 37.2831, 127.0435, "보조배터리 대여와 휴대폰 급속 충전을 지원하는 편의 부스입니다.", 15, 2, 24, "C타입 케이블 여유", now, "편의", "상시", "10:00", "01:00", "충전, 대여, 편의", false),
                booth("미니 게임 존", 37.2815, 127.0446, "다트, 링토스, 랜덤 미션을 즐기고 경품을 받을 수 있는 게임 부스입니다.", 16, 4, 150, "경품 지급 중", now, "게임", "상시", "12:00", "22:00", "게임, 경품, 미션", false)
        );
    }

    private void seedInitialAdmin(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder) {
        if (initialAdminUsername == null
                || initialAdminPassword == null
                || initialAdminUsername.isBlank()
                || initialAdminPassword.isBlank()) {
            return;
        }

        String username = initialAdminUsername.trim();
        String encodedPassword = passwordEncoder.encode(initialAdminPassword);
        adminUserRepository.findByUsername(username).ifPresentOrElse(
                admin -> {
                    admin.updatePassword(encodedPassword);
                    adminUserRepository.save(admin);
                },
                () -> adminUserRepository.save(new AdminUser(username, encodedPassword, "ADMIN"))
        );
    }

    private void seedMissingDemoBooths(BoothRepository boothRepository, List<Booth> demoBooths) {
        Set<String> existingNames = boothRepository.findAll().stream()
                .map(Booth::getName)
                .collect(java.util.stream.Collectors.toSet());
        int nextOrder = boothRepository.findTopByOrderByDisplayOrderDesc()
                .map(Booth::getDisplayOrder)
                .orElse(0) + 1;

        for (Booth booth : demoBooths) {
            if (!existingNames.contains(booth.getName())) {
                booth.setDisplayOrder(nextOrder++);
                boothRepository.save(booth);
            }
        }
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
        booth.setBoothIntro(description + " 운영시간은 " + openTime + "부터 " + closeTime + "까지입니다.");
        booth.setMenuBoardJson(seedMenuBoardJson(category, displayOrder));
        return booth;
    }

    private String seedMenuBoardJson(String category, Integer displayOrder) {
        return switch (category) {
            case "주점" -> """
                    [{"name":"대표 안주 세트","price":"12000원","description":"현장 인기 메뉴 조합","soldOut":false},{"name":"논알콜 음료","price":"3000원","description":"누구나 주문 가능","soldOut":false},{"name":"오늘의 한정 메뉴","price":"9000원","description":"재고 소진 시 마감","soldOut":false}]
                    """.trim();
            case "푸드", "음식" -> """
                    [{"name":"대표 메뉴","price":"7000원","description":"빠르게 받을 수 있는 기본 메뉴","soldOut":false},{"name":"사이드 메뉴","price":"4000원","description":"간단히 나눠 먹기 좋음","soldOut":false},{"name":"세트 메뉴","price":"10000원","description":"음료 포함","soldOut":false}]
                    """.trim();
            case "굿즈", "플리마켓" -> """
                    [{"name":"기념 스티커","price":"2000원","description":"축제 한정 디자인","soldOut":false},{"name":"랜덤 굿즈","price":"5000원","description":"현장 수량 한정","soldOut":false},{"name":"패키지 세트","price":"12000원","description":"인기 상품 묶음","soldOut":false}]
                    """.trim();
            case "체험", "게임", "포토존" -> """
                    [{"name":"기본 체험권","price":"3000원","description":"1회 참여","soldOut":false},{"name":"2인 체험권","price":"5000원","description":"친구와 함께 참여","soldOut":false},{"name":"기념 출력","price":"2000원","description":"결과물 추가 출력","soldOut":false}]
                    """.trim();
            default -> "[{\"name\":\"현장 안내\",\"price\":\"무료\",\"description\":\"스태프에게 문의하세요\",\"soldOut\":false},{\"name\":\"긴급 도움\",\"price\":\"무료\",\"description\":\"필요 시 즉시 지원\",\"soldOut\":false},{\"name\":\"위치 문의\",\"price\":\"무료\",\"description\":\"주요 부스와 공연장 안내\",\"soldOut\":false}]";
        };
    }

    private List<FestivalEvent> seedEvents(LocalDateTime now) {
        return List.of(
                new FestivalEvent("오프닝 공연", now.plusMinutes(30), now.plusMinutes(70), "예정", null, null, null),
                new FestivalEvent("밴드 라이브", now.plusHours(2), now.plusHours(3), "예정", null, null, null),
                new FestivalEvent("댄스팀 쇼케이스", now.plusHours(3).plusMinutes(30), now.plusHours(4).plusMinutes(20), "예정", null, null, null),
                new FestivalEvent("DJ 피날레", now.plusHours(5), now.plusHours(6), "예정", null, null, null)
        );
    }

    private void seedDemoLostItems(LostItemRepository lostItemRepository) {
        List<String> existingTitles = lostItemRepository.findAll().stream()
                .map(LostItem::getTitle)
                .toList();

        List<LostItem> demoItems = List.of(
                lostItem(
                        "검은색 가죽 지갑",
                        "검은색 반지갑입니다. 내부에 카드 여러 장과 학생증으로 보이는 카드가 들어 있습니다.",
                        "지갑",
                        "종합 안내 데스크 앞 벤치",
                        "https://images.pexels.com/photos/7085781/pexels-photo-7085781.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "흰색 무선 이어폰 케이스",
                        "흰색 무선 이어폰 케이스입니다. 케이스에 작은 스트랩이 달려 있습니다.",
                        "전자기기",
                        "푸드트럭 구역 테이블",
                        "https://images.pexels.com/photos/26550470/pexels-photo-26550470.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "초록색 접이식 우산",
                        "초록색과 주황색이 섞인 접이식 우산입니다. 비닐 커버 없이 접힌 상태로 발견되었습니다.",
                        "우산",
                        "노천극장 입구 계단",
                        "https://images.pexels.com/photos/26185842/pexels-photo-26185842.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "실버 텀블러",
                        "은색 스테인리스 텀블러입니다. 뚜껑 부분에 작은 흠집이 있습니다.",
                        "생활용품",
                        "공식 굿즈샵 옆 휴게 공간",
                        "https://images.pexels.com/photos/8852778/pexels-photo-8852778.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "베이지색 에코백",
                        "베이지색 캔버스 에코백입니다. 안쪽에 작은 파우치와 선글라스 케이스가 들어 있습니다.",
                        "가방",
                        "스탬프 미션 센터 앞",
                        "https://images.pexels.com/photos/26894083/pexels-photo-26894083.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "검정 노트북 충전기",
                        "65W USB-C 타입 노트북 충전기입니다. 케이블에 흰색 이름표 스티커가 붙어 있습니다.",
                        "전자기기",
                        "모바일 충전 스테이션",
                        "https://images.pexels.com/photos/4219861/pexels-photo-4219861.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "학생증 카드",
                        "투명 카드홀더에 들어 있는 학생증입니다. 파란색 목걸이 줄이 연결되어 있습니다.",
                        "카드",
                        "네컷 포토존 대기줄",
                        "https://images.pexels.com/photos/4466172/pexels-photo-4466172.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "빨간 후드 집업",
                        "빨간색 후드 집업입니다. 왼쪽 소매 끝에 작은 얼룩이 있습니다.",
                        "의류",
                        "노천극장 객석 뒤편",
                        "https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "차 키 키링",
                        "검은색 스마트키와 작은 곰 모양 키링이 달린 열쇠입니다.",
                        "열쇠",
                        "청년 플리마켓 계산대",
                        "https://images.pexels.com/photos/279810/pexels-photo-279810.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "투명 물병",
                        "500ml 투명 물병입니다. 뚜껑에 민트색 손잡이가 달려 있습니다.",
                        "생활용품",
                        "미니 게임 존 옆 벤치",
                        "https://images.pexels.com/photos/416528/pexels-photo-416528.jpeg?auto=compress&cs=tinysrgb&w=800"
                ),
                lostItem(
                        "보라색 파우치",
                        "작은 화장품과 립밤이 들어 있는 보라색 지퍼 파우치입니다.",
                        "파우치",
                        "공과대학 주점 테이블",
                        "https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?auto=compress&cs=tinysrgb&w=800"
                )
        );

        List<LostItem> missingItems = demoItems.stream()
                .filter(item -> !existingTitles.contains(item.getTitle()))
                .toList();
        if (!missingItems.isEmpty()) {
            lostItemRepository.saveAll(missingItems);
        }
    }

    private LostItem lostItem(String title, String description, String category, String foundLocation, String imageUrl) {
        return new LostItem(
                title,
                description,
                category,
                foundLocation,
                "종합 안내 데스크",
                imageUrl,
                "REGISTERED",
                "STAFF",
                "seed"
        );
    }

    private List<StaffMember> seedStaff(List<Booth> booths, PasswordEncoder passwordEncoder) {
        return java.util.stream.IntStream.range(0, STAFF_NAMES.size())
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
                STAFF_NAMES.get(index),
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
            member.setName(i < STAFF_NAMES.size() ? STAFF_NAMES.get(i) : "스태프 " + number);
            member.setTeam(i % 2 == 0 ? "운영" : "안전");
        }
        staffMemberRepository.saveAll(staff);
    }

    private void syncDemoStaff(
            StaffMemberRepository staffMemberRepository,
            List<Booth> booths,
            PasswordEncoder passwordEncoder
    ) {
        simplifyStaffCredentials(staffMemberRepository, passwordEncoder);

        long existingCount = staffMemberRepository.count();
        if (existingCount >= STAFF_NAMES.size()) {
            return;
        }

        List<StaffMember> missingStaff = java.util.stream.IntStream
                .range((int) existingCount, STAFF_NAMES.size())
                .mapToObj(i -> createStaff(i, booths, passwordEncoder))
                .toList();
        staffMemberRepository.saveAll(missingStaff);
    }
}
