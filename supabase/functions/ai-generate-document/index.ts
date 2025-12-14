import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DocumentRequest {
  documentType: string;
  recipientName: string;
  companyName: string;
  jobTitle: string;
  salary?: string;
  startDate?: string;
  additionalTerms?: string;
}

const DOCUMENT_PROMPTS: Record<string, string> = {
  offer_letter: `Generate a professional job offer letter with the following structure:
- Company letterhead section
- Date and recipient address
- Subject line
- Opening paragraph welcoming the candidate
- Position details (title, department, reporting structure)
- Compensation package (base salary, bonuses if applicable)
- Benefits overview
- Start date and onboarding information
- Contingencies (background check, references)
- Acceptance deadline
- Closing with signature blocks for both parties`,

  nda: `Generate a comprehensive Non-Disclosure Agreement with:
- Party identification (Company and Individual)
- Definition of Confidential Information (broad but specific)
- Obligations of the receiving party
- Exclusions from confidential information
- Term of the agreement (2-3 years typical)
- Return of materials clause
- Remedies for breach
- Governing law placeholder
- Signature blocks with date lines`,

  employment_contract: `Generate a formal Employment Contract including:
- Party identification
- Position and duties
- Compensation and benefits
- Work schedule and location
- At-will employment clause (or fixed term if specified)
- Confidentiality obligations
- Intellectual property assignment
- Non-compete and non-solicitation clauses
- Termination provisions
- Dispute resolution
- Entire agreement clause
- Signature blocks`,

  background_check: `Generate a Background Check Authorization form with:
- Authorization statement
- Scope of investigation (criminal, credit, employment, education)
- Release of liability
- FCRA disclosure
- Consumer rights summary
- Signature and date fields
- Witness signature if required`,

  non_compete: `Generate a Non-Compete Agreement including:
- Recitals explaining the business need
- Definition of competing business
- Geographic scope
- Time period (reasonable duration)
- Consideration provided
- Exceptions and carve-outs
- Severability clause
- Injunctive relief clause
- Signature blocks`,

  ip_assignment: `Generate an Intellectual Property Assignment Agreement with:
- Definition of intellectual property
- Assignment of rights (past, present, future works)
- Moral rights waiver
- Cooperation with filings
- Work for hire acknowledgment
- Representations and warranties
- Compensation acknowledgment
- Signature blocks`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: DocumentRequest = await req.json();
    const { documentType, recipientName, companyName, jobTitle, salary, startDate, additionalTerms } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const documentPrompt = DOCUMENT_PROMPTS[documentType] || DOCUMENT_PROMPTS.nda;
    
    const systemPrompt = `You are a professional legal document generator. Generate formal, legally-sound documents that are ready for signature. 
Use proper legal language but keep it readable. Include all necessary clauses and provisions.
Format the document with clear sections, proper spacing, and professional structure.
Include signature blocks with lines for signatures and dates.
Do not include any markdown formatting - output plain text with proper line breaks and spacing.`;

    const userPrompt = `${documentPrompt}

Document Details:
- Recipient Name: ${recipientName || "[RECIPIENT NAME]"}
- Company Name: ${companyName || "[COMPANY NAME]"}
- Position/Job Title: ${jobTitle || "[JOB TITLE]"}
${salary ? `- Salary: ${salary}` : ""}
${startDate ? `- Start Date: ${startDate}` : ""}
${additionalTerms ? `\nAdditional Terms/Notes to incorporate:\n${additionalTerms}` : ""}

Generate the complete document now. Use placeholder brackets [LIKE THIS] for any information not provided.`;

    console.log("Generating document:", documentType);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    console.log("Document generated successfully");

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating document:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
