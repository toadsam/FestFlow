package com.festflow.backend.service;

import com.festflow.backend.dto.AiMatchMeetupSlotDto;
import com.festflow.backend.dto.AiMatchMeetupSlotsDto;
import com.festflow.backend.entity.AiMatchMeetupSlot;
import com.festflow.backend.repository.AiMatchMeetupSlotRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiMatchMeetupSlotServiceTest {

    // 늘 미래가 되도록 넉넉히 먼 날짜를 축제 날짜로 쓴다.
    private static final LocalDate DAY = LocalDate.now().plusYears(1);

    @Mock
    private AiMatchMeetupSlotRepository slotRepository;

    private AiMatchMeetupSlotService service;

    @BeforeEach
    void setUp() {
        service = new AiMatchMeetupSlotService(slotRepository, DAY + "," + DAY.plusDays(1), 30);
    }

    @Test
    void 하루는_09시부터_21시45분까지_15분_슬롯_52개() {
        when(slotRepository.findAllBySlotAtGreaterThanEqualAndSlotAtLessThanOrderBySlotAtAsc(any(), any())).thenReturn(List.of());

        AiMatchMeetupSlotsDto slots = service.getSlots(DAY.toString(), null);

        assertEquals(52, slots.slots().size());
        assertEquals(DAY.atTime(9, 0), slots.slots().get(0).startAt());
        assertEquals(DAY.atTime(21, 45), slots.slots().get(51).startAt());
        assertTrue(slots.slots().stream().allMatch(slot -> "FREE".equals(slot.status())));
    }

    @Test
    void 임시_잠금은_HELD_확정은_TAKEN_내_슬롯은_mine() {
        AiMatchMeetupSlot held = new AiMatchMeetupSlot(DAY.atTime(14, 15), 7L, LocalDateTime.now().plusMinutes(20));
        AiMatchMeetupSlot taken = new AiMatchMeetupSlot(DAY.atTime(14, 30), 8L, null);
        when(slotRepository.findAllBySlotAtGreaterThanEqualAndSlotAtLessThanOrderBySlotAtAsc(any(), any())).thenReturn(List.of(held, taken));

        List<AiMatchMeetupSlotDto> slots = service.getSlots(DAY.toString(), 7L).slots();

        AiMatchMeetupSlotDto first = slots.stream().filter(slot -> slot.startAt().equals(DAY.atTime(14, 15))).findFirst().orElseThrow();
        AiMatchMeetupSlotDto second = slots.stream().filter(slot -> slot.startAt().equals(DAY.atTime(14, 30))).findFirst().orElseThrow();
        assertEquals("HELD", first.status());
        assertTrue(first.mine());
        assertEquals("TAKEN", second.status());
        assertFalse(second.mine());
    }

    @Test
    void 이미_잡힌_시간이면_409() {
        when(slotRepository.findBySlotAt(DAY.atTime(14, 15))).thenReturn(Optional.of(new AiMatchMeetupSlot(DAY.atTime(14, 15), 9L, null)));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class, () -> service.hold(7L, DAY.atTime(14, 15)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(slotRepository, never()).saveAndFlush(any());
    }

    @Test
    void 확인과_저장_사이에_끼어들면_유니크_제약이_막고_409() {
        when(slotRepository.findBySlotAt(any())).thenReturn(Optional.empty());
        when(slotRepository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("uk_ai_match_meetup_slot_at"));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class, () -> service.hold(7L, DAY.atTime(14, 15)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    @Test
    void 잡기_전에_만료된_잠금과_내_옛_슬롯을_치운다() {
        when(slotRepository.findBySlotAt(any())).thenReturn(Optional.empty());
        when(slotRepository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AiMatchMeetupSlot slot = service.hold(7L, DAY.atTime(10, 0));

        verify(slotRepository).deleteExpiredHolds(any());
        verify(slotRepository).deleteOrphans();
        verify(slotRepository).deleteByRequestIdNow(7L);
        assertFalse(slot.isConfirmed());
        assertTrue(slot.getHeldUntil().isAfter(LocalDateTime.now().plusMinutes(29)));
    }

    @Test
    void 슬롯이_아닌_시간은_400() {
        assertBadRequest(DAY.atTime(14, 10));          // 15분 단위 아님
        assertBadRequest(DAY.atTime(8, 45));           // 열기 전
        assertBadRequest(DAY.atTime(22, 0));           // 닫은 뒤
        assertBadRequest(DAY.plusDays(5).atTime(10, 0)); // 축제 날짜 아님
        assertBadRequest(null);
    }

    @Test
    void 잠금이_이미_풀렸으면_확정할_슬롯이_없다() {
        when(slotRepository.findByRequestId(7L)).thenReturn(Optional.empty());

        assertTrue(service.confirm(7L).isEmpty());
    }

    @Test
    void 확정하면_잠금_시각이_사라진다() {
        AiMatchMeetupSlot held = new AiMatchMeetupSlot(DAY.atTime(14, 15), 7L, LocalDateTime.now().plusMinutes(10));
        when(slotRepository.findByRequestId(7L)).thenReturn(Optional.of(held));

        assertTrue(service.confirm(7L).orElseThrow().isConfirmed());
    }

    private void assertBadRequest(LocalDateTime slotAt) {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class, () -> service.hold(7L, slotAt));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }
}
