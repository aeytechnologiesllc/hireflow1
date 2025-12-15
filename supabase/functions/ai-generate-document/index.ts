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
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
}

const DOCUMENT_PROMPTS: Record<string, string> = {
  offer_letter: `Generate a professional job offer letter with the following structure:
- Company header (use company name provided)
- Current date
- Recipient greeting
- Opening paragraph welcoming the candidate to join
- Position details including title and department
- Compensation package with the salary provided
- Brief benefits mention (use general terms like "comprehensive benefits package" if specifics not provided)
- Start date information (if provided)
- Acceptance instructions
- Warm closing
- Signature section with simple lines for:
  Employee Signature: _______________  Date: _______________
  Company Representative: _______________  Date: _______________`,

  nda: `Generate a Non-Disclosure Agreement with:
- Party identification using the provided names
- Clear definition of Confidential Information
- Obligations of the receiving party
- Standard exclusions
- 2-year term
- Return of materials clause
- Governing law (state to be determined by company)
- Signature section with simple lines for both parties`,

  employment_contract: `Generate an Employment Contract including:
- Party identification
- Position and general duties
- Compensation as provided
- At-will employment statement
- Confidentiality obligations
- Standard intellectual property provisions
- Termination provisions
- Signature section with simple lines for both parties`,

  background_check: `Generate a Background Check Authorization form with:
- Clear authorization statement
- Scope of investigation (criminal, employment verification, education)
- Release of liability
- Consumer rights acknowledgment
- Signature section with lines for candidate signature and date`,

  non_compete: `Generate a Non-Compete Agreement including:
- Recitals explaining the business relationship
- Definition of competing activities relevant to the role
- Reasonable geographic and time restrictions
- Consideration acknowledgment
- Severability clause
- Signature section with simple lines for both parties`,

  ip_assignment: `Generate an Intellectual Property Assignment Agreement with:
- Definition of work product
- Assignment of all rights to the company
- Work for hire acknowledgment
- Cooperation with filings
- Compensation acknowledgment
- Signature section with simple lines for both parties`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: DocumentRequest = await req.json();
    const { 
      documentType, 
      recipientName, 
      companyName, 
      jobTitle, 
      salary, 
      startDate, 
      additionalTerms,
      hiringManagerName,
      hiringManagerTitle,
      companyAddress,
      companyEmail,
      companyPhone
    } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const documentPrompt = DOCUMENT_PROMPTS[documentType] || DOCUMENT_PROMPTS.nda;
    
    const systemPrompt = `You are a professional legal document generator. Your task is to create formal, legally-sound documents that are COMPLETE and READY FOR IMMEDIATE SIGNATURE.

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. NEVER use placeholder brackets like [HIRING MANAGER NAME], [ADDRESS], [FILL IN], etc.
2. NEVER include fields that require the user to fill in information later
3. If specific information is not provided, simply OMIT that section or use general language
4. Use ONLY the information provided to you - make the document work with what you have
5. The document must be ready to send immediately without any edits required
6. For signature sections: Use clean, simple format with just underscores for signature lines
7. If no address is provided, do not include an address section
8. If no specific benefits are listed, say "comprehensive benefits package"
9. Write in formal legal language but keep it readable
10. Format with clear sections, proper spacing, and professional structure
11. Do NOT use markdown formatting - output clean plain text with line breaks`;

    // Build a detailed context based on what information was actually provided
    let providedDetails = [];
    if (recipientName) providedDetails.push(`Recipient/Employee Name: ${recipientName}`);
    if (companyName) providedDetails.push(`Company Name: ${companyName}`);
    if (jobTitle) providedDetails.push(`Position/Job Title: ${jobTitle}`);
    if (salary) providedDetails.push(`Salary/Compensation: ${salary}`);
    if (startDate) providedDetails.push(`Start Date: ${startDate}`);
    if (hiringManagerName) providedDetails.push(`Hiring Manager/Authorized Representative: ${hiringManagerName}`);
    if (hiringManagerTitle) providedDetails.push(`Hiring Manager Title: ${hiringManagerTitle}`);
    if (companyAddress) providedDetails.push(`Company Address: ${companyAddress}`);
    if (companyEmail) providedDetails.push(`Company Email: ${companyEmail}`);
    if (companyPhone) providedDetails.push(`Company Phone: ${companyPhone}`);

    const userPrompt = `${documentPrompt}

AVAILABLE INFORMATION (use only what's provided, omit sections for missing info):
${providedDetails.length > 0 ? providedDetails.join('\n') : 'Minimal information provided - create a general template'}

${additionalTerms ? `ADDITIONAL TERMS TO INCORPORATE:\n${additionalTerms}` : ''}

IMPORTANT REMINDERS:
- Do NOT add placeholder text like "[Insert X here]" - if info is missing, skip that part
- The document should be 100% complete and ready for signature as-is
- Use today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Signature lines should be simple underscores, not placeholders

Generate the complete, ready-to-sign document now:`;

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
