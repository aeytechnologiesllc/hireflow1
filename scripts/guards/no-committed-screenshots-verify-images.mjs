/**
 * screenshots-verify/ is generated, throwaway output from the local
 * verification scripts (scripts/app_shots.mjs, scripts/cockpit_verify.mjs,
 * scripts/ava_create_shots.mjs, scripts/ava_create_verify.mjs) and is listed
 * in .gitignore for exactly that reason. Despite that, 32 PNGs — including a
 * crashed-app error screen ("Something went wrong" / "account is not
 * defined") committed under four different names — had been force-added to
 * the repo, so anyone cloning it saw a broken app in screenshots-verify/
 * instead of nothing. Removed 2026-09-16; see docs/MIGRATION-HISTORY.md's
 * sibling cleanup for the rest of that pass.
 *
 * This guard fails if any image file is ever committed under
 * screenshots-verify/ again, whether or not it happens to be gitignored at
 * the time — `git add -f` bypasses .gitignore, which is exactly how this
 * regressed before.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

export default [
  {
    id: "no-committed-screenshots-verify-images",
    why: "screenshots-verify/ is gitignored, generated verify output — a committed image there (even via git add -f) means throwaway/stale screenshots, possibly of a crashed app, ship in the repo again.",
    async run() {
      let tracked;
      try {
        tracked = execFileSync("git", ["ls-files", "screenshots-verify/"], {
          cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".."),
          encoding: "utf8",
        });
      } catch {
        // Not a git checkout (or git unavailable) — nothing to check.
        return { ok: true };
      }
      const bad = tracked
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => IMAGE_EXTS.some((ext) => line.toLowerCase().endsWith(ext)));
      return bad.length
        ? { ok: false, detail: bad.map((f) => `${f} is committed under screenshots-verify/ — untrack it (git rm --cached) instead`) }
        : { ok: true };
    },
  },
];
