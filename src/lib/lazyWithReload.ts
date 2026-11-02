import { lazy } from "react";
import { reloadForLoadFailure } from "./loadRecovery";

// Recover from stale code-split chunks after a deploy: if a lazy import fails
// because the hashed chunk 404s (the app was open in the browser while a new
// version deployed), reload to fetch fresh assets instead of white-screening
// the whole app with "Something went wrong". On a connection that keeps
// dropping this can happen more than once a visit, so it is once a minute at
// most (lib/loadRecovery.ts), not once a session as it was until 2026-11-02.
export function lazyWithReload(factory: Parameters<typeof lazy>[0]) {
  return lazy(() =>
    factory().catch((err) => {
      if (reloadForLoadFailure()) return new Promise<never>(() => {}); // hang while the page reloads
      throw err;
    }),
  );
}
