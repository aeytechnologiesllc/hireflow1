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

    const systemPrompt = `You are a friendly, supportive career coach creating a PREMIUM improvement blueprint for a rejected candidate.

TONE & LANGUAGE RULES (CRITICAL):
- Write in simple, conversational English - as if explaining to a friend over coffee
- Use PROFESSIONAL, role-relative language. Anchor all critiques to job requirements, not personal assessment.
- NEVER USE these emotionally charged phrases - use the professional alternatives instead:
  * NEVER: "extremely poor" or "very poor" -> SAY: "Significantly below role requirements"
  * NEVER: "failed" or "failure" -> SAY: "Did not meet" or "Was below requirements"
  * NEVER: "critical" (as severity) -> SAY: "Significant" or "Notable"
  * NEVER: "deficiency" or "deficiencies" -> SAY: "Gap" or "Area for development"
  * NEVER: "terrible" or "awful" -> SAY: "Needs substantial improvement"
  * NEVER: "major deficiencies" or "severe deficiencies" -> SAY: "Substantial gaps relative to expectations"
  * NEVER: "severely damaged credibility" -> SAY: "Reduced employer confidence due to inconsistencies"
  * NEVER: "unacceptable" -> SAY: "Below baseline requirements"
  * NEVER: "incompetent" -> SAY: "Not yet at required skill level"
- When describing low performance, frame it relative to role expectations:
  * EXAMPLE: "Your typing speed of 28 WPM is below the typical 40+ WPM requirement for chat support roles"
  * NOT: "Your typing speed was extremely low"
- Be direct and specific but warm - you're helping someone improve, not judging them
- When referencing data, explain what it MEANS for them, not just what the numbers are
- For cover letters: If they submitted something brief, say "Your cover letter was just X words" not "N/A"
- Don't repeat technical data verbatim - summarize it in plain English

FRAMING GUIDANCE:
- For "topRejectionDrivers", frame them as "Key Factors in Your Application Outcome" - focus on the gap between performance and requirements, not personal judgment
- Always anchor critiques to "relative to employer expectations" or "relative to role requirements"

AI-ASSISTED CONTENT CLARIFICATION:
- If you detect or mention "AI-assisted content", "POSSIBLY_AI_ASSISTED", or similar patterns in resume/cover letter analysis:
  * ALWAYS add this clarification: "Note: This does not confirm AI usage. It indicates language patterns commonly associated with generic or template-based content."
  * This must be informational and educational, not accusatory
  * Suggest how to make content more personal and authentic

EXTREME SCORE CONTEXT (<20% SCORES):
- For any phase score below 20%, you MUST add context that explains:
  1. What employers typically expect for this skill in this role type
  2. Why the gap matters operationally (e.g., "Chat support agents handle 3-5 conversations simultaneously, so 28 WPM would mean customers wait too long for responses")
  3. A reassuring note that this is a skill that can be learned with practice

YOUR OUTPUT MUST BE DETAILED, SPECIFIC, AND EVIDENCE-BASED:
- Reference EXACT scores, quotes, and behaviors from the data
- For each phase, cite EVERY specific mistake with evidence (not just 2)
- No generic advice - give exact strategies with step-by-step explanations
- Every improvement must reference what they actually did wrong
- Frameworks MUST include a 1-2 sentence plain-English explanation of what they mean and how to use them

CRITICAL: Generate a JSON with this EXACT structure:

{
  "executiveSummary": {
    "overallScore": 15,
    "scoreContext": "Your score of 15/100 indicates significant gaps relative to role requirements. This is a starting point, not a final verdict.",
    "topRejectionDrivers": [
      "Typing speed (28 WPM) is below the 40+ WPM requirement for chat support",
      "Quiz score (43%) did not meet the 70% passing threshold",
      "Cover letter was very brief (5 words) and didn't showcase your qualifications"
    ],
    "topPriorityFixes": [
      "Practice typing daily on TypingClub.com to reach 40+ WPM within 2 weeks",
      "Review customer service fundamentals using free resources like HubSpot Academy",
      "Prepare a 150-300 word cover letter template you can customize for each role",
      "Practice answering behavioral questions using the STAR method",
      "Take practice customer service quizzes on Indeed's skill assessments"
    ]
  },
  "topRejectionReasons": [
    "Plain-English reason with exact evidence (e.g., 'Your quiz score of 43% (3 out of 7 correct) was below the 70% passing threshold')",
    "Another reason explained with professional, role-relative language",
    "Third reason - be specific but use neutral professional tone"
  ],
  "phaseBreakdown": [
    {
      "phase": "Phase Name (e.g., 'Cover Letter' not 'Cover Letter (N/A)')",
      "score": "43%" or "28 WPM" or "Very Brief",
      "employerExpectation": "For scores below 20%, explain what employers typically expect and why it matters operationally",
      "issues": [
        "Professional description of issue (e.g., 'Your cover letter was only 5 words, which doesn't provide enough context about your qualifications')",
        "Another issue using neutral language",
        "Third issue - include ALL issues you find in the data"
      ],
      "evidence": [
        "Direct quote from their response",
        "Another quote showing the area for improvement"
      ],
      "fix": "Detailed, actionable fix written like advice from a mentor. At least 2 sentences explaining exactly what to do and why it helps."
    }
  ],
  "quickWins": [
    "Specific action with exact resource (e.g., 'Go to TypingClub.com and complete the first 3 lessons - takes about 15 minutes')",
    "Another specific action with tool/resource",
    "Third quick win with specific website or app",
    "Fourth quick win",
    "Fifth quick win"
  ],
  "honestReflection": {
    "whatHappened": "3-4 sentences explaining the application outcome using professional language. Use specific numbers but frame them relative to role requirements.",
    "keyInsight": "One specific, memorable takeaway in simple language - what's the #1 thing they need to understand?"
  },
  "strengthsToLeverage": {
    "identified": [
      {
        "strength": "Specific strength you noticed",
        "evidence": "Exact quote or behavior that showed this strength"
      }
    ]
  },
  "improvementCoaching": [
    {
      "area": "Skill they need to work on (e.g., 'Typing Speed')",
      "whatWasObserved": "Explain what happened using professional language. For example: 'Your typing speed of 28 WPM is below the typical 40+ WPM requirement for chat support roles. At this speed, customers would experience longer wait times between messages.' 2-3 sentences.",
      "employerExpectation": "For scores below 20%, explain: 'Employers typically expect X because Y. This matters operationally because Z.'",
      "improvementStrategy": {
        "framework": "Named method (e.g., 'The CARE Approach')",
        "explanation": "REQUIRED: Explain what this means in simple terms."
      },
      "resource": {
        "name": "Specific resource (e.g., 'TypingClub')",
        "url": "https://actual-url.com"
      }
    }
  ],
  "thirtyDayPlan": {
    "week1": {
      "focus": "Main skill to focus on first",
      "dailyActions": [
        "Day 1-2: Specific action with measurable goal",
        "Day 3-4: Next specific action with clear goal",
        "Day 5-7: End of week action with checkpoint to measure progress"
      ]
    },
    "week2": {
      "focus": "Secondary skill or building on week 1",
      "dailyActions": [
        "Day 1-2: Specific action with measurable goal",
        "Day 3-4: Specific action with clear goal",
        "Day 5-7: Specific action with review checkpoint"
      ]
    },
    "week3": {
      "focus": "Practice putting it together",
      "dailyActions": [
        "Day 1-2: Mock practice scenario with specific instructions",
        "Day 3-4: Self-review and adjustment activities",
        "Day 5-7: Timed practice to build confidence"
      ]
    },
    "week4": {
      "focus": "Apply with confidence",
      "dailyActions": [
        "Day 1-2: Update resume with new skills learned",
        "Day 3-4: Submit 2-3 applications using your improved skills",
        "Day 5-7: Follow up on applications and continue practicing"
      ]
    }
  },
  "closingMessage": {
    "personalNote": "3-4 warm, encouraging sentences. Reference something SPECIFIC they did well or showed potential in. Be genuine and supportive.",
    "developmentalDisclaimer": "This report is intended as developmental feedback to support improvement and does not represent a judgment of personal character or future potential.",
    "immediateActions": [
      "First thing to do TODAY - very specific and easy to start",
      "Second thing to do TODAY",
      "Third thing to do TODAY",
      "Fourth thing to do TODAY",
      "Fifth thing to do TODAY"
    ]
  }
}

DEVELOPMENTAL DISCLAIMER (REQUIRED):
- You MUST include this exact sentence in closingMessage.developmentalDisclaimer: "This report is intended as developmental feedback to support improvement and does not represent a judgment of personal character or future potential."
- This disclaimer is legally important and must be present in every report.

RULES:
1. phaseBreakdown MUST include EVERY phase from the provided data with ALL specific issues
2. Write like a supportive mentor, not a robot - use "you" and "your" naturally
3. Use PROFESSIONAL language - no emotionally charged words like "poor", "failed", "critical"
4. topRejectionReasons must cite exact scores/quotes but explain what they mean in context
5. quickWins must be actionable TODAY with specific websites/apps and time estimates
6. improvementStrategy.explanation is REQUIRED - if you don't explain the framework, you've failed
7. thirtyDayPlan must have detailed dailyActions for each week (3+ per week) with measurable goals
8. NEVER say "N/A" for a phase - describe what was submitted, even if brief
9. Use simple ASCII characters only - no special Unicode symbols like checkmarks or arrows
10. executiveSummary is REQUIRED with overallScore, scoreContext, top 3 rejection drivers, and top 5 priority fixes
11. For any score below 20%, include employerExpectation field explaining what's typically expected and why it matters`;

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
    const wpm = t.wpm || 0;
    const accuracy = t.accuracy || 0;
    const errors = t.errors || 0;
    
    // Build conversational, plain-English details
    const speedNote = wpm < 40 
      ? `You typed at ${wpm} words per minute. Chat support roles typically need 40 or more WPM to keep up with customer conversations.`
      : `You typed at ${wpm} words per minute, which is a solid speed for chat support.`;
    
    // Only call out accuracy as a major issue if below 85%
    let accuracyNote = '';
    if (accuracy < 85) {
      accuracyNote = `Your accuracy was ${accuracy}%, which means a lot of typos. For customer-facing roles, aim for 95% or higher.`;
    } else if (accuracy < 95) {
      accuracyNote = `Your accuracy was ${accuracy}%. That's okay, but for chat support aim for 95% or higher to look professional.`;
    } else {
      accuracyNote = `Your accuracy was ${accuracy}%, which is excellent.`;
    }
    
    phases['Typing Test'] = {
      score: `${wpm} WPM, ${accuracy}% accuracy`,
      details: [
        speedNote,
        accuracyNote,
        errors > 0 ? `You made ${errors} errors during the test.` : '',
      ].filter(Boolean),
      evidence: [],
    };
  }

  // Quiz
  if (parsedNotes?.quizResult) {
    const q = parsedNotes.quizResult;
    // Fix: use q.correct and q.total (correct property names), with fallbacks
    const correctAnswers = q.correct ?? q.correctAnswers ?? 0;
    const totalQuestions = q.total ?? q.totalQuestions ?? 0;
    const score = q.score || 0;
    const timeTaken = q.timeTaken ? Math.round(q.timeTaken / 60) : null;
    
    phases['Quiz'] = {
      score: `${score}%`,
      details: [
        `You got ${correctAnswers} out of ${totalQuestions} questions correct (${score}%).`,
        timeTaken ? `You completed the quiz in about ${timeTaken} minutes.` : '',
      ].filter(Boolean),
      evidence: [],
    };
    // Add wrong answers if available
    if (q.answers) {
      q.answers.forEach((ans: any, i: number) => {
        if (!ans.isCorrect && ans.userAnswer) {
          phases['Quiz'].details.push(`Question ${i + 1}: You answered "${ans.userAnswer}" - this was incorrect.`);
          if (ans.question) {
            phases['Quiz'].evidence.push(`Question: "${ans.question.slice(0, 100)}" - Your answer: "${ans.userAnswer}"`);
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

  // Cover letter - provide context about length
  if (application.cover_letter) {
    const coverLetter = application.cover_letter.trim();
    const wordCount = coverLetter.split(/\s+/).filter(Boolean).length;
    let lengthNote = '';
    if (wordCount < 20) {
      lengthNote = `(Very Brief - only ${wordCount} words. A strong cover letter is typically 150-300 words.)`;
    } else if (wordCount < 50) {
      lengthNote = `(Short - ${wordCount} words. Consider expanding to 150-300 words for more impact.)`;
    } else {
      lengthNote = `(${wordCount} words)`;
    }
    sections.push(`\n## Cover Letter ${lengthNote}\n"${coverLetter}"`);
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
