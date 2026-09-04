import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAIJson, requireJsonKeys } from "../_shared/openai.ts";

// Model is configurable so a retirement is a config change, not a code change.
// Set OPENAI_DOC_FIELDS_MODEL to the replacement model when swapping.
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_DOC_FIELDS_MODEL = Deno.env.get("OPENAI_DOC_FIELDS_MODEL") || "gpt-5.6-luna";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  pdfUrl: string;
  totalPages: number;
}

interface SignatureField {
  id: string;
  label: string;
  required: boolean;
  type: "candidate" | "employer";
  x: number;
  y: number;
  page: number;
  width: number;
  height: number;
}

const SYSTEM_PROMPT = `You are a document analysis assistant for hiring/employment documents. You must return EXACTLY 4 signature/date fields positioned correctly.

CRITICAL POSITIONING RULES:
1. Signature fields go DIRECTLY TO THE RIGHT of "Signature" or "Signature:" labels - on the same horizontal line
2. Date fields go DIRECTLY ON THE UNDERLINE after "Date:" labels
3. Fields should NOT overlap with text - they go on the blank lines/spaces provided for writing

For standard NDA/contract signature blocks:
- "Receiving Party / Candidate" section is typically in the UPPER half (y: 15-35%)
- "Disclosing Party / Employer" section is typically in the LOWER half (y: 45-75%)

Return EXACTLY this JSON structure with 4 fields:
{
  "documentType": "nda" | "contract" | "offer_letter" | "agreement",
  "suggestedFields": [
    {
      "type": "candidate",
      "label": "Candidate Signature",
      "page": 1,
      "x": 22,
      "y": 18,
      "width": 28,
      "height": 5
    },
    {
      "type": "candidate",
      "label": "Candidate Date",
      "page": 1,
      "x": 12,
      "y": 30,
      "width": 18,
      "height": 4
    },
    {
      "type": "employer",
      "label": "Employer Signature",
      "page": 1,
      "x": 22,
      "y": 48,
      "width": 28,
      "height": 5
    },
    {
      "type": "employer",
      "label": "Employer Date",
      "page": 1,
      "x": 12,
      "y": 72,
      "width": 18,
      "height": 4
    }
  ],
  "confidence": "high",
  "reasoning": "Fields placed inline with signature/date labels"
}

Positioning:
- x and y are percentages (0-100) from top-left
- x: 12-25% positions field to the right of typical left-aligned labels
- Signature fields: width 28%, height 5%
- Date fields: width 18%, height 4%`;

/** The "defaults on any failure" safety net. Always a 200 with usedDefaults: true. */
function defaultsResponse(totalPages: number) {
  return new Response(JSON.stringify({
    success: true,
    documentType: "unknown",
    suggestedFields: getDefaultFields(totalPages),
    confidence: "low",
    reasoning: "Using default signature placements",
    usedDefaults: true
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfUrl, totalPages } = await req.json() as AnalyzeRequest;

    if (!OPENAI_API_KEY) {
      // Surfaces as a 500 JSON { error, success: false } via the catch below —
      // a missing key is a deployment fault, not a reason to hand out defaults.
      throw new Error("OPENAI_API_KEY is not configured");
    }

    console.log("Analyzing document for signature fields...", { pdfUrl, totalPages, model: OPENAI_DOC_FIELDS_MODEL });

    // As before, the model is given only the PDF's URL as text — no file bytes.
    // It places fields from the described layout of a standard hiring document.
    const userPrompt = `Place signature fields for this hiring document. Document has ${totalPages} page(s). URL: ${pdfUrl}

This document needs 4 fields on page ${totalPages}:
1. Candidate Signature - on the line next to "Signature" in candidate/receiving party section
2. Candidate Date - on the underline after "Date:" in candidate section
3. Employer Signature - on the line next to "Signature" in employer/disclosing party section
4. Employer Date - on the underline after "Date:" in employer section

Position each field on the actual blank line/space provided, not overlapping the labels.`;

    let analysis: any;
    try {
      const { data } = await callOpenAIJson<any>({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_DOC_FIELDS_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        maxCompletionTokens: 2500,
        validator: (value) => requireJsonKeys(value, ["suggestedFields"]),
      });
      analysis = data;
    } catch (error) {
      // Any AI failure — HTTP, network, unparseable JSON, missing keys — falls
      // back to default placements so the wizard never dead-ends. Loudly.
      console.error(
        "[ai-analyze-document-fields] FALLBACK: OpenAI call failed; returning default signature placements.",
        {
          model: OPENAI_DOC_FIELDS_MODEL,
          pdfUrl,
          totalPages,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return defaultsResponse(totalPages);
    }

    // Convert AI suggestions to our field format
    const fields: SignatureField[] = (analysis.suggestedFields || []).map((field: any, index: number) => ({
      id: `field_${Date.now()}_${index}`,
      label: field.label || `Signature ${index + 1}`,
      required: true,
      type: field.type || (index === 0 ? "candidate" : "employer"),
      x: Math.max(0, Math.min(field.x || 10, 85)),
      y: Math.max(0, Math.min(field.y || 85, 95)),
      page: field.page || totalPages,
      width: field.width || 25,
      height: field.height || 5,
    }));

    // Ensure we have at least candidate and employer signatures
    if (!fields.some(f => f.type === "candidate")) {
      fields.unshift({
        id: `field_${Date.now()}_candidate`,
        label: "Candidate Signature",
        required: true,
        type: "candidate",
        x: 10,
        y: 82,
        page: totalPages,
        width: 25,
        height: 5,
      });
    }

    if (!fields.some(f => f.type === "employer")) {
      fields.push({
        id: `field_${Date.now()}_employer`,
        label: "Employer Signature",
        required: true,
        type: "employer",
        x: 55,
        y: 82,
        page: totalPages,
        width: 25,
        height: 5,
      });
    }

    console.log("Analysis complete:", { documentType: analysis.documentType, fieldCount: fields.length });

    return new Response(JSON.stringify({
      success: true,
      documentType: analysis.documentType || "unknown",
      suggestedFields: fields,
      confidence: analysis.confidence || "medium",
      reasoning: analysis.reasoning || "AI-suggested signature placements",
      usedDefaults: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error analyzing document:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      error: errorMessage,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getDefaultFields(totalPages: number): SignatureField[] {
  const timestamp = Date.now();
  return [
    {
      id: `field_${timestamp}_0`,
      label: "Candidate Signature",
      required: true,
      type: "candidate",
      x: 22,
      y: 18,
      page: totalPages,
      width: 28,
      height: 5,
    },
    {
      id: `field_${timestamp}_1`,
      label: "Candidate Date",
      required: true,
      type: "candidate",
      x: 12,
      y: 30,
      page: totalPages,
      width: 18,
      height: 4,
    },
    {
      id: `field_${timestamp}_2`,
      label: "Employer Signature",
      required: true,
      type: "employer",
      x: 22,
      y: 48,
      page: totalPages,
      width: 28,
      height: 5,
    },
    {
      id: `field_${timestamp}_3`,
      label: "Employer Date",
      required: true,
      type: "employer",
      x: 12,
      y: 72,
      page: totalPages,
      width: 18,
      height: 4,
    },
  ];
}
