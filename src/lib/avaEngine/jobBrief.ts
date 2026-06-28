/**
 * JobBrief — the structured object Ava extracts during voice intake, plus helpers to
 * merge tool output, map it onto the existing form payload (briefFields), and compute
 * which critical fields are still missing. Extraction itself is done by the realtime model
 * via the `set_brief_fields` tool; this module assembles + maps the result. Nothing here
 * invents data — empty in, empty out.
 */
export type WorkMode = "onsite" | "hybrid" | "remote";
export type EmploymentType = "full-time" | "part-time" | "contract" | "temporary";

export interface JobBriefPay {
  amount?: number;
  min?: number;
  max?: number;
  unit?: "hour" | "year" | "month";
  currency?: "USD";
  rawText?: string;
}

export interface JobBrief {
  roleTitle?: string;
  location?: string;
  workMode?: WorkMode;
  employmentType?: EmploymentType;
  pay?: JobBriefPay;
  startDateText?: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  dealBreakers: string[];
  benefits: string[];
  rawTranscript: string;
  missingCriticalFields: string[];
  confidence: number;
}

/** The existing create-job form payload (briefFields) the pipeline already consumes. */
export interface BriefFormPayload {
  role: string;
  location: string;
  type: string;
  pay: string;
  start: string;
  work: string;
}

export function emptyJobBrief(): JobBrief {
  return {
    responsibilities: [], requirements: [], niceToHave: [], dealBreakers: [], benefits: [],
    rawTranscript: "", missingCriticalFields: [], confidence: 0,
  };
}

const WORK_MODES: WorkMode[] = ["onsite", "hybrid", "remote"];
const EMP_TYPES: EmploymentType[] = ["full-time", "part-time", "contract", "temporary"];

function uniqStrings(prev: string[], add: unknown): string[] {
  if (!Array.isArray(add)) return prev;
  const out = [...prev];
  for (const item of add) {
    const s = typeof item === "string" ? item.trim() : "";
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

function parsePay(raw: string): JobBriefPay {
  const pay: JobBriefPay = { rawText: raw.trim(), currency: "USD" };
  const lower = raw.toLowerCase();
  if (/\b(hr|hour|hourly)\b|\/h/.test(lower)) pay.unit = "hour";
  else if (/\b(year|yr|annual|annually)\b|\/yr|\dk\b|k\b/.test(lower)) pay.unit = "year";
  else if (/\b(month|monthly)\b|\/mo/.test(lower)) pay.unit = "month";
  const nums = (raw.match(/\$?\s?\d[\d,]*\.?\d*\s?k?/gi) || [])
    .map((m) => {
      const k = /k/i.test(m);
      const n = parseFloat(m.replace(/[^\d.]/g, ""));
      return Number.isNaN(n) ? null : k ? n * 1000 : n;
    })
    .filter((n): n is number => n != null);
  if (nums.length === 1) pay.amount = nums[0];
  else if (nums.length >= 2) { pay.min = Math.min(...nums); pay.max = Math.max(...nums); }
  return pay;
}

/** Merge raw `set_brief_fields` tool args into the running JobBrief. */
export function mergeBriefFromTool(prev: JobBrief, args: Record<string, any>): JobBrief {
  const next: JobBrief = { ...prev };
  const role = typeof args.roleTitle === "string" ? args.roleTitle : args.role;
  if (typeof role === "string" && role.trim()) next.roleTitle = role.trim();
  if (typeof args.location === "string" && args.location.trim()) next.location = args.location.trim();
  if (typeof args.workMode === "string" && WORK_MODES.includes(args.workMode as WorkMode)) next.workMode = args.workMode as WorkMode;
  if (typeof args.employmentType === "string" && EMP_TYPES.includes(args.employmentType as EmploymentType)) next.employmentType = args.employmentType as EmploymentType;
  const payStr = typeof args.pay === "string" ? args.pay : typeof args.payText === "string" ? args.payText : "";
  if (payStr.trim()) next.pay = parsePay(payStr);
  const start = typeof args.startDateText === "string" ? args.startDateText : typeof args.start === "string" ? args.start : "";
  if (start.trim()) next.startDateText = start.trim();
  next.responsibilities = uniqStrings(prev.responsibilities, args.responsibilities);
  next.requirements = uniqStrings(prev.requirements, args.requirements);
  next.niceToHave = uniqStrings(prev.niceToHave, args.niceToHave);
  next.dealBreakers = uniqStrings(prev.dealBreakers, args.dealBreakers);
  next.benefits = uniqStrings(prev.benefits, args.benefits);
  next.missingCriticalFields = computeMissingCritical(next);
  next.confidence = computeConfidence(next);
  return next;
}

const EMP_LABEL: Record<EmploymentType, string> = {
  "full-time": "Full-time", "part-time": "Part-time", "contract": "Contract", "temporary": "Temporary",
};
const MODE_LABEL: Record<WorkMode, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };

export function payToText(pay?: JobBriefPay): string {
  if (!pay) return "";
  if (pay.rawText) return pay.rawText;
  const u = pay.unit === "hour" ? "/hr" : pay.unit === "month" ? "/mo" : pay.unit === "year" ? "/yr" : "";
  if (pay.min != null && pay.max != null) return `$${pay.min.toLocaleString()}–$${pay.max.toLocaleString()}${u}`;
  if (pay.amount != null) return `$${pay.amount.toLocaleString()}${u}`;
  return "";
}

export function typeLabel(b: JobBrief): string {
  const emp = b.employmentType ? EMP_LABEL[b.employmentType] : "";
  const mode = b.workMode ? MODE_LABEL[b.workMode] : "";
  return emp && mode ? `${emp} · ${mode}` : emp || mode || "";
}

/** Map the rich JobBrief onto the existing form payload (briefFields) the pipeline consumes. */
export function mapJobBriefToFormPayload(b: JobBrief): BriefFormPayload {
  return {
    role: b.roleTitle || "",
    location: b.location || (b.workMode === "remote" ? "Remote" : ""),
    type: typeLabel(b),
    pay: payToText(b.pay),
    start: b.startDateText || "",
    work: b.responsibilities.length
      ? b.responsibilities.map((r) => r.trim().replace(/\.$/, "")).join(". ") + "."
      : "",
  };
}

const CRITICAL: { label: string; has: (b: JobBrief) => boolean }[] = [
  { label: "Role", has: (b) => !!b.roleTitle },
  { label: "Full-time or part-time", has: (b) => !!b.employmentType },
  { label: "Location or remote", has: (b) => !!b.location || !!b.workMode },
  { label: "Pay", has: (b) => !!payToText(b.pay) },
  { label: "Start date", has: (b) => !!b.startDateText },
  { label: "What they'll do", has: (b) => b.responsibilities.length > 0 },
];

export function computeMissingCritical(b: JobBrief): string[] {
  return CRITICAL.filter((c) => !c.has(b)).map((c) => c.label);
}

function computeConfidence(b: JobBrief): number {
  const have = CRITICAL.filter((c) => c.has(b)).length;
  return Math.round((have / CRITICAL.length) * 100) / 100;
}

/** Minimum needed before we can build a real job (a title is non-negotiable). */
export function canCreate(b: JobBrief): boolean {
  return !!b.roleTitle && b.roleTitle.trim().length > 1;
}

/** True once we have enough to read back a confident summary. */
export function hasEssentials(b: JobBrief): boolean {
  return !!b.roleTitle && (!!b.location || !!b.workMode) && !!payToText(b.pay) && b.responsibilities.length > 0;
}

export function briefHasAnyData(b: JobBrief): boolean {
  return !!(b.roleTitle || b.location || b.workMode || b.employmentType || payToText(b.pay) || b.startDateText || b.responsibilities.length);
}
