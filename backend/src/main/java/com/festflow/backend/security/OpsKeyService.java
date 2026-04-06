package com.festflow.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class OpsKeyService {

    private final String masterKey;
    private final Map<String, Long> boothKeyToBoothId;

    public OpsKeyService(
            @Value("${app.ops.master-key:}") String masterKey,
            @Value("${app.ops.booth-keys:}") String boothKeyPairs
    ) {
        this.masterKey = masterKey != null ? masterKey.trim() : "";
        this.boothKeyToBoothId = parseBoothKeys(boothKeyPairs);
    }

    public Optional<OpsIdentity> authenticate(String key) {
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }

        String trimmed = key.trim();
        if (!masterKey.isBlank() && masterKey.equals(trimmed)) {
            return Optional.of(new OpsIdentity("ops-master", "OPS_MASTER", null));
        }

        Long boothId = boothKeyToBoothId.get(trimmed);
        if (boothId != null) {
            return Optional.of(new OpsIdentity("ops-booth-" + boothId, "OPS_BOOTH", boothId));
        }

        return Optional.empty();
    }

    private Map<String, Long> parseBoothKeys(String pairs) {
        Map<String, Long> map = new HashMap<>();
        if (pairs == null || pairs.isBlank()) {
            return map;
        }

        String[] entries = pairs.split(",");
        for (String entry : entries) {
            String trimmed = entry.trim();
            if (trimmed.isBlank() || !trimmed.contains(":")) {
                continue;
            }
            String[] split = trimmed.split(":", 2);
            try {
                Long boothId = Long.parseLong(split[0].trim());
                String key = split[1].trim();
                if (!key.isBlank()) {
                    map.put(key, boothId);
                }
            } catch (NumberFormatException ignored) {
                // ignore malformed entries
            }
        }
        return map;
    }
}

