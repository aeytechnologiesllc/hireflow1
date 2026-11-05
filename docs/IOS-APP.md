# The HireFlow iPhone app

The owner, 2026-11-04: "Yes, build it". HireFlow as a real iPhone app,
"the FairFix way", with notifications straight from Apple and no OneSignal.

## What it is

- **A real app** (`ios/`, Capacitor 7, Swift packages like FairFix). It opens
  the live staff site, `https://staff.hireflownow.com` (`capacitor.config.json`
  `server.url`). Every push to `main` reaches the app the moment Vercel
  deploys, with no App Store update. Only a change to the native shell (`ios/`,
  a new plugin, the icon) needs a new build.
- **What it adds over the website:**
  - real iPhone notifications, straight from Apple (`src/lib/nativePush.ts`,
    `supabase/functions/_shared/apns.ts`);
  - camera and microphone for interviews, with the permission words in
    `Info.plist`;
  - its own icon and launch screen (the green seal, `branding/app-icon-master.png`);
  - a "No connection" page with Try again (`native/shell/offline.html`).
- **How the page knows it is in the app:** the app adds `HireFlowApp/1` to its
  user agent (`appendUserAgent`), and `insideHireFlowApp()` reads that.
- **Bundle id** `com.aeytechnologies.hireflow`, team `8M67RVJS7T`,
  iPhone only, portrait.

## Notifications (no OneSignal)

1. After sign-in, `NativeAppBridge` in `src/App.tsx` calls `turnOnNativePush()`.
   iOS shows its own "Allow notifications?" box once; after that iOS answers
   from its Settings.
2. Apple gives the phone a push address (an APNs device token).
   `save_native_push_token` stores it for the signed-in person
   (`push_subscriptions.apns_token`, migration `20261104200000_native_push_apns.sql`).
   A phone moves to whoever signs in on it, and each person keeps their ten
   newest phones.
3. `send-push-notification` (and Settings' "Send a test", `send-test-push`)
   sends each notification to those phones with the team's own Apple key
   (`_shared/apns.ts`).
   - A token from an Xcode build belongs to Apple's sandbox, and one from
     TestFlight or the App Store to production. Production is tried first,
     then the sandbox, and the answer is remembered on the row.
   - A phone Apple says is gone is removed.
4. A tap opens the notification's page in the app
   (`pushNotificationActionPerformed`, only in-app paths).
5. Signing out removes the phone's address first (`removeThisDeviceBeforeSignOut`).

**Never hand the plugin object through a promise or return it from an async
function.** It answers to any property name, `then` included, so a promise
waits on it forever. This is how the first Simulator run hung before iOS ever
asked.

**Secrets** (Supabase function secrets): `APNS_KEY_ID`, `APNS_TEAM_ID`
(`8M67RVJS7T`), `APNS_PRIVATE_KEY` (the `.p8` file's text), and optionally
`APNS_BUNDLE_ID`. Until they are set, nothing goes to Apple and nothing
fails; the browser notifications still go out.

## No buying inside the app

Apple lets a paid plan be used in an app, but not bought there outside
Apple's own payments.

- Inside the app, `billingApi.call()` refuses with "Plans and payments can't
  be changed in the iPhone app." The words name no other place to buy, as
  Apple's rules require.
- The plan card and the publish dialog hide their pay buttons.
- The owner's account is exempt anyway.

## Checked in the iPhone Simulator (2026-11-04)

The app ran on an iPhone 17 Pro Max simulator. Against the offline preview
(a sample signed-in business), it:

- opened below the clock;
- showed iOS's "HireFlow Would Like to Send You Notifications" right after
  sign-in;
- got Apple's push address after Allow;
- showed a notification sent with `xcrun simctl push` with the seal icon;
- opened Interviews when the notification was tapped.

Against the live site, it opened the staff sign-in, with no link out to the
website.

**Not yet checked:** sending through Apple from the server (needs the
`APNS_*` secrets) and a real iPhone (needs a TestFlight build).

## Build 1 (2026-11-04)

Archived from commit `b6882df0` at `~/HireFlow-builds/HireFlow-b1.xcarchive`
(log beside it), version 1.0, build 1. It was signed automatically by
Xcode's account on this Mac ("Apple Development: Created via API",
"iOS Team Provisioning Profile: com.aeytechnologies.hireflow"), so the app
ID **is registered**, with push (`aps-environment` in the archive). It is
**not uploaded**: App Store Connect has no HireFlow app page yet (step 2
below). Never reuse a build number once one is uploaded. Archives stay
outside the repo.

## The owner's steps to the App Store

1. **An Apple push key** (developer.apple.com → Certificates, IDs & Profiles →
   Keys → +). Name it "HireFlow push", tick **Apple Push Notifications
   service (APNs)**, then Continue → Register → **Download**. The `.p8` file
   can be downloaded only once. Send the file and the 10-character Key ID;
   Claude sets the three secrets.
2. **The app's page in App Store Connect** (appstoreconnect.apple.com → Apps →
   + → New App): iOS, name **HireFlow**, language English (U.S.), bundle ID
   **com.aeytechnologies.hireflow**, SKU `hireflow-ios`.
   - The bundle ID is already registered (build 1's signing did it), so it is
     in the list.
3. **Then Claude:** archives build 1 and uploads it to TestFlight (FairFix's
   route, `scripts/export-ios.py` in FairFix). The owner installs TestFlight
   on the iPhone and taps the HireFlow invite.
4. **For review**, App Store Connect needs:
   - screenshots (6.9-inch iPhone, made in the Simulator);
   - the description;
   - the privacy answers: email and name for the account; applicant data the
     businesses enter; no tracking;
   - support and privacy policy addresses (`https://hireflownow.com/privacy`);
   - a demo sign-in for Apple's reviewer (a staff account with a sample job,
     never the owner's own).

   Claude drafts all of it.

## Building it

```bash
npm run build            # not needed for the app itself (it loads the live site)
npx cap sync ios         # after changing capacitor.config.json or adding a plugin
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' -derivedDataPath ../DerivedData build
```

- **`npx cap add ios --packagemanager SPM` bug:** Capacitor 7.6.9 lower-cases
  the option and then asks for CocoaPods. A placeholder `pod` on `PATH` for
  that one command gets past it; after that, `cap sync` works as is.
- **Testing notifications in the Simulator:** the push entitlement must be
  embedded. Build with `CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual
  DEVELOPMENT_TEAM=""`, not `CODE_SIGNING_ALLOWED=NO`.

Tests: `scripts/ios_app.test.mjs` (the shell and the page),
`scripts/apns.test.mjs` (sending to Apple).
