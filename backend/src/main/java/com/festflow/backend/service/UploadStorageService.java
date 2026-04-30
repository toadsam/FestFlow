package com.festflow.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class UploadStorageService {

    private static final long MAX_IMAGE_BYTES = 10L * 1024L * 1024L;
    private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/gif", ".gif"
    );

    private final Path uploadPath;

    public UploadStorageService(@Value("${app.upload.dir}") String uploadDir) {
        this.uploadPath = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    public String saveImage(MultipartFile file, String prefix) throws IOException {
        validateImage(file);
        Files.createDirectories(uploadPath);

        String contentType = normalizeContentType(file.getContentType());
        String extension = IMAGE_EXTENSIONS.get(contentType);
        String safePrefix = sanitizePrefix(prefix);
        String filename = safePrefix + "-" + UUID.randomUUID() + extension;
        Path target = uploadPath.resolve(filename).normalize();

        if (!target.startsWith(uploadPath)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload path.");
        }

        file.transferTo(target);
        return "/uploads/" + filename;
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image file is required.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image file must be 10MB or smaller.");
        }
        String contentType = normalizeContentType(file.getContentType());
        if (!IMAGE_EXTENSIONS.containsKey(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, WEBP, or GIF images are allowed.");
        }
    }

    private String normalizeContentType(String contentType) {
        return contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).trim();
    }

    private String sanitizePrefix(String prefix) {
        String value = prefix == null ? "upload" : prefix.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "-");
        value = value.replaceAll("-+", "-").replaceAll("^-|-$", "");
        return value.isBlank() ? "upload" : value;
    }
}
