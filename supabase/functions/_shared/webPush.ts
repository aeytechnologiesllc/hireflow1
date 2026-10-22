/**
 * webPush.ts — the server half of phone notifications that need no outside
 * account (2026-10-21; docs/PUSH-NOTIFICATIONS.md).
 *
 * The cryptography is _shared/webPushCrypto.ts. This file adds the two things
 * that touch the database:
 *
 *   - getVapidKeys: HireFlow's sender key pair. Nobody creates or pastes a
 *     key. The first call generates the pair and stores it in
 *     public.push_vapid_keys, a table only the service role can read; every
 *     later call, from any function, reads the same pair back.
 *   - pushToDevices: sends one message to a list of subscription rows, takes
 *     a device off the list when its push service says it is gone for good
 *     (404 or 410), and notes the time of each success.
 *
 * Both take the service-role client from the caller.
 */
import { generateVapidKeyPair, isAllowedPushEndpoint, isValidSubscriptionKeys, sendWebPush, type VapidKeys } from "./webPushCrypto.ts";

export { sendWebPush, type VapidKeys };

/** Who the push services should contact about our traffic. */
export const VAPID_SUBJECT = "mailto:notifications@hireflownow.com";

/** The slice of the Supabase client these functions use (the service-role client fits). */
// deno-lint-ignore no-explicit-any
export type AdminClient = { from(table: string): any };

function keysFromRow(row: { public_key?: unknown; private_jwk?: unknown } | null): VapidKeys | null {
  if (!row || typeof row.public_key !== "string" || !row.private_jwk || typeof row.private_jwk !== "object") return null;
  return { publicKey: row.public_key, privateJwk: row.private_jwk as JsonWebKey };
}

/**
 * The sender key pair, created on first use. Two functions asking at the same
 * moment both generate a pair, but only the first insert lands
 * (ON CONFLICT DO NOTHING on the one-row table); both then read the winner.
 */
export async function getVapidKeys(admin: AdminClient): Promise<VapidKeys> {
  const read = async () => {
    const { data, error } = await admin.from("push_vapid_keys").select("public_key, private_jwk").eq("id", 1).maybeSingle();
    if (error) throw new Error(`could not read the sender keys: ${error.message}`);
    return keysFromRow(data);
  };
  const existing = await read();
  if (existing) return existing;

  const fresh = await generateVapidKeyPair();
  const { error } = await admin
    .from("push_vapid_keys")
    .upsert({ id: 1, public_key: fresh.publicKey, private_jwk: fresh.privateJwk }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`could not store the sender keys: ${error.message}`);
  const winner = await read();
  if (!winner) throw new Error("the sender keys are missing right after they were stored");
  return winner;
}

/** What a phone shows. `url` is a full hireflownow.com address (pushLink.ts) or absent. */
export type PushMessage = { title: string; body: string; url?: string | null; tag?: string | null };

function clip(text: unknown, max: number): string {
  const value = typeof text === "string" ? text : "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** The JSON the service worker (public/hireflow-sw.js) reads. Short enough to fit one push record. */
export function pushPayload(message: PushMessage): Record<string, string> {
  const payload: Record<string, string> = { title: clip(message.title, 120) || "HireFlow", body: clip(message.body, 400) };
  if (message.url) payload.url = clip(message.url, 500);
  if (message.tag) payload.tag = clip(message.tag, 80);
  return payload;
}

export type DeviceRow = { id: string; endpoint: string | null; p256dh: string | null; auth: string | null };
export type DeviceResult = { sent: number; failed: number; removed: number };

/**
 * Sends `message` to each device row. A row that can never work (keys that are
 * not a device's keys, or an address that is not a browser push service) is
 * deleted without a call; a
 * device the service reports gone (404, 410) is deleted after one. Never
 * throws for a single device: a failure is counted and logged without the
 * address (it is a secret capability URL).
 */
export async function pushToDevices(admin: AdminClient, rows: DeviceRow[], message: PushMessage, keys: VapidKeys): Promise<DeviceResult> {
  const payload = pushPayload(message);
  const sentIds: string[] = [];
  const goneIds: string[] = [];
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      if (!row.endpoint || !isAllowedPushEndpoint(row.endpoint) || !isValidSubscriptionKeys(row.p256dh, row.auth)) {
        goneIds.push(row.id);
        return;
      }
      try {
        const status = await sendWebPush({ endpoint: row.endpoint, p256dh: row.p256dh!, auth: row.auth! }, payload, keys, VAPID_SUBJECT);
        if (status >= 200 && status < 300) sentIds.push(row.id);
        else if (status === 404 || status === 410) goneIds.push(row.id);
        else {
          failed++;
          console.error(`[web-push] a push service answered ${status}`);
        }
      } catch (error) {
        // One device failing (or the sender key being unusable) must not stop the rest,
        // and must not delete anyone: only a push service's 404/410 does that.
        failed++;
        console.error("[web-push] could not send to a device:", error instanceof Error ? error.message : error);
      }
    }),
  );

  if (sentIds.length) {
    const { error } = await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).in("id", sentIds);
    if (error) console.error("[web-push] could not note the time of a success:", error.message);
  }
  if (goneIds.length) {
    const { error } = await admin.from("push_subscriptions").delete().in("id", goneIds);
    if (error) console.error("[web-push] could not remove a gone device:", error.message);
  }
  return { sent: sentIds.length, failed, removed: goneIds.length };
}
