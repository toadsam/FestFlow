package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

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

    protected Booth() {
    }

    public Booth(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl) {
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
        this.description = description;
        this.displayOrder = displayOrder;
        this.imageUrl = imageUrl;
    }

    public void update(String name, double latitude, double longitude, String description, Integer displayOrder, String imageUrl) {
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
        this.description = description;
        this.displayOrder = displayOrder;
        this.imageUrl = imageUrl;
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
}
