package com.festflow.backend.controller.admin;

import com.festflow.backend.service.AdminImportService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/import")
public class AdminImportController {

    private final AdminImportService adminImportService;

    public AdminImportController(AdminImportService adminImportService) {
        this.adminImportService = adminImportService;
    }

    @PostMapping(value = "/booths", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> importBooths(@RequestParam("file") MultipartFile file) throws IOException {
        int count = adminImportService.importBoothsCsv(file);
        return Map.of("imported", count);
    }

    @PostMapping(value = "/events", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> importEvents(@RequestParam("file") MultipartFile file) throws IOException {
        int count = adminImportService.importEventsCsv(file);
        return Map.of("imported", count);
    }
}
