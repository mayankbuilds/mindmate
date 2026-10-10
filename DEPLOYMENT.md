# MindMate — Production Deployment Guide

This guide details recommended deployment strategies for MindMate, pre-flight environment configuration, step-by-step instructions for cloud platforms, and maintenance procedures.

---

## 1. Architecture Overview & Component Responsibilities

MindMate comprises three distinct runtimes plus a database:

| Component | Technology | Runtime Port | Primary Responsibility |
| :--- | :--- | :---: | :--- |
| **Frontend** | React 18 + Vite | `3000` / `5173` | User interface, dedicated assessment form, habit tracking, and trend charts. |
| **Backend Gateway** | Node.js + Express | `5000` | JWT auth, validation, rate limiting, persistence, and gateway to FastAPI. |
| **AI Inference Service** | Python 3.11 + FastAPI | `8000` | Scikit-Learn Random Forest pipeline inference and CalmFlow chat routing. |
| **Database** | MongoDB | `27017` | Persistent storage for users, questionnaire assessments, and daily check-ins. |

---

## 2. Recommended Cloud Architecture (Student Portfolio Setup)

For a free or low-cost student portfolio deployment, the most reliable and maintenance-free topology separates services across specialized managed platforms:

```
[User Browser]
      │
      ▼
[React Frontend] (Vercel / Netlify / Render Static Site)
      │
      ▼ (HTTPS requests to VITE_API_BASE_URL)
[Node.js Express Gateway] (Render Web Service)
      │                                    │
      ├──────────────────┐                 ▼
      ▼                  ▼        [MongoDB Atlas (Cloud M0)]
(Internal or HTTPS)  [SMTP / Gmail]
      ▼
[FastAPI AI Service] (Render Web Service)
      │
      ▼ (In-Memory Scikit-Learn Pipeline)
[ai-service/models/student_stress_pipeline.joblib]
```

### Why this architecture?
1. **Zero Ops Database**: MongoDB Atlas provides a managed free-tier replica set with automated monitoring and TLS.
2. **Framework Compatibility**: FastAPI requires a Python runtime with C-extensions for Scikit-Learn, NumPy, and SciPy, which cannot run inside Node.js.
3. **Model Artifact Persistence**: The model artifact is stored directly inside the repository under `ai-service/models/student_stress_pipeline.joblib` and copied into the application container during build.
4. **Resilience & Graceful Degradation**: If the AI service sleeps on free tiers, the Express gateway returns a clean HTTP 503 error without crashing the user interface or generating fake predictions.

---

## 3. Step-by-Step Cloud Deployment Instructions

### Step 1: Provision MongoDB Atlas Database
1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Sandbox** cluster (AWS or GCP, choose a region near you).
3. Under **Database Access**, create a database user (e.g., `mindmate_admin`) with a secure password.
4. Under **Network Access**, add IP `0.0.0.0/0` (Allow access from anywhere) to allow connection from cloud hosting providers.
5. Click **Connect** $\rightarrow$ **Drivers (Node.js)** and copy your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/mindmate?retryWrites=true&w=majority
   ```

---

### Step 2: Deploy the FastAPI AI Microservice (Render)
1. In the [Render Dashboard](https://dashboard.render.com/), click **New** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Name**: `mindmate-ai-service`
   - **Root Directory**: `ai-service`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set Environment Variables:
   - `PORT`: `8000` (or leave default, Render sets `$PORT`)
   - `AI_PROVIDER`: `groq` (or `gemini`)
   - `AI_API_KEY`: `<your_api_key>` (optional, for CalmFlow chatbot)
   - `ALLOWED_ORIGINS`: Comma-separated list of origins (or `*`)
5. Deploy the service and note its public URL: `https://mindmate-ai-service.onrender.com`.
6. Test health: visit `https://mindmate-ai-service.onrender.com/health` in your browser. It should return:
   ```json
   {
     "status": "healthy",
     "provider": "groq",
     "model": "qwen-2.5-32b",
     "ml_inference_ready": true
   }
   ```

---

### Step 3: Deploy the Node.js Express Gateway (Render)
1. Click **New** $\rightarrow$ **Web Service**.
2. Connect your repository.
3. Configure settings:
   - **Name**: `mindmate-api-gateway`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `MONGO_URI`: `<your_mongodb_atlas_connection_string>`
   - `JWT_SECRET`: `<generate_a_secure_random_64_character_string>`
   - `JWT_EXPIRES_IN`: `7d`
   - `FASTAPI_SERVICE_URL`: `https://mindmate-ai-service.onrender.com`
   - `CORS_ORIGIN`: `https://your-frontend-domain.vercel.app` (update once frontend is deployed)
5. Deploy the service and test health:
   Visit `https://mindmate-api-gateway.onrender.com/health`.
   It should return:
   ```json
   {
     "status": "healthy",
     "gateway": "active",
     "database": "connected",
     "fastapi_service_url": "https://mindmate-ai-service.onrender.com"
   }
   ```

---

### Step 4: Deploy the React Frontend (Vercel or Netlify)
1. Log in to [Vercel](https://vercel.com/) and import your repository.
2. Configure project settings:
   - **Root Directory**: `client`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://mindmate-api-gateway.onrender.com/api`
4. Click **Deploy**.
5. Once assigned a domain (e.g. `https://mindmate.vercel.app`), return to your Render Express service and update `CORS_ORIGIN` to match your Vercel URL.

---

## 4. Local & VPS Deployment via Docker Compose

To run the complete production stack on any server or local development machine with Docker installed:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/MindMate.git
cd MindMate

# 2. Build and start all 4 services in the background
docker compose up -d --build

# 3. Check container statuses
docker compose ps
```

All four containers will start:
- `mindmate-client`: Accessible at [http://localhost:3000](http://localhost:3000) (Nginx reverse proxy)
- `mindmate-server`: Accessible at [http://localhost:5000](http://localhost:5000)
- `mindmate-ai`: Accessible at [http://localhost:8000](http://localhost:8000)
- `mindmate-mongo`: Accessible at `localhost:27017`

To stop the containers:
```bash
docker compose down
```

---

## 5. Security & Production Checklist

Before sharing your public URL, ensure all items are verified:

- [x] **No Hardcoded Secrets**: Secrets and database URIs are provided exclusively via environment variables.
- [x] **Rate Limiting Active**:
  - `/api/auth/login` & `/api/auth/signup`: Limited to 20 requests per 15 minutes.
  - `/api/assessment/predict`: Limited to 30 requests per minute.
  - General API: Limited to 300 requests per 15 minutes.
- [x] **CORS Scoped**: In production, CORS restricts browser requests to your verified frontend domain.
- [x] **Safe Error Messages**: In production (`NODE_ENV=production`), stack traces are stripped from API error responses.
- [x] **Zero Fallback Inventions**: If the ML service is unreachable, the system returns HTTP 503 and logs the failure rather than inventing synthetic predictions.
- [x] **Cross-User Isolation**: MongoDB queries enforce user ownership (`userId: req.user._id`), preventing cross-user record inspection.
- [x] **Model Artifact Integrity**: `ai-service/models/student_stress_pipeline.joblib` exists in version control and is loaded into memory without retraining.

---

## 6. Known Platform Quirks & Cold-Start Considerations

1. **Free Tier Sleep (Render / Koyeb)**:
   Free tier services spin down after 15 minutes of inactivity. When a user opens the app after inactivity, the first ML assessment request may take 30–50 seconds while the Python container boots up. Subsequent requests respond in $< 100\text{ ms}$.
2. **Email Alerts (SMTP)**:
   If using Gmail for emergency alerts, generate an **App Password** from Google Account Settings $\rightarrow$ Security $\rightarrow$ 2-Step Verification $\rightarrow$ App Passwords. Standard Google passwords will fail authentication.
