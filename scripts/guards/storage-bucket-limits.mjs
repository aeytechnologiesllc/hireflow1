/**
 * Storage bucket limits (2026-09-16). The public `avatars` bucket accepted any
 * file type at any size (a free public file host on our storage domain, SVG
 * included), and no bucket had a size cap. Fixed in
 * supabase/migrations/20260916223000_storage_bucket_limits.sql; the photo and
 * logo pickers in src/pages/Profile.tsx must accept exactly the bucket's types
 * so a person gets a clear message instead of a failed upload.
 */
const MIGRATION = "supabase/migrations/20260916223000_storage_bucket_limits.sql";

export default [
  {
    id: "storage-bucket-limits",
    why:
      "The public avatars bucket must stay images-only (no SVG) with a size cap, and Profile.tsx's picker " +
      "types must match the bucket's allowed_mime_types.",
    async run({ read }) {
      const bad = [];
      const sql = (await read(MIGRATION)) ?? "";
      if (!sql) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const avatars = (sql.match(/UPDATE storage\.buckets[\s\S]*?WHERE id = 'avatars';/) ?? [""])[0];
      if (!/file_size_limit\s*=/.test(avatars)) bad.push("avatars has no file_size_limit");
      const types = [...(avatars.match(/allowed_mime_types\s*=\s*ARRAY\[([\s\S]*?)\]/) ?? ["", ""])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (!types.length) bad.push("avatars has no allowed_mime_types");
      if (types.some((t) => /svg|html|xml|javascript/i.test(t))) bad.push(`avatars allows a scriptable type: ${types.join(", ")}`);
      const profile = (await read("src/pages/Profile.tsx")) ?? "";
      const client = [...((profile.match(/const AVATAR_IMAGE_TYPES = \[([^\]]*)\]/) ?? ["", ""])[1].matchAll(/"([^"]+)"/g))].map((m) => m[1]);
      if (client.sort().join(",") !== [...types].sort().join(",")) {
        bad.push(`Profile.tsx AVATAR_IMAGE_TYPES (${client.join(", ")}) differs from the bucket's allowed types (${types.join(", ")})`);
      }
      if (/accept="image\/\*"/.test(profile)) bad.push("Profile.tsx still offers every image type (image/*), including SVG");
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
