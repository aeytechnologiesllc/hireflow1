// Small, generic reader for public.app_settings (see
// supabase/migrations/20260916160000_blueprint_entitlement_and_purchase_integrity.sql).
// Each flag is a named jsonb value; callers ask for one key at a time so a
// missing table/row/malformed value always resolves to a safe default
// rather than throwing mid-request.

// Deliberately loose: the real caller is a @supabase/supabase-js
// SupabaseClient, whose `.from(...).select(...).eq(...).maybeSingle()`
// return type is a deeply generic PostgrestBuilder that doesn't structurally
// match a plain `Promise<{ data, error }>` (and blows past TypeScript's
// instantiation depth limit if you try to force it to). Typing this as `any`
// here is what lets both the real client and a plain fake object (used in
// node tests) satisfy the parameter without fighting either type system.
// deno-lint-ignore no-explicit-any
export type AppSettingsClient = any;

export async function readAppSettingBoolean(
  client: AppSettingsClient,
  key: string,
  defaultValue: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) return defaultValue;
    return data.value === true;
  } catch {
    return defaultValue;
  }
}

// 'blueprint_paid' gates the Improvement Blueprint's entitlement AND its
// Stripe checkout path. Default false: the free tier is open on purpose
// (20260904110000_free_tier_open) until the owner's billing launch flips
// this row to true.
export async function isBlueprintBillingEnabled(client: AppSettingsClient): Promise<boolean> {
  return readAppSettingBoolean(client, "blueprint_paid", false);
}
