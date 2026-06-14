package com.festflow.backend.service;

import com.festflow.backend.dto.NoticeResponseDto;
import com.festflow.backend.dto.NoticeUpsertRequestDto;
import com.festflow.backend.entity.Notice;
import com.festflow.backend.repository.NoticeRepository;
import com.festflow.backend.service.stream.StreamService;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;
/**
 * [서비스 상세 주석] 공지 생성, 수정, 삭제, 실시간 갱신을 처리합니다.
 * 이 클래스의 핵심은 공지 저장 후 SSE 이벤트를 발행해 사용자 화면에 바로 반영합니다.
 * 주요 관심사는 DB 조회/저장, SSE 실시간 갱신입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class NoticeService {
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final NoticeRepository noticeRepository;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final StreamService streamService;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public NoticeService(NoticeRepository noticeRepository, StreamService streamService) {
        this.noticeRepository = noticeRepository;
        this.streamService = streamService;
    }
/**
 * [상세 주석] getActiveNotices 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<NoticeResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public List<NoticeResponseDto> getActiveNotices() {
        return noticeRepository.findByActiveTrueOrderByCreatedAtDesc().stream()
                .map(this::toDto)
                .toList();
    }
/**
 * [상세 주석] getAllNotices 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 여러 데이터를 조회해 목록 형태로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<NoticeResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public List<NoticeResponseDto> getAllNotices() {
        return noticeRepository.findAll().stream()
                .sorted(Comparator.comparing(Notice::getCreatedAt).reversed())
                .map(this::toDto)
                .toList();
    }
/**
 * [상세 주석] createNotice 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: NoticeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    public NoticeResponseDto createNotice(NoticeUpsertRequestDto requestDto) {
        Notice saved = noticeRepository.save(new Notice(
                requestDto.title(),
                requestDto.content(),
                requestDto.category(),
                requestDto.active()
        ));

        broadcastActiveNotices();
        return toDto(saved);
    }
/**
 * [상세 주석] updateNotice 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: NoticeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    public NoticeResponseDto updateNotice(Long noticeId, NoticeUpsertRequestDto requestDto) {
        Notice notice = noticeRepository.findById(noticeId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "공지를 찾을 수 없습니다."));

        notice.update(requestDto.title(), requestDto.content(), requestDto.category(), requestDto.active());
        Notice saved = noticeRepository.save(notice);
        broadcastActiveNotices();

        return toDto(saved);
    }
/**
 * [상세 주석] deleteNotice 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 삭제 대상이 확인되면 Repository를 통해 DB에서 제거합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void deleteNotice(Long noticeId) {
        if (!noticeRepository.existsById(noticeId)) {
            throw new ResponseStatusException(NOT_FOUND, "공지를 찾을 수 없습니다.");
        }

        noticeRepository.deleteById(noticeId);
        broadcastActiveNotices();
    }
/**
 * [상세 주석] broadcastActiveNotices 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public void broadcastActiveNotices() {
        streamService.publishNotices(getActiveNotices());
    }
/**
 * [상세 주석] toDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: NoticeResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private NoticeResponseDto toDto(Notice notice) {
        return new NoticeResponseDto(
                notice.getId(),
                notice.getTitle(),
                notice.getContent(),
                notice.getCategory(),
                notice.isActive(),
                notice.getCreatedAt(),
                notice.getUpdatedAt()
        );
    }
}
