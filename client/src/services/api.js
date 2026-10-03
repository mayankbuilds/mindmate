const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const getToken = () => localStorage.getItem("mm_token");

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Something went wrong");
  }
  return data;
}

export const api = {
  // Auth
  signup: (body) => request("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  getProfile: () => request("/auth/profile"),
  updateProfile: (body) => request("/auth/profile", { method: "PUT", body: JSON.stringify(body) }),

  // Wellness
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