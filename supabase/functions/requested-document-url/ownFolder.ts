/**
 * Which stored file requested-document-url may sign: a document request's
 * file_url, only in that applicant's own folder of the requested-documents
 * bucket. Pure, and its one import is import-free, so
 * scripts/document_requests.test.mjs runs it under plain Node.
 *
 * The link is signed with the service key, and storage-js puts the path into
 * the request address as it is: a "%2e%2e" part became a parent step once
 * the address was read, so a path that started with the applicant's own
 * folder could sign a file in another one (the sixth security review). Every
 * part must be a plain name (isPlainObjectPath, as document-signing and
 * _shared/resume.ts hold theirs). The database refuses such a value too
 * (20261025500000_plain_file_paths.sql); this checks again.
 */
import { isPlainObjectPath } from "../_shared/ownDocumentFile.ts";

/** True when a stored path is a file in this applicant's own folder. */
export function inOwnFolder(path: unknown, candidateId: string): path is string {
  return typeof path === "string" && path.startsWith(`${candidateId}/`) && !path.includes("..") && path.length <= 1024 && isPlainObjectPath(path);
}
