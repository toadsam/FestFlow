package com.festflow.backend.controller;

import com.festflow.backend.service.UploadStorageService;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Duration;

@RestController
public class UploadAssetController {

    private final UploadStorageService uploadStorageService;

    public UploadAssetController(UploadStorageService uploadStorageService) {
        this.uploadStorageService = uploadStorageService;
    }

    @GetMapping("/uploads/{filename:.+}")
    public ResponseEntity<Resource> getUpload(@PathVariable String filename) throws IOException {
        UploadStorageService.StoredObject object = uploadStorageService.loadStoredObject("/uploads/" + filename);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(object.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .body(object.resource());
    }
}
