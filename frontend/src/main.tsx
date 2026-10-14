import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { IngestionProvider } from "./context/IngestionContext";

// Force HTTPS in production (preserves localhost/127.0.0.1 for local development)
if (
  typeof window !== "undefined" &&
  window.location.protocol === "http:" &&
  !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
) {
  window.location.replace(
    `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IngestionProvider>
      <App />
    </IngestionProvider>
  </React.StrictMode>
);
