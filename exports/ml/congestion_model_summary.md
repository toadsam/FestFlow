# Congestion Model Experiment Summary

## Dataset

- File: `exports/ml/congestion_training_dataset.csv`
- Rows: 2,520
- Source: hybrid simulated dataset built from current app CSV structure and operating assumptions.
- Target labels: `LOW`, `NORMAL`, `BUSY`, `VERY_BUSY`

The simulation reflects these assumptions:

- 18:00-22:00 is the main festival peak window.
- High-popularity performances increase stage-area congestion sharply.
- Low-popularity performances or non-stage peak patterns shift demand toward night booths, food zones, and pubs.
- Stage capacity is assumed to be roughly 3,000-4,000 people.
- Reservations, check-ins, wait time, remaining stock, and GPS density influence booth congestion.

## Comparison

| Model | Accuracy | Macro F1 |
|---|---:|---:|
| Rule-based baseline | 0.7048 | 0.6779 |
| RandomForest | 0.8016 | 0.7861 |
| XGBoost | 0.8079 | 0.7827 |

## Interpretation

The rule-based baseline remains useful because it is simple and explainable. RandomForest and XGBoost improve classification performance on the simulated dataset by learning interactions between time, GPS density, wait time, reservation demand, performance popularity, and night-booth behavior.

For presentation, the safest framing is that this is an AI expansion prototype using operating-experience-based simulation data, not a validated real-world prediction model.

## Main Feature Signals

RandomForest emphasized:

- `gps_count_nearby`
- `wait_minutes`
- `reservation_count`
- `checked_in_count`
- `is_night_booth`

XGBoost emphasized:

- `gps_count_nearby`
- `event_soon`
- `reservation_count`
- `is_night_booth`
- `wait_minutes`
