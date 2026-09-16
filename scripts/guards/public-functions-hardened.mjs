/**
 * Sign-in-free functions that spend money or third-party quota (2026-09-16).
 *
 * - elevenlabs-tts was a public text-to-speech proxy with no text length cap
 *   and no callers; it is a 410 tombstone now.
 * - geolocate-ip looked up any IP a caller put in the body, with no limit;
 *   it now looks up only the request's own IP, validated, and rate limited.
 */
export default [
  {
    id: "public-functions-spend-safely",
    why:
      "A public edge function that spends paid or rate-limited upstream calls must not accept the thing it " +
      "spends on from the caller unbounded. elevenlabs-tts stays retired; geolocate-ip only looks up the caller's own IP.",
    async run({ read }) {
      const bad = [];
      const tts = (await read("supabase/functions/elevenlabs-tts/index.ts")) ?? "";
      if (tts && (!/status: 410/.test(tts) || /api\.elevenlabs\.io/.test(tts))) {
        bad.push("elevenlabs-tts is live again; bring it back behind sign-in with a text length cap, then update this guard");
      }
      const geo = (await read("supabase/functions/geolocate-ip/index.ts")) ?? "";
      if (!geo) bad.push("supabase/functions/geolocate-ip/index.ts is missing");
      else {
        if (/await req\.(json|text)\(\)/.test(geo)) bad.push("geolocate-ip reads the request body again (caller-chosen IP lookups)");
        if (!/guardPublicAiCall\(req, "geolocate-ip"/.test(geo)) bad.push("geolocate-ip is no longer rate limited");
        if (!/IPV4\.test\(ip\)/.test(geo)) bad.push("geolocate-ip no longer validates the IP before putting it in the upstream URL");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
