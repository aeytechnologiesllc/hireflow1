import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callOpenAIJson, openAIErrorStatus, requireJsonKeys } from "../_shared/openai.ts";
import type { OpenAIMessageContent } from "../_shared/openai.ts";

// Model is configurable so a retirement is a config change, not a code change.
// Set OPENAI_PORTFOLIO_MODEL to the replacement model when swapping.
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_PORTFOLIO_MODEL = Deno.env.get("OPENAI_PORTFOLIO_MODEL") || "gpt-5.6-terra";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILES_TO_ANALYZE = 10;
// Every file is inlined as base64 in the request body. Skip any single file
// over 8 MB outright, and stop attaching once 20 MB of raw bytes are in
// (≈27 MB encoded — under OpenAI's 32 MB per-request budget for file inputs).
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_INLINE_BYTES = 20 * 1024 * 1024;

type ContentPart = Exclude<OpenAIMessageContent, string>[number];

/** What the client sends: `{ url, name, type }` per uploaded file. Legacy callers sent bare URL strings. */
interface PortfolioItem {
  url: string;
  name: string;
  type: string;
}

interface SkippedFile {
  file: string;
  reason: string;
}

type FileKind =
  | { kind: "pdf" }
  | { kind: "image"; mime: string }
  | { kind: "unsupported" };

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const SUPPORTED_IMAGE_MIMES = new Set(Object.values(IMAGE_MIME_BY_EXT));

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
  }
  return adminClient;
}

/**
 * Fetch a candidate's portfolio file.
 *
 * This used to be a bare `fetch(url)` against a public bucket URL, which only
 * worked because the `portfolios` bucket was world-readable — the same fact
 * that put candidates' work samples at permanent unauthenticated URLs. The
 * bucket is private now, so a stored public URL no longer serves anything;
 * reading through the storage API with the service role is the only path.
 * Legacy rows hold full public URLs and newer ones hold bare paths, so both
 * shapes are handled (same rule as src/utils/candidateMediaUrl.ts); a value
 * pointing somewhere else entirely (an external link a candidate pasted) still
 * falls back to a plain fetch, which is correct for a genuinely external file.
 */
async function fetchPortfolioFile(url: string): Promise<ArrayBuffer | null> {
  const match = url.match(/\/portfolios\/(.+?)(?:\?|$)/);
  const path = match
    ? decodeURIComponent(match[1])
    : /^https?:\/\//i.test(url)
      ? null
      : url.replace(/^\/+/, "");

  if (path) {
    const { data, error } = await getAdminClient().storage.from("portfolios").download(path);
    if (error || !data) {
      console.error(`Storage download failed for ${path}:`, error);
      return null;
    }
    return await data.arrayBuffer();
  }

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch external file: ${url}, status: ${res.status}`);
    return null;
  }
  return await res.arrayBuffer();
}

function fileNameFromUrl(url: string): string {
  const last = url.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Accept both shapes the client has ever sent. The previous version called
 * `url.match(...)` on the `{ url, name, type }` object, which threw for every
 * file — so every file was "skipped" and the model scored an empty portfolio.
 */
function normalizePortfolioItem(raw: unknown, index: number): PortfolioItem | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    return { url, name: fileNameFromUrl(url) || `file-${index + 1}`, type: "" };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!url) return null;
    const name = typeof r.name === "string" && r.name.trim()
      ? r.name.trim()
      : fileNameFromUrl(url) || `file-${index + 1}`;
    const type = typeof r.type === "string" ? r.type.trim().toLowerCase() : "";
    return { url, name, type };
  }
  return null;
}

function extensionOf(s: string): string {
  return (s.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
}

function classify(item: PortfolioItem): FileKind {
  const ext = extensionOf(item.name) || extensionOf(fileNameFromUrl(item.url));
  if (item.type === "application/pdf" || ext === "pdf") return { kind: "pdf" };
  if (SUPPORTED_IMAGE_MIMES.has(item.type)) return { kind: "image", mime: item.type };
  if (IMAGE_MIME_BY_EXT[ext]) return { kind: "image", mime: IMAGE_MIME_BY_EXT[ext] };
  return { kind: "unsupported" };
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The "score 60 / CONSIDER" safety net when the model gives back nothing usable. */
function buildFallbackAnalysis(imageCount: number, pdfCount: number, skipped: SkippedFile[]) {
  return {
    score: 60,
    summary: "Portfolio reviewed. Manual verification recommended due to parsing issues.",
    filesAnalyzed: {
      total: imageCount + pdfCount,
      images: imageCount,
      pdfs: pdfCount,
      pdfPageDetails: [],
      skippedFiles: skipped.length,
      skipped,
    },
    authenticity: {
      assessment: "UNKNOWN",
      confidence: "LOW",
      concerns: ["Could not fully analyze content"],
    },
    relevance: { score: 60, feedback: "Portfolio appears relevant to the position. Manual review recommended." },
    quality: { score: 60, feedback: "Work demonstrates some technical skills. Needs manual verification." },
    creativity: { score: 60, feedback: "Unable to fully assess creativity." },
    penaltiesApplied: [],
    bonusesApplied: [],
    strengths: ["Portfolio submitted successfully", `${imageCount} images and ${pdfCount} PDFs received`],
    areasForImprovement: ["Analysis could not be fully completed"],
    recommendation: "CONSIDER - Portfolio submitted for manual review",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { portfolioUrls, jobTitle, jobDescription } = await req.json();

    if (!Array.isArray(portfolioUrls) || portfolioUrls.length === 0) {
      throw new Error("No portfolio URLs provided");
    }

    if (!OPENAI_API_KEY) {
      console.error("[ai-analyze-portfolio] OPENAI_API_KEY is not configured");
      return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const items = portfolioUrls
      .map((raw: unknown, i: number) => normalizePortfolioItem(raw, i))
      .filter((item: PortfolioItem | null): item is PortfolioItem => item !== null);

    console.log(`Analyzing ${items.length} portfolio items for job: ${jobTitle} (model: ${OPENAI_PORTFOLIO_MODEL})`);

    const promptHeader = `You are AIVA, an expert portfolio reviewer with a CRITICAL and DISCERNING eye. You analyze work samples for job applications with HIGH STANDARDS.

**Job Title:** ${jobTitle || "Not specified"}
**Job Description:** ${jobDescription || "Not specified"}

## SCORING METHODOLOGY

**BASE SCORE: Start at 60 (average candidate)**

### SCORING PENALTIES (MANDATORY DEDUCTIONS)

**CRITICAL RED FLAGS (-25 points each):**
- AI-GENERATED IMAGES detected (DALL-E, Midjourney, Stable Diffusion signatures, uncanny valley effects, AI artifacts)
- Stock photos/images clearly not created by the candidate
- Plagiarized or copied work (watermarks, inconsistent styles suggesting multiple sources)
- Work samples completely irrelevant to the job

**MAJOR RED FLAGS (-15 points each):**
- Generic template-based designs with minimal customization
- Very low resolution or unprofessional quality images
- No original work - all samples appear derivative or student exercises
- Portfolio pieces with no context or explanation
- Inconsistent skill level across samples (suggesting some work isn't theirs)

**MODERATE RED FLAGS (-10 points each):**
- Limited variety - all samples look very similar
- Outdated work (styles/techniques from 5+ years ago with nothing recent)
- Poor presentation - messy, unorganized, hard to evaluate
- Missing key elements expected for the role

**MINOR RED FLAGS (-5 points each):**
- Minor quality issues in some samples
- Some irrelevant filler content
- Inconsistent formatting across samples

### POSITIVE ADJUSTMENTS

**Strong positives (+10-15 points each):**
- Clearly original, verifiable work with consistent personal style
- Highly relevant samples that directly match job requirements
- Professional-quality execution with attention to detail
- Real client work or published projects with credits
- Work that shows problem-solving process, not just final results

**Good indicators (+5-10 points each):**
- Variety of work showing range of skills
- Recent work showing current abilities
- Clear organization and professional presentation
- Context provided explaining role/contribution

### SCORE CAPS (MAXIMUM POSSIBLE SCORES)

- If AI-GENERATED IMAGES detected: MAX 50%
- If stock photos or plagiarized work: MAX 45%
- If completely irrelevant to job: MAX 55%
- If generic/template work only: MAX 65%
- High scores (85%+) require: original work, professional quality, high relevance, consistent style

### AI-GENERATED CONTENT DETECTION

Look for these signs of AI-generated images:
1. Uncanny valley faces - slightly off proportions, asymmetry
2. Warped or melting text, signs, backgrounds
3. Extra or missing fingers, distorted hands
4. Overly smooth, plastic-like skin textures
5. Inconsistent lighting and shadows
6. Bizarre background elements that don't make sense
7. Perfect symmetry where it shouldn't exist
8. Telltale AI art styles (hyperdetailed fantasy, generic corporate illustrations)

### MULTI-PAGE DOCUMENT REPORTING

For each PDF document, you MUST report:
- How many pages you reviewed
- Key content on each page
- Overall document assessment

## ANALYSIS REQUIREMENTS

Analyze ALL portfolio items provided (images AND PDF documents). For each item, silently evaluate:
1. **Authenticity** - Is this original work or AI-generated/stock/copied?
2. **Relevance** - How well does this relate to the job requirements?
3. **Quality** - Technical skill, attention to detail, professionalism
4. **Creativity** - Originality, innovation, unique approach
5. **Presentation** - Organization, polish, professional context

## OUTPUT FORMAT

Provide your analysis in this exact JSON format:
{
  "score": <number 0-100 - use the scoring methodology above, high scores are RARE>,
  "summary": "<2-3 sentence overall assessment - be specific about strengths and concerns>",
  "filesAnalyzed": {
    "total": <number>,
    "images": <number>,
    "pdfs": <number>,
    "pdfPageDetails": [
      {"filename": "<name or index>", "pagesReviewed": <number>, "keyContent": "<brief description>"}
    ],
    "skippedFiles": <number if any were skipped>
  },
  "authenticity": {
    "assessment": "<ORIGINAL/MOSTLY_ORIGINAL/MIXED/LIKELY_AI_GENERATED/STOCK_IMAGES>",
    "confidence": "<HIGH/MEDIUM/LOW>",
    "concerns": ["<any specific concerns>"]
  },
  "relevance": {
    "score": <number 0-100>,
    "feedback": "<specific feedback on job relevance>"
  },
  "quality": {
    "score": <number 0-100>,
    "feedback": "<specific feedback on technical quality>"
  },
  "creativity": {
    "score": <number 0-100>,
    "feedback": "<specific feedback on creativity and originality>"
  },
  "penaltiesApplied": ["<list each penalty and point deduction, e.g., '-15: Generic template designs'>"],
  "bonusesApplied": ["<list each bonus and points added, e.g., '+10: Professional client work'>"],
  "strengths": ["<strength 1>", "<strength 2>"],
  "areasForImprovement": ["<area 1>", "<area 2>"],
  "recommendation": "<STRONG_HIRE/HIRE/CONSIDER/LEAN_PASS/PASS with brief justification>"
}

BE CRITICAL AND HONEST. A score of 85+ should be exceptional. Average portfolios score 55-70.`;

    // Attach files. Images go in as data-URL image parts; PDFs as Chat
    // Completions `file` parts. Each attachment is preceded by a short text
    // label so the model can name files in pdfPageDetails.
    const itemsToAnalyze = items.slice(0, MAX_FILES_TO_ANALYZE);
    const attachments: ContentPart[] = [];
    const skipped: SkippedFile[] = [];
    const notes: string[] = [];
    const pdfDetails: string[] = [];
    let pdfCount = 0;
    let imageCount = 0;
    let totalInlineBytes = 0;

    for (const item of items.slice(MAX_FILES_TO_ANALYZE)) {
      skipped.push({ file: item.name, reason: `over the ${MAX_FILES_TO_ANALYZE}-file limit` });
    }

    for (let i = 0; i < itemsToAnalyze.length; i++) {
      const item = itemsToAnalyze[i];
      const label = `#${i + 1} "${item.name}"`;
      const skip = (reason: string) => {
        console.warn(`[ai-analyze-portfolio] skipping file ${label}: ${reason}`);
        skipped.push({ file: item.name, reason });
        notes.push(`[Note: file ${label} was not included: ${reason}]`);
      };

      const kind = classify(item);
      if (kind.kind === "unsupported") {
        skip(`unsupported file type (${item.type || "unknown"})`);
        continue;
      }

      try {
        const bytes = await fetchPortfolioFile(item.url);
        if (!bytes) {
          skip("could not be downloaded");
          continue;
        }
        if (bytes.byteLength > MAX_FILE_BYTES) {
          skip(`too large to analyze (${mb(bytes.byteLength)} MB; limit ${mb(MAX_FILE_BYTES)} MB)`);
          continue;
        }
        if (totalInlineBytes + bytes.byteLength > MAX_TOTAL_INLINE_BYTES) {
          skip(`total attachment budget of ${mb(MAX_TOTAL_INLINE_BYTES)} MB reached`);
          continue;
        }

        totalInlineBytes += bytes.byteLength;
        const b64 = base64Encode(bytes);
        const sizeKB = Math.round(bytes.byteLength / 1024);

        if (kind.kind === "pdf") {
          pdfCount++;
          const filename = /\.pdf$/i.test(item.name) ? item.name : `${item.name}.pdf`;
          attachments.push({ type: "text", text: `File ${label} — PDF document, ${sizeKB}KB:` });
          attachments.push({
            type: "file",
            file: { filename, file_data: `data:application/pdf;base64,${b64}` },
          });
          pdfDetails.push(`PDF #${pdfCount} "${item.name}" (${sizeKB}KB)`);
        } else {
          imageCount++;
          attachments.push({ type: "text", text: `File ${label} — image (${kind.mime}), ${sizeKB}KB:` });
          attachments.push({
            type: "image_url",
            image_url: { url: `data:${kind.mime};base64,${b64}` },
          });
        }
        console.log(`[ai-analyze-portfolio] attached ${kind.kind} ${label} (${sizeKB}KB)`);
      } catch (fetchError) {
        console.error(`[ai-analyze-portfolio] error processing file ${label}:`, fetchError);
        skip("processing error");
      }
    }

    const analyzedCount = imageCount + pdfCount;
    console.log(`Portfolio analysis includes: ${imageCount} images, ${pdfCount} PDFs, ${skipped.length} skipped (${mb(totalInlineBytes)} MB inlined)`);

    if (analyzedCount === 0) {
      // Nothing reached the model — don't ask it to score an empty portfolio.
      console.error(
        "[ai-analyze-portfolio] FALLBACK: no files could be attached; returning default score 60 / CONSIDER without calling the model.",
        { submitted: items.length, skipped }
      );
      return jsonResponse(buildFallbackAnalysis(0, 0, skipped));
    }

    const promptText = `${promptHeader}${notes.length ? `\n\n${notes.join("\n")}` : ""}

## FILES SUBMITTED FOR YOUR REVIEW:
- Total files submitted: ${items.length}
- Files attached for analysis: ${analyzedCount} (limit: ${MAX_FILES_TO_ANALYZE})
- Images: ${imageCount}
- PDF documents: ${pdfCount}${pdfDetails.length > 0 ? ` (${pdfDetails.join(", ")})` : ""}
- Skipped/failed: ${skipped.length}${items.length > MAX_FILES_TO_ANALYZE ? `\n- NOTE: ${items.length - MAX_FILES_TO_ANALYZE} additional files were submitted but not analyzed due to the ${MAX_FILES_TO_ANALYZE}-file limit.` : ""}

IMPORTANT: For each PDF, report the number of pages you reviewed and describe key content. Your filesAnalyzed.pdfPageDetails array must have an entry for each PDF.`;

    let analysis: any;
    try {
      const { data, rawContent } = await callOpenAIJson<any>({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_PORTFOLIO_MODEL,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: promptText }, ...attachments],
          },
        ],
        // Detailed multi-file JSON; reasoning tokens count against this too.
        maxCompletionTokens: 4000,
        timeoutMs: 120000,
        validator: (value) => requireJsonKeys(value, ["score", "summary"]),
      });
      console.log("Raw AI response:", rawContent.substring(0, 500) + "...");
      analysis = data;
    } catch (error) {
      const status = openAIErrorStatus(error);

      if (status === 429) {
        return jsonResponse({ error: "Rate limit exceeded. Please try again later." }, 429);
      }
      if (status === 402) {
        return jsonResponse({ error: "API credits exhausted. Please add credits." }, 402);
      }
      if (status !== null) {
        // Any other HTTP failure takes the same road as before: the outer
        // catch answers 200 with the score-50 "processing error" body.
        console.error("AI API error:", status, error);
        throw new Error(`AI API error: ${status}`);
      }

      // Unparseable / structurally invalid JSON after the helper's retry.
      console.error(
        "[ai-analyze-portfolio] FALLBACK: OpenAI returned no parseable analysis; defaulting to score 60 / CONSIDER.",
        {
          model: OPENAI_PORTFOLIO_MODEL,
          images: imageCount,
          pdfs: pdfCount,
          skipped: skipped.length,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      analysis = buildFallbackAnalysis(imageCount, pdfCount, skipped);
    }

    // filesAnalyzed carries what we actually attached, not what the model
    // believes it saw. Its per-PDF page notes are kept; the skip list is ours.
    const modelFiles = analysis.filesAnalyzed && typeof analysis.filesAnalyzed === "object"
      ? analysis.filesAnalyzed
      : {};
    analysis.filesAnalyzed = {
      ...modelFiles,
      total: analyzedCount,
      images: imageCount,
      pdfs: pdfCount,
      pdfPageDetails: Array.isArray(modelFiles.pdfPageDetails) ? modelFiles.pdfPageDetails : [],
      skippedFiles: skipped.length,
      skipped,
    };

    console.log("Portfolio analysis complete:", {
      score: analysis.score,
      authenticity: analysis.authenticity?.assessment,
      recommendation: analysis.recommendation,
      imagesAnalyzed: imageCount,
      pdfsAnalyzed: pdfCount,
      skippedFiles: skipped.length,
    });

    return jsonResponse(analysis);
  } catch (error) {
    console.error("Error in ai-analyze-portfolio:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
      // Return basic analysis even on error - but with low score requiring manual review
      score: 50,
      summary: "Portfolio upload encountered issues. Manual review strongly recommended.",
      filesAnalyzed: { total: 0, images: 0, pdfs: 0, pdfPageDetails: [], skippedFiles: 0, skipped: [] },
      authenticity: { assessment: "UNKNOWN", confidence: "LOW", concerns: ["Processing error occurred"] },
      penaltiesApplied: ["-10: Processing error"],
      bonusesApplied: [],
      strengths: ["Portfolio submitted"],
      areasForImprovement: ["Resubmission may be needed"],
      recommendation: "CONSIDER - Manual review required",
    }, 200);
  }
});
