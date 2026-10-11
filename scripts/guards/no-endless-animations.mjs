/**
 * Every motion plays and stops.
 *
 * What happened: endless CSS animations on an open page kept the owner's Mac
 * working for as long as the page stayed open (the rule since 2026-10-09:
 * "every motion plays and stops"). The 2026-10-11 sweep still found loops on
 * every staff page (the background drift), on the Dashboard (the seal and
 * the ticker), on the careers page, on sign-in, on "New job" (the hero glow
 * and the journey rail) and in the sidebar applicants and team members see.
 * Each now plays a few times and stops.
 *
 * So nothing in a stylesheet, the Tailwind config, or an inline animation in
 * a component may say `infinite`, except the places below, each of which is
 * on screen only while something is loading. (Tailwind's own animate-spin,
 * animate-pulse and animate-bounce are used for spinners, skeletons and the
 * "typing…" dots, which also go away when the wait is over.)
 */

/** Where a loop is allowed, which loop, and why. */
const ALLOWED = {
  "src/styles/careers.css": { names: ["cr-shimmer"], why: "the loading skeleton, gone once the jobs arrive" },
  "src/components/BrandLoader.tsx": { names: ["hf-rise-draw", "hf-name-breathe"], why: "the loading screen, gone once the page arrives" },
};

/** Old Vite starter stylesheet: allowed only while nothing imports it. */
const UNUSED_STYLESHEET = "src/App.css";

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function loopsIn(text) {
  const found = [];
  for (const line of withoutComments(text).split("\n")) {
    if (!/\binfinite\b/.test(line)) continue;
    if (!/animation|iteration/i.test(line) && !/^\s*["'][\w-]+["']\s*:/.test(line)) continue;
    const named = line.match(/animation(?:-name)?\s*:\s*([\w-]+)/) || line.match(/["']([\w-]+)\s+[\d.]+m?s/);
    found.push({ line: line.trim(), name: named ? named[1] : null });
  }
  return found;
}

export default [
  {
    id: "no-endless-animations",
    why: "An animation that never stops keeps the viewer's computer busy for as long as the page is open.",
    run: async ({ read, walk, sources }) => {
      const detail = [];
      const files = [
        ...(await walk("src", [".css"])),
        ...(await walk("src", [".tsx", ".ts"])),
        "tailwind.config.ts",
        "index.html",
        "public/landing.html",
      ];
      for (const rel of [...new Set(files)]) {
        if (rel === UNUSED_STYLESHEET) continue;
        const text = await read(rel);
        if (text == null) continue;
        const allowed = ALLOWED[rel]?.names ?? [];
        for (const loop of loopsIn(text)) {
          if (loop.name && allowed.includes(loop.name)) continue;
          detail.push(`${rel}: "${loop.line.slice(0, 120)}" loops forever. Give it a count (e.g. 3) and, if its end state matters, "forwards".`);
        }
      }
      // Each allowed loop still exists, so the list never outlives the code.
      for (const [rel, { names }] of Object.entries(ALLOWED)) {
        const text = (await read(rel)) ?? "";
        for (const name of names) {
          if (!new RegExp(`${name}[^;\\n]*infinite`).test(text)) detail.push(`${rel}: the allowed loop "${name}" is gone; take it off ALLOWED in this guard.`);
        }
      }
      const importsAppCss = (await sources([".ts", ".tsx"])).filter((f) => /["'][./]*App\.css["']/.test(f.text));
      for (const f of importsAppCss) detail.push(`${f.rel} imports ${UNUSED_STYLESHEET}, whose logo spins forever.`);
      return { ok: detail.length === 0, detail };
    },
  },
];
