package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchMeetupSlotDto;
import com.festflow.backend.dto.AiMatchMeetupSlotsDto;
import com.festflow.backend.entity.AiMatchMeetupSlot;
import com.festflow.backend.repository.AiMatchMeetupSlotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;

/**
 * 소개팅 부스 시간표. 축제 날짜마다 09:00~22:00 을 15분 슬롯으로 자르고, 슬롯 하나에는 한 쌍만 들어간다.
 * 한 명이 시간을 고르면 30분 동안 임시로 잠기고(상대 확정 대기), 상대가 확정하면 굳는다.
 * 부스를 늘려 슬롯당 여러 쌍을 받으려면 slot_at 유니크 제약을 (slot_at, lane) 으로 바꿔야 한다.
 */
@Service
public class AiMatchMeetupSlotService {

    public static final int SLOT_MINUTES = 15;
    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final LocalTime CLOSE_TIME = LocalTime.of(22, 0);
    public static final String BOOTH_NAME = "총학생회 소개팅 부스";
    /** 블라인드 만남이라 두 사람은 서로 다른 곳에서 기다리고, 스태프가 부스로 데려온다. */
    public static final String WAITING_PLACE_FEMALE = "성호관 앞";
    public static final String WAITING_PLACE_MALE = "중앙도서관 앞";

    private final AiMatchMeetupSlotRepository slotRepository;
    private final List<LocalDate> festivalDates;
    /** 시간을 고른 뒤 상대가 확정할 때까지 잠가 두는 시간(분). */
    private final int holdMinutes;

    public AiMatchMeetupSlotService(
            AiMatchMeetupSlotRepository slotRepository,
            @Value("${app.ai-match.meetup-dates:2026-10-07,2026-10-08}") String meetupDates,
            @Value("${app.ai-match.meetup-hold-minutes:30}") int holdMinutes
    ) {
        this.slotRepository = slotRepository;
        this.holdMinutes = Math.max(1, holdMinutes);
        this.festivalDates = Arrays.stream(meetupDates.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(LocalDate::parse)
                .sorted()
                .toList();
    }

    public List<String> getDates() {
        return festivalDates.stream().map(LocalDate::toString).toList();
    }

    /** 기한이 지난 임시 잠금과, 신청이 닫혀 주인이 없어진 슬롯을 치운다. 읽기·쓰기 전에 매번 부른다. */
    @Transactional
    public void purge() {
        slotRepository.deleteExpiredHolds(LocalDateTime.now());
        slotRepository.deleteOrphans();
    }

    @Transactional
    public AiMatchMeetupSlotsDto getSlots(String dateText, Long myRequestId) {
        purge();
        LocalDate date = resolveDate(dateText);
        LocalDateTime now = LocalDateTime.now();
        Map<LocalDateTime, AiMatchMeetupSlot> taken = slotRepository
                .findAllBySlotAtGreaterThanEqualAndSlotAtLessThanOrderBySlotAtAsc(date.atTime(OPEN_TIME), date.atTime(CLOSE_TIME))
                .stream()
                .collect(Collectors.toMap(AiMatchMeetupSlot::getSlotAt, slot -> slot, (a, b) -> a));

        List<AiMatchMeetupSlotDto> slots = new ArrayList<>();
        for (LocalDateTime at = date.atTime(OPEN_TIME); at.isBefore(date.atTime(CLOSE_TIME)); at = at.plusMinutes(SLOT_MINUTES)) {
            AiMatchMeetupSlot slot = taken.get(at);
            boolean mine = slot != null && myRequestId != null && myRequestId.equals(slot.getRequestId());
            String status;
            if (slot != null) {
                status = slot.isConfirmed() ? "TAKEN" : "HELD";
            } else if (at.isBefore(now)) {
                status = "PAST";
            } else {
                status = "FREE";
            }
            slots.add(new AiMatchMeetupSlotDto(at, status, mine));
        }
        return new AiMatchMeetupSlotsDto(date.toString(), getDates(), SLOT_MINUTES, holdMinutes, BOOTH_NAME, slots);
    }

    /** 이 신청 이름으로 슬롯을 임시로 잡는다. 이미 잡아 둔 슬롯이 있으면 놓고 새로 잡는다. */
    @Transactional
    public AiMatchMeetupSlot hold(Long requestId, LocalDateTime slotAt) {
        validateSlotTime(slotAt);
        purge();
        slotRepository.deleteByRequestIdNow(requestId);
        if (slotRepository.findBySlotAt(slotAt).isPresent()) {
            throw new ResponseStatusException(CONFLICT, "방금 다른 커플이 먼저 잡은 시간이에요. 다른 시간을 골라 주세요.");
        }
        try {
            return slotRepository.saveAndFlush(
                    new AiMatchMeetupSlot(slotAt, requestId, LocalDateTime.now().plusMinutes(holdMinutes))
            );
        } catch (DataIntegrityViolationException exception) {
            // 확인과 저장 사이에 다른 쌍이 끼어든 경우. DB 유니크 제약이 막아 준다.
            throw new ResponseStatusException(CONFLICT, "방금 다른 커플이 먼저 잡은 시간이에요. 다른 시간을 골라 주세요.");
        }
    }

    /** 상대가 확정. 임시 잠금이 이미 풀렸으면 empty. */
    @Transactional
    public Optional<AiMatchMeetupSlot> confirm(Long requestId) {
        purge();
        Optional<AiMatchMeetupSlot> slot = slotRepository.findByRequestId(requestId);
        slot.ifPresent(AiMatchMeetupSlot::confirm);
        return slot;
    }

    @Transactional
    public void release(Long requestId) {
        slotRepository.deleteByRequestIdNow(requestId);
    }

    @Transactional(readOnly = true)
    public Map<Long, AiMatchMeetupSlot> findByRequestIds(Collection<Long> requestIds) {
        if (requestIds == null || requestIds.isEmpty()) {
            return Map.of();
        }
        return slotRepository.findAllByRequestIdIn(requestIds).stream()
                .collect(Collectors.toMap(AiMatchMeetupSlot::getRequestId, slot -> slot, (a, b) -> a));
    }

    @Transactional(readOnly = true)
    public List<AiMatchMeetupSlot> findByDate(LocalDate date) {
        return slotRepository.findAllBySlotAtGreaterThanEqualAndSlotAtLessThanOrderBySlotAtAsc(date.atTime(OPEN_TIME), date.atTime(CLOSE_TIME));
    }

    public int slotsPerDay() {
        return (int) (java.time.Duration.between(OPEN_TIME, CLOSE_TIME).toMinutes() / SLOT_MINUTES);
    }

    /** 날짜가 비었거나 축제 날짜가 아니면: 오늘이 축제 날이면 오늘, 아니면 아직 안 지난 첫 날, 다 지났으면 마지막 날. */
    public LocalDate resolveDate(String dateText) {
        if (dateText != null && !dateText.isBlank()) {
            try {
                LocalDate parsed = LocalDate.parse(dateText.trim());
                if (festivalDates.contains(parsed)) {
                    return parsed;
                }
            } catch (DateTimeParseException ignored) {
                // 아래 기본값으로
            }
        }
        LocalDate today = LocalDate.now();
        return festivalDates.stream()
                .filter(date -> !date.isBefore(today))
                .findFirst()
                .orElse(festivalDates.get(festivalDates.size() - 1));
    }

    private void validateSlotTime(LocalDateTime slotAt) {
        if (slotAt == null) {
            throw new ResponseStatusException(BAD_REQUEST, "만날 시간을 선택해 주세요.");
        }
        if (!festivalDates.contains(slotAt.toLocalDate())) {
            throw new ResponseStatusException(BAD_REQUEST, "축제 기간의 시간만 고를 수 있어요.");
        }
        LocalTime time = slotAt.toLocalTime();
        boolean aligned = time.getSecond() == 0 && time.getNano() == 0 && time.getMinute() % SLOT_MINUTES == 0;
        if (!aligned || time.isBefore(OPEN_TIME) || !time.isBefore(CLOSE_TIME)) {
            throw new ResponseStatusException(BAD_REQUEST, "09:00부터 21:45까지 15분 단위 시간만 고를 수 있어요.");
        }
        if (slotAt.isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(BAD_REQUEST, "지나간 시간은 고를 수 없어요.");
        }
    }
}
