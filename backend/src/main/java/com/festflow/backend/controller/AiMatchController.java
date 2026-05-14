package com.festflow.backend.controller;

import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchProfileResponseDto;
import com.festflow.backend.dto.AiMatchRequestCreateDto;
import com.festflow.backend.dto.AiMatchRequestResponseDto;
import com.festflow.backend.service.AiMatchService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/ai-match")
public class AiMatchController {

    private final AiMatchService aiMatchService;

    public AiMatchController(AiMatchService aiMatchService) {
        this.aiMatchService = aiMatchService;
    }

    @GetMapping("/profiles")
    public List<AiMatchProfileResponseDto> getProfiles() {
        return aiMatchService.getProfiles();
    }

    @PostMapping(value = "/image-preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AiMatchImagePreviewDto createImagePreview(
            @RequestParam("file") MultipartFile file
    ) throws IOException {
        return aiMatchService.createImagePreview(file);
    }

    @PostMapping(value = "/profiles", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AiMatchProfileResponseDto createProfile(
            @RequestParam("nickname") String nickname,
            @RequestParam("gender") String gender,
            @RequestParam("intro") String intro,
            @RequestParam("meetPlace") String meetPlace,
            @RequestParam("consent") boolean consent,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "originalImageUrl", required = false) String originalImageUrl,
            @RequestParam(value = "generatedImageUrl", required = false) String generatedImageUrl
    ) throws IOException {
        return aiMatchService.createProfile(
                nickname,
                gender,
                intro,
                meetPlace,
                consent,
                file,
                originalImageUrl,
                generatedImageUrl
        );
    }

    @GetMapping("/requests")
    public List<AiMatchRequestResponseDto> getRequests(
            @RequestParam(value = "profileId", required = false) Long profileId
    ) {
        return aiMatchService.getRequests(profileId);
    }

    @PostMapping("/profiles/{profileId}/requests")
    public AiMatchRequestResponseDto createRequest(
            @PathVariable Long profileId,
            @RequestBody AiMatchRequestCreateDto requestDto
    ) {
        return aiMatchService.createRequest(profileId, requestDto);
    }
}
