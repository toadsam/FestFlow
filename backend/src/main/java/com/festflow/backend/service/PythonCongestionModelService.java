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

@Service
public class PythonCongestionModelService {

    private static final Logger log = LoggerFactory.getLogger(PythonCongestionModelService.class);

    private final ObjectMapper objectMapper;
    private final boolean enabled;
    private final String pythonCommand;
    private final String predictScript;
    private final String modelPath;
    private final Duration timeout;

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

    public Optional<AiModelPredictionDto> predict(Map<String, Object> features, List<String> factors) {
        return predictBatch(List.of(new ModelPredictionRequest(0L, features, factors))).values().stream().findFirst();
    }

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

    private String resolveCommand(String command) {
        Path commandPath = resolvePath(command);
        if (Files.exists(commandPath)) {
            return commandPath.toString();
        }
        return command;
    }

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

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

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

    private List<String> asStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                    .map(String::valueOf)
                    .toList();
        }
        return List.of();
    }

    private static String displayLevelStable(String rawLevel) {
        return switch (String.valueOf(rawLevel).toUpperCase()) {
            case "LOW" -> "\uC5EC\uC720";
            case "NORMAL" -> "\uBCF4\uD1B5";
            case "BUSY" -> "\uD63C\uC7A1";
            case "VERY_BUSY" -> "\uB9E4\uC6B0 \uD63C\uC7A1";
            default -> String.valueOf(rawLevel);
        };
    }

    public static String displayLevel(String rawLevel) {
        return switch (String.valueOf(rawLevel).toUpperCase()) {
            case "LOW" -> "여유";
            case "NORMAL" -> "보통";
            case "BUSY" -> "혼잡";
            case "VERY_BUSY" -> "매우 혼잡";
            default -> String.valueOf(rawLevel);
        };
    }

    public record ModelPredictionRequest(
            Long id,
            Map<String, Object> features,
            List<String> factors
    ) {
    }

    private record PredictionResult(
            Long id,
            AiModelPredictionDto prediction
    ) {
    }
}
