/**
 * Hand-written table shapes for the showcase demo schema (roles / candidates /
 * candidate_details / applications / employers / kpis / activity /
 * conversations / messages / documents).
 *
 * These tables are not part of the live hireflow1 schema — compare
 * src/integrations/supabase/types.ts, generated from the live project
 * (yqklrkpptnhubsnijqze), which has `jobs`/`applications` (the real schema)
 * but no `roles`, `candidates`, `employers`, etc. This is a separate, older
 * prototype schema that detectSchemaMode() (showcaseSource.ts) falls back to
 * only when the `published_jobs_public` view can't be found. On the live
 * project that view exists, so this fallback never runs in production; the
 * adapter stays here — and stays typed — for any environment where the
 * `jobs` table hasn't been migrated in yet.
 *
 * Because these tables have no live schema to generate types from,
 * supabase.from("roles") et al. used to fall through Postgrest's generic
 * "relation not found" overload, which surfaced every column access as a
 * `SelectQueryError` across all *real* tables instead of a useful error.
 * This file hand-describes exactly the columns showcaseSource.ts and
 * showcaseApply.ts touch, and `showcaseDb` below re-types the one real
 * client against that shape, so the adapter type-checks like any other
 * Supabase-backed module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type RolesRow = {
  id: string;
  employer_id: string;
  title: string;
  location: string | null;
  pay: string | null;
  status: string;
  stage_label: string | null;
  applicant_count: number | null;
  applied: number | null;
  quiz: number | null;
  interview: number | null;
  shortlist: number | null;
  last_activity: string | null;
  sort_order: number;
  description: string | null;
  flow: Record<string, unknown> | null;
  rigor: string | null;
  openings: number | null;
  employment_type: string | null;
  work_mode: string | null;
  start_urgency: string | null;
  traits: string[] | null;
  role_code: string | null;
};

type CandidatesRow = {
  id: string;
  name: string;
  initials: string;
  avatar_color: string | null;
  phone: string | null;
  email: string | null;
};

type ApplicationsRow = {
  id: string;
  candidate_id: string;
  role_id: string;
  stage: string;
  voice_score: number | null;
  quiz_score: number | null;
  note: string | null;
  decision: string | null;
  current_phase: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  sort_order: number;
  linked_user_id: string | null;
  distance_mi: number | null;
  application_answers: Array<{ q: string; a: string }> | null;
};

type EmployersRow = {
  id: string;
  name: string;
};

type CandidateDetailsRow = {
  id: string;
  ava_read: string | null;
  voice_score: number | null;
  quiz_score: number | string | null;
  role_title: string | null;
};

type KpisRow = {
  id: number;
  shortlist_ready: number | null;
  in_pipeline: number | null;
  open_roles: number | null;
};

type ActivityRow = {
  kind: string;
  text: string;
  time: string;
  sort_order: number;
};

type ConversationsRow = {
  id: string;
  candidate_id: string;
  name: string;
  role_title: string;
  time: string;
  preview: string;
  unread: boolean;
  sort_order: number;
};

type MessagesRow = {
  id: string;
  conversation_id: string;
  from_role: string;
  text: string;
  time: string;
  sort_order: number;
};

type DocumentsRow = {
  id: string;
  name: string;
  section: string;
  candidate_name: string;
  initials: string;
  status_kind: string;
  status: string;
  date: string;
  sort_order: number;
};

export interface ShowcaseDatabase {
  public: {
    Tables: {
      roles: {
        Row: RolesRow;
        Insert: Partial<RolesRow> & Pick<RolesRow, "id" | "employer_id" | "title" | "sort_order">;
        Update: Partial<RolesRow>;
        Relationships: [];
      };
      candidates: {
        Row: CandidatesRow;
        Insert: Partial<CandidatesRow> & Pick<CandidatesRow, "id" | "name" | "initials">;
        Update: Partial<CandidatesRow>;
        Relationships: [];
      };
      applications: {
        Row: ApplicationsRow;
        Insert: Partial<ApplicationsRow> &
          Pick<ApplicationsRow, "id" | "candidate_id" | "role_id" | "stage" | "sort_order">;
        Update: Partial<ApplicationsRow>;
        Relationships: [];
      };
    };
    Views: {
      employers: { Row: EmployersRow; Relationships: [] };
      candidate_details: { Row: CandidateDetailsRow; Relationships: [] };
      kpis: { Row: KpisRow; Relationships: [] };
      activity: { Row: ActivityRow; Relationships: [] };
      conversations: { Row: ConversationsRow; Relationships: [] };
      messages: { Row: MessagesRow; Relationships: [] };
      documents: { Row: DocumentsRow; Relationships: [] };
    };
    // Deliberately `{}`, not `Record<string, GenericFunction>` — the latter's
    // index signature makes `keyof Functions` equal `string`, which trips
    // postgrest-js's GetComputedFields into treating every column as a
    // computed field and collapsing `select("*")` to `{}` (see the file
    // header). `{}` has no index signature, so `keyof` is `never`, as
    // intended for a schema with no RPCs of its own.
    Functions: Record<never, never>;
  };
}

export type ShowcaseClient = SupabaseClient<ShowcaseDatabase, "public">;

/**
 * The one real `supabase` client, re-typed against the showcase schema
 * above. Same instance, same auth/session/network — only the compile-time
 * table shapes differ, and only for the showcase-adapter modules that
 * import this instead of `supabase` directly.
 */
export const showcaseDb = supabase as unknown as ShowcaseClient;
