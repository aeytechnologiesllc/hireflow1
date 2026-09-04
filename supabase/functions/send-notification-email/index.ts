import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Production base URL - uses APP_BASE_URL env variable with defensive protocol validation
const getAppBaseUrl = (): string => {
  let appBaseUrl = Deno.env.get("APP_BASE_URL");
  if (appBaseUrl) {
    // Remove trailing slash if present
    appBaseUrl = appBaseUrl.replace(/\/$/, '');
    // Defensive: ensure protocol is present (auto-prepend https:// if missing)
    if (!appBaseUrl.startsWith('http://') && !appBaseUrl.startsWith('https://')) {
      console.warn(`[send-notification-email] APP_BASE_URL missing protocol, auto-prepending https:// to: ${appBaseUrl}`);
      appBaseUrl = `https://${appBaseUrl}`;
    }
    return appBaseUrl;
  }
  // Fallback to production domain
  return "https://hireflownow.com";
};

type NotificationType = 
  | "new_application"
  | "phase_advanced"
  | "new_message"
  | "interview_scheduled"
  | "interview_pick_time"
  | "interview_cancelled"
  | "interview_rescheduled"
  | "interview_reminder"
  | "document_sent"
  | "document_signed"
  | "document_requested"
  | "phase_completed"
  | "status_rejected"
  | "status_hired"
  | "application_received"
  | "reschedule_requested"
  | "voice_minutes_low"
  | "voice_minutes_exhausted"
  | "interview_ready";

interface NotificationRequest {
  type: NotificationType;
  recipient_user_id: string;
  data: {
    candidate_name?: string;
    job_title?: string;
    phase_name?: string;
    sender_name?: string;
    interview_date?: string;
    interview_time?: string;
    original_date?: string;
    new_date?: string;
    new_time?: string;
    document_name?: string;
    message_preview?: string;
    company_name?: string;
    rejection_reason?: string;
    proposed_times?: string;
    proposed_times_list?: string[];
    window_count?: string;
    candidate_note?: string;
    minutes_remaining?: string;
    active_jobs_count?: string;
    score?: string;
    /** new_message: the sender's user id, for the employer's thread deep link. */
    sender_id?: string;
    /** new_message: skips the role lookup when the caller already knows. */
    recipient_role?: RecipientRole;
  };
}

type RecipientRole = "employer" | "candidate" | "team_member";

const getEmailContent = (
  type: NotificationType,
  data: NotificationRequest["data"],
  recipientRole: RecipientRole = "candidate",
) => {
  const baseUrl = getAppBaseUrl();

  // Every candidate-facing link goes through candidate sign-in with the real
  // destination as a redirect. A bare /applications link sent a signed-out
  // candidate to the EMPLOYER login page; CandidateAuth honours a safe
  // `redirect` param and routes an already-signed-in candidate straight through.
  const candidateLink = (path: string) =>
    `${baseUrl}/candidate/auth?redirect=${encodeURIComponent(path)}`;

  // Simple, clean template wrapper. `signature` lets a message that comes from
  // the employer (a decision on an application) sign as the employer.
  const wrapEmail = (title: string, content: string, buttonText?: string, buttonUrl?: string, signature = "— The HireFlow Team") => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #111; margin-bottom: 20px;">${title}</h2>
      ${content}
      ${buttonText && buttonUrl ? `
        <p style="margin-top: 24px;">
          <a href="${buttonUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">${buttonText}</a>
        </p>
      ` : ''}
      <p style="color: #666; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        ${signature}
      </p>
    </div>
  `;

  const companyName = data.company_name?.trim() || "";
  const teamLabel = companyName ? `The ${companyName} team` : "The hiring team";

  const templates: Record<NotificationType, { subject: string; html: string }> = {
    // EMPLOYER-FACING
    new_application: {
      subject: `New Application: ${data.candidate_name} applied for ${data.job_title}`,
      html: wrapEmail(
        "New Application Received",
        `<p><strong>${data.candidate_name}</strong> has applied for the <strong>${data.job_title}</strong> position.</p>
         <p style="color: #666;">Review their application in your dashboard.</p>`,
        "View Application",
        `${baseUrl}/applicants`
      ),
    },
    
    // CANDIDATE-FACING
    application_received: {
      subject: `Application Submitted: ${data.job_title}`,
      html: wrapEmail(
        "Application Submitted",
        `<p>Your application for <strong>${data.job_title}</strong> has been successfully submitted.</p>
         <p style="color: #666;">The hiring team will review your application and get back to you. You can track your application status in your dashboard.</p>`,
        "Track Application",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    phase_advanced: {
      subject: `Update: You've been moved to ${data.phase_name} for ${data.job_title}`,
      html: wrapEmail(
        "Application Update",
        `<p>Great news! Your application for <strong>${data.job_title}</strong> has been moved to the next phase.</p>
         <p><strong>Current Phase:</strong> ${data.phase_name}</p>
         <p style="color: #666;">Log in to continue with the next steps.</p>`,
        "Continue Application",
        candidateLink("/applications")
      ),
    },
    
    // BOTH SIDES — the copy and the link depend on who is receiving it. An
    // employer used to get "a new message from the hiring team" (they ARE the
    // hiring team) with a candidate sign-in link.
    new_message: recipientRole === "candidate"
      ? {
          subject: `New message regarding your application${data.job_title ? `: ${data.job_title}` : ''}`,
          html: wrapEmail(
            "New Message",
            `<p>You have a new message from the hiring team${data.job_title ? ` regarding <strong>${data.job_title}</strong>` : ''}.</p>
             ${data.message_preview ? `<p style="color: #666; font-style: italic; border-left: 3px solid #ddd; padding-left: 12px;">"${data.message_preview}..."</p>` : ''}`,
            "View Message",
            candidateLink("/messages")
          ),
        }
      : {
          subject: `New message from ${data.sender_name || "a candidate"}${data.job_title ? ` — ${data.job_title}` : ''}`,
          html: wrapEmail(
            `New message from ${data.sender_name || "a candidate"}`,
            `<p><strong>${data.sender_name || "A candidate"}</strong> sent you a message${data.job_title ? ` about <strong>${data.job_title}</strong>` : ''}.</p>
             ${data.message_preview ? `<p style="color: #666; font-style: italic; border-left: 3px solid #ddd; padding-left: 12px;">"${data.message_preview}..."</p>` : ''}`,
            "Reply",
            data.sender_id
              ? `${baseUrl}/messages?candidate=${encodeURIComponent(data.sender_id)}`
              : `${baseUrl}/messages`
          ),
        },
    
    // CANDIDATE-FACING
    interview_scheduled: {
      subject: `Interview Scheduled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Scheduled",
        `<p>Your interview for <strong>${data.job_title}</strong> has been scheduled.</p>
         <p><strong>Date:</strong> ${data.interview_date}<br><strong>Time:</strong> ${data.interview_time}</p>
         <p style="color: #666;">Check your dashboard for meeting details.</p>`,
        "View Interview Details",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    interview_pick_time: {
      subject: `Pick a time for your interview — ${data.job_title}`,
      html: wrapEmail(
        "Pick a Time for Your Interview",
        `<p>The hiring team for <strong>${data.job_title}</strong> has proposed ${data.window_count || "a few"} time${data.window_count === "1" ? "" : "s"} for your interview. Pick whichever works best for you:</p>
         ${
           data.proposed_times_list && data.proposed_times_list.length > 0
             ? `<ul style="color: #333; padding-left: 20px; margin: 16px 0;">
                 ${data.proposed_times_list.map((t) => `<li style="margin-bottom: 6px;">${t}</li>`).join("")}
               </ul>`
             : ""
         }
         <p style="color: #666;">Head to your application to choose a time — it only takes a second.</p>`,
        "Pick a Time",
        candidateLink("/applications")
      ),
    },

    // CANDIDATE-FACING
    interview_cancelled: {
      subject: `Interview Cancelled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Cancelled",
        `<p>Unfortunately, your interview for <strong>${data.job_title}</strong> has been cancelled.</p>
         ${data.original_date ? `<p style="color: #666;">Original date: ${data.original_date}</p>` : ''}
         <p style="color: #666;">Check your messages for updates from the hiring team.</p>`,
        "Check Messages",
        candidateLink("/messages")
      ),
    },
    
    // CANDIDATE-FACING
    interview_rescheduled: {
      subject: `Interview Rescheduled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Rescheduled",
        `<p>Your interview for <strong>${data.job_title}</strong> has been rescheduled.</p>
         <p><strong>New Date:</strong> ${data.new_date}<br><strong>New Time:</strong> ${data.new_time}</p>
         <p style="color: #666;">Please confirm your availability.</p>`,
        "Confirm New Time",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    interview_reminder: {
      subject: `Reminder: Interview Tomorrow - ${data.job_title}`,
      html: wrapEmail(
        "Interview Reminder",
        `<p>This is a friendly reminder about your upcoming interview for <strong>${data.job_title}</strong>.</p>
         <p><strong>Date:</strong> ${data.interview_date}<br><strong>Time:</strong> ${data.interview_time}</p>
         <p style="color: #666;">Make sure you're prepared and have the meeting link ready!</p>`,
        "View Details",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    document_sent: {
      subject: `Document to Sign: ${data.document_name}`,
      html: wrapEmail(
        "Document Awaiting Signature",
        `<p>The hiring team has sent you a document to review and sign.</p>
         <p><strong>Document:</strong> ${data.document_name}</p>`,
        "Review & Sign",
        candidateLink("/applications")
      ),
    },
    
    // EMPLOYER-FACING
    document_signed: {
      subject: `Document Signed: ${data.document_name}`,
      html: wrapEmail(
        "Document Signed",
        `<p><strong>${data.candidate_name}</strong> has signed the document <strong>${data.document_name}</strong>.</p>
         <p style="color: #666;">The document is now awaiting your countersignature.</p>`,
        "View Document",
        `${baseUrl}/documents`
      ),
    },
    
    // CANDIDATE-FACING
    document_requested: {
      subject: `Document Requested: ${data.document_name || 'New Document'}`,
      html: wrapEmail(
        "Document Requested",
        `<p>The hiring team has requested you to upload a document.</p>
         ${data.document_name ? `<p><strong>Document Type:</strong> ${data.document_name}</p>` : ''}
         <p style="color: #666;">Please upload the requested document in your dashboard.</p>`,
        "Upload Document",
        candidateLink("/applications")
      ),
    },
    
    // EMPLOYER-FACING
    phase_completed: {
      subject: `Phase Completed: ${data.candidate_name} finished ${data.phase_name}`,
      html: wrapEmail(
        "Phase Completed",
        `<p><strong>${data.candidate_name}</strong> has completed the <strong>${data.phase_name}</strong> phase for <strong>${data.job_title}</strong>.</p>
         <p style="color: #666;">Review their submission and decide on next steps.</p>`,
        "Review Submission",
        `${baseUrl}/applicants`
      ),
    },
    
    // CANDIDATE-FACING — a decision, so it comes from the employer, not from
    // HireFlow. Short and warm; no "feedback report" (there is nothing to
    // download), and no mention of how the decision was reached.
    status_rejected: {
      subject: `An update on your ${data.job_title} application`,
      html: wrapEmail(
        `An update from ${companyName || "the hiring team"}`,
        `<p>Thank you for applying for the <strong>${data.job_title}</strong> role${companyName ? ` at ${companyName}` : ''}, and for the time you put into it.</p>
         <p style="color: #666;">We've decided to move forward with other candidates this time. We're grateful you considered us, and we wish you the very best in your search.</p>`,
        "View your applications",
        candidateLink("/applications"),
        `— ${teamLabel}`
      ),
    },
    
    // CANDIDATE-FACING — also from the employer.
    status_hired: {
      subject: `Welcome aboard — ${data.job_title}`,
      html: wrapEmail(
        `You've got the job${companyName ? ` at ${companyName}` : ''}`,
        `<p>We'd like to offer you the <strong>${data.job_title}</strong> role. Congratulations.</p>
         <p style="color: #666;">We'll follow up with your start date and next steps. Your messages and any documents to sign are in your HireFlow account.</p>`,
        "Open your application",
        candidateLink("/applications"),
        `— ${teamLabel}`
      ),
    },
    
    // EMPLOYER-FACING
    reschedule_requested: {
      subject: `Reschedule Request: ${data.candidate_name} for ${data.job_title}`,
      html: wrapEmail(
        "Reschedule Requested",
        `<p><strong>${data.candidate_name}</strong> has requested to reschedule their interview for <strong>${data.job_title}</strong>.</p>
         ${data.candidate_note ? `<p style="color: #666;"><strong>Candidate's note:</strong> "${data.candidate_note}"</p>` : ''}
         ${data.proposed_times ? `<p><strong>Proposed times:</strong> ${data.proposed_times}</p>` : ''}
         <p style="color: #666;">Review the request and either approve a new time or decline.</p>`,
        "Review Request",
        `${baseUrl}/interviews`
      ),
    },
    
    // EMPLOYER-FACING - Voice Minutes
    voice_minutes_low: {
      subject: `Low Voice Minutes: Only ${data.minutes_remaining} minutes remaining`,
      html: wrapEmail(
        "Voice Minutes Running Low",
        `<p>Your voice minutes are running low. You have <strong>${data.minutes_remaining} minutes</strong> remaining.</p>
         ${parseInt(data.active_jobs_count || '0') > 0 ? `<p style="color: #666;">You have <strong>${data.active_jobs_count} active job${parseInt(data.active_jobs_count || '0') > 1 ? 's' : ''}</strong> that may be affected if you run out of minutes.</p>` : ''}
         <p style="color: #666;">Purchase more voice minutes to ensure uninterrupted AI voice interviews for your candidates.</p>`,
        "Purchase Voice Minutes",
        `${baseUrl}/settings?tab=subscription`
      ),
    },
    
    voice_minutes_exhausted: {
      subject: `Action Required: Voice Minutes Exhausted`,
      html: wrapEmail(
        "Voice Minutes Exhausted",
        `<p style="color: #dc2626;"><strong>Your voice minutes have been depleted.</strong></p>
         ${parseInt(data.active_jobs_count || '0') > 0 ? `<p>Candidates applying to your <strong>${data.active_jobs_count} active job${parseInt(data.active_jobs_count || '0') > 1 ? 's' : ''}</strong> cannot complete AI voice interviews until you purchase more minutes.</p>` : '<p>Candidates cannot complete AI voice interviews until you purchase more minutes.</p>'}
         <p style="color: #666;">Purchase more voice minutes immediately to restore AI voice interview functionality.</p>`,
        "Purchase Voice Minutes Now",
        `${baseUrl}/settings?tab=subscription`
      ),
    },
    
    // EMPLOYER-FACING - Interview Ready
    interview_ready: {
      subject: `Ready for Interview: ${data.candidate_name} scored ${data.score}% for ${data.job_title}`,
      html: wrapEmail(
        "Candidate Ready for AIVA Interview",
        `<p><strong>${data.candidate_name}</strong> has passed all automated assessments for <strong>${data.job_title}</strong> with a score of <strong>${data.score}%</strong>.</p>
         <p style="color: #666;">They are now ready for the AIVA voice interview. You'll need to manually move them to the interview phase and configure the interview settings.</p>`,
        "Review Candidate",
        `${baseUrl}/applicants`
      ),
    },
  };

  return templates[type];
};

const getPreferenceField = (type: NotificationType): string => {
  const mapping: Record<NotificationType, string> = {
    new_application: "email_new_applications",
    application_received: "email_phase_updates",
    phase_advanced: "email_phase_updates",
    new_message: "email_messages",
    interview_scheduled: "email_interview_reminders",
    interview_pick_time: "email_interview_reminders",
    interview_cancelled: "email_interview_reminders",
    interview_rescheduled: "email_interview_reminders",
    interview_reminder: "email_interview_reminders",
    document_sent: "email_document_updates",
    document_signed: "email_document_updates",
    document_requested: "email_document_updates",
    phase_completed: "email_phase_updates",
    status_rejected: "email_phase_updates",
    status_hired: "email_phase_updates",
    reschedule_requested: "email_interview_reminders",
    voice_minutes_low: "email_voice_minutes",
    voice_minutes_exhausted: "email_voice_minutes",
    interview_ready: "email_new_applications", // Uses new_applications pref since it's about new candidates
  };
  return mapping[type];
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!resend) {
      console.warn("[send-notification-email] RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "Email service not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { type, recipient_user_id, data }: NotificationRequest = await req.json();

    // Only new_message reads differently per side; look the role up once, and
    // only when the caller did not say. Default to the candidate copy, which is
    // the safer failure: an employer reading candidate copy is odd, a candidate
    // reading employer copy ("New message from <their own name>") is wrong.
    let recipientRole: RecipientRole = data?.recipient_role ?? "candidate";
    if (type === "new_message" && !data?.recipient_role) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", recipient_user_id);
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
      if (roles.includes("employer")) recipientRole = "employer";
      else if (roles.includes("team_member")) recipientRole = "team_member";
      else recipientRole = "candidate";
    }

    console.log(`[send-notification-email] Processing ${type} notification for user ${recipient_user_id}`);
    console.log(`[send-notification-email] Data:`, JSON.stringify(data));
    console.log(`[send-notification-email] Base URL:`, getAppBaseUrl());

    // Get user's email and preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, email_notifications_enabled, email_new_applications, email_messages, email_interview_reminders, email_document_updates, email_phase_updates, email_voice_minutes")
      .eq("user_id", recipient_user_id)
      .single();

    if (profileError || !profile) {
      console.error(`[send-notification-email] Failed to fetch profile for user ${recipient_user_id}:`, profileError);
      return new Response(
        JSON.stringify({ error: "User profile not found", details: profileError }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-notification-email] Found profile for ${profile.email}, notifications_enabled: ${profile.email_notifications_enabled}`);

    // Check if notifications are enabled
    if (!profile.email_notifications_enabled) {
      console.log(`[send-notification-email] Email notifications globally disabled for ${profile.email}`);
      return new Response(
        JSON.stringify({ message: "Email notifications disabled", email: profile.email }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check specific preference
    const preferenceField = getPreferenceField(type) as keyof typeof profile;
    const preferenceValue = profile[preferenceField];
    console.log(`[send-notification-email] Checking preference ${preferenceField} = ${preferenceValue}`);
    
    if (preferenceValue === false) {
      console.log(`[send-notification-email] ${type} notifications disabled for ${profile.email} (${preferenceField} = false)`);
      return new Response(
        JSON.stringify({ message: `${type} notifications disabled`, preference: preferenceField }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailContent = getEmailContent(type, data, recipientRole);

    console.log(`[send-notification-email] Sending email to ${profile.email} with subject: ${emailContent.subject}`);

    const emailResponse = await resend.emails.send({
      from: "HireFlow <notifications@hireflownow.com>",
      to: [profile.email],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log(`[send-notification-email] Email sent successfully to ${profile.email}:`, JSON.stringify(emailResponse));

    return new Response(
      JSON.stringify({ success: true, emailResponse, recipient: profile.email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-notification-email] Error sending notification email:", error);
    console.error("[send-notification-email] Error stack:", error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
