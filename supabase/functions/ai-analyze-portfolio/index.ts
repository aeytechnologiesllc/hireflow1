import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Increased file limit from 5 to 10
const MAX_FILES_TO_ANALYZE = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { portfolioUrls, jobTitle, jobDescription } = await req.json();

    if (!portfolioUrls || portfolioUrls.length === 0) {
      throw new Error("No portfolio URLs provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing ${portfolioUrls.length} portfolio items for job: ${jobTitle}`);

    // Build content array with images and PDFs for analysis
    const contentParts: any[] = [
      {
        type: "text",
        text: `You are AIVA, an expert portfolio reviewer with a CRITICAL and DISCERNING eye. You analyze work samples for job applications with HIGH STANDARDS.

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

BE CRITICAL AND HONEST. A score of 85+ should be exceptional. Average portfolios score 55-70.`,
      },
    ];

    // Process portfolio items (increased limit to 10)
    const itemsToAnalyze = portfolioUrls.slice(0, MAX_FILES_TO_ANALYZE);
    let pdfCount = 0;
    let imageCount = 0;
    let skippedCount = 0;
    const pdfDetails: string[] = [];

    for (let i = 0; i < itemsToAnalyze.length; i++) {
      const url = itemsToAnalyze[i];
      try {
        if (url.match(/\.pdf$/i)) {
          // Handle PDF - fetch and convert to base64 for Gemini's native PDF support
          console.log(`Fetching PDF ${pdfCount + 1} for analysis: ${url}`);
          const pdfResponse = await fetch(url);
          
          if (!pdfResponse.ok) {
            console.error(`Failed to fetch PDF: ${url}, status: ${pdfResponse.status}`);
            contentParts[0].text += `\n\n[Note: Could not fetch PDF document #${i + 1}: ${url}]`;
            skippedCount++;
            continue;
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();
          const pdfBase64 = base64Encode(pdfBuffer);
          const fileSizeKB = Math.round(pdfBuffer.byteLength / 1024);
          
          // Gemini supports inline PDF data with proper MIME type
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:application/pdf;base64,${pdfBase64}`
            }
          });
          
          pdfCount++;
          pdfDetails.push(`PDF #${pdfCount} (${fileSizeKB}KB)`);
          console.log(`Added PDF ${pdfCount} to analysis (${fileSizeKB}KB)`);
          
        } else if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
          // Handle images - direct URL for vision analysis
          contentParts.push({
            type: "image_url",
            image_url: { url },
          });
          imageCount++;
          console.log(`Added image ${imageCount} to analysis: ${url}`);
          
        } else {
          // Unknown file type - note it
          console.log(`Unknown file type, skipping: ${url}`);
          contentParts[0].text += `\n\n[Note: Unsupported file type submitted (file #${i + 1}): ${url}]`;
          skippedCount++;
        }
      } catch (fetchError) {
        console.error(`Error processing portfolio item ${url}:`, fetchError);
        contentParts[0].text += `\n\n[Note: Could not process file #${i + 1}: ${url}]`;
        skippedCount++;
      }
    }

    // Add explicit file count notification
    contentParts[0].text += `\n\n## FILES SUBMITTED FOR YOUR REVIEW:
- Total files submitted: ${portfolioUrls.length}
- Files being analyzed: ${itemsToAnalyze.length} (limit: ${MAX_FILES_TO_ANALYZE})
- Images: ${imageCount}
- PDF documents: ${pdfCount}${pdfDetails.length > 0 ? ` (${pdfDetails.join(', ')})` : ''}
- Skipped/failed: ${skippedCount}`;

    if (portfolioUrls.length > MAX_FILES_TO_ANALYZE) {
      contentParts[0].text += `\n- NOTE: ${portfolioUrls.length - MAX_FILES_TO_ANALYZE} additional files were submitted but not analyzed due to the ${MAX_FILES_TO_ANALYZE}-file limit.`;
    }

    contentParts[0].text += `\n\nIMPORTANT: For each PDF, report the number of pages you reviewed and describe key content. Your filesAnalyzed.pdfPageDetails array must have an entry for each PDF.`;

    console.log(`Portfolio analysis includes: ${imageCount} images, ${pdfCount} PDFs, ${skippedCount} skipped`);

    // Use Gemini 2.5 Flash for vision + PDF analysis
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
            role: "user",
            content: contentParts,
          },
        ],
        max_tokens: 3000, // Increased for detailed multi-page reporting
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "API credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("Raw AI response:", content.substring(0, 500) + "...");

    // Parse JSON from response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Return a default analysis if parsing fails
      analysis = {
        score: 60,
        summary: "Portfolio reviewed. Manual verification recommended due to parsing issues.",
        filesAnalyzed: {
          total: imageCount + pdfCount,
          images: imageCount,
          pdfs: pdfCount,
          pdfPageDetails: [],
          skippedFiles: skippedCount
        },
        authenticity: {
          assessment: "UNKNOWN",
          confidence: "LOW",
          concerns: ["Could not fully analyze content"]
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

    // Ensure filesAnalyzed is populated even if AI didn't include it
    if (!analysis.filesAnalyzed) {
      analysis.filesAnalyzed = {
        total: imageCount + pdfCount,
        images: imageCount,
        pdfs: pdfCount,
        pdfPageDetails: [],
        skippedFiles: skippedCount
      };
    }

    console.log("Portfolio analysis complete:", {
      score: analysis.score,
      authenticity: analysis.authenticity?.assessment,
      recommendation: analysis.recommendation,
      imagesAnalyzed: imageCount,
      pdfsAnalyzed: pdfCount,
      skippedFiles: skippedCount
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in ai-analyze-portfolio:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        // Return basic analysis even on error - but with low score requiring manual review
        score: 50,
        summary: "Portfolio upload encountered issues. Manual review strongly recommended.",
        filesAnalyzed: { total: 0, images: 0, pdfs: 0, pdfPageDetails: [], skippedFiles: 0 },
        authenticity: { assessment: "UNKNOWN", confidence: "LOW", concerns: ["Processing error occurred"] },
        penaltiesApplied: ["-10: Processing error"],
        bonusesApplied: [],
        strengths: ["Portfolio submitted"],
        areasForImprovement: ["Resubmission may be needed"],
        recommendation: "CONSIDER - Manual review required",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
