/**
 * The job builder's first card, made plain (src/pages/AvaCreateJob.tsx, the
 * brief). The owner tried it live on 2026-10-31: "location part isn't clear,
 * like location I'm hiring from or location where they're going to be working
 * in", and of the pay, "Do I type $500 a month, or what do I type? ... it
 * would be better if it could be more intuitive, like suggestions or
 * something". So each field says what it means, offers a few picks, and reads
 * back what the post will say, by the same rules Publish uses
 * (src/lib/jobFromFlow.ts): the place by fallbackLocationFields (with the
 * geocoder's answer when it has one), the pay by salaryForJob and payWords.
 *
 * Pure: no React, no Supabase (scripts/brief_picks.test.mjs).
 */
import { DEFAULT_JOB_TYPE } from "@/lib/avaEngine/playbook";
import {
  COUNTRY_NAME_BY_CODE,
  fallbackLocationFields,
  placeIsOnlyACountry,
  placeNamesACountry,
  placeNamesNothing,
  placeSaysHybrid,
  placeSaysRemote,
} from "@/lib/jobLocation";
import { payWords } from "@/lib/jobPost";
import { salaryForJob } from "@/lib/salaryParse";

/** The Type for a remote job, and the one the builder starts on: most chat and email agents work from home. */
export const REMOTE_JOB_TYPE = "Full-time · Remote";

export type PlacePickId = "anywhere" | "ph" | "us" | "office";

/** The picks under "Where they'll work". A remote pick fills the field with what the post shows and the feeds need: a
 *  remote job with a country keeps it (the job feeds list a job only with a country, api/job-feed.mjs); "anywhere" has
 *  none. "At our office" fills nothing: it asks for the office's city. */
export const PLACE_PICKS: ReadonlyArray<{ id: PlacePickId; label: string; value: string }> = [
  { id: "anywhere", label: "Remote, anywhere", value: "Remote (worldwide)" },
  { id: "ph", label: "Remote, Philippines", value: "Remote, Philippines" },
  { id: "us", label: "Remote, United States", value: "Remote, United States" },
  { id: "office", label: "At our office", value: "" },
];

/** Which pick the field holds now: a remote pick by its exact words, "At our office" while it was chosen and the field
 *  says neither remote nor hybrid. */
export function pickedPlace(location: string, atOffice: boolean): PlacePickId | null {
  const t = location.trim().toLowerCase();
  const hit = PLACE_PICKS.find((p) => p.value && p.value.toLowerCase() === t);
  if (hit) return hit.id;
  if (atOffice && placeSaysRemote(t) !== "remote" && !placeSaysHybrid(t)) return "office";
  return null;
}

/** What stays in the field when "At our office" is picked: a remote place ("Remote, Philippines", "Remote", "Work from
 *  home") goes, so the office's city can be typed; a place already typed for an office stays. */
export function placeForOfficePick(location: string): string {
  const t = location ?? "";
  return pickedPlace(t, false) || placeSaysRemote(t) === "remote" || placeSaysHybrid(t) || placeNamesNothing(t) ? "" : t;
}

/**
 * The Type that goes with a place while the business has not typed its own
 * (typeChosen false). "Remote" beside "Full-time · On-site" was a
 * contradiction the owner had to notice and retype (the run-through of
 * 2026-10-31), and a country typed alone ("United States") left it on site.
 * Remote first, then partly at home, as briefFromForm reads the place; then
 * the office the business picked; an empty place starts remote; a country and
 * nothing more is remote too, unless the title says the work is on site
 * ("Onsite CSR"); anything else is the builder's default, DEFAULT_JOB_TYPE,
 * which lets the title and What they do decide (briefFromForm).
 */
export function typeForPlace(location: string, opts: { atOffice?: boolean; role?: string } = {}): string {
  const t = (location ?? "").trim();
  if (placeSaysRemote(t) === "remote") return REMOTE_JOB_TYPE;
  if (placeSaysHybrid(t)) return "Full-time · Hybrid";
  if (opts.atOffice) return DEFAULT_JOB_TYPE;
  if (!t) return REMOTE_JOB_TYPE;
  const role = opts.role ?? "";
  if (placeIsOnlyACountry(t) && placeSaysRemote(role) !== "not_remote" && !placeSaysHybrid(role)) return REMOTE_JOB_TYPE;
  return DEFAULT_JOB_TYPE;
}

/** "the Philippines", "the United States", "Canada". */
function countryWords(code: string | null | undefined, name: string): string {
  return code && ["PH", "US", "GB", "NL", "AE"].includes(code.toUpperCase()) ? `the ${name}` : name;
}

/** The geocoder's answer for the place (src/lib/geocode.ts GeoPlace), when it has one. */
export interface PlaceGeo {
  ok: boolean;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
}

export interface PlaceReading {
  /** The line under the field. */
  text: string;
  /** found: the place is placed (a check mark); plain: shown as written, nothing wrong with it; hint: what to add. */
  tone: "found" | "plain" | "hint";
  /** The place's country, when it has one: the pay picks follow it, and the job boards need it. */
  countryCode: string | null;
  /** Worth asking the geocoder: the place names somewhere the builder's own lists do not know. */
  lookUp: boolean;
}

/**
 * What the post will say about where they work, while it is typed. Never an
 * error: the owner typed "United States" and read "Couldn't pinpoint that
 * exactly"; a country or a well-known city is placed here without the
 * geocoder, and anything else is shown as it will be posted.
 */
export function readPlace(
  location: string,
  opts: { workMode: "remote" | "hybrid" | "onsite"; atOffice?: boolean; geo?: PlaceGeo | null },
): PlaceReading | null {
  const t = (location ?? "").trim().replace(/[.,;]+$/, "");
  if (!t) {
    return opts.atOffice
      ? { text: "Type your office's city, like Makati or Austin, TX.", tone: "hint", countryCode: null, lookUp: false }
      : null;
  }
  const local = fallbackLocationFields(t);
  const geo = opts.geo?.ok && (opts.geo.country || opts.geo.city) ? opts.geo : null;
  const countryCode = (geo?.countryCode ?? null) || local.countryCode;
  const countryName = geo?.country || (countryCode ? COUNTRY_NAME_BY_CODE[countryCode.toUpperCase()] ?? null : null);
  const onlyCountry = !geo?.city && placeIsOnlyACountry(t);
  // The place to the city: the geocoder's, else what was typed with its country added ("Makati" is "Makati,
  // Philippines"), the remote words left out ("Remote, Manila" is "Manila, Philippines").
  const typed = t.replace(/^\s*(fully\s+)?remote\b[\s—–\-,:|]*/i, "").trim() || t;
  const label = geo
    ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ")
    : countryName
      ? placeNamesACountry(typed) ? typed : `${typed}, ${countryName}`
      : null;
  const unknown = !countryName && !geo;
  const shown = `Your post will say “${t}”.`;

  if (opts.workMode === "remote") {
    if (countryName) return { text: `Remote, from ${countryWords(countryCode, countryName)}.`, tone: "found", countryCode, lookUp: false };
    if (placeNamesNothing(t)) return { text: "Remote, open to anyone. Job boards list only jobs with a country.", tone: "found", countryCode: null, lookUp: false };
    return { text: `Remote. ${shown}`, tone: "plain", countryCode: null, lookUp: true };
  }
  if (opts.workMode === "hybrid") {
    if (label && !onlyCountry) return { text: `Partly from home, partly in person: ${label}.`, tone: "found", countryCode, lookUp: false };
    return { text: `Partly from home. ${shown}`, tone: "plain", countryCode, lookUp: unknown };
  }
  if (onlyCountry && countryName) {
    return { text: `In person in ${countryWords(countryCode, countryName)}. Add your office's city so applicants and job boards know where.`, tone: "hint", countryCode, lookUp: false };
  }
  if (label) return { text: `In person: ${label}.`, tone: "found", countryCode, lookUp: false };
  return { text: shown, tone: "plain", countryCode: null, lookUp: true };
}

/** A few realistic pays for where they work, to tap and edit. */
export function payPicks(countryCode: string | null | undefined): readonly string[] {
  const code = (countryCode ?? "").toUpperCase();
  if (code === "PH") return ["$500 a month", "$3 an hour", "₱30,000 a month"];
  if (code === "US") return ["$18 an hour", "$3,200 a month"];
  return ["$500 a month", "$4 an hour"];
}

export const PAY_EXAMPLE = "$500 a month or $4 an hour";

export interface PayReading {
  text: string;
  /** found: read as the post will show it; hint: how to write it. */
  tone: "found" | "hint";
}

/**
 * The pay as the post will show it, while it is typed: "On your post: USD 500
 * a month". Read exactly as Publish saves it (salaryForJob) and as the job
 * page words it (payWords), so a guessed period or a missing currency shows
 * here before it shows to applicants.
 */
export function readPay(pay: string, opts: { remote: boolean; countryCode?: string | null }): PayReading | null {
  const t = (pay ?? "").trim();
  if (!t) return null;
  const sal = salaryForJob(t, opts.remote, opts.countryCode ?? null);
  const words = payWords({ salary_min: sal.min, salary_max: sal.max, salary_currency: sal.currency, salary_period: sal.period });
  if (!words) return { text: `No amount in that yet, so your post would show none. Write it like ${PAY_EXAMPLE}.`, tone: "hint" };
  if (!sal.currency) return { text: `On your post: ${words}. Add the currency ($, ₱) so applicants know what it is.`, tone: "hint" };
  return { text: `On your post: ${words}`, tone: "found" };
}

/** The Start field's picks; the field starts on the second. */
export const START_PICKS = ["As soon as possible", "Within a few weeks", "Next month"] as const;

// A role that names a person ("Chat support agent", "CSR") reads "As our …"; any other ("Email support", "Patient
// messaging") reads "In this … job".
const PERSON_ROLE = /\b(agents?|reps?|representatives?|specialists?|associates?|assistants?|officers?|advis[eo]rs?|coordinators?|leads?|executives?|staff|csrs?|vas?|receptionists?|operators?|admins?|administrators?|managers?|supervisors?|members?|moderators?|handlers?|responders?|writers?|virtual assistants?)$/i;

/** The role as words in a sentence: its first part ("Chat Support Agent - Night Shift" is "chat support agent"), each
 *  capitalised word in lower case, an acronym kept ("CSR"). */
function rolePhrase(role: string): string {
  const first = (role ?? "").split(/\s+[-–—|]\s+|\s*[|(,[]\s*/)[0]?.trim() ?? "";
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[A-Z][a-z'’-]*$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
}

/**
 * "Start from an example" for What they'll do: two editable sentences from
 * the job title and the business, so nobody faces an empty box. No AI call.
 * The channel is the title's (chat, email, or both), the people are patients
 * where the title or the business says so, else customers.
 */
export function exampleWork(role: string, businessName?: string | null): string {
  const phrase = rolePhrase(role);
  const words = `${role} ${businessName ?? ""}`.toLowerCase();
  const email = /\be-?mails?\b/.test(role.toLowerCase());
  const chat = /\b(chats?|live chat|messag\w*|messenger|sms|texts?|viber)\b/.test(role.toLowerCase());
  const by = email && !chat ? "email" : chat && !email ? "chat" : "chat and email";
  const people = /\b(patients?|dental|dentist(ry)?|clinic|medical|doctors?|health)\b/.test(words) ? "patients" : "customers";
  const who = (businessName ?? "").trim() || "us";
  const lead = !phrase ? "In this job" : PERSON_ROLE.test(phrase) ? `As our ${phrase}` : `In this ${phrase} job`;
  return `${lead}, you'll answer ${people} who write to ${who} by ${by}: their questions, problems and requests. A great reply is quick, friendly and right the first time, so they have nothing left to ask.`;
}
