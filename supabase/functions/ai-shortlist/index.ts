import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { jobId, jobTitle, jobDescription, applications } = await req.json();

    if (!applications || applications.length < 2) {
      throw new Error('Need at least 2 applicants to generate shortlist');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build applicant summaries for comparison
    const applicantSummaries = applications.map((app: any, index: number) => {
      const notes = app.notes || {};
      const profile = app.profiles || {};
      
      let summary = `
CANDIDATE ${index + 1}: ${profile.full_name || 'Unknown'}
- AI Score: ${app.ai_score || 'Not evaluated'}
- Current Phase: ${app.phase || 'Unknown'}
- Status: ${app.status || 'Unknown'}
- Experience: ${profile.experience_years ? `${profile.experience_years} years` : 'Not specified'}
- Location: ${profile.location || 'Not specified'}
`;

      // Add quiz results if available
      if (notes.quizResult) {
        summary += `- Quiz Score: ${notes.quizResult.score}% (${notes.quizResult.correctAnswers}/${notes.quizResult.totalQuestions} correct)\n`;
      }

      // Add typing test if available
      if (notes.typingTestResult) {
        summary += `- Typing Test: ${notes.typingTestResult.wpm} WPM, ${notes.typingTestResult.accuracy}% accuracy\n`;
      }

      // Add simulation results if available
      if (notes.chatSimulationResult) {
        summary += `- Chat Simulation: ${notes.chatSimulationResult.overallScore}/100\n`;
      }
      if (notes.salesSimulationResult) {
        summary += `- Sales Simulation: ${notes.salesSimulationResult.overallScore}/100, Would Buy: ${notes.salesSimulationResult.wouldBuy ? 'Yes' : 'No'}\n`;
      }

      // Add voice interview if available
      if (app.voice_interview_result) {
        summary += `- Voice Interview: ${app.voice_interview_result.overall_score}/100, Recommendation: ${app.voice_interview_result.recommendation}\n`;
      }

      // Add AI analysis summary if available
      if (app.ai_analysis) {
        const analysisPreview = app.ai_analysis.substring(0, 500);
        summary += `- AI Analysis Summary: ${analysisPreview}...\n`;
      }

      return summary;
    }).join('\n---\n');

    const systemPrompt = `You are AVA, an expert hiring consultant for HireFlow. Your task is to perform a COMPARATIVE analysis of multiple candidates for a job position and create a ranked shortlist.

IMPORTANT: Be direct, insightful, and focus on what makes each candidate stand out or fall behind compared to others. Look at their assessment data objectively.

You must return a valid JSON response with this EXACT structure:
{
  "rankedCandidates": [
    {
      "rank": 1,
      "candidateName": "Name",
      "aiScore": 85,
      "keyDifferentiator": "One phrase describing what sets them apart",
      "strengths": ["strength 1", "strength 2"],
      "concerns": ["concern 1"],
      "recommendation": "strong_yes" | "yes" | "maybe" | "no"
    }
  ],
  "comparativeInsights": [
    "Insight about the candidate pool",
    "What separates top from bottom performers",
    "Common patterns or gaps"
  ],
  "quickDecision": {
    "interviewImmediately": ["Name 1", "Name 2"],
    "considerWithReservations": ["Name 3"],
    "pass": ["Name 4"]
  },
  "summaryStatement": "A 2-3 sentence executive summary of the shortlist analysis"
}

Recommendation values:
- "strong_yes": Exceptional candidate, interview immediately
- "yes": Good fit, should interview
- "maybe": Has potential but concerns exist
- "no": Not recommended for this role`;

    const userPrompt = `Analyze and rank these ${applications.length} candidates for the position of "${jobTitle}".

JOB DESCRIPTION:
${jobDescription || 'Not provided'}

CANDIDATES TO COMPARE:
${applicantSummaries}

Compare all candidates against each other and provide a ranked shortlist with actionable recommendations. Focus on who would be the best fit for this specific role based on their assessment performance and qualifications.`;

    console.log('Calling Lovable AI for shortlist analysis...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let shortlistData;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      shortlistData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse shortlist analysis');
    }

    console.log('Shortlist analysis complete');

    return new Response(JSON.stringify({ 
      shortlist: shortlistData,
      jobId,
      jobTitle,
      candidateCount: applications.length,
      generatedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-shortlist:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
