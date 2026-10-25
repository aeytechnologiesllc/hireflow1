import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { installCrashReporter } from "./lib/crashReporter";
import { isStaffHost } from "./lib/hosts";
import { setUpServiceWorkers } from "./lib/webPush";
import "./index.css";
import "./cockpit/cockpit.css";
import "./styles/candidate-theme.css";
import "./styles/motion.css";

// Crash alerts: window 'error' / 'unhandledrejection' (ErrorBoundary.tsx
// wires the React render-time case separately). See src/lib/crashReporter.ts.
installCrashReporter();

// index.html's title is the careers site's. On the staff host the tab (and an
// iPhone home-screen bookmark) should say whose door this is.
if (isStaffHost()) document.title = "HireFlow — Staff";

// Service workers: the only one HireFlow keeps is /hireflow-sw.js, which shows
// phone notifications (no fetch handler, no caching, so it can't interfere
// with a request). Any other service worker a browser still holds from an
// earlier build is removed, as before. After the page has loaded, so it never
// delays the app; it can't throw.
if ("serviceWorker" in navigator) {
  const setUp = () => void setUpServiceWorkers();
  if (document.readyState === "complete") setUp();
  else window.addEventListener("load", setUp, { once: true });
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