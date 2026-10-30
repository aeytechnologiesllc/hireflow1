/**
 * Phase 3 of docs/LAUNCH-PLAN.md, locked (2026-10-25): the look.
 *
 *   - applicant-rail-is-four-milestones: "where they are" on the applicants
 *     list and the first-hire guide is Applied → Tested → Interview → Hired
 *     (the owner chose Option C), never one dot per step again.
 *   - one-logo-mark: the jade rising line on the deep green tile (green again
 *     since 2026-10-30; brass on ink from 2026-10-25), in the icons, the app's
 *     wordmark, the loader, the start screen, the share pictures, the blog and
 *     the front page, with every icon link on the current ?v=.
 *   - landing-single-cta-pinned: one button to the sign-up tab, everywhere:
 *     "Post a job", a small stamp in the bar pinned for the whole page, and
 *     the big stamp "Post your first job, free" in the hero and again at the
 *     end (The Desk, 2026-10-30; docs/LANDING.md).
 *   - share-image-neutral-for-other-businesses: a job or careers link from any
 *     business shows the plain picture, never "remote"/"work from home".
 *   - no-jade-tokens-left: colour tokens are named for what they mean; the old
 *     colour-named tokens never come back (green itself is the owner's again
 *     since 2026-10-30).
 *   - brass-only-for-ava-score-money: the action colour and "good" are the
 *     jade; brass never becomes a button, the primary or a focus ring.
 *   - every-css-variable-is-defined: a var(--x) with no fallback names a token
 *     that exists, and the gem rail's stops are tokens in both themes (the
 *     rename left the rail asking for --gem-teal, which no longer existed).
 */

const MARK_TILE = "#0C2A21";
const MARK_LINE = "#3FCE97";
/** The brass-on-ink mark of 2026-10-25 to 2026-10-30, which must not come back as the logo. */
const OLD_MARK = /fill="#14120E"|stroke="#E0B96A"|MARK_(?:TILE|LINE) = "#(?:14120E|E0B96A)"/i;
/** The icon links' cache-buster: bump it here and everywhere when the icon changes. */
const ICON_VERSION = "8";

/** [r, g, b] 0-255 from #rgb / #rrggbb, rgb()/rgba(), or a bare "H S% L%". */
function rgbOf(value) {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(value);
  if (hex) {
    const x = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  }
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgb) return rgb.slice(1, 4).map(Number);
  // hsl(150, 60%, 40%), hsl(150 60% 40%) or a bare "150 60% 40%" token.
  const hsl = /^\s*(?:hsla?\(\s*)?(\d+(?:\.\d+)?)(?:deg)?\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%/.exec(value);
  if (hsl) {
    const [h, sat, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
  }
  return null;
}

/** Hue in degrees and chroma 0-1 (how far from grey). */
function hueChroma([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
  if (c === 0) return { hue: 0, chroma: 0 };
  let hue = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, chroma: c / 255 };
}


export default [
  {
    id: "one-logo-mark",
    why:
      "One logo everywhere (docs/LAUNCH-PLAN.md, Phase 3, task 1): the jade rising line (#3FCE97) on the deep " +
      "green tile (#0C2A21), green again since 2026-10-30 (the owner: \"I thought we'd keep it in the green\"; " +
      "it was brass on ink from 2026-10-25). scripts/make-app-icons.mjs draws every icon from it, Wordmark.tsx " +
      "and BrandLoader.tsx draw it in the app, index.html's start screen, the share pictures and the blog carry " +
      "the same drawing, and so does the front page's bar (the old ivory 'H' tile is gone). Every icon link " +
      "carries the current ?v= so no browser keeps the old icon.",
    run: async ({ read }) => {
      const detail = [];
      const icons = (await read("scripts/make-app-icons.mjs")) ?? "";
      if (!icons.includes(`const TILE = "${MARK_TILE}", LINE = "${MARK_LINE}";`)) detail.push("scripts/make-app-icons.mjs: the icon is not the jade line on the deep green tile");
      const svg = (await read("public/favicon.svg")) ?? "";
      if (!svg.includes(`fill="${MARK_TILE}"`) || !svg.includes(`stroke="${MARK_LINE}"`)) detail.push("public/favicon.svg: not regenerated from the mark (run node scripts/make-app-icons.mjs)");
      const word = (await read("src/cockpit/components/Wordmark.tsx")) ?? "";
      if (!word.includes(`const MARK_TILE = "${MARK_TILE}";`) || !word.includes(`const MARK_LINE = "${MARK_LINE}";`)) detail.push("Wordmark.tsx: the in-app mark is not the icon's colours");
      const loader = (await read("src/components/BrandLoader.tsx")) ?? "";
      if (!loader.includes(`background: ${MARK_TILE};`) || !loader.includes(`stroke="${MARK_LINE}"`)) detail.push("BrandLoader.tsx: the loading mark is not the icon's colours");
      const shell = (await read("index.html")) ?? "";
      const boot = /<div id="hf-boot"[\s\S]*?<\/svg>/.exec(shell)?.[0] ?? "";
      if (!boot.includes(`fill="${MARK_TILE}"`) || !boot.includes(`stroke="${MARK_LINE}"`)) detail.push("index.html: the start screen (#hf-boot) does not draw the mark");
      for (const file of ["scripts/make-share-images.mjs", "scripts/build-blog.mjs"]) {
        const text = (await read(file)) ?? "";
        if (!text.includes(`fill="${MARK_TILE}"`) || !text.includes(`stroke="${MARK_LINE}"`)) detail.push(`${file}: its MARK is not the icon's colours`);
      }
      const landing = (await read("public/landing.html")) ?? "";
      if (/<b>H<\/b>HireFlow/.test(landing) || !landing.includes(`stroke="${MARK_LINE}"`)) detail.push("public/landing.html: the bar does not carry the mark");
      for (const file of [
        "index.html",
        "src/cockpit/components/Wordmark.tsx",
        "src/components/BrandLoader.tsx",
        "scripts/make-app-icons.mjs",
        "scripts/make-share-images.mjs",
        "scripts/build-blog.mjs",
        "public/favicon.svg",
      ]) {
        const text = (await read(file)) ?? "";
        if (OLD_MARK.test(text)) detail.push(`${file}: the brass-on-ink mark (#E0B96A on #14120E) is back; the logo is the jade line on the deep green tile`);
      }
      const iconLink = /\/(?:favicon(?:-16|-32)?\.(?:svg|ico|png)|icon-(?:192|512)\.png|maskable-512\.png|apple-touch-icon\.png|app-icon\.png|site\.webmanifest)\?v=(\d+)/g;
      for (const file of [
        "index.html",
        "public/landing.html",
        "public/site.webmanifest",
        "scripts/build-blog.mjs",
        "public/hireflow-sw.js",
        "src/cockpit/push/PushPrompt.tsx",
      ]) {
        const text = (await read(file)) ?? "";
        const stale = [...new Set([...text.matchAll(iconLink)].filter((m) => m[1] !== ICON_VERSION).map((m) => m[0]))];
        if (stale.length) detail.push(`${file}: icon links not on ?v=${ICON_VERSION} (bump when the icon changes): ${stale.join(", ")}`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "landing-single-cta-pinned",
    why:
      "The front page has one button, to the sign-up tab, everywhere: 'Post a job', a small stamp in the bar " +
      "pinned for the whole page (id startFree), and the big stamp 'Post your first job, free' as the hero's " +
      "main button (heroStart) and again at the end, as your envelope's postage (endStart, the page's own link " +
      "moved there, never a copy, so it keeps the visitor's tags) (docs/LAUNCH-PLAN.md, Phase 3, task 3; " +
      "docs/LANDING.md, The Desk, 2026-10-30).",
    run: async ({ read }) => {
      const detail = [];
      const page = (await read("public/landing.html")) ?? "";
      if (!/\.bar \{ position: fixed;/.test(page)) detail.push("the bar is not pinned (position: fixed)");
      const ctas = page.match(/href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="(startFree|heroStart|endStart)"/g) ?? [];
      if (ctas.length !== 3) detail.push(`expected the one button in the bar, the opening and the end; found ${ctas.length}`);
      if (/Watch it again|Watch one night|Start hiring free/.test(page)) detail.push("an old second call to action is back");
      if (/sweepstake|casino|payout/i.test(page)) detail.push("sweepstakes/casino/payout wording is back on the front page");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "share-image-neutral-for-other-businesses",
    why:
      "A shared job or careers link from any business shows public/share/careers.jpg, a plain 'Now hiring. " +
      "Apply online.' picture made by scripts/make-share-images.mjs; only the owner's own business keeps " +
      "zulu-careers.jpg. It must never say remote or work from home for every business.",
    run: async ({ read }) => {
      const detail = [];
      const maker = (await read("scripts/make-share-images.mjs")) ?? "";
      const careersBlock = maker.slice(maker.indexOf("public/share/careers.jpg`"));
      if (!careersBlock || /remote|work from home/i.test(careersBlock.slice(0, 600))) detail.push("scripts/make-share-images.mjs: the careers picture says remote or work from home");
      const job = (await read("api/job-prerender.mjs")) ?? "";
      if (!/\$\{home \? "zulu-careers" : "careers"\}\.jpg/.test(job)) detail.push("api/job-prerender.mjs: a non-home business's job link must show careers.jpg");
      const shell = (await read("index.html")) ?? "";
      if (/remote jobs/i.test(shell)) detail.push("index.html: the shell's description says remote jobs for every business");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "applicant-rail-is-four-milestones",
    why:
      "The applicants list drew one dot per journey step (eleven on the owner's job; the owner: " +
      "\"I don't like how these weird dots appear\"). It is four milestones, Applied → Tested → " +
      "Interview → Hired (src/cockpit/lib/milestones.ts, MilestoneRail in ApplicantRow.tsx), on the " +
      "table row, the phone card and the first-hire guide.",
    run: async ({ read }) => {
      const detail = [];
      const lib = (await read("src/cockpit/lib/milestones.ts")) ?? "";
      if (!/export const MILESTONE_LABELS = \["Applied", "Tested", "Interview", "Hired"\] as const;/.test(lib)) {
        detail.push("src/cockpit/lib/milestones.ts: the four milestones are not Applied, Tested, Interview, Hired");
      }
      const row = (await read("src/cockpit/components/ApplicantRow.tsx")) ?? "";
      const rails = (row.match(/<MilestoneRail view=\{row\.milestones\}/g) ?? []).length;
      if (rails < 2) detail.push("ApplicantRow.tsx: the table row and the phone card must both draw <MilestoneRail view={row.milestones} />");
      if (/export function JourneyDots\b|<JourneyDots\b/.test(row)) detail.push("ApplicantRow.tsx: the per-step dot rail is back");
      const guide = (await read("src/cockpit/components/journey/GuideStages.tsx")) ?? "";
      if (/<JourneyDots\b/.test(guide) || !/<MilestoneRail /.test(guide)) detail.push("GuideStages.tsx: the first-hire guide must draw the milestones");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "no-jade-tokens-left",
    why:
      "Colour tokens are named for what they mean, not for their colour (2026-10-25: --jade → --action, " +
      "--hf-green → --hf-action, --ck-jade/mint → --ck-action/-bright, --gem-jade… → --gem-1..4, " +
      "candidate-jade.css → candidate-theme.css), so a palette can change in one place. On 2026-10-30 " +
      "the owner locked the new green again (\"it looks a lot more polished and better for the inside\"), " +
      "so a green value is allowed; an old colour-named token or Tailwind class, or the old " +
      "candidate-jade.css, coming back fails here.",
    run: async ({ read, walk }) => {
      const detail = [];
      const rels = [
        ...(await walk("src", [".ts", ".tsx", ".css"])),
        "index.html",
        "public/landing.html",
        "tailwind.config.ts",
      ];
      const tokens = /--(?:jade|hf-green|ck-jade|ck-mint|an-jade|gem-(?:jade|mint|teal|gold))\b|\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration)-(?:jade|mint)\b|candidate-jade\.css|auth-jade\b/;
      for (const rel of rels) {
        const text = (await read(rel)) ?? "";
        text.split("\n").forEach((line, i) => {
          if (tokens.test(line)) detail.push(`${rel}:${i + 1}  old colour-named token or class: ${line.trim().slice(0, 110)}`);
        });
      }
      if ((await read("src/styles/candidate-jade.css")) != null) detail.push("src/styles/candidate-jade.css is back (it is candidate-theme.css)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "brass-only-for-ava-score-money",
    why:
      "Brass is Ava's verdict, the score's seal and anything that costs money, never a plain button. " +
      "Since 2026-10-30 (the owner's new green, locked) the action colour is the jade in both themes: " +
      "--action, --primary, --ring, --ck-action and --hf-action, and \"good\" (--good, --success: a " +
      "passed test, a 70+ score, a finished step) is the same jade. The default button and the action " +
      "pill fill with the action colour and focus rings are the action colour, so brass never reads " +
      "as a plain button or as \"this will be charged\" on Pass, Hire or Save.",
    run: async ({ read }) => {
      const detail = [];
      const css = (await read("src/index.css")) ?? "";
      // The action colour and "good" are the jade, Day and Night.
      for (const name of ["action", "action-bright", "primary", "ring", "ck-action", "ck-action-bright", "hf-action", "good", "success"]) {
        const found = [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))];
        if (found.length < 2) detail.push(`src/index.css: --${name} is not set for both Day and Night`);
        for (const m of found) {
          const rgb = rgbOf(m[1]);
          const hc = rgb && hueChroma(rgb);
          if (!hc || hc.chroma < 0.15 || hc.hue < 140 || hc.hue > 175) detail.push(`src/index.css: --${name}: ${m[1].trim()} is not the jade`);
        }
      }
      const variants = (await read("src/components/ui/button-variants.ts")) ?? "";
      if (/brass|gold|amber/.test(variants)) detail.push("button-variants.ts: a button carries brass");
      const defaultButton = /default: "([^"]*)"/.exec(variants)?.[1] ?? "";
      if (!/^bg-primary text-primary-foreground/.test(defaultButton) || /brass|gold|amber/.test(defaultButton)) detail.push("button-variants.ts: the default button is not the primary (action) colour, or carries brass");
      const tailwind = (await read("tailwind.config.ts")) ?? "";
      if (!/action: \{\s*DEFAULT: "hsl\(var\(--ck-action\)\)",\s*bright: "hsl\(var\(--ck-action-bright\)\)",/.test(tailwind)) detail.push("tailwind.config.ts: bg-action / text-action-bright must map to --ck-action / --ck-action-bright");
      if (!/primary: \{\s*DEFAULT: "hsl\(var\(--primary\)\)"/.test(tailwind)) detail.push("tailwind.config.ts: primary must map to --primary");
      const motion = (await read("src/styles/motion.css")) ?? "";
      const pill = /\.hf-pill--action\.hf-pill--action\.hf-pill--action \{([^}]*)\}/.exec(motion)?.[1] ?? "";
      if (!/var\(--action\)/.test(pill) || /brass/.test(pill)) detail.push("motion.css: .hf-pill--action must fill with --action, never brass");
      const cockpit = (await read("src/cockpit/cockpit.css")) ?? "";
      const primary = /\.ck-btn-primary \{([^}]*)\}/.exec(cockpit)?.[1] ?? "";
      if (!/background: var\(--action\)/.test(primary)) detail.push("cockpit.css: .ck-btn-primary must fill with --action");
      for (const [rel, text] of [["src/cockpit/cockpit.css", cockpit], ["src/styles/motion.css", motion], ["src/index.css", css]]) {
        for (const m of text.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)) {
          if (/outline[^;]*brass|box-shadow[^;]*brass/.test(m[1])) detail.push(`${rel}: a focus ring is brass: ${m[0].replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "every-css-variable-is-defined",
    why:
      "The colour rename of 2026-10-25 left the gem rail building var(--gem-teal) and friends from its " +
      "own stop names after the tokens became --gem-1..4, so every pipeline circle lost its colour and " +
      "nothing failed. A var(--x) with no fallback must name a token defined somewhere in src (CSS, a " +
      "style object, a Tailwind [--x:…] class or setProperty), and src/cockpit/lib/gemRail.ts's stops " +
      "must each be a --gem-N token set for Day and Night in cockpit.css.",
    run: async ({ read, walk }) => {
      const detail = [];
      const defined = new Set();
      const used = new Map();
      const rels = [...(await walk("src", [".ts", ".tsx", ".css"])), "index.html", "tailwind.config.ts"];
      // A token "defined" only inside a comment is not defined (sixth review).
      const noComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`\w])\/\/[^\n]*/g, "$1");
      for (const rel of rels) {
        const text = noComments((await read(rel)) ?? "");
        for (const re of [/(?<![\w-])--([\w-]+)\s*:/g, /["'`]--([\w-]+)["'`]\s*(?:as\s+\w+\s*)?[:\]]/g, /\[--([\w-]+):/g, /setProperty\(\s*[`"']--([\w-]+)/g]) {
          for (const m of text.matchAll(re)) defined.add(m[1]);
        }
        if (rel.endsWith(".html")) continue;
        // var(--name) with nothing after the name but ")" has no fallback;
        // tailwind.config.ts counts as a reader (it backs bg-action and the rest), never a definer.
        for (const m of text.matchAll(/var\(\s*--([\w-]+)\s*\)/g)) {
          if (!used.has(m[1])) used.set(m[1], rel);
        }
      }
      for (const [name, rel] of used) {
        // --tw-* and --radix-* come from libraries; shadcn's chart sets --color-<key> from its config.
        if (/^(tw|radix|color)-/.test(name) || defined.has(name)) continue;
        detail.push(`${rel}: var(--${name}) has no fallback and --${name} is defined nowhere`);
      }
      const rail = (await read("src/cockpit/lib/gemRail.ts")) ?? "";
      const stops = /const GEM_STOPS = \[([^\]]+)\]/.exec(rail)?.[1]?.match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
      if (stops.length < 2) detail.push("gemRail.ts: GEM_STOPS not found");
      if (!/var\(--gem-\$\{b\}\)/.test(rail)) detail.push("gemRail.ts: the fill is no longer var(--gem-${stop}); update this guard with it");
      const cockpit = (await read("src/cockpit/cockpit.css")) ?? "";
      for (const stop of stops) {
        const n = (cockpit.match(new RegExp(`--gem-${stop}:`, "g")) ?? []).length;
        if (n < 2) detail.push(`cockpit.css: --gem-${stop} (a gemRail.ts stop) is set ${n} time(s); it needs Day and Night`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
