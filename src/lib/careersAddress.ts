/**
 * A business's careers address from what someone types (the 2026-10-11
 * mock-ups): used by "Your careers page" in Settings and by the sign-up
 * screen's preview of the address the business will get.
 *
 * Its own small file (2026-11-01, the slow sign-up): the sign-up page used to
 * take it from CareersPageCard, and with it the whole Settings card's code
 * (the business page hooks, the job and applicant mappers, push and email
 * helpers), about 40 KB compressed fetched before the form could show.
 */

// The database's own letter table (slugify_business), so the sign-up preview
// shows the address the business will really get ("Ørsted" is "orsted").
const ACCENTED = "àáâãäåāăąçćčĉċďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉòóôõöøōŏőŕŗřśŝşšßţťŧùúûüũūŭůűųŵýÿŷźżž";
const PLAIN = "aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrssssstttuuuuuuuuuuwyyyzzz";

/** What someone types, as an address: small letters, numbers, single dashes. */
export function cleanAddress(raw: string): string {
  let out = "";
  for (const ch of raw.toLowerCase().replace(/['\u2019]/g, "")) {
    const i = ACCENTED.indexOf(ch);
    out += i >= 0 ? PLAIN[i] : ch;
  }
  return out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50);
}
