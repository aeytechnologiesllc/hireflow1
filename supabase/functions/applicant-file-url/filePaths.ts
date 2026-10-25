/**
 * Which stored files an application lists — the only paths applicant-file-url
 * will sign. Pure, and its one import (_shared/ownDocumentFile.ts) is
 * import-free, so scripts/applicant_file_url.test.mjs runs it under plain Node.
 *
 * Files a candidate attaches on the application form are uploaded to the
 * private `resumes` bucket under their own user id
 * (ApplicationFormPhase.tsx) and listed in the application's notes:
 *
 *   notes.fileUploads[questionId] = { url: "<uid>/<ts>_<qid>.pdf", imageUrls: ["<uid>/…_page1.png", …], isResume }
 *   notes.resumeImageUrls = [...]   (the resume's page images, also under fileUploads)
 *   applications.resume_url         (a bare path, or a legacy public URL)
 *
 * The bucket's storage policies let the job's OWNER read only the resume
 * (resume_url), so the other uploads (and everything, for a team member)
 * were unreadable to staff. applicant-file-url signs them with the service
 * role after checking the caller is staff on that job; this module decides
 * that the path really is one this application lists, so the function can
 * never be used to sign an arbitrary object in the bucket.
 *
 * The candidate can edit their own notes, so "listed" alone is not enough: a
 * candidate could list another person's file and wait for staff to open it.
 * Every upload to this bucket sits under the uploader's own user id (the
 * bucket's INSERT policy requires the first folder to be auth.uid()), so a
 * file is signed only when it is also in THIS application's candidate's
 * folder.
 */

import { isPlainObjectPath } from "../_shared/ownDocumentFile.ts";

export const APPLICANT_FILES_BUCKET = "resumes";
const MAX_PATH = 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function notesObject(notes: unknown): Record<string, unknown> {
  if (isPlainObject(notes)) return notes;
  if (typeof notes === "string" && notes.trim()) {
    try {
      const parsed = JSON.parse(notes);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * The object path inside the bucket for a stored value: a bare path as it
 * is, or the part after `/resumes/` of a full (public or signed) URL. Null
 * for anything else (an external link, an empty value) and for anything
 * that is not a plain relative path: `..` segments, a backslash, a control
 * character, a `%` (isPlainObjectPath).
 */
export function storagePathFrom(stored: unknown, bucket = APPLICANT_FILES_BUCKET): string | null {
  if (typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  let path: string;
  const match = trimmed.match(new RegExp(`/${bucket}/(.+?)(?:\\?|#|$)`));
  if (match) {
    try {
      path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    path = trimmed;
  } else {
    return null;
  }
  path = path.replace(/^\/+/, "");
  if (!path || path.length > MAX_PATH) return null;
  // Every part a plain name, as document-signing and _shared/resume.ts hold
  // theirs: the path is signed with the service key, and storage-js puts it
  // into the request address as it is, so a "%2e%2e" (or a stored URL's
  // "%252e%252e", decoded once above) became a parent step and signed a file
  // in another person's folder (the sixth security review).
  if (!isPlainObjectPath(path)) return null;
  return path;
}

/** Every file path the application lists (normalised, unique, in order). */
export function listedApplicantFilePaths(notes: unknown, resumeUrl: unknown): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const path = storagePathFrom(value);
    if (path && !out.includes(path)) out.push(path);
  };
  const n = notesObject(notes);
  if (isPlainObject(n.fileUploads)) {
    for (const upload of Object.values(n.fileUploads)) {
      if (!isPlainObject(upload)) continue;
      add(upload.url);
      add(upload.fileUrl);
      if (Array.isArray(upload.imageUrls)) upload.imageUrls.forEach(add);
    }
  }
  if (Array.isArray(n.resumeImageUrls)) n.resumeImageUrls.forEach(add);
  add(resumeUrl);
  return out;
}

export type FilePathDecision =
  | { ok: true; path: string }
  | { ok: false; reason: "invalid_path" | "not_listed" | "not_the_candidates" };

/**
 * Whether `requested` (a path or a stored URL) is a file this application
 * lists AND one the application's own candidate uploaded (their folder).
 */
export function authorizeApplicantFilePath(
  requested: unknown,
  application: { notes: unknown; resume_url: unknown; candidate_id: unknown },
): FilePathDecision {
  const path = storagePathFrom(requested);
  if (!path) return { ok: false, reason: "invalid_path" };
  if (!listedApplicantFilePaths(application.notes, application.resume_url).includes(path)) {
    return { ok: false, reason: "not_listed" };
  }
  const owner = typeof application.candidate_id === "string" ? application.candidate_id.toLowerCase() : "";
  if (!owner || path.split("/")[0].toLowerCase() !== owner) return { ok: false, reason: "not_the_candidates" };
  return { ok: true, path };
}

/** Staff on this application's job: its owner, or an active team member scoped to it. */
export function canReadApplicantFiles(input: { isJobOwner: boolean; isScopedTeamMember: boolean }): boolean {
  return input.isJobOwner || input.isScopedTeamMember;
}
