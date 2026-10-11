/**
 * The owner's integrity card (notifications of type "integrity"): reading
 * one, and the gate that turns a card's new parts into one toast.
 *
 * Moved out of assessmentRecord.ts (2026-10-11, the performance check): the
 * staff shell's notification toasts need only this, and importing it from
 * the 3,400-line record builder put all of that in every first download.
 * assessmentRecord.ts re-exports it, so its old importers are unchanged.
 */

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/* ── The owner's integrity card (notifications, type "integrity") ─────── */

export interface IntegrityCard {
  applicationId: string;
  stepId: string;
  /** The test's own title, from "During <title>: …". */
  during: string | null;
  /** "left the window 3 times (1m 12s away)", "paste attempt ×1". */
  parts: string[];
  /** Opens the applicant's full profile on that test's record. */
  link: string;
}

/** Each part of the card, in its order (assessment_integrity_alert): the
 *  words it starts with, and how a toast says that one more happened. */
const CARD_KINDS: ReadonlyArray<{ key: string; start: string; did: string }> = [
  { key: "away", start: "left the window", did: "left the window" },
  { key: "paste", start: "paste attempt", did: "tried to paste" },
  { key: "bulk_insert", start: "pasted-in text", did: "put in pasted text" },
  { key: "copy", start: "copy attempt", did: "tried to copy" },
  { key: "screenshot_key", start: "screenshot attempt", did: "tried to take a screenshot" },
  { key: "screenshot_suspected", start: "possible screenshot", did: "may have taken a screenshot" },
  { key: "devtools", start: "developer tools opened", did: "opened developer tools" },
  { key: "page_closed", start: "closed the test page", did: "closed the test page" },
];
/** The words each part of the card starts with (assessment_integrity_alert). */
const CARD_PART_STARTS = CARD_KINDS.map((k) => k.start);
const CARD_MESSAGE = new RegExp(`^During (.+?): ((?:${CARD_PART_STARTS.join("|")})\\b.*)$`);

/**
 * Reads one grouped integrity card (public.assessment_integrity_alert:
 * group_key `integrity:<application_id>:<step_id>`, message "During <step
 * title>: <part>, <part>"). Null for any other notification.
 */
export function parseIntegrityCard(n: { type?: string | null; group_key?: string | null; message?: string | null; link?: string | null }): IntegrityCard | null {
  const key = n.group_key ?? "";
  const m = key.match(/^integrity:([0-9a-fA-F-]{36}):(.+)$/);
  if (!m) return null;
  const [, applicationId, stepId] = m;
  const msg = (n.message ?? "").trim();
  // The test's title is the job's own and may hold ": " itself, so the split
  // is anchored on the card's first part, which is always one of these words.
  const said = msg.match(CARD_MESSAGE);
  const parts = (said ? said[2] : msg)
    .split(/,\s+/)
    .map((p) => p.trim().replace(/ x(\d+)$/, " ×$1"))
    .filter(Boolean);
  return {
    applicationId,
    stepId,
    during: said ? said[1] : null,
    parts,
    link: `/applicants/${applicationId}?record=${encodeURIComponent(stepId)}&focus=integrity`,
  };
}

/* ── A live toast for every new flag on the card ───────────────────────── */
// The owner: told EVERY time an applicant copies, pastes, tries a screenshot
// or switches windows. The server keeps ONE card per applicant per test and
// rewrites it on each new batch of events (new tally, unread again,
// created_at = now()), so after the first event the bell sees UPDATEs, not
// INSERTs. These turn each counted-up card into one toast — once per batch,
// never for the same update twice, never for a "mark as read".

/** The slice of a `notifications` row the toast reads. */
export interface IntegrityCardRow {
  id?: string | null;
  type?: string | null;
  group_key?: string | null;
  title?: string | null;
  message?: string | null;
  link?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
}

export interface IntegrityToast {
  /** One id per card update: the same update is one toast however often it arrives. */
  id: string;
  /** "Robin Okafor left the window during Player chat practice (3rd time)". */
  title: string;
  /** The running tally in the card's words: "So far: left the window 3 times (1m 12s away) · paste attempt ×1". */
  description: string;
  /** That test's timeline on the applicant's profile. */
  link: string;
}

/** The card's counts by part ("left the window 3 times" → away: 3,
 *  "paste attempt ×1" → paste: 1). Parts it does not know are skipped. */
export function integrityCardCounts(parts: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of parts) {
    const part = raw.trim();
    const kind = CARD_KINDS.find((k) => part.startsWith(k.start));
    if (!kind) continue;
    const n =
      kind.key === "away"
        ? Number(part.match(/^left the window (\d+) times?\b/)?.[1] ?? NaN)
        : Number(part.match(/[×x](\d+)\s*$/)?.[1] ?? NaN);
    if (Number.isFinite(n) && n > 0) counts[kind.key] = (counts[kind.key] ?? 0) + n;
  }
  return counts;
}

/** "Robin Okafor" from "Integrity — Robin Okafor" (the server's own fallback
 *  when there is no name is "A candidate"). */
function cardPerson(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  const m = t.match(/^Integrity\s+[—–-]\s+(.+)$/);
  return (m ? m[1].trim() : "") || "A candidate";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The id one update of a card toasts under: the card and the time of its update. */
export function integrityToastId(row: IntegrityCardRow): string {
  return `integrity:${row.group_key ?? row.id ?? ""}:${row.created_at ?? ""}`;
}

/**
 * The toast for one write of the owner's integrity card, or null when it
 * says nothing new. `prev` is the card as it was last seen: `null` when the
 * card is new (everything on it is new), `undefined` when it was never seen
 * (an update whose earlier counts are unknown: said without a count).
 */
export function integrityCardToast(prev: IntegrityCardRow | null | undefined, next: IntegrityCardRow): IntegrityToast | null {
  const card = parseIntegrityCard(next);
  if (!card) return null;
  const now = integrityCardCounts(card.parts);
  if (Object.keys(now).length === 0) return null;
  const person = cardPerson(next.title);
  const during = card.during ? ` during ${card.during}` : "";
  const base = {
    id: integrityToastId(next),
    description: `So far: ${card.parts.join(" · ")}`,
    link: card.link,
  };
  if (prev === undefined) return { ...base, title: `${person} was flagged again${during}` };

  const before = prev ? integrityCardCounts(parseIntegrityCard(prev)?.parts ?? []) : {};
  const grew = CARD_KINDS.filter((k) => (now[k.key] ?? 0) > (before[k.key] ?? 0));
  if (grew.length === 0) return null;
  if (grew.length > 1) return { ...base, title: `${person} ${andList(grew.map((k) => k.did))}${during}` };

  const kind = grew[0];
  const total = now[kind.key];
  const added = total - (before[kind.key] ?? 0);
  const title =
    added === 1
      ? `${person} ${kind.did}${during}${total > 1 ? ` (${ordinal(total)} time)` : ""}`
      : added === total
        ? `${person} ${kind.did} ${total} times${during}`
        : `${person} ${kind.did} ${added} more times${during} (${total} in all)`;
  return { ...base, title };
}

/**
 * Decides, for each realtime write of a notification, whether it is a new
 * flag to toast. One per tab (module scope in the toast host), so two mounts
 * or a re-delivered message can never toast the same update twice.
 *
 *  - `seed(rows)`: the cards as fetched (on subscribe and after a reconnect),
 *    so the next update is compared with what the card said.
 *  - `consider(event, row)`: a toast, or null for anything that is not an
 *    integrity card, is read (a mark-as-read, here or on another device),
 *    is older than what was seen, or adds nothing.
 */
export function createIntegrityToastGate(limit = 500) {
  type Seen = { row: IntegrityCardRow; at: number | null; fromSeed: boolean };
  const cards = new Map<string, Seen>();
  const shown = new Set<string>();
  const keyOf = (row: IntegrityCardRow) => row.group_key ?? row.id ?? "";
  const trim = <T,>(set: Set<T> | Map<T, unknown>) => {
    while (set.size > limit) {
      const first = set.keys().next().value as T;
      set.delete(first);
    }
  };
  const isCard = (row: IntegrityCardRow | null | undefined): row is IntegrityCardRow => !!row && parseIntegrityCard(row) != null;

  return {
    seed(rows: readonly (IntegrityCardRow | null | undefined)[] | null | undefined) {
      for (const row of rows ?? []) {
        if (!isCard(row)) continue;
        const at = toMillis(row.created_at);
        const held = cards.get(keyOf(row));
        // Never step back over a newer write the channel already delivered.
        if (held && (held.at == null || (at != null && held.at >= at))) continue;
        cards.set(keyOf(row), { row: { ...row }, at, fromSeed: true });
      }
      trim(cards);
    },
    consider(event: "INSERT" | "UPDATE", row: IntegrityCardRow | null | undefined): IntegrityToast | null {
      if (!isCard(row)) return null;
      const key = keyOf(row);
      const at = toMillis(row.created_at);
      const held = cards.get(key);
      // A write older than the one already seen changes nothing.
      if (held && held.at != null && at != null && at < held.at) return null;
      cards.set(key, { row: { ...row }, at, fromSeed: false });
      trim(cards);
      if (row.is_read === true) return null;
      const id = integrityToastId(row);
      if (shown.has(id)) return null;
      const same = !!held && held.row.created_at === row.created_at && held.row.message === row.message;
      // Delivered before (or marked unread again): nothing new happened.
      if (same && !held!.fromSeed) return null;
      // Compared with the card as last seen. A new card: everything on it is
      // new. An update of a card never seen — or seen only by the seed, which
      // read this very write before its message arrived — grew by an unknown
      // part, so it is said without a count.
      const prev: IntegrityCardRow | null | undefined = held && !same ? held.row : event === "INSERT" ? null : undefined;
      const toast = integrityCardToast(prev, row);
      if (toast) {
        shown.add(id);
        trim(shown);
      }
      return toast;
    },
  };
}
