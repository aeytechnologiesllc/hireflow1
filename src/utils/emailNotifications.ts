import { supabase } from "@/integrations/supabase/client";

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
  proposed_times_list?: string[];
  window_count?: string;
  candidate_note?: string;
  minutes_remaining?: string;
  active_jobs_count?: string;
  score?: string;
  /** new_message: who sent it, so an employer's email can deep-link to that thread. */
  sender_id?: string;
  /** new_message: lets the function skip its role lookup when the caller knows. */
  recipient_role?: "employer" | "candidate" | "team_member";
}

async function sendNotificationEmail(
  type: NotificationType,
  recipientUserId: string,
  data: NotificationData
): Promise<void> {
  try {
    const { data: responseData, error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        type,
        recipient_user_id: recipientUserId,
        data,
      },
    });

    if (error) {
      console.error(`[emailNotifications] Failed to send ${type} email to user ${recipientUserId}:`, error);
      console.error(`[emailNotifications] Error details:`, JSON.stringify(error));
    }
  } catch (err) {
    console.error(`[emailNotifications] Exception invoking send-notification-email for ${type}:`, err);
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
 * Notify candidate that the employer proposed several interview windows
 * and they need to pick one
 */
export async function notifyInterviewPickTime(
  candidateId: string,
  jobTitle: string,
  proposedTimes: string[],
  companyName?: string
): Promise<void> {
  await sendNotificationEmail("interview_pick_time", candidateId, {
    job_title: jobTitle,
    proposed_times_list: proposedTimes,
    window_count: proposedTimes.length.toString(),
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
 * Notify user about a new message.
 *
 * The email reads differently for each side — an employer gets "New message
 * from <name>" linking to that candidate's thread, a candidate gets a note
 * from the hiring team routed through candidate sign-in. The function decides
 * by the recipient's role; it only needs the sender's id for the employer's
 * deep link. Existing callers pass no sender, so the signed-in user (who is
 * the sender) fills it in.
 */
export async function notifyNewMessage(
  recipientId: string,
  senderName: string,
  messagePreview?: string,
  jobTitle?: string,
  senderId?: string,
  recipientRole?: NotificationData["recipient_role"]
): Promise<void> {
  let resolvedSenderId = senderId;
  if (!resolvedSenderId) {
    try {
      const { data } = await supabase.auth.getSession();
      resolvedSenderId = data.session?.user?.id;
    } catch {
      // Fine — the employer's email links to the inbox instead of the thread.
    }
  }
  await sendNotificationEmail("new_message", recipientId, {
    sender_name: senderName,
    message_preview: messagePreview?.substring(0, 100),
    job_title: jobTitle,
    sender_id: resolvedSenderId,
    recipient_role: recipientRole,
  });
}

/**
 * A candidate just submitted their application (status -> pending). Tell the
 * candidate it landed and the employer someone applied — both looked up from
 * the job, both fire-and-forget. This is the moment the application is real;
 * the row is created earlier, when they only open the form, and an email that
 * says "submitted" at that point would be a lie.
 */
export async function notifyApplicationSubmitted(
  jobId: string,
  candidateId: string,
  candidateName: string
): Promise<void> {
  try {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("title, employer_id")
      .eq("id", jobId)
      .single();
    if (jobError || !job) {
      console.error("[emailNotifications] Could not load job for submission emails:", jobError);
      return;
    }
    const { data: employerProfile } = await supabase
      .from("profiles")
      .select("company_name")
      .eq("user_id", job.employer_id)
      .maybeSingle();
    const companyName = employerProfile?.company_name?.trim() || undefined;

    await Promise.all([
      notifyApplicationReceived(candidateId, job.title, companyName),
      notifyNewApplication(job.employer_id, candidateName || "A candidate", job.title),
    ]);
  } catch (err) {
    console.error("[emailNotifications] Failed to send application submitted emails:", err);
  }
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

// ============ VOICE MINUTES NOTIFICATIONS ============

/**
 * Notify employer when voice minutes are running low
 */
export async function notifyVoiceMinutesLow(
  employerId: string,
  minutesRemaining: number,
  activeJobsCount: number
): Promise<void> {
  await sendNotificationEmail("voice_minutes_low", employerId, {
    minutes_remaining: minutesRemaining.toString(),
    active_jobs_count: activeJobsCount.toString(),
  });
}

/**
 * Notify employer when voice minutes are exhausted
 */
export async function notifyVoiceMinutesExhausted(
  employerId: string,
  activeJobsCount: number
): Promise<void> {
  await sendNotificationEmail("voice_minutes_exhausted", employerId, {
    active_jobs_count: activeJobsCount.toString(),
  });
}

// ============ INTERVIEW READY NOTIFICATIONS ============

/**
 * Notify employer when a candidate is ready for AIVA voice interview
 * (candidate passed automated assessments and awaits employer to configure interview)
 */
export async function notifyInterviewReady(
  employerId: string,
  candidateName: string,
  jobTitle: string,
  score: number
): Promise<void> {
  await sendNotificationEmail("interview_ready", employerId, {
    candidate_name: candidateName,
    job_title: jobTitle,
    score: score.toString(),
  });
}
