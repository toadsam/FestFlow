package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "booth_order_items")
public class BoothOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private BoothOrder order;

    @Column(nullable = false)
    private Integer lineNo;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false)
    private Integer unitPrice;

    @Column(nullable = false)
    private Integer quantity;

    protected BoothOrderItem() {
    }

    public BoothOrderItem(BoothOrder order, Integer lineNo, String name, Integer unitPrice, Integer quantity) {
        this.order = order;
        this.lineNo = lineNo;
        this.name = name;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
    }

    public int lineTotal() {
        return unitPrice * quantity;
    }

    public Long getId() {
        return id;
    }

    public BoothOrder getOrder() {
        return order;
    }

    public Integer getLineNo() {
        return lineNo;
    }

    public String getName() {
        return name;
    }

    public Integer getUnitPrice() {
        return unitPrice;
    }

    public Integer getQuantity() {
        return quantity;
    }
}
