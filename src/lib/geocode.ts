import { supabase } from "@/integrations/supabase/client";

/** Structured place resolved from free text by the `geocode` edge function (Nominatim). */
export interface GeoPlace {
  ok: boolean;
  display?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lon?: number | null;
  reason?: string;
}

/**
 * Resolve a free-text location ("Islamabad", "Karachi, Pakistan", "Remote — Lahore")
 * into city / region / country / coordinates so the job page and the job board feed
 * place it correctly. Returns { ok:false } on any failure — the
 * caller should fall back to the raw text.
 *
 * Each place is asked once a page: the builder asks while the plan is read,
 * and Publish (with its draft save after a payment_required refusal) reuses
 * the answer; it asked twice there, about 2 s each (the owner's live run,
 * 2026-11-01: "even publishing takes a really long time"). A failed call is
 * not kept, so the next one asks again.
 */
const asked = new Map<string, Promise<GeoPlace>>();

export function geocodePlace(query: string): Promise<GeoPlace> {
  const q = (query ?? "").trim();
  if (q.length < 2) return Promise.resolve({ ok: false, reason: "empty" });
  const kept = asked.get(q);
  if (kept) return kept;
  const answer = askGeocoder(q);
  asked.set(q, answer);
  void answer.then((p) => {
    if (!p.ok && p.reason !== "not_found") asked.delete(q);
  });
  return answer;
}

async function askGeocoder(q: string): Promise<GeoPlace> {
  try {
    const { data, error } = await supabase.functions.invoke("geocode", { body: { q } });
    if (error) return { ok: false, reason: error.message };
    return (data as GeoPlace) ?? { ok: false, reason: "no_data" };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/** "Islamabad, Islamabad Capital Territory, Pakistan" — a clean one-line label. */
export function formatPlace(p: GeoPlace): string {
  return [p.city, p.region, p.country].filter(Boolean).join(", ");
}
