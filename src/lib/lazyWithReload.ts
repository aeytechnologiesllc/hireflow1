import { lazy } from "react";

// Recover from stale code-split chunks after a deploy: if a lazy import fails
// because the hashed chunk 404s (the app was open in the browser while a new
// version deployed), reload once to fetch fresh assets instead of white-screening
// the whole app with "Something went wrong".
export function lazyWithReload(factory: Parameters<typeof lazy>[0]) {
  return lazy(() =>
    factory()
      .then((m) => { sessionStorage.removeItem("hf-chunk-reload"); return m; })
      .catch((err) => {
        if (!sessionStorage.getItem("hf-chunk-reload")) {
          sessionStorage.setItem("hf-chunk-reload", "1");
          window.location.reload();
          return new Promise<never>(() => {}); // hang while the page reloads
        }
        throw err;
      }),
  );
}
