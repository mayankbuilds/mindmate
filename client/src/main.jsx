import React from "react";
import ReactDOM from "react-dom/client";
import MindMate from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

// Global safeguard against unexpected uncaught promise rejections
window.addEventListener("unhandledrejection", (event) => {
  console.warn("[Global Unhandled Rejection Safeguard]:", event.reason);
});

window.addEventListener("error", (event) => {
  console.warn("[Global Window Error Safeguard]:", event.message);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MindMate />
    </ErrorBoundary>
  </React.StrictMode>
);
