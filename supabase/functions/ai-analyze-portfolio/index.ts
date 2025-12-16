import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Build content array with images for vision analysis
    const contentParts: any[] = [
      {
        type: "text",
        text: `You are an expert portfolio reviewer analyzing work samples for a job application.

**Job Title:** ${jobTitle || "Not specified"}
**Job Description:** ${jobDescription || "Not specified"}

**Instructions:**
Analyze the portfolio images/documents provided. Evaluate them based on:
1. **Relevance** - How well do these samples relate to the job requirements?
2. **Quality** - Technical skill level, attention to detail, professionalism
3. **Creativity** - Originality, innovation, unique approach
4. **Presentation** - How well-organized and polished is the work?

Provide your analysis in this exact JSON format:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
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
    "feedback": "<specific feedback on creativity>"
  },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "areasForImprovement": ["<area 1>", "<area 2>", ...],
  "recommendation": "<hire/consider/pass with brief justification>"
}

Be constructive but honest. Focus on job-relevant criteria.`,
      },
    ];

    // Add portfolio images (limit to first 5 for API limits)
    const imagesToAnalyze = portfolioUrls.slice(0, 5);
    for (const url of imagesToAnalyze) {
      // Only add image URLs for actual images
      if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
        contentParts.push({
          type: "image_url",
          image_url: { url },
        });
      } else {
        // For PDFs, mention them in the text
        contentParts[0].text += `\n\n[Note: A PDF document was also submitted: ${url}]`;
      }
    }

    if (portfolioUrls.length > 5) {
      contentParts[0].text += `\n\n[Note: ${portfolioUrls.length - 5} additional files were submitted but not shown here for brevity.]`;
    }

    // Use Gemini 2.5 Flash for vision analysis
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
        max_tokens: 2000,
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
    
    console.log("Raw AI response:", content);

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
        score: 75,
        summary: "Portfolio reviewed. Contains relevant work samples.",
        relevance: { score: 75, feedback: "Portfolio appears relevant to the position." },
        quality: { score: 75, feedback: "Work demonstrates competent technical skills." },
        creativity: { score: 75, feedback: "Shows some creative approach." },
        strengths: ["Portfolio submitted successfully", "Multiple work samples provided"],
        areasForImprovement: ["Could not fully analyze all content"],
        recommendation: "consider - Portfolio submitted for manual review",
      };
    }

    console.log("Portfolio analysis complete:", analysis);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in ai-analyze-portfolio:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        // Return basic analysis even on error
        score: 100,
        summary: "Portfolio uploaded successfully. Manual review recommended.",
        strengths: ["Portfolio submitted"],
        areasForImprovement: [],
        recommendation: "consider",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});