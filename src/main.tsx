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

async function bootstrap() {
  // Dev-preview seam: `?__preview=1` swaps the app's supabase client for an
  // offline fixture client before anything else mounts (see
  // src/dev-preview/install.ts). `import.meta.env.DEV` is statically `false`
  // in the production bundle, so this whole block — including the dynamic
  // import, which is what actually pulls the fixture data in — is dead code
  // the bundler drops. See scripts/guards/dev-preview-dev-only.mjs and
  // docs/DEV-PREVIEW.md.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("__preview") === "1") {
      const { install } = await import("./dev-preview/install");
      install(params);
    }
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();