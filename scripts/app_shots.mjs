/**
 * Look at the real app — every main surface, both themes, three widths.
 *
 * Signs in through the Supabase auth API and injects the session, so no
 * password is ever typed into a form and the run is deterministic.
 *
 *   node scripts/app_shots.mjs                      # localhost:4401, all shots
 *   BASE_URL=https://hireflownow.com node scripts/app_shots.mjs
 *   node scripts/app_shots.mjs --theme dark --width 1440
 *
 * Writes PNGs to screenshots-verify/ and prints a table of console errors and
 * horizontal overflow per surface. Overflow is a real bug: the page must never
 * scroll sideways.
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE = process.env.BASE_URL || "http://localhost:4401";
const OUT = process.env.OUT_DIR || path.join(process.cwd(), "screenshots-verify");
const EMAIL = process.env.VERIFY_EMAIL || "employer.test@hireflow.dev";
const PASS = process.env.VERIFY_PASSWORD || "Hireflow123!";

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
};

const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "pane", width: 820, height: 1000 },
  { name: "phone", width: 390, height: 844 },
];

/** Employer cockpit — these are the seven tabs of the design. */
const COCKPIT = [
  ["dashboard", "/dashboard"],
  ["applicants", "/applicants"],
  ["jobs", "/jobs"],
  ["interviews", "/interviews"],
  ["messages", "/messages"],
  ["documents", "/documents"],
  ["analytics", "/analytics"],
  ["more", "/more"],
  ["settings", "/settings"],
];

/** Surfaces a signed-out visitor sees. */
const PUBLIC = [
  ["auth", "/auth"],
  ["candidate-auth", "/candidate/auth"],
  ["candidate-portal", "/candidate"],
];

async function loadEnv() {
  const raw = await readFile(path.join(process.cwd(), ".env"), "utf8").catch(() => "");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  }
}

async function signIn(context) {
  const url = process.env.VITE_SUPABASE_URL || "https://yqklrkpptnhubsnijqze.supabase.co";
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error("No Supabase key in .env — cannot sign in.");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const session = await res.json();
  if (!session.access_token) return null;

  const ref = url.replace("https://", "").split(".")[0];
  await context.addInitScript(
    ({ storageKey, session }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      );
    },
    { storageKey: `sb-${ref}-auth-token`, session }
  );
  return session;
}

async function main() {
  await loadEnv();
  await mkdir(OUT, { recursive: true });

  const onlyTheme = argOf("--theme");
  const onlyWidth = argOf("--width");
  const themes = onlyTheme ? [onlyTheme] : ["light", "dark"];
  const widths = onlyWidth ? WIDTHS.filter((w) => String(w.width) === onlyWidth) : WIDTHS;

  const browser = await chromium.launch();
  const rows = [];

  for (const theme of themes) {
    for (const vp of widths) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      // next-themes reads this before first paint.
      await context.addInitScript((t) => localStorage.setItem("theme", t), theme);
      const signedIn = await signIn(context);

      const page = await context.newPage();
      const errors = [];
      // Locally there is no Stripe key, and the app is meant to say so loudly.
      // That is the fix working, not a fault — do not count it.
      const expected = /VITE_STRIPE_PUBLISHABLE_KEY is not set/;
      const note = (t) => !expected.test(t) && errors.push(t.slice(0, 200));
      page.on("console", (m) => m.type() === "error" && note(m.text()));
      page.on("pageerror", (e) => note(`pageerror: ${String(e)}`));

      // A brand-new employer lands on the first-run welcome, which stands in front
      // of every cockpit route. Step through it the way a real person would.
      if (signedIn) {
        await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(1500);
        const skip = page.getByText(/take me to my dashboard/i).first();
        if (await skip.isVisible().catch(() => false)) {
          await skip.click().catch(() => {});
          await page.waitForTimeout(2500);
        }
      }

      const surfaces = signedIn ? [...COCKPIT, ...PUBLIC] : PUBLIC;
      for (const [name, route] of surfaces) {
        const before = errors.length;
        try {
          await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
        } catch {
          /* networkidle can time out on pages that poll; the shot still tells us */
        }
        await page.waitForTimeout(1600);

        const overflow = await page
          .evaluate(() => ({
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
            bg: getComputedStyle(document.body).backgroundColor,
          }))
          .catch(() => ({ scrollW: 0, clientW: 0, bg: "?" }));

        const file = `${name}-${theme}-${vp.width}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        rows.push({
          surface: name,
          theme,
          width: vp.width,
          overflowPx: Math.max(0, overflow.scrollW - overflow.clientW),
          bodyBg: overflow.bg,
          newErrors: errors.length - before,
          errorText: errors.slice(before),
        });
        console.log(
          `${file.padEnd(34)} overflow ${String(Math.max(0, overflow.scrollW - overflow.clientW)).padStart(4)}px  ` +
            `errors ${errors.length - before}  bg ${overflow.bg}`
        );
      }

      if (!signedIn) console.log(`  (not signed in — cockpit skipped for ${theme}/${vp.width})`);
      await context.close();
    }
  }

  await browser.close();
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(rows, null, 2));

  const bad = rows.filter((r) => r.overflowPx > 0 || r.newErrors > 0);
  console.log(
    bad.length
      ? `\n${bad.length} surface(s) with overflow or console errors — see screenshots-verify/report.json`
      : `\nAll ${rows.length} surfaces clean: no sideways scroll, no console errors.`
  );
}

main();
