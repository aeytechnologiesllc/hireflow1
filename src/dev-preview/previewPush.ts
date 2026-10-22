/**
 * Dev-preview-only: the two edge functions phone notifications call, answered
 * offline (docs/PUSH-NOTIFICATIONS.md, docs/DEV-PREVIEW.md).
 *
 *   push-public-key   a real P-256 public key (made here, in the browser), so
 *                     a screen that subscribes gets a key the browser accepts;
 *   send-test-push    "reached 1 device".
 *
 * Nothing is sent anywhere. `?__previewPush=on|off|blocked|home|unsupported`
 * (read in src/lib/webPush.ts, development only) picks which state the
 * Settings row and the first-time card show.
 */
import type { FixtureAuthUser, FixtureTables } from "./fixtureClient";

type Reply = { data: unknown; error: null };

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let publicKey: Promise<string> | null = null;

export async function previewPushInvoke(name: string): Promise<Reply | null> {
  if (name === "push-public-key") {
    publicKey ??= crypto.subtle
      .generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
      .then(async (pair) => base64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))));
    return { data: { publicKey: await publicKey }, error: null };
  }
  if (name === "send-test-push") {
    return { data: { success: true, devices: 1, saved_devices: 1 }, error: null };
  }
  return null;
}

/**
 * `save_web_push_subscription`, as the database does it: the signed-in person's
 * row for that browser address, replaced if it was already there. So a screen
 * that turns notifications on reads "On" afterwards, as it would for real.
 */
export function previewPushHandlers(tables: FixtureTables, signedIn: FixtureAuthUser): Record<string, (args: unknown) => unknown> {
  return {
    save_web_push_subscription: (args) => {
      const a = (args ?? {}) as { p_endpoint?: string; p_p256dh?: string; p_auth?: string; p_user_agent?: string };
      if (!a.p_endpoint) return null;
      const rows = (tables.push_subscriptions ??= []);
      const now = new Date().toISOString();
      const row = rows.find((r) => r.endpoint === a.p_endpoint);
      const fields = { user_id: signedIn.id, platform: "web", endpoint: a.p_endpoint, p256dh: a.p_p256dh, auth: a.p_auth, user_agent: a.p_user_agent ?? null, updated_at: now };
      if (row) Object.assign(row, fields);
      else rows.push({ id: `preview-push-${rows.length + 1}`, created_at: now, last_success_at: null, player_id: null, ...fields });
      return null;
    },
  };
}
