"""
MindMate ML Training Script
Trains production student stress classification and regression models
using the clinical student psychological stress dataset (16,384 records).
"""

import json
import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import classification_report, accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "student_stress_dataset.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)


def train():
    print(f"[ML Training] Loading dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"[ML Training] Raw dataset shape: {df.shape}")

    mapping = {"No": 0, "Mild": 1, "Moderate": 2, "Severe": 3}
    for col in df.columns:
        df[col] = df[col].map(mapping)

    feature_cols = [
        "Nervousness",
        "Unable to control",
        "Worry",
        "Trouble in Relaxation",
        "Restlessness",
        "Irritability",
        "Fear",
    ]

    X = df[feature_cols]
    y = df["Stress"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y
    )

    print("[ML Training] Training Random Forest Classifier...")
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted")
    rec = recall_score(y_test, y_pred, average="weighted")
    f1 = f1_score(y_test, y_pred, average="weighted")

    print(f"[ML Training] Classifier Accuracy: {acc * 100:.2f}%")
    print(f"[ML Training] Classifier Weighted F1: {f1:.4f}")
    print("\nClassification Report:\n", classification_report(y_test, y_pred, target_names=["No Stress", "Mild", "Moderate", "Severe"]))

    print("[ML Training] Training Random Forest Regressor...")
    reg = RandomForestRegressor(
        n_estimators=100,
        max_depth=8,
        random_state=42,
        n_jobs=-1,
    )
    reg.fit(X_train, y_train)

    importances = dict(zip(feature_cols, [float(round(v, 4)) for v in clf.feature_importances_]))
    print(f"[ML Training] Feature Importances: {importances}")

    clf_path = os.path.join(MODELS_DIR, "student_stress_rfc.joblib")
    reg_path = os.path.join(MODELS_DIR, "student_stress_regressor.joblib")
    scaler_path = os.path.join(MODELS_DIR, "student_stress_scaler.joblib")
    metrics_path = os.path.join(MODELS_DIR, "model_metrics.json")

    joblib.dump(clf, clf_path)
    joblib.dump(reg, reg_path)
    joblib.dump(scaler, scaler_path)

    metrics = {
        "model_name": "RandomForest_MultiTier_Student_Stress_Predictor",
        "dataset_samples": int(df.shape[0]),
        "features": feature_cols,
        "classes": ["No Stress", "Mild Stress", "Moderate Stress", "Severe Stress"],
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "feature_importances": importances,
    }

    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"[ML Training] Saved models to {MODELS_DIR}")
    print(f"[ML Training] Saved metrics to {metrics_path}")


if __name__ == "__main__":
    train()
