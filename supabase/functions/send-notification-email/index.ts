import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const baseStyles = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `;

  const headerStyles = (gradient: string) => `
    background: ${gradient};
    padding: 30px;
    border-radius: 12px 12px 0 0;
  `;

  const bodyStyles = `
    background: #1a1a1a;
    padding: 30px;
    border-radius: 0 0 12px 12px;
    color: #e5e5e5;
  `;

  const buttonStyles = `
    display: inline-block;
    background: #10b981;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    margin-top: 20px;
  `;

  const cardStyles = `
    background: #262626;
    padding: 16px;
    border-radius: 8px;
    margin: 20px 0;
  `;

  const templates: Record<NotificationType, { subject: string; html: string }> = {
    new_application: {
      subject: `New Application: ${data.candidate_name} applied for ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">📥 New Application Received</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has applied for the 
              <strong style="color: #10b981;">${data.job_title}</strong> position.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              Review their application in your HireFlow dashboard.
            </p>
            <a href="https://hireflow.lovable.app/applicants" style="${buttonStyles}">
              View Application
            </a>
          </div>
        </div>
      `,
    },
    application_received: {
      subject: `Application Submitted: ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">✅ Application Submitted!</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Your application for <strong style="color: #10b981;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #10b981;">${data.company_name}</strong>` : ''} 
              has been successfully submitted.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">What's Next?</p>
              <p style="color: #e5e5e5; margin: 0; font-size: 14px;">The employer will review your application and get back to you. You can track your application status in your HireFlow dashboard.</p>
            </div>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles}">
              Track Application
            </a>
          </div>
        </div>
      `,
    },
    phase_advanced: {
      subject: `Update: You've been moved to ${data.phase_name} for ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎯 Application Update</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Great news! Your application for <strong style="color: #10b981;">${data.job_title}</strong> 
              ${data.company_name ? `at <strong style="color: #10b981;">${data.company_name}</strong>` : ''} 
              has been moved to the next phase.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Current Phase</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">${data.phase_name}</p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Log in to your HireFlow account to continue with the next steps.
            </p>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles}">
              Continue Application
            </a>
          </div>
        </div>
      `,
    },
    new_message: {
      subject: `New message from ${data.sender_name}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">💬 New Message</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              You have a new message from <strong style="color: #6366f1;">${data.sender_name}</strong>
              ${data.job_title ? ` regarding <strong style="color: #6366f1;">${data.job_title}</strong>` : ''}.
            </p>
            ${data.message_preview ? `
              <div style="${cardStyles} border-left: 3px solid #6366f1;">
                <p style="color: #e5e5e5; margin: 0; font-style: italic;">"${data.message_preview}..."</p>
              </div>
            ` : ''}
            <a href="https://hireflow.lovable.app/messages" style="${buttonStyles.replace('#10b981', '#6366f1')}">
              View Message
            </a>
          </div>
        </div>
      `,
    },
    interview_scheduled: {
      subject: `🎉 Interview Scheduled: ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Interview Scheduled!</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Your interview for <strong style="color: #10b981;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #10b981;">${data.company_name}</strong>` : ''} 
              has been scheduled.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">📅 Date & Time</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">
                ${data.interview_date} at ${data.interview_time}
              </p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Check your HireFlow dashboard for meeting details and to confirm your attendance.
            </p>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles}">
              View Interview Details
            </a>
          </div>
        </div>
      `,
    },
    interview_cancelled: {
      subject: `Interview Cancelled: ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #ef4444 0%, #dc2626 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Interview Cancelled</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Unfortunately, your interview for <strong style="color: #ef4444;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #ef4444;">${data.company_name}</strong>` : ''} 
              has been cancelled.
            </p>
            ${data.original_date ? `
              <div style="${cardStyles}">
                <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Original Date</p>
                <p style="color: #ef4444; margin: 0; font-size: 16px; text-decoration: line-through;">${data.original_date}</p>
              </div>
            ` : ''}
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">What's Next?</p>
              <p style="color: #e5e5e5; margin: 0; font-size: 14px;">Check your messages for updates from the employer. They may reach out to reschedule.</p>
            </div>
            <a href="https://hireflow.lovable.app/messages" style="${buttonStyles.replace('#10b981', '#6366f1')}">
              Check Messages
            </a>
          </div>
        </div>
      `,
    },
    interview_rescheduled: {
      subject: `Interview Rescheduled: ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #f59e0b 0%, #d97706 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔄 Interview Rescheduled</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Your interview for <strong style="color: #f59e0b;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #f59e0b;">${data.company_name}</strong>` : ''} 
              has been rescheduled.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">📅 New Date & Time</p>
              <p style="color: #f59e0b; margin: 0; font-size: 18px; font-weight: 600;">
                ${data.new_date} at ${data.new_time}
              </p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Please confirm your availability for the new time in your HireFlow dashboard.
            </p>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles.replace('#10b981', '#f59e0b')}">
              Confirm New Time
            </a>
          </div>
        </div>
      `,
    },
    interview_reminder: {
      subject: `Reminder: Interview Tomorrow - ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Interview Reminder</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              This is a friendly reminder about your upcoming interview for 
              <strong style="color: #8b5cf6;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #8b5cf6;">${data.company_name}</strong>` : ''}.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">📅 Scheduled For</p>
              <p style="color: #8b5cf6; margin: 0; font-size: 18px; font-weight: 600;">
                ${data.interview_date} at ${data.interview_time}
              </p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Make sure you're prepared and have the meeting link ready!
            </p>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles.replace('#10b981', '#8b5cf6')}">
              View Details
            </a>
          </div>
        </div>
      `,
    },
    document_sent: {
      subject: `Document to Sign: ${data.document_name}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">📄 Document Awaiting Signature</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              ${data.company_name ? `<strong style="color: #10b981;">${data.company_name}</strong> has` : 'You have'} 
              sent you a document to review and sign.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Document</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">${data.document_name}</p>
            </div>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles}">
              Review & Sign Document
            </a>
          </div>
        </div>
      `,
    },
    document_signed: {
      subject: `✅ Document Signed: ${data.document_name}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">✅ Document Signed</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has signed the document 
              <strong style="color: #10b981;">${data.document_name}</strong>.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              The document is now awaiting your countersignature.
            </p>
            <a href="https://hireflow.lovable.app/documents" style="${buttonStyles}">
              View Document
            </a>
          </div>
        </div>
      `,
    },
    document_requested: {
      subject: `Document Requested: ${data.document_name || 'New Document'}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #f59e0b 0%, #d97706 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">📋 Document Requested</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              ${data.company_name ? `<strong style="color: #f59e0b;">${data.company_name}</strong>` : 'The employer'} 
              has requested you to upload a document.
            </p>
            ${data.document_name ? `
              <div style="${cardStyles}">
                <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Document Type</p>
                <p style="color: #f59e0b; margin: 0; font-size: 18px; font-weight: 600;">${data.document_name}</p>
              </div>
            ` : ''}
            <p style="color: #a3a3a3; font-size: 14px;">
              Please upload the requested document in your HireFlow dashboard.
            </p>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles.replace('#10b981', '#f59e0b')}">
              Upload Document
            </a>
          </div>
        </div>
      `,
    },
    phase_completed: {
      subject: `Phase Completed: ${data.candidate_name} finished ${data.phase_name}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">✓ Phase Completed</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has completed the 
              <strong style="color: #10b981;">${data.phase_name}</strong> phase for 
              <strong style="color: #10b981;">${data.job_title}</strong>.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              Review their submission and decide on next steps.
            </p>
            <a href="https://hireflow.lovable.app/applicants" style="${buttonStyles}">
              Review Submission
            </a>
          </div>
        </div>
      `,
    },
    status_rejected: {
      subject: `Application Update: ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #6b7280 0%, #4b5563 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">Application Update</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              Thank you for your interest in the <strong style="color: #e5e5e5;">${data.job_title}</strong> position
              ${data.company_name ? ` at <strong style="color: #e5e5e5;">${data.company_name}</strong>` : ''}.
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
              After careful consideration, we've decided to move forward with other candidates whose experience more closely matches our current needs.
            </p>
            <div style="${cardStyles}">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">What's Next?</p>
              <p style="color: #e5e5e5; margin: 0; font-size: 14px;">Download your personalized feedback report to see how you can improve for future applications.</p>
            </div>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles.replace('#10b981', '#6366f1')}">
              View Feedback
            </a>
          </div>
        </div>
      `,
    },
    status_hired: {
      subject: `🎉 Congratulations! You're Hired - ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #10b981 0%, #059669 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Congratulations!</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 18px; line-height: 1.6; font-weight: 600;">
              You've been selected for the <strong style="color: #10b981;">${data.job_title}</strong> position
              ${data.company_name ? ` at <strong style="color: #10b981;">${data.company_name}</strong>` : ''}!
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
              We're excited to have you join the team. Please check your messages and documents for next steps.
            </p>
            <div style="${cardStyles}">
              <p style="color: #10b981; margin: 0; font-size: 16px; font-weight: 600;">Welcome aboard! 🚀</p>
            </div>
            <a href="https://hireflow.lovable.app/applications" style="${buttonStyles}">
              View Details
            </a>
          </div>
        </div>
      `,
    },
    reschedule_requested: {
      subject: `Reschedule Request: ${data.candidate_name} for ${data.job_title}`,
      html: `
        <div style="${baseStyles}">
          <div style="${headerStyles('linear-gradient(135deg, #f59e0b 0%, #d97706 100%)')}">
            <h1 style="color: white; margin: 0; font-size: 24px;">📅 Reschedule Requested</h1>
          </div>
          <div style="${bodyStyles}">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #f59e0b;">${data.candidate_name}</strong> has requested to reschedule their interview for 
              <strong style="color: #f59e0b;">${data.job_title}</strong>.
            </p>
            ${data.candidate_note ? `
              <div style="${cardStyles}">
                <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Candidate's Note</p>
                <p style="color: #e5e5e5; margin: 0; font-size: 14px; font-style: italic;">"${data.candidate_note}"</p>
              </div>
            ` : ''}
            ${data.proposed_times ? `
              <div style="${cardStyles}">
                <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Proposed Times</p>
                <p style="color: #e5e5e5; margin: 0; font-size: 14px;">${data.proposed_times}</p>
              </div>
            ` : ''}
            <p style="color: #a3a3a3; font-size: 14px;">
              Review the request and either approve a new time or decline.
            </p>
            <a href="https://hireflow.lovable.app/interviews" style="${buttonStyles.replace('#10b981', '#f59e0b')}">
              Review Request
            </a>
          </div>
        </div>
      `,
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

    console.log(`Processing ${type} notification for user ${recipient_user_id}`);

    // Get user's email and preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, email_notifications_enabled, email_new_applications, email_messages, email_interview_reminders, email_document_updates, email_phase_updates")
      .eq("user_id", recipient_user_id)
      .single();

    if (profileError || !profile) {
      console.error("Failed to fetch profile:", profileError);
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if notifications are enabled
    if (!profile.email_notifications_enabled) {
      console.log("Email notifications disabled for user");
      return new Response(
        JSON.stringify({ message: "Email notifications disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check specific preference
    const preferenceField = getPreferenceField(type) as keyof typeof profile;
    if (profile[preferenceField] === false) {
      console.log(`${type} notifications disabled for user`);
      return new Response(
        JSON.stringify({ message: `${type} notifications disabled` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailContent = getEmailContent(type, data);

    console.log(`Sending email to ${profile.email}`);

    const emailResponse = await resend.emails.send({
      from: "HireFlow <notifications@hireflownow.com>",
      to: [profile.email],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending notification email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
