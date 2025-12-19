import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToolCallRequest {
  tool_name: string;
  parameters: Record<string, any>;
  applicationId?: string;
  currentRoute?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const { tool_name, parameters, applicationId, currentRoute } = await req.json() as ToolCallRequest;
    console.log("Tool call:", { tool_name, parameters, userId: user.id, currentRoute });

    let result: any;

    switch (tool_name) {
      case "get_applicant_count": {
        let query = supabaseClient
          .from("applications")
          .select("id, status, phase, job_id, jobs!inner(employer_id)", { count: 'exact' })
          .eq("jobs.employer_id", user.id);

        if (parameters.job_id) {
          query = query.eq("job_id", parameters.job_id);
        }
        if (parameters.status) {
          query = query.eq("status", parameters.status);
        }
        if (parameters.phase) {
          query = query.eq("phase", parameters.phase);
        }

        const { count, error } = await query;
        if (error) throw error;

        result = { count, filters: parameters };
        break;
      }

      case "get_job_stats": {
        let jobsQuery = supabaseClient
          .from("jobs")
          .select("id, title, status")
          .eq("employer_id", user.id);

        if (parameters.job_id) {
          jobsQuery = jobsQuery.eq("id", parameters.job_id);
        }

        const { data: jobs, error: jobsError } = await jobsQuery;
        if (jobsError) throw jobsError;

        const stats = await Promise.all((jobs || []).map(async (job) => {
          const { data: apps } = await supabaseClient
            .from("applications")
            .select("status, phase")
            .eq("job_id", job.id);

          const statusCounts: Record<string, number> = {};
          (apps || []).forEach(app => {
            statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
          });

          return {
            job_id: job.id,
            title: job.title,
            status: job.status,
            total_applicants: apps?.length || 0,
            by_status: statusCounts
          };
        }));

        result = { jobs: stats };
        break;
      }

      case "move_applicant_to_phase": {
        let { application_id, new_phase, new_status } = parameters;

        // Verify the application belongs to this employer and get workflow steps
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, job_id, jobs!inner(employer_id, workflow_steps)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) {
          throw new Error("Application not found or access denied");
        }

        // Normalize the phase name to match actual workflow step IDs
        const workflowSteps = ((app.jobs as any)?.workflow_steps as any[]) || [];
        const allPhases = [
          { id: "application", type: "application", title: "Application" },
          ...workflowSteps.map((s: any) => ({ id: s.id, type: s.type, title: s.title })),
          { id: "review", type: "review", title: "Review" },
          { id: "interview", type: "interview", title: "Interview" },
          { id: "hired", type: "hired", title: "Hired" }
        ];

        // Try to find matching phase by id, type, normalized type, or title
        const normalizedInput = new_phase.toLowerCase().replace(/[\s-]/g, '_');
        const matchedPhase = allPhases.find(p => 
          p.id === new_phase || 
          p.type === new_phase ||
          p.type === normalizedInput ||
          p.id.toLowerCase() === normalizedInput ||
          p.title?.toLowerCase() === new_phase.toLowerCase() ||
          p.title?.toLowerCase().replace(/[\s-]/g, '_') === normalizedInput
        );

        // Use the actual step ID if found, otherwise keep the original
        const normalizedPhase = matchedPhase ? matchedPhase.id : new_phase;
        console.log(`Phase normalization: "${new_phase}" -> "${normalizedPhase}" (matched: ${matchedPhase?.title || 'none'})`);

        const updates: any = { phase: normalizedPhase, updated_at: new Date().toISOString() };
        if (new_status) {
          updates.status = new_status;
        }

        const { error: updateError } = await supabaseClient
          .from("applications")
          .update(updates)
          .eq("id", application_id);

        if (updateError) throw updateError;

        result = { success: true, application_id, new_phase: normalizedPhase, new_status, matched_title: matchedPhase?.title };
        break;
      }

      case "reject_applicant": {
        const { application_id, reason } = parameters;

        // Verify the application belongs to this employer
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, jobs!inner(employer_id)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) {
          throw new Error("Application not found or access denied");
        }

        const updates: any = { 
          status: 'rejected', 
          updated_at: new Date().toISOString() 
        };
        if (reason) {
          updates.employer_notes = reason;
        }

        const { error: updateError } = await supabaseClient
          .from("applications")
          .update(updates)
          .eq("id", application_id);

        if (updateError) throw updateError;

        result = { success: true, application_id, reason };
        break;
      }

      case "get_applicant_details": {
        const { application_id } = parameters;
        
        // Check if application_id is a valid UUID or a name
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = uuidRegex.test(application_id);
        
        let app: any = null;
        
        if (isUuid) {
          // Direct lookup by ID
          const { data, error } = await supabaseClient
            .from("applications")
            .select(`
              id, status, phase, ai_score, notes, created_at, candidate_id,
              jobs!inner(title, employer_id)
            `)
            .eq("id", application_id)
            .eq("jobs.employer_id", user.id)
            .single();
          
          if (!error && data) app = data;
        }
        
        // If not found by UUID or not a UUID, try name-based lookup
        if (!app) {
          // Get all applications for this employer with profile info
          const { data: applications } = await supabaseClient
            .from("applications")
            .select(`
              id, status, phase, ai_score, notes, created_at, candidate_id,
              jobs!inner(title, employer_id)
            `)
            .eq("jobs.employer_id", user.id);
          
          if (applications && applications.length > 0) {
            // Get profiles for all candidates
            const candidateIds = applications.map((a: any) => a.candidate_id);
            const { data: profiles } = await supabaseClient
              .from("profiles")
              .select("user_id, full_name")
              .in("user_id", candidateIds);
            
            // Find matching application by name (case-insensitive)
            const searchName = application_id.toLowerCase();
            for (const application of applications) {
              const profile = profiles?.find((p: any) => p.user_id === application.candidate_id);
              if (profile?.full_name?.toLowerCase().includes(searchName)) {
                app = application;
                break;
              }
            }
          }
        }

        if (!app) {
          throw new Error("Application not found or access denied");
        }

        // Fetch profile separately using candidate_id -> profiles.user_id
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("full_name, email, skills, experience_years")
          .eq("user_id", app.candidate_id)
          .single();

        const appData = app as any;
        const notes = typeof app.notes === 'string' ? JSON.parse(app.notes || '{}') : (app.notes || {});
        
        // Build comprehensive AVA analysis response
        result = {
          application_id: app.id,
          candidate_name: profile?.full_name || 'Unknown',
          job_title: appData.jobs?.title || 'Unknown',
          status: app.status,
          phase: app.phase,
          ai_score: app.ai_score,
          skills: profile?.skills,
          experience: profile?.experience_years,
          applied_at: app.created_at,
          // Include full AVA analysis data
          ava_analysis: {
            phase_analysis: appData.phase_ai_analysis,
            resume_analysis: notes.resumeAnalysis,
            quiz_score: notes.quizAnswers?.score,
            typing_test: notes.typingTestResult,
            chat_simulation: notes.chatSimulationResult,
            sales_simulation: notes.salesSimulationResult,
            chat_interview: notes.chatInterviewResult,
            video_intro_url: notes.videoIntroUrl,
            inconsistencies: notes.inconsistencies,
            credibility_rating: notes.credibilityRating
          }
        };
        break;
      }

      case "open_applicant_page": {
        const { applicant_name } = parameters;
        
        // Get all applications for this employer with profile info
        const { data: applications } = await supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, candidate_id,
            jobs!inner(title, employer_id)
          `)
          .eq("jobs.employer_id", user.id);
        
        if (!applications || applications.length === 0) {
          throw new Error("No applicants found");
        }
        
        // Get profiles for all candidates
        const candidateIds = applications.map((a: any) => a.candidate_id);
        const { data: profiles } = await supabaseClient
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", candidateIds);
        
        // SMART AUTO-SELECT: If only ONE applicant exists, just open them without asking
        if (applications.length === 1) {
          const onlyApp = applications[0];
          const onlyProfile = profiles?.find((p: any) => p.user_id === onlyApp.candidate_id);
          const onlyName = onlyProfile?.full_name || 'your applicant';
          
          result = {
            action: "navigate",
            route: `/applicants/${onlyApp.id}`,
            candidate_name: onlyName,
            application_id: onlyApp.id,
            auto_selected: true,
            message: `Opening ${onlyName}'s profile - they're your only applicant right now.`
          };
          break;
        }
        
        // Find matching application by name (case-insensitive)
        const searchName = applicant_name.toLowerCase();
        let foundApp: any = null;
        let foundName: string = '';
        
        for (const application of applications) {
          const profile = profiles?.find((p: any) => p.user_id === application.candidate_id);
          if (profile?.full_name?.toLowerCase().includes(searchName)) {
            foundApp = application;
            foundName = profile.full_name;
            break;
          }
        }
        
        if (!foundApp) {
          // Provide helpful context about available applicants
          const availableNames = applications.map((a: any) => {
            const p = profiles?.find((p: any) => p.user_id === a.candidate_id);
            return p?.full_name || 'Unknown';
          }).filter(n => n !== 'Unknown');
          
          throw new Error(`Could not find applicant matching "${applicant_name}". You have ${applications.length} applicants: ${availableNames.join(', ')}`);
        }
        
        result = {
          action: "navigate",
          route: `/applicants/${foundApp.id}`,
          candidate_name: foundName,
          application_id: foundApp.id
        };
        break;
      }

      case "list_recent_applicants": {
        const limit = parameters.limit || 5;
        
        let query = supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, created_at, candidate_id,
            jobs!inner(title, employer_id)
          `)
          .eq("jobs.employer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (parameters.job_id) {
          query = query.eq("job_id", parameters.job_id);
        }

        const { data: apps, error } = await query;
        if (error) throw error;

        // Fetch profiles for all candidate_ids
        const candidateIds = (apps || []).map(a => a.candidate_id).filter(Boolean);
        const { data: profiles } = candidateIds.length > 0 
          ? await supabaseClient
              .from("profiles")
              .select("user_id, full_name")
              .in("user_id", candidateIds)
          : { data: [] };

        const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));

        result = {
          applicants: (apps || []).map(app => {
            const appData = app as any;
            return {
              application_id: app.id,
              name: profileMap.get(app.candidate_id) || 'Unknown',
              job: appData.jobs?.title || 'Unknown',
              status: app.status,
              phase: app.phase,
              ai_score: app.ai_score,
              applied: app.created_at
            };
          })
        };
        break;
      }

      case "end_interview": {
        if (!applicationId) {
          throw new Error("Application ID required for interview tools");
        }

        // Merge any previously flagged inconsistencies with final evaluation
        const { data: currentApp } = await supabaseClient
          .from("applications")
          .select("notes")
          .eq("id", applicationId)
          .single();

        const currentNotes = typeof currentApp?.notes === 'string' 
          ? JSON.parse(currentApp?.notes || '{}') 
          : (currentApp?.notes || {});
        
        // Combine flagged inconsistencies with final evaluation inconsistencies
        const allInconsistencies = [
          ...(currentNotes.voiceInterviewInconsistencies || []),
          ...(parameters.inconsistencies || [])
        ];

        const evaluationWithFlags = {
          ...parameters,
          inconsistencies: allInconsistencies,
          interview_notes: currentNotes.voiceInterviewNotes || []
        };

        // Store interview results
        const { error } = await supabaseClient
          .from("applications")
          .update({
            voice_interview_result: evaluationWithFlags,
            phase_ai_analysis: JSON.stringify({
              type: 'voice_interview',
              ...evaluationWithFlags,
              completed_at: new Date().toISOString()
            }),
            updated_at: new Date().toISOString()
          })
          .eq("id", applicationId);

        if (error) throw error;

        result = { success: true, evaluation: evaluationWithFlags };
        break;
      }

      case "flag_inconsistency": {
        // Store inconsistency in application notes for later review
        if (!applicationId) throw new Error("Application ID required");
        
        const { data: app } = await supabaseClient
          .from("applications")
          .select("notes")
          .eq("id", applicationId)
          .single();
        
        const currentNotes = typeof app?.notes === 'string' ? JSON.parse(app?.notes || '{}') : (app?.notes || {});
        const inconsistencies = currentNotes.voiceInterviewInconsistencies || [];
        inconsistencies.push({
          ...parameters,
          flagged_at: new Date().toISOString()
        });
        
        await supabaseClient
          .from("applications")
          .update({ 
            notes: JSON.stringify({ ...currentNotes, voiceInterviewInconsistencies: inconsistencies }),
            updated_at: new Date().toISOString()
          })
          .eq("id", applicationId);
        
        result = { 
          success: true, 
          message: "Inconsistency flagged", 
          follow_up: parameters.follow_up_question 
        };
        break;
      }

      case "take_interview_note": {
        // Store interview note
        if (!applicationId) throw new Error("Application ID required");
        
        const { data: app } = await supabaseClient
          .from("applications")
          .select("notes")
          .eq("id", applicationId)
          .single();
        
        const currentNotes = typeof app?.notes === 'string' ? JSON.parse(app?.notes || '{}') : (app?.notes || {});
        const interviewNotes = currentNotes.voiceInterviewNotes || [];
        interviewNotes.push({
          ...parameters,
          noted_at: new Date().toISOString()
        });
        
        await supabaseClient
          .from("applications")
          .update({ 
            notes: JSON.stringify({ ...currentNotes, voiceInterviewNotes: interviewNotes }),
            updated_at: new Date().toISOString()
          })
          .eq("id", applicationId);
        
        result = { success: true, message: "Note recorded" };
        break;
      }

      case "navigate_to_page": {
        const { page, entity_id } = parameters;
        
        // Map page names to routes
        const pageRoutes: Record<string, string> = {
          "dashboard": "/dashboard",
          "jobs": "/jobs",
          "create_job": "/jobs/create",
          "applicants": "/applicants",
          "interviews": "/interviews",
          "messages": "/messages",
          "documents": "/documents",
          "team": "/team",
          "analytics": "/analytics",
          "settings": "/settings",
          "notifications": "/notifications"
        };
        
        let route = pageRoutes[page.toLowerCase()];
        
        // Handle entity-specific routes
        if (page === "applicant" && entity_id) {
          route = `/applicants/${entity_id}`;
        } else if (page === "job" && entity_id) {
          route = `/jobs/edit/${entity_id}`;
        }
        
        if (!route) {
          throw new Error(`Unknown page: ${page}`);
        }
        
        result = { 
          success: true, 
          action: "navigate", 
          route,
          page 
        };
        break;
      }

      case "walkthrough_navigate": {
        const { step } = parameters;
        
        const walkthroughPages = [
          { route: "/dashboard", name: "Dashboard", description: "This is your dashboard. Here you get a quick overview of all your active jobs and recent applicants. You can see how many people have applied and click into any job to check on the pipeline." },
          { route: "/jobs", name: "Jobs", description: "Here's where all your job postings live. You can see your active jobs, drafts, and closed positions. Click on any job to view its applicants or edit the details." },
          { route: "/jobs/create", name: "Create Job", description: "This is where you create new job postings. You fill out the basics, then I'll generate a smart hiring workflow with phases like quizzes and video intros. And hey, you can actually create jobs just by talking to me!" },
          { route: "/applicants", name: "Applicants", description: "All your applicants show up here. You can filter by job, see their status and scores, and drag them through the hiring phases. This is where you'll spend a lot of time reviewing candidates." },
          { route: "/messages", name: "Messages", description: "Your messaging center for communicating with candidates. You can chat with anyone who's applied to your jobs, and I can send messages for you too, just ask!" },
          { route: "/documents", name: "Documents", description: "Send and track hiring documents like offer letters and NDAs. The AI generates them based on the job and candidate info, they sign, you countersign, and there's a full audit trail for compliance." },
          { route: "/analytics", name: "Analytics", description: "Check out your hiring analytics and insights here. See your funnel, where candidates drop off, and how your jobs are performing. Pretty useful for optimizing your process!" }
        ];
        
        const currentStep = step || 1;
        const pageIndex = currentStep - 1;
        
        if (pageIndex < 0 || pageIndex >= walkthroughPages.length) {
          result = { 
            completed: true, 
            message: "That's the tour! You've seen all the main areas. Feel free to ask me anything or tell me what you'd like to do!" 
          };
          break;
        }
        
        const page = walkthroughPages[pageIndex];
        result = {
          action: "walkthrough_step",
          route: page.route,
          step: currentStep,
          totalSteps: walkthroughPages.length,
          pageName: page.name,
          whatToSay: page.description,
          nextStep: currentStep + 1,
          isLast: currentStep === walkthroughPages.length
        };
        break;
      }

      case "send_message": {
        const { application_id, message_content } = parameters;

        // Get application and candidate info
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("candidate_id, jobs!inner(employer_id)")
          .eq("id", application_id)
          .single();

        if (appError || !app) {
          throw new Error("Application not found");
        }

        // Verify the employer owns this application
        if ((app.jobs as any).employer_id !== user.id) {
          throw new Error("Access denied");
        }

        // Insert message
        const { error: msgError } = await supabaseClient
          .from("messages")
          .insert({
            sender_id: user.id,
            receiver_id: app.candidate_id,
            application_id: application_id,
            content: message_content,
          });

        if (msgError) throw msgError;

        result = { 
          success: true, 
          message: "Message sent successfully",
          to_application: application_id 
        };
        break;
      }

      case "create_job_interactive": {
        const { action, field, value } = parameters;
        
        if (action === "start") {
          result = {
            action: "navigate_and_prepare",
            route: "/jobs/create",
            message: "Opening the job creation form. Tell me the job title to get started!"
          };
        } else if (action === "fill_field") {
          result = {
            action: "fill_field",
            field: field,
            value: value,
            message: `Got it, filling in ${field}`
          };
        } else if (action === "next_step") {
          result = {
            action: "navigate_step",
            step: 1,
            message: "Moving to the next step"
          };
        } else if (action === "previous_step") {
          result = {
            action: "navigate_step",
            step: -1,
            message: "Going back to the previous step"
          };
        } else if (action === "generate_workflow") {
          result = {
            action: "trigger_generate",
            target: "workflow",
            message: "Generating the AI workflow for this job"
          };
        } else if (action === "generate_content") {
          result = {
            action: "trigger_generate",
            target: "full_job",
            message: "Generating the full job content"
          };
        } else if (action === "publish") {
          result = {
            action: "submit",
            status: "published",
            message: "Publishing the job now!"
          };
        } else if (action === "save_draft") {
          result = {
            action: "submit",
            status: "draft",
            message: "Saving as draft"
          };
        }
        break;
      }

      case "schedule_interview": {
        const { application_id, date_time, duration_minutes = 60, send_notification = true } = parameters;
        
        // Parse date_time - handle natural language
        let scheduledDate: Date;
        const now = new Date();
        const lowerTime = date_time.toLowerCase();
        
        if (lowerTime.includes('tomorrow')) {
          scheduledDate = new Date(now);
          scheduledDate.setDate(scheduledDate.getDate() + 1);
          // Parse time like "10am", "2pm", "10:30am"
          const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            if (timeMatch[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
            if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
            scheduledDate.setHours(hours, minutes, 0, 0);
          } else {
            scheduledDate.setHours(10, 0, 0, 0); // Default to 10am
          }
        } else if (lowerTime.includes('next')) {
          // Handle "next tuesday", "next monday", etc.
          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayMatch = days.findIndex(d => lowerTime.includes(d));
          if (dayMatch !== -1) {
            scheduledDate = new Date(now);
            const currentDay = now.getDay();
            let daysToAdd = dayMatch - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7;
            scheduledDate.setDate(scheduledDate.getDate() + daysToAdd);
          } else {
            scheduledDate = new Date(now);
            scheduledDate.setDate(scheduledDate.getDate() + 1);
          }
          // Parse time
          const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            if (timeMatch[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
            if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
            scheduledDate.setHours(hours, minutes, 0, 0);
          } else {
            scheduledDate.setHours(10, 0, 0, 0);
          }
        } else {
          // Try ISO format or other
          scheduledDate = new Date(date_time);
          if (isNaN(scheduledDate.getTime())) {
            // Fallback: tomorrow 10am
            scheduledDate = new Date(now);
            scheduledDate.setDate(scheduledDate.getDate() + 1);
            scheduledDate.setHours(10, 0, 0, 0);
          }
        }

        // Get application and candidate info
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select(`
            id, candidate_id, 
            jobs!inner(id, title, employer_id)
          `)
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) {
          throw new Error("Application not found or access denied");
        }

        // Get candidate profile
        const { data: candidateProfile } = await supabaseClient
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", app.candidate_id)
          .single();

        // Get employer profile
        const { data: employerProfile } = await supabaseClient
          .from("profiles")
          .select("full_name, company_name")
          .eq("user_id", user.id)
          .single();

        // Try to create Google Calendar event if tokens available
        let meetLink: string | null = null;
        let calendarEventId: string | null = null;
        
        // Check if we have Google tokens in localStorage (passed via request context or stored)
        const googleRefreshToken = parameters.google_refresh_token;
        
        if (googleRefreshToken) {
          try {
            // Create calendar event via google-calendar edge function
            const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
            const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
            
            const endDate = new Date(scheduledDate.getTime() + duration_minutes * 60000);
            
            const calResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`
              },
              body: JSON.stringify({
                action: "create_event",
                access_token: parameters.google_access_token,
                refresh_token: googleRefreshToken,
                event: {
                  summary: `Interview: ${candidateProfile?.full_name || 'Candidate'} for ${(app.jobs as any).title}`,
                  description: `Interview with ${candidateProfile?.full_name || 'candidate'} for the ${(app.jobs as any).title} position at ${employerProfile?.company_name || 'Company'}`,
                  start: scheduledDate.toISOString(),
                  end: endDate.toISOString(),
                  attendees: candidateProfile?.email ? [candidateProfile.email] : []
                },
                createMeetLink: true
              })
            });
            
            if (calResponse.ok) {
              const calResult = await calResponse.json();
              meetLink = calResult.meetLink || null;
              calendarEventId = calResult.eventId || null;
              console.log("Created calendar event with Meet link:", meetLink);
            }
          } catch (calError) {
            console.error("Failed to create calendar event:", calError);
            // Continue without calendar event
          }
        }

        // Create interview record in database
        const { data: interview, error: interviewError } = await supabaseClient
          .from("interviews")
          .insert({
            application_id: application_id,
            scheduled_at: scheduledDate.toISOString(),
            duration_minutes: duration_minutes,
            meeting_link: meetLink,
            interview_type: 'video',
            status: 'scheduled',
            notes: `Scheduled by AVA Voice Assistant`
          })
          .select()
          .single();

        if (interviewError) {
          console.error("Failed to create interview:", interviewError);
          throw new Error("Failed to create interview record");
        }

        // Update application status to interview
        await supabaseClient
          .from("applications")
          .update({ 
            status: 'interview', 
            phase: 'interview',
            updated_at: new Date().toISOString() 
          })
          .eq("id", application_id);

        // Send notification to candidate if requested
        if (send_notification && candidateProfile?.email) {
          try {
            await supabaseClient
              .from("notifications")
              .insert({
                user_id: app.candidate_id,
                type: 'interview',
                title: 'Interview Scheduled',
                message: `Your interview for ${(app.jobs as any).title} has been scheduled for ${scheduledDate.toLocaleString()}`,
                link: `/applications/${application_id}`
              });
          } catch (notifError) {
            console.error("Failed to send notification:", notifError);
          }
        }

        const formattedDate = scheduledDate.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        result = {
          success: true,
          interview_id: interview?.id,
          scheduled_at: scheduledDate.toISOString(),
          formatted_date: formattedDate,
          duration_minutes: duration_minutes,
          candidate_name: candidateProfile?.full_name || 'Candidate',
          job_title: (app.jobs as any).title,
          meet_link: meetLink,
          calendar_event_created: !!calendarEventId,
          message: meetLink 
            ? `Interview scheduled for ${formattedDate} with ${candidateProfile?.full_name || 'the candidate'}. Meet link created.`
            : `Interview scheduled for ${formattedDate} with ${candidateProfile?.full_name || 'the candidate'}.`
        };
        break;
      }

      case "shortlist_applicant": {
        const { application_id, reason } = parameters;

        // Verify access
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, notes, jobs!inner(employer_id)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) throw new Error("Application not found or access denied");

        const currentNotes = typeof app.notes === 'string' ? JSON.parse(app.notes || '{}') : (app.notes || {});
        currentNotes.shortlisted = true;
        currentNotes.shortlisted_at = new Date().toISOString();
        currentNotes.shortlist_reason = reason || 'Added by voice assistant';

        await supabaseClient
          .from("applications")
          .update({ 
            notes: JSON.stringify(currentNotes),
            updated_at: new Date().toISOString()
          })
          .eq("id", application_id);

        result = { success: true, message: "Added to shortlist" };
        break;
      }

      case "mark_as_top_candidate": {
        const { application_id, reason } = parameters;

        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, notes, jobs!inner(employer_id)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) throw new Error("Application not found or access denied");

        const currentNotes = typeof app.notes === 'string' ? JSON.parse(app.notes || '{}') : (app.notes || {});
        currentNotes.top_candidate = true;
        currentNotes.top_candidate_at = new Date().toISOString();
        currentNotes.top_candidate_reason = reason;

        await supabaseClient
          .from("applications")
          .update({ 
            notes: JSON.stringify(currentNotes),
            updated_at: new Date().toISOString()
          })
          .eq("id", application_id);

        result = { success: true, message: "Marked as top candidate" };
        break;
      }

      case "add_applicant_note": {
        const { application_id, note_content } = parameters;

        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, employer_notes, jobs!inner(employer_id)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) throw new Error("Application not found or access denied");

        const existingNotes = app.employer_notes || '';
        const timestamp = new Date().toLocaleString();
        const newNote = existingNotes 
          ? `${existingNotes}\n\n[${timestamp} - Ava] ${note_content}`
          : `[${timestamp} - Ava] ${note_content}`;

        await supabaseClient
          .from("applications")
          .update({ 
            employer_notes: newNote,
            updated_at: new Date().toISOString()
          })
          .eq("id", application_id);

        result = { success: true, message: "Note added" };
        break;
      }

      case "get_pipeline_summary": {
        const { job_id } = parameters;

        let query = supabaseClient
          .from("applications")
          .select("id, status, phase, ai_score, jobs!inner(id, title, employer_id)")
          .eq("jobs.employer_id", user.id);

        if (job_id) {
          query = query.eq("job_id", job_id);
        }

        const { data: apps, error } = await query;
        if (error) throw error;

        const summary: Record<string, { total: number, byStatus: Record<string, number>, avgScore: number }> = {};
        
        (apps || []).forEach((app: any) => {
          const jobTitle = app.jobs?.title || 'Unknown';
          if (!summary[jobTitle]) {
            summary[jobTitle] = { total: 0, byStatus: {}, avgScore: 0 };
          }
          summary[jobTitle].total++;
          summary[jobTitle].byStatus[app.status] = (summary[jobTitle].byStatus[app.status] || 0) + 1;
          if (app.ai_score) {
            summary[jobTitle].avgScore = (summary[jobTitle].avgScore * (summary[jobTitle].total - 1) + app.ai_score) / summary[jobTitle].total;
          }
        });

        result = { 
          summary,
          total_applicants: apps?.length || 0,
          message: `You have ${apps?.length || 0} applicants across ${Object.keys(summary).length} jobs`
        };
        break;
      }

      case "get_todays_interviews": {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const { data: interviews, error } = await supabaseClient
          .from("interviews")
          .select(`
            id, scheduled_at, duration_minutes, meeting_link, status,
            applications!inner(id, candidate_id, jobs!inner(title, employer_id))
          `)
          .eq("applications.jobs.employer_id", user.id)
          .gte("scheduled_at", startOfDay.toISOString())
          .lt("scheduled_at", endOfDay.toISOString())
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true });

        if (error) throw error;

        // Get candidate names
        const candidateIds = (interviews || []).map((i: any) => i.applications?.candidate_id).filter(Boolean);
        const { data: profiles } = candidateIds.length > 0
          ? await supabaseClient.from("profiles").select("user_id, full_name").in("user_id", candidateIds)
          : { data: [] };
        
        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

        const formattedInterviews = (interviews || []).map((interview: any) => ({
          id: interview.id,
          time: new Date(interview.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          candidate: profileMap.get(interview.applications?.candidate_id) || 'Unknown',
          job: interview.applications?.jobs?.title || 'Unknown',
          has_meet_link: !!interview.meeting_link
        }));

        result = {
          interviews: formattedInterviews,
          count: formattedInterviews.length,
          message: formattedInterviews.length === 0 
            ? "No interviews scheduled for today"
            : `You have ${formattedInterviews.length} interview${formattedInterviews.length > 1 ? 's' : ''} today`
        };
        break;
      }

      case "get_unread_messages": {
        const { data: messages, error } = await supabaseClient
          .from("messages")
          .select("id, content, sender_id, created_at, application_id")
          .eq("receiver_id", user.id)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) throw error;

        // Get sender names
        const senderIds = (messages || []).map(m => m.sender_id);
        const { data: profiles } = senderIds.length > 0
          ? await supabaseClient.from("profiles").select("user_id, full_name").in("user_id", senderIds)
          : { data: [] };
        
        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

        const formattedMessages = (messages || []).map(msg => ({
          from: profileMap.get(msg.sender_id) || 'Unknown',
          preview: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
          time: new Date(msg.created_at).toLocaleString()
        }));

        result = {
          messages: formattedMessages,
          count: messages?.length || 0,
          message: messages?.length === 0 
            ? "No unread messages" 
            : `You have ${messages?.length} unread message${messages?.length > 1 ? 's' : ''}`
        };
        break;
      }

      case "get_pending_actions": {
        // Get applications needing review
        const { data: pendingApps } = await supabaseClient
          .from("applications")
          .select("id, status, phase, jobs!inner(title, employer_id)")
          .eq("jobs.employer_id", user.id)
          .eq("status", "pending")
          .limit(5);

        // Get unread messages count
        const { count: unreadCount } = await supabaseClient
          .from("messages")
          .select("id", { count: 'exact', head: true })
          .eq("receiver_id", user.id)
          .eq("is_read", false);

        // Get pending documents
        const { count: pendingDocs } = await supabaseClient
          .from("documents")
          .select("id", { count: 'exact', head: true })
          .eq("sender_id", user.id)
          .eq("status", "pending");

        // Get today's interviews
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const { count: todayInterviews } = await supabaseClient
          .from("interviews")
          .select("id", { count: 'exact', head: true })
          .gte("scheduled_at", startOfDay.toISOString())
          .lt("scheduled_at", endOfDay.toISOString())
          .eq("status", "scheduled");

        const actions = [];
        if (pendingApps && pendingApps.length > 0) {
          actions.push(`${pendingApps.length} applications to review`);
        }
        if (unreadCount && unreadCount > 0) {
          actions.push(`${unreadCount} unread messages`);
        }
        if (pendingDocs && pendingDocs > 0) {
          actions.push(`${pendingDocs} documents awaiting signature`);
        }
        if (todayInterviews && todayInterviews > 0) {
          actions.push(`${todayInterviews} interviews today`);
        }

        result = {
          pending_applications: pendingApps?.length || 0,
          unread_messages: unreadCount || 0,
          pending_documents: pendingDocs || 0,
          todays_interviews: todayInterviews || 0,
          actions,
          message: actions.length === 0 
            ? "All caught up! No pending actions" 
            : `You have: ${actions.join(', ')}`
        };
        break;
      }

      case "bulk_reject": {
        const { job_id, max_score, reason } = parameters;

        // Find applicants below the score threshold
        let query = supabaseClient
          .from("applications")
          .select("id, ai_score, jobs!inner(employer_id)")
          .eq("jobs.employer_id", user.id)
          .eq("status", "pending");

        if (job_id) {
          query = query.eq("job_id", job_id);
        }
        if (max_score) {
          query = query.lte("ai_score", max_score);
        }

        const { data: apps, error } = await query;
        if (error) throw error;

        if (!apps || apps.length === 0) {
          result = { success: true, count: 0, message: "No applicants match the criteria" };
          break;
        }

        // Reject all matching applicants
        const ids = apps.map(a => a.id);
        await supabaseClient
          .from("applications")
          .update({ 
            status: 'rejected',
            employer_notes: reason || 'Bulk rejected by voice assistant',
            updated_at: new Date().toISOString()
          })
          .in("id", ids);

        result = { 
          success: true, 
          count: ids.length, 
          message: `Rejected ${ids.length} applicant${ids.length > 1 ? 's' : ''}` 
        };
        break;
      }

      case "pause_job": {
        const { job_id } = parameters;

        const { error } = await supabaseClient
          .from("jobs")
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq("id", job_id)
          .eq("employer_id", user.id);

        if (error) throw error;

        result = { success: true, message: "Job paused - no longer accepting applications" };
        break;
      }

      case "unpause_job": {
        const { job_id } = parameters;

        const { error } = await supabaseClient
          .from("jobs")
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq("id", job_id)
          .eq("employer_id", user.id);

        if (error) throw error;

        result = { success: true, message: "Job is live again" };
        break;
      }

      case "archive_job": {
        const { job_id } = parameters;

        const { error } = await supabaseClient
          .from("jobs")
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq("id", job_id)
          .eq("employer_id", user.id);

        if (error) throw error;

        result = { success: true, message: "Job archived" };
        break;
      }

      case "reschedule_interview": {
        const { interview_id, new_date_time } = parameters;

        // Parse the new date
        let scheduledDate = new Date(new_date_time);
        if (isNaN(scheduledDate.getTime())) {
          // Try parsing natural language
          const now = new Date();
          const lowerTime = new_date_time.toLowerCase();
          
          if (lowerTime.includes('tomorrow')) {
            scheduledDate = new Date(now);
            scheduledDate.setDate(scheduledDate.getDate() + 1);
            const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              if (timeMatch[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
              if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
              scheduledDate.setHours(hours, minutes, 0, 0);
            } else {
              scheduledDate.setHours(10, 0, 0, 0);
            }
          } else {
            scheduledDate = new Date(now);
            scheduledDate.setDate(scheduledDate.getDate() + 1);
            scheduledDate.setHours(10, 0, 0, 0);
          }
        }

        const { error } = await supabaseClient
          .from("interviews")
          .update({ 
            scheduled_at: scheduledDate.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", interview_id);

        if (error) throw error;

        const formattedDate = scheduledDate.toLocaleString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true
        });

        result = { success: true, message: `Interview rescheduled to ${formattedDate}` };
        break;
      }

      case "cancel_interview": {
        const { interview_id, reason } = parameters;

        const { error } = await supabaseClient
          .from("interviews")
          .update({ 
            status: 'cancelled',
            notes: reason ? `Cancelled: ${reason}` : 'Cancelled by voice assistant',
            updated_at: new Date().toISOString()
          })
          .eq("id", interview_id);

        if (error) throw error;

        result = { success: true, message: "Interview cancelled" };
        break;
      }

      case "compare_applicants": {
        const { application_ids } = parameters;

        if (!application_ids || application_ids.length < 2) {
          throw new Error("Need at least 2 applicants to compare");
        }

        const { data: apps, error } = await supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, notes, candidate_id,
            jobs!inner(title, employer_id)
          `)
          .in("id", application_ids)
          .eq("jobs.employer_id", user.id);

        if (error) throw error;

        // Get profiles
        const candidateIds = (apps || []).map(a => a.candidate_id);
        const { data: profiles } = await supabaseClient
          .from("profiles")
          .select("user_id, full_name, skills, experience_years")
          .in("user_id", candidateIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        const comparison = (apps || []).map(app => {
          const profile = profileMap.get(app.candidate_id);
          const notes = typeof app.notes === 'string' ? JSON.parse(app.notes || '{}') : (app.notes || {});
          return {
            name: profile?.full_name || 'Unknown',
            ai_score: app.ai_score,
            experience: profile?.experience_years,
            skills: profile?.skills,
            status: app.status,
            typing_wpm: notes.typingTestResult?.wpm,
            quiz_score: notes.quizScore,
            chat_score: notes.chatSimulationResult?.score,
            sales_score: notes.salesSimulationResult?.overallScore
          };
        });

        result = {
          comparison,
          count: comparison.length,
          summary: comparison.map(c => `${c.name}: Score ${c.ai_score || 'N/A'}, ${c.experience || '?'} years exp`).join(' vs ')
        };
        break;
      }

      case "send_offer": {
        const { application_id } = parameters;

        // Update application status to offered
        const { data: app, error: appError } = await supabaseClient
          .from("applications")
          .select("id, candidate_id, jobs!inner(title, employer_id)")
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (appError || !app) throw new Error("Application not found");

        await supabaseClient
          .from("applications")
          .update({ status: 'offered', updated_at: new Date().toISOString() })
          .eq("id", application_id);

        // Send notification
        await supabaseClient
          .from("notifications")
          .insert({
            user_id: app.candidate_id,
            type: 'status_update',
            title: 'Offer Extended!',
            message: `Congratulations! You've received an offer for ${(app.jobs as any).title}.`,
            link: `/applications/${application_id}`
          });

        result = { 
          success: true, 
          action: "navigate",
          route: "/documents",
          message: "Status updated to 'Offered'. Opening Documents to send offer letter." 
        };
        break;
      }

      case "get_team_activity": {
        // Get recent team actions from notifications and updates
        const { data: recentApps } = await supabaseClient
          .from("applications")
          .select("id, status, phase, updated_at, jobs!inner(title, employer_id)")
          .eq("jobs.employer_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(10);

        const activities = (recentApps || []).map(app => ({
          action: `Application ${app.status}`,
          job: (app as any).jobs?.title,
          time: new Date(app.updated_at).toLocaleString()
        }));

        result = {
          activities,
          count: activities.length,
          message: `${activities.length} recent activities`
        };
        break;
      }

      case "duplicate_job": {
        const { job_id } = parameters;

        const { data: job, error: jobError } = await supabaseClient
          .from("jobs")
          .select("*")
          .eq("id", job_id)
          .eq("employer_id", user.id)
          .single();

        if (jobError || !job) throw new Error("Job not found");

        // Create duplicate with "(Copy)" suffix
        const { id, created_at, updated_at, job_code, ...jobData } = job;
        const { data: newJob, error: insertError } = await supabaseClient
          .from("jobs")
          .insert({
            ...jobData,
            title: `${job.title} (Copy)`,
            status: 'draft'
          })
          .select()
          .single();

        if (insertError) throw insertError;

        result = { 
          success: true, 
          new_job_id: newJob.id,
          action: "navigate",
          route: `/jobs/edit/${newJob.id}`,
          message: `Job duplicated as "${newJob.title}"` 
        };
        break;
      }

      case "describe_current_view": {
        // Get comprehensive context based on where the user currently is
        const route = currentRoute || '/dashboard';
        console.log("Describing current view for route:", route);
        
        // Get general stats that apply to any page
        const { data: jobs } = await supabaseClient
          .from("jobs")
          .select("id, title, status")
          .eq("employer_id", user.id);
        
        const { data: allApps } = await supabaseClient
          .from("applications")
          .select("id, status, phase, ai_score, created_at, job_id, jobs!inner(employer_id)")
          .eq("jobs.employer_id", user.id);
        
        const activeJobs = jobs?.filter(j => j.status === 'published') || [];
        const totalApplicants = allApps?.length || 0;
        
        // Calculate pipeline breakdown
        const statusCounts: Record<string, number> = {};
        const phaseCounts: Record<string, number> = {};
        (allApps || []).forEach(app => {
          statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
          if (app.phase) {
            phaseCounts[app.phase] = (phaseCounts[app.phase] || 0) + 1;
          }
        });
        
        // Calculate pipeline efficiency (hired / total excluding pending)
        const hired = statusCounts['hired'] || 0;
        const reviewable = totalApplicants - (statusCounts['pending'] || 0);
        const pipelineEfficiency = reviewable > 0 ? Math.round((hired / reviewable) * 100) : 0;
        
        // Get recent activity
        const recentApps = (allApps || [])
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);
        
        // Get pending actions
        const inReview = statusCounts['reviewing'] || 0;
        const pendingInterviews = (allApps || []).filter(a => a.phase === 'interview' && a.status !== 'hired' && a.status !== 'rejected').length;
        
        // Get unread messages count
        const { count: unreadMessages } = await supabaseClient
          .from("messages")
          .select("id", { count: 'exact' })
          .eq("receiver_id", user.id)
          .eq("is_read", false);
        
        // Get today's interviews
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const { data: todaysInterviews } = await supabaseClient
          .from("interviews")
          .select("id, scheduled_at, application_id")
          .gte("scheduled_at", today.toISOString())
          .lt("scheduled_at", tomorrow.toISOString())
          .eq("status", "scheduled");
        
        // Build context based on specific page
        let pageSpecificContext = "";
        
        if (route === '/dashboard') {
          pageSpecificContext = "User is on the Dashboard - show overview of their hiring activity";
        } else if (route === '/jobs') {
          pageSpecificContext = `User is viewing the Jobs list. They have ${jobs?.length || 0} total jobs (${activeJobs.length} active).`;
        } else if (route === '/applicants') {
          pageSpecificContext = `User is viewing all Applicants. ${totalApplicants} total candidates across all jobs.`;
        } else if (route.startsWith('/applicants/')) {
          pageSpecificContext = "User is viewing a specific applicant's details. Use the currentApplicantContext from the session.";
        } else if (route === '/messages') {
          pageSpecificContext = `User is in Messages. ${unreadMessages || 0} unread messages.`;
        } else if (route === '/analytics') {
          pageSpecificContext = "User is viewing Analytics - hiring metrics and trends.";
        } else if (route === '/interviews') {
          pageSpecificContext = `User is viewing Interviews. ${todaysInterviews?.length || 0} interviews scheduled for today.`;
        } else if (route === '/documents') {
          pageSpecificContext = "User is viewing Documents - contracts and signing workflows.";
        } else if (route === '/team') {
          pageSpecificContext = "User is viewing their Team members and permissions.";
        } else if (route === '/settings') {
          pageSpecificContext = "User is in Settings - account and preferences.";
        }
        
        result = {
          currentRoute: route,
          pageContext: pageSpecificContext,
          overview: {
            activeJobs: activeJobs.length,
            activeJobTitles: activeJobs.map(j => j.title),
            totalApplicants,
            pipelineEfficiency: `${pipelineEfficiency}%`,
            statusBreakdown: statusCounts,
            phaseBreakdown: phaseCounts
          },
          pendingActions: {
            applicantsInReview: inReview,
            pendingInterviews,
            unreadMessages: unreadMessages || 0,
            todaysInterviews: todaysInterviews?.length || 0
          },
          recentApplicants: recentApps.length,
          suggestions: []
        };
        
        // Add contextual suggestions
        if (inReview > 0) {
          result.suggestions.push(`${inReview} applicant${inReview > 1 ? 's' : ''} waiting in review`);
        }
        if ((unreadMessages || 0) > 0) {
          result.suggestions.push(`${unreadMessages} unread message${(unreadMessages || 0) > 1 ? 's' : ''}`);
        }
        if ((todaysInterviews?.length || 0) > 0) {
          result.suggestions.push(`${todaysInterviews?.length} interview${(todaysInterviews?.length || 0) > 1 ? 's' : ''} scheduled for today`);
        }
        
        break;
      }

      default:
        throw new Error(`Unknown tool: ${tool_name}`);
    }

    console.log("Tool result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Tool call error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
