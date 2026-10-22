# Phone notifications (2026-10-21)

HireFlow saved to a phone's Home Screen (iPhone Safari "Add to Home Screen",
Android Chrome), and HireFlow open in a desktop browser, can show a
notification when the app is closed. It needs **no outside account and no
secret anyone handles**: the browser's own push service delivers it (Apple,
Google, Mozilla, Microsoft), and HireFlow makes its own sender key the first
time it is needed.

Before this, push worked only inside the native wrapper ("Natively") through
OneSignal, whose `ONESIGNAL_*` secrets were never set, so nothing was ever
delivered; and `src/main.tsx` removed every service worker on load, which
made browser push impossible. Both are handled. The OneSignal path is kept
for the wrapper and is used only if `ONESIGNAL_*` is set.

## How it works

```
notifications row inserted
  -> trigger public.trigger_push_notification() (pg_net, { notification_id } only)
  -> edge function send-push-notification
       claims push_sent_at, loads the row, link -> pushUrlForLink (hireflownow.com path)
       -> web: every push_subscriptions row of that user that has an endpoint
          { title, body: message, url, tag: notification id }, encrypted per device
       -> OneSignal: only if ONESIGNAL_* is set and the user has a native device
  -> the push service -> the phone -> public/hireflow-sw.js shows it
  -> a tap opens the link, on the host the app was installed from
```

| Piece | Where |
|---|---|
| Encryption + sender token (RFC 8291 `aes128gcm`, RFC 8292 VAPID, WebCrypto only, no library) | `supabase/functions/_shared/webPushCrypto.ts` |
| Sender key pair (created on first use), sending to a user's devices, removing dead ones | `supabase/functions/_shared/webPush.ts` |
| The public key, for the browser | edge function `push-public-key` |
| Send for a notification row | edge function `send-push-notification` |
| "Send a test" | edge function `send-test-push` (the caller's own devices only) |
| Tables | `push_subscriptions` (web rows have `endpoint`, `p256dh`, `auth`), `push_vapid_keys` (one row, service role only) in `supabase/migrations/20261021220000_web_push.sql` |
| Saving a device | RPC `save_web_push_subscription` (acts for `auth.uid()` only) |
| The service worker | `public/hireflow-sw.js`, scope `/`. Shows the notification, opens the link. **No fetch handler, caches nothing.** |
| Browser side | `src/lib/webPush.ts` (no React), `src/hooks/useWebPush.ts` |
| The two ways to turn it on | `src/cockpit/push/PushPrompt.tsx`, `src/components/settings/DeviceNotifications.tsx` |

### The sender key (nobody pastes anything)

`push_vapid_keys` holds one row (`id = 1`): the public key and the private key
as a JWK. Row-level security is on with **no policy**, and `anon` and
`authenticated` have no grants, so only the service role (the edge functions)
can touch it. The first call to `push-public-key` (or the first push) creates
the pair; two callers at the same moment both generate one, only the first
insert lands (`ON CONFLICT DO NOTHING`), and both read back the winner.
Never delete that row: every subscription made with the old public key stops
working, and each phone has to turn notifications on again.

### Which addresses we will call

A subscription row is written by the signed-in person's own browser, so its
`endpoint` is not trusted. `isAllowedPushEndpoint` only allows `https` to
`fcm.googleapis.com`, `android.googleapis.com`,
`updates.push.services.mozilla.com`, `*.push.services.mozilla.com`,
`web.push.apple.com`, `*.push.apple.com` and `*.notify.windows.com` (no
credentials, no port). A row pointing anywhere else is deleted without a call.
If a browser vendor ever adds a new push host, add it there and redeploy the
two functions. Redirects are never followed. The endpoint is a secret
capability URL: it is never logged.

### Dead devices

`404` and `410` from a push service mean the device is gone for good: its row
is deleted. Any other failure (a `5xx`, `429`, no answer: one retry) keeps the
row. A `2xx` stamps `last_success_at`. A `401`/`403` (the sender key was
replaced) is counted as a failure and the row is kept.

### Sign-in, sign-out, two accounts on one phone

- **Turn on** (a tap): permission, then the browser subscribes with our public
  key, then `save_web_push_subscription` saves it for the signed-in person, and
  `hf-web-push-wanted:<user id>` is kept in that browser.
- **Sign-in**: if the person turned it on here before and the browser still
  allows it, the subscription is quietly put back and saved (an address can
  change, and sign-out took it off). No prompt.
- **Sign-out** (the Settings button and `useAuth().signOut`): this device's row is
  deleted while still signed in (never holding sign-out up more than 2.5 s),
  then the browser's subscription is dropped, so nothing is delivered to a
  signed-out phone. An expired session drops the browser subscription too.
- **Another account on the same phone**: a plain upsert onto the earlier
  account's endpoint is refused by row-level security, so the save goes
  through `save_web_push_subscription`, which moves the device to whoever is
  signed in. A person keeps their ten newest devices.
- **Turn off** (Settings): deletes the row, drops the subscription, forgets
  the memory.

### The email switch

`send-push-notification` keeps the old rule: a person whose master "Email
Notifications" switch is off (`profiles.email_notifications_enabled = false`)
gets no push either.

## The two ways to turn it on

1. **First-time card** (`PushPrompt`): one small card after sign-in in the
   owner's shell and the team member's shell: bottom of the screen on a phone,
   the corner on a desktop. "Know the moment someone applies" with "Turn on
   notifications" and "Not now". Once per person per device (remembered in
   `localStorage`, keyed by user id, see `pushPromptState.ts`): turning on, the
   phone's own "Don't allow" or "Got it" is for good; "Not now" hides it 7
   days, a second "Not now" for good. On an iPhone not yet on the Home Screen
   it says how to add it, with only "Got it". It waits: 6 seconds after the app
   opens, no dialog open, no guided tip showing, nobody typing, not on the
   dashboard's "Your first hire" guide (which has its own step), and not on
   Messages, Settings, an applicant, or a job being written. After turning on:
   a toast "Notifications are on" and nothing else is sent.
2. **Settings** (`DeviceNotifications`): "Notifications on this device" in the
   Notifications card (hiring side) and its own card for applicants, with the
   state in plain words: On / Off / Blocked ("Turn them on for HireFlow in your
   phone's Settings") / "Add HireFlow to your Home Screen first" / "This
   browser can't show notifications". "Turn on" when off; "Send a test" (and a
   small "Turn off") when on. The test says how many devices it reached.

## iPhone rules

- Notifications work only from the **Home Screen icon** (iOS 16.4 and later),
  never from a Safari tab. In a tab there is no `PushManager` at all, so the
  app checks "iPhone/iPad, not standalone" first and shows how to add it.
- The permission box may only be requested **inside a tap**. `turnOnWebPush`
  asks for permission before it awaits anything; do not put an `await` (a
  network call, a state update that waits) in front of it.
- Every push must show a notification (`userVisibleOnly`). The service worker
  always does, even for a message it cannot read.
- The Home Screen app and Safari keep **separate storage**, so the card is
  asked again in the installed app, which is what we want.
- The staff app is `staff.hireflownow.com`; the applicants' side is
  `hireflownow.com`. The server's link names `hireflownow.com`; the service
  worker keeps only the path and opens it on **its own** origin, so a tap on a
  staff phone stays in the staff app.

## How to test

Automated (no network, no keys):

```bash
node scripts/web_push.test.mjs                 # RFC 8291 vector, round trip, VAPID, sending, key creation
node scripts/web_push_schema.pglite.test.mjs   # the migration, run twice, in PGlite
node scripts/push_prompt.test.mjs              # the card's memory, the service worker, wiring and words
node scripts/push_notifications.test.mjs       # the trigger and the link rule (unchanged)
node scripts/deno_check_functions.mjs
```

`web_push.test.mjs` reproduces the worked example in RFC 8291 section 5 byte
for byte, decrypts what it encrypts with a separate implementation
(`node:crypto`, HKDF built by hand from HMAC), and verifies the VAPID
signature.

Offline preview (`npm run dev`): `?__preview=1&__previewPush=on|off|blocked|home|unsupported`
picks what Settings and the card show (development only; kept for the visit),
e.g. `/settings?__preview=1&__previewPush=off`. The fixture answers
`push-public-key` with a real key and `send-test-push` with one device.

On a real phone, after the migration is applied and the three functions are
deployed (`push-public-key`, `send-push-notification`, `send-test-push`):

1. On the iPhone, open staff.hireflownow.com in Safari, Share, **Add to Home
   Screen**, open it from the icon, sign in. After a few seconds the card
   appears. Tap **Turn on notifications**, then Allow.
2. Settings, Notifications: "Notifications on this device: On". Tap **Send a
   test**: it says "Sent to 1 device" and the phone shows "HireFlow
   notifications are on".
3. From a second account (an applicant), apply to a job. The owner's phone
   shows the in-app notification's title and message; tapping it opens that
   page in the app.
4. Check the function log for `[web-push]` lines. A `410` removes the device;
   `403` after a key change means the phone must turn it on again.
5. Sign out, send another test from the other account: nothing arrives.

## Not done / watch

- Supabase functions are not deployed and the migration is not applied by this
  change; the lead ships both. Until the migration is applied,
  `push-public-key` answers 500 and the phone shows "Couldn't turn
  notifications on".
- `notifications.push_sent_at` is claimed before sending, so a push that fails
  (a push-service outage) is not retried later.
- Web Push to an iPhone needs iOS 16.4 or later.
