package com.festflow.backend.service;

import com.festflow.backend.dto.LoginRequestDto;
import com.festflow.backend.dto.LoginResponseDto;
import com.festflow.backend.entity.AdminUser;
import com.festflow.backend.repository.AdminUserRepository;
import com.festflow.backend.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class AuthService {

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponseDto login(LoginRequestDto requestDto) {
        AdminUser adminUser = adminUserRepository.findByUsername(requestDto.username())
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(requestDto.password(), adminUser.getPassword())) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid credentials");
        }

        String token = jwtService.generateToken(adminUser.getUsername(), adminUser.getRole());
        return new LoginResponseDto(token, adminUser.getUsername());
    }
}
