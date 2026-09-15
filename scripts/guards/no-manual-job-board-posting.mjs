/**
 * C1: the post-publish dialog and the Jobs list pushed manual job-board
 * posting — the owner has permanently ruled that out ("no copy-paste
 * homework, no posting by hand on job boards").
 *
 * Root cause: JobPublishedDialog.tsx offered an "Open a Job Board" menu
 * (Indeed/LinkedIn/ZipRecruiter/Monster/Facebook) plus "Copy Job Post" and a
 * "Boost manually on Indeed, LinkedIn, ZipRecruiter, or Monster" line; the
 * Jobs list's live-row action was labelled "Boost" (a name reserved for the
 * future paid Ava Boost) with a tooltip telling the owner to go post it on
 * Indeed/LinkedIn/ZipRecruiter themselves; and the kit that button opened
 * (ShareKitDialog.tsx) carried its own "Post it free on job boards" links
 * and "Post to outside boards manually" copy. A second publish-success
 * surface — AvaCreateJob.tsx's step-5 "Share your role" screen, which is
 * what the live /jobs/create route actually renders — had the identical
 * violation (a "Copy job post" button plus Indeed/LinkedIn/ZipRecruiter/
 * Monster hrefs and "outside board posts are manual" copy) and was missed
 * by the first pass of this fix.
 *
 * Fixed by keeping only true, automatic reach (the job's own public page,
 * already-sent Google notification) plus sharing-your-own-link actions
 * (copy link, view page, QR, print flyer) — no board menu, no per-board
 * hrefs, no "Boost" label on a free action.
 */
const BOARD_HREF_PATTERNS = [
  /indeed\.com/i,
  /linkedin\.com\/talent/i,
  /ziprecruiter\.com/i,
  /monster\.com/i,
  /facebook\.com\/sharer/i,
];

export default [
  {
    id: "published-dialog-drops-manual-board-posting",
    why:
      "JobPublishedDialog.tsx must not send an employer off to post their job by hand on Indeed/" +
      "LinkedIn/ZipRecruiter/Monster/Facebook (the owner ruled this out permanently) — it should " +
      "only ever offer its own live link (copy / view) plus the QR code.",
    run: async ({ read }) => {
      const src = (await read("src/components/JobPublishedDialog.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/components/JobPublishedDialog.tsx not found");
        return { ok: false, detail: bad };
      }
      for (const re of BOARD_HREF_PATTERNS) {
        if (re.test(src)) bad.push(`JobPublishedDialog.tsx references a job board (${re}) again`);
      }
      if (/shareToJobBoard/.test(src)) bad.push("JobPublishedDialog.tsx reintroduced shareToJobBoard()");
      if (/copyJobPost/.test(src)) bad.push('JobPublishedDialog.tsx reintroduced the "Copy Job Post" helper');
      if (/Open a Job Board/i.test(src)) bad.push('JobPublishedDialog.tsx reintroduced the "Open a Job Board" menu');
      if (/Boost manually/i.test(src)) bad.push('JobPublishedDialog.tsx reintroduced "Boost manually on ..." copy');
      if (!/Copy link/i.test(src)) bad.push("JobPublishedDialog.tsx lost its plain \"Copy link\" action");
      if (!/View job page/i.test(src)) bad.push('JobPublishedDialog.tsx lost its "View job page" action');
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "jobs-list-live-action-is-not-called-boost",
    why:
      '"Boost" is reserved for the future paid Ava Boost — the free share-your-link action on a live ' +
      "job row must not borrow that name or its brass/paid button styling (ck-btn-paid), and its " +
      "tooltip must not tell the owner to go post the job themselves on outside boards.",
    run: async ({ read }) => {
      const src = (await read("src/cockpit/pages/Jobs.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/cockpit/pages/Jobs.tsx not found");
        return { ok: false, detail: bad };
      }
      // A button whose entire visible text is the bare word "Boost" (the old
      // live-row action) — comments mentioning "Ava Boost" elsewhere are fine.
      if (/\n[ \t]*Boost[ \t]*\n[ \t]*<\/button>/.test(src)) {
        bad.push('Jobs.tsx still renders a button labelled bare "Boost"');
      }
      if (/post it on Indeed, ?LinkedIn/i.test(src)) {
        bad.push("Jobs.tsx tooltip still tells the owner to go post the job on Indeed/LinkedIn/ZipRecruiter");
      }
      if (/ck-btn-paid/.test(src)) {
        bad.push("Jobs.tsx uses the brass/paid button style (ck-btn-paid) again — that's reserved for a paid action");
      }
      if (!/Share link/.test(src)) {
        bad.push('Jobs.tsx lost the "Share link" label on the live-row share action');
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "share-kit-dialog-shares-only-its-own-link",
    why:
      "ShareKitDialog.tsx (opened from the Jobs list) must only ever help an employer share HireFlow's " +
      "own apply link (copy / QR / print flyer) — not hand them per-board hrefs or copy telling them to " +
      "post it manually on an outside board.",
    run: async ({ read }) => {
      const src = (await read("src/cockpit/components/ShareKitDialog.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/cockpit/components/ShareKitDialog.tsx not found");
        return { ok: false, detail: bad };
      }
      for (const re of BOARD_HREF_PATTERNS) {
        if (re.test(src)) bad.push(`ShareKitDialog.tsx references a job board (${re}) again`);
      }
      if (/post to outside boards manually/i.test(src)) {
        bad.push('ShareKitDialog.tsx reintroduced "Post to outside boards manually" copy');
      }
      if (/post it free on job boards/i.test(src)) {
        bad.push('ShareKitDialog.tsx reintroduced the "Post it free on job boards" section');
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "ava-create-job-publish-success-drops-manual-board-posting",
    why:
      "AvaCreateJob.tsx's step-5 \"Share your role\" screen — the publish-success screen the live " +
      "/jobs/create route actually renders — must not send an employer off to post their job by hand " +
      "on Indeed/LinkedIn/ZipRecruiter/Monster (the owner ruled this out permanently); it should only " +
      "ever offer its own live link (copy / view) plus the honest, non-guaranteed Google Jobs note.",
    run: async ({ read }) => {
      const src = (await read("src/pages/AvaCreateJob.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/pages/AvaCreateJob.tsx not found");
        return { ok: false, detail: bad };
      }
      for (const re of BOARD_HREF_PATTERNS) {
        if (re.test(src)) bad.push(`AvaCreateJob.tsx references a job board (${re}) again`);
      }
      if (/Copy job post/i.test(src)) bad.push('AvaCreateJob.tsx reintroduced the "Copy job post" button');
      if (/Need more reach/i.test(src)) bad.push('AvaCreateJob.tsx reintroduced the "Need more reach?" board-posting card');
      if (/outside board posts are manual/i.test(src)) bad.push('AvaCreateJob.tsx reintroduced "outside board posts are manual" copy');
      if (/finish posting there yourself/i.test(src)) bad.push('AvaCreateJob.tsx reintroduced "finish posting there yourself" copy');
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
