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
 * into city / region / country / coordinates so a job posts to the right place and
 * Google for Jobs geo-targets it correctly. Returns { ok:false } on any failure — the
 * caller should fall back to the raw text.
 */
export async function geocodePlace(query: string): Promise<GeoPlace> {
  const q = (query ?? "").trim();
  if (q.length < 2) return { ok: false, reason: "empty" };
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
