/**
 * The Ava orb is retired in the product UI (the wax seal, AvaSeal, is Ava's
 * in-app mark now). Leftovers had survived in three places:
 *
 *   - AvaCreateJob.tsx and its createFlow/shared.tsx still imported/rendered
 *     `AvaGlyph`, a miniature of the retired orb (jade→brass gradient core in
 *     a dotted ring) — the AvaGlyph component itself has been deleted, so its
 *     import must never come back.
 *   - The public `/marketing-demo` route rendered the old neon logo
 *     (`src/assets/hireflow-logo.png`) on a dark background. The page and its
 *     ~8.8MB of unused `ava-*.png` cartoon/orb images have been deleted; the
 *     route now redirects to `/`.
 *
 * These guards are cheap static checks that both stay gone.
 */

export default [
  {
    id: "no-retired-avaglyph-orb-component",
    why:
      "AvaGlyph (the mini orb) and its image siblings were deleted 2026-09-16. If either the " +
      "component file or an import of it comes back, the retired orb has resurfaced in the UI.",
    run: async ({ read, sources }) => {
      const bad = [];
      if ((await read("src/components/ava/AvaGlyph.tsx")) != null) {
        bad.push("src/components/ava/AvaGlyph.tsx exists — the retired orb glyph component should stay deleted");
      }
      for (const { rel, text } of await sources([".ts", ".tsx"])) {
        if (/from\s+["']@\/components\/ava\/AvaGlyph["']/.test(text)) {
          bad.push(`${rel} imports the retired AvaGlyph component`);
        }
      }
      for (const name of [
        "ava-celebrating.png", "ava-listening.png", "ava-thinking.png",
        "ava-waving.png", "ava-empathetic.png", "ava-speaking.png",
        "ava-encouraging.png", "ava-proud.png", "ava-orb.png",
      ]) {
        if ((await read(`src/assets/${name}`)) != null) {
          bad.push(`src/assets/${name} exists — the unused orb/cartoon image should stay deleted`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "no-marketing-demo-route-or-page",
    why:
      "The old neon /marketing-demo page (dark background, hireflow-logo.png wordmark) was " +
      "retired 2026-09-16. The route must stay a redirect, never a live MarketingDemo element, " +
      "and the page file/asset must stay deleted.",
    run: async ({ read }) => {
      const bad = [];
      if ((await read("src/pages/MarketingDemo.tsx")) != null) {
        bad.push("src/pages/MarketingDemo.tsx exists — the retired marketing demo page should stay deleted");
      }
      if ((await read("src/assets/hireflow-logo.png")) != null) {
        bad.push("src/assets/hireflow-logo.png exists — the old neon wordmark should stay deleted");
      }
      const app = await read("src/App.tsx");
      if (app != null) {
        if (/<MarketingDemo\s*\/>/.test(app)) {
          bad.push("src/App.tsx renders <MarketingDemo /> — the route must redirect instead");
        }
        if (!/path="\/marketing-demo"\s+element=\{<Navigate/.test(app)) {
          bad.push('src/App.tsx does not redirect "/marketing-demo" to "/"');
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
