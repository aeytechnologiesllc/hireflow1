import { supabase } from "@/integrations/supabase/client";

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

interface NotificationData {
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
}

async function sendNotificationEmail(
  type: NotificationType,
  recipientUserId: string,
  data: NotificationData
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        type,
        recipient_user_id: recipientUserId,
        data,
      },
    });

    if (error) {
      console.error("Failed to send notification email:", error);
    }
  } catch (err) {
    console.error("Error invoking send-notification-email:", err);
  }
}

// ============ EMPLOYER NOTIFICATIONS ============

/**
 * Notify employer when a new application is received
 */
export async function notifyNewApplication(
  employerId: string,
  candidateName: string,
  jobTitle: string
): Promise<void> {
  await sendNotificationEmail("new_application", employerId, {
    candidate_name: candidateName,
    job_title: jobTitle,
  });
}

/**
 * Notify employer when a candidate completes a phase
 */
export async function notifyPhaseCompleted(
  employerId: string,
  candidateName: string,
  phaseName: string,
  jobTitle: string
): Promise<void> {
  await sendNotificationEmail("phase_completed", employerId, {
    candidate_name: candidateName,
    phase_name: phaseName,
    job_title: jobTitle,
  });
}

/**
 * Notify employer when a document is signed by candidate
 */
export async function notifyDocumentSigned(
  employerId: string,
  candidateName: string,
  documentName: string
): Promise<void> {
  await sendNotificationEmail("document_signed", employerId, {
    candidate_name: candidateName,
    document_name: documentName,
  });
}

/**
 * Notify employer when candidate requests reschedule
 */
export async function notifyRescheduleRequested(
  employerId: string,
  candidateName: string,
  jobTitle: string,
  candidateNote?: string,
  proposedTimes?: string
): Promise<void> {
  await sendNotificationEmail("reschedule_requested", employerId, {
    candidate_name: candidateName,
    job_title: jobTitle,
    candidate_note: candidateNote,
    proposed_times: proposedTimes,
  });
}

// ============ CANDIDATE NOTIFICATIONS ============

/**
 * Notify candidate that their application was received
 */
export async function notifyApplicationReceived(
  candidateId: string,
  jobTitle: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("application_received", candidateId, {
    job_title: jobTitle,
    company_name: companyName,
  });
}

/**
 * Notify candidate when their application is advanced to a new phase
 */
export async function notifyPhaseAdvanced(
  candidateId: string,
  phaseName: string,
  jobTitle: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("phase_advanced", candidateId, {
    phase_name: phaseName,
    job_title: jobTitle,
    company_name: companyName,
  });
}

/**
 * Notify candidate when an interview is scheduled
 */
export async function notifyInterviewScheduled(
  candidateId: string,
  jobTitle: string,
  interviewDate: string,
  interviewTime: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("interview_scheduled", candidateId, {
    job_title: jobTitle,
    interview_date: interviewDate,
    interview_time: interviewTime,
    company_name: companyName,
  });
}

/**
 * Notify candidate when an interview is cancelled
 */
export async function notifyInterviewCancelled(
  candidateId: string,
  jobTitle: string,
  originalDate?: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("interview_cancelled", candidateId, {
    job_title: jobTitle,
    original_date: originalDate,
    company_name: companyName,
  });
}

/**
 * Notify candidate when an interview is rescheduled
 */
export async function notifyInterviewRescheduled(
  candidateId: string,
  jobTitle: string,
  newDate: string,
  newTime: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("interview_rescheduled", candidateId, {
    job_title: jobTitle,
    new_date: newDate,
    new_time: newTime,
    company_name: companyName,
  });
}

/**
 * Notify candidate when a document is sent to them
 */
export async function notifyDocumentSent(
  candidateId: string,
  documentName: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("document_sent", candidateId, {
    document_name: documentName,
    company_name: companyName,
  });
}

/**
 * Notify candidate when a document upload is requested
 */
export async function notifyDocumentRequested(
  candidateId: string,
  documentName: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("document_requested", candidateId, {
    document_name: documentName,
    company_name: companyName,
  });
}

/**
 * Notify candidate when their application is rejected
 */
export async function notifyStatusRejected(
  candidateId: string,
  jobTitle: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("status_rejected", candidateId, {
    job_title: jobTitle,
    company_name: companyName,
  });
}

/**
 * Notify candidate when they are hired
 */
export async function notifyStatusHired(
  candidateId: string,
  jobTitle: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("status_hired", candidateId, {
    job_title: jobTitle,
    company_name: companyName,
  });
}

// ============ SHARED NOTIFICATIONS ============

/**
 * Notify user about a new message
 */
export async function notifyNewMessage(
  recipientId: string,
  senderName: string,
  messagePreview?: string,
  jobTitle?: string
): Promise<void> {
  await sendNotificationEmail("new_message", recipientId, {
    sender_name: senderName,
    message_preview: messagePreview?.substring(0, 100),
    job_title: jobTitle,
  });
}

/**
 * Send interview reminder (for use with scheduled jobs)
 */
export async function sendInterviewReminder(
  userId: string,
  jobTitle: string,
  interviewDate: string,
  interviewTime: string,
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("interview_reminder", userId, {
    job_title: jobTitle,
    interview_date: interviewDate,
    interview_time: interviewTime,
    company_name: companyName,
  });
}
