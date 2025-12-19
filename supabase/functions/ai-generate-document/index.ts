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

// Legal disclaimers by document type
const LEGAL_DISCLAIMERS: Record<string, string> = {
  offer_letter: `

LEGAL NOTICE

This offer of employment is contingent upon successful completion of any required background checks and verification of your eligibility to work in the United States as required by law.

This employment relationship is at-will, meaning either party may terminate the relationship at any time, with or without cause or notice.

Compensation is subject to applicable federal, state, and local taxes, and will be paid in accordance with the company's standard payroll practices.

Benefits described in this offer are subject to the terms and conditions of the applicable benefit plan documents, including eligibility requirements and waiting periods.

By signing this offer letter, you acknowledge that you have read, understood, and agree to the terms and conditions outlined herein.`,

  employment_contract: `

LEGAL PROVISIONS

Employment At-Will: Unless otherwise specified in this Agreement, employment is at-will and may be terminated by either party at any time, with or without cause.

Governing Law: This Agreement shall be governed by and construed in accordance with the laws of the state in which the Company's principal office is located.

Severability: If any provision of this Agreement is found to be unenforceable, the remaining provisions shall continue in full force and effect.

Entire Agreement: This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements relating to this subject matter.

Tax Obligations: Employee acknowledges that all compensation is subject to applicable tax withholdings and deductions as required by law.`,

  nda: `

LEGAL PROVISIONS

Governing Law: This Agreement shall be governed by the laws of the state in which the Disclosing Party's principal place of business is located.

Injunctive Relief: The parties acknowledge that breach of this Agreement may cause irreparable harm for which monetary damages may be inadequate, and agree that the injured party may seek injunctive relief in addition to other remedies.

Severability: If any provision is held invalid, the remainder of this Agreement shall continue in effect.

No License: This Agreement does not grant any license or rights in any intellectual property.`,

  non_compete: `

LEGAL PROVISIONS

Reasonableness: The parties acknowledge that the geographic scope, duration, and scope of restricted activities in this Agreement are reasonable and necessary to protect the Company's legitimate business interests.

Consideration: Employee acknowledges receiving adequate consideration for the covenants contained herein.

Modification: If any restriction is found to be unreasonable, the parties agree that a court may modify such restriction to make it enforceable.

Governing Law: This Agreement shall be governed by the laws of the state where the Company's principal office is located.`,

  background_check: `

LEGAL NOTICE

Authorization: By signing below, you authorize the Company and its designated agents to conduct background checks as permitted by law.

Consumer Rights: You have rights under the Fair Credit Reporting Act, including the right to receive a copy of any consumer report and to dispute inaccurate information.

Adverse Action: If information obtained leads to adverse employment action, you will be provided with the required notifications and opportunity to respond.`,

  ip_assignment: `

LEGAL PROVISIONS

Work for Hire: All Work Product created within the scope of employment shall be considered "work made for hire" as defined by copyright law.

Further Assurances: Employee agrees to execute any additional documents and take any actions reasonably necessary to perfect the Company's rights in the Work Product.

No Conflicting Obligations: Employee represents that this Agreement does not conflict with any prior agreements or obligations.

Governing Law: This Agreement shall be governed by the laws of the state where the Company is incorporated.`,
};

const DOCUMENT_PROMPTS: Record<string, string> = {
  offer_letter: `Generate a professional job offer letter with the following structure:
- Professional company letterhead/header section
- Current date (formatted as "Month Day, Year", e.g., "December 19, 2025")
- Recipient greeting using their full name
- Opening paragraph welcoming the candidate to join
- Position details including title and department
- Compensation package with the salary provided (formatted with commas, e.g., "$120,000")
- Brief benefits mention (use general terms like "comprehensive benefits package" if specifics not provided)
- Start date information (if provided, formatted as "Month Day, Year")
- Clear next steps for acceptance
- Warm, professional closing
- Company representative signature block (name and title only, NO signature lines)`,

  nda: `Generate a Non-Disclosure Agreement with:
- Professional header with "NON-DISCLOSURE AGREEMENT" title
- Party identification using the provided names (both in Title Case)
- Clear definition of Confidential Information
- Obligations of the receiving party
- Standard exclusions from confidential information
- 2-year term from the effective date
- Return of materials clause
- Governing law provision
- Signature block for both parties (names only, NO signature lines)`,

  employment_contract: `Generate an Employment Contract including:
- Professional header with "EMPLOYMENT AGREEMENT" title
- Party identification (all names in Title Case)
- Position title and general duties description
- Compensation as provided (formatted with commas)
- At-will employment statement
- Confidentiality obligations
- Standard intellectual property provisions
- Termination provisions and notice requirements
- Signature block for both parties (names only, NO signature lines)`,

  background_check: `Generate a Background Check Authorization form with:
- Professional header with "BACKGROUND CHECK AUTHORIZATION" title
- Clear authorization statement
- Scope of investigation (criminal records, employment verification, education verification)
- Release of liability clause
- Consumer rights acknowledgment under FCRA
- Candidate information section
- Signature block for candidate (name only, NO signature lines)`,

  non_compete: `Generate a Non-Compete Agreement including:
- Professional header with "NON-COMPETE AGREEMENT" title
- Recitals explaining the business relationship
- Definition of competing activities relevant to the role
- Reasonable geographic restrictions (state-level or reasonable radius)
- Time restrictions (12-24 months, reasonable for jurisdiction)
- Consideration acknowledgment
- Severability clause
- Signature block for both parties (names only, NO signature lines)`,

  ip_assignment: `Generate an Intellectual Property Assignment Agreement with:
- Professional header with "INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT" title
- Definition of work product and covered intellectual property
- Assignment of all rights to the company
- Work for hire acknowledgment
- Cooperation with patent/trademark filings
- Compensation acknowledgment
- Signature block for both parties (names only, NO signature lines)`,
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
    const legalDisclaimer = LEGAL_DISCLAIMERS[documentType] || "";
    
    const systemPrompt = `You are a professional legal document generator. Your task is to create formal, legally-sound documents that are COMPLETE and READY FOR IMMEDIATE DIGITAL SIGNATURE.

PROFESSIONAL DOCUMENT STANDARDS - YOU MUST FOLLOW THESE:

1. FORMATTING REQUIREMENTS:
   - All person names MUST be in Title Case (e.g., "John Smith", NOT "john smith" or "JOHN SMITH")
   - All company names MUST be in Title Case (e.g., "Acme Corporation", NOT "acme corporation")
   - All job titles MUST be in Title Case (e.g., "Senior Software Engineer", NOT "SENIOR SOFTWARE ENGINEER")
   - Dates MUST be formatted as "Month Day, Year" (e.g., "December 19, 2025")
   - Phone numbers MUST be formatted as (555) 123-4567
   - Salary/compensation MUST include dollar sign and commas (e.g., "$120,000")

2. CRITICAL PROHIBITIONS:
   - NEVER use placeholder brackets like [HIRING MANAGER NAME], [ADDRESS], [FILL IN]
   - NEVER include fields that require the user to fill in information later
   - NEVER include manual signature lines using underscores (____) or dashes (----)
   - NEVER use placeholder text like "Insert here", "TBD", "N/A", "Fill in"
   - NEVER expose system values like TRUE, FALSE, NULL, or database IDs
   - NEVER use all-caps for names or titles (except acronyms)

3. SIGNATURE HANDLING:
   - DO NOT include any signature lines in the document text
   - Only include signature BLOCKS with the signer's printed name and title
   - Digital signatures will be added separately through the signing system
   - Format signature blocks as:
     
     [Printed Name]
     [Title]
     [Company Name]

4. DOCUMENT STRUCTURE:
   - Include a professional letterhead/header section with company name
   - Use clear section headings and proper paragraph spacing
   - Maintain consistent formatting throughout
   - End with a professional closing before signature blocks

5. CONTENT RULES:
   - If specific information is not provided, simply OMIT that section
   - Use ONLY the information provided - make the document work with what you have
   - The document must be ready to send immediately without any edits
   - If no address is provided, do not include an address section
   - If no specific benefits are listed, say "comprehensive benefits package"
   - Write in formal legal language but keep it readable

6. OUTPUT FORMAT:
   - Do NOT use markdown formatting
   - Output clean plain text with proper line breaks
   - Use consistent indentation and spacing`;

    // Build a detailed context based on what information was actually provided
    const providedDetails: string[] = [];
    if (recipientName) providedDetails.push(`Recipient/Employee Name: ${recipientName}`);
    if (companyName) providedDetails.push(`Company Name: ${companyName}`);
    if (jobTitle) providedDetails.push(`Position/Job Title: ${jobTitle}`);
    if (salary) providedDetails.push(`Salary/Compensation: $${salary}`);
    if (startDate) providedDetails.push(`Start Date: ${startDate}`);
    if (hiringManagerName) providedDetails.push(`Hiring Manager/Authorized Representative: ${hiringManagerName}`);
    if (hiringManagerTitle) providedDetails.push(`Hiring Manager Title: ${hiringManagerTitle}`);
    if (companyAddress) providedDetails.push(`Company Address: ${companyAddress}`);
    if (companyEmail) providedDetails.push(`Company Email: ${companyEmail}`);
    if (companyPhone) providedDetails.push(`Company Phone: ${companyPhone}`);

    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const userPrompt = `${documentPrompt}

AVAILABLE INFORMATION (use only what's provided, omit sections for missing info):
${providedDetails.length > 0 ? providedDetails.join('\n') : 'Minimal information provided - create a general template'}

${additionalTerms ? `ADDITIONAL TERMS TO INCORPORATE:\n${additionalTerms}` : ''}

IMPORTANT REMINDERS:
- Use today's date: ${currentDate}
- Do NOT add placeholder text - if info is missing, skip that part
- Do NOT include manual signature lines (______) - signatures are digital
- The document should be 100% complete and ready for digital signature
- All names and titles should be in Title Case
- Include the following legal disclaimer section at the end of the document (before signature blocks):
${legalDisclaimer}

Generate the complete, professionally formatted document now:`;

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
    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    // Post-process to remove any manual signature lines that might have slipped through
    content = content.replace(/_{5,}/g, "");
    content = content.replace(/-{5,}/g, "");
    content = content.replace(/Signature:\s*_+/gi, "");
    content = content.replace(/Date:\s*_+/gi, "");

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
