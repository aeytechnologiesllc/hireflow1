/**
 * Parse free-text pay ("$90k–$110k", "₱20,000/month", "PKR 150,000/month",
 * "$18.50/hr", "Rs 200,000") into structured salary for the jobs table.
 * Currency- and period-aware; degrades gracefully (returns what it can, nulls otherwise).
 *
 * The Phase 7 product audit (2026-10-25) found the public job page showing
 * "₱20,000/month" as "USD 20,000+ a month": no peso, one figure read as a
 * floor, decimals rounded, and a missing period guessed as a year. Now:
 *   - pesos (PHP, ₱, "pesos") and the Philippines' own currency are known;
 *   - one figure is the pay itself ("$18/hr" is 18), unless the text says it
 *     is a floor ("from $18", "$18+", "at least") or a ceiling ("up to $20");
 *   - cents are kept ("$18.50/hr" is 18.50; jobs.salary_min is numeric);
 *   - with no period written, a small figure is hourly, and a larger one is
 *     a month where pay is quoted monthly (pesos, rupees, dirhams) and below
 *     20,000 elsewhere, a year above that.
 */
export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** HOUR | DAY | WEEK | MONTH | YEAR (the salary_period values the jobs table stores) */
  period: string | null;
}

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\bPHP\b|₱|\bpesos?\b|\bphp\d/i, "PHP"],
  [/\bPKR\b|₨|\bRs\.?\b/i, "PKR"],
  [/\bGBP\b|£/i, "GBP"],
  [/\bEUR\b|€/i, "EUR"],
  [/\bINR\b|₹/i, "INR"],
  [/\bCAD\b|\bC\$/i, "CAD"],
  [/\bAUD\b|\bA\$/i, "AUD"],
  [/\bNZD\b|\bNZ\$/i, "NZD"],
  [/\bSGD\b|\bS\$/i, "SGD"],
  [/\bAED\b|\bdirhams?\b/i, "AED"],
  [/\bUSD\b|\$/i, "USD"], // keep $ last — it's the most ambiguous
];

const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", PH: "PHP", PK: "PKR", GB: "GBP", IN: "INR", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", AE: "AED",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR", PT: "EUR",
};

/** Where pay is usually quoted by the month. */
const MONTHLY_CURRENCIES = new Set(["PHP", "PKR", "INR", "AED"]);

export function parseSalary(text?: string | null, countryCode?: string | null): ParsedSalary {
  const t = (text ?? "").trim();
  if (!t) return { min: null, max: null, currency: null, period: null };

  let currency: string | null = null;
  for (const [re, c] of CURRENCY_PATTERNS) {
    if (re.test(t)) { currency = c; break; }
  }
  if (!currency && countryCode) currency = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? null;

  let period: string | null = null;
  if (/(\bper\s+)?(hour|hourly|hr)\b|\/\s*(hr|hour)|\bphp\/h\b/i.test(t)) period = "HOUR";
  else if (/(\bper\s+)?(day|daily)\b|\/\s*day\b/i.test(t)) period = "DAY";
  else if (/(\bper\s+)?(month|monthly|mo)\b|\/\s*(mo|month)/i.test(t)) period = "MONTH";
  else if (/(\bper\s+)?(week|weekly|wk)\b|\/\s*(wk|week)/i.test(t)) period = "WEEK";
  else if (/(\bper\s+)?(year|yearly|annual|annually|annum|yr|pa)\b|\/\s*(yr|year)/i.test(t)) period = "YEAR";

  // "k"/"m" only on its own ("90k", "1.2m"): the "m" of "20,000 monthly" made it 20 billion.
  const nums = [...t.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*([km])(?![a-z]))?/gi)]
    .map((m) => {
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (isNaN(n)) return null;
      const suf = (m[2] || "").toLowerCase();
      if (suf === "k") n *= 1000;
      if (suf === "m") n *= 1_000_000;
      return Math.round(n * 100) / 100;
    })
    .filter((n): n is number => n != null && n > 0);

  let min: number | null = null;
  let max: number | null = null;
  if (nums.length >= 2) {
    min = Math.min(nums[0], nums[1]);
    max = Math.max(nums[0], nums[1]);
  } else if (nums.length === 1) {
    const floor = /\+|\b(from|at least|minimum|min\.?|starting( at)?|or more)\b/i.test(t);
    const ceiling = /\b(up to|max(imum)?\.?|no more than|under)\b/i.test(t);
    if (ceiling && !floor) max = nums[0];
    else if (floor) min = nums[0];
    else { min = nums[0]; max = nums[0]; }
  }

  // Infer period from magnitude when not stated.
  const figure = min ?? max;
  if (!period && figure != null) {
    if (figure < 200) period = "HOUR";
    else if (currency && MONTHLY_CURRENCIES.has(currency)) period = figure >= 1_000_000 ? "YEAR" : "MONTH";
    else period = figure >= 20_000 ? "YEAR" : "MONTH";
  }

  return { min, max, currency, period };
}
