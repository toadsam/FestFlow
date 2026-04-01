package com.festflow.backend.controller.admin;

import com.festflow.backend.dto.BoothReorderRequestDto;
import com.festflow.backend.dto.BoothResponseDto;
import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.service.AuditLogService;
import com.festflow.backend.service.BoothService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/booths")
public class AdminBoothController {

    private final BoothService boothService;
    private final AuditLogService auditLogService;

    @Value("${app.upload.dir}")
    private String uploadDir;

    public AdminBoothController(BoothService boothService, AuditLogService auditLogService) {
        this.boothService = boothService;
        this.auditLogService = auditLogService;
    }

    @PostMapping
    public BoothResponseDto createBooth(@Valid @RequestBody BoothUpsertRequestDto requestDto, Authentication authentication) {
        BoothResponseDto created = boothService.createBooth(requestDto);
        auditLogService.log(authentication.getName(), "CREATE", "BOOTH", created.id(), created.name());
        return created;
    }

    @PutMapping("/{id}")
    public BoothResponseDto updateBooth(@PathVariable Long id, @Valid @RequestBody BoothUpsertRequestDto requestDto, Authentication authentication) {
        BoothResponseDto updated = boothService.updateBooth(id, requestDto);
        auditLogService.log(authentication.getName(), "UPDATE", "BOOTH", id, updated.name());
        return updated;
    }

    @PostMapping(value = "/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BoothResponseDto uploadImage(@PathVariable Long id, @RequestParam("file") MultipartFile file, Authentication authentication) throws IOException {
        Path dir = Path.of(uploadDir);
        Files.createDirectories(dir);

        String ext = file.getOriginalFilename() != null && file.getOriginalFilename().contains(".")
                ? file.getOriginalFilename().substring(file.getOriginalFilename().lastIndexOf('.'))
                : ".jpg";
        String filename = "booth-" + id + "-" + UUID.randomUUID() + ext;
        Path path = dir.resolve(filename);
        Files.write(path, file.getBytes());

        BoothResponseDto updated = boothService.updateBoothImage(id, "/uploads/" + filename);
        auditLogService.log(authentication.getName(), "UPLOAD_IMAGE", "BOOTH", id, filename);
        return updated;
    }

    @PutMapping("/reorder")
    public void reorderBooths(@Valid @RequestBody BoothReorderRequestDto requestDto, Authentication authentication) {
        boothService.reorderBooths(requestDto);
        auditLogService.log(authentication.getName(), "REORDER", "BOOTH", null, "총 " + requestDto.boothIds().size() + "개 정렬");
    }

    @DeleteMapping("/{id}")
    public void deleteBooth(@PathVariable Long id, Authentication authentication) {
        boothService.deleteBooth(id);
        auditLogService.log(authentication.getName(), "DELETE", "BOOTH", id, "부스 삭제");
    }
}
