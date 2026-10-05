#!/usr/bin/env node
/**
 * Plain-Node test of supabase/functions/applicant-file-url/filePaths.ts: which
 * stored files a staff link may be signed for. The function signs with the
 * service role, so this list IS the boundary: only a path the application
 * itself lists (notes.fileUploads[*].url / .imageUrls, notes.resumeImageUrls,
 * applications.resume_url), never an arbitrary object in the bucket, and
 * never a path that walks out of its folder. Who may ask (the job owner or a
 * scoped active team member) is decided by the database functions the
 * applications RLS uses; canReadApplicantFiles only combines the two.
 *
 * Run with: node scripts/applicant_file_url.test.mjs
 */
import {
  APPLICANT_FILES_BUCKET,
  authorizeApplicantFilePath,
  canReadApplicantFiles,
  listedApplicantFilePaths,
  storagePathFrom,
} from "../supabase/functions/applicant-file-url/filePaths.ts";

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

const UID = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const RESUME = `${UID}/1759700000000_fq5.pdf`;
const PAGE1 = `${UID}/1759700000001_fq5_page1.png`;
const PORTFOLIO = `${UID}/1759700000002_fq9.docx`;
const PUBLIC_URL = (p) => `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/public/resumes/${p}`;
const SIGNED_URL = (p) => `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/sign/resumes/${p}?token=abc.def`;

const notes = JSON.stringify({
  applicationAnswers: [{ questionId: "fq5", answer: RESUME }],
  fileUploads: {
    fq5: { url: RESUME, imageUrls: [PAGE1], isResume: true },
    fq9: { url: PORTFOLIO, imageUrls: [], isResume: false },
    broken: null,
  },
  resumeImageUrls: [PAGE1],
});

console.log("storagePathFrom:\n");
check("the bucket is resumes", APPLICANT_FILES_BUCKET === "resumes");
check("a bare path is itself", storagePathFrom(RESUME) === RESUME);
check("a leading slash is dropped", storagePathFrom(`/${RESUME}`) === RESUME);
check("a legacy public URL gives its path", storagePathFrom(PUBLIC_URL(RESUME)) === RESUME);
check("a signed URL gives its path (query dropped)", storagePathFrom(SIGNED_URL(RESUME)) === RESUME);
check("an encoded path is decoded", storagePathFrom(PUBLIC_URL(`${UID}/my%20cv.pdf`)) === `${UID}/my cv.pdf`);
check("an external link is not a stored file", storagePathFrom("https://example.com/portfolio.pdf") === null);
check("any other scheme is not a stored file", storagePathFrom("https:evil.example/a.pdf") === null && storagePathFrom("javascript:alert(1)") === null && storagePathFrom("data:text/plain,hi") === null);
check("another bucket's URL is not this one's", storagePathFrom("https://x.supabase.co/storage/v1/object/public/videos/a.mp4") === null);
for (const bad of [`${UID}/../${OTHER}/cv.pdf`, `../${RESUME}`, `${UID}/./cv.pdf`, `${UID}//cv.pdf`, `${UID}\\cv.pdf`, `${UID}/cv\u0000.pdf`, PUBLIC_URL(`${UID}/%2e%2e/${OTHER}/cv.pdf`), "", "   ", "x".repeat(1025)]) {
  check(`refused: ${JSON.stringify(bad).slice(0, 70)}`, storagePathFrom(bad) === null);
}
check("non-strings are refused", storagePathFrom(null) === null && storagePathFrom(42) === null && storagePathFrom({}) === null);
check("a malformed escape is refused, not thrown", storagePathFrom(PUBLIC_URL(`${UID}/%E0%A4%A.pdf`)) === null);

console.log("\nlistedApplicantFilePaths:\n");
const listed = listedApplicantFilePaths(notes, PUBLIC_URL(RESUME));
check("every upload, its page images, and the resume, once each", JSON.stringify(listed) === JSON.stringify([RESUME, PAGE1, PORTFOLIO]), JSON.stringify(listed));
check("notes as an object work too", listedApplicantFilePaths(JSON.parse(notes), null).length === 3);
check("unreadable notes list only the resume", JSON.stringify(listedApplicantFilePaths("{not json", RESUME)) === JSON.stringify([RESUME]));
check("nothing stored lists nothing", listedApplicantFilePaths(null, null).length === 0);

console.log("\nauthorizeApplicantFilePath:\n");
const app = { notes, resume_url: null, candidate_id: UID };
const ok = (p) => authorizeApplicantFilePath(p, app);
check("a listed upload is signed", JSON.stringify(ok(PORTFOLIO)) === JSON.stringify({ ok: true, path: PORTFOLIO }));
check("a listed page image is signed", ok(PAGE1).ok === true);
check("the stored URL of a listed file is signed as its path", JSON.stringify(ok(SIGNED_URL(RESUME))) === JSON.stringify({ ok: true, path: RESUME }));
check("the resume_url alone is enough for the resume", authorizeApplicantFilePath(RESUME, { notes: "{}", resume_url: PUBLIC_URL(RESUME), candidate_id: UID }).ok === true);
check("another candidate's file is not part of this application", JSON.stringify(ok(`${OTHER}/1759700000000_fq5.pdf`)) === JSON.stringify({ ok: false, reason: "not_listed" }));
check("a file in the same folder but not listed is refused", ok(`${UID}/secret.pdf`).reason === "not_listed");
check("walking out of a listed folder is refused as invalid", ok(`${UID}/../${OTHER}/1759700000000_fq5.pdf`).reason === "invalid_path");
check("no path is invalid", authorizeApplicantFilePath(undefined, app).reason === "invalid_path");
// A candidate can edit their own notes: listing someone else's file there must not get staff a link to it.
const planted = JSON.stringify({ fileUploads: { fq5: { url: `${OTHER}/1759700000000_fq5.pdf` } } });
check("another person's file a candidate listed in their own notes is refused",
  JSON.stringify(authorizeApplicantFilePath(`${OTHER}/1759700000000_fq5.pdf`, { notes: planted, resume_url: null, candidate_id: UID })) ===
    JSON.stringify({ ok: false, reason: "not_the_candidates" }));
check("…and so is anything when the application has no candidate id", authorizeApplicantFilePath(RESUME, { notes, resume_url: null, candidate_id: null }).reason === "not_the_candidates");
check("the folder check ignores letter case of the uuid", authorizeApplicantFilePath(RESUME, { notes, resume_url: null, candidate_id: UID.toUpperCase() }).ok === true);

console.log("\ncanReadApplicantFiles:\n");
check("the job's owner", canReadApplicantFiles({ isJobOwner: true, isScopedTeamMember: false }));
check("an active team member scoped to the job", canReadApplicantFiles({ isJobOwner: false, isScopedTeamMember: true }));
check("anyone else (incl. the candidate, another employer, a team member of another job)", !canReadApplicantFiles({ isJobOwner: false, isScopedTeamMember: false }));

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
