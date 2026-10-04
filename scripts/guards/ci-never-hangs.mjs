/**
 * CI never hangs (2026-10-04).
 *
 * Every GitHub CI run sat until GitHub's 6-hour limit and was cancelled by
 * hand. scripts/dev_preview_smoke.test.mjs passed all of its checks in two
 * seconds and then never exited: it started Vite through `npx`, stopped only
 * `npx`, Vite kept running on Linux, and its open output pipe kept the test
 * alive. The job then held the runner for six hours.
 *
 * Fixed three ways: the smoke test starts Vite directly in its own process
 * group, stops the whole group and always exits; every test file in CI runs
 * under a 5-minute `timeout`; and the job itself stops after 30 minutes.
 */

export default [
  {
    id: "ci-job-and-tests-have-time-limits",
    why:
      "Without a job timeout-minutes and a per-file `timeout`, one test that never exits " +
      "holds the CI runner for GitHub's 6-hour default (every run until 2026-10-04).",
    run: async ({ read }) => {
      const ci = await read(".github/workflows/ci.yml");
      if (ci == null) return { ok: false, detail: [".github/workflows/ci.yml is missing"] };
      const detail = [];
      if (!/^\s+timeout-minutes:\s*\d+/m.test(ci)) {
        detail.push(".github/workflows/ci.yml: the checks job has no timeout-minutes");
      }
      if (!/timeout\s+(--kill-after=\S+\s+)?\d+s?\s+node "\$f"/.test(ci)) {
        detail.push('.github/workflows/ci.yml: the test loop no longer runs `timeout ... node "$f"`');
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "tests-that-start-a-server-stop-it-and-exit",
    why:
      "A test that spawns a long-running process through npx stops only npx; the real " +
      "server outlives it and keeps the test alive. Spawn the binary directly and exit explicitly.",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of await walk("scripts", [".mjs"])) {
        if (rel.startsWith("scripts/guards/") || rel === "scripts/guardrails.mjs") continue;
        const text = await read(rel);
        if (text == null || !/\bspawn\(/.test(text)) continue;
        if (/\bspawn\(\s*["']npx["']/.test(text)) {
          detail.push(`${rel}: starts a long-running process through npx`);
        }
        if (!/process\.exit\(\s*0\s*\)/.test(text)) {
          detail.push(`${rel}: starts a process but never calls process.exit(0) when it passes`);
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
