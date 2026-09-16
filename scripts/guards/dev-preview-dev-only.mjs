/**
 * The `/__preview` dev-preview harness (src/dev-preview/) must never become
 * reachable in production. Everything that pulls its fixture data or picker
 * UI into the module graph has to sit behind a statically-`false`
 * `import.meta.env.DEV` check, so Rollup's dead-code elimination drops it
 * from the shipped bundle entirely — proven by
 * scripts/dev_preview_prod_bundle.test.mjs, which actually builds and greps
 * dist/. This guard catches the cheaper, faster-feedback mistake: someone
 * removing the DEV gate from the source before that build-and-grep test ever
 * runs.
 */
export default [
  {
    id: "dev-preview-route-is-dev-gated",
    why:
      "src/App.tsx must register the /__preview route (and the DevPreview lazy import) only inside an " +
      "`import.meta.env.DEV` check — an ungated route would ship the picker and, once opened, would try " +
      "to dynamically import the fixture client on hireflownow.com.",
    run: async ({ read }) => {
      const src = (await read("src/App.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/App.tsx not found");
        return { ok: false, detail: bad };
      }
      if (!/const DevPreview = import\.meta\.env\.DEV \? lazyWithReload\(\(\) => import\("\.\/pages\/DevPreview"\)\) : DevOnlyPage;/.test(src)) {
        bad.push("src/App.tsx no longer gates the DevPreview import behind `import.meta.env.DEV ? ... : DevOnlyPage`");
      }
      const routeMatch = src.match(/\{import\.meta\.env\.DEV && <Route path="\/__preview" element=\{<DevPreview \/>\} \/>\}/);
      if (!routeMatch) {
        bad.push('src/App.tsx no longer registers <Route path="/__preview"> behind `import.meta.env.DEV &&`');
      }
      // Guard against a route added OUTSIDE any DEV check elsewhere in the file.
      const bareRoute = /<Route\s+path="\/__preview"/g;
      const allRouteMatches = [...src.matchAll(bareRoute)];
      if (allRouteMatches.length > 1) {
        bad.push("src/App.tsx registers /__preview more than once — check every occurrence is DEV-gated");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "dev-preview-bootstrap-is-dev-gated",
    why:
      "src/main.tsx must only install the fixture Supabase client (via the dynamic import of " +
      "./dev-preview/install) inside an `import.meta.env.DEV` check — that dynamic import is what actually " +
      "pulls the fixture data into a chunk, so an ungated call would ship it to production.",
    run: async ({ read }) => {
      const src = (await read("src/main.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/main.tsx not found");
        return { ok: false, detail: bad };
      }
      if (!/if \(import\.meta\.env\.DEV\) \{/.test(src)) {
        bad.push("src/main.tsx no longer has an `if (import.meta.env.DEV)` bootstrap gate");
      }
      if (!/await import\("\.\/dev-preview\/install"\)/.test(src)) {
        bad.push("src/main.tsx no longer dynamically imports ./dev-preview/install");
      }
      // The dynamic import must appear strictly inside the DEV-gate block, not
      // at module top level (which would make it unconditionally reachable).
      const devGateIdx = src.indexOf("if (import.meta.env.DEV)");
      const importIdx = src.indexOf('await import("./dev-preview/install")');
      if (devGateIdx === -1 || importIdx === -1 || importIdx < devGateIdx) {
        bad.push("the ./dev-preview/install import must come after, and inside, the `import.meta.env.DEV` gate");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "supabase-client-preview-seam-is-dev-gated",
    why:
      "__setPreviewSupabaseClient (the dev-preview dependency-injection seam in " +
      "src/integrations/supabase/client.ts) must refuse to run outside DEV, so even a stray call site " +
      "could never swap the real client for a fixture one in production.",
    run: async ({ read }) => {
      const src = (await read("src/integrations/supabase/client.ts")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/integrations/supabase/client.ts not found");
        return { ok: false, detail: bad };
      }
      const fnMatch = src.match(/export function __setPreviewSupabaseClient\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
      if (!fnMatch) {
        bad.push("__setPreviewSupabaseClient not found (or no longer a top-level exported function) in client.ts");
      } else if (!/if \(!import\.meta\.env\.DEV\) return;/.test(fnMatch[1])) {
        bad.push("__setPreviewSupabaseClient lost its `if (!import.meta.env.DEV) return;` guard");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
