package com.festflow.backend.repository;

import com.festflow.backend.entity.Booth;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoothRepository extends JpaRepository<Booth, Long> {
}

