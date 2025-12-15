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

    const { tool_name, parameters, applicationId } = await req.json() as ToolCallRequest;
    console.log("Tool call:", { tool_name, parameters, userId: user.id });

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
        const { application_id, new_phase, new_status } = parameters;

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

        const updates: any = { phase: new_phase, updated_at: new Date().toISOString() };
        if (new_status) {
          updates.status = new_status;
        }

        const { error: updateError } = await supabaseClient
          .from("applications")
          .update(updates)
          .eq("id", application_id);

        if (updateError) throw updateError;

        result = { success: true, application_id, new_phase, new_status };
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

        const { data: app, error } = await supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, notes, created_at,
            jobs!inner(title, employer_id),
            profiles:candidate_id(full_name, email, skills, experience_years)
          `)
          .eq("id", application_id)
          .eq("jobs.employer_id", user.id)
          .single();

        if (error || !app) {
          throw new Error("Application not found or access denied");
        }

        const appData = app as any;
        result = {
          application_id: app.id,
          candidate_name: appData.profiles?.full_name || 'Unknown',
          job_title: appData.jobs?.title || 'Unknown',
          status: app.status,
          phase: app.phase,
          ai_score: app.ai_score,
          skills: appData.profiles?.skills,
          experience: appData.profiles?.experience_years,
          applied_at: app.created_at
        };
        break;
      }

      case "list_recent_applicants": {
        const limit = parameters.limit || 5;
        
        let query = supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, created_at,
            jobs!inner(title, employer_id),
            profiles:candidate_id(full_name)
          `)
          .eq("jobs.employer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (parameters.job_id) {
          query = query.eq("job_id", parameters.job_id);
        }

        const { data: apps, error } = await query;
        if (error) throw error;

        result = {
          applicants: (apps || []).map(app => {
            const appData = app as any;
            return {
              application_id: app.id,
              name: appData.profiles?.full_name || 'Unknown',
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

        // Store interview results
        const { error } = await supabaseClient
          .from("applications")
          .update({
            voice_interview_result: parameters,
            phase_ai_analysis: JSON.stringify({
              type: 'voice_interview',
              ...parameters,
              completed_at: new Date().toISOString()
            }),
            updated_at: new Date().toISOString()
          })
          .eq("id", applicationId);

        if (error) throw error;

        result = { success: true, evaluation: parameters };
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
