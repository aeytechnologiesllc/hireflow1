import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatInterviewRequest {
  mode: "start" | "respond" | "evaluate";
  jobTitle: string;
  jobDescription: string;
  candidateName?: string;
  messages?: ChatMessage[];
  userMessage?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ChatInterviewRequest = await req.json();
    const { mode, jobTitle, jobDescription, candidateName, messages = [], userMessage } = request;

    console.log("Chat interview request:", { mode, jobTitle, candidateName, messageCount: messages.length });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are AVA, an expert AI interviewer conducting a professional job interview. You should be warm, professional, and thorough.

Job Position: ${jobTitle}
Job Description: ${jobDescription}
Candidate Name: ${candidateName || "Candidate"}

Interview Guidelines:
- Conduct a professional 5-8 question interview
- Start with a warm greeting and icebreaker question
- Ask 2-3 technical/skills questions relevant to the job
- Ask 1-2 behavioral questions (STAR format scenarios)
- Ask 1 culture fit question
- End by asking if the candidate has any questions

Communication Style:
- Be warm but professional
- Acknowledge answers before moving to the next question
- Ask relevant follow-up questions when appropriate
- Keep responses concise but thoughtful
- Use the candidate's name occasionally

${mode === 'evaluate' ? `
EVALUATION MODE: Review all the candidate's responses and provide a comprehensive evaluation. Return JSON with:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "Strong Hire" | "Hire" | "Maybe" | "No Hire",
  "summary": "Brief evaluation summary"
}
` : ''}`;

    let userContent = "";
    
    if (mode === "start") {
      userContent = "Start the interview with a warm greeting and your first question.";
    } else if (mode === "respond") {
      userContent = userMessage || "";
    } else if (mode === "evaluate") {
      userContent = `Please evaluate all the candidate's responses from this interview and provide a comprehensive assessment. The interview conversation is in the message history.`;
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: apiMessages,
        stream: mode !== "evaluate",
        ...(mode === "evaluate" && { response_format: { type: "json_object" } })
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // For evaluation mode, return JSON directly
    if (mode === "evaluate") {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      console.log("Evaluation response:", content);
      
      try {
        const evaluation = JSON.parse(content);
        return new Response(
          JSON.stringify(evaluation),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch {
        return new Response(
          JSON.stringify({ 
            score: 70, 
            strengths: ["Completed interview"], 
            concerns: ["Unable to parse detailed evaluation"],
            recommendation: "Maybe",
            summary: content 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For start/respond modes, stream the response
    console.log("Streaming interview response");
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-chat-interview:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
