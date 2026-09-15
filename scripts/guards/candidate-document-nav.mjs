/**
 * The candidate sidebar used to list Dashboard (/dashboard), Interviews
 * (/interviews) and Documents (/documents) — three routes AppLayout's
 * CANDIDATE_ALLOWED_PATH_PREFIXES excludes and force-redirects a candidate
 * away from, so all three were dead ends. Worse, every document-request /
 * offer-package notification (in-app and email) sent a candidate to
 * /documents too, so they had no way to open or act on a request at all.
 *
 * The fix: candidateNavItems drops Dashboard/Interviews (no working
 * candidate destination exists for either — Applications is already their
 * home, and interview status lives inside each application) and points
 * Documents at a real candidate-facing route, /my-documents, which
 * AppLayout allow-lists and which every candidate-bound document
 * notification/email now links to instead of /documents. A legacy
 * /documents hit (an old stored notification, or a stale bookmark) is
 * redirected to /my-documents, not the generic /applications fallback.
 */
export default [
  {
    id: "candidate-document-nav",
    why: "A candidate nav item, notification link, or email link pointing at a dead-end employer route (/dashboard, /interviews, /documents) instead of a working candidate destination leaves document/offer requests and interview tabs unreachable again.",
    run: async ({ read }) => {
      const detail = [];

      // --- AppSidebar: candidateNavItems must not offer dead ends ---
      const sidebar = await read("src/components/AppSidebar.tsx");
      if (sidebar == null) {
        detail.push("src/components/AppSidebar.tsx is missing");
      } else {
        const match = sidebar.match(
          /const candidateNavItems: NavItemProps\[\] = \[([\s\S]*?)\n\s*\];/,
        );
        if (!match) {
          detail.push("couldn't find candidateNavItems in AppSidebar.tsx");
        } else {
          const block = match[1];
          if (/to:\s*"\/dashboard"/.test(block)) {
            detail.push("candidateNavItems still links to /dashboard, which AppLayout redirects candidates away from");
          }
          if (/to:\s*"\/interviews"/.test(block)) {
            detail.push("candidateNavItems still links to /interviews, which AppLayout redirects candidates away from");
          }
          if (!/to:\s*"\/my-documents"/.test(block)) {
            detail.push("candidateNavItems' Documents item no longer points at /my-documents");
          }
        }
      }

      // --- AppLayout: /my-documents must be an allowed candidate path, and
      // a legacy /documents hit must redirect there, not to /applications ---
      const layout = await read("src/components/AppLayout.tsx");
      if (layout == null) {
        detail.push("src/components/AppLayout.tsx is missing");
      } else {
        const allowedMatch = layout.match(
          /const CANDIDATE_ALLOWED_PATH_PREFIXES = \[([\s\S]*?)\];/,
        );
        if (!allowedMatch || !/"\/my-documents"/.test(allowedMatch[1])) {
          detail.push("CANDIDATE_ALLOWED_PATH_PREFIXES doesn't include /my-documents");
        }
        if (!/pathname\s*===\s*"\/documents"[\s\S]{0,200}"\/my-documents"/.test(layout)) {
          detail.push("the candidate redirect effect no longer special-cases a legacy /documents link to /my-documents");
        }
      }

      // --- The candidate document page must exist and be routed ---
      const page = await read("src/pages/MyDocuments.tsx");
      if (page == null) {
        detail.push("src/pages/MyDocuments.tsx is missing");
      } else if (!/export default function MyDocuments/.test(page)) {
        detail.push("src/pages/MyDocuments.tsx no longer default-exports MyDocuments");
      }
      const app = await read("src/App.tsx");
      if (app == null || !/path="\/my-documents"/.test(app)) {
        detail.push('src/App.tsx has no <Route path="/my-documents" ...> registered');
      }

      // --- Every candidate-bound document notification must link to the
      // working destination, not the employer-only /documents page ---
      const notifSites = [
        { file: "src/hooks/useDocumentRequests.ts", anchor: "New Document Request" },
        { file: "src/components/documents/CreateDocumentDialog.tsx", anchor: "New Document to Sign" },
        { file: "src/components/documents/DocumentWizard.tsx", anchor: "New Document to Sign" },
        { file: "src/hooks/useDocumentPackages.ts", anchor: "Hiring Document Package" },
      ];
      for (const { file, anchor } of notifSites) {
        const text = await read(file);
        if (text == null) {
          detail.push(`${file} is missing`);
          continue;
        }
        const idx = text.indexOf(anchor);
        if (idx === -1) {
          detail.push(`${file} no longer contains the "${anchor}" notification — can't verify its link`);
          continue;
        }
        const window = text.slice(idx, idx + 300);
        if (/link:\s*"\/documents"/.test(window)) {
          detail.push(`${file}'s "${anchor}" notification still links to /documents instead of /my-documents`);
        } else if (!/link:\s*"\/my-documents"/.test(window)) {
          detail.push(`${file}'s "${anchor}" notification doesn't link to /my-documents`);
        }
      }

      // --- The candidate-facing document emails must land on the working
      // destination too, not the generic /applications fallback ---
      const emailFn = await read("supabase/functions/send-notification-email/index.ts");
      if (emailFn == null) {
        detail.push("supabase/functions/send-notification-email/index.ts is missing");
      } else {
        for (const type of ["document_sent", "document_requested"]) {
          const idx = emailFn.indexOf(`${type}: {`);
          if (idx === -1) {
            detail.push(`send-notification-email is missing the ${type} template — can't verify its link`);
            continue;
          }
          const window = emailFn.slice(idx, idx + 500);
          if (!/candidateLink\("\/my-documents"\)/.test(window)) {
            detail.push(`send-notification-email's ${type} template doesn't link to candidateLink("/my-documents")`);
          }
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
