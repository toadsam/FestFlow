package com.festflow.backend.repository;

import com.festflow.backend.entity.BoothOrder;
import com.festflow.backend.entity.OrderStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface BoothOrderRepository extends JpaRepository<BoothOrder, Long> {

    @EntityGraph(attributePaths = "items")
    List<BoothOrder> findByBoothIdAndCreatedAtAfterOrderByCreatedAtDesc(Long boothId, LocalDateTime after);

    @EntityGraph(attributePaths = "items")
    List<BoothOrder> findByBoothIdAndStatusInOrderByCreatedAtAsc(Long boothId, List<OrderStatus> statuses);

    /** 한 테이블의 처리 중 주문만 읽는다. (부스 전체를 읽으면 주문이 쌓일수록 주문 한 건이 느려진다) */
    @EntityGraph(attributePaths = "items")
    List<BoothOrder> findByBoothIdAndTableLabelAndStatusInOrderByCreatedAtAsc(Long boothId, String tableLabel, List<OrderStatus> statuses);

    @EntityGraph(attributePaths = "items")
    Optional<BoothOrder> findWithItemsById(Long id);

    Optional<BoothOrder> findByIdAndBoothId(Long id, Long boothId);

    List<BoothOrder> findByBoothId(Long boothId);

    long countByBoothIdAndCreatedAtBetween(Long boothId, LocalDateTime from, LocalDateTime to);
}
