import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAIJson, requireJsonKeys, type OpenAIMessage } from "../_shared/openai.ts";
import { streamOpenAIChatCompletion } from "../_shared/openaiStreaming.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_SALES_SIMULATION_MODEL = Deno.env.get("OPENAI_SALES_SIMULATION_MODEL") || "gpt-5.4-mini";
const OPENAI_SALES_SIMULATION_EVAL_MODEL = Deno.env.get("OPENAI_SALES_SIMULATION_EVAL_MODEL") || "gpt-5.4";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SalesSimulationRequest {
  mode: "start" | "respond" | "evaluate";
  scenario: string;
  prospectName: string;
  prospectCompany: string;
  productService: string;
  jobTitle?: string;
  candidateName?: string;
  messages?: ChatMessage[];
  salesRepMessage?: string;
  messageCount?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SalesSimulationRequest = await req.json();
    const { mode, scenario, prospectName, prospectCompany, productService, jobTitle, candidateName = "the sales representative", messages = [], salesRepMessage, messageCount = 0 } = request;

    console.log("Sales simulation request:", { mode, scenario, prospectName, candidateName, messageCount });

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are roleplaying as ${prospectName}, a decision-maker at ${prospectCompany} in a sales meeting simulation.

The sales representative you're meeting with is named ${candidateName}. 
IMPORTANT: Use their name "${candidateName}" only in your FIRST message as a greeting, then do NOT repeat their name. After the initial greeting, just respond naturally without using their name. NEVER use placeholder text like [Sales Rep's Name], [Name], or any brackets.

SCENARIO: ${scenario}
PRODUCT/SERVICE BEING SOLD: ${productService}

YOUR ROLE AS THE PROSPECT:
- You are a busy professional who has agreed to this meeting/call
- You have a real business problem that COULD be solved by what's being sold, but you're skeptical
- You're evaluating multiple options and don't want to waste time
- You have budget constraints and need to justify any purchase to leadership

YOUR PERSONALITY & OBJECTIONS:
- Start somewhat neutral but guarded - you've heard many sales pitches
- Ask tough but fair questions about pricing, ROI, implementation, and support
- Raise common objections: "We're happy with our current solution", "Budget is tight", "Need to talk to my team", "Can you send me some materials?"
- If the salesperson handles objections well, become more engaged
- If they're pushy or don't listen, become more resistant
- React realistically to good discovery questions - share more about your pain points

REALISTIC OBJECTIONS TO USE (pick appropriate ones):
- "What makes you different from [competitor]?"
- "That's more than we budgeted for this quarter"
- "We tried something similar before and it didn't work out"
- "I need to run this by my team/boss first"
- "Can you prove the ROI you're claiming?"
- "We don't have bandwidth for implementation right now"
- "Send me a proposal and I'll look it over"

BUYING SIGNALS (if salesperson does well):
- Ask more detailed questions about features
- Discuss internal processes and who else should be involved
- Ask about pricing/packaging options
- Mention specific timelines or upcoming projects
- Share more pain points without being asked

${mode === 'evaluate' ? `
EVALUATION MODE: Analyze the sales rep's performance and return JSON:
{
  "score": <number 0-100>,
  "discovery": <number 0-100 - how well they uncovered needs>,
  "objectionHandling": <number 0-100 - how well they addressed concerns>,
  "valueProposition": <number 0-100 - how well they articulated value>,
  "closingSkills": <number 0-100 - how well they advanced the deal>,
  "rapport": <number 0-100 - how well they built relationship>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["area1", "area2"],
  "wouldBuy": "yes" | "maybe" | "no",
  "overallFeedback": "Summary of sales performance"
}
` : `
RESPONSE GUIDELINES:
- Keep responses realistic - 1-4 sentences typically
- Sometimes be brief ("Interesting. Go on." or "Hmm, I'm not sure about that")
- Push back on vague claims - ask for specifics
- If they ask good discovery questions, open up about your challenges
- If they just pitch without asking, become disengaged
- After ${messageCount >= 8 ? "this much conversation, if they've earned it" : "more conversation"}, you might show buying interest or firmly decline
- CRITICAL: Do NOT repeat the sales rep's name in every response. Use their name ONLY in your very first greeting, then never again. Just respond naturally.
`}`;

    let userContent = "";
    
    if (mode === "start") {
      userContent = `The sales meeting is starting. Greet ${candidateName} briefly and set expectations for the call. You're busy but willing to listen. Remember to use their actual name naturally - never use brackets or placeholders.`;
    } else if (mode === "respond") {
      userContent = `The sales rep just said: "${salesRepMessage}"
      
Respond as ${prospectName} from ${prospectCompany}. This is message #${messageCount} in the sales conversation.`;
    } else if (mode === "evaluate") {
      userContent = `As the prospect who just experienced this sales interaction, evaluate the sales rep's performance. Would you buy from them? Why or why not?`;
    }

    // For the AI, flip roles - sales rep messages become "user" (since AI is the prospect)
    const apiMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ 
        role: m.role === "user" ? "assistant" : "user",
        content: m.content 
      })),
      { role: "user", content: userContent }
    ];

    if (mode === "evaluate") {
      const { data } = await callOpenAIJson({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_SALES_SIMULATION_EVAL_MODEL,
        messages: apiMessages,
        temperature: 0.35,
        maxCompletionTokens: 1300,
        validator: (value) => requireJsonKeys(value, [
          "score",
          "discovery",
          "objectionHandling",
          "valueProposition",
          "closingSkills",
          "rapport",
          "strengths",
          "improvements",
          "wouldBuy",
          "overallFeedback",
        ]),
        fallback: () => ({
          score: 70,
          discovery: 70,
          objectionHandling: 70,
          valueProposition: 70,
          closingSkills: 70,
          rapport: 70,
          strengths: ["Completed simulation"],
          improvements: ["Unable to parse detailed evaluation"],
          wouldBuy: "maybe",
          overallFeedback: "Sales simulation completed successfully.",
        }),
      });

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Streaming prospect response via OpenAI");
    const response = await streamOpenAIChatCompletion({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_SALES_SIMULATION_MODEL,
      messages: apiMessages,
      temperature: 0.9,
      maxCompletionTokens: 750,
    });

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-sales-simulation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
