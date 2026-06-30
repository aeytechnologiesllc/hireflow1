/**
 * Parse free-text pay ("$90k–$110k", "PKR 150,000/month", "$22/hr", "Rs 200,000")
 * into structured salary for the jobs table + Google for Jobs `baseSalary`.
 * Currency- and period-aware; degrades gracefully (returns what it can, nulls otherwise).
 */
export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** Google unitText: HOUR | DAY | WEEK | MONTH | YEAR */
  period: string | null;
}

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\bPKR\b|₨|\bRs\.?\b/i, "PKR"],
  [/\bGBP\b|£/i, "GBP"],
  [/\bEUR\b|€/i, "EUR"],
  [/\bINR\b|₹/i, "INR"],
  [/\bCAD\b|\bC\$/i, "CAD"],
  [/\bAUD\b|\bA\$/i, "AUD"],
  [/\bAED\b|\bdirhams?\b/i, "AED"],
  [/\bUSD\b|\$/i, "USD"], // keep $ last — it's the most ambiguous
];

const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", PK: "PKR", GB: "GBP", IN: "INR", CA: "CAD", AU: "AUD", AE: "AED",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR", PT: "EUR",
};

export function parseSalary(text?: string | null, countryCode?: string | null): ParsedSalary {
  const t = (text ?? "").trim();
  if (!t) return { min: null, max: null, currency: null, period: null };

  let currency: string | null = null;
  for (const [re, c] of CURRENCY_PATTERNS) {
    if (re.test(t)) { currency = c; break; }
  }
  if (!currency && countryCode) currency = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? null;

  let period: string | null = null;
  if (/(\bper\s+)?(hour|hourly|hr)\b|\/\s*(hr|hour)/i.test(t)) period = "HOUR";
  else if (/(\bper\s+)?(month|monthly|mo)\b|\/\s*(mo|month)/i.test(t)) period = "MONTH";
  else if (/(\bper\s+)?(week|weekly|wk)\b|\/\s*(wk|week)/i.test(t)) period = "WEEK";
  else if (/(\bper\s+)?(year|yearly|annual|annum|yr|pa)\b|\/\s*(yr|year)/i.test(t)) period = "YEAR";

  const nums = [...t.matchAll(/(\d[\d,]*\.?\d*)\s*([km])?/gi)]
    .map((m) => {
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (isNaN(n)) return null;
      const suf = (m[2] || "").toLowerCase();
      if (suf === "k") n *= 1000;
      if (suf === "m") n *= 1_000_000;
      return Math.round(n);
    })
    .filter((n): n is number => n != null && n > 0);

  let min: number | null = null;
  let max: number | null = null;
  if (nums.length >= 2) { min = Math.min(nums[0], nums[1]); max = Math.max(nums[0], nums[1]); }
  else if (nums.length === 1) { min = nums[0]; }

  // Infer period from magnitude when not stated: small numbers look hourly, large annual.
  if (!period && min != null) period = min >= 2000 ? "YEAR" : "HOUR";

  return { min, max, currency, period };
}
