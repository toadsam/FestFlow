package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "ai_match_profiles")
public class AiMatchProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String nickname;

    @Column(nullable = false, length = 20)
    private String gender;

    @Column(nullable = false, length = 500)
    private String intro;

    @Column(length = 255)
    private String pinHash;

    @Column(length = 30)
    private String phoneNumber;

    @Column(nullable = false, length = 120)
    private String meetPlace;

    @Column(nullable = false, length = 1000)
    private String originalImageUrl;

    @Column(nullable = false, length = 1000)
    private String generatedImageUrl;

    @Column(nullable = false)
    private boolean consent;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected AiMatchProfile() {
    }

    public AiMatchProfile(
            String nickname,
            String gender,
            String intro,
            String pinHash,
            String phoneNumber,
            String meetPlace,
            String originalImageUrl,
            String generatedImageUrl,
            boolean consent
    ) {
        this.nickname = nickname;
        this.gender = gender;
        this.intro = intro;
        this.pinHash = pinHash;
        this.phoneNumber = phoneNumber;
        this.meetPlace = meetPlace;
        this.originalImageUrl = originalImageUrl;
        this.generatedImageUrl = generatedImageUrl;
        this.consent = consent;
        this.status = "ACTIVE";
    }

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getNickname() {
        return nickname;
    }

    public String getGender() {
        return gender;
    }

    public String getIntro() {
        return intro;
    }

    public String getPinHash() {
        return pinHash;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public String getMeetPlace() {
        return meetPlace;
    }

    public String getOriginalImageUrl() {
        return originalImageUrl;
    }

    public String getGeneratedImageUrl() {
        return generatedImageUrl;
    }

    public boolean isConsent() {
        return consent;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void updateProfile(
            String nickname,
            String gender,
            String intro,
            String meetPlace,
            String phoneNumber,
            String originalImageUrl,
            String generatedImageUrl
    ) {
        this.nickname = nickname;
        this.gender = gender;
        this.intro = intro;
        this.meetPlace = meetPlace;
        if (phoneNumber != null) {
            this.phoneNumber = phoneNumber;
        }
        if (originalImageUrl != null) {
            this.originalImageUrl = originalImageUrl;
        }
        if (generatedImageUrl != null) {
            this.generatedImageUrl = generatedImageUrl;
        }
    }

    public void deactivate() {
        this.status = "DELETED";
        this.pinHash = null;
    }
}
