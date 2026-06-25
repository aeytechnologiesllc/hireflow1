/**
 * Showcase schema (roles / candidates / applications) — accountless apply path.
 * Job code finds the role; phone + email + job identifies the applicant.
 */
import { supabase } from "@/integrations/supabase/client";

export const SHOWCASE_EMPLOYER_ID = "emp_marias_cafe";

export interface ShowcaseRole {
  id: string;
  title: string;
  location: string;
  pay: string;
  status: string;
  description: string | null;
  role_code: string | null;
  flow: Record<string, unknown> | null;
  traits: string[] | null;
  employment_type: string | null;
}

export interface Phase1Input {
  roleId: string;
  name: string;
  email: string;
  phone: string;
  answer?: string;
  applicationAnswers?: Array<{ q: string; a: string }>;
}

export interface Phase1Result {
  applicationId: string;
  candidateId: string;
  isExisting: boolean;
}

export interface PhoneApplicationSummary {
  applicationId: string;
  roleId: string;
  roleTitle: string;
  roleLocation: string;
  currentPhase: string;
  stage: string;
  appliedAt: string;
  applicantName: string;
}

const LIVE_STATUSES = new Set(["live", "shortlist", "quiz", "interview"]);

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isRoleAcceptingApplications(status: string): boolean {
  return LIVE_STATUSES.has(status) || status === "published";
}

export function candidateApplyUrl(roleCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/candidate/apply?code=${encodeURIComponent(roleCode)}`;
}

export function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    applied: "Application submitted",
    application: "Application in progress",
    quiz: "Assessment",
    interview: "Voice questions",
    shortlist: "Under review",
  };
  return map[phase] ?? phase.replace(/_/g, " ");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColorOf(name: string): string {
  const palette = ["#b8d4c8", "#c9e4de", "#d9d4ec", "#e8d5b7", "#c5dff8", "#f0d9c4"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function fetchRoleByCode(code: string): Promise<ShowcaseRole | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from("roles")
    .select("id, title, location, pay, status, description, role_code, flow, traits, employment_type")
    .eq("role_code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isRoleAcceptingApplications(data.status)) return null;
  return {
    ...data,
    traits: Array.isArray(data.traits) ? (data.traits as string[]) : null,
    flow: data.flow as Record<string, unknown> | null,
  };
}

export async function fetchRoleById(id: string): Promise<ShowcaseRole | null> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, title, location, pay, status, description, role_code, flow, traits, employment_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isRoleAcceptingApplications(data.status)) return null;
  return {
    ...data,
    traits: Array.isArray(data.traits) ? (data.traits as string[]) : null,
    flow: data.flow as Record<string, unknown> | null,
  };
}

export async function findApplicationByContact(roleId: string, email: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from("applications")
    .select("id, candidate_id, current_phase, stage, applicant_email, applicant_phone")
    .eq("role_id", roleId)
    .ilike("applicant_email", normalizedEmail)
    .order("sort_order", { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  return (
    rows.find((row) => normalizePhone(row.applicant_phone ?? "") === normalizedPhone) ??
    rows[0] ??
    null
  );
}

export async function fetchApplicationsByPhone(phone: string): Promise<PhoneApplicationSummary[]> {
  const digits = normalizePhone(phone);
  if (digits.length < 10) return [];

  const { data: apps, error: appErr } = await supabase
    .from("applications")
    .select("id, role_id, candidate_id, stage, current_phase, applicant_phone, applicant_email, sort_order")
    .not("applicant_phone", "is", null)
    .order("sort_order", { ascending: false });

  if (appErr) throw appErr;

  const { data: candidates, error: candErr } = await supabase
    .from("candidates")
    .select("id, name, phone, email");

  if (candErr) throw candErr;

  const candMap = new Map((candidates ?? []).map((c) => [c.id, c]));
  const roleIds = [...new Set((apps ?? []).map((a) => a.role_id))];
  const { data: roles } = await supabase
    .from("roles")
    .select("id, title, location")
    .in("id", roleIds.length ? roleIds : ["__none__"]);

  const roleMap = new Map((roles ?? []).map((r) => [r.id, r]));

  const matched = (apps ?? []).filter((app) => {
    const appPhone = normalizePhone(app.applicant_phone ?? "");
    if (appPhone === digits) return true;
    const cand = candMap.get(app.candidate_id);
    return cand ? normalizePhone(cand.phone ?? "") === digits : false;
  });

  return matched.map((app) => {
    const role = roleMap.get(app.role_id);
    const cand = candMap.get(app.candidate_id);
    const phase = app.current_phase ?? app.stage ?? "applied";
    return {
      applicationId: app.id,
      roleId: app.role_id,
      roleTitle: role?.title ?? "Role",
      roleLocation: role?.location ?? "",
      currentPhase: phase,
      stage: app.stage,
      appliedAt: "Recently",
      applicantName: cand?.name ?? "Applicant",
    };
  });
}

export async function submitPhase1Application(input: Phase1Input): Promise<Phase1Result> {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (phone.length < 10) throw new Error("Please enter a valid phone number");

  const existing = await findApplicationByContact(input.roleId, email, phone);
  if (existing) {
    return {
      applicationId: existing.id,
      candidateId: existing.candidate_id,
      isExisting: true,
    };
  }

  const candidateId = newId("cand");
  const applicationId = newId("app");

  const candRes = await supabase.from("candidates").insert({
    id: candidateId,
    name: input.name.trim(),
    initials: initialsOf(input.name),
    avatar_color: avatarColorOf(input.name),
    email,
    phone: input.phone.trim(),
  });
  if (candRes.error) throw new Error(candRes.error.message);

  const answers = input.applicationAnswers ?? [];
  if (input.answer?.trim()) {
    answers.push({ q: "Why are you interested in this role?", a: input.answer.trim() });
  }

  const appRes = await supabase.from("applications").insert({
    id: applicationId,
    candidate_id: candidateId,
    role_id: input.roleId,
    stage: "applied",
    current_phase: "applied",
    voice_score: null,
    quiz_score: null,
    note: input.answer?.trim() || null,
    distance_mi: null,
    sort_order: Math.floor(Date.now() / 1000),
    applicant_email: email,
    applicant_phone: input.phone.trim(),
    application_answers: answers,
  });
  if (appRes.error) throw new Error(appRes.error.message);

  return { applicationId, candidateId, isExisting: false };
}

/** After signup/OAuth, attach guest applications that match phone or email. */
export async function linkGuestApplications(userId: string, phone: string, email: string) {
  const digits = normalizePhone(phone);
  const normalizedEmail = email.trim().toLowerCase();
  if (!digits && !normalizedEmail) return;

  const { data: apps, error } = await supabase
    .from("applications")
    .select("id, applicant_phone, applicant_email, linked_user_id")
    .is("linked_user_id", null);

  if (error) throw error;

  const toLink = (apps ?? []).filter((app) => {
    const phoneMatch = digits && normalizePhone(app.applicant_phone ?? "") === digits;
    const emailMatch = normalizedEmail && (app.applicant_email ?? "").toLowerCase() === normalizedEmail;
    return phoneMatch || emailMatch;
  });

  if (!toLink.length) return;

  await Promise.all(
    toLink.map((app) =>
      supabase.from("applications").update({ linked_user_id: userId }).eq("id", app.id),
    ),
  );
}

export interface CreateShowcaseRoleInput {
  title: string;
  description?: string | null;
  location?: string | null;
  pay?: string | null;
  status?: "live" | "draft";
  flow?: Record<string, unknown> | null;
  employment_type?: string | null;
}

export async function createShowcaseRole(input: CreateShowcaseRoleInput) {
  const row = {
    id: newId("role"),
    employer_id: SHOWCASE_EMPLOYER_ID,
    title: input.title,
    location: input.location || "Location TBD",
    pay: input.pay || "Competitive",
    status: input.status ?? "live",
    stage_label: input.status === "draft" ? "Draft" : "Live",
    applicant_count: 0,
    applied: 0,
    quiz: 0,
    interview: 0,
    shortlist: 0,
    last_activity: "Published just now",
    sort_order: Math.floor(Date.now() / 1000),
    description: input.description ?? null,
    flow: input.flow ?? null,
    employment_type: input.employment_type ?? null,
  };

  const { data, error } = await supabase.from("roles").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as ShowcaseRole & { role_code: string };
}

export function resumeRouteForApplication(summary: PhoneApplicationSummary): string {
  const phase = summary.currentPhase;
  if (phase === "quiz") return `/candidate/apply/${summary.roleId}/form?phase=quiz&app=${summary.applicationId}`;
  if (phase === "interview") return `/candidate/apply/${summary.roleId}/form?phase=interview&app=${summary.applicationId}`;
  return `/candidate/apply/${summary.roleId}/form?app=${summary.applicationId}`;
}
