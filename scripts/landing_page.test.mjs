#!/usr/bin/env node
/**
 * HireFlow's front page at hireflownow.com/ (docs/LANDING.md).
 *
 * The owner, 2026-10-09: "the landing is on hireflownow.com"; not
 * sweepstakes-only ("a very niche market") but with sweepstakes as the
 * highlight; and "make sure I still have the job application open": nothing
 * an applicant uses may move or show the landing.
 *
 * Run with: node scripts/landing_page.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("\nServed at hireflownow.com/, and nowhere an applicant goes");
const { default: middleware, config } = await import(pathToFileURL(path.join(ROOT, "middleware.js")).href);
check("the middleware only ever sees \"/\"", config.matcher === "/");
const main = middleware(new Request("https://hireflownow.com/"));
check("hireflownow.com/ is the landing page", main.headers.get("x-middleware-rewrite") === "https://hireflownow.com/landing.html");
const staff = middleware(new Request("https://staff.hireflownow.com/"));
check("staff.hireflownow.com/ is left to the app (sign-in or the dashboard)", staff.headers.get("x-middleware-next") === "1" && !staff.headers.get("x-middleware-rewrite"));
const vercel = JSON.parse(await read("vercel.json"));
check("job links and short links still go to the job page's own render", vercel.rewrites.some((r) => r.source === "/candidate/job/:id" && r.destination.startsWith("/api/job-prerender")) && vercel.rewrites.some((r) => r.source === "/:slug"));

console.log("\nThe careers page and every applicant link");
const app = await read("src/App.tsx");
const hosts = await read("src/lib/hosts.ts");
check("the careers page is at /careers", /export const CAREERS_PATH = "\/careers";/.test(hosts) && /<Route path=\{CAREERS_PATH\} element=\{<Index \/>\} \/>/.test(app));
check("\"/\" inside the app goes there on the applicants' site; the staff site keeps its doorway", /<Route path="\/" element=\{isStaffHost\(\) \? <StaffDoorway \/> : <Navigate to=\{CAREERS_PATH\} replace \/>\} \/>/.test(app));
check("…the staff doorway is a small screen of its own, still sending a role-less account to /auth/callback", /function StaffDoorway\(\)/.test(app) && /navigate\("\/auth\/callback\?role=employer", \{ replace: true \}\)/.test(app));
check("/careers belongs on the applicants' site (the staff site sends it there)", /\/\^\\\/careers\\\/\?\$\//.test(hosts));
// Since 2026-10-11 "see open roles" is the roles of the business whose job
// the applicant last opened (src/lib/openRoles.ts), so another business's
// applicant is never sent to the home business. When none is known (a fresh
// device) it is every business's live jobs, /open-jobs: /careers is the home
// business's own page, and sent a fresh device there.
const openRoles = await read("src/lib/openRoles.ts");
check(
  "\"see open roles\" falls back to /open-jobs (every business's jobs), never /careers, when no business is known",
  /return OPEN_JOBS_PATH;/.test(openRoles) && /return `\/c\/\$\{slug\}`;/.test(openRoles) && !/CAREERS_PATH/.test(openRoles) && /export const OPEN_JOBS_PATH = "\/open-jobs";/.test(hosts),
);
for (const [file, pattern] of [
  ["src/pages/JobDetails.tsx", /const strandedRoute = lookupBusiness \? `\/c\/\$\{lookupBusiness\}` : openRolesPath\(\);/],
  ["src/pages/Applications.tsx", /onClick: \(\) => navigate\(openRolesPath\(\)\)/],
  ["src/pages/CandidateContinue.tsx", /<Link to=\{openRolesPath\(\)\}[^>]*>See open roles<\/Link>/],
  ["src/pages/Index.tsx", /<Link to=\{CAREERS_PATH\} className="cr-brand"/],
  ["src/components/AppHeader.tsx", /navigate\(isStaffHost\(\) \? "\/" : openRolesPath\(\)\)/],
  ["src/pages/NotFound.tsx", /href=\{isStaffHost\(\) \? "\/" : openRolesPath\(\)\}/],
]) check(`"see open roles" goes to the applicant's own business: ${file}`, pattern.test(await read(file)));
check("the job page and a business's careers page remember that business", /rememberBusiness\(jobBusiness\)/.test(await read("src/pages/JobDetails.tsx")) && /rememberBusiness\(slug\)/.test(await read("src/pages/BusinessCareers.tsx")));
check("the careers page is listed as /careers", /path: CAREERS_PATH, description:/.test(await read("src/pages/Index.tsx")));

console.log("\nThe page itself");
const page = await read("public/landing.html");
// Words the visitor reads, without the stylesheet and the scripts.
const words = page.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script\b[\s\S]*?<\/script>/g, "");
check("its own address, title and description", /<link rel="canonical" href="https:\/\/hireflownow\.com\/">/.test(page) && /<title>HireFlow: hire customer service agents<\/title>/.test(page) && /<meta name="description" content="[^"]{60,}">/.test(page));
check("its own share picture (HireFlow's), large", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/hireflow\.jpg">/.test(page) && /<meta name="twitter:card" content="summary_large_image">/.test(page));
// The sixth growth review: the og:url note said the canonical was "below" (it
// is above), and did not say Facebook may link a card to the canonical anyway.
{
  const note = page.indexOf("<!-- No og:url:");
  const noteText = note >= 0 ? page.slice(note, page.indexOf("-->", note)) : "";
  check("the og:url note names the canonical where it is (above) and what it may still cost a shared card", note > page.indexOf('<link rel="canonical"') && /canonical above/.test(noteText) && !/canonical below/.test(noteText) && /Sharing Debugger/.test(noteText) && !/property="og:url"/.test(page));
}
// "The Desk" (the owner approved it 2026-10-30): hundreds apply, Ava's green
// wax seal marks three, and four chapters tell the rest. Customer service,
// chat and email, any business (docs/LAUNCH-PLAN.md, Phase 3, task 3).
check("the headline: Hundreds apply. Three land on your desk.", /<h1 id="heroTitle"><span class="ln">Hundreds apply\.<\/span><span class="ln">Three land<\/span><span class="ln"><span class="em">on your desk\.<svg /.test(page));
check("…and what it does: a real customer chat for any business, read by Ava, three worth a call", /<p class="sub d">Share your job link anywhere\. Ava gives every applicant a real customer chat written for your business, reads every reply, and puts <b>the three worth a call<\/b> in front of you, with her reasons\.<\/p>/.test(page) && /<p class="sub m">Share your job link anywhere\./.test(page));
check(
  "the story's four chapters, and its ending",
  [
    /<h2>Post the job\. <em>Ava writes the test\.<\/em><\/h2>/,
    /<h2>Share the link <em>anywhere\.<\/em><\/h2>/,
    /<h2>Ava reads <em>every reply\.<\/em><\/h2>/,
    /<h2>Three <em>worth a call\.<\/em><\/h2>/,
    /<h2>Your first job <em>is free\.<\/em><\/h2>/,
  ].every((re) => re.test(page)) &&
    /<nav class="rail" aria-label="How it works">/.test(page) &&
    ["Post", "Share", "Ava reads", "Call"].every((c, i) => page.includes(`<button type="button" data-c="${i}">${c}<svg`)),
);
check("chat and email, for any business: the jobs Ava writes are a store's chat, software's email and a dental office's chat and email", /tab:"Online store", ch:"Chat"/.test(page) && /tab:"Software", ch:"Email"/.test(page) && /tab:"Dental", ch:"Chat and email"/.test(page) && /One hire or a whole team|one hire or a whole team/.test(page));
check("…built for any team that answers customers, gaming one of them", /<span class="b">Medical and dental · Online stores<\/span><span class="b">Software · Home services · Gaming<\/span>/.test(page));
check("…and no sweepstakes, casino, payout or player wording anywhere on the page", !/sweepstake|casino|payout|withdrawal|\bplayers?\b/i.test(page.replace(/<li><b>Gaming<\/b> Players, payments and account checks\.<\/li>/, "")));
check("no night, morning or time-of-day story (the owner, 2026-10-30)", !/\b(night|tonight|overnight|morning|sleep|asleep|evening|dawn)\b/i.test(page));
check("the story's test is an everyday one: a patient charged twice, and a reply that owns it", /msg:"Hi, I was charged twice for Tuesday’s cleaning and nobody has called me back\. I need this fixed today\."/.test(page) && /const REPLY = \[\["I’m so sorry, "\],\["Rosa",0\]/.test(page) && /const NOTES = \["Uses her name","Fixes it","Gives a time"\];/.test(page));
check("no light or glow follows the mouse", !/pointermove|mousemove/.test(page));
// Every business's live jobs, not one business's careers page (2026-10-11).
check("an applicant who lands here finds every open job, in the bar (on a phone too) and the footer", /<a class="plain" id="jobLink" href="\/open-jobs"><span class="long">Looking for a job\?<\/span><span class="short">Jobs<\/span><\/a>/.test(page) && /\.navr \.plain \.long\{display:none\}\s*\.navr \.plain \.short\{display:inline\}/.test(page) && /<a href="\/open-jobs">Open jobs<\/a>/.test(page));
// The ninth growth review: when its own view counted the visitor, the front
// page passes that on (seen=1) along its links to Guides and Open jobs, so a
// "Post a job free" further on is not a second visit. carry-source.js reads
// beacon.js's count, so beacon.js loads first. Run on the page's own links.
{
  const hrefs = [...page.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const matches = (selector, href) =>
    selector.split(/,\s*/).some((one) => {
      const m = /^a\[href(\^|\*)?="([^"]*)"\]$/.exec(one.trim());
      return !!m && (m[1] === "^" ? href.startsWith(m[2]) : m[1] === "*" ? href.includes(m[2]) : href === m[2]);
    });
  const anchors = hrefs.map((raw) => ({ raw, href: new URL(raw, "https://hireflownow.com/").toString() }));
  const { default: vm } = await import("node:vm");
  vm.runInNewContext(await read("public/carry-source.js"), {
    window: { location: { search: "", pathname: "/", hostname: "hireflownow.com", href: "https://hireflownow.com/" }, __hfBeacon: { counted: true } },
    navigator: { doNotTrack: null, globalPrivacyControl: false },
    document: { referrer: "", querySelectorAll: (sel) => anchors.filter((a) => matches(sel, a.raw)) },
    URL, URLSearchParams, Array, Object,
  });
  const onward = anchors.filter((a) => /^\/(blog|open-jobs)$/.test(a.raw));
  check("the front page's links to Guides and Open jobs (bar and footer) carry its count on; the sign-up links, Privacy and Terms never", onward.length === 4 && onward.every((a) => a.href.endsWith("?seen=1")) && anchors.filter((a) => /staff\.hireflownow\.com|^\/(privacy|terms)$/.test(a.raw)).every((a) => !a.href.includes("seen")), JSON.stringify(anchors.map((a) => a.href)));
  check("…and beacon.js loads before carry-source.js (which reads its count)", page.indexOf('<script src="/beacon.js" defer></script>') >= 0 && page.indexOf('<script src="/carry-source.js" defer></script>') >= 0 && page.indexOf('<script src="/beacon.js" defer></script>') < page.indexOf('<script src="/carry-source.js" defer></script>'));
  // carry-source.js runs once, when the page has been read: a sign-up link a
  // script makes later never gets the visitor's tags. All three are in the page.
  const signups = anchors.filter((a) => a.raw === "https://staff.hireflownow.com/auth?mode=signup");
  check("…all three sign-up links are in the page as written (none made later by a script), so each gets the visitor's tags", signups.length === 3 && !/<a [^>]*href=[^>]*staff\.hireflownow\.com[^>]*>[^<]*`/.test(page) && !/innerHTML[^;]*staff\.hireflownow\.com/.test(page));
}
check("/open-jobs is a page of the applicants' site", /<Route path="\/open-jobs" element=\{<OpenJobs \/>\} \/>/.test(app) && /\/\^\\\/open-jobs\\\/\?\$\//.test(hosts));
check("…and one already signed in here is offered their applications", /localStorage\.getItem\("sb-yqklrkpptnhubsnijqze-auth-token"\)/.test(page) && /jobLink\.querySelector\("\.long"\)\.textContent = "My applications";/.test(page) && /jobLink\.setAttribute\("href", "\/applications"\)/.test(page));
check(
  "the three numbers are the real ones, from our own job",
  /<div class="lh">Our own job · October 2026<\/div>/.test(page) &&
    /<b>153<\/b><span><i class="t w">applied in the first four days\.<\/i>/.test(page) &&
    /<b>71<\/b><span><i class="t w">finished the written interview, with none of us in the room\.<\/i>/.test(page) &&
    /<i class="t w">were worth a call\. <\/i><strong class="t w">We hired from those three\.<\/strong>/.test(page) &&
    /\{g0:4\.6, g1:4\.68, n0:4\.66, n1:4\.7, to:3, t0:4\.68, t1:4\.84\}/.test(page) &&
    // Ava read the replies of the 71 who finished, never "all 153"; the band
    // round the rest says "set aside", never "read" (the 82 who never finished
    // sent no reply to read). Five desks say so: the opening's on a computer, on a
    // phone, and on a tablet or sideways; the story's on a computer and on a phone.
    /I read all 71 replies\./.test(page) &&
    !/I read all 153|150 read|other 150 are set aside/.test(page) &&
    (page.match(/o\.bandText = "150 set aside";/g) ?? []).length === 5 &&
    !/71 finished (?:the test|Ava’s chat test)|finished Ava’s chat test/.test(page),
);
check("…and the page says the names are examples", /The businesses, Maria, Carla, Mika, Rosa and the other names on the desk are examples, not real people\. The three numbers are real, from our own job\./.test(page));
check("no mock-up leftovers", !/mock-up|Mock-up|__LAND__|Post a role/.test(page) && !/href="#"/.test(page));
// The owner, 2026-10-10: he could not find a way to sign in once "Get early access"
// took the bar's button; there is no early-access offer.
check("the bar has Sign in, to the hiring team's sign-in", /<a class="signin" href="https:\/\/staff\.hireflownow\.com\/auth" id="signIn">Sign in<\/a>/.test(page));
// The 2026-10-11 mock-ups (#1): a business can make its account.
check("…and the bar's button, the small stamp Post a job, opens the sign-up tab", /<a class="post" href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="startFree"><span>Post a job<\/span><\/a>/.test(page));
// One button, everywhere (2026-10-25): the bar is pinned for the whole page,
// the opening's main button is the big stamp, and it comes again at the end.
check(
  "one button: the bar stays pinned for the whole page, outside the hero, and takes the desk's sage once the page moves under it",
  /\.bar \{ position: fixed;/.test(page) &&
    /<header class="nav bar" id="bar">/.test(page) &&
    page.indexOf('<header class="nav bar" id="bar">') < page.indexOf("<main>") &&
    /bar\.classList\.toggle\("pinned", \(window\.scrollY \|\| window\.pageYOffset \|\| 0\) > 4\)/.test(page) &&
    /\.bar\.pinned::before\{opacity:1\}/.test(page) &&
    /background:rgba\(198,207,190,\.84\)/.test(page),
);
check("…and never covers the story: its words start under the bar on a phone, and on a short screen", /#story \.caps\{left:16px;right:16px;top:calc\(var\(--barh\) - 8px\)/.test(page) && /y0 = capsEl\.offsetTop \+ capH/.test(page) && /Math\.min\(barH\(\) \+ 16, H - colH - 10\)/.test(page) && /if \(wide && F\.oy \+ 40\*F\.k < barH\(\) \+ 6\)/.test(page));
check("…the opening's main button is the big stamp, Post your first job, free (No card.)", /<a class="stamp" href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="heroStart">\s*<span class="face">[\s\S]*?<span class="lbl">Post your first job, free<\/span>/.test(page) && /<span class="t">No card\.<\/span>/.test(page));
check("…and again at the end, as your envelope's postage (the page's own link, moved there)", /<a class="stamp" href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="endStart">/.test(page) && /ylink = document\.getElementById\("endStart"\);/.test(page) && /ydrop\.appendChild\(ylink\);/.test(page) && !/Watch it again|Watch one night/.test(page));
check("no prices while billing is off", !/\$\d|per month|\/mo\b|pricing/i.test(page));
check("the headline is there from the first paint (written in the page, never hidden to rise in)", !/translateY\(112%\)/.test(page) && !/h1[^{}]*\{[^}]*opacity:\s*0/.test(page) && !/\bh1 \.ln\{[^}]*opacity/.test(page));
check("the fonts never block the first paint", /fonts\.googleapis\.com\/css2[^"]*" media="print" onload="this\.media='all'">/.test(page) && !/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/.test(page));
check("…and the desk waits for them (a second at most), the stylesheet first", /const l = document\.getElementById\("hfFontCss"\);\s*if \(!l \|\| l\.media === "all"\) return r\(\);/.test(page) && /new Promise\(r => setTimeout\(\(\) => r\(false\), 1000\)\)/.test(page) && /document\.fonts\.addEventListener\("loadingdone"/.test(page));
check(
  "one logo: the jade rising line on the deep green tile, not the brass on ink",
  /<span class="tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3FCE97" stroke-width="2\.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18 L9 7 L14 15 L20 6"\/><\/svg><\/span>/.test(page) &&
    /\.logo \.tile\{[^}]*background:#0C2A21/.test(page) &&
    !/#E0B96A|#14120E/i.test(page) &&
    !/<b>H<\/b>HireFlow/.test(page),
);
check("structured data: the organisation (with its legal name) and the app", /"@type":"Organization"[^}]*"legalName":"Southern Digital Technologies LLC"/.test(page) && /"@type":"SoftwareApplication"/.test(page));
check("an About line in the footer", /<a href="#about">About<\/a>/.test(page) && /<footer class="lp-foot" id="about">/.test(page) && /HireFlow is made by Southern Digital Technologies LLC\./.test(page));
check("no early-access wording or buttons anywhere", !/early access|data-cta/i.test(page));
check("Privacy, Terms and Team sign in are linked", /<a href="\/privacy">Privacy<\/a>/.test(page) && /<a href="\/terms">Terms<\/a>/.test(page) && /href="https:\/\/staff\.hireflownow\.com\/auth">Team sign in<\/a>/.test(page));
check("landmarks: the bar, the main story and the footer", /<header class="nav bar" id="bar">[\s\S]*?<nav class="navr" aria-label="Main">/.test(page) && /<main>\s*<section id="hero" aria-labelledby="heroTitle">/.test(page) && /<section id="story" aria-label="How HireFlow works">[\s\S]*<\/section>\s*<\/main>\s*<footer class="lp-foot"/.test(page) && /<nav class="foot" aria-label="Footer">/.test(page));
check("…and a reader that cannot see the desk is told what is on it", /<p class="sr">153 people applied and 71 finished the written interview\./.test(page) && /<p class="sr">On the desk:/.test(page));
check("nothing moves forever (docs: no endless animations); the caret blinks a few times, then holds", !/infinite/.test(page) && /#story\.idle \.typing \.tv::after\{animation:caretBlink 1\.06s steps\(1\) 6\}/.test(page));
// The opening plays once and comes to rest; it draws nothing while nothing
// moves, or while it is off the screen.
check(
  "the opening's desk is drawn only while something moves, and sleeps off the screen",
  /if \(heroSeen && busy\(now\)\) requestAnimationFrame\(frame\);\s*else \{ running = false; lastFrame = 0; \}/.test(page) &&
    /if \(!reduce\.matches && now - t0 < END \+ 900\) return true;\s*return fan !== fanTarget \|\| moves\.some\(Boolean\);/.test(page) &&
    /new IntersectionObserver\(es => \{ heroSeen = es\[es\.length - 1\]\.isIntersecting; if \(heroSeen\) wake\(\); \}\)\.observe\(hero\);/.test(page),
);
check("…and the story's desk only while the scroll moves it", /if \(Tcur !== Ttar \|\| moving\) raf = requestAnimationFrame\(frame\);/.test(page) && /addEventListener\("scroll", onScroll, \{passive:true\}\);/.test(page));
check(
  "less motion, when asked: the opening shows its finished desk, the story each chapter's finished state",
  (page.match(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/g) ?? []).length >= 2 &&
    /render\(SW \? END \+ 1 : reduce\.matches \? END \+ 1 : now - t0, now\);/.test(page) &&
    /stage\.classList\.add\("rm"\);/.test(page) &&
    /\.slip \.in,\.stamp,\.stamp::before,\.navr \.post,\.slip \.face,\.replay svg,\.bar,\.bar::before\{transition:none\}/.test(page),
);
check("colour tokens are named for what they mean (guard no-jade-tokens-left)", /--action:#0F6B4F;/.test(page) && !/--jade\b/.test(page));
// The owner, 2026-10-30: the hero "is using heavy animation ... can you make it more lighter weight so older
// phones can also work on it?" Older or slower devices get the light desk: the same story and words, fewer
// letters, no shadow under paper in the air, flat turns, a plainer seal press and a plain bar.
{
  const head = page.slice(0, page.indexOf("</head>"));
  check(
    "older phones get the light desk, chosen before the first paint: two cores or fewer (not Apple's), 2 GB or less, Save-Data, or ?desk=light; a device saying 4 (a 6 GB phone does: Chrome rounds to a power of two) is left to its first second",
    /root\.setAttribute\("data-desk", desk\);/.test(head) &&
      /n\.deviceMemory && n\.deviceMemory <= 2\)/.test(head) &&
      /!\/Apple\/\.test\(n\.vendor \|\| ""\) && n\.hardwareConcurrency && n\.hardwareConcurrency <= 2\)/.test(head) &&
      !/deviceMemory <= [3-9]|hardwareConcurrency <= [3-9]/.test(head) &&
      /n\.connection && n\.connection\.saveData/.test(head) &&
      /q === "light" \|\| q === "full"/.test(head),
  );
  check(
    "…or by the hero's first second, under 40 frames, after which the rest is the light desk (and the story follows)",
    /if \(t >= 1250\)\{ const slow = probe\.n < 40;/.test(page) && /document\.dispatchEvent\(new Event\("hf:light"\)\)/.test(page) && /document\.addEventListener\("hf:light"/.test(page),
  );
  check(
    "…the light desk keeps about a third of the letters (the three, the ones with Ava's reasons, every fourth of the rest), in the same stack",
    /e\.inLight = e\.fin >= 0 \|\| e\.fan >= 0 \|\| \(K - 1 - e\.k\) % 4 === 0;/.test(page) && /e\.inLight = e\.fin >= 0 \|\| e\.as >= 0 \|\| \(NL - 7 - e\.k\) % 4 === 0;/.test(page),
  );
  check(
    "…turns flat instead of in 3D, with no blur behind the bar and no filter on a seal",
    /const turnY = \(deg, per\) => LITE \? ` scaleX\(/.test(page) && /const turnX = \(deg, per\) => LITE \? `scaleY\(/.test(page) &&
      /html\[data-desk="light"\] \.bar::before\{-webkit-backdrop-filter:none;backdrop-filter:none;background:var\(--desk\)\}/.test(page) &&
      /html\[data-desk="light"\] \.slip \.in\{transform-style:flat;/.test(page),
  );
  check(
    "for every device: a shadow under paper in the air is its own layer only while it shows, and the desk's letters are not drawn while the story fills the screen (content-visibility on #scene, never on #hero: a skipped hero kept its old height through a resize and the story ran off by the difference)",
    (page.match(/liftOn\(c, /g) ?? []).length >= 4 && /#scene\{[^}]*content-visibility:auto/.test(page) &&
      !/#hero\{[^}]*content-visibility/.test(page),
  );
}

console.log("\nThe share pictures are in the Desk's look");
{
  // 2026-10-30: the front page's card (og:image, also the blog's and the
  // sign-up link's) was still the retired near-black and gold card under the
  // new green mark; every shared hireflownow.com link showed it.
  const maker = await read("scripts/make-share-images.mjs");
  check(
    "scripts/make-share-images.mjs draws the sage desk, the jade and Besley, never the near-black and gold card",
    /#C6CFBE/.test(maker) && /#0F6B4F/.test(maker) && /family=Besley/.test(maker) && /family=Schibsted\+Grotesk/.test(maker) &&
      !/#0B0A08|#E8C37E|224, ?185, ?106|Instrument\+Serif|family=Geist/.test(maker),
  );
  const signupCard = await read("public/share-signup.html");
  check("the sign-up link's card says what the picture says, with no time-of-day story", /<meta property="og:image:alt" content="HireFlow: Hundreds apply\. Three land on your desk\.">/.test(signupCard) && !/\b(night|tonight|overnight|morning|sleep|asleep|evening|dawn)\b/i.test(signupCard));
}

console.log("\nApplicant links show the applicants' picture, never HireFlow's");
const shell = await read("index.html");
// Since 2026-10-11 (other businesses): the shell is every business's, so it
// carries the plain applicants' picture; a careers page and a job link get
// their own from their server render. Never HireFlow's landing image.
check("the app's shell: the plain applicants' picture, never the landing's", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/careers\.jpg" \/>/.test(shell) && !/hireflow\.jpg/.test(shell) && !/Zulu/.test(shell));
const prerender = await read("api/job-prerender.mjs");
check("a job page's server render: the same, large, named by the render itself (not left to the shell)", /<meta name="twitter:card" content="summary_large_image" \/>/.test(prerender) && /<meta property="og:image" content="\$\{origin\}\/share\/\$\{home \? "zulu-careers" : "careers"\}\.jpg" \/>/.test(prerender) && /og:\(title\|description\|url\|image\(:\[a-z\]\+\)\?\)/.test(prerender) && !/hireflow\.jpg/.test(prerender));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
