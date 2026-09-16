package com.festflow.backend.dto;

import java.util.List;

/**
 * 테이블 QR 을 찍은 손님에게 내려주는 주문용 부스 정보.
 * 메뉴판(menuBoardJson)을 숫자 가격으로 정규화한 것과 입금 계좌를 함께 준다.
 */
public record OrderMenuDto(
        Long boothId,
        String boothName,
        String boothCategory,
        String boothImageUrl,
        String boothIntro,
        String openTime,
        String closeTime,
        String tableLabel,
        Boolean orderEnabled,
        String bankAccount,
        String bankHolder,
        List<OrderMenuItemDto> items
) {
}
