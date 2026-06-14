package com.festflow.backend.service;

import com.festflow.backend.dto.LostItemClaimRequestDto;
import com.festflow.backend.dto.LostItemResponseDto;
import com.festflow.backend.dto.LostItemStatusUpdateRequestDto;
import com.festflow.backend.dto.LostItemUpdateRequestDto;
import com.festflow.backend.entity.LostItem;
import com.festflow.backend.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;
/**
 * [서비스 상세 주석] 분실물 등록, 조회, 상태 변경을 처리합니다.
 * 이 클래스의 핵심은 사용자에게 보여줄 정보와 운영자가 관리할 정보를 구분해야 하는 서비스입니다.
 * 주요 관심사는 DB 조회/저장, AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class LostItemService {
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final LostItemRepository lostItemRepository;
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
    public LostItemService(LostItemRepository lostItemRepository) {
        this.lostItemRepository = lostItemRepository;
    }
/**
 * [상세 주석] getAll 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 여러 데이터를 조회해 목록 형태로 반환하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: List<LostItemResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    @Transactional(readOnly = true)
    public List<LostItemResponseDto> getAll() {
        return getAll(false);
    }
/**
 * [상세 주석] getAll 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 여러 데이터를 조회해 목록 형태로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: List<LostItemResponseDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional(readOnly = true)
    public List<LostItemResponseDto> getAll(boolean maskContacts) {
        return lostItemRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(item -> toDto(item, maskContacts))
                .toList();
    }
/**
 * [상세 주석] create 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    @Transactional
    public LostItemResponseDto create(
            String title,
            String description,
            String category,
            String foundLocation,
            String finderContact,
            String imageUrl,
            String reporterType,
            String reporterRef
    ) {
        LostItem saved = lostItemRepository.save(new LostItem(
                title,
                description,
                category,
                foundLocation,
                finderContact,
                imageUrl,
                "REGISTERED",
                reporterType,
                reporterRef
        ));
        return toDto(saved);
    }
/**
 * [상세 주석] updateStatus 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public LostItemResponseDto updateStatus(Long id, LostItemStatusUpdateRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        String nextStatus = normalizeStatus(requestDto.status());
        String note = trimOrNull(requestDto.resolveNote());

        item.update(
                item.getTitle(),
                item.getDescription(),
                item.getCategory(),
                item.getFoundLocation(),
                item.getFinderContact(),
                item.getImageUrl(),
                nextStatus,
                note
        );
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }
/**
 * [상세 주석] update 메서드는 이미 존재하는 데이터의 상태나 값을 수정합니다.
 * 한줄 요약: 기존 데이터를 찾아 요청값으로 수정하고 다시 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public LostItemResponseDto update(Long id, LostItemUpdateRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));

        String title = trimRequired(requestDto.title(), "title");
        String description = trimRequired(requestDto.description(), "description");
        String category = trimOrDefault(requestDto.category(), "ETC");
        String foundLocation = trimRequired(requestDto.foundLocation(), "foundLocation");
        String finderContact = trimOrNull(requestDto.finderContact());
        String imageUrl = trimOrNull(requestDto.imageUrl());
        String status = normalizeStatus(requestDto.status());
        String resolveNote = trimOrNull(requestDto.resolveNote());

        item.update(
                title,
                description,
                category,
                foundLocation,
                finderContact,
                imageUrl,
                status,
                resolveNote
        );
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }
/**
 * [상세 주석] claim 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public LostItemResponseDto claim(Long id, LostItemClaimRequestDto requestDto) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        if ("RETURNED".equals(item.getStatus())) {
            throw new ResponseStatusException(BAD_REQUEST, "Already returned item cannot be claimed.");
        }

        String claimantName = trimRequired(requestDto.claimantName(), "claimantName");
        String claimantContact = trimRequired(requestDto.claimantContact(), "claimantContact");
        String claimantNote = trimOrNull(requestDto.claimantNote());

        item.markClaim(claimantName, claimantContact, claimantNote, "OWNER_CLAIMED");
        LostItem saved = lostItemRepository.save(item);
        return toDto(saved);
    }
/**
 * [상세 주석] delete 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 삭제 대상이 확인되면 Repository를 통해 DB에서 제거합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public void delete(Long id) {
        LostItem item = lostItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Lost item not found."));
        lostItemRepository.delete(item);
    }
/**
 * [상세 주석] normalizeStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "REGISTERED";
        }
        String normalized = status.trim().toUpperCase();
        if ("OWNER_CLAIMED".equals(normalized)) {
            return "OWNER_CLAIMED";
        }
        if ("RETURNED".equals(normalized)) {
            return "RETURNED";
        }
        return "REGISTERED";
    }
/**
 * [상세 주석] trimRequired 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String trimRequired(String value, String field) {
        String trimmed = trimOrNull(value);
        if (trimmed == null) {
            throw new ResponseStatusException(BAD_REQUEST, field + " is required.");
        }
        return trimmed;
    }
/**
 * [상세 주석] trimOrDefault 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String trimOrDefault(String value, String fallback) {
        String trimmed = trimOrNull(value);
        return trimmed == null ? fallback : trimmed;
    }
/**
 * [상세 주석] trimOrNull 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed;
    }
/**
 * [상세 주석] toDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private LostItemResponseDto toDto(LostItem item) {
        return toDto(item, false);
    }
/**
 * [상세 주석] toDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: LostItemResponseDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private LostItemResponseDto toDto(LostItem item, boolean maskContacts) {
        return new LostItemResponseDto(
                item.getId(),
                item.getTitle(),
                item.getDescription(),
                item.getCategory(),
                item.getFoundLocation(),
                maskContacts ? maskContact(item.getFinderContact()) : item.getFinderContact(),
                item.getImageUrl(),
                item.getStatus(),
                statusLabel(item.getStatus()),
                item.getReporterType(),
                item.getReporterRef(),
                item.getResolveNote(),
                item.getClaimantName(),
                maskContacts ? maskContact(item.getClaimantContact()) : item.getClaimantContact(),
                item.getClaimantNote(),
                item.getClaimedAt(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }
/**
 * [상세 주석] maskContact 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String maskContact(String contact) {
        if (contact == null || contact.isBlank()) {
            return contact;
        }
        String trimmed = contact.trim();
        String digits = trimmed.replaceAll("[^0-9]", "");
        if (digits.length() >= 7) {
            return digits.substring(0, 3) + "-****-" + digits.substring(digits.length() - 4);
        }
        if (trimmed.length() <= 4) {
            return "****";
        }
        return trimmed.substring(0, 2) + "****" + trimmed.substring(trimmed.length() - 2);
    }
/**
 * [상세 주석] statusLabel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String statusLabel(String status) {
        if ("RETURNED".equals(status)) {
            return "Returned";
        }
        if ("OWNER_CLAIMED".equals(status)) {
            return "Owner Claimed";
        }
        return "Registered";
    }
}
