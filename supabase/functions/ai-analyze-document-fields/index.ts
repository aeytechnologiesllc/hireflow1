import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfUrl, totalPages } = await req.json() as AnalyzeRequest;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing document for signature fields...", { pdfUrl, totalPages });

    // Use AI to analyze the document concept and suggest field placements
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a document analysis assistant for hiring/employment documents. You must return EXACTLY 4 signature/date fields positioned correctly.

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
- Date fields: width 18%, height 4%`
          },
          {
            role: "user",
            content: `Place signature fields for this hiring document. Document has ${totalPages} page(s). URL: ${pdfUrl}

This document needs 4 fields on page ${totalPages}:
1. Candidate Signature - on the line next to "Signature" in candidate/receiving party section
2. Candidate Date - on the underline after "Date:" in candidate section  
3. Employer Signature - on the line next to "Signature" in employer/disclosing party section
4. Employer Date - on the underline after "Date:" in employer section

Position each field on the actual blank line/space provided, not overlapping the labels.`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      // Return default placements if AI fails
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.log("No AI response, using defaults");
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

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
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
