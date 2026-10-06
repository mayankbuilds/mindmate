import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[MindMate ErrorBoundary caught an error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: this.props.inline ? "260px" : "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#FFFFFF",
              borderRadius: "20px",
              padding: "32px 28px",
              boxShadow: "0 10px 30px rgba(30, 42, 71, 0.08)",
              border: "1px solid #E8ECFA",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "16px",
                background: "#FEE2E2",
                color: "#EF4444",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <h2
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#1E2A47",
                margin: "0 0 8px 0",
              }}
            >
              {this.props.title || "Something interrupted this view"}
            </h2>

            <p
              style={{
                fontSize: "14px",
                color: "#6B7A99",
                lineHeight: 1.5,
                margin: "0 0 24px 0",
              }}
            >
              {this.props.message ||
                "A temporary glitch occurred while rendering. Your account and saved check-in data are safe."}
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "12px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                <RefreshCw size={16} /> Try Again
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#F3F4F6",
                  color: "#374151",
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Home size={16} /> Reload Page
              </button>
            </div>

            {process.env.NODE_ENV !== "production" && this.state.error && (
              <details
                style={{
                  marginTop: "20px",
                  textAlign: "left",
                  fontSize: "12px",
                  color: "#9CA3AF",
                  cursor: "pointer",
                }}
              >
                <summary style={{ fontWeight: 600 }}>Technical Details</summary>
                <pre
                  style={{
                    background: "#F9FAFB",
                    padding: "10px",
                    borderRadius: "8px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    marginTop: "8px",
                    color: "#DC2626",
                  }}
                >
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
