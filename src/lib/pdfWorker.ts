import { pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * The PDF.js worker, served from this site (2026-10-25; docs/LAUNCH-PLAN.md,
 * Phase 1, Pass C). It was loaded from unpkg.com, which meant the site's
 * Content-Security-Policy had to trust every package unpkg serves (a source
 * path that does not end in "/" matches only one exact file, and the version
 * is in the path). Vite now bundles the worker as one of the site's own
 * files, the version always matching the library, and nothing PDF-related
 * comes from another host.
 */
export function servePdfWorkerFromThisSite(): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== pdfWorkerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
}
