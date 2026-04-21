package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "booths")
public class Booth {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private double latitude;

    @Column(nullable = false)
    private double longitude;

    @Column(nullable = false, length = 1000)
    private String description;

    @Column(nullable = false)
    private Integer displayOrder;

    @Column(nullable = false)
    private String imageUrl;

    private Integer estimatedWaitMinutes;

    private Integer remainingStock;

    @Column(length = 1000)
    private String liveStatusMessage;

    private LocalDateTime liveStatusUpdatedAt;

    @Column
    private Integer maxReservationMinutes;

    @Column(length = 2000)
    private String boothIntro;

    @Column(length = 1000)
    private String menuImageUrl;

    @Column(length = 4000)
    private String menuBoardJson;

    protected Booth() {
    }

    public Booth(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl,
                 Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage, LocalDateTime liveStatusUpdatedAt) {
        this(name, latitude, longitude, description, displayOrder, imageUrl, estimatedWaitMinutes, remainingStock, liveStatusMessage, liveStatusUpdatedAt, 10);
    }

    public Booth(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl,
                 Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage, LocalDateTime liveStatusUpdatedAt,
                 Integer maxReservationMinutes) {
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
        this.description = description;
        this.displayOrder = displayOrder;
        this.imageUrl = imageUrl;
        this.estimatedWaitMinutes = estimatedWaitMinutes;
        this.remainingStock = remainingStock;
        this.liveStatusMessage = liveStatusMessage;
        this.liveStatusUpdatedAt = liveStatusUpdatedAt;
        this.maxReservationMinutes = maxReservationMinutes == null || maxReservationMinutes < 1 ? 10 : maxReservationMinutes;
    }

    public void update(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl,
                       Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage, LocalDateTime liveStatusUpdatedAt) {
        update(name, latitude, longitude, description, displayOrder, imageUrl, estimatedWaitMinutes, remainingStock, liveStatusMessage, liveStatusUpdatedAt, this.maxReservationMinutes);
    }

    public void update(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl,
                       Integer estimatedWaitMinutes, Integer remainingStock, String liveStatusMessage, LocalDateTime liveStatusUpdatedAt,
                       Integer maxReservationMinutes) {
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
        this.description = description;
        this.displayOrder = displayOrder;
        this.imageUrl = imageUrl;
        this.estimatedWaitMinutes = estimatedWaitMinutes;
        this.remainingStock = remainingStock;
        this.liveStatusMessage = liveStatusMessage;
        this.liveStatusUpdatedAt = liveStatusUpdatedAt;
        if (maxReservationMinutes != null && maxReservationMinutes > 0) {
            this.maxReservationMinutes = maxReservationMinutes;
        }
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public void setDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public double getLatitude() {
        return latitude;
    }

    public double getLongitude() {
        return longitude;
    }

    public String getDescription() {
        return description;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public Integer getEstimatedWaitMinutes() {
        return estimatedWaitMinutes;
    }

    public void setEstimatedWaitMinutes(Integer estimatedWaitMinutes) {
        this.estimatedWaitMinutes = estimatedWaitMinutes;
    }

    public Integer getRemainingStock() {
        return remainingStock;
    }

    public void setRemainingStock(Integer remainingStock) {
        this.remainingStock = remainingStock;
    }

    public String getLiveStatusMessage() {
        return liveStatusMessage;
    }

    public void setLiveStatusMessage(String liveStatusMessage) {
        this.liveStatusMessage = liveStatusMessage;
    }

    public LocalDateTime getLiveStatusUpdatedAt() {
        return liveStatusUpdatedAt;
    }

    public void setLiveStatusUpdatedAt(LocalDateTime liveStatusUpdatedAt) {
        this.liveStatusUpdatedAt = liveStatusUpdatedAt;
    }

    public Integer getMaxReservationMinutes() {
        return maxReservationMinutes;
    }

    public void setMaxReservationMinutes(Integer maxReservationMinutes) {
        if (maxReservationMinutes == null || maxReservationMinutes < 1) {
            this.maxReservationMinutes = 10;
            return;
        }
        this.maxReservationMinutes = maxReservationMinutes;
    }

    public String getBoothIntro() {
        return boothIntro;
    }

    public void setBoothIntro(String boothIntro) {
        this.boothIntro = boothIntro;
    }

    public String getMenuImageUrl() {
        return menuImageUrl;
    }

    public void setMenuImageUrl(String menuImageUrl) {
        this.menuImageUrl = menuImageUrl;
    }

    public String getMenuBoardJson() {
        return menuBoardJson;
    }

    public void setMenuBoardJson(String menuBoardJson) {
        this.menuBoardJson = menuBoardJson;
    }
}
