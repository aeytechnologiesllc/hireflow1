import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Dynamic base URL - derives from Supabase project
const getAppBaseUrl = (): string => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // Extract project ref from supabase URL (e.g., https://xyz.supabase.co -> xyz)
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (match) {
    return `https://${match[1]}.lovable.app`;
  }
  // Fallback
  return "https://hireflownow.com";
};

type NotificationType = 
  | "new_application"
  | "phase_advanced"
  | "new_message"
  | "interview_scheduled"
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
  | "reschedule_requested";

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
    candidate_note?: string;
  };
}

const getEmailContent = (type: NotificationType, data: NotificationRequest["data"]) => {
  const baseUrl = getAppBaseUrl();
  
  // Simple, clean template wrapper
  const wrapEmail = (title: string, content: string, buttonText?: string, buttonUrl?: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #111; margin-bottom: 20px;">${title}</h2>
      ${content}
      ${buttonText && buttonUrl ? `
        <p style="margin-top: 24px;">
          <a href="${buttonUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">${buttonText}</a>
        </p>
      ` : ''}
      <p style="color: #666; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        — The HireFlow Team
      </p>
    </div>
  `;

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
        `${baseUrl}/applications`
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
        `${baseUrl}/applications`
      ),
    },
    
    // CANDIDATE-FACING
    new_message: {
      subject: `New message regarding your application${data.job_title ? `: ${data.job_title}` : ''}`,
      html: wrapEmail(
        "New Message",
        `<p>You have a new message from the hiring team${data.job_title ? ` regarding <strong>${data.job_title}</strong>` : ''}.</p>
         ${data.message_preview ? `<p style="color: #666; font-style: italic; border-left: 3px solid #ddd; padding-left: 12px;">"${data.message_preview}..."</p>` : ''}`,
        "View Message",
        `${baseUrl}/messages`
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
        `${baseUrl}/applications`
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
        `${baseUrl}/messages`
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
        `${baseUrl}/applications`
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
        `${baseUrl}/applications`
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
        `${baseUrl}/applications`
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
        `${baseUrl}/applications`
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
    
    // CANDIDATE-FACING
    status_rejected: {
      subject: `Application Update: ${data.job_title}`,
      html: wrapEmail(
        "Application Update",
        `<p>Thank you for your interest in the <strong>${data.job_title}</strong> position.</p>
         <p style="color: #666;">After careful consideration, the hiring team has decided to move forward with other candidates whose experience more closely matches their current needs.</p>
         <p style="color: #666;">Download your personalized feedback report to see how you can improve for future applications.</p>`,
        "View Feedback",
        `${baseUrl}/applications`
      ),
    },
    
    // CANDIDATE-FACING
    status_hired: {
      subject: `Congratulations! You're Hired - ${data.job_title}`,
      html: wrapEmail(
        "Congratulations!",
        `<p>You've been selected for the <strong>${data.job_title}</strong> position!</p>
         <p style="color: #666;">We're excited to welcome you aboard. Please check your messages and documents for next steps.</p>`,
        "View Details",
        `${baseUrl}/applications`
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
  };
  return mapping[type];
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { type, recipient_user_id, data }: NotificationRequest = await req.json();

    console.log(`[send-notification-email] Processing ${type} notification for user ${recipient_user_id}`);
    console.log(`[send-notification-email] Data:`, JSON.stringify(data));
    console.log(`[send-notification-email] Base URL:`, getAppBaseUrl());

    // Get user's email and preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, email_notifications_enabled, email_new_applications, email_messages, email_interview_reminders, email_document_updates, email_phase_updates")
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

    const emailContent = getEmailContent(type, data);

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
