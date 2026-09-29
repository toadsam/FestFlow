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

    // IP 기준 한도. 축제 캠퍼스 와이파이(NAT)는 수백 명이 공인 IP 하나를 같이 쓰므로 소개팅 쪽은 넉넉히 잡는다.
    // 비밀번호 무차별 대입은 AiMatchService 의 닉네임별 실패 잠금(10회/10분)이 따로 막는다.
    // 로그인(access)은 앱이 신청함 갱신용으로 15초마다 다시 부르므로 IP 한도는 폭주 방지 수준(3000/10분)만 둔다.
    private static final List<Rule> RULES = List.of(
            new Rule("POST", Pattern.compile("^/api/auth/login$"), "admin-login", 10, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/staff/auth/login$"), "staff-login", 10, Duration.ofMinutes(10)),
            new Rule("*", Pattern.compile("^/api/ops/.*"), "ops-key", 60, Duration.ofMinutes(1)),
            new Rule("POST", Pattern.compile("^/api/gps$"), "gps", 60, Duration.ofMinutes(1)),
            new Rule("POST", Pattern.compile("^/api/chat$"), "chat", 20, Duration.ofMinutes(1)),
            new Rule("GET", Pattern.compile("^/api/ai/visitor-guide/.*"), "ai-visitor-guide", 30, Duration.ofMinutes(1)),
            new Rule("POST", Pattern.compile("^/api/ai-match/image-preview$"), "ai-match-image-preview", 40, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/ai-match/profiles$"), "ai-match-profile-create", 60, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/ai-match/profiles/access$"), "ai-match-profile-access", 3000, Duration.ofMinutes(10)),
            new Rule("GET", Pattern.compile("^/api/ai-match/phone-check$"), "ai-match-phone-check", 300, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/ai-match/profiles/\\d+/(requests|favorite|report)$"), "ai-match-profile-action", 300, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/ai-match/requests/\\d+/(accept|reject|cancel|meetup/propose|meetup/confirm|meetup/cancel|meetup/arrived)$"), "ai-match-request-action", 300, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/reservations/auth/send-code$"), "reservation-auth", 5, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/booths/\\d+/orders$"), "order-create", 60, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/notices/\\d+/view$"), "notice-view", 120, Duration.ofMinutes(10)),
            new Rule("GET", Pattern.compile("^/api/ai-match/meetup-slots$"), "ai-match-meetup-slots", 600, Duration.ofMinutes(10)),
            new Rule("*", Pattern.compile("^/api/ai-match/profiles/\\d+(/delete)?$"), "ai-match-profile-edit", 60, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/translate.*"), "translate", 30, Duration.ofMinutes(10)),
            new Rule("POST", Pattern.compile("^/api/lost-items$"), "lost-item-create", 5, Duration.ofMinutes(10)),
            new Rule("PUT", Pattern.compile("^/api/lost-items/\\d+/claim$"), "lost-item-claim", 60, Duration.ofMinutes(1))
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
                .filter(rule -> "*".equals(rule.method()) || rule.method().equalsIgnoreCase(method))
                .filter(rule -> rule.pathPattern().matcher(uri).matches())
                .findFirst()
                .orElse(null);
    }

    private String clientIp(HttpServletRequest request) {
        // 프록시는 접속 IP를 목록 맨 뒤에 붙인다. 앞쪽은 클라이언트가 마음대로 넣을 수 있으니 오른쪽부터 보되,
        // 프록시 내부 주소(사설·CGNAT·루프백)는 건너뛰고 처음 나오는 공인 IP를 쓴다. 모두 내부 주소면(로컬) 마지막 값.
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            String[] parts = forwardedFor.split(",");
            for (int i = parts.length - 1; i >= 0; i--) {
                String candidate = parts[i].trim();
                if (!candidate.isEmpty() && !isInternalAddress(candidate)) {
                    return candidate;
                }
            }
            return parts[parts.length - 1].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    static boolean isInternalAddress(String ip) {
        String v = ip.toLowerCase();
        if (v.startsWith("[")) v = v.substring(1, v.indexOf(']') > 0 ? v.indexOf(']') : v.length());
        if (v.equals("::1") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;
        if (v.startsWith("::ffff:")) v = v.substring(7);
        String[] o = v.split("\\.");
        if (o.length != 4) return false;
        try {
            int a = Integer.parseInt(o[0]);
            int b = Integer.parseInt(o[1]);
            return a == 10 || a == 127 || a == 0
                    || (a == 172 && b >= 16 && b <= 31)
                    || (a == 192 && b == 168)
                    || (a == 169 && b == 254)
                    || (a == 100 && b >= 64 && b <= 127);
        } catch (NumberFormatException e) {
            return false;
        }
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
