/**
 * Every cockpit data hook (useCockpitData.ts) surfaces `isError` + `refetch`
 * alongside `isLoading` — but until this fix, the pages consuming them read
 * only `isLoading` and silently fell through to their empty-state copy on a
 * failed load: "You haven't posted a role yet", "Nobody has applied yet",
 * "I can't find that applicant any more", "It's just you so far", "The
 * drawer is empty", "Nobody has written [to you] yet" — every one of them a
 * confident claim about the account, shown for a fetch that simply never
 * came back. This guard checks that each of those pages still branches on
 * `isError` (or the hook-specific failed flags Dashboard/Analytics use) and
 * renders the shared `CockpitErrorCard` (src/cockpit/components/ErrorCard.tsx)
 * — with its "Try again" retry — right there, rather than letting a removed
 * check quietly bring the old bug back.
 */

const CHECKS = [
  { file: "src/cockpit/pages/Jobs.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  { file: "src/cockpit/pages/Applicants.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  { file: "src/cockpit/pages/CandidateDetail.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  { file: "src/cockpit/pages/Dashboard.tsx", guard: /if\s*\(\s*candidatesFailed\s*\|\|\s*jobsFailed\s*\)/ },
  { file: "src/cockpit/pages/Analytics.tsx", guard: /if\s*\(\s*analyticsFailed\s*\)/ },
  { file: "src/cockpit/pages/Interviews.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  { file: "src/cockpit/pages/Documents.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  { file: "src/cockpit/pages/Team.tsx", guard: /if\s*\(\s*isError\s*\)/ },
  {
    file: "src/cockpit/pages/Messages.tsx",
    guard: /if\s*\(\s*isError\s*&&\s*!conversations\.length\s*&&\s*!partner\s*\)/,
  },
  { file: "src/cockpit/pages/Messages.tsx", guard: /thread\.length === 0 && isError/ },
];

/** The guard clause must actually render the shared error card close by —
 *  not just exist as a dead `if (isError) {}` somewhere in the file. */
const RENDER_WINDOW = 600;

export default [
  {
    id: "cockpit-error-states",
    why:
      "A cockpit page that stops branching on isError (or renders something other than " +
      "CockpitErrorCard right after the check) goes back to showing its empty-state copy " +
      "— 'you have nothing' — for a load that actually failed.",
    run: async ({ read }) => {
      const detail = [];

      const card = await read("src/cockpit/components/ErrorCard.tsx");
      if (card == null) {
        return { ok: false, detail: ["src/cockpit/components/ErrorCard.tsx is missing"] };
      }
      if (!/export function CockpitErrorCard/.test(card) || !/Try again/.test(card) || !/onRetry/.test(card)) {
        detail.push("src/cockpit/components/ErrorCard.tsx no longer exports a CockpitErrorCard with a Try again / onRetry control");
      }

      const seen = new Set();
      for (const { file, guard } of CHECKS) {
        const text = await read(file);
        if (text == null) {
          detail.push(`${file} is missing`);
          continue;
        }
        if (!seen.has(file)) {
          seen.add(file);
          if (!/CockpitErrorCard/.test(text)) {
            detail.push(`${file} never imports/renders CockpitErrorCard`);
          }
        }

        const m = guard.exec(text);
        if (!m) {
          detail.push(`${file} no longer has the isError guard: ${guard}`);
          continue;
        }
        const after = text.slice(m.index, m.index + RENDER_WINDOW);
        if (!/<CockpitErrorCard/.test(after)) {
          detail.push(`${file} matches "${guard}" but doesn't render <CockpitErrorCard within ${RENDER_WINDOW} chars of it`);
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
