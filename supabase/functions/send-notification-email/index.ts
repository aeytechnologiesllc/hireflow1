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
  | "document_sent"
  | "document_signed"
  | "phase_completed";

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
    document_name?: string;
    message_preview?: string;
    company_name?: string;
  };
}

const getEmailContent = (type: NotificationType, data: NotificationRequest["data"]) => {
  const templates: Record<NotificationType, { subject: string; html: string }> = {
    new_application: {
      subject: `New Application: ${data.candidate_name} applied for ${data.job_title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Application Received</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has applied for the 
              <strong style="color: #10b981;">${data.job_title}</strong> position.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              Review their application in your HireFlow dashboard.
            </p>
            <a href="https://hireflow.lovable.app/applicants" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              View Application
            </a>
          </div>
        </div>
      `,
    },
    phase_advanced: {
      subject: `Update: You've been moved to ${data.phase_name} for ${data.job_title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Application Update</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              Great news! Your application for <strong style="color: #10b981;">${data.job_title}</strong> 
              ${data.company_name ? `at <strong style="color: #10b981;">${data.company_name}</strong>` : ''} 
              has been moved to the next phase.
            </p>
            <div style="background: #262626; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Current Phase</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">${data.phase_name}</p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Log in to your HireFlow account to continue with the next steps.
            </p>
            <a href="https://hireflow.lovable.app/applications" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              Continue Application
            </a>
          </div>
        </div>
      `,
    },
    new_message: {
      subject: `New message from ${data.sender_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Message</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              You have a new message from <strong style="color: #10b981;">${data.sender_name}</strong>
              ${data.job_title ? ` regarding <strong style="color: #10b981;">${data.job_title}</strong>` : ''}.
            </p>
            ${data.message_preview ? `
              <div style="background: #262626; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 3px solid #10b981;">
                <p style="color: #e5e5e5; margin: 0; font-style: italic;">"${data.message_preview}..."</p>
              </div>
            ` : ''}
            <a href="https://hireflow.lovable.app/messages" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              View Message
            </a>
          </div>
        </div>
      `,
    },
    interview_scheduled: {
      subject: `Interview Scheduled: ${data.job_title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Interview Scheduled</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              Your interview for <strong style="color: #10b981;">${data.job_title}</strong>
              ${data.company_name ? ` at <strong style="color: #10b981;">${data.company_name}</strong>` : ''} 
              has been scheduled.
            </p>
            <div style="background: #262626; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Date & Time</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">
                ${data.interview_date} at ${data.interview_time}
              </p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              Check your HireFlow dashboard for meeting details.
            </p>
            <a href="https://hireflow.lovable.app/interviews" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              View Interview Details
            </a>
          </div>
        </div>
      `,
    },
    document_sent: {
      subject: `Document to Sign: ${data.document_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Document Awaiting Signature</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              ${data.company_name ? `<strong style="color: #10b981;">${data.company_name}</strong> has` : 'You have'} 
              sent you a document to review and sign.
            </p>
            <div style="background: #262626; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Document</p>
              <p style="color: #10b981; margin: 0; font-size: 18px; font-weight: 600;">${data.document_name}</p>
            </div>
            <a href="https://hireflow.lovable.app/documents" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              Review & Sign Document
            </a>
          </div>
        </div>
      `,
    },
    document_signed: {
      subject: `Document Signed: ${data.document_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Document Signed</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has signed the document 
              <strong style="color: #10b981;">${data.document_name}</strong>.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              The document is now awaiting your countersignature.
            </p>
            <a href="https://hireflow.lovable.app/documents" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              View Document
            </a>
          </div>
        </div>
      `,
    },
    phase_completed: {
      subject: `Phase Completed: ${data.candidate_name} finished ${data.phase_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Phase Completed</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 12px 12px; color: #e5e5e5;">
            <p style="font-size: 16px; line-height: 1.6;">
              <strong style="color: #10b981;">${data.candidate_name}</strong> has completed the 
              <strong style="color: #10b981;">${data.phase_name}</strong> phase for 
              <strong style="color: #10b981;">${data.job_title}</strong>.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              Review their submission and decide on next steps.
            </p>
            <a href="https://hireflow.lovable.app/applicants" 
               style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              Review Submission
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
    phase_advanced: "email_phase_updates",
    new_message: "email_messages",
    interview_scheduled: "email_interview_reminders",
    document_sent: "email_document_updates",
    document_signed: "email_document_updates",
    phase_completed: "email_phase_updates",
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
      from: "HireFlow <onboarding@resend.dev>",
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
