package com.festflow.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.BoothOrderConfigRequestDto;
import com.festflow.backend.dto.BoothOrderDto;
import com.festflow.backend.dto.BoothOrderItemDto;
import com.festflow.backend.dto.OpsBoothOrdersDto;
import com.festflow.backend.dto.OrderCreateItemDto;
import com.festflow.backend.dto.OrderCreateRequestDto;
import com.festflow.backend.dto.OrderMenuDto;
import com.festflow.backend.dto.OrderMenuItemDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.BoothOrder;
import com.festflow.backend.entity.OrderStatus;
import com.festflow.backend.entity.PaymentMethod;
import com.festflow.backend.repository.BoothOrderRepository;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 테이블 QR 주문.
 *
 * 흐름: 손님이 /order/{booth}/{table} 에서 메뉴를 담아 주문 → PENDING_PAYMENT 로 저장, clientKey 발급
 *      → 스태프가 입금을 확인하고 PAID → PREPARING → READY → COMPLETED 로 올린다.
 * 가격은 절대 클라이언트 값을 믿지 않고 부스 메뉴판(menuBoardJson)에서 다시 읽는다.
 */
@Service
public class OrderService {

    private static final int MAX_ITEMS_PER_ORDER = 20;
    private static final int MAX_ACTIVE_ORDERS_PER_TABLE = 5;
    private static final String KEY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

    private final BoothRepository boothRepository;
    private final BoothOrderRepository boothOrderRepository;
    private final StreamService streamService;
    private final ObjectMapper objectMapper;
    private final SecureRandom random = new SecureRandom();

    public OrderService(
            BoothRepository boothRepository,
            BoothOrderRepository boothOrderRepository,
            StreamService streamService,
            ObjectMapper objectMapper
    ) {
        this.boothRepository = boothRepository;
        this.boothOrderRepository = boothOrderRepository;
        this.streamService = streamService;
        this.objectMapper = objectMapper;
    }

    // ---------- 손님 ----------

    @Transactional(readOnly = true)
    public OrderMenuDto getOrderMenu(Long boothId, String tableLabel) {
        Booth booth = findBooth(boothId);
        return new OrderMenuDto(
                booth.getId(),
                booth.getName(),
                booth.getCategory(),
                booth.getImageUrl(),
                booth.getBoothIntro(),
                booth.getOpenTime() == null ? null : booth.getOpenTime().toString(),
                booth.getCloseTime() == null ? null : booth.getCloseTime().toString(),
                normalizeTableLabel(tableLabel),
                booth.isOrderEnabled(),
                booth.getBankAccount(),
                booth.getBankHolder(),
                parseMenuBoard(booth.getMenuBoardJson())
        );
    }

    @Transactional
    public BoothOrderDto createOrder(Long boothId, OrderCreateRequestDto requestDto) {
        Booth booth = findBooth(boothId);
        if (!booth.isOrderEnabled()) {
            throw new ResponseStatusException(CONFLICT, "이 부스는 지금 주문을 받지 않습니다.");
        }

        PaymentMethod method = requestDto.paymentMethod() == null ? PaymentMethod.BANK_TRANSFER : requestDto.paymentMethod();
        if (method != PaymentMethod.BANK_TRANSFER) {
            throw new ResponseStatusException(BAD_REQUEST, "지금은 계좌이체만 가능합니다.");
        }

        String tableLabel = normalizeTableLabel(requestDto.tableLabel());
        if (tableLabel.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "테이블 번호가 없습니다.");
        }

        List<OrderMenuItemDto> menu = parseMenuBoard(booth.getMenuBoardJson());
        Map<String, OrderMenuItemDto> byName = new HashMap<>();
        for (OrderMenuItemDto item : menu) {
            byName.put(item.name(), item);
        }

        // 같은 메뉴가 여러 줄로 오면 합친다.
        Map<String, Integer> quantities = new HashMap<>();
        List<String> orderOfAppearance = new ArrayList<>();
        for (OrderCreateItemDto line : requestDto.items()) {
            String name = line.name() == null ? "" : line.name().trim();
            if (name.isEmpty()) continue;
            if (!quantities.containsKey(name)) orderOfAppearance.add(name);
            quantities.merge(name, Math.max(1, line.quantity() == null ? 1 : line.quantity()), Integer::sum);
        }
        if (orderOfAppearance.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "담긴 메뉴가 없습니다.");
        }
        int totalQuantity = quantities.values().stream().mapToInt(Integer::intValue).sum();
        if (totalQuantity > MAX_ITEMS_PER_ORDER) {
            throw new ResponseStatusException(BAD_REQUEST, "한 번에 " + MAX_ITEMS_PER_ORDER + "개까지 주문할 수 있습니다.");
        }

        long activeOnTable = boothOrderRepository
                .findByBoothIdAndStatusInOrderByCreatedAtAsc(boothId, activeStatuses())
                .stream()
                .filter(order -> tableLabel.equals(order.getTableLabel()))
                .count();
        if (activeOnTable >= MAX_ACTIVE_ORDERS_PER_TABLE) {
            throw new ResponseStatusException(CONFLICT, "이 테이블에 처리 중인 주문이 너무 많습니다. 스태프에게 말씀해 주세요.");
        }

        LocalDateTime now = LocalDateTime.now();
        BoothOrder order = new BoothOrder(
                booth,
                tableLabel,
                randomKey(24),
                requestDto.depositorName().trim(),
                normalizeBlank(requestDto.phoneNumber()),
                normalizeBlank(requestDto.request()),
                method,
                now
        );

        for (String name : orderOfAppearance) {
            OrderMenuItemDto menuItem = byName.get(name);
            if (menuItem == null) {
                throw new ResponseStatusException(BAD_REQUEST, "메뉴판에 없는 메뉴입니다: " + name);
            }
            if (Boolean.TRUE.equals(menuItem.soldOut())) {
                throw new ResponseStatusException(CONFLICT, "품절된 메뉴입니다: " + name);
            }
            order.addItem(name, menuItem.price() == null ? 0 : menuItem.price(), quantities.get(name));
        }

        BoothOrder saved = boothOrderRepository.save(order);
        saved.assignOrderNo(buildOrderNo(booth.getId(), now, saved.getId()));

        BoothOrderDto dto = toDto(saved);
        streamService.publishOrders(dto.withoutClientKey());
        return dto;
    }

    @Transactional(readOnly = true)
    public BoothOrderDto getOrderForCustomer(Long orderId, String clientKey) {
        BoothOrder order = boothOrderRepository.findWithItemsById(orderId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "주문을 찾을 수 없습니다."));
        if (clientKey == null || !Objects.equals(order.getClientKey(), clientKey.trim())) {
            throw new ResponseStatusException(FORBIDDEN, "주문 조회 키가 맞지 않습니다.");
        }
        return toDto(order);
    }

    // ---------- 운영 콘솔 ----------

    @Transactional(readOnly = true)
    public OpsBoothOrdersDto getOpsBoothOrders(Long boothId) {
        Booth booth = findBooth(boothId);
        LocalDateTime since = LocalDate.now().atStartOfDay().minusHours(6);
        List<BoothOrderDto> orders = boothOrderRepository
                .findByBoothIdAndCreatedAtAfterOrderByCreatedAtDesc(boothId, since)
                .stream()
                .map(this::toDto)
                .map(BoothOrderDto::withoutClientKey)
                .toList();
        return new OpsBoothOrdersDto(booth.isOrderEnabled(), booth.getBankAccount(), booth.getBankHolder(), orders);
    }

    @Transactional
    public OpsBoothOrdersDto updateOrderConfig(Long boothId, BoothOrderConfigRequestDto requestDto) {
        Booth booth = findBooth(boothId);
        booth.updateOrderConfig(requestDto.orderEnabled(), requestDto.bankAccount(), requestDto.bankHolder());
        boothRepository.save(booth);
        return getOpsBoothOrders(boothId);
    }

    @Transactional
    public BoothOrderDto updateStatus(Long boothId, Long orderId, OrderStatus next) {
        BoothOrder order = boothOrderRepository.findByIdAndBoothId(orderId, boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "주문을 찾을 수 없습니다."));
        OrderStatus current = order.getStatus();

        if (current.isTerminal()) {
            throw new ResponseStatusException(CONFLICT, "이미 끝난 주문입니다.");
        }
        if (next != OrderStatus.CANCELED && next.ordinal() <= current.ordinal()) {
            throw new ResponseStatusException(CONFLICT, "주문 상태는 뒤로 돌릴 수 없습니다.");
        }

        order.transitionTo(next, LocalDateTime.now());
        BoothOrder saved = boothOrderRepository.save(order);
        BoothOrderDto dto = toDto(saved).withoutClientKey();
        streamService.publishOrders(dto);
        return dto;
    }

    // ---------- 내부 ----------

    private Booth findBooth(Long boothId) {
        return boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "부스를 찾을 수 없습니다."));
    }

    private List<OrderStatus> activeStatuses() {
        return List.of(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY);
    }

    /**
     * menuBoardJson: [{"name","price","description","soldOut"}] — price 는 "12,000원" 같은 문자열이라 숫자만 뽑는다.
     */
    List<OrderMenuItemDto> parseMenuBoard(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        List<Map<String, Object>> rows;
        try {
            rows = objectMapper.readValue(raw, new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception e) {
            return List.of();
        }
        List<OrderMenuItemDto> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) continue;
            String name = stringOf(row.get("name")).trim();
            if (name.isEmpty()) continue;
            String priceLabel = stringOf(row.get("price")).trim();
            Object soldOutRaw = row.get("soldOut");
            boolean soldOut = soldOutRaw instanceof Boolean b ? b : "true".equalsIgnoreCase(stringOf(soldOutRaw));
            items.add(new OrderMenuItemDto(
                    name,
                    stringOf(row.get("description")).trim(),
                    priceLabel,
                    parsePrice(priceLabel),
                    soldOut
            ));
        }
        return items;
    }

    static Integer parsePrice(String label) {
        if (label == null) return 0;
        String digits = label.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return 0;
        // "1.5만" 같은 표기는 지원하지 않는다. 운영 콘솔에는 숫자 그대로 적으라고 안내한다.
        try {
            long value = Long.parseLong(digits);
            return (int) Math.min(value, Integer.MAX_VALUE);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String normalizeBlank(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeTableLabel(String label) {
        if (label == null) return "";
        String trimmed = label.trim();
        return trimmed.length() > 40 ? trimmed.substring(0, 40) : trimmed;
    }

    private String buildOrderNo(Long boothId, LocalDateTime now, Long id) {
        // 하루 안에서 부스별 순번. 스태프가 부르기 쉽게 4자리.
        long seq = boothOrderRepository.countByBoothIdAndCreatedAtBetween(
                boothId, now.toLocalDate().atStartOfDay(), now.toLocalDate().plusDays(1).atStartOfDay());
        long number = seq <= 0 ? (id % 10000) : seq;
        return String.format(Locale.ROOT, "%04d", number % 10000);
    }

    private String randomKey(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(KEY_ALPHABET.charAt(random.nextInt(KEY_ALPHABET.length())));
        }
        return sb.toString();
    }

    private BoothOrderDto toDto(BoothOrder order) {
        List<BoothOrderItemDto> items = order.getItems().stream()
                .map(item -> new BoothOrderItemDto(item.getName(), item.getUnitPrice(), item.getQuantity(), item.lineTotal()))
                .toList();
        return new BoothOrderDto(
                order.getId(),
                order.getOrderNo(),
                order.getBooth().getId(),
                order.getBooth().getName(),
                order.getTableLabel(),
                order.getDepositorName(),
                order.getPhoneNumber(),
                order.getRequest(),
                order.getPaymentMethod(),
                order.getStatus(),
                order.getTotalAmount(),
                order.getCreatedAt(),
                order.getPaidAt(),
                order.getReadyAt(),
                order.getCompletedAt(),
                order.getCanceledAt(),
                items,
                order.getClientKey()
        );
    }
}
