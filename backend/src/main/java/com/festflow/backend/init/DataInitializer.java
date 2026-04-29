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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

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
            LocalDateTime seedTime = LocalDateTime.now();
            List<Booth> seedBooths = new ArrayList<>(seedBooths(seedTime));
            seedBooths.addAll(supplementalBooths(seedTime));

            if (boothRepository.count() == 0) {
                boothRepository.saveAll(seedBooths);
            } else {
                List<Booth> existing = boothRepository.findAll().stream()
                        .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                        .toList();

                if (shouldRefreshSeedBooths(existing)) {
                    int limit = Math.min(existing.size(), seedBooths.size());
                    for (int i = 0; i < limit; i++) {
                        Booth target = existing.get(i);
                        Booth source = seedBooths.get(i);
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
                        target.updateContentInfo(
                                source.getCategory(),
                                source.getDayPart(),
                                source.getOpenTime(),
                                source.getCloseTime(),
                                source.getTags(),
                                source.getContentJson(),
                                source.getReservationEnabled()
                        );
                        boothRepository.save(target);
                    }

                    if (existing.size() < seedBooths.size()) {
                        boothRepository.saveAll(seedBooths.subList(existing.size(), seedBooths.size()));
                    }
                }
            }
            ensureSeedBoothCatalog(boothRepository, seedBooths);

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
                        "운영 안내",
                        "축제 현장 상황에 따라 부스 운영시간과 공연 시작 시간이 실시간으로 조정될 수 있습니다.",
                        "안내",
                        true
                ));
            }

            if (staffMemberRepository.count() == 0) {
                List<Booth> orderedBooths = boothRepository.findAll().stream()
                        .sorted(Comparator.comparing(Booth::getDisplayOrder).thenComparing(Booth::getId))
                        .toList();
                List<String> teams = List.of("운영", "안내", "안전", "무대", "부스", "미디어");
                List<String> tasks = List.of(
                        "입구 동선 안내",
                        "혼잡 구역 인원 확인",
                        "부스 대기열 정리",
                        "분실물 접수",
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
                            "스태프" + String.format("%02d", i + 1),
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

    private List<Booth> seedBooths(LocalDateTime now) {
        return List.of(
                booth("디지털미디어학과 네온주점", 37.2832, 127.0451, "디지털미디어학과에서 운영하는 테마 주점", 1, "https://picsum.photos/seed/festflow-ajou-pub-1/800/450", 7, 120, "시그니처 음료 판매 중", now, "주점", "야간", "18:00", "01:00", "야간, 주류, 음악", true),
                booth("산업공학과 이음주점", 37.2824, 127.0439, "산업공학과 학생회가 운영하는 주점", 2, "https://picsum.photos/seed/festflow-ajou-pub-2/800/450", 5, 60, "대기줄이 빠르게 줄고 있어요", now, "주점", "야간", "18:00", "01:00", "야식, 단체석", true),
                booth("푸드트럭 치즈랩", 37.2817, 127.0447, "치즈 핫도그와 감자튀김을 판매하는 푸드 부스", 3, "https://picsum.photos/seed/festflow-ajou-food-1/800/450", 4, 90, "감자튀김 재고 여유", now, "음식", "상시", "11:00", "23:30", "간식, 포장가능", false),
                booth("타코야끼 스테이션", 37.2829, 127.0428, "따뜻한 타코야끼와 음료를 빠르게 제공하는 먹거리 부스", 4, "https://picsum.photos/seed/festflow-ajou-food-2/800/450", 8, 55, "타코야끼 10분 단위 조리 중", now, "음식", "야간", "17:00", "00:30", "야식, 인기", false),
                booth("VR 리듬 챌린지", 37.2830, 127.0441, "VR 리듬 게임을 체험하고 랭킹에 도전하는 부스", 5, "https://picsum.photos/seed/festflow-ajou-vr/800/450", 6, 30, "2인 체험 가능", now, "체험", "주간", "12:00", "20:00", "체험, 랭킹전, 실내", false),
                booth("AI 캐리커처 랩", 37.2822, 127.0449, "현장 사진으로 AI 캐리커처 이미지를 만들어 주는 체험 부스", 6, "https://picsum.photos/seed/festflow-ajou-ai-art/800/450", 9, 40, "출력 대기 약간 있음", now, "체험", "상시", "13:00", "22:00", "AI, 포토, 출력", false),
                booth("스탬프 미션 센터", 37.2819, 127.0436, "축제 구역을 돌며 스탬프를 모으는 이벤트 접수처", 7, "https://picsum.photos/seed/festflow-ajou-stamp/800/450", 2, 200, "완주 기념품 여유", now, "이벤트", "주간", "10:00", "19:00", "미션, 경품", false),
                booth("럭키드로우 박스", 37.2827, 127.0454, "시간대별 추첨 이벤트와 현장 미션을 운영하는 부스", 8, "https://picsum.photos/seed/festflow-ajou-lucky/800/450", 5, 120, "19시 추첨권 배부 중", now, "이벤트", "야간", "16:00", "23:00", "추첨, 경품", false),
                booth("공식 굿즈 숍", 37.2834, 127.0443, "티셔츠, 키링, 응원봉 등 축제 공식 굿즈 판매", 9, "https://picsum.photos/seed/festflow-ajou-goods/800/450", 3, 45, "인기 키링 재입고", now, "굿즈", "상시", "11:00", "22:00", "굿즈, 카드가능", false),
                booth("핸드메이드 플리마켓", 37.2818, 127.0452, "학생 작가들의 액세서리와 소품을 만나는 플리마켓", 10, "https://picsum.photos/seed/festflow-ajou-flea/800/450", 2, 70, "신규 셀러 입점", now, "플리마켓", "주간", "12:00", "18:00", "수공예, 소품", false),
                booth("포토카드 프린트 존", 37.2825, 127.0431, "축제 사진을 포토카드로 바로 출력하는 포토 부스", 11, "https://picsum.photos/seed/festflow-ajou-photo-card/800/450", 6, 80, "인화지 재고 충분", now, "포토존", "상시", "11:30", "23:00", "사진, 출력", false),
                booth("네온 포토 터널", 37.2831, 127.0429, "야간 조명과 함께 사진을 찍는 대표 포토존", 12, "https://picsum.photos/seed/festflow-ajou-neon-photo/800/450", 4, 999, "야간 조명 점등 완료", now, "포토존", "야간", "18:30", "01:00", "야간, 사진", false),
                booth("종합 안내 데스크", 37.2816, 127.0440, "행사 위치, 분실물, 시간 변경을 안내하는 중앙 데스크", 13, "https://picsum.photos/seed/festflow-ajou-info/800/450", 1, 999, "공연 지연 안내 가능", now, "안내", "상시", "10:00", "01:00", "안내, 분실물", false),
                booth("응급 케어 스팟", 37.2820, 127.0427, "간단한 응급 처치와 휴식 지원을 제공하는 안전 부스", 14, "https://picsum.photos/seed/festflow-ajou-care/800/450", 0, 999, "상비약 및 휴식석 운영", now, "응급", "상시", "10:00", "01:00", "응급, 휴식", false),
                booth("전자공학과 파동주점", 37.2830, 127.0446, "전자공학과의 시그니처 야식 주점", 15, "https://picsum.photos/seed/festflow-ajou-pub-3/800/450", 6, 95, "핫도그 세트 인기", now, "주점", "야간", "18:00", "01:00", "야식, 주류", true),
                booth("소프트웨어학과 버그제로 주점", 37.2822, 127.0455, "소프트웨어학과 학생회가 운영하는 게임 콘셉트 주점", 16, "https://picsum.photos/seed/festflow-ajou-pub-4/800/450", 8, 70, "주문 처리 원활", now, "주점", "야간", "18:00", "01:00", "게임, 단체석", true)
        );
    }

    private Booth booth(String name, double latitude, double longitude, String description, Integer displayOrder,
                        String imageUrl, Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage,
                        LocalDateTime liveStatusUpdatedAt, String category, String dayPart, String openTime,
                        String closeTime, String tags, Boolean reservationEnabled) {
        Booth booth = new Booth(name, latitude, longitude, description, displayOrder, imageUrl, estimatedWaitMinutes,
                remainingStock, liveStatusMessage, liveStatusUpdatedAt);
        booth.updateContentInfo(category, dayPart, LocalTime.parse(openTime), LocalTime.parse(closeTime), tags, null, reservationEnabled);
        return booth;
    }

    private List<Booth> supplementalBooths(LocalDateTime now) {
        return List.of(
                booth("비건 덮밥 키친", 37.2828, 127.0435, "채식 덮밥과 샐러드를 판매하는 건강식 부스", 17, "https://picsum.photos/seed/festflow-ajou-vegan/800/450", 3, 85, "두부 스테이크 덮밥 판매 중", now, "음식", "주간", "11:00", "19:00", "비건, 식사", false),
                booth("크레페 디저트 바", 37.2815, 127.0448, "과일 크레페와 아이스 음료를 판매하는 디저트 부스", 18, "https://picsum.photos/seed/festflow-ajou-crepe/800/450", 5, 65, "딸기 크레페 인기", now, "음식", "상시", "12:00", "22:00", "디저트, 음료", false),
                booth("보드게임 라운지", 37.2826, 127.0457, "친구들과 짧게 즐기는 보드게임 체험 공간", 19, "https://picsum.photos/seed/festflow-ajou-boardgame/800/450", 4, 40, "4인 테이블 여유", now, "체험", "상시", "12:00", "23:00", "실내, 게임", false),
                booth("향수 블렌딩 클래스", 37.2835, 127.0438, "나만의 향을 조합해 미니 향수를 만드는 체험 부스", 20, "https://picsum.photos/seed/festflow-ajou-perfume/800/450", 7, 36, "예약 없이 현장 접수 가능", now, "체험", "주간", "13:00", "18:30", "공방, 만들기", false),
                booth("방탈출 미니룸", 37.2814, 127.0434, "10분 안에 단서를 풀어 탈출하는 미니 방탈출", 21, "https://picsum.photos/seed/festflow-ajou-escape/800/450", 10, 25, "난이도 하 코스 운영", now, "체험", "야간", "17:00", "23:30", "퍼즐, 팀플", false),
                booth("댄스 배틀 접수처", 37.2837, 127.0449, "즉석 댄스 배틀 참가 등록과 대진 안내 부스", 22, "https://picsum.photos/seed/festflow-ajou-dance/800/450", 2, 120, "20시 예선 참가 접수 중", now, "이벤트", "야간", "16:00", "21:00", "공연, 참가형", false),
                booth("퀴즈 쇼 아레나", 37.2821, 127.0425, "현장 관객이 참여하는 상식 퀴즈 이벤트 부스", 23, "https://picsum.photos/seed/festflow-ajou-quiz/800/450", 1, 150, "매시 정각 라운드 시작", now, "이벤트", "상시", "13:00", "22:00", "퀴즈, 경품", false),
                booth("랜덤 플레이 댄스 존", 37.2840, 127.0441, "랜덤 음악에 맞춰 누구나 참여하는 야외 이벤트", 24, "https://picsum.photos/seed/festflow-ajou-rpd/800/450", 0, 999, "19시 메인 라운드 예정", now, "이벤트", "야간", "18:00", "23:00", "댄스, 야외", false),
                booth("아주대 굿즈 리셀렉트", 37.2819, 127.0460, "학과 굿즈와 한정판 축제 소품을 판매하는 부스", 25, "https://picsum.photos/seed/festflow-ajou-campus-goods/800/450", 4, 58, "한정 스티커 재고 여유", now, "굿즈", "상시", "11:00", "21:30", "스티커, 키링", false),
                booth("응원봉 커스텀 샵", 37.2829, 127.0462, "응원봉과 팔찌를 꾸미는 커스텀 굿즈 부스", 26, "https://picsum.photos/seed/festflow-ajou-lightstick/800/450", 6, 44, "LED 팔찌 판매 중", now, "굿즈", "야간", "16:00", "00:00", "응원, 커스텀", false),
                booth("빈티지 의류 마켓", 37.2813, 127.0456, "학생 셀러가 운영하는 빈티지 의류 플리마켓", 27, "https://picsum.photos/seed/festflow-ajou-vintage/800/450", 2, 76, "아우터 할인 진행", now, "플리마켓", "주간", "12:00", "18:30", "의류, 중고", false),
                booth("레코드 앤 북 마켓", 37.2836, 127.0427, "LP, 독립출판물, 중고 도서를 만나는 마켓", 28, "https://picsum.photos/seed/festflow-ajou-records/800/450", 1, 90, "독립출판 코너 운영", now, "플리마켓", "주간", "11:30", "19:00", "책, 음악", false),
                booth("달빛 인생네컷", 37.2841, 127.0432, "달빛 조명 콘셉트의 즉석 사진 포토존", 29, "https://picsum.photos/seed/festflow-ajou-moon-photo/800/450", 8, 999, "야간 촬영 대기 증가", now, "포토존", "야간", "18:00", "01:00", "사진, 조명", false),
                booth("학과 깃발 포토월", 37.2811, 127.0442, "학과 깃발과 축제 배너 앞에서 촬영하는 포토월", 30, "https://picsum.photos/seed/festflow-ajou-flagwall/800/450", 2, 999, "낮 시간 촬영 추천", now, "포토존", "주간", "10:00", "18:00", "단체사진, 포토월", false),
                booth("외국인 안내 센터", 37.2839, 127.0453, "영어 안내와 캠퍼스 길찾기를 지원하는 안내 부스", 31, "https://picsum.photos/seed/festflow-ajou-global-info/800/450", 1, 999, "영어 안내 가능", now, "안내", "상시", "10:00", "23:00", "영어, 길찾기", false),
                booth("충전 스테이션", 37.2823, 127.0464, "휴대폰 충전과 보조배터리 대여를 지원하는 편의 부스", 32, "https://picsum.photos/seed/festflow-ajou-charge/800/450", 3, 35, "C타입 케이블 여유", now, "안내", "상시", "10:00", "01:00", "충전, 대여", false),
                booth("쿨다운 휴식존", 37.2810, 127.0437, "탈수와 과열을 예방하는 그늘 휴식 부스", 33, "https://picsum.photos/seed/festflow-ajou-cooldown/800/450", 0, 999, "생수 보충 완료", now, "응급", "주간", "11:00", "20:00", "휴식, 생수", false),
                booth("야간 안전 라운지", 37.2842, 127.0448, "늦은 시간 귀가 동선과 안전 상담을 지원하는 부스", 34, "https://picsum.photos/seed/festflow-ajou-night-safe/800/450", 1, 999, "귀가 동선 안내 중", now, "응급", "야간", "18:00", "01:00", "안전, 귀가", false),
                booth("창업동아리 데모데이", 37.2833, 127.0466, "학생 창업팀의 제품을 시연하고 피드백을 받는 부스", 35, "https://picsum.photos/seed/festflow-ajou-demo/800/450", 2, 100, "체험 피드백 이벤트 중", now, "기타", "주간", "12:00", "18:00", "창업, 데모", false),
                booth("멍때리기 힐링존", 37.2812, 127.0429, "짧게 쉬어갈 수 있는 조용한 힐링 콘텐츠 부스", 36, "https://picsum.photos/seed/festflow-ajou-healing/800/450", 0, 999, "좌석 여유", now, "기타", "상시", "11:00", "23:00", "휴식, 조용함", false)
        );
    }

    private void ensureSeedBoothCatalog(BoothRepository boothRepository, List<Booth> seedBooths) {
        List<Booth> existing = boothRepository.findAll();
        List<String> existingNames = existing.stream().map(Booth::getName).toList();
        List<Booth> missing = seedBooths.stream()
                .filter(seed -> !existingNames.contains(seed.getName()))
                .toList();
        if (!missing.isEmpty()) {
            boothRepository.saveAll(missing);
        }
    }

    private boolean shouldRefreshSeedBooths(List<Booth> booths) {
        if (booths.isEmpty()) {
            return false;
        }
        String firstName = booths.get(0).getName();
        boolean legacyNames = firstName.contains("Ajou")
                || firstName.startsWith("디지털미디어학과 ")
                || firstName.startsWith("?")
                || firstName.contains("二쇱젏");
        boolean onlyPubCategory = booths.stream()
                .allMatch(booth -> booth.getCategory() == null || "주점".equals(booth.getCategory()));
        return legacyNames || onlyPubCategory;
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
                || firstTitle.equals("아주 축제 스프링 퍼레이드")
                || firstTitle.equals("팔달관 밴드 라이브")
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
