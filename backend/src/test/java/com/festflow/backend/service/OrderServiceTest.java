package com.festflow.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.BoothOrderDto;
import com.festflow.backend.dto.OrderCreateItemDto;
import com.festflow.backend.dto.OrderCreateRequestDto;
import com.festflow.backend.dto.OrderMenuItemDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.BoothOrder;
import com.festflow.backend.entity.OrderStatus;
import com.festflow.backend.entity.PaymentMethod;
import com.festflow.backend.repository.BoothOrderRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.service.stream.StreamService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;

class OrderServiceTest {

    private static final String MENU = """
            [{"name":"대표 안주 세트","price":"12,000원","description":"2-3인","soldOut":false},
             {"name":"논알콜 음료","price":"3000원","description":"","soldOut":false},
             {"name":"감자튀김","price":"5000","description":"","soldOut":true}]
            """;

    private BoothRepository boothRepository;
    private BoothOrderRepository boothOrderRepository;
    private StreamService streamService;
    private OrderService orderService;
    private Booth booth;

    @BeforeEach
    void setUp() throws Exception {
        boothRepository = Mockito.mock(BoothRepository.class);
        boothOrderRepository = Mockito.mock(BoothOrderRepository.class);
        streamService = Mockito.mock(StreamService.class);
        orderService = new OrderService(boothRepository, boothOrderRepository, streamService, new ObjectMapper());

        booth = new Booth("소프트웨어학과 주점", 37.28, 127.04, "설명", 1, "/img.jpg", 5, 10, null, null);
        setId(booth, 7L);
        booth.setMenuBoardJson(MENU);
        booth.updateOrderConfig(true, "국민 000-00-0000", "홍길동");

        Mockito.when(boothRepository.findById(7L)).thenReturn(Optional.of(booth));
        Mockito.when(boothOrderRepository.save(any(BoothOrder.class))).thenAnswer(invocation -> {
            BoothOrder saved = invocation.getArgument(0);
            if (saved.getId() == null) setId(saved, 42L);
            return saved;
        });
        Mockito.when(boothOrderRepository.findByBoothIdAndStatusInOrderByCreatedAtAsc(eq(7L), any())).thenReturn(List.of());
        Mockito.when(boothOrderRepository.countByBoothIdAndCreatedAtBetween(eq(7L), any(), any())).thenReturn(3L);
    }

    @Test
    void parsesPricesFromMenuBoardStrings() {
        assertThat(OrderService.parsePrice("12,000원")).isEqualTo(12000);
        assertThat(OrderService.parsePrice("3000원")).isEqualTo(3000);
        assertThat(OrderService.parsePrice("5000")).isEqualTo(5000);
        assertThat(OrderService.parsePrice("")).isZero();
        assertThat(OrderService.parsePrice(null)).isZero();

        List<OrderMenuItemDto> items = orderService.parseMenuBoard(MENU);
        assertThat(items).hasSize(3);
        assertThat(items.get(0).price()).isEqualTo(12000);
        assertThat(items.get(2).soldOut()).isTrue();
    }

    @Test
    void createsOrderWithServerSidePricesAndMergesDuplicateLines() {
        OrderCreateRequestDto request = new OrderCreateRequestDto(
                "7",
                List.of(
                        new OrderCreateItemDto("대표 안주 세트", 1),
                        new OrderCreateItemDto("논알콜 음료", 2),
                        new OrderCreateItemDto("논알콜 음료", 1)
                ),
                "재훈",
                "010-0000-0000",
                "덜 맵게",
                PaymentMethod.BANK_TRANSFER
        );

        BoothOrderDto created = orderService.createOrder(7L, request);

        assertThat(created.status()).isEqualTo(OrderStatus.PENDING_PAYMENT);
        assertThat(created.totalAmount()).isEqualTo(12000 + 3000 * 3);
        assertThat(created.items()).hasSize(2);
        assertThat(created.items().get(1).quantity()).isEqualTo(3);
        assertThat(created.orderNo()).isEqualTo("0003");
        assertThat(created.clientKey()).hasSize(24);
        assertThat(created.tableLabel()).isEqualTo("7");
        Mockito.verify(streamService).publishOrders(any());
    }

    @Test
    void rejectsSoldOutUnknownAndNonBankPayments() {
        assertThatThrownBy(() -> orderService.createOrder(7L, new OrderCreateRequestDto(
                "7", List.of(new OrderCreateItemDto("감자튀김", 1)), "재훈", null, null, PaymentMethod.BANK_TRANSFER)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("품절");

        assertThatThrownBy(() -> orderService.createOrder(7L, new OrderCreateRequestDto(
                "7", List.of(new OrderCreateItemDto("없는 메뉴", 1)), "재훈", null, null, PaymentMethod.BANK_TRANSFER)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("메뉴판에 없는");

        assertThatThrownBy(() -> orderService.createOrder(7L, new OrderCreateRequestDto(
                "7", List.of(new OrderCreateItemDto("논알콜 음료", 1)), "재훈", null, null, PaymentMethod.CARD)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("계좌이체");
    }

    @Test
    void statusMovesForwardOnlyAndCustomerKeyIsChecked() throws Exception {
        BoothOrder order = new BoothOrder(booth, "7", "secretkey", "재훈", null, null, PaymentMethod.BANK_TRANSFER, LocalDateTime.now());
        order.addItem("논알콜 음료", 3000, 1);
        setId(order, 42L);
        Mockito.when(boothOrderRepository.findByIdAndBoothId(42L, 7L)).thenReturn(Optional.of(order));
        Mockito.when(boothOrderRepository.findWithItemsById(42L)).thenReturn(Optional.of(order));

        assertThat(orderService.updateStatus(7L, 42L, OrderStatus.PAID).status()).isEqualTo(OrderStatus.PAID);
        assertThat(orderService.updateStatus(7L, 42L, OrderStatus.READY).status()).isEqualTo(OrderStatus.READY);
        assertThatThrownBy(() -> orderService.updateStatus(7L, 42L, OrderStatus.PAID))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(orderService.updateStatus(7L, 42L, OrderStatus.CANCELED).status()).isEqualTo(OrderStatus.CANCELED);
        assertThatThrownBy(() -> orderService.updateStatus(7L, 42L, OrderStatus.COMPLETED))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(orderService.getOrderForCustomer(42L, "secretkey").id()).isEqualTo(42L);
        assertThatThrownBy(() -> orderService.getOrderForCustomer(42L, "wrong"))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static void setId(Object entity, Long id) throws Exception {
        Field field = entity.getClass().getDeclaredField("id");
        field.setAccessible(true);
        field.set(entity, id);
    }
}
