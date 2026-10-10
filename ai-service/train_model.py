"""
MindMate ML Training & Evaluation Script
Trains and evaluates a leak-free scikit-learn Pipeline (StandardScaler + RandomForestClassifier)
on the student stress dataset (16,384 full-factorial combinations of 7 survey features).
"""

import json
import os
import joblib
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import classification_report, accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "student_stress_dataset.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

FEATURE_COLS = [
    "Nervousness",
    "Unable to control",
    "Worry",
    "Trouble in Relaxation",
    "Restlessness",
    "Irritability",
    "Fear",
]

TARGET_CLASSES = ["No", "Mild", "Moderate", "Severe"]
CATEGORY_MAPPING = {"No": 0, "Mild": 1, "Moderate": 2, "Severe": 3}


def train():
    print(f"[ML Training] Loading dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"[ML Training] Raw dataset shape: {df.shape}")

    # Map categories to integer encoding (0-3)
    encoded_df = df.copy()
    for col in encoded_df.columns:
        encoded_df[col] = encoded_df[col].map(CATEGORY_MAPPING)

    X = encoded_df[FEATURE_COLS]
    y = encoded_df["Stress"]

    # CRITICAL: Split RAW data FIRST to prevent any data leakage
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"[ML Training] Train samples: {len(X_train)}, Test samples: {len(X_test)} (Stratified 80/20)")

    # Construct unified scikit-learn Pipeline
    print("[ML Training] Building unified Pipeline (StandardScaler + RandomForestClassifier)...")
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", clf),
    ])

    # Fit pipeline strictly on training data
    pipeline.fit(X_train, y_train)

    # Evaluate on unseen holdout test split
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)

    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
    rec = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

    report_dict = classification_report(
        y_test, y_pred, target_names=TARGET_CLASSES, output_dict=True, zero_division=0
    )
    print(f"[ML Training] Test Accuracy: {acc * 100:.2f}%")
    print(f"[ML Training] Test Weighted F1: {f1:.4f}")
    print("\nClassification Report:\n", classification_report(y_test, y_pred, target_names=TARGET_CLASSES, zero_division=0))

    # Optional Regressor pipeline for continuous severity prediction
    reg_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("regressor", RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            random_state=42,
            n_jobs=-1,
        )),
    ])
    reg_pipeline.fit(X_train, y_train)

    # Feature importances from the classifier
    importances = dict(zip(FEATURE_COLS, [float(round(v, 4)) for v in clf.feature_importances_]))
    print(f"[ML Training] Feature Importances: {importances}")

    # Save artifacts
    pipeline_path = os.path.join(MODELS_DIR, "student_stress_pipeline.joblib")
    clf_path = os.path.join(MODELS_DIR, "student_stress_rfc.joblib")
    reg_path = os.path.join(MODELS_DIR, "student_stress_regressor.joblib")
    scaler_path = os.path.join(MODELS_DIR, "student_stress_scaler.joblib")
    metrics_path = os.path.join(MODELS_DIR, "model_metrics.json")

    # Save single unified pipeline (recommended)
    joblib.dump(pipeline, pipeline_path)
    # Save individual components for backward compatibility
    joblib.dump(pipeline.named_steps["classifier"], clf_path)
    joblib.dump(pipeline.named_steps["scaler"], scaler_path)
    joblib.dump(reg_pipeline.named_steps["regressor"], reg_path)

    metrics = {
        "model_name": "RandomForest_MultiTier_Student_Stress_Predictor",
        "pipeline_artifact": "student_stress_pipeline.joblib",
        "dataset_samples": int(df.shape[0]),
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "features": FEATURE_COLS,
        "classes": TARGET_CLASSES,
        "encoding": CATEGORY_MAPPING,
        "evaluation_split": "80/20 stratified holdout (StandardScaler fitted strictly on training data)",
        "accuracy": round(acc, 4),
        "precision_weighted": round(prec, 4),
        "recall_weighted": round(rec, 4),
        "f1_weighted": round(f1, 4),
        "classification_report": report_dict,
        "feature_importances": importances,
        "dataset_provenance": "Synthetic full-factorial grid (4^7 = 16,384 combinations)",
        "disclaimer": "Metrics evaluate the Random Forest's ability to approximate the dataset threshold cutoffs on holdout combinations. They do not demonstrate real-world clinical or psychiatric diagnostic validity."
    }

    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"[ML Training] Successfully saved unified pipeline to: {pipeline_path}")
    print(f"[ML Training] Successfully saved evaluation metrics to: {metrics_path}")
    return metrics


if __name__ == "__main__":
    train()
