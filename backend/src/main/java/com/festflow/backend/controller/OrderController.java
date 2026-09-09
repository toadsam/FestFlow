package com.festflow.backend.controller;

import com.festflow.backend.dto.BoothOrderDto;
import com.festflow.backend.dto.OrderCreateRequestDto;
import com.festflow.backend.dto.OrderMenuDto;
import com.festflow.backend.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 손님 쪽 주문 API. 인증 없음 — 테이블 QR 을 찍은 사람이면 누구나 주문할 수 있고,
 * 자기 주문은 발급받은 clientKey 로만 다시 볼 수 있다.
 */
@RestController
@RequestMapping("/api")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/booths/{boothId}/order-menu")
    public OrderMenuDto getOrderMenu(
            @PathVariable Long boothId,
            @RequestParam(value = "table", required = false) String table
    ) {
        return orderService.getOrderMenu(boothId, table);
    }

    @PostMapping("/booths/{boothId}/orders")
    public BoothOrderDto createOrder(
            @PathVariable Long boothId,
            @Valid @RequestBody OrderCreateRequestDto requestDto
    ) {
        return orderService.createOrder(boothId, requestDto);
    }

    @GetMapping("/orders/{orderId}")
    public BoothOrderDto getOrder(
            @PathVariable Long orderId,
            @RequestParam("key") String key
    ) {
        return orderService.getOrderForCustomer(orderId, key);
    }
}
