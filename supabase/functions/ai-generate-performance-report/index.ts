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

    const systemPrompt = `You are a direct, specific career coach creating a PREMIUM improvement blueprint for a rejected candidate.

YOUR OUTPUT MUST BE DETAILED, SPECIFIC, AND EVIDENCE-BASED:
- Reference EXACT scores, quotes, and behaviors from the data
- For each phase, cite EVERY specific mistake with evidence (not just 2)
- No generic advice - give exact strategies with explanations
- Every improvement must reference what they actually did wrong
- Frameworks MUST include a plain-English explanation of what they mean

CRITICAL: Generate a JSON with this EXACT structure:

{
  "topRejectionReasons": [
    "Specific reason with exact evidence (e.g., 'Quiz score 43% - failed 4 of 7 questions on product knowledge')",
    "Specific reason with exact evidence - include actual quotes or scores",
    "Specific reason with exact evidence"
  ],
  "phaseBreakdown": [
    {
      "phase": "Phase Name",
      "score": "43%" or "28 WPM" or "Failed",
      "issues": [
        "Specific issue 1 with evidence (e.g., 'Misspelled customer name - wrote Charles instead of Alex')",
        "Specific issue 2 with evidence",
        "Specific issue 3 with evidence (include ALL issues, not just 2)"
      ],
      "evidence": [
        "Direct quote from their response",
        "Another quote showing the problem",
        "Third quote if available"
      ],
      "fix": "Detailed, actionable fix for this phase - at least 2 sentences explaining exactly what to do"
    }
  ],
  "quickWins": [
    "Specific action with exact resource (e.g., 'Visit typingtest.com and complete 3 five-minute tests today')",
    "Another specific action with tool/resource",
    "Third quick win with specific website or app",
    "Fourth quick win",
    "Fifth quick win"
  ],
  "honestReflection": {
    "whatHappened": "3-4 sentences explaining exactly why they were rejected with specific evidence. Be direct but kind.",
    "keyInsight": "One specific, memorable takeaway - the most important thing they must understand"
  },
  "strengthsToLeverage": {
    "identified": [
      {
        "strength": "Specific strength observed",
        "evidence": "Exact quote or behavior that showed this - be specific"
      }
    ]
  },
  "improvementCoaching": [
    {
      "area": "Specific skill gap (e.g., 'Written Communication Speed')",
      "whatWasObserved": "Detailed explanation of what went wrong with specific examples and quotes. 2-3 sentences minimum.",
      "improvementStrategy": {
        "framework": "Named method (e.g., 'CARE Approach')",
        "explanation": "Plain-English explanation of what this framework means and how to use it (e.g., 'CARE stands for Clarify the issue, Acknowledge their feelings, Resolve the problem, and Empathize throughout - use this sequence in every customer interaction')"
      },
      "resource": {
        "name": "Specific resource (e.g., 'TypingClub.com')",
        "url": "https://actual-url.com"
      }
    }
  ],
  "thirtyDayPlan": {
    "week1": {
      "focus": "Main skill to fix first",
      "dailyActions": [
        "Day 1-2: Specific action with measurable goal",
        "Day 3-4: Next specific action",
        "Day 5-7: End of week action with checkpoint"
      ]
    },
    "week2": {
      "focus": "Secondary skill or building on week 1",
      "dailyActions": [
        "Day 1-2: Specific action",
        "Day 3-4: Specific action",
        "Day 5-7: Specific action with review"
      ]
    },
    "week3": {
      "focus": "Practice integration and mock scenarios",
      "dailyActions": [
        "Day 1-2: Mock practice scenario",
        "Day 3-4: Self-review and adjustment",
        "Day 5-7: Timed practice under pressure"
      ]
    },
    "week4": {
      "focus": "Apply to new jobs with improved skills",
      "dailyActions": [
        "Day 1-2: Update resume with new skills/certifications",
        "Day 3-4: Submit 2-3 targeted applications",
        "Day 5-7: Follow up and continue practicing"
      ]
    }
  },
  "closingMessage": {
    "personalNote": "3-4 encouraging sentences referencing something SPECIFIC they did well. Be warm and genuine.",
    "immediateActions": [
      "First thing to do TODAY - very specific",
      "Second thing to do TODAY",
      "Third thing to do TODAY",
      "Fourth thing to do TODAY",
      "Fifth thing to do TODAY"
    ]
  }
}

RULES:
1. phaseBreakdown MUST include EVERY phase from the provided data with ALL specific issues (not just 2)
2. topRejectionReasons must cite exact scores/quotes - never vague statements
3. quickWins must be actionable TODAY with specific websites/apps
4. improvementStrategy.explanation is REQUIRED - explain what the framework means in simple terms
5. thirtyDayPlan must have detailed dailyActions for each week (3+ per week)
6. Never use generic phrases like "improve your X" - always explain exactly how
7. Use simple ASCII characters only - no special Unicode symbols`;

    const userPrompt = `Create a PREMIUM Improvement Blueprint for this rejected candidate. This is a paid feature - be THOROUGH and SPECIFIC.

${applicationContext}

PASSING SCORE FOR THIS JOB: ${passingScore}%
CANDIDATE'S SCORE: ${application.ai_score || 0}%

CRITICAL REQUIREMENTS:
1. For EACH phase, identify ALL issues (not just 2) with exact quotes/scores as evidence
2. topRejectionReasons must cite specific evidence (exact scores, quotes, behaviors)
3. Every framework in improvementStrategy must include an "explanation" field in plain English
4. thirtyDayPlan must have 3+ detailed dailyActions per week with specific activities
5. quickWins must reference specific websites or tools they can use TODAY
6. Be detailed - this is a premium feature worth real money

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
        temperature: 0.5,
        max_tokens: 8000, // Increased for more detailed output
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
        `Speed: ${t.wpm || 0} WPM (${t.wpm < 40 ? 'below average for chat support - needs 40+ WPM' : 'adequate'})`,
        `Accuracy: ${t.accuracy || 0}% (${t.accuracy < 95 ? 'too many errors - aim for 95%+' : 'good'})`,
        `Total errors: ${t.errors || 0}`,
        `Characters typed: ${t.characters || 'unknown'}`,
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
        `Time taken: ${q.timeTaken ? Math.round(q.timeTaken / 60) + ' minutes' : 'unknown'}`,
      ],
      evidence: [],
    };
    // Add wrong answers if available
    if (q.answers) {
      q.answers.forEach((ans: any, i: number) => {
        if (!ans.isCorrect && ans.userAnswer) {
          phases['Quiz'].details.push(`Question ${i + 1}: Answered "${ans.userAnswer}" - INCORRECT`);
          if (ans.question) {
            phases['Quiz'].evidence.push(`Q: "${ans.question.slice(0, 100)}" -> Their answer: "${ans.userAnswer}"`);
          }
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
        const length = qa.answer.length;
        const quality = length < 20 ? '(very short - needs more detail)' : length < 50 ? '(brief response)' : '';
        phases['Screening Questions'].details.push(`Q${i + 1}: "${qa.question?.slice(0, 80)}..."`);
        phases['Screening Questions'].evidence.push(`Answer: "${qa.answer}" ${quality}`);
      }
    });
  }

  // Chat Interview / Chat Simulation
  if (parsedNotes?.chatInterviewResult || parsedNotes?.chatSimulationResult) {
    const c = parsedNotes.chatInterviewResult || parsedNotes.chatSimulationResult;
    const phaseName = parsedNotes.chatSimulationResult ? 'Chat Simulation' : 'Chat Interview';
    phases[phaseName] = {
      score: c.score ? `${c.score}%` : undefined,
      result: c.summary || c.outcome || undefined,
      details: [],
      evidence: [],
    };
    
    if (c.summary) phases[phaseName].details.push(`Summary: ${c.summary}`);
    if (c.issues?.length) {
      c.issues.forEach((issue: string) => {
        phases[phaseName].details.push(`Issue: ${issue}`);
      });
    }
    if (c.criticalErrors?.length) {
      c.criticalErrors.forEach((err: string) => {
        phases[phaseName].details.push(`Critical Error: ${err}`);
      });
    }
    
    // Extract candidate responses as evidence
    if (c.transcript) {
      c.transcript.forEach((t: any) => {
        if (t.role === 'candidate' || t.role === 'user' || t.role === 'assistant') {
          const label = (t.role === 'candidate' || t.role === 'user') ? 'Candidate' : 'Customer';
          phases[phaseName].evidence.push(`${label}: "${t.content?.slice(0, 150)}${t.content?.length > 150 ? '...' : ''}"`);
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
        `Overall Score: ${s.overallScore || 0}%`,
        `Rapport Building: ${s.rapportScore || 0}%`,
        `Objection Handling: ${s.objectionHandlingScore || 0}%`,
        `Closing Skills: ${s.closingScore || 0}%`,
        `Product Knowledge: ${s.productKnowledgeScore || 0}%`,
      ],
      evidence: [],
    };
    if (s.criticalErrors?.length) {
      s.criticalErrors.forEach((err: string) => {
        phases['Sales Simulation'].details.push(`Critical Error: ${err}`);
      });
    }
    if (s.missedOpportunities?.length) {
      s.missedOpportunities.forEach((opp: string) => {
        phases['Sales Simulation'].details.push(`Missed Opportunity: ${opp}`);
      });
    }
    if (s.transcript) {
      s.transcript.forEach((t: any) => {
        if (t.role === 'candidate' || t.role === 'user') {
          phases['Sales Simulation'].evidence.push(`Candidate said: "${t.content?.slice(0, 150)}${t.content?.length > 150 ? '...' : ''}"`);
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
        `Overall Score: ${v.overall_score || 0}%`,
        `Recommendation: ${v.recommendation || 'N/A'}`,
      ],
      evidence: [],
    };
    if (v.executive_summary) {
      phases['Voice Interview'].details.push(`Summary: ${v.executive_summary}`);
    }
    if (v.concerns?.length) {
      v.concerns.forEach((concern: string) => {
        phases['Voice Interview'].details.push(`Concern: ${concern}`);
      });
    }
    if (v.question_breakdown) {
      v.question_breakdown.forEach((q: any) => {
        if (q.notable_quote) {
          phases['Voice Interview'].evidence.push(`"${q.notable_quote}"`);
        }
        if (q.feedback) {
          phases['Voice Interview'].details.push(`Q: ${q.question?.slice(0, 50)}... -> ${q.feedback}`);
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

  // Cover letter
  if (application.cover_letter) {
    sections.push(`\n## Cover Letter\n"${application.cover_letter}"`);
  }

  // Include phase-specific data with ALL details
  Object.entries(phaseData).forEach(([phase, data]) => {
    sections.push(`\n## ${phase}${data.score ? ` - ${data.score}` : ''}`);
    sections.push(`Details:`);
    data.details.forEach(d => sections.push(`- ${d}`));
    if (data.evidence.length) {
      sections.push(`\nEvidence/Quotes from candidate:`);
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
        issues: data.details.filter(d => 
          d.toLowerCase().includes('wrong') || 
          d.toLowerCase().includes('error') || 
          d.toLowerCase().includes('below') ||
          d.toLowerCase().includes('incorrect') ||
          d.toLowerCase().includes('issue') ||
          d.toLowerCase().includes('concern')
        ),
        evidence: data.evidence,
        fix: 'Review this phase carefully and practice the specific skills tested. Focus on the issues identified above.',
      });
    }
  });

  return result;
}
