import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApplicationData {
  id: string;
  notes: string | null;
  ai_score: number | null;
  ai_analysis: string | null;
  voice_interview_result: any;
  voice_interview_transcript: any;
  cover_letter: string | null;
  resume_url: string | null;
  phase: string | null;
  status: string;
  job: {
    title: string;
    description: string;
    requirements: string | null;
    skills_required: string[] | null;
  } | null;
  candidate: {
    full_name: string | null;
    email: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'Application ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        notes,
        ai_score,
        ai_analysis,
        voice_interview_result,
        voice_interview_transcript,
        cover_letter,
        resume_url,
        phase,
        status,
        jobs (
          title,
          description,
          requirements,
          skills_required
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Error fetching application:', appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: candidateApp } = await supabase
      .from('applications')
      .select('candidate_id')
      .eq('id', applicationId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', candidateApp?.candidate_id)
      .single();

    let parsedNotes: any = {};
    try {
      if (application.notes) {
        parsedNotes = JSON.parse(application.notes);
      }
    } catch (e) {
      console.log('Could not parse notes as JSON');
    }

    const applicationContext = buildApplicationContext(application, parsedNotes, profile);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // NEW: Coaching-focused prompt for Personal Improvement Blueprint
    const systemPrompt = `You are a supportive career mentor helping a candidate understand why their application wasn't successful and providing actionable guidance for improvement. You are NOT a recruiter making judgments—you are a coach providing genuine support.

Your tone must be:
- Warm, empathetic, and encouraging (like a trusted mentor)
- Direct and honest about what didn't work (no sugar-coating)
- Specific and actionable (not generic platitudes)
- Focused on growth, not evaluation

CRITICAL: This is for candidates who were rejected. Acknowledge this respectfully, explain clearly why, and pivot to growth.

Return a valid JSON object with this exact structure:
{
  "honestReflection": {
    "whatHappened": "2-3 sentences honestly explaining why this application didn't move forward. Be specific about the key factor(s). Use 'we' language sparingly—focus on what was observed in their performance.",
    "scoreContext": "1-2 sentences explaining what their score means in practical terms (not just a number)",
    "keyInsight": "One powerful, specific takeaway that anchors the entire report—something they can immediately understand and act on"
  },
  "strengthsToLeverage": {
    "identified": [
      {
        "strength": "Specific strength name",
        "evidence": "Direct quote or specific observation from their application",
        "futureStrategy": "How to better present this strength in future applications—be specific with examples"
      }
    ],
    "hiddenEdge": "Something unique they demonstrated that many candidates don't have—frame it as their competitive advantage"
  },
  "improvementCoaching": [
    {
      "area": "What needs improvement (clear, non-judgmental label)",
      "whatWasObserved": "Specific, factual observation of what happened—use their actual behavior/responses",
      "whyThisMatters": "1-2 sentences explaining how this commonly affects hiring decisions—help them understand employer perspective",
      "improvementStrategy": {
        "framework": "A named method or framework they can follow (e.g., STAR method, 2-minute rule)",
        "practiceScript": "An example script or response structure they can literally practice",
        "dailyHabit": "One small daily action (5-10 min) that builds this skill"
      },
      "resource": {
        "name": "Specific resource name",
        "url": "Real URL (use typingtest.com, pramp.com, interviewing.io, toastmasters.org, coursera.org, etc.)",
        "whyHelpful": "One sentence on why this specific resource addresses their gap"
      }
    }
  ],
  "thirtyDayPlan": {
    "week1": {
      "focus": "Primary skill to work on",
      "dailyActions": ["Day 1-2 action", "Day 3-4 action", "Day 5-7 action"],
      "successMetric": "How they'll know they've made progress"
    },
    "week2": {
      "focus": "Secondary skill to work on",
      "dailyActions": ["Day 1-2 action", "Day 3-4 action", "Day 5-7 action"],
      "successMetric": "How they'll know they've made progress"
    },
    "week3": {
      "focus": "Integration and practice",
      "dailyActions": ["Day 1-2 action", "Day 3-4 action", "Day 5-7 action"],
      "successMetric": "How they'll know they've made progress"
    },
    "week4": {
      "focus": "Application preparation",
      "dailyActions": ["Update resume with new skills", "Practice mock interview", "Identify 3 new opportunities to apply"],
      "successMetric": "Ready to submit a stronger application"
    }
  },
  "closingMessage": {
    "personalNote": "3-4 sentences of genuine encouragement. Reference something SPECIFIC from their application that shows potential. Avoid generic 'you've got this!' language. Be real.",
    "immediateActions": ["5 specific, actionable items they can do TODAY or this week—not vague advice"],
    "finalThought": "One sentence that leaves them feeling capable and motivated—not a generic quote"
  }
}

IMPORTANT GUIDELINES:
- Reference their ACTUAL scores, quotes, and specific behaviors from the application data
- Include REAL resource URLs that directly address their specific gaps
- Be honest about what didn't work—candidates respect directness over vague feedback
- Make the 30-day plan SPECIFIC to their weaknesses—not generic career advice
- Each improvement area must have a concrete strategy they can implement immediately
- Avoid: "stay positive", "believe in yourself", "great things ahead"—be more substantive
- If data is limited, acknowledge it: "Based on the available data..."`;

    const userPrompt = `Create a Personal Improvement Blueprint for this rejected candidate. Be their mentor, not their judge.

${applicationContext}

REMEMBER:
1. They were rejected—acknowledge this with empathy but be clear about why
2. Give them actionable strategies, not just identification of problems
3. The 30-day plan should target their specific weaknesses
4. Every piece of advice should be concrete enough to implement TODAY
5. Leave them feeling informed and empowered, not discouraged

Return ONLY the JSON object, no markdown or extra text.`;

    console.log('Calling Lovable AI for improvement blueprint analysis...');

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
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service requires payment. Please add credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    let reportData;
    try {
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      reportData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI analysis');
    }

    const jobData = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    reportData.metadata = {
      candidateName: profile?.full_name || 'Candidate',
      candidateEmail: profile?.email || '',
      jobTitle: jobData?.title || 'Position',
      overallScore: application.ai_score || parsedNotes?.overallScore || 0,
      generatedAt: new Date().toISOString(),
      applicationId: applicationId,
    };

    console.log('Successfully generated improvement blueprint');

    return new Response(
      JSON.stringify(reportData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating improvement blueprint:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to generate report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildApplicationContext(application: any, parsedNotes: any, profile: any): string {
  const sections: string[] = [];

  sections.push(`## Candidate Information
- Name: ${profile?.full_name || 'Unknown'}
- Email: ${profile?.email || 'Unknown'}
- Position Applied: ${application.jobs?.title || 'Unknown'}
- Application Status: ${application.status}
- Overall AI Score: ${application.ai_score || 'Not scored'}/100
`);

  if (application.jobs) {
    sections.push(`## Job Details
- Title: ${application.jobs.title}
- Description: ${application.jobs.description || 'Not provided'}
- Requirements: ${application.jobs.requirements || 'Not specified'}
- Required Skills: ${application.jobs.skills_required?.join(', ') || 'Not specified'}
`);
  }

  if (application.cover_letter) {
    sections.push(`## Cover Letter
${application.cover_letter}
`);
  }

  if (application.ai_analysis) {
    sections.push(`## Previous AI Analysis
${application.ai_analysis}
`);
  }

  if (parsedNotes?.typingTestResult) {
    const typing = parsedNotes.typingTestResult;
    sections.push(`## Typing Test Results
- Words Per Minute (WPM): ${typing.wpm || 'N/A'}
- Accuracy: ${typing.accuracy || 'N/A'}%
- Errors: ${typing.errors || 0}
`);
  }

  if (parsedNotes?.quizResult) {
    const quiz = parsedNotes.quizResult;
    sections.push(`## Quiz Results
- Score: ${quiz.score || 'N/A'}%
- Correct Answers: ${quiz.correctAnswers || 'N/A'}
- Total Questions: ${quiz.totalQuestions || 'N/A'}
`);
  }

  if (parsedNotes?.answers && Array.isArray(parsedNotes.answers)) {
    sections.push(`## Application Questions & Answers`);
    parsedNotes.answers.forEach((qa: any, i: number) => {
      sections.push(`
Question ${i + 1}: ${qa.question || 'Unknown question'}
Answer: ${qa.answer || 'No answer provided'}
`);
    });
  }

  if (parsedNotes?.portfolioResult) {
    const portfolio = parsedNotes.portfolioResult;
    sections.push(`## Portfolio Assessment
- Overall Score: ${portfolio.overallScore || 'N/A'}
- AI Feedback: ${portfolio.feedback || 'No feedback available'}
`);
  }

  if (parsedNotes?.chatInterviewResult) {
    const chat = parsedNotes.chatInterviewResult;
    sections.push(`## Chat Interview Results
- Score: ${chat.score || 'N/A'}
- Summary: ${chat.summary || 'No summary available'}
`);
  }

  if (parsedNotes?.salesSimulationResult) {
    const sales = parsedNotes.salesSimulationResult;
    sections.push(`## Sales Simulation Results
- Overall Score: ${sales.overallScore || 'N/A'}
- Rapport Building: ${sales.rapportScore || 'N/A'}
- Objection Handling: ${sales.objectionHandlingScore || 'N/A'}
- Closing Ability: ${sales.closingScore || 'N/A'}
`);
  }

  if (application.voice_interview_result) {
    const voice = application.voice_interview_result;
    sections.push(`## Voice Interview Results (PRIMARY DATA SOURCE)

### Overall Assessment
- Overall Score: ${voice.overall_score || 'N/A'}/100
- Recommendation: ${voice.recommendation || 'N/A'}
- Executive Summary: ${voice.executive_summary || 'No summary'}

### Soft Skills Assessment
${voice.soft_skills ? Object.entries(voice.soft_skills).map(([skill, score]) => `- ${skill}: ${score}/100`).join('\n') : 'Not available'}

### Communication Metrics
${voice.communication_metrics ? Object.entries(voice.communication_metrics).map(([metric, value]) => `- ${metric}: ${value}`).join('\n') : 'Not available'}

### Key Strengths Identified
${voice.strengths ? voice.strengths.map((s: string) => `- ${s}`).join('\n') : 'None identified'}

### Concerns Raised
${voice.concerns ? voice.concerns.map((c: string) => `- ${c}`).join('\n') : 'None identified'}

### Question-by-Question Breakdown
${voice.question_breakdown ? voice.question_breakdown.map((q: any, i: number) => `
Question ${i + 1}: ${q.question || 'Unknown'}
- Score: ${q.score || 'N/A'}/100
- Notable Quote: "${q.notable_quote || 'No quote captured'}"
- Assessment: ${q.assessment || 'No assessment'}
- Missed Opportunities: ${q.missed_opportunities?.join(', ') || 'None noted'}
`).join('\n') : 'No question breakdown available'}
`);
  }

  if (application.voice_interview_transcript) {
    const transcript = application.voice_interview_transcript;
    if (Array.isArray(transcript) && transcript.length > 0) {
      sections.push(`## Voice Interview Transcript Excerpts`);
      transcript.slice(0, 8).forEach((entry: any) => {
        sections.push(`${entry.role || 'Unknown'}: "${entry.content || entry.text || 'No content'}"`);
      });
    }
  }

  return sections.join('\n\n');
}
