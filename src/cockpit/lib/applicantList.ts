/**
 * applicantList.ts — the Applicants page as a list: one row per person, the
 * tab they sit on, and every filter, search and sort over those rows.
 *
 * The owner, 2026-10-06 (docs/APPLICANTS-LIST.md): "Just a list of
 * applicants. I can click through … Imagine I have 105 applicants. It's going
 * to become a nightmare … I can actually filter those out." The approved
 * mockup is docs/mockups/applicants-list-*.png; the contract is the doc.
 *
 * Every value a row shows comes from `buildAssessmentRecord` — the same call
 * the full profile makes — so the list and the profile can never disagree:
 *  - a dot is decided by the step's RECORD entry (done, below the bar, on it
 *    now, skipped, not reached), never by its position, so a step the job
 *    gained after someone passed it reads skipped, not "Completed";
 *  - the line under the dots is the record's live attempt when there is one,
 *    or "Waiting to continue on a computer" (amber) when the newest move on
 *    their step was reaching that screen on a phone or a tablet;
 *  - the flag count is the record's own total, earlier attempts included.
 *
 * Pure and display-only: no React, no Supabase. Dates are worded here (the
 * row says "applied 2 h ago", "Decided Mon"), in the viewer's own time zone,
 * so `scripts/applicant_list.test.mjs` runs it under plain Node with TZ set.
 */
import {
  buildAssessmentRecord,
  chatTypingBelowBar,
  integritySummary,
  LEFT_AFTER_MS,
  withReopens,
  type AssessmentEntry,
  type AssessmentRecord,
  type AssessmentSessionRow,
  type IntegrityTally,
  type LiveState,
  type StepReopenRow,
} from "@/cockpit/lib/assessmentRecord";
import { buildCandidateJourney, DECISION_STAGE_ID, titleFor, type CandidateJourneyStep, type WorkflowStepLike } from "@/lib/candidateJourney";
import { parseApplicationNotes } from "@/lib/applicationNotes";
import {
  applicantChip,
  effectiveLiveState,
  isDecided,
  journeyDots,
  journeyLineRuns,
  lineStepIndex,
  LIVE_NOW_STATES,
  type JourneyDot,
  type JourneyDotState,
  type LineTone,
} from "@/cockpit/lib/applicantProfile";

/* ── Shapes ────────────────────────────────────────────────────────────── */

/** The columns the list selects from `applications` (contract §3): exactly
 *  what the record builder reads, nothing heavier. */
export const APPLICANT_LIST_COLUMNS =
  "id, job_id, candidate_id, status, phase, created_at, updated_at, notes, ai_score, ai_scorecard, resume_url, voice_interview_result";

/** The job, as the list attaches it on the client (from useEmployerJobs). */
export interface ApplicantListJob {
  id: string;
  title?: string | null;
  workflow_steps?: unknown;
  quiz_questions?: unknown;
  application_questions?: unknown;
  passing_score?: number | null;
  required_wpm?: number | null;
  processing_mode?: string | null;
  updated_at?: string | null;
}

/** One slim application row, with the applicant's profile attached. */
export interface ApplicantListApp {
  id: string;
  job_id?: string | null;
  candidate_id?: string | null;
  status?: string | null;
  phase?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  /** numeric in Postgres; a realtime payload may carry it as a string. */
  ai_score?: number | string | null;
  ai_scorecard?: unknown;
  resume_url?: string | null;
  voice_interview_result?: unknown;
  profiles?: { user_id?: string | null; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
  jobs?: ApplicantListJob | null;
}

/** A booked interview (`interviews`), for "Interview Thu 3 PM". */
export interface ApplicantListInterview {
  application_id: string;
  scheduled_at: string | null;
  status?: string | null;
}

/** The five dot states of contract §2. */
export type DotState = "done" | "below" | "now" | "skipped" | "todo";

export interface ApplicantDot {
  stepId: string;
  stepType: string;
  title: string;
  state: DotState;
  /** A "now" ring they walked away from (the record's live state is left):
   *  drawn grey, not jade. */
  left: boolean;
}

/** Tab keys, also their `?tab=` values. Screen order. "blocked" holds the
 *  people the employer removed and blocked (lib/blockedApplicants.ts): no
 *  row is placed there by tabFor, only by markBlocked, and they are off All
 *  and every other tab and count.
 *
 *  "shortlist" is the hiring team's own picks (lib/shortlist.ts). It cuts
 *  across the others: no row's `tab` is ever "shortlist"; a row is on it when
 *  markShortlisted set `shortlisted`, and it stays on its own tab as well. */
export const APPLICANT_TABS = ["all", "shortlist", "needs-review", "taking-tests", "part-way", "interview", "declined", "blocked"] as const;
export type ApplicantTab = (typeof APPLICANT_TABS)[number];
/** The one tab a person sits on: every tab but the two that cut across. */
export type ApplicantOwnTab = Exclude<ApplicantTab, "all" | "shortlist">;

export const TAB_LABELS: Record<ApplicantTab, string> = {
  all: "All",
  shortlist: "Shortlist",
  "needs-review": "Needs review",
  "taking-tests": "Taking tests now",
  "part-way": "Part-way",
  interview: "Interview",
  declined: "Declined",
  blocked: "Blocked",
};

/** A colour by meaning; TONE_VAR maps it onto the cockpit's own tokens. */
export type ListTone = "jade" | "brass" | "amber" | "crit" | "ink" | "soft" | "muted";

export const TONE_VAR: Record<ListTone, string> = {
  jade: "var(--jade)",
  brass: "var(--brass)",
  amber: "var(--amber-fg)",
  crit: "var(--crit)",
  ink: "var(--ink)",
  soft: "var(--ink-2)",
  muted: "var(--ink-3)",
};

/** One run of the line under the dots, in its own colour (the profile's rail
 *  says the same line: journeyLineRuns in applicantProfile.ts). */
export interface LineSegment {
  text: string;
  tone: LineTone;
}

export type FlagKind = "left-window" | "copy-paste";
export type BelowKind = "skills-check" | "typing" | "connection" | "chat-practice" | "phone";
export type ScoreKind = "final" | "so_far" | "none";

/** Everything one row shows, worked out once. */
export interface ApplicantListRow {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  candidateId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  initials: string;
  /** The raw application status. */
  status: string;
  tab: ApplicantTab;
  /** Needs review, Interview, Offer, Hired, Declined; null on the other tabs. */
  chip: { label: string; tone: ListTone } | null;
  /** A country name, or "Unknown" (UNKNOWN_COUNTRY). */
  country: string;
  /** When they pressed Apply (created_at): the moment the profile's header
   *  and timeline show too. */
  appliedAt: string | null;
  /** "applied 2 h ago", or "started 2 h ago" while still on the form. */
  appliedWords: string;
  /** "2 h ago", "yesterday", "Sep 28": the phone card's short form. */
  appliedAgo: string;
  onForm: boolean;
  /** One dot per journey step of THIS applicant's job, Decision last. */
  dots: ApplicantDot[];
  /** Where they are (0-based, into `dots`), null once finished or decided. */
  stepIndex: number | null;
  currentStepId: string | null;
  stepTotal: number;
  line: LineSegment[];
  lineText: string;
  /** The applicant's own last move (never applications.updated_at). */
  lastActiveAt: string | null;
  activeWords: string;
  activeTone: ListTone;
  /** Active in the last two minutes: the avatar's live dot. */
  liveNow: boolean;
  liveState: LiveState | null;
  /** Every journey step done or skipped. */
  finished: boolean;
  /** rejected, interview, offered or hired. */
  decided: boolean;
  flags: { count: number; kinds: FlagKind[]; tooltip: string | null };
  /** The job's bars they came in under, for the "Below the job's bar on" filter. */
  below: BelowKind[];
  /** ai_score, rounded; null = not scored yet. Never a quiz percentage. */
  score: number | null;
  scoreKind: ScoreKind;
  scoreTone: ListTone;
  /** "so far", "not scored yet", or null for a final score. */
  scoreWords: string | null;
  recommendedAction: string | null;
  interviewAt: string | null;
  /** The phone they typed on the form, as digits (7 to 15 of them): their
   *  answers, or the form's draft while they are still on it; null when
   *  there is none. Read only to flag a new account that uses a blocked
   *  person's phone (lib/blockedApplicants.ts); never shown on the list. */
  phone: string | null;
  /** Set by markBlocked: this person is blocked. Their application closed by
   *  the block is on the Blocked tab; one the block left open (an interview
   *  on another job) stays on its own tab with the Blocked chip. */
  blocked?: boolean;
  /** Set by markBlocked: the name of a blocked person whose phone this
   *  applicant typed. A phone is flagged on the list, never refused. */
  sameBlockedPhoneAs?: string | null;
  /** Set by markShortlisted (lib/shortlist.ts): the hiring team marked this
   *  application for their shortlist, and it is still in the running (not
   *  declined, not blocked). Private to the team; the applicant is not told. */
  shortlisted?: boolean;
  /** Set by markSeenAndNoted (lib/applicantNotes.ts): this reader has opened
   *  the applicant's page since the applicant last did anything. Their own
   *  mark; a teammate's is their own. */
  viewed?: boolean;
  /** Set by markSeenAndNoted: the team's notes on this applicant (how many,
   *  and the newest). Private to the team; the applicant never sees them. */
  note?: { count: number; latest: string } | null;
  record: AssessmentRecord;
}

/* ── Small readers ─────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toMillis(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Lower-case, accents gone, punctuation to spaces: the form every match uses. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ── Words for times ───────────────────────────────────────────────────── */
// The viewer's own clock and time zone. "Today" and weekdays are calendar
// days, not 24-hour windows.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days from `b` to `a` (a later = positive). Rounded: DST days are 23 or 25 h. */
function dayDiff(a: number, b: number): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
}

function dateWords(ms: number, now: number): string {
  const d = new Date(ms);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** "3 PM", "3:30 PM". */
export function clockWords(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** How long ago, as the row says it: "just now", "6 min ago", "20 h ago",
 *  "yesterday", "3 days ago", then the date ("Sep 28"). */
export function agoWords(ms: number | null, now: number): string {
  if (ms == null) return "a while ago";
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = Math.max(1, dayDiff(now, ms));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return dateWords(ms, now);
}

/** A past day, named: "today", "yesterday", "Mon", then the date. */
export function dayWords(ms: number, now: number): string {
  const diff = dayDiff(now, ms);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return WEEKDAYS[new Date(ms).getDay()];
  return dateWords(ms, now);
}

/** "Interview Thu 3 PM", "Interview today 11 AM", "Interview Oct 14, 3 PM". */
export function interviewWords(ms: number, now: number): string {
  const diff = dayDiff(ms, now);
  const day =
    diff === 0
      ? "today"
      : diff === 1
        ? "tomorrow"
        : diff === -1
          ? "yesterday"
          : Math.abs(diff) < 7
            ? WEEKDAYS[new Date(ms).getDay()]
            : `${dateWords(ms, now)},`;
  return `Interview ${day} ${clockWords(ms)}`;
}

/* ── Country (contract §3) ─────────────────────────────────────────────── */

export const UNKNOWN_COUNTRY = "Unknown";

/** A form question that asks where they are: country, city, location, or
 *  where they will work / live / are based. */
export function isLocationQuestion(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(country|countries|city|location|located)\b/i.test(text) || /\bwhere\b[^?]*\b(work|live|living|based|located|from)\b/i.test(text);
}

/** Region codes Intl names that are not a place someone works from. */
const NOT_A_COUNTRY = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);

/** What people type that Intl does not list under that name. */
const COUNTRY_ALIASES: Record<string, string> = {
  us: "US",
  usa: "US",
  "u s": "US",
  "u s a": "US",
  america: "US",
  "united states of america": "US",
  uk: "GB",
  "u k": "GB",
  britain: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  uae: "AE",
  emirates: "AE",
  turkey: "TR",
  "ivory coast": "CI",
  "czech republic": "CZ",
  burma: "MM",
  drc: "CD",
  "democratic republic of the congo": "CD",
  korea: "KR",
  holland: "NL",
};

interface RegionIndex {
  /** folded name, spaces removed → display name */
  exact: Map<string, string>;
  /** [folded key, display name] for the fuzzy pass (6+ letters only) */
  fuzzy: Array<[string, string]>;
  byCode: (code: string) => string | null;
}

let regionIndex: RegionIndex | null = null;

/** Every region name Intl knows in English, built once. */
function regions(): RegionIndex {
  if (regionIndex) return regionIndex;
  const exact = new Map<string, string>();
  const fuzzy: Array<[string, string]> = [];
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  } catch {
    names = null;
  }
  const byCode = (code: string): string | null => {
    if (!names || NOT_A_COUNTRY.has(code)) return null;
    try {
      const name = names.of(code);
      return name && name !== code ? name : null;
    } catch {
      return null;
    }
  };
  const A = "A".charCodeAt(0);
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      const code = String.fromCharCode(A + i, A + j);
      const name = byCode(code);
      if (!name) continue;
      // "Myanmar (Burma)" answers to both; "Hong Kong SAR China" to "Hong Kong".
      const spellings = [name, name.replace(/\s*\(.*\)\s*/g, " "), ...(name.match(/\(([^)]+)\)/g) ?? []).map((p) => p.slice(1, -1)), name.replace(/\s+SAR China$/, "")];
      for (const spelling of spellings) {
        const key = fold(spelling).replace(/ /g, "");
        if (!key || exact.has(key)) continue;
        exact.set(key, name);
        if (key.length >= 6) fuzzy.push([key, name]);
      }
    }
  }
  regionIndex = { exact, fuzzy, byCode };
  return regionIndex;
}

/** Edit distance, giving up past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** The fifty states and DC, as people write them after a city ("Atlanta,
 *  GA"). Two letters that are a state are a US address, never a region code:
 *  GA is not Gabon, CA not Canada, IN not India. */
const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "),
);
/** The same by name. Georgia is left out: it is a country too, and a country
 *  is what the question asks for. */
const US_STATE_NAMES = new Set(
  [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york",
    "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "district of columbia",
  ].map((n) => n.replace(/ /g, "")),
);
/** Canada's provinces and territories after a city ("Regina, SK" is not
 *  Slovakia, "St. John's, NL" not the Netherlands). */
const CA_PROVINCE_CODES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));

/** A US state or a Canadian province, as the last part of an address. */
function subnationalCountry(part: string, whole: boolean): string | null {
  const key = fold(part).replace(/ /g, "");
  if (!key) return null;
  if (key.length === 2) {
    // The whole answer being two letters is a region code first ("PH"); a
    // state's two letters only when no region has them ("TX", "NY").
    if (whole && regions().byCode(key.toUpperCase())) return null;
    if (US_STATE_CODES.has(key.toUpperCase())) return regions().byCode("US");
    if (!whole && CA_PROVINCE_CODES.has(key.toUpperCase())) return regions().byCode("CA");
    return null;
  }
  return US_STATE_NAMES.has(key) ? regions().byCode("US") : null;
}

/** A country by its name or a common alias; a two-letter region code only
 *  where an address puts the country (its last part, or the whole answer). */
function exactCountry(part: string, codes: boolean): string | null {
  const index = regions();
  const folded = fold(part);
  if (!folded) return null;
  const alias = COUNTRY_ALIASES[folded];
  if (alias) return index.byCode(alias);
  if (/^[a-z]{2}$/.test(folded)) return codes ? index.byCode(folded.toUpperCase()) : null;
  return index.exact.get(folded.replace(/ /g, "")) ?? null;
}

/** Within two edits of one country's name ("PHILLIPINES", "Nigerria"). Only
 *  names of six letters or more, only when the first letter agrees (a
 *  misspelling keeps it; "Siberia" is not Liberia), and only one country. */
function fuzzyCountry(part: string): string | null {
  const key = fold(part).replace(/ /g, "");
  if (key.length < 6) return null;
  let best: string | null = null;
  let bestDistance = 3;
  let tie = false;
  for (const [candidate, name] of regions().fuzzy) {
    if (candidate.charAt(0) !== key.charAt(0)) continue;
    const d = editDistance(key, candidate, 2);
    if (d < bestDistance) {
      best = name;
      bestDistance = d;
      tie = false;
    } else if (d === bestDistance && name !== best) {
      tie = true;
    }
  }
  // Two countries equally close is a guess, not a match.
  return best && !tie ? best : null;
}

/** A country named among other words, with no comma: "Manila Philippines",
 *  "Philippines Manila", "Quezon City Philippines". Runs of up to four words
 *  are matched by name or alias (never a two-letter code, and not "us", which
 *  is a word); a run inside a longer match does not count ("Guinea" inside
 *  "Papua New Guinea"); exactly one country found, or none. */
function countryInWords(raw: string): string | null {
  const index = regions();
  const words = fold(raw).split(" ").filter(Boolean);
  const hits: Array<{ from: number; to: number; name: string }> = [];
  for (let from = 0; from < words.length; from += 1) {
    for (let to = from; to < Math.min(words.length, from + 4); to += 1) {
      const run = words.slice(from, to + 1);
      const spaced = run.join(" ");
      const joined = run.join("");
      const alias = spaced !== "us" ? COUNTRY_ALIASES[spaced] : undefined;
      const name = (alias ? index.byCode(alias) : null) ?? (joined.length > 2 ? index.exact.get(joined) ?? null : null);
      if (name) hits.push({ from, to, name });
    }
  }
  const outer = hits.filter((h) => !hits.some((o) => o !== h && o.from <= h.from && o.to >= h.to && o.to - o.from > h.to - h.from));
  const names = new Set(outer.map((h) => h.name));
  return names.size === 1 ? [...names][0] : null;
}

const SMALL_WORDS = new Set(["of", "and", "the", "de", "da", "del", "la", "le"]);

/** Typed into a required box to get past it: not a place ("NA" is not Namibia). */
const NON_ANSWERS = new Set(["", "na", "n a", "none", "no", "yes", "nil", "not applicable", "unknown", "x"]);

function titleCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/(^|[-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())))
    .join(" ");
}

const recognisedCache = new Map<string, string | null>();

/**
 * The country a free-text answer names, or null when it names none it can be
 * sure of. In this order: a US state or Canadian province after a city
 * ("Atlanta, GA", "Austin, Texas"); a country by name or alias, the last comma
 * part first ("Manila, Philippines", and "Cebu, PH" by its region code); the
 * last part within two edits ("PHILLIPINES"); a country among the words of an
 * answer with no comma ("Lagos Nigeria"). A city part is never fuzzy-matched
 * ("Albany" is not Albania).
 */
export function recogniseCountry(text: string | null | undefined): string | null {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw || NON_ANSWERS.has(fold(raw))) return null;
  if (recognisedCache.has(raw)) return recognisedCache.get(raw) ?? null;
  const parts = raw
    .split(/[,;/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  let found: string | null = null;
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    const whole = parts.length === 1;
    found = subnationalCountry(last, whole);
    for (let i = parts.length - 1; !found && i >= 0; i -= 1) found = exactCountry(parts[i], i === parts.length - 1);
    found = found ?? fuzzyCountry(last) ?? countryInWords(raw);
  }
  recognisedCache.set(raw, found);
  return found;
}

/**
 * Free text to a country name (contract §3): recogniseCountry's answer, else
 * the last comma part as typed, in title case. Nothing given: "Unknown".
 */
export function normaliseCountry(text: string | null | undefined): string {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw || NON_ANSWERS.has(fold(raw))) return UNKNOWN_COUNTRY;
  const found = recogniseCountry(raw);
  if (found) return found;
  const parts = raw
    .split(/[,;/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return titleCase(parts[parts.length - 1] ?? raw) || UNKNOWN_COUNTRY;
}

/** A location question that names a country or a city: its answer is the
 *  place, as typed. "Your location" and "where will you work" are weaker:
 *  their answers count only when they name a country ("Home" is not one). */
function asksCountryOrCity(text: string | null | undefined): boolean {
  return !!text && /\b(country|countries|city)\b/i.test(text);
}

/**
 * Where the applicant is, from the job's own form (contract §3): the answer
 * to a question that asks where they are, in `notes.applicationAnswers`
 * (each answer keeps its question's words, so an edited job still matches),
 * else the form attempt's `draft` while they are still on the form. A
 * question naming a country or city is read first; an answer that is not a
 * place ("Yes", to "Do you have a quiet location?") is passed over.
 */
export function countryFrom(answers: unknown, questions: unknown, draft: unknown): string {
  const asked = (Array.isArray(questions) ? questions : [])
    .map(obj)
    .filter((q): q is Obj => !!q && isLocationQuestion(str(q.question)))
    .map((q) => ({ id: str(q.id), strong: asksCountryOrCity(str(q.question)) }))
    .filter((q): q is { id: string; strong: boolean } => !!q.id);
  const found: Array<{ answer: string; strong: boolean }> = [];
  for (const raw of Array.isArray(answers) ? answers : []) {
    const a = obj(raw);
    if (!a) continue;
    const id = str(a.questionId);
    const words = str(a.question);
    const byId = id ? asked.find((q) => q.id === id) : undefined;
    if (!byId && !isLocationQuestion(words)) continue;
    const answer = str(a.answer);
    if (answer) found.push({ answer, strong: byId?.strong || asksCountryOrCity(words) });
  }
  const d = obj(draft);
  if (d) {
    for (const q of asked) {
      const answer = str(d[q.id]);
      if (answer) found.push({ answer, strong: q.strong });
    }
  }
  for (const f of found) {
    if (!f.strong) continue;
    const country = normaliseCountry(f.answer);
    if (country !== UNKNOWN_COUNTRY) return country;
  }
  for (const f of found) {
    if (f.strong) continue;
    const country = recogniseCountry(f.answer);
    if (country) return country;
  }
  return UNKNOWN_COUNTRY;
}

/* ── Phone (Remove and block, docs/APPLICANTS-LIST.md §6) ──────────────── */

/** A phone as a block stores it: its digits, 7 to 15 of them, else null
 *  (applicant_phone_key in supabase/migrations/20261007022249_block_applicants.sql). */
export function phoneKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

const PHONE_TYPES = new Set(["tel", "phone", "telephone", "mobile"]);
const PHONE_WORDS = /\b(phone|whats\s?app|mobile)\b/i;

function questionType(value: unknown): string {
  return (str(value) ?? "text").toLowerCase();
}

/**
 * The phone the applicant typed on the job's form: the first answer to a
 * phone-type question, else a free-text question that asks for a phone,
 * WhatsApp or mobile number (the profile's contactFacts and the block's
 * applicant_phone_from_notes read it the same way); while they are still on
 * the form, the same questions in its draft. Digits only, or null.
 */
export function phoneFrom(answers: unknown, questions: unknown, draft: unknown): string | null {
  const stored = (Array.isArray(answers) ? answers : []).map(obj).filter((a): a is Obj => !!a);
  for (const a of stored) {
    const key = PHONE_TYPES.has(questionType(a.type)) ? phoneKey(a.answer) : null;
    if (key) return key;
  }
  for (const a of stored) {
    const key = questionType(a.type) === "text" && PHONE_WORDS.test(str(a.question) ?? "") ? phoneKey(a.answer) : null;
    if (key) return key;
  }
  const d = obj(draft);
  if (!d) return null;
  const asked = (Array.isArray(questions) ? questions : []).map(obj).filter((q): q is Obj => !!q && !!str(q.id));
  const phoneQuestions = [
    ...asked.filter((q) => PHONE_TYPES.has(questionType(q.type))),
    ...asked.filter((q) => questionType(q.type) === "text" && PHONE_WORDS.test(str(q.question) ?? "")),
  ];
  for (const q of phoneQuestions) {
    const key = phoneKey(d[str(q.id)!]);
    if (key) return key;
  }
  return null;
}

/* ── One row (contract §2) ─────────────────────────────────────────────── */

/** "Active now" and the avatar's live dot. */
export const LIVE_NOW_MS = 2 * MINUTE;

/** The job's journey (Application, Skills check when it has one, its steps,
 *  Decision), built once per job: the filter's "Where they are" options. */
export function journeyForJob(job: ApplicantListJob | null | undefined): CandidateJourneyStep[] {
  const quiz = Array.isArray(job?.quiz_questions) ? (job!.quiz_questions as unknown[]) : [];
  return buildCandidateJourney((Array.isArray(job?.workflow_steps) ? job!.workflow_steps : []) as WorkflowStepLike[], { hasQuiz: quiz.length > 0 });
}

/**
 * Which tab a person sits on (contract §1). Exactly one, in this order:
 * Declined, Interview (interview, offer, hired), Needs review (finished every
 * test, not decided), Taking tests now (a live attempt: doing, away from it,
 * or being checked inside the server's 7-minute claim), Part-way (everyone
 * else). `liveState` is the row's, after effectiveLiveState.
 */
export function tabFor(input: { status: string | null | undefined; finished: boolean; liveState: LiveState | null | undefined }): ApplicantOwnTab {
  const status = input.status ?? "";
  if (status === "rejected") return "declined";
  if (status === "interview" || status === "offered" || status === "hired") return "interview";
  if (input.finished) return "needs-review";
  if (input.liveState && LIVE_NOW_STATES.has(input.liveState)) return "taking-tests";
  return "part-way";
}

function initialsOf(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

/** The profile's dot state in the list's words (the same five states). */
function listDotState(state: JourneyDotState): DotState {
  return state === "not_reached" ? "todo" : state;
}

/**
 * The step's bars they came in under, in the filter's terms.
 *
 * The chat practice: "chat-practice" when its mark is under the pass mark,
 * and "typing" when the typing measured in it (docs/TYPING-IN-CHAT.md) is
 * under the chat step's bar on speed or reply time, but only on a job with
 * no typing step (the record's `jobMeasure`; the row also checks the job's
 * own steps): a job that still has one reads typing from its typing test,
 * as before.
 */
function belowFor(e: AssessmentEntry, jobHasTypingStep: boolean): BelowKind[] {
  if (e.status !== "done") return [];
  const d = e.detail;
  if (e.stepType === "quiz" && d?.kind === "quiz") return d.passed === false ? ["skills-check"] : [];
  if (e.stepType === "typing_test") return /^Below\b/.test(e.verdict ?? "") ? ["typing"] : [];
  if (e.stepType === "equipment_check" && d?.kind === "equipment_check") return d.meetsBars === false ? ["connection"] : [];
  if (e.stepType === "chat_simulation") {
    if (d?.kind !== "chat_simulation") return e.tone === "amber" ? ["chat-practice"] : [];
    const kinds: BelowKind[] = [];
    if (d.belowPassMark === true) kinds.push("chat-practice");
    if (!jobHasTypingStep && chatTypingBelowBar(d.typing)) kinds.push("typing");
    return kinds;
  }
  return [];
}

/** Options for one row. */
export interface ListRowExtra {
  /** EVERY attempt of this application (superseded ones too): the last move
   *  and the country of someone still on the form come from here. */
  sessions?: readonly AssessmentSessionRow[] | null;
  /** The booked interview's time, when status is interview. */
  interviewAt?: string | null;
  jobTitle?: string | null;
}

/**
 * Every value one row shows (contract §2), from the record the full profile
 * builds. `journey` is the job's (journeyForJob); the dots follow the
 * record's own steps when it has them, so a job edited since is read the way
 * the profile reads it.
 */
export function listRowFor(
  app: ApplicantListApp,
  record: AssessmentRecord,
  journey: readonly CandidateJourneyStep[] | null | undefined,
  now: number,
  extra: ListRowExtra = {},
): ApplicantListRow {
  const status = app.status ?? "";
  const decided = isDecided(status);
  const onForm = status === "in_progress";
  const sessions = (extra.sessions ?? []).filter((s): s is AssessmentSessionRow => !!s && typeof s.step_id === "string");
  const notes = parseApplicationNotes(app.notes ?? null);
  const scorecard = obj(app.ai_scorecard);

  // ── The dots: the profile's own rule (applicantProfile.journeyDots), so
  // a row and the rail it opens can never disagree. A record with no steps
  // (none on file yet) falls back to the job's journey, nothing reached. ──
  const fromRecord = journeyDots(record, status);
  const profileDots: JourneyDot[] =
    fromRecord.length > 0
      ? fromRecord
      : [
          ...(journey ?? [])
            .filter((s) => s.id !== DECISION_STAGE_ID)
            .map((s): JourneyDot => ({ id: s.id, title: s.title, type: s.type, state: "not_reached", left: false, entry: null })),
          { id: DECISION_STAGE_ID, title: titleFor(DECISION_STAGE_ID), type: DECISION_STAGE_ID, state: decided ? "done" : "not_reached", left: false, entry: null },
        ];
  const steps = profileDots.filter((d) => d.id !== DECISION_STAGE_ID);
  const live = record.live;
  const dots: ApplicantDot[] = profileDots.map((d) => ({ stepId: d.id, stepType: d.type, title: d.title, state: listDotState(d.state), left: d.left }));
  const stepDots = dots.slice(0, -1);
  const finished = stepDots.length > 0 && stepDots.every((d) => d.state === "done" || d.state === "below" || d.state === "skipped");
  const stepTotal = dots.length;

  // Where they are: the line's own step (the live attempt, else the step in
  // progress, else, parked on a finished step, the first not reached). None
  // once finished or decided.
  let stepIndex: number | null = null;
  if (!decided && !finished) {
    const at = lineStepIndex(profileDots, live?.stepId);
    stepIndex = at >= 0 ? at : null;
  }
  const current = stepIndex != null ? steps[stepIndex] : null;

  // ── The last move: newest attempt activity or recorded completion ──
  const times: number[] = [];
  for (const s of sessions) {
    const t = toMillis(s.last_activity_at) ?? toMillis(s.started_at);
    if (t != null) times.push(t);
  }
  for (const e of record.entries) {
    const t = toMillis(e.completedAt);
    if (t != null) times.push(t);
    // Reaching "Continue on your computer" on a phone is a move too.
    const w = toMillis(e.waiting?.at);
    if (w != null) times.push(w);
  }
  const lastActiveMs = times.length > 0 ? Math.max(...times) : toMillis(app.created_at);
  const lastActiveAt = lastActiveMs != null ? new Date(lastActiveMs).toISOString() : null;
  const liveNow = !decided && lastActiveMs != null && now - lastActiveMs <= LIVE_NOW_MS;
  // A claim checked past the server's 7-minute limit reads as failed: its
  // request died, and nothing else would ever move them off "Taking tests now".
  const liveSession = live ? sessions.find((s) => s.id === steps.find((d) => d.id === live.stepId)?.entry?.session?.id) ?? null : null;
  const liveState = !decided ? effectiveLiveState(live, liveSession, now) : null;

  // ── The line under the dots: the profile's rail says the same words ──
  const recommendedAction = str(scorecard?.recommendedAction);
  const line: LineSegment[] =
    journeyLineRuns(profileDots, status, { live, sessions, recommendedAction, now }) ?? [{ text: onForm ? "Filling in the form" : "Applied", tone: "soft" }];
  const lineText = line.map((s) => s.text).join("");

  // ── Last active words ──
  const interviewMs = status === "interview" ? toMillis(extra.interviewAt) : null;
  let activeWords: string;
  let activeTone: ListTone = "soft";
  if (decided) {
    // No column says when the decision was made; a decision is a staff write,
    // so the row's last write is the nearest there is (never "last active").
    activeWords = interviewMs != null ? interviewWords(interviewMs, now) : `Decided ${dayWords(toMillis(app.updated_at) ?? lastActiveMs ?? now, now)}`;
  } else if (liveNow) {
    activeWords = "Active now";
    activeTone = "jade";
  } else if (liveState && LIVE_NOW_STATES.has(liveState)) {
    // In a test, being checked, or away from it for a moment: jade. Not a
    // check that failed, and not someone who left.
    activeWords = `Active ${agoWords(lastActiveMs, now)}`;
    activeTone = "jade";
  } else if (finished) {
    activeWords = `Done ${agoWords(lastActiveMs, now)}`;
  } else {
    // Someone who walked away reads "Last active 20 h ago" too, as on the
    // approved mockup: the line beside it already says "Left at …".
    activeWords = `Last active ${agoWords(lastActiveMs, now)}`;
  }

  // ── Flags: the record's own total, earlier attempts included ──
  const integrity: IntegrityTally | null = record.entries.find((e) => e.key === "integrity")?.integrity ?? null;
  const kinds: FlagKind[] = [];
  if (integrity && integrity.tabSwitches > 0) kinds.push("left-window");
  if (integrity && integrity.copyPaste > 0) kinds.push("copy-paste");

  const below: BelowKind[] = [];
  // The chat practice's typing counts as the job's typing only when the job
  // has no typing step (its own steps, as the dots read them).
  const jobHasTypingStep = steps.some((d) => d.type === "typing_test");
  for (const s of steps) {
    for (const kind of s.entry ? belowFor(s.entry, jobHasTypingStep) : []) {
      if (!below.includes(kind)) below.push(kind);
    }
    const d = s.entry?.detail;
    if (d?.kind === "equipment_check" && d.deviceKind === "phone" && !below.includes("phone")) below.push("phone");
  }

  // ── Score: ai_score only ──
  const rawScore = num(app.ai_score);
  const score = rawScore != null ? Math.round(rawScore) : null;
  const scoreKind: ScoreKind = score == null ? "none" : scorecard?.decisionState === "needs_more_evidence" ? "so_far" : "final";

  // ── Country, applied, name ──
  const formSessions = sessions.filter((s) => s.step_type === "application");
  const draft = [...formSessions].sort((a, b) => (b.attempt ?? 1) - (a.attempt ?? 1)).find((s) => obj(s.draft))?.draft ?? null;
  const country = countryFrom(notes.applicationAnswers, app.jobs?.application_questions, draft);
  const phone = phoneFrom(notes.applicationAnswers, app.jobs?.application_questions, draft);
  // Applied = when they pressed Apply (created_at), the one definition the
  // profile's header and timeline use too. (The form's own end would say
  // "applied 1 h ago" here and "Applied 3 days ago" on the profile.)
  const appliedMs = toMillis(app.created_at);
  const appliedAgo = agoWords(appliedMs, now);

  const profile = app.profiles ?? null;
  const name = str(profile?.full_name) ?? str(profile?.email) ?? "Applicant";
  const tab = tabFor({ status, finished, liveState });

  return {
    id: app.id,
    jobId: app.job_id ?? app.jobs?.id ?? null,
    jobTitle: extra.jobTitle ?? str(app.jobs?.title) ?? null,
    candidateId: app.candidate_id ?? null,
    name,
    email: str(profile?.email),
    avatarUrl: str(profile?.avatar_url),
    initials: initialsOf(name),
    status,
    tab,
    // The profile header's chip, by the same rule (Needs review = the tab's).
    chip: applicantChip(status, finished),
    country,
    appliedAt: appliedMs != null ? new Date(appliedMs).toISOString() : null,
    appliedWords: `${onForm ? "started" : "applied"} ${appliedAgo}`,
    appliedAgo,
    onForm,
    dots,
    stepIndex,
    currentStepId: current?.id ?? null,
    stepTotal,
    line,
    lineText,
    lastActiveAt,
    activeWords,
    activeTone,
    liveNow,
    liveState,
    finished,
    decided,
    flags: { count: record.integrityTotal, kinds, tooltip: integrity && record.integrityTotal > 0 ? integritySummary(integrity) : null },
    below,
    score,
    scoreKind,
    scoreTone: score == null ? "muted" : score >= 70 ? "jade" : score >= 50 ? "brass" : "ink",
    scoreWords: scoreKind === "so_far" ? "so far" : scoreKind === "none" ? "not scored yet" : null,
    recommendedAction,
    interviewAt: interviewMs != null ? new Date(interviewMs).toISOString() : null,
    phone,
    record,
  };
}

/** Plain data compared by value, a few levels deep (a row's dots, line,
 *  flags and chip). */
function sameData(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth > 4 || !a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameData(x, b[i], depth + 1));
  }
  const ka = Object.keys(a as Obj);
  const kb = Object.keys(b as Obj);
  return ka.length === kb.length && ka.every((k) => sameData((a as Obj)[k], (b as Obj)[k], depth + 1));
}

/** Two builds of one row say the same thing: every value the list draws or
 *  filters on is equal. (`record` is left out: nothing on the list draws it,
 *  and a refetch rebuilds every record from new but equal rows.) */
function sameRow(a: ApplicantListRow, b: ApplicantListRow): boolean {
  const keys = Object.keys(b) as Array<keyof ApplicantListRow>;
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((key) => key === "record" || sameData(a[key], b[key]));
}

/* ── Building every row, memoised per row ──────────────────────────────── */

export interface ApplicantRowsInput {
  apps: readonly ApplicantListApp[];
  /** Every attempt for these jobs (any status). */
  sessions?: readonly AssessmentSessionRow[] | null;
  reopens?: readonly StepReopenRow[] | null;
  jobs: readonly ApplicantListJob[];
  interviews?: readonly ApplicantListInterview[] | null;
  now: number;
}

interface CachedRecord {
  app: ApplicantListApp;
  job: ApplicantListJob | null;
  sessions: readonly AssessmentSessionRow[];
  reopens: readonly StepReopenRow[];
  record: AssessmentRecord;
  /** Its record reads the clock (an attempt under way: "Away for 3 min",
   *  "left" after ten quiet minutes): rebuilt on every tick, the rest are not. */
  ticks: boolean;
  builtAt: number;
}

/**
 * Whether a record's own words can change with the clock alone: an attempt
 * still `active` and not yet quiet for ten minutes (it turns "left", its
 * "away" ages). Nothing else in a record ages: a decided applicant has no
 * live state, an `abandoned` or `failed` attempt is past changing, and the
 * 7-minute claim limit and every "… ago" are read by listRowFor, which runs
 * on every tick anyway. So the rebuild set follows live activity, not the
 * pipeline's history (an attempt left for good stays `active` for ever: no
 * cron closes it).
 */
function readsTheClock(app: ApplicantListApp, sessions: readonly AssessmentSessionRow[], now: number): boolean {
  if (isDecided(app.status)) return false;
  return sessions.some((s) => {
    if (s.status !== "active") return false;
    const at = toMillis(s.last_activity_at) ?? toMillis(s.started_at);
    return at == null || now - at < LEFT_AFTER_MS;
  });
}
const NO_SESSIONS: readonly AssessmentSessionRow[] = [];
const NO_REOPENS: readonly StepReopenRow[] = [];

function sameList<T>(a: readonly T[] | undefined, b: readonly T[]): boolean {
  return !!a && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Groups rows by application, keeping last time's array when its rows are
 *  the same objects (the live merge replaces only the row that changed). */
function groupBy<T extends { application_id?: string | null }>(rows: readonly T[] | null | undefined, previous: Map<string, readonly T[]>): Map<string, readonly T[]> {
  const fresh = new Map<string, T[]>();
  for (const row of rows ?? []) {
    if (!row?.application_id) continue;
    const list = fresh.get(row.application_id) ?? [];
    list.push(row);
    fresh.set(row.application_id, list);
  }
  const out = new Map<string, readonly T[]>();
  for (const [id, list] of fresh) {
    const before = previous.get(id);
    out.set(id, before && sameList(before, list) ? before : list);
  }
  return out;
}

/**
 * A row builder with its own memory: a person's record is rebuilt only when
 * their application, attempts, hand-backs or job changed, or, for someone
 * in a test right now, when the clock moved (readsTheClock). A row that says
 * exactly what it said last time comes back as the very same object, so the
 * page redraws only the rows that changed (a heartbeat redraws one row, not
 * three hundred). One per mounted list (the hook keeps it in a ref).
 */
export function createApplicantRowBuilder() {
  const records = new Map<string, CachedRecord>();
  const lastRows = new Map<string, ApplicantListRow>();
  let sessionGroups = new Map<string, readonly AssessmentSessionRow[]>();
  let reopenGroups = new Map<string, readonly StepReopenRow[]>();
  const jobMemo = new Map<string, ApplicantListJob>();
  const journeys = new Map<ApplicantListJob, CandidateJourneyStep[]>();

  return function build(input: ApplicantRowsInput): ApplicantListRow[] {
    sessionGroups = groupBy(input.sessions, sessionGroups);
    reopenGroups = groupBy(input.reopens, reopenGroups);

    // A refetched job list hands out new objects every time (its counts move
    // on every application change); keep the old one while it is unchanged.
    const jobs = new Map<string, ApplicantListJob>();
    for (const job of input.jobs) {
      const before = jobMemo.get(job.id);
      const same = before && (before === job || (before.updated_at != null && before.updated_at === job.updated_at && before.title === job.title));
      const kept = same ? before! : job;
      jobMemo.set(job.id, kept);
      jobs.set(job.id, kept);
    }

    // The interview to name: the next one booked, else the latest.
    const interviewAt = new Map<string, string>();
    for (const i of input.interviews ?? []) {
      if (!i?.application_id || !i.scheduled_at || (i.status && i.status !== "scheduled")) continue;
      const have = interviewAt.get(i.application_id);
      const t = toMillis(i.scheduled_at) ?? 0;
      const h = have ? toMillis(have) ?? 0 : null;
      const better = h == null || (t >= input.now ? h < input.now || t < h : h < input.now && t > h);
      if (better) interviewAt.set(i.application_id, i.scheduled_at);
    }

    const seen = new Set<string>();
    const rows: ApplicantListRow[] = [];
    for (const app of input.apps) {
      if (!app?.id) continue;
      seen.add(app.id);
      const job = (app.job_id ? jobs.get(app.job_id) : null) ?? null;
      const sessions = sessionGroups.get(app.id) ?? NO_SESSIONS;
      const reopens = reopenGroups.get(app.id) ?? NO_REOPENS;
      let cached = records.get(app.id);
      const stale =
        !cached ||
        cached.app !== app ||
        cached.job !== job ||
        cached.sessions !== sessions ||
        cached.reopens !== reopens ||
        (cached.ticks && cached.builtAt !== input.now);
      if (stale) {
        const record = buildAssessmentRecord({ ...app, notes: app.notes ?? null, jobs: job }, { sessions: withReopens(sessions, reopens), now: input.now });
        cached = { app, job, sessions, reopens, record, ticks: readsTheClock(app, sessions, input.now), builtAt: input.now };
        records.set(app.id, cached);
      }
      let journey = job ? journeys.get(job) : undefined;
      if (job && !journey) {
        journey = journeyForJob(job);
        journeys.set(job, journey);
      }
      const next = listRowFor({ ...app, jobs: job }, cached!.record, journey ?? null, input.now, {
        sessions,
        interviewAt: interviewAt.get(app.id) ?? null,
        jobTitle: str(job?.title),
      });
      const before = lastRows.get(app.id);
      let row = next;
      if (before && sameRow(before, next)) {
        // The same object, carrying the current record (nothing draws it).
        before.record = next.record;
        row = before;
      }
      lastRows.set(app.id, row);
      rows.push(row);
    }
    for (const id of [...records.keys()]) if (!seen.has(id)) records.delete(id);
    for (const id of [...lastRows.keys()]) if (!seen.has(id)) lastRows.delete(id);
    return rows;
  };
}

/* ── Filters, search, sort (contract §1) ───────────────────────────────── */

export type ScoreFilter = "any" | "70-up" | "50-up" | "under-50" | "not-scored";
export type FlagFilter = "any" | "none" | "left-window" | "copy-paste" | "any-flag";
export type BelowFilter = "any" | BelowKind;
export type AppliedFilter = "any" | "today" | "week" | "month";
export type SortKey = "score" | "newest" | "last-active";

export interface ApplicantListState {
  tab: ApplicantTab;
  /** "any", a journey step id, or "finished". */
  where: string;
  score: ScoreFilter;
  flags: FlagFilter;
  below: BelowFilter;
  /** "all", a country name, or "Unknown". */
  country: string;
  applied: AppliedFilter;
  /** One job (`?roleId=`), or null for all of them. */
  job: string | null;
  sort: SortKey;
  q: string;
  /** How many rows are drawn (25 at a time). */
  shown: number;
}

export const PAGE_SIZE = 25;
/** "Finished every test", as a "Where they are" value. */
export const WHERE_FINISHED = "finished";

export const DEFAULT_LIST_STATE: ApplicantListState = {
  tab: "all",
  where: "any",
  score: "any",
  flags: "any",
  below: "any",
  country: "all",
  applied: "any",
  job: null,
  sort: "score",
  q: "",
  shown: PAGE_SIZE,
};

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

export const SCORE_OPTIONS: FilterOption<ScoreFilter>[] = [
  { value: "any", label: "Any" },
  { value: "70-up", label: "70 and up" },
  { value: "50-up", label: "50 and up" },
  { value: "under-50", label: "Under 50" },
  { value: "not-scored", label: "Not scored yet" },
];

export const FLAG_OPTIONS: FilterOption<FlagFilter>[] = [
  { value: "any", label: "Any" },
  { value: "none", label: "No flags" },
  { value: "left-window", label: "Left the test window" },
  { value: "copy-paste", label: "Tried to copy or paste" },
  { value: "any-flag", label: "Any flag" },
];

export const BELOW_OPTIONS: FilterOption<BelowFilter>[] = [
  { value: "any", label: "Any" },
  { value: "skills-check", label: "Skills check" },
  // A typing test under its bar, or (on a job with no typing step) the
  // typing measured in the chat practice: its speed or its reply time.
  { value: "typing", label: "Typing" },
  { value: "connection", label: "Connection" },
  { value: "chat-practice", label: "Chat practice" },
  { value: "phone", label: "Ran on a phone" },
];

export const APPLIED_OPTIONS: FilterOption<AppliedFilter>[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export const SORT_OPTIONS: FilterOption<SortKey>[] = [
  { value: "score", label: "Score, high to low" },
  { value: "newest", label: "Newest" },
  { value: "last-active", label: "Last active" },
];

export const TAB_OPTIONS: FilterOption<ApplicantTab>[] = APPLICANT_TABS.map((value) => ({ value, label: TAB_LABELS[value] }));

/** "Where they are": Any step, every journey step of these jobs by title
 *  (first job's order, Decision left out), Finished every test. */
export function whereOptions(journeys: Iterable<readonly CandidateJourneyStep[]>): FilterOption[] {
  const out: FilterOption[] = [{ value: "any", label: "Any step" }];
  const seen = new Set<string>();
  for (const journey of journeys) {
    for (const step of journey) {
      if (step.id === DECISION_STAGE_ID || seen.has(step.id)) continue;
      seen.add(step.id);
      out.push({ value: step.id, label: step.title });
    }
  }
  out.push({ value: WHERE_FINISHED, label: "Finished every test" });
  return out;
}

/** Country: All, then the countries present, most common first, Unknown last. */
export function countryOptions(rows: readonly ApplicantListRow[]): Array<FilterOption & { count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);
  const known = [...counts.entries()]
    .filter(([c]) => c !== UNKNOWN_COUNTRY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
  const unknown = counts.get(UNKNOWN_COUNTRY);
  return [{ value: "all", label: "All", count: rows.length }, ...known, ...(unknown ? [{ value: UNKNOWN_COUNTRY, label: UNKNOWN_COUNTRY, count: unknown }] : [])];
}

/** All is everyone but the blocked; a blocked person is only on Blocked.
 *  Shortlist is whoever the team marked (never the blocked or the declined:
 *  markShortlisted leaves them unmarked), whatever tab they are on. */
export function inTab(row: ApplicantListRow, tab: ApplicantTab): boolean {
  if (tab === "all") return row.tab !== "blocked";
  if (tab === "shortlist") return row.shortlisted === true && row.tab !== "blocked";
  return row.tab === tab;
}

export function matchesWhere(row: ApplicantListRow, where: string): boolean {
  if (!where || where === "any") return true;
  if (where === WHERE_FINISHED) return row.finished;
  return row.currentStepId === where;
}

export function matchesScore(row: ApplicantListRow, score: ScoreFilter): boolean {
  switch (score) {
    case "70-up":
      return row.score != null && row.score >= 70;
    case "50-up":
      return row.score != null && row.score >= 50;
    case "under-50":
      return row.score != null && row.score < 50;
    case "not-scored":
      return row.score == null;
    default:
      return true;
  }
}

export function matchesFlags(row: ApplicantListRow, flags: FlagFilter): boolean {
  switch (flags) {
    case "none":
      return row.flags.count === 0;
    case "left-window":
      return row.flags.kinds.includes("left-window");
    case "copy-paste":
      return row.flags.kinds.includes("copy-paste");
    case "any-flag":
      return row.flags.count > 0;
    default:
      return true;
  }
}

export function matchesBelow(row: ApplicantListRow, below: BelowFilter): boolean {
  return below === "any" || row.below.includes(below);
}

export function matchesCountry(row: ApplicantListRow, country: string): boolean {
  return !country || country === "all" || row.country === country;
}

/** Today = since midnight; this week = the last 7 days; this month = the last 30. */
export function matchesApplied(row: ApplicantListRow, applied: AppliedFilter, now: number): boolean {
  if (applied === "any") return true;
  const at = toMillis(row.appliedAt);
  if (at == null) return false;
  if (applied === "today") return at >= startOfDay(now);
  if (applied === "week") return at >= now - 7 * DAY;
  return at >= now - 30 * DAY;
}

export function matchesJob(row: ApplicantListRow, job: string | null): boolean {
  return !job || row.jobId === job;
}

/** Name, email and country; every word typed must be found. */
export function matchesSearch(row: ApplicantListRow, q: string): boolean {
  const words = fold(q).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${row.name} ${row.email ?? ""} ${row.country}`);
  return words.every((w) => hay.includes(w));
}

type FilterKey = "where" | "score" | "flags" | "below" | "country" | "applied";

function passes(row: ApplicantListRow, state: ApplicantListState, now: number, skip?: FilterKey): boolean {
  return (
    (skip === "where" || matchesWhere(row, state.where)) &&
    (skip === "score" || matchesScore(row, state.score)) &&
    (skip === "flags" || matchesFlags(row, state.flags)) &&
    (skip === "below" || matchesBelow(row, state.below)) &&
    (skip === "country" || matchesCountry(row, state.country)) &&
    (skip === "applied" || matchesApplied(row, state.applied, now)) &&
    matchesSearch(row, state.q)
  );
}

function byTime(a: string | null, b: string | null): number {
  return (toMillis(b) ?? -Infinity) - (toMillis(a) ?? -Infinity);
}

/**
 * Score high to low (unscored last), Newest, or Last active. Ties, and the
 * whole unscored block, go by when they applied (newest first), then id:
 * two keys nothing a live applicant does can move. Until 2026-10-07 a tie
 * went by the last move, and in a busy hour four in five applicants are
 * unscored and a heartbeat lands every two seconds, so the default Score
 * order changed on nearly every event and the list never held still. Only
 * "Last active" reads activity, because that is what it is asked for.
 */
export function sortRows(rows: readonly ApplicantListRow[], sort: SortKey): ApplicantListRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    let d = 0;
    if (sort === "score") {
      if (a.score == null && b.score != null) return 1;
      if (b.score == null && a.score != null) return -1;
      d = (b.score ?? 0) - (a.score ?? 0);
    } else if (sort === "last-active") {
      d = byTime(a.lastActiveAt, b.lastActiveAt);
    }
    return d || byTime(a.appliedAt, b.appliedAt) || a.id.localeCompare(b.id);
  });
  return out;
}

/** Per-tab counts. They ignore every filter but the job (contract §1). A
 *  shortlisted person counts on Shortlist and on their own tab. */
export function tabCounts(rows: readonly ApplicantListRow[]): Record<ApplicantTab, number> {
  const counts = Object.fromEntries(APPLICANT_TABS.map((t) => [t, 0])) as Record<ApplicantTab, number>;
  for (const r of rows) {
    if (r.tab !== "blocked") counts.all += 1;
    if (inTab(r, "shortlist")) counts.shortlist += 1;
    counts[r.tab] += 1;
  }
  return counts;
}

/**
 * How many each option of one filter would show, with every other filter,
 * the tab and the search as they are: the counts in the phone sheet
 * ("70 and up 22", "50 and up 64").
 */
export function optionCounts(rows: readonly ApplicantListRow[], state: ApplicantListState, key: FilterKey, values: readonly string[], now: number): Record<string, number> {
  const base = rows.filter((r) => matchesJob(r, state.job) && inTab(r, state.tab) && passes(r, state, now, key));
  const out: Record<string, number> = {};
  for (const value of values) {
    const probe = { ...state, [key]: value } as ApplicantListState;
    out[value] = base.filter((r) => passes(r, probe, now)).length;
  }
  return out;
}

/** Active filters in words, for "Showing 25 of 64 · score 50 and up". The job
 *  is in the header and the search is in its box, so neither is repeated. */
const SCORE_WORDS: Record<string, string> = { "70-up": "score 70 and up", "50-up": "score 50 and up", "under-50": "score under 50", "not-scored": "not scored yet" };
const FLAG_WORDS: Record<string, string> = { none: "no flags", "left-window": "left the test window", "copy-paste": "tried to copy or paste", "any-flag": "with flags" };
const APPLIED_WORDS: Record<string, string> = { today: "applied today", week: "applied this week", month: "applied this month" };

export function filterWords(state: ApplicantListState, stepTitle?: (stepId: string) => string | null | undefined): string[] {
  const words: string[] = [];
  if (state.where === WHERE_FINISHED) words.push("finished every test");
  else if (state.where && state.where !== "any") words.push(`at ${lowerFirst(stepTitle?.(state.where) ?? state.where)}`);
  if (SCORE_WORDS[state.score]) words.push(SCORE_WORDS[state.score]);
  if (FLAG_WORDS[state.flags]) words.push(FLAG_WORDS[state.flags]);
  if (state.below === "phone") words.push("ran on a phone");
  else if (state.below !== "any") words.push(`below the bar on ${lowerFirst(BELOW_OPTIONS.find((o) => o.value === state.below)?.label ?? state.below)}`);
  if (state.country && state.country !== "all") words.push(state.country === UNKNOWN_COUNTRY ? "country unknown" : `from ${state.country}`);
  if (APPLIED_WORDS[state.applied]) words.push(APPLIED_WORDS[state.applied]);
  return words;
}

/** The phone's Filters badge: filters set, not counting the job or the search. */
export function activeFilterCount(state: ApplicantListState): number {
  return (
    Number(state.where !== "any") +
    Number(state.score !== "any") +
    Number(state.flags !== "any") +
    Number(state.below !== "any") +
    Number(state.country !== "all") +
    Number(state.applied !== "any")
  );
}

export interface ApplicantListView {
  /** Everyone in the job's scope (all jobs when none is chosen). */
  scoped: ApplicantListRow[];
  tabCounts: Record<ApplicantTab, number>;
  /** The tab, filters and search applied, in the chosen order. */
  matched: ApplicantListRow[];
  /** The first `state.shown` of them. */
  shown: ApplicantListRow[];
  total: number;
  hasMore: boolean;
  words: string[];
}

/** The whole list for one state: what the page draws. */
export function applyListState(rows: readonly ApplicantListRow[], state: ApplicantListState, now: number, stepTitle?: (stepId: string) => string | null | undefined): ApplicantListView {
  const scoped = rows.filter((r) => matchesJob(r, state.job));
  const matched = sortRows(
    scoped.filter((r) => inTab(r, state.tab) && passes(r, state, now)),
    state.sort,
  );
  const shown = matched.slice(0, Math.max(PAGE_SIZE, state.shown));
  return { scoped, tabCounts: tabCounts(scoped), matched, shown, total: matched.length, hasMore: matched.length > shown.length, words: filterWords(state, stepTitle) };
}

/* ── The URL (contract §1) ─────────────────────────────────────────────── */

const TAB_SET = new Set<string>(APPLICANT_TABS);
const SCORE_SET = new Set<string>(SCORE_OPTIONS.map((o) => o.value));
const FLAG_SET = new Set<string>(FLAG_OPTIONS.map((o) => o.value));
const BELOW_SET = new Set<string>(BELOW_OPTIONS.map((o) => o.value));
const APPLIED_SET = new Set<string>(APPLIED_OPTIONS.map((o) => o.value));
const SORT_SET = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** The params this list owns; everything else on the URL is left alone. */
export const LIST_PARAMS = ["tab", "where", "score", "flags", "below", "country", "applied", "roleId", "sort", "q", "shown"] as const;

/**
 * `?tab=` values from before the list, still linked from the Dashboard and
 * old notifications: applying / started / reading → Part-way (whether they
 * are live is not knowable from a link), sealed → All, passed → Declined.
 */
export function tabFromParam(value: string | null | undefined): ApplicantTab {
  if (!value) return "all";
  if (TAB_SET.has(value)) return value as ApplicantTab;
  switch (value) {
    case "applying":
    case "started":
    case "reading":
      return "part-way";
    case "passed":
      return "declined";
    default:
      // "sealed" and anything unknown.
      return "all";
  }
}

function pick<T extends string>(value: string | null, allowed: Set<string>, fallback: T): T {
  return value != null && allowed.has(value) ? (value as T) : fallback;
}

/** The list's state from the URL; anything missing or unknown is the default. */
export function parseListState(search: string | URLSearchParams): ApplicantListState {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const shown = Number.parseInt(p.get("shown") ?? "", 10);
  return {
    tab: tabFromParam(p.get("tab")),
    where: str(p.get("where")) ?? "any",
    score: pick(p.get("score"), SCORE_SET, "any"),
    flags: pick(p.get("flags"), FLAG_SET, "any"),
    below: pick(p.get("below"), BELOW_SET, "any"),
    country: str(p.get("country")) ?? "all",
    applied: pick(p.get("applied"), APPLIED_SET, "any"),
    job: str(p.get("roleId")),
    sort: pick(p.get("sort"), SORT_SET, "score"),
    q: p.get("q") ?? "",
    shown: Number.isFinite(shown) && shown > PAGE_SIZE ? Math.min(shown, 10_000) : PAGE_SIZE,
  };
}

/**
 * The URL for a state, keeping every param the list does not own
 * (`__preview*`, anything newer) where it was. Defaults are left off, so a
 * plain list is a plain `/applicants`. Write it with replace, not push.
 */
export function serializeListState(state: ApplicantListState, current: string | URLSearchParams = ""): URLSearchParams {
  const next = new URLSearchParams(typeof current === "string" ? current : current.toString());
  const set = (key: string, value: string | null, fallback: string) => {
    if (value == null || value === "" || value === fallback) next.delete(key);
    else next.set(key, value);
  };
  set("tab", state.tab, "all");
  set("where", state.where, "any");
  set("score", state.score, "any");
  set("flags", state.flags, "any");
  set("below", state.below, "any");
  set("country", state.country, "all");
  set("applied", state.applied, "any");
  set("roleId", state.job, "");
  set("sort", state.sort, "score");
  set("q", state.q.trim() ? state.q : "", "");
  set("shown", state.shown > PAGE_SIZE ? String(state.shown) : null, "");
  return next;
}

/** `/applicants?applicationId=<id>` (an older notification's link) goes to
 *  the profile: the path to redirect to, or null. */
export function profileRedirectFor(search: string | URLSearchParams): string | null {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const id = str(p.get("applicationId"));
  if (!id || !/^[A-Za-z0-9-]+$/.test(id)) return null;
  return `/applicants/${id}`;
}

/* ── The list holds still while it is read (2026-10-07) ────────────────── */

/**
 * The owner, 2026-10-07, with 31 applications in an hour: "the page is doing
 * this weird refresh thing … there's too much weird shit going on." Every
 * heartbeat of a live applicant re-sorted the list, and every row a re-sort
 * moved replayed its entrance fade, so the whole list blinked every couple
 * of seconds.
 *
 * So the order on screen is HELD (docs/APPLICANTS-LIST.md §1, "The list holds
 * still"). It is taken when the list lands, and taken again only when he
 * changes the tab, a filter, the sort or the search, presses the update bar,
 * or comes back to the page. In between, each row's own facts (live dot, the
 * one line, last active, flags, score) still change in place, but no row
 * moves, none is added, and the tab counts stand still. What WOULD move
 * collects as ListUpdates and is shown as one quiet bar ("12 new · 5 moved
 * · Show"). A row deleted in the meantime simply leaves: that moves nobody.
 */
export interface ApplicantListHold {
  /** The tab, filters, sort, search and job it was taken for (listHoldKey).
   *  `shown` is not part of it: "Show 25 more" draws further down the same
   *  held order. */
  key: string;
  /** Everyone the tab and filters matched, in the order drawn. */
  order: readonly string[];
  /** Every applicant the list held, on any job: anyone else is new. */
  known: ReadonlySet<string>;
  /** Everyone in the job's scope, with the tab each was on: the tab counts. */
  tabs: ReadonlyMap<string, ApplicantTab>;
  /** Applicants whose own changes show at once (settleApplicantHold): the
   *  owner just acted on them, so their tab counts as it is now and they
   *  leave a list they no longer match. */
  follow?: ReadonlySet<string>;
}

/** What is waiting for the update bar: only what Show would change in THIS
 *  list (its tab, filters and search). A change on another tab moves no row
 *  here, so it never waits in the bar; the tab counts take it in silently
 *  the next time the list is taken. */
export interface ListUpdates {
  /** Applicants new since the hold who would join this list. */
  fresh: number;
  /** Held applicants who would change place in this list: into it, out of
   *  it, or to another position in it. A position change counts the fewest
   *  rows that would have to move, so one row rising past twelve others is
   *  1, not 13. */
  moved: number;
}

export const NO_LIST_UPDATES: ListUpdates = { fresh: 0, moved: 0 };

/** The list as it is drawn while held, plus what is waiting. */
export interface HeldListView extends ApplicantListView {
  updates: ListUpdates;
}

/** The view a hold belongs to: every part of the state but `shown`. */
export function listHoldKey(state: ApplicantListState): string {
  const rest: Partial<ApplicantListState> = { ...state, q: state.q.trim() };
  delete rest.shown;
  return JSON.stringify(rest);
}

/** Holds the list as it is now: the order drawn, who is known, each one's tab. */
export function holdApplicantList(rows: readonly ApplicantListRow[], live: ApplicantListView, state: ApplicantListState): ApplicantListHold {
  return {
    key: listHoldKey(state),
    order: live.matched.map((r) => r.id),
    known: new Set(rows.map((r) => r.id)),
    tabs: new Map(live.scoped.map((r) => [r.id, r.tab] as const)),
  };
}

/** Indexes of `seq` that are outside one longest increasing run of it: the
 *  fewest entries that would have to move to put it in order (O(n log n)). */
function outOfOrder(seq: readonly number[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i += 1) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.length > 0 ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) keep.add(i);
  const out: number[] = [];
  for (let i = 0; i < seq.length; i += 1) if (!keep.has(i)) out.push(i);
  return out;
}

/** Tabs only the hiring team puts anyone on (Blocked, lib/blockedApplicants.ts).
 *  Strings, so this rule needs nothing from the tab list itself. */
const STAFF_ONLY_TABS: ReadonlySet<string> = new Set(["blocked"]);

/**
 * Whether a held applicant's own change shows at once rather than waiting
 * for the bar: one the owner settled, or a move onto or off a staff-only tab.
 * Blocking someone is the hiring team's own act, a delete in the owner's
 * words ("delete … and that will just block them too"), so the row leaves at
 * once, the way a deleted row does; that moves no one else.
 */
function followsLive(hold: ApplicantListHold, row: ApplicantListRow): boolean {
  if (hold.follow?.has(row.id)) return true;
  const was = hold.tabs.get(row.id);
  return was !== undefined && was !== row.tab && (STAFF_ONLY_TABS.has(was) || STAFF_ONLY_TABS.has(row.tab));
}

/** The held applicants whose changes show at once (followsLive). */
function followedIds(hold: ApplicantListHold, live: ApplicantListView): Set<string> {
  const out = new Set<string>();
  for (const r of live.scoped) if (hold.known.has(r.id) && followsLive(hold, r)) out.add(r.id);
  return out;
}

/**
 * What Show would change in this list since the hold: who would join it
 * (new, or a held applicant from another tab), leave it, or sit elsewhere in
 * it. Nothing else: a new applicant on another tab, or a teammate moving
 * someone between two other tabs, moves no row here (2026-10-07: the bar
 * said "5 new · Show" on the Interview tab and Show changed nothing).
 */
export function listUpdates(hold: ApplicantListHold, live: ApplicantListView): ListUpdates {
  const followed = followedIds(hold, live);
  let fresh = 0;
  const moved = new Set<string>();
  const present = new Set(live.scoped.map((r) => r.id));
  const heldAt = new Map(hold.order.map((id, i) => [id, i] as const));
  const matchedNow = new Set(live.matched.map((r) => r.id));
  // Left this list: off its tab, or no longer through the filters or search.
  for (const id of hold.order) if (present.has(id) && !matchedNow.has(id) && !followed.has(id)) moved.add(id);
  // Joined it, or would sit somewhere else in it.
  const seq: number[] = [];
  const seqIds: string[] = [];
  for (const r of live.matched) {
    const at = heldAt.get(r.id);
    if (at === undefined) {
      if (hold.known.has(r.id)) moved.add(r.id);
      else fresh += 1;
      continue;
    }
    if (followed.has(r.id)) continue;
    seq.push(at);
    seqIds.push(r.id);
  }
  for (const i of outOfOrder(seq)) moved.add(seqIds[i]);
  return { fresh, moved: moved.size };
}

/**
 * The list as held, each row as it is now: the held order (a row deleted
 * since is left out, which moves no one), the tab counts as they were held,
 * and what is waiting. `live` is applyListState over the current rows.
 */
export function heldListView(hold: ApplicantListHold, live: ApplicantListView, state: ApplicantListState): HeldListView {
  const followed = followedIds(hold, live);
  const byId = new Map(live.scoped.map((r) => [r.id, r] as const));
  const matchedNow = new Set(live.matched.map((r) => r.id));
  const matched: ApplicantListRow[] = [];
  for (const id of hold.order) {
    const row = byId.get(id);
    if (!row) continue;
    if (followed.has(id) && !matchedNow.has(id)) continue;
    matched.push(row);
  }
  const shown = matched.slice(0, Math.max(PAGE_SIZE, state.shown));
  const scoped = live.scoped.filter((r) => hold.tabs.has(r.id));
  // Counted by tabCounts' own rule, each on the tab it was held on.
  const counts = tabCounts(
    scoped.map((r) => {
      const tab = followed.has(r.id) ? r.tab : hold.tabs.get(r.id)!;
      return tab === r.tab ? r : { ...r, tab };
    }),
  );
  return {
    scoped,
    tabCounts: counts,
    matched,
    shown,
    total: matched.length,
    hasMore: matched.length > shown.length,
    words: live.words,
    updates: listUpdates(hold, live),
  };
}

/**
 * Shows the owner's own change to these applicants at once, and nobody
 * else's: from now until the list is next taken, their tab counts as it is
 * and they leave a list they no longer match. For an action taken from the
 * list itself (decline, delete, block): his own click must not wait in the
 * update bar. Applicants the hold never had are left to the bar.
 */
export function settleApplicantHold(hold: ApplicantListHold, ids: readonly string[]): ApplicantListHold {
  const add = ids.filter((id) => hold.known.has(id) && !hold.follow?.has(id));
  if (add.length === 0) return hold;
  return { ...hold, follow: new Set([...(hold.follow ?? []), ...add]) };
}
