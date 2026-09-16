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
@Table(name = "booth_reservation_tables")
public class BoothReservationTable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "booth_id", nullable = false)
    private Booth booth;

    @Column(nullable = false)
    private String tableName;

    @Column(nullable = false)
    private Integer totalSeats;

    @Column(nullable = false)
    private Integer availableSeats;

    @Column(nullable = false)
    private Integer displayOrder;

    /** 예약 없이 걸어 들어온 손님이 앉아 있는 상태. 입구 스태프가 자리 현황 화면에서 누른다. */
    @Column(nullable = false)
    private boolean walkInOccupied = false;

    private java.time.LocalDateTime walkInSince;

    protected BoothReservationTable() {
    }

    public BoothReservationTable(Booth booth, String tableName, Integer totalSeats, Integer availableSeats, Integer displayOrder) {
        this.booth = booth;
        this.tableName = tableName;
        this.totalSeats = totalSeats;
        this.availableSeats = availableSeats;
        this.displayOrder = displayOrder;
    }

    public void update(String tableName, Integer totalSeats, Integer availableSeats, Integer displayOrder) {
        this.tableName = tableName;
        this.totalSeats = totalSeats;
        this.availableSeats = availableSeats;
        this.displayOrder = displayOrder;
    }

    public Long getId() {
        return id;
    }

    public Booth getBooth() {
        return booth;
    }

    public String getTableName() {
        return tableName;
    }

    public Integer getTotalSeats() {
        return totalSeats;
    }

    public Integer getAvailableSeats() {
        return availableSeats;
    }

    public void setAvailableSeats(Integer availableSeats) {
        this.availableSeats = availableSeats;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public boolean isWalkInOccupied() {
        return walkInOccupied;
    }

    public java.time.LocalDateTime getWalkInSince() {
        return walkInSince;
    }

    public void occupyWalkIn(java.time.LocalDateTime now) {
        this.walkInOccupied = true;
        this.walkInSince = now;
    }

    public void clearWalkIn() {
        this.walkInOccupied = false;
        this.walkInSince = null;
    }
}

