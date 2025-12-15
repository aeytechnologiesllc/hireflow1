export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          ai_analysis: string | null
          ai_score: number | null
          candidate_id: string
          cover_letter: string | null
          created_at: string
          employer_notes: string | null
          id: string
          job_id: string
          notes: string | null
          phase: string | null
          phase_ai_analysis: string | null
          resume_url: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          ai_analysis?: string | null
          ai_score?: number | null
          candidate_id: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          id?: string
          job_id: string
          notes?: string | null
          phase?: string | null
          phase_ai_analysis?: string | null
          resume_url?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          ai_analysis?: string | null
          ai_score?: number | null
          candidate_id?: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          phase?: string | null
          phase_ai_analysis?: string | null
          resume_url?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audit_logs: {
        Row: {
          action: string
          consent_confirmed: boolean | null
          created_at: string
          details: Json | null
          document_hash: string | null
          document_id: string | null
          document_version: number | null
          id: string
          ip_address: string | null
          location_city: string | null
          location_country: string | null
          location_region: string | null
          page_numbers_signed: string[] | null
          signature_method: string | null
          signer_email: string | null
          signer_name: string | null
          signer_role: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          consent_confirmed?: boolean | null
          created_at?: string
          details?: Json | null
          document_hash?: string | null
          document_id?: string | null
          document_version?: number | null
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          page_numbers_signed?: string[] | null
          signature_method?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_role?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          consent_confirmed?: boolean | null
          created_at?: string
          details?: Json | null
          document_hash?: string | null
          document_id?: string | null
          document_version?: number | null
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          page_numbers_signed?: string[] | null
          signature_method?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_role?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          content: string
          created_at: string
          employer_id: string
          id: string
          name: string
          template_type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          employer_id: string
          id?: string
          name: string
          template_type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          employer_id?: string
          id?: string
          name?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          application_id: string
          candidate_signature_data: string | null
          candidate_signed_at: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          document_hash: string | null
          document_type: string | null
          employer_signature_data: string | null
          employer_signed_at: string | null
          expires_at: string | null
          file_url: string
          id: string
          ip_address: string | null
          is_voided: boolean | null
          name: string
          recipient_id: string | null
          reminder_sent_at: string | null
          sender_id: string | null
          signature_data: string | null
          signed_at: string | null
          signing_order: string | null
          status: Database["public"]["Enums"]["document_status"]
          user_agent: string | null
          version_number: number | null
          viewed_at: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          application_id: string
          candidate_signature_data?: string | null
          candidate_signed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_hash?: string | null
          document_type?: string | null
          employer_signature_data?: string | null
          employer_signed_at?: string | null
          expires_at?: string | null
          file_url: string
          id?: string
          ip_address?: string | null
          is_voided?: boolean | null
          name: string
          recipient_id?: string | null
          reminder_sent_at?: string | null
          sender_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signing_order?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          user_agent?: string | null
          version_number?: number | null
          viewed_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          application_id?: string
          candidate_signature_data?: string | null
          candidate_signed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_hash?: string | null
          document_type?: string | null
          employer_signature_data?: string | null
          employer_signed_at?: string | null
          expires_at?: string | null
          file_url?: string
          id?: string
          ip_address?: string | null
          is_voided?: boolean | null
          name?: string
          recipient_id?: string | null
          reminder_sent_at?: string | null
          sender_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signing_order?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          user_agent?: string | null
          version_number?: number | null
          viewed_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          ai_feedback: string | null
          ai_questions: string[] | null
          application_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          interview_type: string | null
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          ai_feedback?: string | null
          ai_questions?: string[] | null
          application_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type?: string | null
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          ai_feedback?: string | null
          ai_questions?: string[] | null
          application_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type?: string | null
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_bias_feedback: string | null
          ai_bias_score: number | null
          application_deadline: string | null
          application_questions: Json | null
          benefits: string[] | null
          created_at: string
          department: string | null
          description: string
          employer_id: string
          experience_level: string | null
          id: string
          job_code: string | null
          job_type: string | null
          location: string | null
          passing_score: number | null
          processing_mode: string | null
          quiz_questions: Json | null
          require_resume: boolean | null
          requirements: string | null
          responsibilities: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          skills_required: string[] | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          workflow_difficulty: string | null
          workflow_steps: Json | null
        }
        Insert: {
          ai_bias_feedback?: string | null
          ai_bias_score?: number | null
          application_deadline?: string | null
          application_questions?: Json | null
          benefits?: string[] | null
          created_at?: string
          department?: string | null
          description: string
          employer_id: string
          experience_level?: string | null
          id?: string
          job_code?: string | null
          job_type?: string | null
          location?: string | null
          passing_score?: number | null
          processing_mode?: string | null
          quiz_questions?: Json | null
          require_resume?: boolean | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills_required?: string[] | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          workflow_difficulty?: string | null
          workflow_steps?: Json | null
        }
        Update: {
          ai_bias_feedback?: string | null
          ai_bias_score?: number | null
          application_deadline?: string | null
          application_questions?: Json | null
          benefits?: string[] | null
          created_at?: string
          department?: string | null
          description?: string
          employer_id?: string
          experience_level?: string | null
          id?: string
          job_code?: string | null
          job_type?: string | null
          location?: string | null
          passing_score?: number | null
          processing_mode?: string | null
          quiz_questions?: Json | null
          require_resume?: boolean | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills_required?: string[] | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          workflow_difficulty?: string | null
          workflow_steps?: Json | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          application_id: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean
          receiver_id: string
          sender_id: string
        }
        Insert: {
          application_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id: string
          sender_id: string
        }
        Update: {
          application_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_description: string | null
          company_logo: string | null
          company_name: string | null
          created_at: string
          email: string
          experience_years: number | null
          full_name: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          phone: string | null
          portfolio_url: string | null
          resume_url: string | null
          skills: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_description?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          experience_years?: number | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_description?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          experience_years?: number | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          assigned_job_ids: string[] | null
          can_create_jobs: boolean | null
          can_delete_jobs: boolean | null
          can_manage_pipeline: boolean | null
          can_message_candidates: boolean | null
          can_schedule_interviews: boolean | null
          can_send_documents: boolean | null
          created_at: string
          department: string | null
          expires_at: string
          id: string
          invite_code: string | null
          invitee_email: string
          invitee_name: string | null
          inviter_id: string
          permission_level: string | null
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          assigned_job_ids?: string[] | null
          can_create_jobs?: boolean | null
          can_delete_jobs?: boolean | null
          can_manage_pipeline?: boolean | null
          can_message_candidates?: boolean | null
          can_schedule_interviews?: boolean | null
          can_send_documents?: boolean | null
          created_at?: string
          department?: string | null
          expires_at: string
          id?: string
          invite_code?: string | null
          invitee_email: string
          invitee_name?: string | null
          inviter_id: string
          permission_level?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          assigned_job_ids?: string[] | null
          can_create_jobs?: boolean | null
          can_delete_jobs?: boolean | null
          can_manage_pipeline?: boolean | null
          can_message_candidates?: boolean | null
          can_schedule_interviews?: boolean | null
          can_send_documents?: boolean | null
          created_at?: string
          department?: string | null
          expires_at?: string
          id?: string
          invite_code?: string | null
          invitee_email?: string
          invitee_name?: string | null
          inviter_id?: string
          permission_level?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: []
      }
      team_members: {
        Row: {
          assigned_job_ids: string[] | null
          can_create_jobs: boolean | null
          can_delete_jobs: boolean | null
          can_manage_pipeline: boolean | null
          can_message_candidates: boolean | null
          can_schedule_interviews: boolean | null
          can_send_documents: boolean | null
          created_at: string | null
          department: string | null
          email: string
          employer_id: string
          id: string
          invitation_id: string | null
          joined_at: string | null
          name: string | null
          permission_level: string | null
          revoked_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_job_ids?: string[] | null
          can_create_jobs?: boolean | null
          can_delete_jobs?: boolean | null
          can_manage_pipeline?: boolean | null
          can_message_candidates?: boolean | null
          can_schedule_interviews?: boolean | null
          can_send_documents?: boolean | null
          created_at?: string | null
          department?: string | null
          email: string
          employer_id: string
          id?: string
          invitation_id?: string | null
          joined_at?: string | null
          name?: string | null
          permission_level?: string | null
          revoked_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_job_ids?: string[] | null
          can_create_jobs?: boolean | null
          can_delete_jobs?: boolean | null
          can_manage_pipeline?: boolean | null
          can_message_candidates?: boolean | null
          can_schedule_interviews?: boolean | null
          can_send_documents?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string
          employer_id?: string
          id?: string
          invitation_id?: string | null
          joined_at?: string | null
          name?: string | null
          permission_level?: string | null
          revoked_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_team_member_permissions: {
        Args: { _employer_id: string; _user_id: string }
        Returns: {
          assigned_job_ids: string[]
          can_create_jobs: boolean
          can_delete_jobs: boolean
          can_manage_pipeline: boolean
          can_message_candidates: boolean
          can_schedule_interviews: boolean
          can_send_documents: boolean
          permission_level: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: {
        Args: { _employer_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "employer" | "candidate" | "team_member"
      application_status:
        | "pending"
        | "reviewing"
        | "interview"
        | "offered"
        | "hired"
        | "rejected"
      document_status: "pending" | "signed" | "declined"
      interview_status: "scheduled" | "completed" | "cancelled" | "no_show"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      job_status: "draft" | "published" | "closed" | "archived"
      notification_type:
        | "message"
        | "application"
        | "interview"
        | "status_update"
        | "team"
        | "system"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["employer", "candidate", "team_member"],
      application_status: [
        "pending",
        "reviewing",
        "interview",
        "offered",
        "hired",
        "rejected",
      ],
      document_status: ["pending", "signed", "declined"],
      interview_status: ["scheduled", "completed", "cancelled", "no_show"],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      job_status: ["draft", "published", "closed", "archived"],
      notification_type: [
        "message",
        "application",
        "interview",
        "status_update",
        "team",
        "system",
      ],
    },
  },
} as const
