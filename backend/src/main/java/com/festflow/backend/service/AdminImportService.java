package com.festflow.backend.service;

import com.festflow.backend.dto.BoothUpsertRequestDto;
import com.festflow.backend.dto.EventUpsertRequestDto;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.LocalTime;
/**
 * [서비스 상세 주석] CSV 파일 기반 관리자 가져오기를 처리합니다.
 * 이 클래스의 핵심은 MultipartFile을 읽고 각 줄을 DTO로 바꿔 기존 생성/수정 로직을 재사용합니다.
 * 주요 관심사는 파일 업로드입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class AdminImportService {
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
    private final BoothService boothService;
// [의존성 주석] 다른 업무 로직을 재사용하기 위한 Service입니다. 한 서비스가 모든 일을 직접 하지 않도록 책임을 나눕니다.
private final EventService eventService;
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
    public AdminImportService(BoothService boothService, EventService eventService) {
        this.boothService = boothService;
        this.eventService = eventService;
    }
/**
 * [상세 주석] importBoothsCsv 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 업로드된 파일을 받아 검증하거나 저장하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 초보자 포인트: 파일 업로드는 JSON.stringify가 아니라 FormData와 multipart/form-data 흐름으로 이해해야 합니다.
 */
    public int importBoothsCsv(MultipartFile file) throws IOException {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (first) {
                    first = false;
                    continue;
                }
                String[] values = line.split(",", -1);
                if (values.length < 4) continue;
                boothService.createBooth(new BoothUpsertRequestDto(
                        values[0].trim(),
                        Double.parseDouble(values[1].trim()),
                        Double.parseDouble(values[2].trim()),
                        values[3].trim(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        values.length > 4 ? values[4].trim() : null,
                        values.length > 5 ? values[5].trim() : null,
                        values.length > 6 && !values[6].isBlank() ? LocalTime.parse(values[6].trim()) : null,
                        values.length > 7 && !values[7].isBlank() ? LocalTime.parse(values[7].trim()) : null,
                        values.length > 8 ? values[8].trim() : null,
                        values.length > 9 ? values[9].trim() : null,
                        values.length > 10 && !values[10].isBlank() ? Boolean.parseBoolean(values[10].trim()) : null
                ));
                count++;
            }
        }
        return count;
    }
/**
 * [상세 주석] importEventsCsv 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 업로드된 파일을 받아 검증하거나 저장하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 초보자 포인트: 파일 업로드는 JSON.stringify가 아니라 FormData와 multipart/form-data 흐름으로 이해해야 합니다.
 */
    public int importEventsCsv(MultipartFile file) throws IOException {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (first) {
                    first = false;
                    continue;
                }
                String[] values = line.split(",", -1);
                if (values.length < 3) continue;
                eventService.createEvent(new EventUpsertRequestDto(
                        values[0].trim(),
                        LocalDateTime.parse(values[1].trim()),
                        LocalDateTime.parse(values[2].trim()),
                        values.length > 3 ? values[3].trim() : null,
                        values.length > 4 ? values[4].trim() : null,
                        values.length > 5 ? values[5].trim() : null,
                        values.length > 6 ? values[6].trim() : null,
                        values.length > 7 ? values[7].trim() : null,
                        values.length > 8 && !values[8].isBlank() ? Integer.parseInt(values[8].trim()) : null
                ));
                count++;
            }
        }
        return count;
    }
}
