/**
 * A2/L1: stored XSS in job/company content, and known-vulnerable jspdf.
 *
 * Root cause: renderFormattedText() in src/lib/formatText.tsx rendered
 * TipTap HTML straight into the DOM with dangerouslySetInnerHTML and no
 * sanitizing. A coworker opening /jobs/edit/:id (src/pages/CreateJob.tsx)
 * ran whatever script tag was hiding in a job description. jspdf ^3.0.4 also
 * carried published critical advisories (PDF/JS injection, path traversal).
 *
 * Fixed by sanitizing with DOMPurify before every dangerouslySetInnerHTML
 * (chart.tsx is the sole, reviewed exception — it only ever injects
 * generated CSS, never user content) and upgrading jspdf to 4.2.1+.
 */
export default [
  {
    id: "dangerously-set-inner-html-is-sanitized",
    why:
      "dangerouslySetInnerHTML must only ever receive a DOMPurify-sanitized value — " +
      "an unsanitized one lets a hidden <script> in a job/company/message field run for " +
      "the next person who views it (src/lib/formatText.tsx was exactly this bug).",
    run: async ({ sources }) => {
      const bad = [];
      for (const { rel, text } of await sources([".tsx", ".ts"])) {
        if (rel.endsWith("chart.tsx")) continue; // reviewed exception: generated CSS only, never user content
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (!/dangerouslySetInnerHTML\s*=/.test(line)) return; // skip comments/prose mentions, match the JSX attribute only
          // Look at this line plus a couple after it for the __html value —
          // dangerouslySetInnerHTML={{ __html: ... }} is sometimes wrapped.
          const window = lines.slice(i, i + 4).join("\n");
          const m = /__html:\s*([^}]+)}/.exec(window);
          const value = (m ? m[1] : window).trim();
          if (/DOMPurify\.sanitize\(/.test(value)) return; // sanitized inline
          // Or sanitized inside a local helper the value calls, e.g.
          // dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(text) }} where
          // sanitizeJobHtml's body calls DOMPurify.sanitize(...).
          const call = /^([A-Za-z_$][\w$]*)\(/.exec(value);
          if (call) {
            const fnName = call[1];
            const fnBody = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(text);
            if (fnBody && /DOMPurify\.sanitize\(/.test(fnBody[1])) return;
          }
          bad.push(`${rel}:${i + 1} — dangerouslySetInnerHTML without a DOMPurify.sanitize(...) value (directly or via a local sanitize helper)`);
        });
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "job-html-sanitizer-keeps-an-allow-list",
    why:
      "A default-config DOMPurify.sanitize(text) with no allow-list is easy to regress into " +
      "(git show 4ac236d did exactly that on an abandoned branch) — it still strips script tags, " +
      "but formatText.tsx needs an explicit ALLOWED_TAGS/ALLOWED_ATTR config so on* handlers and " +
      "javascript:/data: URLs on kept tags (e.g. <a href>) stay blocked too.",
    run: async ({ read }) => {
      const src = (await read("src/lib/formatText.tsx")) ?? "";
      const bad = [];
      if (!/import DOMPurify/.test(src)) bad.push("formatText.tsx no longer imports dompurify");
      if (!/DOMPurify\.sanitize\(/.test(src)) bad.push("formatText.tsx no longer calls DOMPurify.sanitize()");
      if (!/ALLOWED_TAGS/.test(src)) bad.push("formatText.tsx sanitize config dropped its ALLOWED_TAGS allow-list");
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "jspdf-is-patched",
    why:
      "jspdf ^3.0.4 has published critical advisories (PDF/JS injection via AcroForm, path " +
      "traversal). package.json must pin 4.2.1 or newer so npm never resolves back to a broken 3.x/4.0-4.2.0.",
    run: async ({ read }) => {
      const pkg = JSON.parse((await read("package.json")) || "{}");
      const range = pkg.dependencies?.jspdf ?? pkg.devDependencies?.jspdf;
      if (!range) return { ok: false, detail: ["package.json no longer depends on jspdf"] };
      const m = /(\d+)\.(\d+)\.(\d+)/.exec(range);
      if (!m) return { ok: false, detail: [`jspdf version "${range}" is not a plain semver — can't confirm it's patched`] };
      const [, major, minor, patch] = m.map(Number);
      const atLeast421 = major > 4 || (major === 4 && (minor > 2 || (minor === 2 && patch >= 1)));
      if (!atLeast421) {
        return { ok: false, detail: [`package.json jspdf is "${range}" — needs to be 4.2.1 or newer to clear the critical advisories`] };
      }
      return { ok: true };
    },
  },
];
