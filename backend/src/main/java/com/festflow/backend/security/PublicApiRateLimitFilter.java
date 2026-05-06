package com.festflow.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Component
public class PublicApiRateLimitFilter extends OncePerRequestFilter {

    private static final List<Rule> RULES = List.of(
            new Rule("POST", Pattern.compile("^/api/gps$"), "gps", 60, Duration.ofMinutes(1)),
            new Rule("POST", Pattern.compile("^/api/chat$"), "chat", 20, Duration.ofMinutes(1)),
            new Rule("POST", Pattern.compile("^/api/reservations/auth/send-code$"), "reservation-auth", 5, Duration.ofMinutes(10)),
            new Rule("PUT", Pattern.compile("^/api/lost-items/\\d+/claim$"), "lost-item-claim", 10, Duration.ofMinutes(1))
    );

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Rule rule = findRule(request);
        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String key = clientIp(request) + ":" + rule.key();
        Bucket bucket = buckets.computeIfAbsent(key, ignored -> new Bucket(Instant.now(), 0));
        Instant now = Instant.now();

        boolean allowed;
        long retryAfterSeconds;
        synchronized (bucket) {
            if (Duration.between(bucket.windowStart(), now).compareTo(rule.window()) >= 0) {
                bucket.reset(now);
            }

            allowed = bucket.count() < rule.maxRequests();
            if (allowed) {
                bucket.increment();
                retryAfterSeconds = 0;
            } else {
                retryAfterSeconds = Math.max(
                        1,
                        rule.window().minus(Duration.between(bucket.windowStart(), now)).toSeconds()
                );
            }
        }

        if (!allowed) {
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"message\":\"Too many requests. Please try again later.\"}");
            return;
        }

        if (buckets.size() > 10_000) {
            pruneExpiredBuckets(now);
        }

        filterChain.doFilter(request, response);
    }

    private Rule findRule(HttpServletRequest request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        return RULES.stream()
                .filter(rule -> rule.method().equalsIgnoreCase(method))
                .filter(rule -> rule.pathPattern().matcher(uri).matches())
                .findFirst()
                .orElse(null);
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    private void pruneExpiredBuckets(Instant now) {
        buckets.entrySet().removeIf(entry ->
                Duration.between(entry.getValue().windowStart(), now).compareTo(Duration.ofMinutes(15)) > 0
        );
    }

    private record Rule(String method, Pattern pathPattern, String key, int maxRequests, Duration window) {
    }

    private static final class Bucket {
        private Instant windowStart;
        private int count;

        private Bucket(Instant windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }

        private Instant windowStart() {
            return windowStart;
        }

        private int count() {
            return count;
        }

        private void increment() {
            count++;
        }

        private void reset(Instant nextWindowStart) {
            windowStart = nextWindowStart;
            count = 0;
        }
    }
}
