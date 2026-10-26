/**
 * Which stored file requested-document-url may sign: a document request's
 * file_url, only in that request's own folder of the requested-documents
 * bucket, <applicant id>/<request id>/. Pure, and its one import is
 * import-free, so scripts/document_requests.test.mjs runs it under plain
 * Node.
 *
 * The link is signed with the service key, and storage-js puts the path into
 * the request address as it is: a "%2e%2e" part became a parent step once
 * the address was read, so a path that started with the applicant's own
 * folder could sign a file in another one (the sixth security review). Every
 * part must be a plain name (isPlainObjectPath, as document-signing and
 * _shared/resume.ts hold theirs). The database refuses such a value too
 * (20261025500000_plain_file_paths.sql); this checks again.
 *
 * The request's own folder, not the applicant's (the thirteenth Phase 5
 * review): an applicant who applied to two businesses has both businesses'
 * papers in their folder, so a request that pointed at another request's file
 * (one slip in the database's guard: the review's weakenings K7 and K8) would
 * have signed the first business's ID for the second. The database links
 * nothing else since 20261025610000 (<their id>/<request id>/<one name>), and
 * no live request had a file then, so no older link is left out.
 */
import { isPlainObjectPath } from "../_shared/ownDocumentFile.ts";

/** True when a stored path is a file in this request's own folder (<applicant id>/<request id>/…). */
export function inOwnFolder(path: unknown, candidateId: string, requestId: string): path is string {
  return typeof path === "string" && typeof requestId === "string" && requestId.length > 0 && path.startsWith(`${candidateId}/${requestId}/`) && !path.includes("..") && path.length <= 1024 && isPlainObjectPath(path);
}
