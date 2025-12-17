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

interface ChatSimulationRequest {
  mode: "start" | "respond" | "evaluate";
  scenario: string;
  customerName: string;
  jobTitle?: string;
  messages?: ChatMessage[];
  agentMessage?: string;
  messageCount?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ChatSimulationRequest = await req.json();
    const { mode, scenario, customerName, jobTitle, messages = [], agentMessage, messageCount = 0 } = request;

    console.log("Chat simulation request:", { mode, scenario, customerName, messageCount });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are roleplaying as a customer named ${customerName} in a customer support chat simulation.

SCENARIO: ${scenario}

YOUR PERSONALITY & BEHAVIOR:
- You are a real customer with a genuine problem that's frustrating you
- Start somewhat frustrated but not hostile
- Your frustration level can increase OR decrease based on how the support agent responds
- If the agent is empathetic and helpful, you can become calmer and more cooperative
- If the agent is dismissive or unhelpful, you can become more frustrated
- Sometimes you might send a quick follow-up message expressing impatience
- Be realistic - real customers make typos, use informal language, and sometimes ramble

REALISTIC BEHAVIORS TO EXHIBIT:
- Express genuine emotion (frustration, relief, gratitude)
- Ask clarifying questions about solutions
- Mention how the problem is affecting you personally
- Reference past experiences if relevant ("this happened before", "I've been a customer for X years")
- React authentically to solutions (skeptical, relieved, grateful)

CONVERSATION FLOW:
- If the agent apologizes sincerely and offers help, acknowledge it but stay focused on resolution
- If the agent provides a solution, ask about timeline or confirmation
- If the agent asks for information, provide it (use realistic fake details)
- After ${messageCount >= 5 ? "enough back and forth, if you feel the issue is resolved or being handled well" : "a few more exchanges"}, you can express satisfaction and thank the agent

${mode === 'evaluate' ? `
EVALUATION MODE: You are now evaluating the support agent's performance. Analyze the conversation and return JSON:
{
  "score": <number 0-100>,
  "empathy": <number 0-100>,
  "problemSolving": <number 0-100>,
  "communication": <number 0-100>,
  "professionalism": <number 0-100>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["area1", "area2"],
  "overallFeedback": "Brief summary of agent performance"
}
` : `
RESPONSE GUIDELINES:
- Keep responses 1-3 sentences typically (real customers don't write essays)
- Occasionally send very short responses ("ok", "and?", "I see")
- Don't be satisfied too easily - make sure the agent actually addresses your concern
- CRITICAL: Do NOT greet or use the agent's name. You're the customer - just describe your problem. Real frustrated customers don't say "Hello [agent name]" - they just complain.

NATURAL CONVERSATION ENDING:
- When you feel the agent has genuinely resolved your issue (after at least ${Math.max(5, messageCount)} exchanges), you should naturally wrap up
- Express genuine gratitude and satisfaction in a natural way like: "Thank you so much! I really appreciate your help." or "That's great, thanks for sorting this out for me!"
- When you're satisfied and ready to end the conversation, add [RESOLVED] at the very END of your message (this is a hidden marker, write your natural message first then add [RESOLVED] at the end)
- Only add [RESOLVED] when you're truly satisfied - the agent must have actually addressed your concern
- Example: "Perfect, that's exactly what I needed. Thanks so much for your help! [RESOLVED]"
`}`;

    let userContent = "";
    
    if (mode === "start") {
      userContent = "Start the conversation as the frustrated customer. Send your opening message describing your problem.";
    } else if (mode === "respond") {
      userContent = `The support agent just said: "${agentMessage}"
      
Respond as the customer ${customerName}. Remember your scenario: ${scenario}. This is message #${messageCount} in the conversation.`;
    } else if (mode === "evaluate") {
      userContent = `Evaluate this support agent's performance throughout the conversation. Analyze their empathy, problem-solving, communication skills, and professionalism.`;
    }

    // For the AI, we flip the roles - the "agent" messages become "user" (since AI is the customer)
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ 
        role: m.role === "user" ? "assistant" : "user", // Flip roles for AI perspective
        content: m.content 
      })),
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
            empathy: 70,
            problemSolving: 70,
            communication: 70,
            professionalism: 70,
            strengths: ["Completed simulation"],
            improvements: ["Unable to parse detailed evaluation"],
            overallFeedback: content 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For start/respond modes, stream the response
    console.log("Streaming customer response");
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-chat-simulation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
