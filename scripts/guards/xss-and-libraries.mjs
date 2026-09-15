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
  {
    id: "formatText-allow-list-matches-spec",
    why:
      "TipTap's StarterKit (Bold/Italic/BulletList only, per src/components/ui/rich-textarea.tsx) " +
      "never emits <span> or a class attribute — allowing either lets a stored job description " +
      "attach the app's own compiled Tailwind classes (position:fixed, inset-0, z-50, ...) to build " +
      "a full-page phishing overlay that survives the sanitizer untouched.",
    run: async ({ read }) => {
      const src = (await read("src/lib/formatText.tsx")) ?? "";
      const m = /ALLOWED_TAGS:\s*\[([\s\S]*?)\]/.exec(src);
      const a = /ALLOWED_ATTR:\s*\[([\s\S]*?)\]/.exec(src);
      const bad = [];
      if (m && /["']span["']/.test(m[1])) bad.push('formatText.tsx ALLOWED_TAGS reintroduced "span"');
      if (a && /["']class["']/.test(a[1])) bad.push('formatText.tsx ALLOWED_ATTR reintroduced "class"');
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "feed-href-attribute-cannot-break-out",
    why:
      "api/job-feed.mjs rebuilds <a href=\"...\"> for the public jobs.xml/adzuna.xml/jooble.xml feeds " +
      "from an href captured out of raw job-description HTML (single- or double-quoted). If the " +
      "escaper used on that value doesn't also escape a literal double-quote, an href like " +
      "https://x.com\" onclick=\"alert(1) breaks out of the attribute and wires a live event handler " +
      "straight into the feed.",
    run: async ({ read }) => {
      const src = (await read("api/job-feed.mjs")) ?? "";
      const m = /function escapeHtml\(s\) \{([\s\S]*?)\n\}/.exec(src);
      if (!m) return { ok: false, detail: ["api/job-feed.mjs: escapeHtml() not found"] };
      if (!/"/.test(m[1]) || !/replace\(\/"/.test(m[1])) {
        return { ok: false, detail: ["api/job-feed.mjs escapeHtml() no longer escapes a literal double-quote — href attribute breakout regressed"] };
      }
      return { ok: true };
    },
  },
  {
    id: "prerender-plain-text-not-run-through-tag-stripper",
    why:
      "api/job-prerender.mjs's sanitizeHtml() is a regex tag-stripper that deletes anything between " +
      "two unrelated bare '<'/'>' characters (e.g. 'coverage > 80%'). Job descriptions are ordinary " +
      "typed text, not always TipTap HTML, so buildJobPostingSchema() must gate sanitizeHtml() behind " +
      "a looksLikeHtml() check (falling back to esc()) the same way api/job-feed.mjs's sectionHtml() " +
      "does — otherwise plain-text descriptions get silently mangled in the public JobPosting JSON-LD.",
    run: async ({ read }) => {
      const src = (await read("api/job-prerender.mjs")) ?? "";
      const bad = [];
      if (!/function looksLikeHtml\(/.test(src)) bad.push("api/job-prerender.mjs lost its looksLikeHtml() gate");
      if (!/function sectionHtml\(/.test(src)) bad.push("api/job-prerender.mjs lost its sectionHtml() gate around sanitizeHtml()");
      if (/\$\{sanitizeHtml\(job\.(description|responsibilities|requirements)\)\}/.test(src)) {
        bad.push("api/job-prerender.mjs calls sanitizeHtml() directly on job text instead of going through sectionHtml()");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
