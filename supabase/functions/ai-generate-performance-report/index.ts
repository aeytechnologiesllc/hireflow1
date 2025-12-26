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
          skills_required,
          workflow_steps,
          passing_score
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

    // Build phase-specific data for rich context
    const phaseData = buildPhaseData(application, parsedNotes);
    const applicationContext = buildApplicationContext(application, parsedNotes, profile, phaseData);
    
    const jobData = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    const passingScore = jobData?.passing_score || 70;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are a direct, specific career coach creating an improvement blueprint for a rejected candidate.

YOUR OUTPUT MUST BE SPECIFIC AND EVIDENCE-BASED:
- Reference EXACT scores, quotes, and behaviors from the data
- For each phase, cite specific mistakes with evidence
- No generic advice like "practice more" - give exact strategies
- Every improvement must reference what they actually did wrong

CRITICAL: Generate a JSON with this EXACT structure:

{
  "topRejectionReasons": [
    "Specific reason 1 with exact evidence (e.g., 'Quiz score 43% below 70% threshold')",
    "Specific reason 2 with exact evidence",
    "Specific reason 3 with exact evidence"
  ],
  "phaseBreakdown": [
    {
      "phase": "Phase Name",
      "score": "43%" or "28 WPM" or "Failed",
      "issues": [
        "Specific issue with evidence (e.g., 'Called customer Charles instead of Alex')",
        "Another specific issue"
      ],
      "evidence": ["Direct quote or exact answer they gave"],
      "fix": "Specific actionable fix for this phase"
    }
  ],
  "quickWins": [
    "Specific action they can do TODAY (e.g., 'Take 3 free typing tests on typingtest.com')",
    "Another specific action with tool/resource"
  ],
  "honestReflection": {
    "whatHappened": "2-3 sentences explaining exactly why they were rejected with specific evidence",
    "keyInsight": "One specific takeaway they must understand"
  },
  "strengthsToLeverage": {
    "identified": [
      {
        "strength": "Specific strength observed",
        "evidence": "Exact quote or behavior that showed this"
      }
    ]
  },
  "improvementCoaching": [
    {
      "area": "Specific skill gap",
      "whatWasObserved": "Exact behavior/quote that showed this gap",
      "improvementStrategy": {
        "framework": "Named method (e.g., 'STAR method for responses')"
      },
      "resource": {
        "name": "Specific resource",
        "url": "Real URL"
      }
    }
  ],
  "thirtyDayPlan": {
    "week1": { "focus": "Main skill to fix", "dailyActions": ["Action 1", "Action 2"] },
    "week2": { "focus": "Secondary skill", "dailyActions": ["Action 1", "Action 2"] },
    "week3": { "focus": "Practice integration", "dailyActions": ["Action 1", "Action 2"] },
    "week4": { "focus": "Apply to new jobs", "dailyActions": ["Update resume", "Submit 3 applications"] }
  },
  "closingMessage": {
    "personalNote": "2-3 encouraging sentences referencing something SPECIFIC they did well",
    "immediateActions": ["Do this today", "And this", "And this"]
  }
}

RULES:
1. phaseBreakdown MUST include EVERY phase from the provided data with specific issues
2. topRejectionReasons must cite exact scores/quotes, not vague statements
3. quickWins must be actionable TODAY with specific resources
4. Never say "improve your X" without explaining exactly how and referencing what went wrong`;

    const userPrompt = `Create an Improvement Blueprint for this rejected candidate. Be SPECIFIC with evidence.

${applicationContext}

PASSING SCORE FOR THIS JOB: ${passingScore}%
CANDIDATE'S SCORE: ${application.ai_score || 0}%

CRITICAL REQUIREMENTS:
1. For EACH phase in the data, identify exactly what went wrong with quotes/scores
2. The topRejectionReasons must cite specific evidence (scores, quotes, behaviors)
3. phaseBreakdown must cover ALL phases listed above with specific issues
4. quickWins must reference specific tools they can use TODAY

Return ONLY valid JSON, no markdown.`;

    console.log('Calling Lovable AI for improvement blueprint...');

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
        temperature: 0.5, // Lower for more consistent output
        max_tokens: 5000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
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

    // Validate and enhance phaseBreakdown with actual data if AI missed phases
    reportData.phaseBreakdown = validatePhaseBreakdown(reportData.phaseBreakdown || [], phaseData);

    // Add metadata
    const jobDataForMetadata = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    reportData.metadata = {
      candidateName: profile?.full_name || 'Candidate',
      candidateEmail: profile?.email || '',
      jobTitle: jobDataForMetadata?.title || 'Position',
      overallScore: application.ai_score || parsedNotes?.overallScore || 0,
      generatedAt: new Date().toISOString(),
      applicationId: applicationId,
      completedPhases: Object.keys(phaseData),
    };

    console.log('Generated blueprint with phases:', Object.keys(phaseData));

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

interface PhaseData {
  [phase: string]: {
    score?: string;
    result?: string;
    details: string[];
    evidence: string[];
  };
}

function buildPhaseData(application: any, parsedNotes: any): PhaseData {
  const phases: PhaseData = {};

  // Typing Test
  if (parsedNotes?.typingTestResult) {
    const t = parsedNotes.typingTestResult;
    phases['Typing Test'] = {
      score: `${t.wpm || 0} WPM, ${t.accuracy || 0}% accuracy`,
      details: [
        `Speed: ${t.wpm || 0} WPM (${t.wpm < 40 ? 'below average' : 'adequate'})`,
        `Accuracy: ${t.accuracy || 0}%`,
        `Errors: ${t.errors || 0}`,
      ],
      evidence: [],
    };
  }

  // Quiz
  if (parsedNotes?.quizResult) {
    const q = parsedNotes.quizResult;
    phases['Quiz'] = {
      score: `${q.score || 0}%`,
      details: [
        `Score: ${q.score || 0}% (${q.correctAnswers || 0}/${q.totalQuestions || 0} correct)`,
      ],
      evidence: [],
    };
    // Add wrong answers if available
    if (q.answers) {
      q.answers.forEach((ans: any, i: number) => {
        if (!ans.isCorrect && ans.userAnswer) {
          phases['Quiz'].details.push(`Q${i + 1}: Answered "${ans.userAnswer}" (wrong)`);
          phases['Quiz'].evidence.push(`"${ans.userAnswer}"`);
        }
      });
    }
  }

  // Screening Questions
  if (parsedNotes?.answers?.length) {
    phases['Screening Questions'] = {
      details: [],
      evidence: [],
    };
    parsedNotes.answers.forEach((qa: any, i: number) => {
      if (qa.answer) {
        const short = qa.answer.length < 20 ? '(very short response)' : '';
        phases['Screening Questions'].details.push(`Q${i + 1}: ${qa.question?.slice(0, 50)}...`);
        phases['Screening Questions'].evidence.push(`"${qa.answer.slice(0, 100)}${qa.answer.length > 100 ? '...' : ''}" ${short}`);
      }
    });
  }

  // Chat Interview
  if (parsedNotes?.chatInterviewResult) {
    const c = parsedNotes.chatInterviewResult;
    phases['Chat Interview'] = {
      score: c.score ? `${c.score}%` : undefined,
      result: c.summary || undefined,
      details: [c.summary || 'Completed'],
      evidence: [],
    };
    if (c.issues) phases['Chat Interview'].details.push(...c.issues);
    if (c.transcript) {
      c.transcript.slice(0, 3).forEach((t: any) => {
        if (t.role === 'candidate' || t.role === 'user') {
          phases['Chat Interview'].evidence.push(`"${t.content?.slice(0, 80)}..."`);
        }
      });
    }
  }

  // Sales Simulation
  if (parsedNotes?.salesSimulationResult) {
    const s = parsedNotes.salesSimulationResult;
    phases['Sales Simulation'] = {
      score: s.overallScore ? `${s.overallScore}%` : undefined,
      details: [
        `Overall: ${s.overallScore || 0}%`,
        `Rapport: ${s.rapportScore || 0}%`,
        `Objection Handling: ${s.objectionHandlingScore || 0}%`,
        `Closing: ${s.closingScore || 0}%`,
      ],
      evidence: [],
    };
    if (s.criticalErrors) {
      phases['Sales Simulation'].details.push(...s.criticalErrors);
    }
    if (s.transcript) {
      s.transcript.slice(0, 2).forEach((t: any) => {
        if (t.role === 'candidate' || t.role === 'user') {
          phases['Sales Simulation'].evidence.push(`"${t.content?.slice(0, 80)}..."`);
        }
      });
    }
  }

  // Voice Interview
  if (application.voice_interview_result) {
    const v = application.voice_interview_result;
    phases['Voice Interview'] = {
      score: v.overall_score ? `${v.overall_score}%` : undefined,
      result: v.recommendation,
      details: [
        `Overall: ${v.overall_score || 0}%`,
        v.executive_summary || '',
      ],
      evidence: [],
    };
    if (v.concerns?.length) phases['Voice Interview'].details.push(...v.concerns);
    if (v.question_breakdown) {
      v.question_breakdown.slice(0, 2).forEach((q: any) => {
        if (q.notable_quote) {
          phases['Voice Interview'].evidence.push(`"${q.notable_quote}"`);
        }
      });
    }
  }

  return phases;
}

function buildApplicationContext(application: any, parsedNotes: any, profile: any, phaseData: PhaseData): string {
  const sections: string[] = [];

  sections.push(`## Candidate: ${profile?.full_name || 'Unknown'}
- Position: ${application.jobs?.title || 'Unknown'}
- Status: REJECTED
- AI Score: ${application.ai_score || 0}/100`);

  // Include phase-specific data
  Object.entries(phaseData).forEach(([phase, data]) => {
    sections.push(`\n## ${phase}${data.score ? ` - ${data.score}` : ''}`);
    data.details.forEach(d => sections.push(`- ${d}`));
    if (data.evidence.length) {
      sections.push(`Evidence/Quotes:`);
      data.evidence.forEach(e => sections.push(`  ${e}`));
    }
  });

  // Previous AI analysis
  if (application.ai_analysis) {
    sections.push(`\n## Previous AI Analysis\n${application.ai_analysis}`);
  }

  return sections.join('\n');
}

function validatePhaseBreakdown(aiPhases: any[], phaseData: PhaseData): any[] {
  const result = [...aiPhases];
  const existingPhases = new Set(aiPhases.map((p: any) => p.phase?.toLowerCase()));

  // Add any phases the AI missed
  Object.entries(phaseData).forEach(([phase, data]) => {
    if (!existingPhases.has(phase.toLowerCase())) {
      result.push({
        phase,
        score: data.score || data.result || 'Completed',
        issues: data.details.filter(d => d.includes('wrong') || d.includes('error') || d.includes('below')),
        evidence: data.evidence,
        fix: 'Review performance and practice this skill area',
      });
    }
  });

  return result;
}
