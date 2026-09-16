import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJson, openAIErrorStatus } from "../_shared/openai.ts";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { canAccessPerformanceReport } from "../_shared/performanceReportAccess.ts";
import { isBlueprintBillingEnabled } from "../_shared/appSettings.ts";
import { validateBlueprintReport, REQUIRED_DEVELOPMENTAL_DISCLAIMER, type ImprovementBlueprintData } from "../_shared/blueprintReport.ts";

// Model is configurable so a retirement is a config change, not a code change.
// Set OPENAI_REPORT_MODEL to the replacement model when swapping.
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_REPORT_MODEL = Deno.env.get('OPENAI_REPORT_MODEL') || 'gpt-5.6-terra';


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

    // This report contains a candidate's private evaluation (voice transcript,
    // notes, AI analysis) and is also the Improvement Blueprint content. It
    // must never be reachable by an arbitrary signed-in user just by
    // guessing an applicationId — verify the caller first, before any other
    // DB or OpenAI work.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: requestingUserError } = await supabaseUserClient.auth.getUser();

    if (requestingUserError || !requestingUser) {
      console.error('[Report] Invalid auth token:', requestingUserError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cost/abuse guard, keyed by the authenticated caller rather than IP —
    // this is a signed-in-only feature that calls OpenAI.
    const rateLimitResponse = await guardPublicAiCall(
      req,
      'ai-generate-performance-report',
      corsHeaders,
      10,
      3600,
      requestingUser.id,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { data: candidateApp, error: candidateAppError } = await supabase
      .from('applications')
      .select('candidate_id, job_id, jobs ( employer_id )')
      .eq('id', applicationId)
      .single();

    if (candidateAppError || !candidateApp) {
      console.error('[Report] Error fetching application for auth check:', candidateAppError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const employerId = (candidateApp.jobs as any)?.employer_id as string | undefined;
    const isCandidateOwner = candidateApp.candidate_id === requestingUser.id;
    const isEmployerOwner = !!employerId && employerId === requestingUser.id;

    // Team-member access must be scoped to THIS job the same way the live
    // RLS policy on `applications` scopes it ("Team members can view
    // applications for assigned jobs" -> is_active_team_member_for_job),
    // whose definition requires assigned_job_ids to be null (whole-employer
    // access) OR contain this job's id. A plain team_members row check
    // (user_id + employer_id + active) would grant a team member scoped to
    // other jobs access to this candidate's report -- call the same
    // SECURITY DEFINER function the RLS policy uses instead of
    // re-implementing the scoping rule here.
    const [{ data: isScopedTeamMember }, { data: blueprintPurchase }, billingEnabled] = await Promise.all([
      !isCandidateOwner && !isEmployerOwner && employerId
        ? supabaseUserClient.rpc('is_active_team_member_for_job', {
            p_job_id: candidateApp.job_id,
            p_user_id: requestingUser.id,
          })
        : Promise.resolve({ data: false }),
      isCandidateOwner
        ? supabase
            .from('blueprint_purchases')
            .select('id')
            .eq('application_id', applicationId)
            .eq('user_id', requestingUser.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // 'blueprint_paid' (app_settings): false while billing is off, so the
      // candidate path below doesn't require a purchase row. See
      // supabase/functions/_shared/appSettings.ts.
      isBlueprintBillingEnabled(supabase),
    ]);

    const isEmployerSide = isEmployerOwner || !!isScopedTeamMember;
    const hasPurchasedBlueprint = isCandidateOwner && !!blueprintPurchase;

    if (!canAccessPerformanceReport({ isCandidateOwner, hasPurchasedBlueprint, isEmployerSide, billingEnabled })) {
      console.warn('[Report] Unauthorized performance report request', {
        requesterId: requestingUser.id,
        applicationId,
        employerId,
        candidateId: candidateApp.candidate_id,
      });
      return new Response(
        JSON.stringify({ error: 'You do not have permission to access this report' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const jobData = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    const applicationContext = buildApplicationContext(application, parsedNotes, profile, phaseData, jobData);

    const passingScore = jobData?.passing_score || 70;
    const completedPhases = Object.keys(phaseData);
    const dataDepth: ImprovementBlueprintData['metadata']['dataDepth'] =
      completedPhases.length >= 4 ? 'comprehensive' : completedPhases.length >= 2 ? 'moderate' : 'minimal';

    if (!OPENAI_API_KEY) {
      // Surfaces as a 500 JSON { error } via the catch below.
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Design notes (2026-09-16, owner decision: keep + rework this report):
    // structure follows what actually helps a rejected candidate — lead with
    // real strengths, name the specific gap against THIS job's real
    // requirements and screening steps (never generic advice), give a
    // concrete way to practice each gap with a worked example, help them
    // present their real experience better, and suggest role types their
    // demonstrated strengths fit. Never invent a fact about the candidate,
    // never promise an outcome, never name AI or Ava — this is candidate-
    // facing copy and those words never appear there.
    const systemPrompt = `You write a warm, honest, specific coaching report for someone who applied to a job and was not moved forward. You are their advocate, not the employer's. You never invent a fact, quote, or score the candidate's data does not support. You never promise that following this advice will get them hired — practice reduces gaps, it does not guarantee outcomes. You never use the words "AI" or "Ava", or describe any part of the hiring process as automated or AI-driven — write as if a thoughtful person wrote every sentence.

WRITE IN PLAIN, WARM, EVERYDAY LANGUAGE:
- Talk to "you", like a supportive mentor, not a form letter.
- Never use clinical or harsh words: no "failed", "poor", "deficient", "unacceptable", "critical", "incompetent". Say what happened plainly and kindly instead — e.g. "You typed 28 words per minute; this role's screening step looks for 40+."
- Every gap you name must be anchored to something specific about THIS job — its stated requirements, skills, or one of its actual screening steps (typing test, quiz, chat interview, sales simulation, voice interview, cover letter, screening questions) — never a generic "improve your communication skills".
- Every strength you name must cite the specific evidence for it (a quote, an answer, a score) — never a flattering guess.
- Every gap needs at least one practiceStep with a concrete, worked example the person can literally copy and practice with today (a sample phrase, a mini-script, a specific free resource) — not just "practice more".
- presentingYourExperience must reference what they actually submitted (their real cover letter or answers) and show a concrete before/after style rewrite using only facts they already gave you — never invent an accomplishment they didn't mention.
- rolesToConsiderNext must follow from strengths you already identified in THIS application, not be generic career advice unrelated to the evidence.
- closing.disclaimer must be exactly this sentence, word for word: "${REQUIRED_DEVELOPMENTAL_DISCLAIMER}"

Return ONLY a JSON object with this exact shape (no markdown, no extra top-level keys):
{
  "summary": {
    "whatHappened": "3-4 warm, plain-English sentences on the outcome for THIS job, citing real numbers where you have them",
    "keyTakeaway": "One clear, memorable sentence — the single most useful thing to understand"
  },
  "whatWentWell": [
    { "strength": "specific strength", "evidence": "the exact quote/answer/score that shows it", "howToUseItNextTime": "how to lean on this in their next application" }
  ],
  "gapsForThisRole": [
    {
      "area": "the specific skill or step (e.g. 'Typing speed', 'Quiz: policy questions')",
      "requirement": "what THIS job's requirements or screening step actually called for",
      "whatWeObserved": "the specific, evidence-based observation — plain language, not clinical",
      "whyItMatters": "why this matters for doing the job day to day",
      "practiceSteps": [
        { "action": "a concrete practice action", "example": "a worked example, script, or sample they can use today" }
      ]
    }
  ],
  "presentingYourExperience": {
    "observation": "how they presented themselves in their cover letter/answers — grounded in what they actually wrote",
    "suggestion": "one concrete, specific way to present their real experience better next time",
    "example": "a short before/after example using ONLY facts already in their submission"
  },
  "practicePlan": {
    "thisWeek": ["specific action for this week", "another"],
    "nextTwoWeeks": ["specific action for the next two weeks", "another"]
  },
  "rolesToConsiderNext": [
    { "roleType": "a role type that fits their demonstrated strengths", "why": "grounded in a strength you identified above, not generic" }
  ],
  "closing": {
    "note": "3-4 warm, genuine sentences referencing something specific from their application",
    "disclaimer": "${REQUIRED_DEVELOPMENTAL_DISCLAIMER}"
  }
}

Include EVERY gap the data supports (not just one), and give whatWentWell at least one real, evidenced entry even for a low score — look for effort, honesty, or a specific good answer.`;

    const userPrompt = `Write this candidate's Improvement Blueprint using ONLY the data below. Do not invent anything not present here.

${applicationContext}

PASSING SCORE FOR THIS JOB: ${passingScore}%
CANDIDATE'S OVERALL SCORE: ${application.ai_score || 0}%
DATA AVAILABLE: ${dataDepth}${dataDepth === 'minimal' ? ' — very little data was captured for this application. Be honest and general where the data is thin rather than inventing specifics, but still give at least one genuinely useful, concrete practice step.' : ''}

Return ONLY the JSON object described in the system prompt.`;

    console.log(`Calling OpenAI (${OPENAI_REPORT_MODEL}) for improvement blueprint...`);

    // callOpenAIJson sends response_format: { type: "json_object" } and
    // max_completion_tokens, strips any stray code fences, and retries on an
    // unparseable/invalid body (validateBlueprintReport) before giving up.
    // No temperature is sent: the gpt-5.x family rejects non-default
    // sampling params.
    let reportData: ImprovementBlueprintData;
    try {
      const { data } = await callOpenAIJson<ImprovementBlueprintData>({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_REPORT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        maxCompletionTokens: 8000, // long, detailed report — reasoning tokens count against this too
        timeoutMs: 120000,
        retries: 3,
        validator: validateBlueprintReport,
      });
      reportData = data;
    } catch (error) {
      const status = openAIErrorStatus(error);
      if (status !== null) {
        console.error('AI API error:', status, error);
        throw new Error(`AI API error: ${status}`);
      }
      console.error('Failed to generate a valid blueprint report:', error);
      throw new Error('Failed to generate improvement blueprint');
    }

    // Add metadata (authoritative, server-side — never trust anything the
    // model returned under a "metadata" key, since it wasn't asked for one).
    reportData.metadata = {
      candidateName: profile?.full_name || 'Candidate',
      jobTitle: jobData?.title || 'Position',
      overallScore: application.ai_score || parsedNotes?.overallScore || 0,
      passingScore,
      generatedAt: new Date().toISOString(),
      applicationId,
      completedPhases,
      dataDepth,
      ...(dataDepth === 'minimal'
        ? { dataDepthMessage: 'Only limited data was captured for this application, so this report is shorter than usual.' }
        : {}),
    };

    console.log('Generated blueprint with phases:', completedPhases);

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

function buildApplicationContext(application: any, parsedNotes: any, profile: any, phaseData: PhaseData, jobData: any): string {
  const sections: string[] = [];

  sections.push(`## Candidate: ${profile?.full_name || 'Unknown'}
- Position: ${jobData?.title || 'Unknown'}
- Status: REJECTED
- AI Score: ${application.ai_score || 0}/100`);

  // The actual job this candidate applied to — every gap named in the
  // report must trace back to something in here, not a generic skill.
  if (jobData) {
    const jobLines = [`\n## This Job's Real Requirements`];
    if (jobData.description) jobLines.push(`Description: ${String(jobData.description).slice(0, 600)}`);
    if (jobData.requirements) jobLines.push(`Requirements: ${String(jobData.requirements).slice(0, 600)}`);
    if (jobData.skills_required?.length) jobLines.push(`Skills required: ${jobData.skills_required.join(', ')}`);
    if (jobData.workflow_steps?.length) {
      const stepNames = jobData.workflow_steps
        .map((s: any) => (typeof s === 'string' ? s : s?.type || s?.name))
        .filter(Boolean);
      if (stepNames.length) jobLines.push(`Actual screening steps used for this job: ${stepNames.join(', ')}`);
    }
    if (jobLines.length > 1) sections.push(jobLines.join('\n'));
  }

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
    sections.push(`\n## Previous Evaluation Notes\n${application.ai_analysis}`);
  }

  return sections.join('\n');
}
