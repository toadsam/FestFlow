package com.festflow.backend.service;

import com.festflow.backend.dto.BoothReservationConfigRequestDto;
import com.festflow.backend.dto.BoothReservationDto;
import com.festflow.backend.dto.BoothReservationStateDto;
import com.festflow.backend.dto.ReservationCheckInTokenDto;
import com.festflow.backend.dto.ReservationCreateRequestDto;
import com.festflow.backend.dto.ReservationPenaltyDto;
import com.festflow.backend.dto.ReservationTableDto;
import com.festflow.backend.dto.ReservationTableUpsertDto;
import com.festflow.backend.entity.Booth;
import com.festflow.backend.entity.BoothReservation;
import com.festflow.backend.entity.BoothReservationTable;
import com.festflow.backend.entity.ReservationCheckInToken;
import com.festflow.backend.entity.ReservationStatus;
import com.festflow.backend.entity.ReservationUserState;
import com.festflow.backend.repository.BoothRepository;
import com.festflow.backend.repository.BoothReservationRepository;
import com.festflow.backend.repository.BoothReservationTableRepository;
import com.festflow.backend.repository.ReservationCheckInTokenRepository;
import com.festflow.backend.repository.ReservationUserStateRepository;
import com.festflow.backend.service.stream.StreamService;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
/**
 * [서비스 상세 주석] 부스 예약 생성, 체크인, 완료, 취소, 만료를 처리합니다.
 * 이 클래스의 핵심은 좌석 점유와 예약 상태 전이를 일관되게 관리합니다.
 * 주요 관심사는 DB 조회/저장, SSE 실시간 갱신, AI/외부 API입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class ReservationService {
    private static final List<ReservationStatus> BLOCKING_STATUSES = List.of(
            ReservationStatus.RESERVED,
            ReservationStatus.CHECKED_IN
    );
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
    private final BoothRepository boothRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final BoothReservationTableRepository boothReservationTableRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final BoothReservationRepository boothReservationRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final ReservationUserStateRepository reservationUserStateRepository;
// [의존성 주석] DB에 접근하는 Repository입니다. Service는 이 객체로 Entity를 조회, 저장, 삭제합니다.
private final ReservationCheckInTokenRepository checkInTokenRepository;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final ReservationAuthService reservationAuthService;
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
    public ReservationService(
            BoothRepository boothRepository,
            BoothReservationTableRepository boothReservationTableRepository,
            BoothReservationRepository boothReservationRepository,
            ReservationUserStateRepository reservationUserStateRepository,
            ReservationCheckInTokenRepository checkInTokenRepository,
            ReservationAuthService reservationAuthService,
            StreamService streamService
    ) {
        this.boothRepository = boothRepository;
        this.boothReservationTableRepository = boothReservationTableRepository;
        this.boothReservationRepository = boothReservationRepository;
        this.reservationUserStateRepository = reservationUserStateRepository;
        this.checkInTokenRepository = checkInTokenRepository;
        this.reservationAuthService = reservationAuthService;
        this.streamService = streamService;
    }
/**
 * [상세 주석] getBoothReservationState 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationStateDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    @Transactional
    public BoothReservationStateDto getBoothReservationState(Long boothId, String authToken) {
        Booth booth = findBooth(boothId);
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        List<BoothReservation> activeReservationEntities = boothReservationRepository
                .findByBoothIdAndStatusInOrderByExpiresAtAsc(boothId, BLOCKING_STATUSES);
        Map<Long, BoothReservation> blockingReservationByTableId = toBlockingReservationMap(activeReservationEntities);

        List<ReservationTableDto> tableDtos = boothReservationTableRepository.findByBoothIdOrderByDisplayOrderAscIdAsc(boothId).stream()
                .map(table -> toTableDto(table, blockingReservationByTableId.get(table.getId())))
                .toList();

        List<BoothReservationDto> activeReservations = activeReservationEntities.stream()
                .map(this::toReservationDto)
                .toList();

        BoothReservationDto myReservation = null;
        ReservationPenaltyDto penalty = null;

        String userKey = reservationAuthService.resolveUserKeyOrNull(authToken);
        if (userKey != null) {
            myReservation = boothReservationRepository
                    .findFirstByUserKeyAndStatusInOrderByReservedAtDesc(userKey, BLOCKING_STATUSES)
                    .map(this::toReservationDto)
                    .orElse(null);

            penalty = reservationUserStateRepository.findByUserKey(userKey)
                    .map(state -> toPenaltyDto(state, now))
                    .orElse(new ReservationPenaltyDto(0, null, false));
        }

        return new BoothReservationStateDto(
                sanitizeReservationMinutes(booth.getMaxReservationMinutes()),
                tableDtos,
                activeReservations,
                myReservation,
                penalty
        );
    }
/**
 * [상세 주석] upsertBoothReservationConfig 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: BoothReservationStateDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 삭제 대상이 확인되면 Repository를 통해 DB에서 제거합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 예약 가능 좌석이 없거나 적으면 혼잡 위험이 높다고 판단하는 근거가 됩니다.
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    @Transactional
    public BoothReservationStateDto upsertBoothReservationConfig(Long boothId, BoothReservationConfigRequestDto requestDto) {
        Booth booth = findBooth(boothId);
        booth.setMaxReservationMinutes(sanitizeReservationMinutes(requestDto.maxReservationMinutes()));
        boothRepository.save(booth);

        List<ReservationTableUpsertDto> requestTables = requestDto.tables() == null ? List.of() : requestDto.tables();
        List<BoothReservationTable> existingTables = boothReservationTableRepository.findByBoothIdOrderByDisplayOrderAscIdAsc(boothId);
        Map<Long, BoothReservationTable> existingById = new HashMap<>();
        for (BoothReservationTable table : existingTables) {
            existingById.put(table.getId(), table);
        }

        List<BoothReservationTable> toSave = new ArrayList<>();
        List<Long> keepIds = new ArrayList<>();

        for (int i = 0; i < requestTables.size(); i++) {
            ReservationTableUpsertDto dto = requestTables.get(i);
            int totalSeats = sanitizeTotalSeats(dto.totalSeats());
            int availableSeats = sanitizeAvailableSeats(dto.availableSeats(), totalSeats);
            String tableName = (dto.tableName() == null || dto.tableName().isBlank()) ? "Table " + (i + 1) : dto.tableName().trim();

            if (dto.id() != null && existingById.containsKey(dto.id())) {
                BoothReservationTable target = existingById.get(dto.id());
                target.update(tableName, totalSeats, availableSeats, i + 1);
                toSave.add(target);
                keepIds.add(target.getId());
            } else {
                toSave.add(new BoothReservationTable(booth, tableName, totalSeats, availableSeats, i + 1));
            }
        }

        for (BoothReservationTable table : existingTables) {
            if (!keepIds.contains(table.getId())) {
                if (boothReservationRepository.existsByTableIdAndStatusIn(table.getId(), BLOCKING_STATUSES)) {
                    throw new ResponseStatusException(CONFLICT, "Cannot remove a table that is reserved or in use.");
                }
                boothReservationTableRepository.delete(table);
            }
        }

        boothReservationTableRepository.saveAll(toSave);
        BoothReservationStateDto state = getBoothReservationState(boothId, null);
        streamService.publishReservations(Map.of("boothId", boothId, "status", "CONFIG_UPDATED"));
        return state;
    }
/**
 * [상세 주석] createReservation 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 요청 데이터를 바탕으로 새 데이터를 생성하고 저장하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public BoothReservationDto createReservation(Long boothId, ReservationCreateRequestDto requestDto, String authToken) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        String userKey = reservationAuthService.requireUserKey(authToken);

        ReservationUserState userState = reservationUserStateRepository.findByUserKey(userKey)
                .orElseGet(() -> reservationUserStateRepository.save(new ReservationUserState(userKey)));

        if (userState.isBlocked(now)) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "Reservation is temporarily blocked due to repeated no-shows.");
        }

        Optional<BoothReservation> activeReservation = boothReservationRepository
                .findFirstByUserKeyAndStatusInOrderByReservedAtDesc(userKey, BLOCKING_STATUSES);
        if (activeReservation.isPresent()) {
            throw new ResponseStatusException(CONFLICT, "Only one active reservation is allowed per user.");
        }

        Booth booth = findBooth(boothId);
        BoothReservationTable table = boothReservationTableRepository.findByIdForUpdate(requestDto.tableId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Table not found."));

        if (!table.getBooth().getId().equals(boothId)) {
            throw new ResponseStatusException(CONFLICT, "Selected table does not belong to this booth.");
        }
        if (boothReservationRepository.existsByTableIdAndStatusIn(table.getId(), BLOCKING_STATUSES)) {
            throw new ResponseStatusException(CONFLICT, "Selected table is already reserved or in use.");
        }

        int seatCount = requestDto.seatCount() == null ? 1 : Math.max(1, requestDto.seatCount());
        if (table.getAvailableSeats() < seatCount) {
            throw new ResponseStatusException(CONFLICT, "Not enough available seats in this table.");
        }

        table.setAvailableSeats(table.getAvailableSeats() - seatCount);
        boothReservationTableRepository.save(table);

        BoothReservation created = boothReservationRepository.save(new BoothReservation(
                booth,
                table,
                userKey,
                seatCount,
                ReservationStatus.RESERVED,
                now,
                now.plusMinutes(sanitizeReservationMinutes(booth.getMaxReservationMinutes()))
        ));

        BoothReservationDto dto = toReservationDto(created);
        streamService.publishReservations(dto);
        return dto;
    }
/**
 * [상세 주석] complete 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 진행 중인 작업이나 예약을 완료 상태로 바꾸는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public BoothReservationDto complete(Long boothId, Long reservationId) {
        BoothReservation reservation = boothReservationRepository.findByIdAndBoothId(reservationId, boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Reservation not found."));

        if (reservation.getStatus() != ReservationStatus.CHECKED_IN) {
            throw new ResponseStatusException(CONFLICT, "Only checked-in reservations can be completed.");
        }

        reservation.markCompleted();
        boothReservationRepository.save(reservation);
        restoreReservationSeats(reservation);

        BoothReservationDto dto = toReservationDto(reservation);
        streamService.publishReservations(dto);
        return dto;
    }
/**
 * [상세 주석] releaseTable 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public BoothReservationDto releaseTable(Long boothId, Long tableId) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        BoothReservation reservation = boothReservationRepository
                .findFirstByBoothIdAndTableIdAndStatusInOrderByReservedAtDesc(boothId, tableId, BLOCKING_STATUSES)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Active table reservation not found."));

        if (reservation.getStatus() == ReservationStatus.CHECKED_IN) {
            reservation.markCompleted();
        } else {
            reservation.markCancelled(now);
        }

        boothReservationRepository.save(reservation);
        restoreReservationSeats(reservation);

        BoothReservationDto dto = toReservationDto(reservation);
        streamService.publishReservations(dto);
        return dto;
    }
/**
 * [상세 주석] issueCheckInToken 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 조건이 맞는지 확인해서 true 또는 false로 알려주는 판단 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationCheckInTokenDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public ReservationCheckInTokenDto issueCheckInToken(Long boothId, Long reservationId, String authToken) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);
        String userKey = reservationAuthService.requireUserKey(authToken);

        BoothReservation reservation = boothReservationRepository.findByIdAndBoothId(reservationId, boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Reservation not found."));

        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            throw new ResponseStatusException(CONFLICT, "Reservation is no longer active.");
        }
        if (!reservation.getUserKey().equals(userKey)) {
            throw new ResponseStatusException(CONFLICT, "Reservation does not belong to the current user.");
        }
        if (reservation.getExpiresAt().isBefore(now)) {
            expireReservation(reservation, now);
            throw new ResponseStatusException(CONFLICT, "Reservation has expired.");
        }

        Optional<ReservationCheckInToken> existing = checkInTokenRepository
                .findFirstByReservationIdAndUsedAtIsNullAndExpiresAtAfterOrderByIdDesc(reservation.getId(), now);
        if (existing.isPresent()) {
            return new ReservationCheckInTokenDto(existing.get().getToken(), existing.get().getExpiresAt());
        }

        String token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        ReservationCheckInToken created = checkInTokenRepository.save(new ReservationCheckInToken(
                reservation,
                token,
                now,
                now.plusSeconds(60)
        ));

        return new ReservationCheckInTokenDto(created.getToken(), created.getExpiresAt());
    }
/**
 * [상세 주석] checkIn 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 예약, 인증, 상태 조건이 맞는지 확인하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public BoothReservationDto checkIn(Long boothId, Long reservationId) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        BoothReservation reservation = boothReservationRepository.findByIdAndBoothId(reservationId, boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Reservation not found."));

        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            throw new ResponseStatusException(CONFLICT, "Reservation is no longer active.");
        }

        if (reservation.getExpiresAt().isBefore(now)) {
            expireReservation(reservation, now);
            throw new ResponseStatusException(CONFLICT, "Reservation has expired.");
        }

        reservation.markCheckedIn(now);
        boothReservationRepository.save(reservation);
        BoothReservationDto dto = toReservationDto(reservation);
        streamService.publishReservations(dto);
        return dto;
    }
/**
 * [상세 주석] checkInByToken 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 예약, 인증, 상태 조건이 맞는지 확인하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    @Transactional
    public BoothReservationDto checkInByToken(Long boothId, String token) {
        LocalDateTime now = LocalDateTime.now();
        expireStaleReservations(now);

        ReservationCheckInToken checkInToken = checkInTokenRepository.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Check-in token not found."));

        if (checkInToken.isUsed()) {
            throw new ResponseStatusException(CONFLICT, "Check-in token is already used.");
        }
        if (checkInToken.isExpired(now)) {
            throw new ResponseStatusException(CONFLICT, "Check-in token has expired.");
        }

        BoothReservation reservation = checkInToken.getReservation();
        if (!reservation.getBooth().getId().equals(boothId)) {
            throw new ResponseStatusException(CONFLICT, "Check-in token belongs to another booth.");
        }

        BoothReservationDto checkedIn = checkIn(boothId, reservation.getId());
        checkInToken.markUsed(now);
        checkInTokenRepository.save(checkInToken);
        return checkedIn;
    }
/**
 * [상세 주석] expireStaleReservations 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 시간이 지난 데이터를 만료 상태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void expireStaleReservations(LocalDateTime now) {
        List<BoothReservation> expired = boothReservationRepository.findByStatusAndExpiresAtBefore(ReservationStatus.RESERVED, now);
        for (BoothReservation reservation : expired) {
            expireReservation(reservation, now);
        }
    }
/**
 * [상세 주석] expireReservation 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 시간이 지난 데이터를 만료 상태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * - 변경 내용을 SSE 이벤트로 발행해 프론트 화면이 새로고침 없이 갱신되게 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    private void expireReservation(BoothReservation reservation, LocalDateTime now) {
        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            return;
        }

        reservation.markExpired(now);
        boothReservationRepository.save(reservation);
        restoreReservationSeats(reservation);
        registerNoShow(reservation, now);
        streamService.publishReservations(toReservationDto(reservation));
    }
/**
 * [상세 주석] restoreReservationSeats 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    private void restoreReservationSeats(BoothReservation reservation) {
        BoothReservationTable table = reservation.getTable();
        int restoredSeats = Math.min(table.getTotalSeats(), table.getAvailableSeats() + reservation.getSeatCount());
        table.setAvailableSeats(restoredSeats);
        boothReservationTableRepository.save(table);
    }
/**
 * [상세 주석] registerNoShow 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: DB에서 데이터를 조회하거나 만든 뒤 저장까지 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - Entity 값을 새로 만들거나 수정한 뒤 save()로 DB에 반영합니다.
 * 초보자 포인트: save() 전에는 Entity 값을 세팅하는 부분, save() 후에는 DTO로 바꿔 반환하는 부분을 구분해서 보면 됩니다.
 */
    private void registerNoShow(BoothReservation reservation, LocalDateTime now) {
        ReservationUserState userState = reservationUserStateRepository.findByUserKey(reservation.getUserKey())
                .orElseGet(() -> new ReservationUserState(reservation.getUserKey()));
        userState.registerNoShow(now);
        reservationUserStateRepository.save(userState);
    }
/**
 * [상세 주석] findBooth 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Booth 타입 값을 반환합니다.
 * 처리 흐름:
 * - Repository를 통해 DB에서 필요한 Entity나 목록을 조회합니다.
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 조회 후 바로 orElseThrow가 나오면 '없으면 여기서 API 오류로 끝낸다'는 뜻입니다.
 */
    private Booth findBooth(Long boothId) {
        return boothRepository.findById(boothId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Booth not found."));
    }
/**
 * [상세 주석] toTableDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationTableDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private ReservationTableDto toTableDto(BoothReservationTable table) {
        return toTableDto(table, null);
    }
/**
 * [상세 주석] toTableDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationTableDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private ReservationTableDto toTableDto(BoothReservationTable table, BoothReservation blockingReservation) {
        String occupancyStatus = resolveOccupancyStatus(table, blockingReservation);
        String occupancyLabel = resolveOccupancyLabel(occupancyStatus);
        int reservableSeats = blockingReservation == null ? table.getAvailableSeats() : 0;

        return new ReservationTableDto(
                table.getId(),
                table.getTableName(),
                table.getTotalSeats(),
                table.getAvailableSeats(),
                table.getDisplayOrder(),
                reservableSeats,
                occupancyStatus,
                occupancyLabel,
                blockingReservation == null ? null : blockingReservation.getId()
        );
    }
/**
 * [상세 주석] toBlockingReservationMap 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: Map<Long, BoothReservation>입니다. id나 key로 결과를 빠르게 찾기 위한 구조입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Map<Long, BoothReservation> toBlockingReservationMap(List<BoothReservation> reservations) {
        Map<Long, BoothReservation> byTableId = new HashMap<>();
        for (BoothReservation reservation : reservations) {
            Long tableId = reservation.getTable().getId();
            BoothReservation existing = byTableId.get(tableId);
            if (existing == null || reservation.getStatus() == ReservationStatus.CHECKED_IN) {
                byTableId.put(tableId, reservation);
            }
        }
        return byTableId;
    }
/**
 * [상세 주석] resolveOccupancyStatus 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
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
    private String resolveOccupancyStatus(BoothReservationTable table, BoothReservation blockingReservation) {
        if (blockingReservation != null && blockingReservation.getStatus() == ReservationStatus.CHECKED_IN) {
            return "IN_USE";
        }
        if (blockingReservation != null) {
            return "RESERVED";
        }
        if (table.getAvailableSeats() <= 0) {
            return "FULL";
        }
        return "AVAILABLE";
    }
/**
 * [상세 주석] resolveOccupancyLabel 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
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
    private String resolveOccupancyLabel(String occupancyStatus) {
        return switch (occupancyStatus) {
            case "IN_USE" -> "\uC774\uC6A9\uC911";
            case "RESERVED" -> "\uC608\uC57D\uC911";
            case "FULL" -> "\uB9C8\uAC10";
            default -> "\uC608\uC57D \uAC00\uB2A5";
        };
    }
/**
 * [상세 주석] toReservationDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: BoothReservationDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private BoothReservationDto toReservationDto(BoothReservation reservation) {
        return new BoothReservationDto(
                reservation.getId(),
                reservation.getBooth().getId(),
                reservation.getTable().getId(),
                reservation.getTable().getTableName(),
                reservation.getUserKey(),
                reservation.getSeatCount(),
                reservation.getStatus(),
                reservation.getReservedAt(),
                reservation.getExpiresAt(),
                reservation.getCheckedInAt(),
                reservation.getExpiredAt()
        );
    }
/**
 * [상세 주석] toPenaltyDto 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: ReservationPenaltyDto입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private ReservationPenaltyDto toPenaltyDto(ReservationUserState state, LocalDateTime now) {
        return new ReservationPenaltyDto(
                state.getNoShowCount(),
                state.getBlockedUntil(),
                state.isBlocked(now)
        );
    }
/**
 * [상세 주석] sanitizeReservationMinutes 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int sanitizeReservationMinutes(Integer rawMinutes) {
        if (rawMinutes == null || rawMinutes < 1) {
            return 10;
        }
        return Math.min(rawMinutes, 120);
    }
/**
 * [상세 주석] sanitizeTotalSeats 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int sanitizeTotalSeats(Integer rawTotalSeats) {
        if (rawTotalSeats == null || rawTotalSeats < 1) {
            return 1;
        }
        return Math.min(rawTotalSeats, 30);
    }
/**
 * [상세 주석] sanitizeAvailableSeats 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private int sanitizeAvailableSeats(Integer rawAvailableSeats, int totalSeats) {
        if (rawAvailableSeats == null) {
            return totalSeats;
        }
        if (rawAvailableSeats < 0) {
            return 0;
        }
        return Math.min(rawAvailableSeats, totalSeats);
    }
}
