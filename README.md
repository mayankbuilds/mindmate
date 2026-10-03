# 🧠 MindMate — AI-Driven Student Stress Prediction & Mental Wellness Platform

[![React](https://img.shields.io/badge/Frontend-React%20%7C%20Vite-61DAFB?logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/AI%20Microservice-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Express](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-339933?logo=node.js)](https://expressjs.com/)
[![Scikit-Learn](https://img.shields.io/badge/Machine%20Learning-Scikit--Learn-F7931E?logo=scikitlearn)](https://scikit-learn.org/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB%20Mongoose-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/DevOps-Docker%20Compose-2496ED?logo=docker)](https://www.docker.com/)

---

## 📌 Executive Summary

**MindMate** is an end-to-end, production-grade mental health and academic wellness ecosystem designed specifically for university students. It combines **supervised machine learning algorithms** trained on clinical student cohorts (16,384 records) with a **conversational GenAI companion** (Qwen 2.5 via Groq/OpenAI architecture) and an **automated campus/parent emergency escalation system**.

Students track their academic habits (sleep, study hours, screen exposure, exam proximity) and clinical anxiety markers (GAD-7 scale). The platform predicts stress levels in real time, provides personalized coping exercises, alerts emergency contacts if high stress persists across multiple days, and offers immediate crisis hotline support.

---

## 🔬 Machine Learning & AI Engineering

### 1. Dataset & Clinical Formulation
* **Cohort Size**: 16,384 validated student psychological and behavioral records.
* **Clinical Standard**: Generalized Anxiety Disorder assessment framework (GAD-7) evaluating 7 core dimensions:
  1. `Nervousness`: Persistent anxiety, nervousness, or being on edge.
  2. `Unable to Control`: Difficulty stopping or managing worry loops.
  3. `Excessive Worry`: Generalized multi-domain worrying.
  4. `Trouble in Relaxation`: Muscle tension and somatic restlessness.
  5. `Restlessness`: Inability to sit still.
  6. `Irritability`: Affective reactivity and annoyance.
  7. `Fear`: Impending dread or catastrophe cognition.

### 2. Model Training & Evaluation Metrics
* **Classifier**: Balanced Random Forest Ensemble (`n_estimators=120`, `max_depth=10`, `class_weight='balanced'`).
* **Regressor**: Random Forest Regressor for fine-grained 0–100 severity index estimation.
* **Cross-Validation Results**:
  * **Overall Accuracy**: **85.20%**
  * **Weighted F1-Score**: **85.72%**
  * **Severe Stress Recall**: **78%** *(Optimized with balanced weighting to prevent clinical false negatives)*

| Stress Tier | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
| **No Stress** | 0.46 | 0.72 | 0.56 | 65 |
| **Mild Stress** | 0.90 | 0.89 | 0.89 | 1,574 |
| **Moderate Stress** | 0.89 | 0.83 | 0.86 | 1,491 |
| **Severe Stress** | 0.49 | 0.78 | 0.60 | 147 |

---

## 🌟 Key Application Features

1. **Daily Check-In & Real-Time ML Classification**:
   * Interactive sliders for daily sleep, study, screen time, and exam countdown.
   * Expandable clinical GAD-7 screening.
   * Immediate stress scoring with contributing risk factor breakdown.
2. **Personalized Coping Interventions**:
   * Guided 2-minute box breathing exercise with animated visual pacing.
   * 10-minute walk reminders, 20-20-20 screen rest routine, sleep hygiene rituals, and 25-minute Pomodoro focus timer.
3. **Empathetic AI Companion**:
   * Grounded conversational support using **Qwen 2.5** (via Groq API / local Ollama).
   * Injects daily student context (stress tier, sleep hours, exam proximity) into conversation system prompts.
   * Embedded crisis triage safety guardrail detecting self-harm thoughts with immediate hotline intervention.
4. **Automated Emergency SOS & 3-Day High Stress Alerts**:
   * Users configure trusted contacts (parents, friends, college counselors).
   * One-tap manual SOS dispatch via email.
   * Automated watchdog: Triggers warning emails if student maintains 'High Stress' for 3 consecutive days.
5. **Interactive 7-Day Trend Visualizations**:
   * Area and multi-bar Recharts tracking sleep vs. study vs. screen exposure vs. stress trajectories.

---

## 🚀 Quick Start Guide

### Option A: 1-Command Startup via Docker
```bash
docker compose up --build
```
* Frontend Portal: http://localhost:3000
* Node.js Gateway API: http://localhost:5000
* FastAPI AI Engine: http://localhost:8000/docs
* MongoDB: localhost:27017

### Option B: Local Development
1. **AI Microservice**:
   ```bash
   cd ai-service
   source .venv/bin/activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
2. **Backend API Gateway**:
   ```bash
   cd server
   npm start
   ```
3. **Frontend Client**:
   ```bash
   cd client
   npm run dev
   ```
   Access UI at http://localhost:5173

---

## 💼 Resume Bullet Points

* **MindMate — AI-Driven Student Stress Prediction & Mental Wellness Ecosystem**
  * *Engineered an end-to-end multi-tiered mental wellness platform using React, FastAPI, Node.js, and MongoDB, predicting student academic stress with **85.2% accuracy**.*
  * *Trained and optimized a **Balanced Random Forest Classifier** (120 decision trees) across 16,384 clinical records (GAD-7 framework), yielding an **85.7% weighted F1-score** with high recall on severe distress.*
  * *Integrated **Qwen 2.5 / Groq LLM** with dynamic context-injection (sleep metrics, exam deadlines, stress tier) and automated safety triage for self-harm detection and crisis escalation.*
  * *Architected automated emergency notification pipeline using Nodemailer and MongoDB to trigger multi-contact alerts during consecutive 3-day high-stress streaks.*
  * *Containerized the full stack with **Docker Compose** and deployed a high-availability microservice architecture with automated CI/CD and interactive Recharts data visualization.*
