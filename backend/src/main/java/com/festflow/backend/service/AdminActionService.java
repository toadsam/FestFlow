package com.festflow.backend.service;

import com.festflow.backend.dto.CongestionResponseDto;
import com.festflow.backend.dto.EventResponseDto;
import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.NoticeUpsertRequestDto;
import org.springframework.stereotype.Service;

@Service
public class AdminActionService {

    private final BoothService boothService;
    private final EventService eventService;
    private final NoticeService noticeService;

    public AdminActionService(BoothService boothService, EventService eventService, NoticeService noticeService) {
        this.boothService = boothService;
        this.eventService = eventService;
        this.noticeService = noticeService;
    }

    public NoticeResponseDto publishCongestionReliefNotice() {
        CongestionResponseDto mostCongested = boothService.getMostCongestedBooth();
        String targetBooth = mostCongested != null ? mostCongested.boothName() : "?꾩옣 ?꾩껜";

        return noticeService.createNotice(new NoticeUpsertRequestDto(
                "?쇱옟 ?꾪솕 ?덈궡",
                targetBooth + " 二쇰???留ㅼ슦 遺먮퉽?덈떎. 以묒븰愿묒옣 ?고쉶 ?숈꽑???댁슜??二쇱꽭??",
                "湲닿툒",
                true
        ));
    }

    public NoticeResponseDto publishEventStartNotice(Long eventId) {
        EventResponseDto event = eventService.getEventById(eventId);

        return noticeService.createNotice(new NoticeUpsertRequestDto(
                "怨듭뿰 ?쒖옉 ?덈궡",
                "吏湲덈???'" + event.title() + "' 怨듭뿰???쒖옉?⑸땲?? 愿媛앹꽍?쇰줈 ?대룞??二쇱꽭??",
                "湲닿툒",
                true
        ));
    }
}
