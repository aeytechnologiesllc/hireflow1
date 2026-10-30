#!/usr/bin/env node
/**
 * The app opening fast on a phone (2026-10-11, the performance check).
 *
 * The owner: "it loaded, but that shit took a really long time on my
 * phone". One real cold open of the installed app (Android 10, edge logs)
 * showed, before the dashboard could appear:
 *   - getUser 4 times, user_roles 4 times, team_members 3 times, in a row;
 *   - the whole shell swapped for a loading screen while get-subscription ran
 *     (1.45 s with no request at all), then built again;
 *   - the dashboard's data downloaded twice (the live sync's first catch-up);
 *   - 9.2 MB of applications (`*, jobs!inner(*)`: notes, a 17 KB job per row);
 *   - all seven staff pages fetched at start-up, Documents and its 480 KB of
 *     PDF tools included, beside a 1.36 MB first download.
 * Each fix below is checked in the source so it cannot quietly come back.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};

console.log("The first download");
const app = code(await read("src/App.tsx"));
for (const [name, from] of [["AppLayout", "@/components/AppLayout"], ["Index", "./pages/Index"], ["Auth", "./pages/Auth"], ["CandidateStepGate", "@/components/candidate/CandidateStepGate"], ["DeveloperLayout", "@/components/DeveloperLayout"]]) {
  check(`${name} is not in the first download`, !new RegExp(`^import ${name} from "${from.replace(/[./]/g, "\\$&")}";`, "m").test(app) && new RegExp(`const ${name} = lazyWithReload\\(`).test(app));
}
check("the screen a visit opens starts downloading at once", /if \(path === "\/auth" \|\| path\.startsWith\("\/auth\/"\)\) authImporter\(\)/.test(app) && /if \(isStaffHost\(\)\) appLayoutImporter\(\)/.test(app) && /else if \(path === CAREERS_PATH\) indexImporter\(\)/.test(app));
check("the staff site's \"/\" (where the installed app opens) is a doorway, not the careers page", /<Route path="\/" element=\{isStaffHost\(\) \? <StaffDoorway \/> :/.test(app));
const prefetch = code(await read("src/lib/prefetchRoutes.ts"));
check("start-up fetches the page being opened and the dashboard, nothing else", /else prefetchForPath\(pathname\);\s*prefetchRoute\("\/dashboard"\);/.test(prefetch));
check("Documents (the PDF tools) is never fetched at start-up", /STAFF_PAGES_LATER: RoutePrefix\[\] = \[[^\]]*\]/.test(prefetch) && !/STAFF_PAGES_LATER: RoutePrefix\[\] = \[[^\]]*documents/.test(prefetch));
const layout = await read("src/components/AppLayout.tsx");
check("a team member's and an applicant's frames are their own downloads", /const TeamMemberLayout = lazyWithReload\(\(\) => import\("@\/components\/layouts\/TeamMemberLayout"\)\)/.test(layout) && /const CandidateLayout = lazyWithReload\(\(\) => import\("@\/components\/layouts\/CandidateLayout"\)\)/.test(layout));
check("the one-time tips are their own download", /const GuidedTips = lazyWithReload\(/.test(layout) && !/^import \{ GuidedTips \}/m.test(layout));
check("the owner's frame no longer carries the wizards or the older sidebar", !/import (AppSidebar|AppHeader|TeamOnboardingWizard|CandidateOnboardingWizard) from/.test(layout));
const offline = await read("src/components/OfflineIndicator.tsx");
check("the offline banner needs no animation library", !/framer-motion/.test(offline));
const vite = await read("vite.config.ts");
check("animation, icons and unused UI pieces travel with their screens, not in every first download", /const LEFT_TO_THEIR_SCREENS = new Set\(\[[\s\S]*'framer-motion'[\s\S]*'lucide-react'[\s\S]*'@radix-ui\/react-select'/.test(vite) && /if \(LEFT_TO_THEIR_SCREENS\.has\(pkg\)\) return undefined;/.test(vite));
check("tiny chunks are folded together (fewer round trips on a phone)", /experimentalMinChunkSize: 10_000/.test(vite));
const record = await read("src/cockpit/lib/assessmentRecord.ts");
check("the shell's integrity toasts no longer pull in the whole record builder", /from "@\/cockpit\/lib\/integrityCards"/.test(await read("src/components/GlobalNotificationToasts.tsx")) && /from "@\/cockpit\/lib\/integrityCards";/.test(record));
check("...nor does the 'still filling in' check", /from "@\/cockpit\/lib\/applicationStatus"/.test(await read("src/cockpit/lib/mappers.ts")));

console.log("\nThe page shell");
const html = await read("index.html");
check("the brand fonts load beside the page, not in front of it", /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]+" media="print" onload="this\.media='all'" \/>/.test(html) && !/<link href="https:\/\/fonts\.googleapis\.com[^"]+" rel="stylesheet" \/>/.test(html));
check("a start screen shows at once (the app's mark on its ground)", /<div id="root"><div id="hf-boot" aria-hidden="true"><svg/.test(html) && /html,body\{background:#17140F/.test(html));
check("...and it fades in once, never loops", /animation:hf-boot-in \.4s ease-out \.15s 1 forwards/.test(html));

console.log("\nSigning in");
const auth = code(await read("src/hooks/useAuth.tsx"));
check("each person is looked up once (not again on every sign-in event)", /if \(startingUp\.current \|\| event === "INITIAL_SESSION"\) return;/.test(auth) && /if \(session\.user\.id === resolvedUserId\.current\) return;/.test(auth));
check("the listener no longer re-checks the session with the server", !/onAuthStateChange\([\s\S]{0,900}validateSession\(/.test(auth));
check("on opening, the server check and the two look-ups run side by side", /await Promise\.all\(\[\s*validateSession\(session\.access_token\),\s*fetchUserRole\(/.test(auth));
check("...the server check skips the sign-in lock (it has the token)", /await supabase\.auth\.getUser\(accessToken\)/.test(auth));
check("a stored session the server refuses leaves nothing looked up standing", /if \(!verifiedUser\) \{[\s\S]{0,300}setRole\(null\);/.test(auth));
check("the watchdog hands sign-in events to the listener if start-up never returns", /startingUp\.current = false;\s*setLoading\(false\);\s*\}, 8000\)/.test(auth));

console.log("\nThe owner's dashboard");
const layoutRaw = await read("src/components/AppLayout.tsx");
check("an owner's frame does not wait for get-subscription", /if \(subLoading && \(isTeamMember \|\| role === "team_member"\)\) \{/.test(layoutRaw) && !/if \(subLoading\) \{/.test(layoutRaw));
check("the frame draws while a page's code is still arriving", /<CockpitShell>\s*\{[^}]*\}\s*<Suspense fallback=\{null\}>\s*<Outlet \/>/.test(await read("src/components/AppLayout.tsx")));
const sync = code(await read("src/cockpit/hooks/useEmployerLiveSync.ts"));
check("the live sync's first catch-up does not download what just loaded", /export function createCatchUpGate\(openedAt: number\)/.test(sync) && (sync.match(/Gate\.connected\(\);/g) ?? []).length === 5 && (sync.match(/Gate\.changed\(\);/g) ?? []).length === 5);
const apps = code(await read("src/hooks/useApplications.ts"));
check("the dashboard's applicants no longer embed a whole job per row", !/jobs!inner\(\*\)/.test(apps) && /jobById\.get\(app\.job_id as string\)/.test(apps));
check("...nor ask an owner whether they are a team member", /if \(isTeamMember \|\| role !== "employer"\) \{\s*const \{ data: teamMember \}/.test(apps));
const interviews = code(await read("src/hooks/useInterviews.ts"));
check("interviews bring only the job's title and owner", !/jobs\(\*\)/.test(interviews) && (interviews.match(/jobs\(id, title, employer_id\)/g) ?? []).length === 2);
const perms = code(await read("src/hooks/useTeamMemberPermissions.ts"));
check("team permissions are looked up only for a team member", /enabled: !!user && mayBeTeamMember,/.test(perms));
const feed = code(await read("src/hooks/useActivityFeed.ts"));
check("the activity feed asks no team question of an owner", /isTeamMember \|\| role !== "employer"\s*\? await supabase/.test(feed));
const dash = code(await read("src/cockpit/pages/Dashboard.tsx"));
check("the offer letter window downloads when opened, not with the dashboard", /const OfferLetterDialog = lazy\(/.test(dash));

console.log("\nThe sign-in lock never waits forever");
check("the client uses the time-limited lock", /lock: authLock,/.test(await read("src/integrations/supabase/client.ts")));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
