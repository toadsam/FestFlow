from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd


DEFAULT_MODEL_PATH = Path("exports/ml/models/random_forest_congestion_model.pkl")


def read_payload(input_arg: str | None, input_file: Path | None) -> dict:
    if input_arg:
        return json.loads(input_arg)
    if input_file:
        return json.loads(input_file.read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("No prediction input JSON was provided.")
    return json.loads(raw)


def normalize_row(payload: dict, features: list[str]) -> dict:
    row = payload.get("features", payload)
    return {feature: row.get(feature, 0) for feature in features}


def predict_one(pipeline, model_payload: dict, row: dict) -> dict:
    frame = pd.DataFrame([row], columns=model_payload["features"])
    prediction = str(pipeline.predict(frame)[0])

    confidence = None
    probabilities = {}
    if hasattr(pipeline, "predict_proba"):
        classes = [str(item) for item in pipeline.classes_]
        values = pipeline.predict_proba(frame)[0]
        probabilities = {label: round(float(value), 4) for label, value in zip(classes, values)}
        confidence = max(probabilities.values()) if probabilities else None

    return {
        "modelType": model_payload.get("model_type", "RandomForest"),
        "predictedLevel": prediction,
        "confidence": confidence,
        "probabilities": probabilities,
    }


def predict_many(pipeline, model_payload: dict, items: list[dict]) -> list[dict]:
    features = model_payload["features"]
    rows = [normalize_row(item, features) for item in items]
    frame = pd.DataFrame(rows, columns=features)
    predictions = [str(value) for value in pipeline.predict(frame)]

    probabilities_by_row = []
    if hasattr(pipeline, "predict_proba"):
        classes = [str(item) for item in pipeline.classes_]
        probability_matrix = pipeline.predict_proba(frame)
        probabilities_by_row = [
            {label: round(float(value), 4) for label, value in zip(classes, row)}
            for row in probability_matrix
        ]

    results = []
    for index, item in enumerate(items):
        probabilities = probabilities_by_row[index] if probabilities_by_row else {}
        results.append({
            "predictedLevel": predictions[index],
            "confidence": max(probabilities.values()) if probabilities else None,
            "id": item.get("id"),
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict FestFlow congestion with the saved RandomForest model.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--input-json", default=None)
    parser.add_argument("--input-file", type=Path, default=None)
    parser.add_argument("--output-file", type=Path, default=None)
    args = parser.parse_args()

    model_payload = joblib.load(args.model)
    features = model_payload["features"]
    pipeline = model_payload["pipeline"]

    payload = read_payload(args.input_json, args.input_file)
    if isinstance(payload.get("items"), list):
        result = {
            "predictions": predict_many(pipeline, model_payload, payload["items"]),
        }
    else:
        result = predict_one(pipeline, model_payload, normalize_row(payload, features))
        result["modelPath"] = str(args.model)
    output = json.dumps(result, ensure_ascii=False)
    if args.output_file:
        args.output_file.parent.mkdir(parents=True, exist_ok=True)
        args.output_file.write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
