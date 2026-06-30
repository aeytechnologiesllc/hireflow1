// geocode — turns a free-text place ("Islamabad", "Karachi, Pakistan", "Remote — Lahore")
// into a structured, accurate location so a job posts to the RIGHT city/region/country
// (and Google for Jobs places it correctly, not in some default US city).
//
// Backed by OpenStreetMap Nominatim (free, no key). Low volume — one lookup per job
// posting — well within Nominatim's usage policy. A custom User-Agent is required by
// their policy. Results are cached in-memory per warm instance.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const cache = new Map<string, unknown>();

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  region?: string;
  state_district?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let q = "";
    if (req.method === "GET") {
      q = new URL(req.url).searchParams.get("q") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      q = (body?.q ?? "").toString();
    }
    q = q.trim();
    // Strip a leading "remote" qualifier so "Remote — Islamabad" still resolves the city.
    const cleaned = q.replace(/^\s*(fully\s+)?remote\b[\s—–\-,:|]*/i, "").trim();

    if (!cleaned || cleaned.length < 2) {
      return new Response(JSON.stringify({ ok: false, reason: "empty" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const key = cleaned.toLowerCase();
    if (cache.has(key)) {
      return new Response(JSON.stringify(cache.get(key)), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
      });
    }

    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HireFlow/1.0 (jobs geocoding; https://hireflownow.com)", "Accept-Language": "en" },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, reason: `nominatim ${res.status}` }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const arr = (await res.json()) as NominatimResult[];
    const hit = arr?.[0];
    if (!hit) {
      const miss = { ok: false, reason: "not_found" };
      cache.set(key, miss);
      return new Response(JSON.stringify(miss), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const a = hit.address ?? {};
    const out = {
      ok: true,
      display: hit.display_name,
      city: a.city || a.town || a.village || a.municipality || null,
      region: a.state || a.region || a.state_district || null,
      country: a.country || null,
      countryCode: a.country_code ? a.country_code.toUpperCase() : null,
      lat: hit.lat ? Number(hit.lat) : null,
      lon: hit.lon ? Number(hit.lon) : null,
    };
    cache.set(key, out);

    return new Response(JSON.stringify(out), {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
