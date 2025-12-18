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

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch application data with job and candidate info
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

    // Get candidate profile
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

    // Parse notes for phase data
    let parsedNotes: any = {};
    try {
      if (application.notes) {
        parsedNotes = JSON.parse(application.notes);
      }
    } catch (e) {
      console.log('Could not parse notes as JSON');
    }

    // Build comprehensive context for AI
    const applicationContext = buildApplicationContext(application, parsedNotes, profile);

    // Call Lovable AI for comprehensive analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert career coach and HR professional creating a comprehensive performance report for a job candidate. Your analysis must be:
1. DEEPLY PERSONALIZED - Reference specific quotes, scores, and behaviors from their application
2. ACTIONABLE - Provide specific resources, websites, and exercises they can use
3. ENCOURAGING BUT HONEST - Celebrate strengths while being direct about improvement areas
4. COMPREHENSIVE - Cover personality, communication, technical skills, and career advice

You MUST return a valid JSON object with this exact structure:
{
  "executiveSummary": {
    "headline": "A 1-2 sentence powerful summary of their candidacy",
    "overallAssessment": "3-4 sentences with personalized assessment based on their actual performance",
    "standoutMoments": ["Array of 2-3 specific positive moments from their application"],
    "criticalGrowthAreas": ["Array of 2-3 areas that need the most attention"]
  },
  "personalityProfile": {
    "primaryTraits": [
      { "trait": "Trait name", "score": 0-100, "description": "How this manifested in their application" }
    ],
    "communicationStyle": {
      "style": "e.g., Direct, Analytical, Expressive, Amiable",
      "strengths": ["Communication strengths observed"],
      "developmentAreas": ["Areas to improve in communication"]
    },
    "workStyleInsights": "2-3 sentences about how they'd likely work based on their responses"
  },
  "phaseAnalysis": [
    {
      "phaseName": "Phase name",
      "score": 0-100,
      "status": "excellent/good/needs-improvement/concerning",
      "summary": "1-2 sentence summary",
      "whatWentWell": ["Specific positives with examples"],
      "areasForImprovement": ["Specific improvements needed with context"],
      "keyMoments": ["Direct quotes or specific behaviors observed"],
      "coachingTip": "One actionable tip for this specific phase"
    }
  ],
  "skillsBreakdown": {
    "technicalSkills": [
      { "skill": "Skill name", "score": 0-100, "evidence": "What demonstrated this" }
    ],
    "softSkills": [
      { "skill": "Skill name", "score": 0-100, "evidence": "What demonstrated this" }
    ],
    "communicationMetrics": {
      "clarity": 0-100,
      "articulation": 0-100,
      "confidence": 0-100,
      "professionalTone": 0-100
    }
  },
  "interviewDeepDive": {
    "overallImpression": "2-3 sentences on interview performance",
    "questionBreakdown": [
      {
        "question": "The question asked",
        "responseQuality": "excellent/good/fair/poor",
        "notableQuote": "Direct quote from their response",
        "whatWorked": "What was good about their answer",
        "whatToImprove": "How they could have answered better",
        "idealApproach": "Brief example of a stronger answer"
      }
    ],
    "bodyLanguageAndTone": "Observations about delivery if available",
    "missedOpportunities": ["Things they could have mentioned but didn't"]
  },
  "growthRoadmap": {
    "immediate": [
      {
        "title": "Action item title",
        "priority": "high/medium/low",
        "timeframe": "e.g., This week, Next 30 days",
        "description": "Why this matters",
        "actionSteps": ["Step 1", "Step 2", "Step 3"],
        "resources": [
          { "name": "Resource name", "url": "https://...", "description": "How this helps" }
        ],
        "successMetric": "How to know when you've improved"
      }
    ],
    "shortTerm": [],
    "longTerm": []
  },
  "motivationalClose": {
    "personalizedMessage": "3-4 sentences of genuine encouragement based on their specific strengths",
    "nextSteps": ["3-5 immediate action items they should take"],
    "inspirationalQuote": { "quote": "Relevant quote", "author": "Author name" }
  }
}

IMPORTANT: 
- Use their ACTUAL scores, quotes, and data - not generic placeholders
- Include REAL resource URLs (typingtest.com, keybr.com, pramp.com, interviewing.io, toastmasters.org, coursera.org, udemy.com, etc.)
- Be specific and reference their actual performance
- If data is missing for a section, create reasonable inferences but note the limitation`;

    const userPrompt = `Analyze this candidate's job application and create a comprehensive performance report:

${applicationContext}

Create a deeply personalized report that:
1. References their specific scores, quotes, and behaviors
2. Provides actionable improvement advice with real resource links
3. Analyzes their personality based on their responses
4. Gives honest but encouraging feedback
5. Creates a practical growth roadmap with timelines

Return ONLY the JSON object, no markdown or extra text.`;

    console.log('Calling Lovable AI for performance report analysis...');

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
        max_tokens: 8000,
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

    // Parse the JSON response
    let reportData;
    try {
      // Remove any markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      reportData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI analysis');
    }

    // Add metadata
    const jobData = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    reportData.metadata = {
      candidateName: profile?.full_name || 'Candidate',
      candidateEmail: profile?.email || '',
      jobTitle: jobData?.title || 'Position',
      overallScore: application.ai_score || parsedNotes?.overallScore || 0,
      generatedAt: new Date().toISOString(),
      applicationId: applicationId,
    };

    console.log('Successfully generated performance report');

    return new Response(
      JSON.stringify(reportData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating performance report:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to generate report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildApplicationContext(application: any, parsedNotes: any, profile: any): string {
  const sections: string[] = [];

  // Basic info
  sections.push(`## Candidate Information
- Name: ${profile?.full_name || 'Unknown'}
- Email: ${profile?.email || 'Unknown'}
- Position Applied: ${application.jobs?.title || 'Unknown'}
- Application Status: ${application.status}
- Overall AI Score: ${application.ai_score || 'Not scored'}
`);

  // Job requirements
  if (application.jobs) {
    sections.push(`## Job Details
- Title: ${application.jobs.title}
- Description: ${application.jobs.description || 'Not provided'}
- Requirements: ${application.jobs.requirements || 'Not specified'}
- Required Skills: ${application.jobs.skills_required?.join(', ') || 'Not specified'}
`);
  }

  // Cover letter
  if (application.cover_letter) {
    sections.push(`## Cover Letter
${application.cover_letter}
`);
  }

  // AI Analysis
  if (application.ai_analysis) {
    sections.push(`## Previous AI Analysis
${application.ai_analysis}
`);
  }

  // Typing test results
  if (parsedNotes?.typingTestResult) {
    const typing = parsedNotes.typingTestResult;
    sections.push(`## Typing Test Results
- Words Per Minute (WPM): ${typing.wpm || 'N/A'}
- Accuracy: ${typing.accuracy || 'N/A'}%
- Raw WPM: ${typing.rawWpm || 'N/A'}
- Characters Typed: ${typing.charactersTyped || 'N/A'}
- Errors: ${typing.errors || 0}
`);
  }

  // Quiz results
  if (parsedNotes?.quizResult) {
    const quiz = parsedNotes.quizResult;
    sections.push(`## Quiz Results
- Score: ${quiz.score || 'N/A'}%
- Correct Answers: ${quiz.correctAnswers || 'N/A'}
- Total Questions: ${quiz.totalQuestions || 'N/A'}
- Time Taken: ${quiz.timeTaken || 'N/A'}
`);
  }

  // Application questions/answers
  if (parsedNotes?.answers && Array.isArray(parsedNotes.answers)) {
    sections.push(`## Application Questions & Answers`);
    parsedNotes.answers.forEach((qa: any, i: number) => {
      sections.push(`
Question ${i + 1}: ${qa.question || 'Unknown question'}
Answer: ${qa.answer || 'No answer provided'}
`);
    });
  }

  // Video intro
  if (parsedNotes?.videoIntroUrl) {
    sections.push(`## Video Introduction
- Video submitted: Yes
- URL: ${parsedNotes.videoIntroUrl}
`);
  }

  // Portfolio
  if (parsedNotes?.portfolioResult) {
    const portfolio = parsedNotes.portfolioResult;
    sections.push(`## Portfolio Assessment
- Overall Score: ${portfolio.overallScore || 'N/A'}
- Files Submitted: ${portfolio.filesCount || 'N/A'}
- AI Feedback: ${portfolio.feedback || 'No feedback available'}
`);
  }

  // Chat interview
  if (parsedNotes?.chatInterviewResult) {
    const chat = parsedNotes.chatInterviewResult;
    sections.push(`## Chat Interview Results
- Score: ${chat.score || 'N/A'}
- Summary: ${chat.summary || 'No summary available'}
`);
  }

  // Sales simulation
  if (parsedNotes?.salesSimulationResult) {
    const sales = parsedNotes.salesSimulationResult;
    sections.push(`## Sales Simulation Results
- Overall Score: ${sales.overallScore || 'N/A'}
- Rapport Building: ${sales.rapportScore || 'N/A'}
- Objection Handling: ${sales.objectionHandlingScore || 'N/A'}
- Closing Ability: ${sales.closingScore || 'N/A'}
`);
  }

  // Voice interview results (the richest data source)
  if (application.voice_interview_result) {
    const voice = application.voice_interview_result;
    sections.push(`## Voice Interview Results (IMPORTANT - USE THIS DATA)

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

### Suggested Follow-up Areas
${voice.suggested_followups ? voice.suggested_followups.map((f: string) => `- ${f}`).join('\n') : 'None suggested'}
`);
  }

  // Voice interview transcript
  if (application.voice_interview_transcript) {
    const transcript = application.voice_interview_transcript;
    if (Array.isArray(transcript) && transcript.length > 0) {
      sections.push(`## Voice Interview Transcript Excerpts`);
      transcript.slice(0, 10).forEach((entry: any, i: number) => {
        sections.push(`${entry.role || 'Unknown'}: "${entry.content || entry.text || 'No content'}"`);
      });
    }
  }

  return sections.join('\n\n');
}
