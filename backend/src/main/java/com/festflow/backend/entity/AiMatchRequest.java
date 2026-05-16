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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_profile_id", nullable = false)
    private AiMatchProfile requesterProfile;

    @Column(nullable = false, length = 40)
    private String requesterNickname;

    @Column(nullable = false, length = 120)
    private String meetPlace;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(length = 20, nullable = false)
    private String status;

    @Column
    private LocalDateTime updatedAt;

    protected AiMatchRequest() {
    }

    public AiMatchRequest(
            AiMatchProfile profile,
            AiMatchProfile requesterProfile,
            String requesterNickname,
            String meetPlace,
            String message
    ) {
        this.profile = profile;
        this.requesterProfile = requesterProfile;
        this.requesterNickname = requesterNickname;
        this.meetPlace = meetPlace;
        this.message = message;
    }

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.status = "PENDING";
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

    public AiMatchProfile getRequesterProfile() {
        return requesterProfile;
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

    public String getStatus() {
        return status;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void accept() {
        this.status = "ACCEPTED";
        this.updatedAt = LocalDateTime.now();
    }

    public void reject() {
        this.status = "REJECTED";
        this.updatedAt = LocalDateTime.now();
    }

    public void cancel() {
        this.status = "CANCELED";
        this.updatedAt = LocalDateTime.now();
    }
}
