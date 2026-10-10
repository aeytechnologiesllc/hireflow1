/**
 * The staff applicant screens stay live without a refresh.
 *
 * On 2026-10-05 the owner watched his own test applicant from the staff tab
 * and saw "Nobody has applied yet." for the whole run: the row was inserted
 * at Apply Now, but the cockpit's only applicants query had no realtime
 * subscription and sat on the app-wide 5-minute staleTime. The cockpit
 * rewrite (e1a92ef, 2026-06-25) had silently dropped the old page-level
 * channels. The fix is ONE shell-level listener,
 * src/cockpit/hooks/useEmployerLiveSync.ts, mounted once in each staff layout
 * (AppLayout's owner branch and TeamMemberLayout).
 *
 * This guard fails if:
 *  - the live-sync hook, its applications binding, its SUBSCRIBED catch-up or
 *    its mounts disappear, or it gets mounted somewhere that renders twice;
 *  - its channel topic stops carrying a useId() value — realtime-js returns
 *    the SAME channel object for a repeated topic, and a second `.on()` on a
 *    joined channel breaks it for every caller;
 *  - any hook the cockpit shell mounts (Shell.tsx's own @/hooks imports, plus
 *    the listed shell-level listeners) opens a channel with a static topic;
 *  - the employer applicant queries fall back to the 5-minute default, or the
 *    "New application" toast stops refreshing the applicant list;
 *  - (wave 2, 2026-10-06) the test record stops being live: the
 *    assessment_sessions binding moves onto the applications channel (a
 *    missing or failing table would then stall the applicant list too), loses
 *    its per-instance topic, or its query keys; or a record hook opens a
 *    channel of its own (one per mounted panel would duplicate the shell's);
 *  - (wave 3, 2026-10-06) the Applicants list (useApplicantList.ts) opens a
 *    channel, stops building its keys from LIVE_SYNC_LIST_KEYS, or the live
 *    sync stops merging those lists in place (mergeIntoList on both channels,
 *    `lists || !isMergedListKey(` in both coalescers) and goes back to
 *    re-downloading every applicant and attempt on each heartbeat;
 *  - (wave 4, 2026-10-06) booked interviews stop being live: the
 *    public.interviews binding disappears, loses its own per-instance channel
 *    (it must never share the applications channel), or one open profile goes
 *    back to refetching its attempts on every OTHER applicant's heartbeat.
 *  - (wave 5, 2026-10-07) the Applicants list stops holding still. With 31
 *    applications in an hour the owner saw "this weird refresh thing": a
 *    heartbeat every two seconds re-sorted the list (the Score sort broke
 *    ties by the last move), and every row React moved replayed its
 *    `ck-reveal` fade, so the list blinked to opacity 0. The guard fails if
 *    the page draws the live order instead of the held one
 *    (useHeldApplicantList), loses the update bar, gives a row `ck-reveal`
 *    that is not behind its `reveal` prop or stops passing that prop, sorts
 *    anything but "Last active" by activity, lets a new query key put
 *    the skeleton back (placeholderData: keepPreviousData), or stops drawing
 *    the rows through the memoised ApplicantListItem (a flood's every event
 *    redrew all 300 rows).
 */

const HOOK = "src/cockpit/hooks/useEmployerLiveSync.ts";
const LAYOUT = "src/components/AppLayout.tsx";
const SHELL = "src/cockpit/Shell.tsx";
const APPLICATIONS = "src/hooks/useApplications.ts";
const TOASTS = "src/components/GlobalNotificationToasts.tsx";
const RECORD_HOOKS = "src/cockpit/hooks/useAssessmentSessions.ts";
const LIST_HOOK = "src/cockpit/hooks/useApplicantList.ts";
const LIST_PAGE = "src/cockpit/pages/Applicants.tsx";
const LIST_ROW = "src/cockpit/components/ApplicantRow.tsx";
const LIST_LIB = "src/cockpit/lib/applicantList.ts";

/** Shell-level realtime listeners that must never share a topic between mounts. */
const SHELL_REALTIME_FILES = [
  HOOK,
  TOASTS,
  "src/hooks/useUnreadMessagesCount.ts",
  "src/hooks/useNotifications.ts",
  "src/hooks/useActivityFeed.ts",
];

/** Every `.channel(<topic>)` call in a file, with its raw first argument. */
function channelTopics(text) {
  const out = [];
  const re = /\.channel\(\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const line = text.slice(0, m.index).split("\n").length;
    const quote = text[start];
    if (quote === "`" || quote === '"' || quote === "'") {
      const end = text.indexOf(quote, start + 1);
      out.push({ line, quote, topic: text.slice(start + 1, end) });
    } else {
      out.push({ line, quote: null, topic: text.slice(start, text.indexOf(")", start)).trim() });
    }
  }
  return out;
}

/** Names bound to useId() in a file: `const instanceId = useId();` */
function useIdNames(text) {
  return [...text.matchAll(/const\s+(\w+)\s*=\s*useId\(\)/g)].map((m) => m[1]);
}

/** Problems with the channel topics in one file (empty = all per-instance). */
function staticTopicProblems(rel, text) {
  const problems = [];
  const ids = useIdNames(text);
  for (const { line, quote, topic } of channelTopics(text)) {
    if (quote !== "`") {
      problems.push(
        `${rel}:${line} opens a channel with ${quote ? "a static topic" : "a topic the guard cannot read"} ` +
          `(${quote ? quote + topic + quote : topic}); write it as a template literal that includes a useId() value`,
      );
      continue;
    }
    const carriesInstance = ids.some((id) => topic.includes("${" + id + "}"));
    if (!carriesInstance) {
      problems.push(
        `${rel}:${line} channel topic \`${topic}\` does not interpolate a useId() value ` +
          `(${ids.length ? "useId names here: " + ids.join(", ") : "no `const x = useId()` in this file"})`,
      );
    }
  }
  return problems;
}

/** Text of a top-level `function name(` up to the next top-level function. */
function functionBody(text, name) {
  const start = text.search(new RegExp(`(^|\\n)(export\\s+)?(default\\s+)?function\\s+${name}\\s*\\(`));
  if (start === -1) return null;
  const rest = text.slice(start + 1);
  const next = rest.search(/\n(export\s+)?(default\s+)?function\s+\w+\s*\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

export default [
  {
    id: "cockpit-live-applicants",
    why:
      "The staff Applicants list, Dashboard and full profile only stay live through ONE " +
      "shell-level realtime listener (useEmployerLiveSync) with a per-instance topic. Losing it, " +
      "mounting it where the shell renders twice, or sharing a topic puts the owner back on " +
      "'Nobody has applied yet.' until he reloads.",
    run: async ({ read, sources }) => {
      const detail = [];

      // 1. The hook itself.
      const hook = await read(HOOK);
      if (hook == null) {
        return { ok: false, detail: [`${HOOK} is missing — nothing keeps the staff applicant screens live`] };
      }
      const hookBody = functionBody(hook, "useEmployerLiveSync") ?? "";
      if (!/const\s+instanceId\s*=\s*useId\(\)/.test(hookBody)) {
        detail.push(`${HOOK}: useEmployerLiveSync no longer takes \`const instanceId = useId()\``);
      }
      if (!/startEmployerLiveSync\(\{[^}]*\binstanceId\b/.test(hookBody)) {
        detail.push(`${HOOK}: useEmployerLiveSync no longer passes its useId() value to startEmployerLiveSync`);
      }
      // Five channels, never fewer: applications, the test record, booked
      // interviews, and (2026-10-10) document requests and documents, each on
      // its own (binding a table that is missing or failing fails the channel
      // it is on, and the applicant list must not stall).
      const topics = channelTopics(hook);
      if (topics.length !== 5) {
        detail.push(`${HOOK}: expected exactly five .channel( calls (applications, the test record, interviews, document requests, documents), found ${topics.length}`);
      }
      /** The text from a channel's .channel( to its own .subscribe(. */
      const chainFor = (prefix) => {
        const at = hook.indexOf(".channel(`" + prefix);
        const sub = at === -1 ? -1 : hook.indexOf(".subscribe(", at);
        return at === -1 || sub === -1 ? "" : hook.slice(at, sub);
      };
      const TABLES = ["applications", "assessment_sessions", "interviews", "document_requests", "documents"];
      for (const [prefix, table] of [["employer-live-", "applications"], ["employer-sessions-", "assessment_sessions"], ["employer-interviews-", "interviews"], ["employer-requests-", "document_requests"], ["employer-documents-", "documents"]]) {
        const t = topics.find((x) => x.quote === "`" && x.topic.startsWith(prefix));
        if (!t) {
          detail.push(`${HOOK}: no channel topic starts \`${prefix}\``);
          continue;
        }
        if (!t.topic.includes("${instanceId}")) {
          detail.push(`${HOOK}:${t.line} topic \`${t.topic}\` no longer carries \${instanceId} — two mounts would share one channel`);
        }
        const chain = chainFor(prefix);
        if (!new RegExp(`\\.on\\(\\s*["']postgres_changes["'][\\s\\S]*?table:\\s*["']${table}["']`).test(chain)) {
          detail.push(`${HOOK}: no postgres_changes binding on public.${table} before the \`${prefix}\` channel's .subscribe(`);
        }
        const others = TABLES.filter((t) => t !== table).filter((t) => new RegExp(`table:\\s*["']${t}["']`).test(chain));
        if (others.length > 0) {
          detail.push(`${HOOK}: the \`${prefix}\` channel binds ${others.join(", ")} too — each table needs its own channel`);
        }
      }
      if (!/LIVE_SYNC_SESSION_KEYS[^=]*=\s*\[\s*\[\s*["']assessment-sessions["']\s*\]/.test(hook)) {
        detail.push(`${HOOK}: LIVE_SYNC_SESSION_KEYS no longer invalidates ["assessment-sessions"] — live progress would freeze`);
      }
      if (!/\.subscribe\(\s*\(\s*status\s*\)\s*=>[\s\S]{0,200}["']SUBSCRIBED["']/.test(hook)) {
        detail.push(`${HOOK}: .subscribe( no longer re-syncs on SUBSCRIBED — events missed while the socket was down would be lost`);
      }
      for (const key of ['["applications"]', '["activity-feed"]', '["jobs", "employer"]', '["new-applicants-count"]']) {
        if (!hook.includes(key)) detail.push(`${HOOK}: LIVE_SYNC_QUERY_KEYS no longer invalidates ${key}`);
      }

      // 2. Mounted exactly once in each staff layout, and nowhere else.
      const layout = await read(LAYOUT);
      if (layout == null) {
        detail.push(`${LAYOUT} is missing`);
      } else {
        if (!/import\s*\{\s*EmployerLiveSync\s*\}\s*from\s*["']@\/cockpit\/hooks\/useEmployerLiveSync["']/.test(layout)) {
          detail.push(`${LAYOUT} no longer imports EmployerLiveSync`);
        }
        const owner = functionBody(layout, "AppLayout") ?? "";
        const ownerShell = owner.slice(owner.lastIndexOf("return ("));
        if (!/<EmployerLiveSync\s*\/>/.test(ownerShell) || !/<CockpitShell>/.test(ownerShell)) {
          detail.push(`${LAYOUT}: the owner cockpit branch (the return that renders <CockpitShell>) no longer mounts <EmployerLiveSync />`);
        }
        const team = functionBody(layout, "TeamMemberLayout") ?? "";
        if ((team.match(/<EmployerLiveSync\s*\/>/g) ?? []).length !== 1) {
          detail.push(`${LAYOUT}: TeamMemberLayout must mount <EmployerLiveSync /> exactly once`);
        }
        const candidate = functionBody(layout, "CandidateLayout") ?? "";
        if (/<EmployerLiveSync\s*\/>/.test(candidate)) {
          detail.push(`${LAYOUT}: CandidateLayout mounts <EmployerLiveSync /> — candidates have no staff list to sync`);
        }
        const mounts = (layout.match(/<EmployerLiveSync\s*\/>/g) ?? []).length;
        if (mounts !== 2) detail.push(`${LAYOUT}: expected 2 <EmployerLiveSync /> mounts (owner + team), found ${mounts}`);
      }
      for (const { rel, text } of await sources([".ts", ".tsx"])) {
        if (rel === HOOK || rel === LAYOUT) continue;
        if (/<EmployerLiveSync\b|useEmployerLiveSync\s*\(/.test(text)) {
          detail.push(`${rel} mounts the live sync too — it belongs once per layout, never in a component that can render twice (Sidebar, MobileTabBar, MobileTopBar, pages)`);
        }
      }

      // 3. No shell-level listener shares a topic between mounts.
      const shell = await read(SHELL);
      const shellHooks = shell
        ? [...shell.matchAll(/from\s+["']@\/hooks\/([\w-]+)["']/g)].map((m) => `src/hooks/${m[1]}.ts`)
        : [];
      for (const rel of new Set([...SHELL_REALTIME_FILES, ...shellHooks])) {
        const text = (await read(rel)) ?? (await read(rel + "x"));
        if (text == null) {
          if (SHELL_REALTIME_FILES.includes(rel)) detail.push(`${rel} is missing`);
          continue;
        }
        detail.push(...staticTopicProblems(rel, text));
      }

      // 3b. The record's hooks ride on the shell's channel; one per panel would
      // duplicate it (and a static topic would break both mounts).
      const recordHooks = await read(RECORD_HOOKS);
      if (recordHooks == null) {
        detail.push(`${RECORD_HOOKS} is missing — the staff record cannot read the server's attempts`);
      } else if (/\.channel\(/.test(recordHooks)) {
        detail.push(`${RECORD_HOOKS} opens a realtime channel — the shell's useEmployerLiveSync already listens to assessment_sessions`);
      }

      // 3c. (wave 3, 2026-10-06) The Applicants list holds every applicant and
      // every attempt of the employer's jobs. It rides on the shell's channel,
      // its keys are the ones the live sync merges, and the sync merges them in
      // place: a later edit must not quietly go back to re-downloading the
      // whole list on every heartbeat of a live applicant.
      const listHook = await read(LIST_HOOK);
      if (listHook == null) {
        detail.push(`${LIST_HOOK} is missing — the Applicants list has no data hook`);
      } else {
        if (/\.channel\(/.test(listHook)) {
          detail.push(`${LIST_HOOK} opens a realtime channel — the shell's useEmployerLiveSync already keeps the list live`);
        }
        for (const list of ["applications", "sessions"]) {
          if (!new RegExp(`\\[\\.\\.\\.LIVE_SYNC_LIST_KEYS\\.${list},`).test(listHook)) {
            detail.push(`${LIST_HOOK}: the ${list} key is no longer built from LIVE_SYNC_LIST_KEYS.${list} — the live sync would stop merging into it`);
          }
        }
      }
      if (!/export const LIVE_SYNC_LIST_KEYS\s*=/.test(hook)) {
        detail.push(`${HOOK}: LIVE_SYNC_LIST_KEYS is gone — the Applicants list is no longer merged in place`);
      }
      if ((hook.match(/\bmergeIntoList\s*[<(]/g) ?? []).length < 3) {
        detail.push(`${HOOK}: mergeIntoList must be defined and applied on BOTH channels (applications and the test record)`);
      }
      if (!/isApplicationSessionsKey\(query\.queryKey\)\s*\?\s*everything \|\| applicationIds\.includes\(/.test(hook)) {
        detail.push(
          `${HOOK}: one applicant's attempts (["assessment-sessions", "application", id]) must refetch only for THEIR attempts or the catch-up — ` +
            "otherwise an open profile re-downloads its full attempts on every other applicant's heartbeat",
        );
      }
      const predicates = (hook.match(/lists \|\| !isMergedListKey\(/g) ?? []).length;
      if (predicates < 2) {
        detail.push(
          `${HOOK}: both coalescers must skip the merged lists unless a change marked them stale (\`lists || !isMergedListKey(\`, found ${predicates}) — ` +
            "otherwise every heartbeat re-downloads every applicant and attempt",
        );
      }

      // 3d. (wave 5, 2026-10-07) The list holds still while it is read.
      const page = await read(LIST_PAGE);
      if (page == null) {
        detail.push(`${LIST_PAGE} is missing`);
      } else {
        if (!/useHeldApplicantList\(/.test(page) || !/const view = held\.view;/.test(page)) {
          detail.push(`${LIST_PAGE}: the rows must be drawn from the held order (\`const view = held.view\` from useHeldApplicantList) — the live order re-sorts on every heartbeat`);
        }
        if (!/<ListUpdatesBar\b/.test(page)) {
          detail.push(`${LIST_PAGE}: the update bar (<ListUpdatesBar>) is gone — new applicants and moves would have nowhere to wait`);
        }
        // Every realtime event renders the page; 300 rows redrawn each time
        // was a long main-thread task per heartbeat (2026-10-07). The rows go
        // through one memoised item with one stable callbacks object.
        if (!/const ApplicantListItem = memo\(/.test(page) || !/<ApplicantListItem\b[^>]*\bactions=\{rowActions\}/.test(page) || !/const rowActions = useMemo<RowActions>\([\s\S]*?\[\],\s*\)/.test(page)) {
          detail.push(`${LIST_PAGE}: rows must be drawn through the memoised ApplicantListItem with the one stable rowActions object — otherwise every heartbeat redraws every row`);
        }
        for (const tag of ["ApplicantTableRow", "ApplicantCard"]) {
          const uses = [...page.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))].map((m) => m[0]);
          if (uses.length === 0 || uses.some((u) => !/\breveal=\{/.test(u))) {
            detail.push(`${LIST_PAGE}: every <${tag}> must pass reveal={…} (true only while the list first lands) — a row moved with ck-reveal blinks`);
          }
        }
      }
      // Every component that draws a list row or wraps one (the row, the
      // card, a frame around them: the keyed node React moves) adds
      // `ck-reveal` only behind its `reveal` prop.
      const rowFile = await read(LIST_ROW);
      if (rowFile == null) detail.push(`${LIST_ROW} is missing`);
      for (const { rel, text } of await sources([".tsx"])) {
        if (!rel.startsWith("src/cockpit/components/") || !/data-applicant-(row|frame)\b/.test(text)) continue;
        // Code only: the comments may name the class.
        const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const all = (code.match(/ck-reveal/g) ?? []).length;
        const gated = (code.match(/reveal\s*\?\s*["'`]ck-reveal\b/g) ?? []).length;
        if (all !== gated) {
          detail.push(`${rel}: \`ck-reveal\` must only be added behind the \`reveal\` prop (found ${all}, gated ${gated}) — the browser replays it on every row React moves`);
        }
      }
      const lib = await read(LIST_LIB);
      if (lib != null) {
        const sortBody = functionBody(lib, "sortRows") ?? "";
        if ((sortBody.match(/lastActiveAt/g) ?? []).length !== 2 || !/sort === "last-active"\) \{\s*d = byTime\(a\.lastActiveAt, b\.lastActiveAt\)/.test(sortBody)) {
          detail.push(`${LIST_LIB}: sortRows may read lastActiveAt only for the "Last active" sort — a tie broken by activity re-sorts the list on every heartbeat`);
        }
        if (!/byTime\(a\.appliedAt, b\.appliedAt\) \|\| a\.id\.localeCompare\(b\.id\)/.test(sortBody)) {
          detail.push(`${LIST_LIB}: sortRows must break ties by when they applied, then id (keys nothing live can move)`);
        }
      }
      if (listHook != null && !/placeholderData: keepPreviousData/.test(listHook.match(/const MERGED_FRESHNESS = \{([^}]*)\}/)?.[1] ?? "")) {
        detail.push(`${LIST_HOOK}: MERGED_FRESHNESS must keep the previous rows (placeholderData: keepPreviousData) — a new key would put the skeleton back`);
      }

      // 4. The applicant queries heal on their own too.
      const apps = await read(APPLICATIONS);
      if (apps == null) {
        detail.push(`${APPLICATIONS} is missing`);
      } else {
        const block = apps.match(/const\s+LIVE_LIST_FRESHNESS\s*=\s*\{([\s\S]*?)\}/);
        const stale = block ? Number((block[1].match(/staleTime:\s*([\d_]+)/)?.[1] ?? "NaN").replace(/_/g, "")) : NaN;
        if (!block) {
          detail.push(`${APPLICATIONS}: LIVE_LIST_FRESHNESS is gone — the applicant list is back on the 5-minute default`);
        } else {
          if (!(stale <= 15_000)) detail.push(`${APPLICATIONS}: LIVE_LIST_FRESHNESS.staleTime must be 15 s or less (is ${block[1].match(/staleTime:\s*([^,\n]+)/)?.[1] ?? "unset"})`);
          if (!/refetchOnWindowFocus:\s*true/.test(block[1])) detail.push(`${APPLICATIONS}: LIVE_LIST_FRESHNESS must refetch on window focus`);
          if (!/refetchOnReconnect:\s*true/.test(block[1])) detail.push(`${APPLICATIONS}: LIVE_LIST_FRESHNESS must refetch on reconnect`);
        }
        for (const name of ["useEmployerApplications", "useApplicationStats"]) {
          if (!/\.\.\.LIVE_LIST_FRESHNESS/.test(functionBody(apps, name) ?? "")) {
            detail.push(`${APPLICATIONS}: ${name} no longer spreads LIVE_LIST_FRESHNESS`);
          }
        }
      }

      // 5. A "New application" toast refreshes the list it links into.
      const toasts = await read(TOASTS);
      if (toasts != null && !/invalidateQueries\(\{\s*queryKey:\s*\["applications"\]\s*\}\)/.test(toasts)) {
        detail.push(`${TOASTS}: the "New application" toast no longer invalidates ["applications"] — its View link can land on "I can't find that applicant"`);
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
