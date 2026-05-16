package com.festflow.backend.controller;

import com.festflow.backend.dto.AiMatchProfileAccessRequestDto;
import com.festflow.backend.dto.AiMatchProfileAccessResponseDto;
import com.festflow.backend.dto.AiMatchProfileDeleteDto;
import com.festflow.backend.dto.AiMatchImagePreviewDto;
import com.festflow.backend.dto.AiMatchProfileResponseDto;
import com.festflow.backend.dto.AiMatchProfileUpdateDto;
import com.festflow.backend.dto.AiMatchRequestCreateDto;
import com.festflow.backend.dto.AiMatchRequestResponseDto;
import com.festflow.backend.service.AiMatchService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
@RestController
@RequestMapping("/api/ai-match")
public class AiMatchController {

    private final AiMatchService aiMatchService;

    public AiMatchController(AiMatchService aiMatchService) {
        this.aiMatchService = aiMatchService;
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
            @RequestParam("pin") String pin,
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
                pin,
                meetPlace,
                consent,
                file,
                originalImageUrl,
                generatedImageUrl
        );
    }

    @PostMapping("/profiles/access")
    public AiMatchProfileAccessResponseDto accessProfile(
            @RequestBody AiMatchProfileAccessRequestDto requestDto
    ) {
        return aiMatchService.accessProfile(requestDto);
    }

    @PutMapping("/profiles/{profileId}")
    public AiMatchProfileResponseDto updateProfile(
            @PathVariable Long profileId,
            @RequestBody AiMatchProfileUpdateDto requestDto
    ) {
        return aiMatchService.updateProfile(profileId, requestDto);
    }

    @PostMapping("/profiles/{profileId}/delete")
    public void deleteProfile(
            @PathVariable Long profileId,
            @RequestBody AiMatchProfileDeleteDto requestDto
    ) {
        aiMatchService.deleteProfile(profileId, requestDto);
    }

    @PostMapping("/profiles/{profileId}/requests")
    public AiMatchRequestResponseDto createRequest(
            @PathVariable Long profileId,
            @RequestBody AiMatchRequestCreateDto requestDto
    ) {
        return aiMatchService.createRequest(profileId, requestDto);
    }

    @PostMapping("/requests/{requestId}/accept")
    public AiMatchRequestResponseDto acceptRequest(
            @PathVariable Long requestId,
            @RequestBody AiMatchProfileAccessRequestDto requestDto
    ) {
        return aiMatchService.acceptRequest(requestId, requestDto);
    }

    @PostMapping("/requests/{requestId}/reject")
    public AiMatchRequestResponseDto rejectRequest(
            @PathVariable Long requestId,
            @RequestBody AiMatchProfileAccessRequestDto requestDto
    ) {
        return aiMatchService.rejectRequest(requestId, requestDto);
    }

    @PostMapping("/requests/{requestId}/cancel")
    public AiMatchRequestResponseDto cancelRequest(
            @PathVariable Long requestId,
            @RequestBody AiMatchProfileAccessRequestDto requestDto
    ) {
        return aiMatchService.cancelRequest(requestId, requestDto);
    }
}
