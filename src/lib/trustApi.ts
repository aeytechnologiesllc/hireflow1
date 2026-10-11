import { supabase } from "@/integrations/supabase/client";

/**
 * The calls behind the new-business screens (docs/BUSINESS-TRUST.md; the
 * 2026-10-11 mock-ups): a business's standing, Help, and the platform
 * admin's page. The database functions are not in the generated types
 * (supabase/migrations/20261011100000_business_trust.sql and
 * 20261011180000_business_screens.sql), so each is typed here once.
 */

export type BusinessStatus = "new" | "approved" | "suspended";

export interface BusinessStanding {
  status: BusinessStatus;
  can_request_ids: boolean;
  is_admin: boolean;
}

export interface AdminBusiness {
  employer_id: string;
  email: string;
  company_name: string | null;
  full_name: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  status: BusinessStatus;
  status_reason: string | null;
  jobs_live: number;
  jobs_total: number;
  applicants: number;
  open_reports: number;
}

export interface AdminReport {
  id: string;
  employer_id: string;
  company_name: string | null;
  job_id: string | null;
  job_title: string | null;
  reporter_name: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export interface HelpMessage {
  id: string;
  employer_id: string;
  from_admin: boolean;
  author_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface HelpThread {
  employer_id: string;
  company_name: string | null;
  email: string;
  last_body: string;
  last_at: string;
  last_from_admin: boolean;
  unread: number;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, (args ?? {}) as never);
  if (error) throw error;
  return data as T;
}

export const trustApi = {
  standing: () => rpc<BusinessStanding | null>("my_business_standing"),
  isPlatformAdmin: () => rpc<boolean>("is_platform_admin"),
  adminBusinesses: () => rpc<AdminBusiness[]>("admin_businesses"),
  adminReports: () => rpc<AdminReport[]>("admin_reports"),
  adminCloseReport: (reportId: string) => rpc<void>("admin_close_report", { p_report_id: reportId }),
  adminSetStatus: (employerId: string, status: BusinessStatus, reason?: string | null) =>
    rpc<string>("admin_set_business_status", { p_employer: employerId, p_status: status, p_reason: reason ?? null }),
  adminHelpThreads: () => rpc<HelpThread[]>("admin_help_threads"),
  adminReplyHelp: (employerId: string, body: string) => rpc<string>("admin_reply_help", { p_employer: employerId, p_body: body }),
  adminMarkHelpRead: (employerId: string) => rpc<void>("mark_help_read", { p_employer: employerId }),
  sendHelp: (body: string) => rpc<string>("send_help_message", { p_body: body }),
  markHelpRead: () => rpc<void>("mark_help_read"),
  helpThread: async (employerId: string): Promise<HelpMessage[]> => {
    const { data, error } = await supabase
      .from("help_messages" as never)
      .select("id, employer_id, from_admin, author_id, body, created_at, read_at")
      .eq("employer_id", employerId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as HelpMessage[];
  },
};

/** A refusal from these functions, in words a person reads. */
export function trustErrorWords(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  if (/help_too_many/.test(message)) return "You've sent a lot of messages today. We'll answer those first; try again tomorrow.";
  if (/empty_message/.test(message)) return "Write a message first.";
  if (/not_a_business/.test(message)) return "Only a hiring team can write to HireFlow here. Applicants: message the business in your account.";
  if (/not_signed_in/.test(message)) return "Please sign in again.";
  if (/admins_only|NOT_AUTHORIZED/.test(message)) return "Only HireFlow can do that.";
  if (/cannot_suspend_self|yourself/i.test(message)) return "You can't pause your own business.";
  return fallback;
}
