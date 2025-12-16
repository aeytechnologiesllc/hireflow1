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
            content: `You are a document analysis assistant. When given a PDF URL, analyze what type of document it likely is based on context and suggest optimal signature field placements.

For most business documents (contracts, agreements, NDAs, offer letters), signatures typically go at the bottom of the last page.

Return a JSON object with this structure:
{
  "documentType": "contract" | "agreement" | "letter" | "form" | "unknown",
  "suggestedFields": [
    {
      "type": "candidate" | "employer",
      "label": "Candidate Signature" | "Employer Signature" | "Date",
      "page": 1,
      "x": 10,
      "y": 85,
      "width": 25,
      "height": 5
    }
  ],
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation"
}

Field positioning rules:
- x and y are percentages (0-100) from top-left
- Signatures should be near the bottom (y: 80-90%)
- Candidate signature on the left (x: 10-15%), employer on the right (x: 55-60%)
- Date fields are smaller (width: 15%, height: 4%)
- Always include: candidate signature, employer signature, and a date field
- Place all fields on the last page`
          },
          {
            role: "user",
            content: `Analyze this document and suggest signature field placements. The document has ${totalPages} page(s). Document URL: ${pdfUrl}

Since this is a hiring-related document being sent through a recruitment platform, assume it's likely a contract, offer letter, NDA, or similar employment document that needs both candidate and employer signatures.

Provide optimal field placements for the last page (page ${totalPages}).`
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
      x: 10,
      y: 82,
      page: totalPages,
      width: 25,
      height: 5,
    },
    {
      id: `field_${timestamp}_1`,
      label: "Employer Signature",
      required: true,
      type: "employer",
      x: 55,
      y: 82,
      page: totalPages,
      width: 25,
      height: 5,
    },
    {
      id: `field_${timestamp}_2`,
      label: "Date",
      required: true,
      type: "candidate",
      x: 10,
      y: 90,
      page: totalPages,
      width: 15,
      height: 4,
    },
  ];
}
