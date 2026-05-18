package com.festflow.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.ConstraintMode;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.NotFound;
import org.hibernate.annotations.NotFoundAction;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_profile_id", foreignKey = @ForeignKey(ConstraintMode.NO_CONSTRAINT))
    @NotFound(action = NotFoundAction.IGNORE)
    private AiMatchProfile requesterProfile;

    @Column(nullable = false, length = 40)
    private String requesterNickname;

    @Column(nullable = false, length = 120)
    private String meetPlace;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(length = 20)
    private String status;

    @Column(length = 40)
    private String statusReason;

    @Column(length = 30)
    private String connectionStatus;

    @Column(length = 1000)
    private String adminNote;

    @Column
    private LocalDateTime updatedAt;

    @Column(length = 120)
    private String meetupPlace;

    @Column
    private LocalDateTime meetupAt;

    @Column
    private Long meetupProposerProfileId;

    @Column(length = 40)
    private String meetupProposerNickname;

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
        return status == null ? "PENDING" : status;
    }

    public String getStatusReason() {
        return statusReason == null ? "" : statusReason;
    }

    public String getConnectionStatus() {
        if (!isMatchedStatus()) {
            return "";
        }
        return connectionStatus == null ? "WAITING" : connectionStatus;
    }

    public String getAdminNote() {
        return adminNote == null ? "" : adminNote;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public String getMeetupPlace() {
        return meetupPlace;
    }

    public LocalDateTime getMeetupAt() {
        return meetupAt;
    }

    public Long getMeetupProposerProfileId() {
        return meetupProposerProfileId;
    }

    public String getMeetupProposerNickname() {
        return meetupProposerNickname;
    }

    public void accept() {
        this.status = "ACCEPTED";
        this.statusReason = null;
        if (this.connectionStatus == null) {
            this.connectionStatus = "WAITING";
        }
        this.updatedAt = LocalDateTime.now();
    }

    public void reject() {
        this.status = "REJECTED";
        this.statusReason = null;
        this.updatedAt = LocalDateTime.now();
    }

    public void cancel() {
        this.status = "CANCELED";
        this.statusReason = "USER_CANCELED";
        this.updatedAt = LocalDateTime.now();
    }

    public void cancelForProfileDeleted() {
        this.status = "CANCELED";
        this.statusReason = "PROFILE_DELETED";
        this.updatedAt = LocalDateTime.now();
    }

    public void proposeMeetup(String meetupPlace, LocalDateTime meetupAt, Long proposerProfileId, String proposerNickname) {
        this.status = "PROPOSED";
        this.statusReason = null;
        if (this.connectionStatus == null) {
            this.connectionStatus = "WAITING";
        }
        this.meetupPlace = meetupPlace;
        this.meetupAt = meetupAt;
        this.meetupProposerProfileId = proposerProfileId;
        this.meetupProposerNickname = proposerNickname;
        this.updatedAt = LocalDateTime.now();
    }

    public void confirmMeetup() {
        this.status = "CONFIRMED";
        this.statusReason = null;
        if (this.connectionStatus == null) {
            this.connectionStatus = "COMPLETED";
        }
        this.updatedAt = LocalDateTime.now();
    }

    public void updateConnectionStatus(String connectionStatus) {
        this.connectionStatus = connectionStatus;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateAdminNote(String adminNote) {
        this.adminNote = adminNote;
        this.updatedAt = LocalDateTime.now();
    }

    private boolean isMatchedStatus() {
        String currentStatus = getStatus();
        return "ACCEPTED".equals(currentStatus) || "PROPOSED".equals(currentStatus) || "CONFIRMED".equals(currentStatus);
    }
}
