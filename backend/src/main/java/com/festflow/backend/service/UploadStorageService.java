package com.festflow.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
/**
 * [서비스 상세 주석] 이미지/파일 업로드 저장을 처리합니다.
 * 이 클래스의 핵심은 프론트 FormData 파일을 MultipartFile로 받아 로컬 또는 S3에 저장하고 URL을 반환합니다.
 * 주요 관심사는 파일 업로드입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class UploadStorageService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final long MAX_IMAGE_BYTES = 10L * 1024L * 1024L;
    private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/gif", ".gif"
    );
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
    private final Path uploadPath;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final boolean s3Enabled;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String s3Bucket;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String s3PublicBaseUrl;
// [의존성 주석] 외부 API나 문자 발송처럼 서버 밖 시스템과 통신하는 객체입니다.
private final S3Client s3Client;
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

    public UploadStorageService(
            @Value("${app.upload.dir}") String uploadDir,
            @Value("${app.storage.type:local}") String storageType,
            @Value("${app.s3.bucket:}") String s3Bucket,
            @Value("${app.s3.region:ap-northeast-2}") String s3Region,
            @Value("${app.s3.endpoint:}") String s3Endpoint,
            @Value("${app.s3.public-base-url:}") String s3PublicBaseUrl,
            @Value("${app.s3.path-style-access:false}") boolean pathStyleAccess
    ) {
        this.uploadPath = Path.of(uploadDir).toAbsolutePath().normalize();
        this.s3Bucket = s3Bucket == null ? "" : s3Bucket.trim();
        this.s3PublicBaseUrl = normalizePublicBaseUrl(s3PublicBaseUrl);
        this.s3Enabled = "s3".equalsIgnoreCase(storageType) || !this.s3Bucket.isBlank();
        if (s3Enabled) {
            if (this.s3Bucket.isBlank()) {
                throw new IllegalStateException("AWS_S3_BUCKET is required when APP_STORAGE_TYPE=s3.");
            }
            var builder = S3Client.builder()
                    .region(Region.of(s3Region == null || s3Region.isBlank() ? "ap-northeast-2" : s3Region.trim()))
                    .credentialsProvider(DefaultCredentialsProvider.create())
                    .forcePathStyle(pathStyleAccess);
            if (s3Endpoint != null && !s3Endpoint.isBlank()) {
                builder.endpointOverride(URI.create(s3Endpoint.trim()));
            }
            this.s3Client = builder.build();
        } else {
            this.s3Client = null;
        }
    }
/**
 * [상세 주석] saveImage 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 업로드된 이미지 파일을 저장소에 저장하고 접근 가능한 URL을 반환하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 조건/분기 설명:
 * - 업로드된 MultipartFile을 검증하고 저장소에 파일로 저장한 뒤 접근 가능한 URL을 반환합니다.
 * - 파일 업로드는 JSON body가 아니라 multipart/form-data 흐름이므로 프론트 FormData와 연결됩니다.
 * 초보자 포인트: 파일 업로드는 JSON.stringify가 아니라 FormData와 multipart/form-data 흐름으로 이해해야 합니다.
 */
    public String saveImage(MultipartFile file, String prefix) throws IOException {
        validateImage(file);

        String contentType = normalizeContentType(file.getContentType());
        String extension = IMAGE_EXTENSIONS.get(contentType);
        String key = buildObjectKey(prefix, extension);
        if (s3Enabled) {
            putS3Object(key, file.getBytes(), contentType);
            return toStoredUrl(key);
        }

        Files.createDirectories(uploadPath);
        Path target = resolveLocalTarget(key);
        file.transferTo(target);
        return toStoredUrl(key);
    }
/**
 * [상세 주석] saveImageBytes 메서드는 새 데이터를 생성하거나 저장하는 흐름을 담당합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public String saveImageBytes(byte[] imageBytes, String prefix, String extension) throws IOException {
        if (imageBytes == null || imageBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image is required.");
        }

        String safeExtension = sanitizeExtension(extension);
        String key = buildObjectKey(prefix, safeExtension);
        if (s3Enabled) {
            putS3Object(key, imageBytes, contentTypeForExtension(safeExtension));
            return toStoredUrl(key);
        }

        Files.createDirectories(uploadPath);
        Path target = resolveLocalTarget(key);
        Files.write(target, imageBytes);
        return toStoredUrl(key);
    }
/**
 * [상세 주석] resolveUploadUrl 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Path 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public Path resolveUploadUrl(String imageUrl) throws IOException {
        String key = extractObjectKey(imageUrl);
        if (s3Enabled) {
            StoredObject object = getS3Object(key);
            String extension = extensionFromKey(key);
            Path tempFile = Files.createTempFile("festflow-upload-", extension);
            Files.write(tempFile, object.bytes());
            tempFile.toFile().deleteOnExit();
            return tempFile;
        }
        return resolveLocalTarget(key);
    }
/**
 * [상세 주석] loadStoredObject 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StoredObject 타입 값을 반환합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public StoredObject loadStoredObject(String imageUrl) throws IOException {
        String key = extractObjectKey(imageUrl);
        if (s3Enabled) {
            return getS3Object(key);
        }
        Path target = resolveLocalTarget(key);
        if (!Files.exists(target) || !Files.isRegularFile(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Upload not found.");
        }
        String contentType = Files.probeContentType(target);
        return new StoredObject(
                Files.readAllBytes(target),
                contentType == null ? contentTypeForExtension(extensionFromKey(key)) : contentType
        );
    }
/**
 * [상세 주석] deleteUploadUrl 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 참/거짓 판단 결과입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public boolean deleteUploadUrl(String imageUrl) throws IOException {
        String value = imageUrl == null ? "" : imageUrl.trim();
        if (value.isBlank()) {
            return false;
        }
        String key = extractObjectKey(value);
        if (s3Enabled) {
            deleteS3Object(key);
            return true;
        }
        return Files.deleteIfExists(resolveLocalTarget(key));
    }
/**
 * [상세 주석] resolveLocalTarget 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Path 타입 값을 반환합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Path resolveLocalTarget(String key) {
        Path target = uploadPath.resolve(key).normalize();
        if (!target.startsWith(uploadPath)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload path.");
        }
        return target;
    }
/**
 * [상세 주석] putS3Object 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void putS3Object(String key, byte[] bytes, String contentType) {
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(s3Bucket)
                            .key(key)
                            .contentType(contentType)
                            .cacheControl("public, max-age=31536000, immutable")
                            .build(),
                    RequestBody.fromBytes(bytes)
            );
        } catch (S3Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "S3 image upload failed.", ex);
        }
    }
/**
 * [상세 주석] deleteS3Object 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void deleteS3Object(String key) {
        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder()
                            .bucket(s3Bucket)
                            .key(key)
                            .build()
            );
        } catch (S3Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "S3 image delete failed.", ex);
        }
    }
/**
 * [상세 주석] getS3Object 메서드는 데이터를 조회해 화면이나 다른 서비스가 쓸 수 있는 형태로 반환합니다.
 * 한줄 요약: 필요한 데이터를 조회해 하나의 결과 또는 DTO로 반환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: StoredObject 타입 값을 반환합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private StoredObject getS3Object(String key) {
        try {
            ResponseBytes<GetObjectResponse> objectBytes = s3Client.getObjectAsBytes(
                    GetObjectRequest.builder()
                            .bucket(s3Bucket)
                            .key(key)
                            .build()
            );
            String contentType = objectBytes.response().contentType();
            return new StoredObject(
                    objectBytes.asByteArray(),
                    contentType == null || contentType.isBlank() ? contentTypeForExtension(extensionFromKey(key)) : contentType
            );
        } catch (NoSuchKeyException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Upload not found.", ex);
        } catch (S3Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "S3 image download failed.", ex);
        }
    }
/**
 * [상세 주석] toStoredUrl 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String toStoredUrl(String key) {
        if (s3Enabled && !s3PublicBaseUrl.isBlank()) {
            return s3PublicBaseUrl + "/" + key;
        }
        return "/uploads/" + key;
    }
/**
 * [상세 주석] extractObjectKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extractObjectKey(String imageUrl) {
        String value = imageUrl == null ? "" : imageUrl.trim();
        if (value.startsWith("/uploads/")) {
            return sanitizeObjectKey(value.substring("/uploads/".length()));
        }
        if (!s3PublicBaseUrl.isBlank() && value.startsWith(s3PublicBaseUrl + "/")) {
            return sanitizeObjectKey(value.substring(s3PublicBaseUrl.length() + 1));
        }
        if (s3Enabled && value.startsWith("http")) {
            try {
                URI uri = new URI(value);
                return sanitizeObjectKey(uri.getPath().replaceFirst("^/", ""));
            } catch (URISyntaxException ignored) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload URL.");
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload URL.");
    }
/**
 * [상세 주석] buildObjectKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 응답 문구나 요청 payload처럼 다음 단계에서 쓸 데이터를 조립하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String buildObjectKey(String prefix, String extension) {
        return sanitizePrefix(prefix) + "-" + UUID.randomUUID() + extension;
    }
/**
 * [상세 주석] sanitizeObjectKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * - 카테고리 문자열을 확인해 부스 유형이나 방문 추천 가능 여부를 분류합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String sanitizeObjectKey(String key) {
        String value = key == null ? "" : key.trim().replace("\\", "/");
        if (value.isBlank() || value.contains("..") || value.startsWith("/") || value.endsWith("/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload path.");
        }
        return value;
    }
/**
 * [상세 주석] validateImage 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 업로드된 파일을 받아 검증하거나 저장하는 메서드입니다.
 * 입력: 프론트가 FormData로 업로드한 파일입니다. JSON body가 아니라 multipart/form-data 흐름입니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * - 업로드된 파일의 이름, 확장자, contentType, 저장 위치를 확인한 뒤 저장소에 씁니다.
 * 조건/분기 설명:
 * - 목록이 비어 있는 경우에는 조회 결과 없음, 추천 없음, 또는 처리할 데이터 없음으로 보고 별도 흐름을 탑니다.
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 파일 업로드는 JSON.stringify가 아니라 FormData와 multipart/form-data 흐름으로 이해해야 합니다.
 */
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
/**
 * [상세 주석] normalizeContentType 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizeContentType(String contentType) {
        return contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).trim();
    }
/**
 * [상세 주석] sanitizePrefix 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String sanitizePrefix(String prefix) {
        String value = prefix == null ? "upload" : prefix.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "-");
        value = value.replaceAll("-+", "-").replaceAll("^-|-$", "");
        return value.isBlank() ? "upload" : value;
    }
/**
 * [상세 주석] sanitizeExtension 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 대상이 없거나 요청이 잘못된 경우 예외를 던져 잘못된 흐름을 즉시 중단합니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String sanitizeExtension(String extension) {
        String value = extension == null ? ".bin" : extension.toLowerCase(Locale.ROOT).trim();
        if (!value.startsWith(".")) {
            value = "." + value;
        }
        if (!value.matches("\\.[a-z0-9]{1,8}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid image extension.");
        }
        return value;
    }
/**
 * [상세 주석] extensionFromKey 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String extensionFromKey(String key) {
        int dotIndex = key == null ? -1 : key.lastIndexOf(".");
        if (dotIndex < 0) {
            return ".bin";
        }
        return sanitizeExtension(key.substring(dotIndex));
    }
/**
 * [상세 주석] contentTypeForExtension 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String contentTypeForExtension(String extension) {
        return switch (sanitizeExtension(extension)) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".webp" -> "image/webp";
            case ".gif" -> "image/gif";
            default -> "application/octet-stream";
        };
    }
/**
 * [상세 주석] normalizePublicBaseUrl 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 문자열이나 입력값을 비교하기 쉬운 형태로 정리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String normalizePublicBaseUrl(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.replaceAll("/+$", "");
    }
/**
 * [상세 주석] StoredObject 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public record StoredObject(byte[] bytes, String contentType) {
/**
 * [상세 주석] resource 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: Resource 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
public Resource resource() {
            return new org.springframework.core.io.ByteArrayResource(bytes);
        }
    }
}
