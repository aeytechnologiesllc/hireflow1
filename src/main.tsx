import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { installCrashReporter } from "./lib/crashReporter";
import "./index.css";
import "./cockpit/cockpit.css";
import "./styles/candidate-jade.css";
import "./styles/motion.css";

// Crash alerts: window 'error' / 'unhandledrejection' (ErrorBoundary.tsx
// wires the React render-time case separately). See src/lib/crashReporter.ts.
installCrashReporter();

// Unregister any cached service workers that might interfere with fetch requests
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      registration.unregister();
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);