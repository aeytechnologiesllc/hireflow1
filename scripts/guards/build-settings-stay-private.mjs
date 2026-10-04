/**
 * Build settings stay private (2026-10-04).
 *
 * The live bundle on hireflownow.com carried the latest commit message, its
 * author, the repository and the deployment id. Vercel hands each build those
 * details as VITE_VERCEL_* variables, and Vite pastes its WHOLE settings
 * object into the public JavaScript wherever code reads import.meta.env as
 * one object. Two reads did that: the crash reporter's release tag and the
 * staff-host switch in src/lib/hosts.ts.
 *
 * Fixed in vite.config.ts, which drops the Vercel details before Vite loads
 * its settings (the commit SHA stays, crash reports use it as their release),
 * and in src/, which reads every setting by name.
 *
 * Proven by a probe build: with VITE_VERCEL_GIT_COMMIT_MESSAGE set to a marker,
 * the marker is absent from dist/ and no settings object is pasted at all.
 */

/** Code lines only: comment lines may describe the old pattern. */
function codeLines(text) {
  return text.split("\n").map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => {
    const t = line.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
}

export default [
  {
    id: "vercel-build-details-never-reach-the-bundle",
    why:
      "Vercel gives every build VITE_VERCEL_* settings (commit message, author, repository, " +
      "deployment id). vite.config.ts must drop all of them except VITE_VERCEL_GIT_COMMIT_SHA " +
      "before Vite loads its settings, or the latest commit message ships in public JavaScript.",
    run: async ({ read }) => {
      const config = await read("vite.config.ts");
      if (config == null) return { ok: false, detail: ["vite.config.ts is missing"] };
      const detail = [];
      if (!/startsWith\("VITE_VERCEL_"\)/.test(config) || !/delete process\.env\[key\]/.test(config)) {
        detail.push("vite.config.ts no longer deletes the VITE_VERCEL_* settings from process.env");
      }
      const keep = config.match(/KEEP_VERCEL_SETTINGS = new Set\(\[([^\]]*)\]\)/);
      if (!keep) {
        detail.push("vite.config.ts: KEEP_VERCEL_SETTINGS is missing");
      } else {
        const kept = [...keep[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        const extra = kept.filter((k) => k !== "VITE_VERCEL_GIT_COMMIT_SHA");
        if (extra.length) detail.push(`vite.config.ts keeps more Vercel details than the commit SHA: ${extra.join(", ")}`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "settings-are-read-by-name",
    why:
      "Reading import.meta.env as one object makes Vite paste every build setting into the " +
      "public bundle at that spot. Read each setting by name: import.meta.env.VITE_SOMETHING.",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of await walk("src", [".ts", ".tsx"])) {
        const text = await read(rel);
        if (text == null) continue;
        for (const { line, n } of codeLines(text)) {
          if (/import\.meta\.env(?!\.[A-Za-z_])/.test(line) || /import\.meta\s+as\b/.test(line)) {
            detail.push(`${rel}:${n}  reads import.meta.env as an object: ${line.trim().slice(0, 100)}`);
          }
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
