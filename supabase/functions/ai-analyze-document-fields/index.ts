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
            content: `You are a document analysis assistant for hiring/employment documents. Analyze the document structure and suggest EXACTLY 4 signature/date field placements.

CRITICAL: You must return exactly 4 fields in this order:
1. Candidate Signature - where the candidate/receiving party signs
2. Candidate Date - where the candidate enters the signing date
3. Employer Signature - where the employer/disclosing party signs  
4. Employer Date - where the employer enters the signing date

For NDAs and contracts, look for these patterns:
- "Receiving Party" or "Candidate" section usually appears FIRST (upper portion, y: 25-45%)
- "Disclosing Party" or "Employer" section usually appears SECOND (lower portion, y: 55-80%)
- Signature fields should be positioned TO THE RIGHT of "Signature" or "Signature:" labels (x: 35-60%)
- Date fields should be positioned TO THE RIGHT of "Date" or "Date:" labels (x: 25-45%)

Return a JSON object:
{
  "documentType": "nda" | "contract" | "offer_letter" | "agreement" | "unknown",
  "suggestedFields": [
    {
      "type": "candidate",
      "label": "Candidate Signature",
      "page": 1,
      "x": 35,
      "y": 32,
      "width": 30,
      "height": 5
    },
    {
      "type": "candidate", 
      "label": "Candidate Date",
      "page": 1,
      "x": 25,
      "y": 40,
      "width": 20,
      "height": 4
    },
    {
      "type": "employer",
      "label": "Employer Signature", 
      "page": 1,
      "x": 35,
      "y": 58,
      "width": 30,
      "height": 5
    },
    {
      "type": "employer",
      "label": "Employer Date",
      "page": 1,
      "x": 25,
      "y": 66,
      "width": 20,
      "height": 4
    }
  ],
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of field placement logic"
}

Positioning rules:
- x and y are percentages (0-100) from top-left of page
- Candidate fields should be in the UPPER signature block (y: 25-45%)
- Employer fields should be in the LOWER signature block (y: 55-80%)
- Signature fields: width 30%, height 5%
- Date fields: width 20%, height 4%
- Position fields to align with where labels typically appear in standard documents`
          },
          {
            role: "user",
            content: `Analyze this hiring document and place signature fields. Document has ${totalPages} page(s). URL: ${pdfUrl}

This is a hiring-related document (likely NDA, offer letter, or employment contract) that needs:
- Candidate/Receiving Party signature and date
- Employer/Disclosing Party signature and date

Place all 4 fields on page ${totalPages} where they would naturally align with signature blocks in a standard document layout.`
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
      x: 35,
      y: 32,
      page: totalPages,
      width: 30,
      height: 5,
    },
    {
      id: `field_${timestamp}_1`,
      label: "Candidate Date",
      required: true,
      type: "candidate",
      x: 25,
      y: 40,
      page: totalPages,
      width: 20,
      height: 4,
    },
    {
      id: `field_${timestamp}_2`,
      label: "Employer Signature",
      required: true,
      type: "employer",
      x: 35,
      y: 58,
      page: totalPages,
      width: 30,
      height: 5,
    },
    {
      id: `field_${timestamp}_3`,
      label: "Employer Date",
      required: true,
      type: "employer",
      x: 25,
      y: 66,
      page: totalPages,
      width: 20,
      height: 4,
    },
  ];
}
