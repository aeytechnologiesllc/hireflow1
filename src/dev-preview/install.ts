/**
 * Dev-preview-only. Called once, before the real app renders (see the DEV-only
 * branch in src/main.tsx), when the URL carries `?__preview=1`. Swaps the
 * app's `supabase` singleton for an offline fixture client and picks which
 * fixture user is "signed in", so every real page, hook and mapper in the app
 * runs completely unmodified against canned data — no network, no auth.
 */
import { __setPreviewSupabaseClient } from "@/integrations/supabase/client";
import { createFixtureSupabaseClient, type FixtureAuthUser, type FixtureRow, type FixtureTables } from "./fixtureClient";
import { buildFixtureRpcHandlers, buildFixtureTables, FIXTURE_SCENARIOS, type FixtureScenario } from "./fixtures";
import {
  APP_ZULU_RETAKE_ID,
  CANDIDATE_USER_ID,
  EMPLOYER_USER_ID,
  REJECTED_CANDIDATE_USER_ID,
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
    rpc: buildFixtureRpcHandlers(scenario),
  });
  const realtime = liveRealtime(base, tables, params.get("__previewLive"));
  // The staff record opens applicants' uploads through the applicant-file-url
  // edge function (a short-lived signed link). Offline, it answers with an
  // inline picture, so the record's file previews can be looked at.
  const client = {
    ...base,
    ...realtime,
    functions: {
      async invoke(name: string, options?: { body?: unknown }) {
        if (name === "applicant-file-url") {
          const path = String((options?.body as { path?: unknown } | undefined)?.path ?? "");
          return { data: { url: previewFileDataUrl(path), contentType: "image/svg+xml" }, error: null };
        }
        return base.functions.invoke();
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
