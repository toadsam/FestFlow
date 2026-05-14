package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "ai_match_requests")
public class AiMatchRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private AiMatchProfile profile;

    @Column(nullable = false, length = 40)
    private String requesterNickname;

    @Column(nullable = false, length = 120)
    private String meetPlace;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected AiMatchRequest() {
    }

    public AiMatchRequest(
            AiMatchProfile profile,
            String requesterNickname,
            String meetPlace,
            String message
    ) {
        this.profile = profile;
        this.requesterNickname = requesterNickname;
        this.meetPlace = meetPlace;
        this.message = message;
    }

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public AiMatchProfile getProfile() {
        return profile;
    }

    public String getRequesterNickname() {
        return requesterNickname;
    }

    public String getMeetPlace() {
        return meetPlace;
    }

    public String getMessage() {
        return message;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
