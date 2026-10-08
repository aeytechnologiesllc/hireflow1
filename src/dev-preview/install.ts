/**
 * Dev-preview-only. Called once, before the real app renders (see the DEV-only
 * branch in src/main.tsx), when the URL carries `?__preview=1`. Swaps the
 * app's `supabase` singleton for an offline fixture client and picks which
 * fixture user is "signed in", so every real page, hook and mapper in the app
 * runs completely unmodified against canned data — no network, no auth.
 */
import { __setPreviewSupabaseClient } from "@/integrations/supabase/client";
import { STAMP_TAIL_BYTES } from "@/lib/connectionTest";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { createFixtureSupabaseClient, type FixtureAuthUser, type FixtureRow, type FixtureTables } from "./fixtureClient";
import { buildFixtureRpcHandlers, buildFixtureTables, FIXTURE_SCENARIOS, type FixtureScenario } from "./fixtures";
import {
  APP_QUIZ_ID,
  APP_ZULU_RETAKE_ID,
  CANDIDATE_USER_ID,
  EMPLOYER_USER_ID,
  REJECTED_CANDIDATE_USER_ID,
  STEP_TYPING,
  TEAM_MEMBER_USER_ID,
} from "./ids";

export type PreviewRole = "employer" | "team_member" | "candidate" | "rejected_candidate";

const ROLE_USERS: Record<PreviewRole, FixtureAuthUser> = {
  employer: { id: EMPLOYER_USER_ID, email: "maria@mariascafe.example", user_metadata: { role: "employer", full_name: "Maria Alvarado" } },
  team_member: { id: TEAM_MEMBER_USER_ID, email: "diego@mariascafe.example", user_metadata: { role: "team_member", full_name: "Diego Ferreira" } },
  candidate: { id: CANDIDATE_USER_ID, email: "jordan.alvarez@example.com", user_metadata: { role: "candidate", full_name: "Jordan Alvarez" } },
  rejected_candidate: { id: REJECTED_CANDIDATE_USER_ID, email: "sam.rivera@example.com", user_metadata: { role: "candidate", full_name: "Sam Rivera" } },
};

/** A stand-in for an uploaded speed-test screenshot: no network, ever. */
function previewFileDataUrl(path: string): string {
  const name = path.split("/").pop() ?? "file";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">` +
    `<rect width="480" height="300" fill="#141a2b"/>` +
    `<text x="24" y="40" font-family="sans-serif" font-size="16" fill="#9fb0d0">SPEED TEST - preview file</text>` +
    `<text x="24" y="120" font-family="sans-serif" font-size="56" font-weight="700" fill="#e8eefc">48.2</text>` +
    `<text x="176" y="120" font-family="sans-serif" font-size="20" fill="#9fb0d0">Mbps down</text>` +
    `<text x="24" y="190" font-family="sans-serif" font-size="40" font-weight="700" fill="#e8eefc">11.6</text>` +
    `<text x="130" y="190" font-family="sans-serif" font-size="18" fill="#9fb0d0">Mbps up, ping 23 ms</text>` +
    `<text x="24" y="270" font-family="monospace" font-size="12" fill="#5f6f90">${name.replace(/[<&>]/g, "")}</text>` +
    `</svg>`;
  // Percent-encoded, not base64: btoa() writes Latin-1 bytes, which an SVG
  // parser reads as broken UTF-8 the moment a file name has an accent.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ── connection-test, offline: the computer and connection check's chain ── */
// The page (src/pages/ConnectionCheckPhase.tsx) runs its chain through
// supabase.functions.invoke: 8 pings, 3 downloads, 4 uploads, then a
// `test_finished` marker carrying the run's stamps (`event`), and `record`.
// Offline, each op answers with a stamp of the real shape (16-hex nonce,
// prev_nonce chain, a sig nothing checks) after a believable pause, so the
// gauge moves and the three screens can be looked at; `event` answers a
// finished run with figures a little under the page's own estimate (the
// server's clock never flatters a connection) and every other marker with
// `recorded: true`; `record` answers the sent run's figures, moves the
// fixture row to the next step and files the result, so the advance screen
// and the overview read as after a real send. The stamps are not signed:
// the real server refuses them.
type InvokeOptions = { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal };
type InvokeReply = { data: unknown; error: unknown };

function previewConnectionTest(tables: FixtureTables): (name: string, options?: InvokeOptions) => Promise<InvokeReply> {
  let prevNonce: string | null = null;
  const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const sig = "preview_stamp_not_signed_by_any_server_0000".padEnd(43, "0").slice(0, 43);
  const stamp = (kind: "ping" | "download" | "upload", bytes: number, extra: Record<string, unknown> = {}) => {
    const now = Date.now();
    const s = { kind, nonce: nonce(), at: now, bytes, prev_nonce: prevNonce, prev_at: now, candidate: CANDIDATE_USER_ID, ...extra, sig };
    prevNonce = s.nonce;
    return JSON.stringify(s);
  };
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  const jitter = (base: number, spread: number) => base + Math.random() * spread;
  return async (name, options) => {
    const url = new URL(name, "http://preview.local");
    const op = url.searchParams.get("op");
    if (op === "ping") {
      await wait(jitter(28, 24));
      return { data: { stamp: stamp("ping", 0) }, error: null };
    }
    if (op === "download") {
      // The stamp's tail is the page's STAMP_TAIL_BYTES (512); the pause
      // follows the size the page asked for, so its sizing looks real.
      const tail = STAMP_TAIL_BYTES;
      const bytes = Math.max(tail, Number(url.searchParams.get("bytes")) || 3 * 1024 * 1024);
      await wait(jitter(120 + (bytes / (3 * 1024 * 1024)) * 500, 260));
      const body = new Uint8Array(bytes);
      body.fill(0x20, bytes - tail);
      body.set(new TextEncoder().encode(stamp("download", bytes)), bytes - tail);
      return { data: new Blob([body]), error: null };
    }
    if (op === "upload") {
      const body = options?.body;
      const bytes = body instanceof ArrayBuffer ? body.byteLength : ArrayBuffer.isView(body) ? body.byteLength : Math.round(1.5 * 1024 * 1024);
      await wait(jitter(120 + (bytes / (1.5 * 1024 * 1024)) * 780, 300));
      return { data: { stamp: stamp("upload", bytes, { timing: "stream" }), bytes, timing: "stream" }, error: null };
    }
    const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    if (op === "event") {
      const body = (options?.body ?? {}) as Record<string, unknown>;
      if (body.what !== "test_finished" || !Array.isArray(body.stamps)) {
        return { data: { recorded: true }, error: null };
      }
      await wait(jitter(260, 180));
      const detail = (body.detail ?? {}) as Record<string, unknown>;
      const figures = {
        downloadMbps: Math.round(num(detail.download_mbps, 29) * 0.97 * 10) / 10,
        uploadMbps: Math.round(num(detail.upload_mbps, 9.4) * 0.97 * 10) / 10,
        latencyMs: Math.round(num(detail.latency_ms, 41) + 1),
        jitterMs: 6,
      };
      return { data: { recorded: true, figures }, error: null };
    }
    if (op === "record") {
      await wait(700);
      const body = (options?.body ?? {}) as Record<string, unknown>;
      // The sent run's figures: the server's for it when the page had them
      // (they are what a real `record` recomputes), else its estimate.
      const sentRun = Array.isArray(body.runs)
        ? (body.runs.find((r) => (r as { sent?: unknown } | null)?.sent === true) as { server?: Record<string, unknown> | null } | undefined)
        : undefined;
      const estimate = (body.estimate ?? {}) as Record<string, unknown>;
      const server = sentRun?.server ?? null;
      const results = {
        downloadMbps: num(server?.downloadMbps, num(estimate.download_mbps, 28.4)),
        uploadMbps: num(server?.uploadMbps, num(estimate.upload_mbps, 9.1)),
        latencyMs: num(server?.latencyMs, num(estimate.latency_ms, 42)),
        jitterMs: num(server?.jitterMs, 6),
        measuredBy: "server",
        runs: Array.isArray(body.runs) ? Math.max(1, body.runs.length) : 1,
        usingThisComputer: body.using_this_computer ?? "yes",
        deviceKind: body.device_kind ?? "computer",
        device: body.device ?? {},
        bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 },
        meetsBars: true,
        below: [] as string[],
        measuredAt: new Date().toISOString(),
        attempt: 1,
        source: { oneAddress: true, sameAddress: true, sameBrowser: true },
        _trusted: true,
      };
      results.below = [
        ...(results.downloadMbps < 10 ? ["download"] : []),
        ...(results.uploadMbps < 3 ? ["upload"] : []),
        ...(results.latencyMs > 200 ? ["latency"] : []),
      ];
      results.meetsBars = results.below.length === 0;
      const row = (tables.applications ?? []).find((r) => r.id === body.application_id);
      if (row) {
        const notes = parseApplicationNotes(typeof row.notes === "string" ? row.notes : null) as Record<string, unknown>;
        // recordStepResult's own shape: the result, the entry under the
        // step's id, and the server-only marker every reader trusts.
        const trusted = notes._trusted && typeof notes._trusted === "object" ? (notes._trusted as Record<string, unknown>) : {};
        row.notes = JSON.stringify({
          ...notes,
          equipmentCheckResult: results,
          [String(body.step_id)]: { type: "equipment_check", ...results, completedAt: results.measuredAt },
          _trusted: { ...trusted, [String(body.step_id)]: { stepType: "equipment_check", completedAt: results.measuredAt } },
        });
        row.phase = STEP_TYPING;
        row.updated_at = new Date().toISOString();
      }
      return { data: { results, next: { phase: STEP_TYPING } }, error: null };
    }
    return { data: null, error: null };
  };
}

/* ── The legacy job editor's generation, offline (/jobs/create-legacy) ─── */
// CreateJob.tsx reaches its screening-plan editor (the step picker and every
// step's card, the connection check's three bars among them) only after
// ai-generate-job-content has written a draft. Offline it answers a short,
// plain draft; ai-generate-workflow answers a plan whose first step is the
// computer and connection check, so its card is on screen at once.
function previewJobGeneration(name: string, options?: InvokeOptions): InvokeReply | null {
  const body = (options?.body ?? {}) as Record<string, unknown>;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Remote support agent";
  if (name === "ai-generate-job-content") {
    if (body.field !== "full") return { data: { content: `A short ${String(body.field ?? "section")} for ${title}.` }, error: null };
    return {
      data: {
        description: `${title}, working from home on your own computer. You answer players by chat, sort out payments and keep things calm.`,
        responsibilities: "Answer player chats\nCheck payments and cash-outs\nHand hard cases to a lead",
        requirements: "A reliable computer and internet connection\nClear written English\nEvenings or weekends",
        skills: "Typing, Written communication, Patience",
        benefits: "Paid training\nWork from home",
        screening_plan_summary: "A connection check, a short skills check, a typing test and a chat practice.",
      },
      error: null,
    };
  }
  if (name === "ai-generate-workflow") {
    return {
      data: {
        application_questions: [{ id: "q1", type: "text", question: "Which hours can you work?", required: true }],
        quiz_questions: [],
        workflow_steps: [
          {
            id: "step_connection",
            type: "equipment_check",
            title: "Your computer and connection",
            description: "A short speed test on the computer you'll work from.",
            required: true,
            config: { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 },
          },
          { id: "step_typing", type: "typing_test", title: "Typing test", description: "One timed minute.", required: true, config: { min_wpm: 40, duration_seconds: 60 } },
        ],
        screening_plan_summary: "A connection check, then a typing test.",
      },
      error: null,
    };
  }
  return null;
}

/* ── `?__previewLive=integrity`: the owner's card counting up, live ─────── */
// The fixture client's channels never fire. With this flag (zulu scenario),
// Jordan's integrity card is rewritten the way public.assessment_integrity_alert
// rewrites it — new tally, unread again, created_at = now — and each write is
// delivered to every notifications listener as a realtime UPDATE, so the
// staff toasts can be looked at. The script also re-delivers one write and
// marks the card read: neither may toast.

type ChangeHandler = (payload: unknown) => void;
type Binding = { event: string; table: string | null; userId: string | null; cb: ChangeHandler; isClosed: () => boolean };
type PreviewChannel = {
  on: (type: string, filter: unknown, cb?: unknown) => PreviewChannel;
  subscribe: (callback?: (status: string) => void) => PreviewChannel;
  unsubscribe: () => Promise<"ok">;
  __close?: () => void;
};

function liveRealtime(base: ReturnType<typeof createFixtureSupabaseClient>, tables: FixtureTables, script: string | null) {
  const bindings: Binding[] = [];
  let started = false;

  const deliver = (event: "INSERT" | "UPDATE", table: string, row: FixtureRow) => {
    for (const b of bindings) {
      if (b.isClosed() || b.table !== table || (b.event !== "*" && b.event !== event)) continue;
      if (b.userId && row.user_id !== b.userId) continue;
      b.cb({ eventType: event, schema: "public", table, commit_timestamp: new Date().toISOString(), new: { ...row }, old: { id: row.id }, errors: null });
    }
  };

  const runIntegrityScript = () => {
    const rows = tables.notifications ?? [];
    const key = `integrity:${APP_ZULU_RETAKE_ID}:step_chat`;
    if (!rows.some((r) => r.group_key === key)) return;
    // A new row object per write (never mutated in place), so a refetched
    // list is a change the query cache can see.
    const write = (patch: FixtureRow): FixtureRow => {
      const i = rows.findIndex((r) => r.group_key === key);
      rows[i] = { ...rows[i], ...patch };
      return rows[i];
    };
    const during = "During Player chat practice: ";
    // One alert: the card rewritten from the whole tally, unread, on top.
    const alert = (tally: string) =>
      deliver("UPDATE", "notifications", write({ message: during + tally, is_read: false, created_at: new Date().toISOString() }));
    const steps: Array<[number, () => void]> = [
      [1200, () => alert("left the window 2 times (52s away)")],
      [1700, () => deliver("UPDATE", "notifications", write({}))], // the same write, delivered again
      [2300, () => deliver("UPDATE", "notifications", write({ is_read: true }))], // marked read
      [2900, () => alert("left the window 2 times (52s away), paste attempt x1")],
      [3500, () => alert("left the window 3 times (1m 30s away), paste attempt x1, possible screenshot x1")],
    ];
    for (const [ms, step] of steps) window.setTimeout(step, ms);
  };

  const channel = (...args: unknown[]): PreviewChannel => {
    const inner = (base.channel as (...a: unknown[]) => { subscribe: (cb?: (status: string) => void) => unknown })(...args);
    let closed = false;
    const chan: PreviewChannel = {
      on(type, filter, cb) {
        const f = (filter ?? {}) as { event?: string; table?: string; filter?: string };
        if (type === "postgres_changes" && typeof cb === "function") {
          const userId = typeof f.filter === "string" ? f.filter.match(/^user_id=eq\.(.+)$/)?.[1] ?? null : null;
          bindings.push({ event: f.event ?? "*", table: f.table ?? null, userId, cb: cb as ChangeHandler, isClosed: () => closed });
        }
        return chan;
      },
      subscribe(callback) {
        inner.subscribe(callback);
        if (script === "integrity" && !started && bindings.some((b) => !b.isClosed() && b.table === "notifications")) {
          started = true;
          runIntegrityScript();
        }
        return chan;
      },
      unsubscribe: async () => {
        closed = true;
        return "ok" as const;
      },
      __close: () => {
        closed = true;
      },
    };
    return chan;
  };
  const removeChannel = async (chan?: PreviewChannel | null) => {
    chan?.__close?.();
    return "ok" as const;
  };
  return { channel, removeChannel };
}

/**
 * Remove and block, offline (supabase/migrations/20261007022249_block_applicants.sql):
 * the same writes the real functions make to the fixture tables, so the list's
 * ⋯ menu, the bulk bar, the Blocked tab and Unblock can be clicked through.
 * Nothing here checks who may: the preview is one employer's own data.
 */
function previewBlockHandlers(tables: FixtureTables, user: FixtureAuthUser): Record<string, (args: unknown) => unknown> {
  const rows = (name: string): FixtureRow[] => (tables[name] ??= []);
  return {
    block_applicants: (args) => {
      const { p_application_ids: ids = [], p_reason: reason = null } = (args ?? {}) as { p_application_ids?: string[]; p_reason?: string | null };
      const blocked: string[] = [];
      const skipped: string[] = [];
      for (const id of ids) {
        const app = rows("applications").find((a) => a.id === id);
        const job = app ? rows("jobs").find((j) => j.id === app.job_id) : undefined;
        if (!app || !job) {
          skipped.push(id);
          continue;
        }
        const at = new Date().toISOString();
        for (const other of rows("applications")) {
          const sameEmployer = rows("jobs").some((j) => j.id === other.job_id && j.employer_id === job.employer_id);
          if (other.candidate_id !== app.candidate_id || !sameEmployer) continue;
          if (other.id !== app.id && !["in_progress", "pending", "reviewing"].includes(String(other.status))) continue;
          other.status = "rejected";
          // Every key kept, as merge_application_notes keeps them.
          let notes: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(typeof other.notes === "string" && other.notes.trim() ? other.notes : "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) notes = parsed as Record<string, unknown>;
          } catch {
            // Unreadable notes: the stamp alone.
          }
          other.notes = JSON.stringify({ ...notes, blocked: { at, by: user.id } });
          other.updated_at = at;
        }
        const list = rows("blocked_applicants");
        if (!list.some((b) => b.employer_id === job.employer_id && b.candidate_id === app.candidate_id)) {
          const profile = rows("profiles").find((p) => p.user_id === app.candidate_id);
          list.push({
            id: `block-${String(app.candidate_id)}`,
            employer_id: job.employer_id,
            candidate_id: app.candidate_id,
            email: typeof profile?.email === "string" ? profile.email.toLowerCase() : null,
            phone: null,
            reason,
            blocked_by: user.id,
            created_at: at,
          });
        }
        blocked.push(id);
      }
      return { blocked, skipped };
    },
    unblock_applicant: (args) => {
      const candidate = (args as { p_candidate_id?: string } | undefined)?.p_candidate_id;
      const list = rows("blocked_applicants");
      const keep = list.filter((b) => b.candidate_id !== candidate);
      const removed = list.length - keep.length;
      tables.blocked_applicants = keep;
      return removed;
    },
  };
}

/**
 * An interview with the hiring team, for the applicant's screens
 * (`?__previewInterview=pick|confirm|waiting|confirmed`, with `,own` for a
 * link of the team's own instead of the built-in room; a confirmed one can
 * also be `,soon` (starts in half an hour: the way in is open) or `,started`
 * (began five minutes ago: someone running late); `,taken` and `,race` have
 * another applicant book an offered time first; `,one` offers a single time,
 * which is the rule since 2026-10-07, and `,again` marks it as a new time
 * set after they could not make an earlier one; `waiting` is someone who
 * wrote when they are free, and `waiting,times` the older answer that listed
 * times of their own): put on the applicant's skills-check application, so
 * the interview is seen beside a step still to take. The applicant's answers
 * go where the real candidate-interview-response function writes them, so
 * booking a time, saying when they are free and confirming can all be
 * walked through.
 */
function previewCandidateInterview(tables: FixtureTables, mode: string | null): (name: string, options?: InvokeOptions) => Promise<InvokeReply> | null {
  const flags = (mode ?? "").split(",").filter(Boolean);
  const stage = flags.find((f) => ["pick", "confirm", "waiting", "confirmed"].includes(f));
  if (stage) {
    const at = (days: number, hour: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const windows = (flags.includes("one") ? [at(3, 14)] : [at(2, 9), at(3, 14), at(4, 20)]).map((start) => ({
      start,
      durationMinutes: 30,
      zone: "America/New_York",
      ...(flags.includes("again") ? { again: true } : {}),
    }));
    // The middle time of three, or the only one.
    const booked = windows[Math.min(1, windows.length - 1)];
    const offered = stage !== "confirm";
    // The stand-in database does not parse select strings, so the join the
    // team's answer dialog asks for is already on the row.
    const application = (tables.applications ?? []).find((row) => row.id === APP_QUIZ_ID);
    tables.interviews = [
      ...(tables.interviews ?? []).filter((row) => row.application_id !== APP_QUIZ_ID),
      {
        id: "0f0f0f0f-1111-4222-8333-444444444444",
        application_id: APP_QUIZ_ID,
        scheduled_at:
          stage === "confirmed" && flags.includes("soon")
            ? new Date(Date.now() + 30 * 60_000).toISOString()
            : stage === "confirmed" && flags.includes("started")
              ? new Date(Date.now() - 5 * 60_000).toISOString()
              : stage === "confirmed"
                ? booked.start
                : windows[0].start,
        status: "scheduled",
        candidate_response: stage === "pick" ? "awaiting_pick" : stage === "confirm" ? "pending" : stage === "waiting" ? "reschedule_requested" : "confirmed",
        meeting_link: flags.includes("own") ? "https://meet.google.com/preview-only-link" : null,
        meeting_provider: flags.includes("own") ? null : "daily",
        meeting_room_name: null,
        meeting_room_url: null,
        duration_minutes: 30,
        interview_type: "video",
        // Said while the offered time was still unbooked: marked, as the real
        // function marks it. `,times` is the answer from before 2026-10-07,
        // which listed times of the applicant's own.
        proposed_times:
          stage !== "waiting"
            ? null
            : flags.includes("times")
              ? [{ datetime: at(5, 10), fromOffer: true }, { datetime: at(6, 16), fromOffer: true }]
              : [{ fromOffer: true }],
        candidate_note:
          stage !== "waiting" ? null : flags.includes("times") ? "Mornings are best for me." : "Monday to Wednesday, 9:00 AM to 2:00 PM. Friday any time after 4:00 PM.",
        employer_windows: offered ? windows : null,
        ai_questions: null,
        ai_feedback: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        applications: application
          ? { id: application.id, candidate_id: application.candidate_id, jobs: application.jobs ?? null }
          : null,
      },
    ];
    if (application) application.status = "interview";
    // `,manila`: their connection check recorded a clock twelve hours from US
    // Eastern, so the team's screens show their time beside the team's own.
    if (application && flags.includes("manila")) {
      application.notes = { ...parseApplicationNotes(application.notes), equipmentCheckResult: { device: { timezone: "Asia/Manila" } } };
    }
  }
  return (name, options) => {
    if (name !== "candidate-interview-response") return null;
    return (async (): Promise<InvokeReply> => {
      const body = (options?.body ?? {}) as {
        action?: string;
        interviewId?: string;
        slotStart?: string;
        availability?: string;
        proposedTimes?: unknown[];
        candidateNote?: string | null;
      };
      // Kept on the window as it is asked, so a walk-through can read what was
      // sent. (Only answers: asking which times are free is not one.)
      const kept = window as unknown as { __previewInterviewAnswers?: unknown[] };
      if (body.action !== "open_slots") (kept.__previewInterviewAnswers ??= []).push(body);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const row = (tables.interviews ?? []).find((r) => r.id === body.interviewId);
      if (!row) return { data: { error: "Interview not found" }, error: null };
      // `,taken`: another applicant has already booked the first offered time.
      const offeredNow = Array.isArray(row.employer_windows) ? (row.employer_windows as { start: string }[]) : [];
      const takenNow = flags.includes("taken") && offeredNow[0] ? [offeredNow[0].start] : [];
      // `,race`: the second offered time is taken at the very moment it is booked.
      const racedNow = flags.includes("race") && offeredNow[1] ? [offeredNow[1].start] : [];
      if (body.action === "open_slots") return { data: { success: true, taken: takenNow }, error: null };
      if ((body.action === "pick_slot" || body.action === "repick_slot") && [...takenNow, ...racedNow].includes(String(body.slotStart))) {
        return { data: { success: false, error: "slot_taken", taken: [...takenNow, ...racedNow] }, error: null };
      }
      if (body.action === "confirm") {
        row.candidate_response = "confirmed";
      } else if (body.action === "reschedule_requested") {
        const words = typeof body.availability === "string" ? body.availability.trim() : "";
        if (!words && !(Array.isArray(body.proposedTimes) && body.proposedTimes.length > 0)) {
          return { data: { error: "no_availability" }, error: null };
        }
        // No time agreed yet: marked, as the real function marks it.
        const unbooked =
          row.candidate_response === "awaiting_pick" ||
          (Array.isArray(row.proposed_times) && (row.proposed_times as { fromOffer?: boolean }[]).some((t) => t?.fromOffer === true));
        row.candidate_response = "reschedule_requested";
        row.proposed_times = words ? (unbooked ? [{ fromOffer: true }] : null) : (body.proposedTimes ?? []);
        row.candidate_note = words || body.candidateNote || null;
      } else if (body.action === "pick_slot" || body.action === "repick_slot") {
        const offered = Array.isArray(row.employer_windows) ? (row.employer_windows as { start: string; durationMinutes?: number }[]) : [];
        const slot = offered.find((w) => w.start === body.slotStart);
        if (!slot) return { data: { error: "That time is no longer offered. Please choose one of the current windows." }, error: null };
        row.scheduled_at = slot.start;
        row.duration_minutes = slot.durationMinutes ?? 30;
        row.candidate_response = "confirmed";
        row.proposed_times = null;
        row.candidate_note = null;
      } else {
        return { data: { error: "Invalid action" }, error: null };
      }
      row.updated_at = new Date().toISOString();
      return { data: { success: true, interview: { ...row } }, error: null };
    })();
  };
}

/**
 * The interview guide's personal part, offline
 * (supabase/functions/interview-guide): a made-up answer after a pause,
 * written to the same table the real function writes, so the guide can be
 * opened, written, opened again and written again. `?__previewGuide=down`
 * answers as the function does while the AI service refuses; `lead` marks the
 * applicants as scored for a team lead job, so the lead plan shows.
 */
function previewInterviewGuide(tables: FixtureTables, mode: string | null): (name: string, options?: InvokeOptions) => Promise<InvokeReply> | null {
  const flags = (mode ?? "").split(",");
  if (flags.includes("lead")) {
    for (const application of tables.applications ?? []) {
      const card = application.ai_scorecard && typeof application.ai_scorecard === "object" ? (application.ai_scorecard as Record<string, unknown>) : {};
      application.ai_scorecard = { ...card, jobFamily: "team_lead" };
    }
  }
  let written = 0;
  return (name, options) => {
    if (name !== "interview-guide") return null;
    return (async (): Promise<InvokeReply> => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (flags.includes("down")) {
        const refused = new Response(JSON.stringify({ error: "ai_unavailable", code: "ai_unavailable" }), { status: 503 });
        return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: refused }) };
      }
      const applicationId = String((options?.body as { applicationId?: unknown } | undefined)?.applicationId ?? "");
      const application = (tables.applications ?? []).find((a) => a.id === applicationId);
      written += 1;
      const guide = {
        version: 1,
        atAGlance: [
          "Says more than 4 years in chat support and more than 2 years leading a team of 4 to 8.",
          "Strongest result: the skills check. Weakest: the chat practice, where one line read as a promise to the player.",
          written > 1 ? "Written again: nothing else stands out." : "Be careful about money wording.",
        ],
        questions: [
          {
            question: "In the practice chat you told the player the cash-out would arrive. Talk me through what you knew at that point, and how you would word it now.",
            why: "The reviewer read one line of the practice chat as a new promise to the player.",
            listenFor: "They separate what is known from what is not, give only the real next step, and promise no date or amount.",
            redFlag: "They repeat that the money will arrive, or defend the wording.",
            source: "chat_practice",
            quote: "Rest assured your cash-out will reflect on your end.",
          },
          {
            question: "Tell me about one week when you led that team of eight. What did you personally do each day?",
            why: "The application gives the size of the team but no example of leading it day to day.",
            listenFor: "A real week: who reported to them, what they checked, one thing they fixed.",
            redFlag: "Only titles and duties, with nothing they did themselves.",
            source: "application",
            quote: null,
          },
          {
            question: "The written interview ended before the last topics. Which days can you reliably cover, and how much notice do you need to cover for a teammate?",
            why: "They ended the written interview before it reached the hours they can cover.",
            listenFor: "Specific days, a clear limit, and how they would say no early.",
            redFlag: "Vague availability, or days that do not fit the fixed shift.",
            source: "written_interview",
            quote: null,
          },
        ],
        confirm: ["Confirm they can start within a week.", "Confirm they can work the fixed shift five days a week."],
      };
      const row = { application_id: applicationId, job_id: application?.job_id ?? null, guide, generated_at: new Date().toISOString() };
      const list = (tables.interview_guides ??= []);
      const at = list.findIndex((r) => r.application_id === applicationId);
      if (at >= 0) list[at] = row;
      else list.push(row);
      return { data: { guide, generatedAt: row.generated_at, saved: true }, error: null };
    })();
  };
}

/**
 * The team's shortlist, offline (supabase/migrations/*_shortlisted_applications.sql):
 * the same rows the real function writes, so the bookmark, the Shortlist tab,
 * the bulk bar and the profile's button can be clicked through. Nothing here
 * checks who may: the preview is one employer's own data.
 */
function previewShortlistHandlers(tables: FixtureTables, user: FixtureAuthUser): Record<string, (args: unknown) => unknown> {
  const rows = (name: string): FixtureRow[] => (tables[name] ??= []);
  return {
    set_applications_shortlisted: (args) => {
      const { p_application_ids: ids = [], p_shortlisted: on = true } = (args ?? {}) as { p_application_ids?: string[]; p_shortlisted?: boolean };
      const done: string[] = [];
      const skipped: string[] = [];
      for (const id of [...new Set(ids)]) {
        const app = rows("applications").find((a) => a.id === id);
        if (!app) {
          skipped.push(id);
          continue;
        }
        const list = rows("shortlisted_applications");
        const at = list.findIndex((r) => r.application_id === id);
        if (on && at < 0) list.push({ application_id: id, job_id: app.job_id, added_by: user.id, created_at: new Date().toISOString() });
        if (!on && at >= 0) list.splice(at, 1);
        done.push(id);
      }
      return { done, skipped };
    },
  };
}

/**
 * The team's notes on an applicant and each reader's "viewed" marks, offline
 * (supabase/migrations/*_applicant_notes_and_views.sql): the same rows the
 * real functions write, so a note can be written and removed and the list's
 * "Viewed" chip seen. `?__previewNotes=some` starts with two notes on the
 * first applicant and every third applicant already opened. Nothing here
 * checks who may: the preview is one employer's own data.
 */
function previewNotesHandlers(tables: FixtureTables, user: FixtureAuthUser, seed: string | null): Record<string, (args: unknown) => unknown> {
  const rows = (name: string): FixtureRow[] => (tables[name] ??= []);
  rows("applicant_notes");
  rows("applicant_views");
  if (seed === "some") {
    const apps = rows("applications");
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    if (apps[0]) {
      rows("applicant_notes").push(
        { id: "70000000-0000-4000-8000-000000000001", application_id: apps[0].id, job_id: apps[0].job_id, author_id: user.id, body: "Calm and clear in the chat practice. My first pick so far.", created_at: ago(95) },
        { id: "70000000-0000-4000-8000-000000000002", application_id: apps[0].id, job_id: apps[0].job_id, author_id: "00000000-0000-4000-8000-0000000000aa", body: "Ask about working nights for a full month.", created_at: ago(26 * 60) },
      );
    }
    apps.forEach((app, index) => {
      if (index % 3 === 0) rows("applicant_views").push({ viewer_id: user.id, application_id: app.id, job_id: app.job_id, viewed_at: new Date().toISOString() });
    });
  }
  return {
    add_applicant_note: (args) => {
      const { p_application_id: applicationId, p_body: body = "" } = (args ?? {}) as { p_application_id?: string; p_body?: string };
      const app = rows("applications").find((a) => a.id === applicationId);
      const text = String(body).trim();
      // The stand-in client cannot answer with an error: nothing is kept.
      if (!app || !text) return null;
      const note = { id: crypto.randomUUID(), application_id: app.id, job_id: app.job_id, author_id: user.id, body: text, created_at: new Date().toISOString() };
      rows("applicant_notes").push(note);
      return { id: note.id, application_id: note.application_id, author_id: note.author_id, body: note.body, created_at: note.created_at };
    },
    delete_applicant_note: (args) => {
      const { p_note_id: id } = (args ?? {}) as { p_note_id?: string };
      const list = rows("applicant_notes");
      const at = list.findIndex((n) => n.id === id);
      if (at < 0) return false;
      list.splice(at, 1);
      return true;
    },
    mark_applicant_viewed: (args) => {
      const { p_application_id: applicationId } = (args ?? {}) as { p_application_id?: string };
      const app = rows("applications").find((a) => a.id === applicationId);
      if (!app) return null;
      const list = rows("applicant_views");
      const now = new Date().toISOString();
      const mine = list.find((v) => v.viewer_id === user.id && v.application_id === app.id);
      if (mine) mine.viewed_at = now;
      else list.push({ viewer_id: user.id, application_id: app.id, job_id: app.job_id, viewed_at: now });
      return now;
    },
  };
}

/**
 * Archive and delete on a chat, offline
 * (supabase/migrations/*_chat_archive_and_delete.sql): the same marks the
 * real function writes. `?__previewChats=some` starts with four chats: one
 * with someone declined, one with someone invited to interview who has just
 * written (unread), one caught up, and one already archived. Nothing here
 * checks who may: the preview is one employer's own data.
 *
 * The real database stops sending a deleted chat's messages; the stand-in
 * has no such rule, so deleting here takes them out of the fixture.
 */
function previewChatHandlers(tables: FixtureTables, user: FixtureAuthUser, seed: string | null): Record<string, (args: unknown) => unknown> {
  const rows = (name: string): FixtureRow[] => (tables[name] ??= []);
  rows("message_thread_state");
  if (seed === "some") {
    const apps = rows("applications");
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const taken = new Set<unknown>();
    const pick = (status: string) => {
      const app = apps.find((a) => a.status === status && a.candidate_id !== user.id && !taken.has(a.candidate_id));
      if (app) taken.add(app.candidate_id);
      return app;
    };
    let n = 0;
    const say = (app: FixtureRow, fromThem: boolean, content: string, minutes: number, read = true) => {
      n += 1;
      rows("messages").push({
        id: `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        application_id: app.id,
        sender_id: fromThem ? app.candidate_id : user.id,
        receiver_id: fromThem ? user.id : app.candidate_id,
        content,
        is_read: read,
        file_name: null,
        file_size: null,
        file_type: null,
        file_url: null,
        created_at: ago(minutes),
      });
    };
    const declined = pick("rejected");
    const invited = pick("interview");
    const caughtUp = pick("reviewing") ?? pick("offered");
    const putAway = pick("hired") ?? pick("reviewing");
    // Only these four: the scenario's own messages would crowd the picture.
    rows("messages").length = 0;
    if (declined) {
      say(declined, true, "Good day,\n\nI just wanted to follow up on the status of my application and see if there have been any updates.\n\nThank you for the opportunity to be considered.", 5 * 60);
      say(declined, false, "Thank you for the time you put into every step. We have decided not to move forward with your application this time.\n\nWe wish you the very best in your search.", 4 * 60 + 20);
    }
    if (invited) {
      say(invited, false, "The video call is the final step: a 30-minute conversation with our team, not another test.", 3 * 60);
      say(invited, true, "Thank you! I have booked the time. Should I join from my work computer?", 55, false);
    }
    if (caughtUp) {
      say(caughtUp, true, "Hello, is the shift 3:00 AM to 11:00 AM Philippine time every day?", 26 * 60);
      say(caughtUp, false, "Yes, five days a week, with two days off in a row.", 25 * 60);
    }
    if (putAway) {
      say(putAway, true, "hello sir", 2 * 24 * 60);
      rows("message_thread_state").push({ user_id: user.id, contact_id: putAway.candidate_id, archived_at: ago(24 * 60), cleared_at: null, updated_at: ago(24 * 60) });
    }
  }
  return {
    set_chat_state: (args) => {
      const { p_contact_id: contactId, p_action: action } = (args ?? {}) as { p_contact_id?: string; p_action?: string };
      if (!contactId || !action || !["archive", "unarchive", "delete"].includes(action)) return null;
      const list = rows("message_thread_state");
      const now = new Date().toISOString();
      let mark = list.find((m) => m.user_id === user.id && m.contact_id === contactId);
      if (!mark) {
        mark = { user_id: user.id, contact_id: contactId, archived_at: null, cleared_at: null, updated_at: now };
        list.push(mark);
      }
      mark.archived_at = action === "archive" ? now : null;
      if (action === "delete") {
        mark.cleared_at = now;
        const messages = rows("messages");
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const m = messages[i];
          const between = (m.sender_id === user.id && m.receiver_id === contactId) || (m.sender_id === contactId && m.receiver_id === user.id);
          if (between) messages.splice(i, 1);
        }
      }
      mark.updated_at = now;
      return { contact_id: mark.contact_id, archived_at: mark.archived_at, cleared_at: mark.cleared_at };
    },
  };
}

/**
 * "Email me the link" on the Continue on your computer screen, offline
 * (supabase/functions/send-notification-email, type continue_on_computer):
 * no email is ever sent from the preview. It answers as the function would,
 * so the button's four outcomes can be looked at: sent (the default), and
 * with `?__previewEmail=wait | off | fail`, "one went a moment ago", "emails
 * are off for this account" and a failure. The second press in one page load
 * is always "a moment ago", as the server's own limit would make it.
 */
function previewContinueLinkEmail(user: FixtureAuthUser, mode: string | null): (name: string, options?: InvokeOptions) => InvokeReply | null {
  let sent = 0;
  const refusal = (status: number, body: Record<string, unknown>): InvokeReply => ({
    data: null,
    error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      name: "FunctionsHttpError",
      context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    }),
  });
  return (name, options) => {
    const body = (options?.body ?? {}) as { type?: unknown };
    if (name !== "send-notification-email" || body.type !== "continue_on_computer") return null;
    if (mode === "fail") return refusal(500, { error: "preview" });
    if (mode === "off") return { data: { message: "Email notifications disabled" }, error: null };
    if (mode === "wait" || sent > 0) return refusal(429, { error: "We sent it a moment ago.", code: "too_soon", retryAfter: 120 });
    sent += 1;
    return { data: { success: true, recipient: user.email }, error: null };
  };
}

/**
 * For the set-up screen's two clocks and its suggestion
 * (src/lib/interviewSuggestion.ts):
 *  - `__previewTheirZone=Asia/Manila` puts every applicant's connection
 *    check on that clock; `none` takes the clock off file, so the job's own
 *    is used;
 *  - `__previewShift=ph` adds the live job's shift sentence to every job
 *    post ("3:00 AM to 11:00 AM Philippine time (3:00 PM to 11:00 PM US
 *    Eastern)").
 */
function previewInterviewClocks(tables: FixtureTables, theirZone: string | null, shift: string | null): void {
  if (theirZone) {
    for (const application of tables.applications ?? []) {
      const notes = parseApplicationNotes(application.notes) as Record<string, unknown>;
      const check = (notes.equipmentCheckResult ?? {}) as Record<string, unknown>;
      const device = { ...((check.device ?? {}) as Record<string, unknown>) };
      if (theirZone === "none") delete device.timezone;
      else device.timezone = theirZone;
      application.notes = { ...notes, equipmentCheckResult: { ...check, device } };
    }
  }
  if (shift === "ph") {
    const sentence =
      " This is a full-time job: 40 hours a week, 5 days a week, on one fixed shift: 3:00 AM to 11:00 AM Philippine time (3:00 PM to 11:00 PM US Eastern).";
    const seen = new Set<unknown>();
    const add = (job: FixtureRow | null | undefined) => {
      if (!job || seen.has(job)) return;
      seen.add(job);
      job.description = `${typeof job.description === "string" ? job.description : ""}${sentence}`;
    };
    for (const job of tables.jobs ?? []) add(job);
    // An application carries its own copy of its job.
    for (const application of tables.applications ?? []) add(application.jobs as FixtureRow | null);
  }
}

function isPreviewRole(value: string | null): value is PreviewRole {
  return !!value && Object.prototype.hasOwnProperty.call(ROLE_USERS, value);
}

export function install(params: URLSearchParams): void {
  const roleParam = params.get("__previewRole");
  const role: PreviewRole = isPreviewRole(roleParam) ? roleParam : "employer";
  const theme = params.get("__previewTheme");
  // `fresh`: one live role, nobody applied yet; `zulu`: that role with three
  // applicants at three points; `applying`: only the one still on the form
  // (see fixtures.ts). Default: the café.
  const scenarioParam = params.get("__previewScenario");
  const scenario: FixtureScenario = FIXTURE_SCENARIOS.find((s) => s === scenarioParam) ?? "cafe";

  if (theme === "light" || theme === "dark") {
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // Private-browsing / storage-blocked — theme just falls back to default.
    }
  }

  const tables = buildFixtureTables(scenario);
  const base = createFixtureSupabaseClient({
    user: ROLE_USERS[role],
    tables,
    rpc: {
      ...buildFixtureRpcHandlers(scenario),
      ...previewBlockHandlers(tables, ROLE_USERS[role]),
      ...previewShortlistHandlers(tables, ROLE_USERS[role]),
      ...previewNotesHandlers(tables, ROLE_USERS[role], params.get("__previewNotes")),
      ...previewChatHandlers(tables, ROLE_USERS[role], params.get("__previewChats")),
    },
  });
  const realtime = liveRealtime(base, tables, params.get("__previewLive"));
  // The staff record opens applicants' uploads through the applicant-file-url
  // edge function (a short-lived signed link). Offline, it answers with an
  // inline picture, so the record's file previews can be looked at.
  const connectionTest = previewConnectionTest(tables);
  const continueLinkEmail = previewContinueLinkEmail(ROLE_USERS[role], params.get("__previewEmail"));
  const interviewGuide = previewInterviewGuide(tables, params.get("__previewGuide"));
  previewInterviewClocks(tables, params.get("__previewTheirZone"), params.get("__previewShift"));
  const candidateInterview = previewCandidateInterview(tables, params.get("__previewInterview"));
  const client = {
    ...base,
    ...realtime,
    functions: {
      async invoke(name: string, options?: InvokeOptions) {
        if (name === "applicant-file-url") {
          const path = String((options?.body as { path?: unknown } | undefined)?.path ?? "");
          return { data: { url: previewFileDataUrl(path), contentType: "image/svg+xml" }, error: null };
        }
        // The computer and connection check's chain (name carries `?op=`).
        if (name === "connection-test" || name.startsWith("connection-test?")) {
          return connectionTest(name, options);
        }
        // Every email a screen asks for is kept on the window, so a walk-through
        // can read what WOULD have gone out. Nothing leaves the machine here.
        if (name === "send-notification-email") {
          const kept = window as unknown as { __previewEmails?: unknown[] };
          (kept.__previewEmails ??= []).push(options?.body ?? null);
        }
        const emailed = continueLinkEmail(name, options);
        if (emailed) return emailed;
        // `?__previewMail=sent`: the mail service accepts every notification
        // (the default answers as it does with no mail service at all).
        if (name === "send-notification-email" && params.get("__previewMail") === "sent") {
          // About as long as the real round trip, so anything that waits on it can be seen waiting.
          await new Promise((resolve) => setTimeout(resolve, 150));
          return { data: { success: true }, error: null };
        }
        const generated = previewJobGeneration(name, options);
        if (generated) return generated;
        const guide = interviewGuide(name, options);
        if (guide) return guide;
        const answered = candidateInterview(name, options);
        if (answered) return answered;
        return base.functions.invoke(name, options);
      },
    },
  };

  __setPreviewSupabaseClient(client as never);

  // A visible, unmistakable marker so nobody mistakes this for the real
  // signed-in app — matches the banner rendered by DevPreviewPicker.
  try {
    document.documentElement.setAttribute("data-hireflow-preview", role);
  } catch {
    // no-op — cosmetic only
  }
}
