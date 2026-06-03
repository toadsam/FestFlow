package com.festflow.backend.controller;

import com.festflow.backend.dto.AiBoothRecommendationDto;
import com.festflow.backend.dto.AiDecisionLogDto;
import com.festflow.backend.dto.AiFestivalGuideDto;
import com.festflow.backend.dto.AiVisitorGuideDto;
import com.festflow.backend.service.AiCongestionService;
import com.festflow.backend.service.AiDecisionLogService;
import com.festflow.backend.service.PublicAiGuideService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiGuideController {

    private final AiCongestionService aiCongestionService;
    private final AiDecisionLogService decisionLogService;
    private final PublicAiGuideService publicAiGuideService;

    public AiGuideController(
            AiCongestionService aiCongestionService,
            AiDecisionLogService decisionLogService,
            PublicAiGuideService publicAiGuideService
    ) {
        this.aiCongestionService = aiCongestionService;
        this.decisionLogService = decisionLogService;
        this.publicAiGuideService = publicAiGuideService;
    }

    @GetMapping("/guide")
    public AiFestivalGuideDto guide() {
        return aiCongestionService.guide();
    }

    @GetMapping("/congestion/predictions")
    public List<AiBoothRecommendationDto> congestionPredictions() {
        return aiCongestionService.analyzeCurrent();
    }

    @GetMapping("/decisions")
    public List<AiDecisionLogDto> decisions() {
        return decisionLogService.recent();
    }

    @GetMapping("/visitor-guide/{scope}")
    public AiVisitorGuideDto visitorGuide(@PathVariable String scope) {
        return publicAiGuideService.guide(scope);
    }
}
