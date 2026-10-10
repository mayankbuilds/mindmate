const getBaseUrl = () =>
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
  "http://localhost:5000/api";

const getToken = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("mm_token") : null;
  } catch (_) {
    return null;
  }
};

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers,
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.message || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  signup: (body) => request("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  getProfile: () => request("/auth/profile"),
  updateProfile: (body) => request("/auth/profile", { method: "PUT", body: JSON.stringify(body) }),

  // Flow A: ML Stress Assessment (Random Forest 7-feature classifier)
  predictAssessment: (body) =>
    request("/assessment/predict", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAssessmentHistory: () => request("/assessment/history"),

  // Flow B: Daily Lifestyle Habit Tracking & Heuristic Balance
  checkin: (body) => request("/wellness/checkin", { method: "POST", body: JSON.stringify(body) }),
  getToday: () => request("/wellness/today"),
  getHistory: () => request("/wellness/history"),

  // Emergency Contacts & SOS
  getContacts: () => request("/contacts"),
  addContact: (body) => request("/contacts", { method: "POST", body: JSON.stringify(body) }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: "DELETE" }),
  triggerSos: (contactIds) => request("/contacts/alert", { method: "POST", body: JSON.stringify({ contactIds }) }),

  // AI Chat (Node -> FastAPI -> Groq/Qwen)
  sendMessage: (messages, context) =>
    request("/chat/message", {
      method: "POST",
      body: JSON.stringify({ messages, context }),
    }),
};