package com.festflow.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.festflow.backend.dto.AiModelPredictionDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.concurrent.TimeUnit;
/**
 * [서비스 상세 주석] Java 서버에서 Python 혼잡도 모델 추론을 실행합니다.
 * 이 클래스의 핵심은 입력 feature를 JSON 파일로 만들고 ProcessBuilder로 Python 스크립트를 실행한 뒤 결과 JSON을 읽습니다.
 * 주요 관심사는 Python 모델 추론입니다.
 * 읽을 때는 필드 의존성 -> 생성자 주입 -> public 메서드 -> private 보조 메서드 순서로 보면 흐름이 가장 잘 보입니다.
 */
@Service
public class PythonCongestionModelService {
// [의존성 주석] 여러 메서드에서 같은 기준으로 쓰는 상수입니다. 기준값을 한 곳에 모아야 나중에 정책이 바뀌어도 수정 지점이 줄어듭니다.
    private static final Logger log = LoggerFactory.getLogger(PythonCongestionModelService.class);
// [의존성 주석] Java 객체와 JSON 문자열을 서로 바꾸는 도구입니다. Python 모델/외부 API 입출력에서 자주 사용됩니다.
    private final ObjectMapper objectMapper;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final boolean enabled;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String pythonCommand;
// [의존성 주석] 이 서비스 내부에서 여러 메서드가 함께 사용하는 값입니다.
private final String predictScript;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final String modelPath;
// [의존성 주석] 환경별 설정값입니다. 로컬과 배포 환경에서 값이 달라질 수 있으므로 코드에 고정하지 않습니다.
private final Duration timeout;
/**
 * [상세 주석] 생성자입니다. Spring이 이 서비스를 만들 때 필요한 Repository, 다른 Service, 설정값을 주입합니다.
 * 한줄 요약: 이 서비스가 사용할 Repository, 다른 Service, 설정값을 처음에 연결해 두는 생성자입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 값을 반환하지 않고 this 필드에 의존성을 저장합니다.
 * 처리 흐름:
 * - 생성자 파라미터로 필요한 Repository, Service, 설정값을 받습니다.
 * - 받은 값을 this.xxx 필드에 저장해서 이후 public/private 메서드에서 재사용합니다.
 * - 이 과정을 생성자 주입이라고 부르며 테스트와 유지보수에 유리합니다.
 * 조건/분기 설명:
 * - enabled 값은 기능을 실제로 사용할지 결정하는 설정값입니다. 꺼져 있으면 외부 호출이나 모델 실행을 건너뜁니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */

    public PythonCongestionModelService(
            ObjectMapper objectMapper,
            @Value("${app.ml.congestion.enabled:true}") boolean enabled,
            @Value("${app.ml.python-command:../.venv-ml/Scripts/python.exe}") String pythonCommand,
            @Value("${app.ml.congestion.predict-script:../scripts/ml/predict_congestion.py}") String predictScript,
            @Value("${app.ml.congestion.model-path:../exports/ml/models/random_forest_congestion_model.pkl}") String modelPath,
            @Value("${app.ml.congestion.timeout-ms:20000}") long timeoutMs
    ) {
        this.objectMapper = objectMapper;
        this.enabled = enabled;
        this.pythonCommand = pythonCommand;
        this.predictScript = predictScript;
        this.modelPath = modelPath;
        this.timeout = Duration.ofMillis(Math.max(1000, timeoutMs));
    }
/**
 * [상세 주석] predict 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 부스 하나의 feature를 Python 모델 예측 흐름에 태우는 간단한 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: Optional<AiModelPredictionDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public Optional<AiModelPredictionDto> predict(Map<String, Object> features, List<String> factors) {
        return predictBatch(List.of(new ModelPredictionRequest(0L, features, factors))).values().stream().findFirst();
    }
/**
 * [상세 주석] predictBatch 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 여러 부스의 feature를 Python 모델에 보내고 예측 결과를 id별로 받아오는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: Map<Long, AiModelPredictionDto>입니다. 프론트 화면이 바로 사용할 수 있게 정리된 응답 데이터입니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * - Java 내부에서 직접 모델을 계산하지 않고 Python 프로세스를 실행해 추론을 맡깁니다.
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 조건/분기 설명:
 * - enabled가 꺼져 있거나 요청 목록이 비어 있으면 모델을 실행하지 않고 빈 결과를 반환합니다.
 * - Python 스크립트와 모델 파일이 실제로 존재하는지 먼저 확인해 배포 경로 오류를 방어합니다.
 * - 요청 feature를 임시 input JSON 파일에 쓰고, ProcessBuilder로 Python 추론 스크립트를 실행합니다.
 * - timeout, 비정상 종료, 출력 파일 누락이 생기면 예외를 화면까지 퍼뜨리지 않고 빈 결과를 반환해 fallback이 가능하게 합니다.
 * - 정상 실행되면 output JSON을 읽어 booth id별 AiModelPredictionDto로 변환합니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    public Map<Long, AiModelPredictionDto> predictBatch(List<ModelPredictionRequest> requests) {
        if (!enabled) {
            return Map.of();
        }
        if (requests == null || requests.isEmpty()) {
            return Map.of();
        }

        try {
            Path script = resolvePath(predictScript);
            Path model = resolvePath(modelPath);
            if (!Files.exists(script) || !Files.exists(model)) {
                log.warn("Congestion ML model is unavailable. scriptExists={}, modelExists={}, script={}, model={}",
                        Files.exists(script), Files.exists(model), script, model);
                return Map.of();
            }

            ProcessBuilder builder = new ProcessBuilder(
                    resolveCommand(pythonCommand),
                    script.toString(),
                    "--model",
                    model.toString()
            );
            builder.directory(resolveProjectRoot().toFile());

            List<Map<String, Object>> items = requests.stream()
                    .map(request -> Map.of(
                            "id", request.id(),
                            "features", request.features()
                    ))
                    .toList();
            Path inputFile = Files.createTempFile("festflow-congestion-input-", ".json");
            Path outputFile = Files.createTempFile("festflow-congestion-output-", ".json");
            Files.writeString(inputFile, objectMapper.writeValueAsString(Map.of("items", items)), StandardCharsets.UTF_8);

            builder.command().add("--input-file");
            builder.command().add(inputFile.toString());
            builder.command().add("--output-file");
            builder.command().add(outputFile.toString());

            Process process = builder.start();

            boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.warn("Congestion ML prediction timed out after {} ms for {} items", timeout.toMillis(), requests.size());
                deleteQuietly(inputFile);
                deleteQuietly(outputFile);
                return Map.of();
            }

            String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0 || !Files.exists(outputFile)) {
                log.warn("Congestion ML prediction failed. exitCode={}, stderr={}", process.exitValue(), stderr);
                deleteQuietly(inputFile);
                deleteQuietly(outputFile);
                return Map.of();
            }

            String stdout = Files.readString(outputFile, StandardCharsets.UTF_8).trim();
            deleteQuietly(inputFile);
            deleteQuietly(outputFile);
            Map<String, Object> result = objectMapper.readValue(stdout, new TypeReference<>() {
            });
            List<?> predictions = result.get("predictions") instanceof List<?> list ? list : List.of(result);
            Map<Long, ModelPredictionRequest> requestById = requests.stream()
                    .collect(Collectors.toMap(ModelPredictionRequest::id, Function.identity(), (a, b) -> a));
            return predictions.stream()
                    .filter(item -> item instanceof Map<?, ?>)
                    .map(item -> toPrediction((Map<?, ?>) item, requestById))
                    .filter(Optional::isPresent)
                    .map(Optional::get)
                    .collect(Collectors.toMap(PredictionResult::id, PredictionResult::prediction, (a, b) -> a));
        } catch (IOException | InterruptedException | RuntimeException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Congestion ML prediction could not be completed", ex);
            return Map.of();
        }
    }
/**
 * [상세 주석] toPrediction 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: Optional<PredictionResult>입니다. 결과가 있을 수도 없을 수도 있음을 표현합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 상태값에 따라 예약, 스태프, 분실물, 매칭 요청의 다음 흐름이 달라집니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Optional<PredictionResult> toPrediction(Map<?, ?> result, Map<Long, ModelPredictionRequest> requestById) {
        Long id = asLong(result.get("id"));
        if (id == null) {
            return Optional.empty();
        }
        ModelPredictionRequest request = requestById.get(id);
        if (request == null) {
            return Optional.empty();
        }
        Object rawLevelValue = result.containsKey("predictedLevel") ? result.get("predictedLevel") : "NORMAL";
        String rawLevel = String.valueOf(rawLevelValue);
        Double confidence = asDouble(result.get("confidence"));
        Object driftStatusValue = result.containsKey("driftStatus") ? result.get("driftStatus") : "UNKNOWN";
        String driftStatus = String.valueOf(driftStatusValue);
        Double driftScore = asDouble(result.get("driftScore"));
        List<String> driftWarnings = asStringList(result.get("driftWarnings"));
        Object modelTypeValue = result.containsKey("modelType") ? result.get("modelType") : "RandomForest";
        return Optional.of(new PredictionResult(
                id,
                new AiModelPredictionDto(
                        String.valueOf(modelTypeValue),
                        rawLevel,
                        displayLevelStable(rawLevel),
                        confidence,
                        true,
                        driftStatus,
                        driftScore,
                        driftWarnings,
                        request.factors(),
                        null
                )
        ));
    }
/**
 * [상세 주석] resolveCommand 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private String resolveCommand(String command) {
        Path commandPath = resolvePath(command);
        if (Files.exists(commandPath)) {
            return commandPath.toString();
        }
        return command;
    }
/**
 * [상세 주석] resolvePath 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: Path 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Path resolvePath(String value) {
        Path path = Path.of(value);
        if (path.isAbsolute()) {
            return path.normalize();
        }
        Path userDir = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path direct = userDir.resolve(path).normalize();
        if (Files.exists(direct)) {
            return direct;
        }
        return resolveProjectRoot().resolve(path).normalize();
    }
/**
 * [상세 주석] resolveProjectRoot 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 없습니다. 내부 필드, 현재 시간, Repository 조회 결과를 사용합니다.
 * 반환: Path 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 조건/분기 설명:
 * - 대상 데이터나 파일이 실제로 있는지 먼저 확인해 없는 상태에서 다음 로직이 실행되지 않게 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Path resolveProjectRoot() {
        Path userDir = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (Files.exists(userDir.resolve("scripts/ml/predict_congestion.py"))) {
            return userDir;
        }
        Path parent = userDir.getParent();
        if (parent != null && Files.exists(parent.resolve("scripts/ml/predict_congestion.py"))) {
            return parent;
        }
        return userDir;
    }
/**
 * [상세 주석] deleteQuietly 메서드는 데이터를 삭제하거나 더 이상 유효하지 않은 상태로 바꿉니다.
 * 한줄 요약: 대상 데이터가 있는지 확인한 뒤 삭제하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 반환값은 없고 저장, 삭제, 발송, 상태 변경, SSE 발행 같은 부수 효과를 수행합니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }
/**
 * [상세 주석] asDouble 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
/**
 * [상세 주석] asLong 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 계산된 숫자 값입니다.
 * 처리 흐름:
 * - 외부 API, 파일, 모델 실행처럼 실패 가능한 작업은 try/catch로 감싸 fallback이나 로그 처리를 합니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.parseLong(text);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
/**
 * [상세 주석] asStringList 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: Entity나 내부 값을 화면/API 응답용 형태로 변환하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: List<String>입니다. 여러 결과를 모아 반환합니다.
 * 처리 흐름:
 * - stream()으로 목록을 필터링, 정렬, 변환하거나 DTO 목록으로 바꿉니다.
 * 초보자 포인트: stream 체인은 위에서 아래로 읽으면서 filter는 걸러내기, map은 변환, sorted는 정렬, toList는 결과 확정이라고 보면 됩니다.
 */
    private List<String> asStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                    .map(String::valueOf)
                    .toList();
        }
        return List.of();
    }
/**
 * [상세 주석] displayLevelStable 메서드는 public 메서드의 복잡한 계산을 나누기 위한 내부 보조 메서드입니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private static String displayLevelStable(String rawLevel) {
        return switch (String.valueOf(rawLevel).toUpperCase()) {
            case "LOW" -> "\uC5EC\uC720";
            case "NORMAL" -> "\uBCF4\uD1B5";
            case "BUSY" -> "\uD63C\uC7A1";
            case "VERY_BUSY" -> "\uB9E4\uC6B0 \uD63C\uC7A1";
            default -> String.valueOf(rawLevel);
        };
    }
/**
 * [상세 주석] displayLevel 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: 파라미터 이름과 타입을 보면 이 메서드가 어떤 id, 상태값, 문자열, 시간값을 기준으로 처리하는지 알 수 있습니다.
 * 반환: 화면 문구나 외부 API에 전달할 문자열입니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public static String displayLevel(String rawLevel) {
        return switch (String.valueOf(rawLevel).toUpperCase()) {
            case "LOW" -> "여유";
            case "NORMAL" -> "보통";
            case "BUSY" -> "혼잡";
            case "VERY_BUSY" -> "매우 혼잡";
            default -> String.valueOf(rawLevel);
        };
    }
/**
 * [상세 주석] ModelPredictionRequest 메서드는 이 서비스의 업무 흐름 중 한 부분을 처리합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: List/Map 같은 묶음 데이터가 포함됩니다. 어떤 key나 항목을 쓰는지는 메서드 내부의 stream/map 처리와 함께 보면 됩니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    public record ModelPredictionRequest(
            Long id,
            Map<String, Object> features,
            List<String> factors
    ) {
    }
/**
 * [상세 주석] PredictionResult 메서드는 AI/분석 결과나 안내 문구를 생성합니다.
 * 한줄 요약: 이 서비스 안에서 필요한 세부 업무를 처리하는 메서드입니다.
 * 입력: Controller에서 넘어온 요청 DTO가 포함됩니다. 사용자가 입력한 값이나 프론트가 보낸 payload입니다.
 * 반환: record 타입 값을 반환합니다.
 * 처리 흐름:
 * - 입력값과 내부 필드를 사용해 필요한 계산을 수행합니다.
 * - 계산 결과를 반환하거나 호출한 쪽에서 이어서 사용할 값을 만듭니다.
 * 초보자 포인트: 메서드 이름으로 목적을 먼저 잡고, 조건문은 예외/분기, return은 최종 결과라고 보고 읽으면 됩니다.
 */
    private record PredictionResult(
            Long id,
            AiModelPredictionDto prediction
    ) {
    }
}
