/**
 * Times on the signing record, in UTC for real (the eighth product review).
 *
 * Every time on the record was the viewer's own clock with "UTC" printed
 * after it: date-fns' format() reads the browser's zone. The applicant in
 * Manila saw "Oct 26, 6:46 AM UTC" and the business owner in New York "Oct 25,
 * 6:46 PM UTC" for the same signature, twelve hours apart and neither of them
 * the real UTC time, on the record both sides would point to in a dispute.
 *
 * These read the instant's UTC parts, so the text is the same on every
 * device: the applicant's copy, the team's copy, the PDFs made in the browser
 * and /verify. `utcStamp` is word for word the server's own (`utcStamp` in
 * supabase/functions/_shared/renderFinalPdf.ts, which prints the final PDF
 * and its certificate), so the browser's record and the server's agree too.
 * No library: the UTC parts of a Date are enough, and none is needed for a
 * fixed zone.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");

function instant(at: string | number | Date | null | undefined): Date | null {
  if (at === null || at === undefined || at === "") return null;
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "October 10, 2026" (the UTC day); "" for no time. */
export function utcDay(at: string | number | Date | null | undefined): string {
  const d = instant(at);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : "";
}

/** "7:00:13 PM UTC", or "7:00 PM UTC" without the seconds; "" for no time. */
export function utcTime(at: string | number | Date | null | undefined, withSeconds = true): string {
  const d = instant(at);
  if (!d) return "";
  const hours = d.getUTCHours();
  return `${hours % 12 || 12}:${pad(d.getUTCMinutes())}${withSeconds ? `:${pad(d.getUTCSeconds())}` : ""} ${hours >= 12 ? "PM" : "AM"} UTC`;
}

/** "October 10, 2026 at 7:00:13 PM UTC", as the server prints it; "" for no time. */
export function utcStamp(at: string | number | Date | null | undefined, withSeconds = true): string {
  const d = instant(at);
  return d ? `${utcDay(d)} at ${utcTime(d, withSeconds)}` : "";
}

/** "2026-10-10 19:00:13 UTC", for tables and the exported record; "" for no time. */
export function utcTechnical(at: string | number | Date | null | undefined): string {
  const d = instant(at);
  if (!d) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}
