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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      applicant_notes: {
        Row: {
          application_id: string
          author_id: string | null
          body: string
          created_at: string
          id: string
          job_id: string
        }
        Insert: {
          application_id: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          job_id: string
        }
        Update: {
          application_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_notes_application_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_notes_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_notes_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_packs: {
        Row: {
          amount_cents: number
          created_at: string
          employer_id: string
          id: string
          included_applicants: number
          job_id: string
          job_unlock_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          employer_id: string
          id?: string
          included_applicants?: number
          job_id: string
          job_unlock_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          employer_id?: string
          id?: string
          included_applicants?: number
          job_id?: string
          job_unlock_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_packs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_packs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_packs_job_unlock_id_fkey"
            columns: ["job_unlock_id"]
            isOneToOne: false
            referencedRelation: "job_unlocks"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_views: {
        Row: {
          application_id: string
          job_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          application_id: string
          job_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          application_id?: string
          job_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_views_application_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_views_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_views_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_analysis: string | null
          ai_score: number | null
          ai_scorecard: Json | null
          candidate_id: string
          cover_letter: string | null
          created_at: string
          employer_notes: string | null
          external_application_id: string | null
          external_provider: string | null
          id: string
          job_id: string
          notes: string | null
          phase: string | null
          phase_ai_analysis: string | null
          rejected_by: string | null
          rejected_by_type: string | null
          resume_score: number | null
          resume_url: string | null
          source: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          voice_interview_duration: number | null
          voice_interview_language: string | null
          voice_interview_language_rule: string | null
          voice_interview_recording_url: string | null
          voice_interview_result: Json | null
          voice_interview_transcript: Json | null
          voice_interview_video_enabled: boolean | null
        }
        Insert: {
          ai_analysis?: string | null
          ai_score?: number | null
          ai_scorecard?: Json | null
          candidate_id: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          external_application_id?: string | null
          external_provider?: string | null
          id?: string
          job_id: string
          notes?: string | null
          phase?: string | null
          phase_ai_analysis?: string | null
          rejected_by?: string | null
          rejected_by_type?: string | null
          resume_score?: number | null
          resume_url?: string | null
          source?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          voice_interview_duration?: number | null
          voice_interview_language?: string | null
          voice_interview_language_rule?: string | null
          voice_interview_recording_url?: string | null
          voice_interview_result?: Json | null
          voice_interview_transcript?: Json | null
          voice_interview_video_enabled?: boolean | null
        }
        Update: {
          ai_analysis?: string | null
          ai_score?: number | null
          ai_scorecard?: Json | null
          candidate_id?: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          external_application_id?: string | null
          external_provider?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          phase?: string | null
          phase_ai_analysis?: string | null
          rejected_by?: string | null
          rejected_by_type?: string | null
          resume_score?: number | null
          resume_url?: string | null
          source?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          voice_interview_duration?: number | null
          voice_interview_language?: string | null
          voice_interview_language_rule?: string | null
          voice_interview_recording_url?: string | null
          voice_interview_result?: Json | null
          voice_interview_transcript?: Json | null
          voice_interview_video_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_events: {
        Row: {
          application_id: string
          client_at: string | null
          client_msg_id: string | null
          content: string | null
          created_at: string
          detail: Json
          duration_ms: number | null
          id: number
          job_id: string
          kind: string
          seq: number
          session_id: string
        }
        Insert: {
          application_id: string
          client_at?: string | null
          client_msg_id?: string | null
          content?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: never
          job_id: string
          kind: string
          seq?: number
          session_id: string
        }
        Update: {
          application_id?: string
          client_at?: string | null
          client_msg_id?: string | null
          content?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: never
          job_id?: string
          kind?: string
          seq?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_sessions: {
        Row: {
          application_id: string
          attempt: number
          candidate_id: string
          context: Json
          created_at: string
          draft: Json | null
          end_reason: string | null
          ended_at: string | null
          event_seq: number
          grading: Json | null
          hidden_at: string | null
          id: string
          integrity_summary: Json
          job_id: string
          last_activity_at: string
          last_heartbeat_at: string | null
          progress: Json
          started_at: string
          status: string
          step_id: string
          step_type: string
          updated_at: string
        }
        Insert: {
          application_id: string
          attempt?: number
          candidate_id: string
          context?: Json
          created_at?: string
          draft?: Json | null
          end_reason?: string | null
          ended_at?: string | null
          event_seq?: number
          grading?: Json | null
          hidden_at?: string | null
          id?: string
          integrity_summary?: Json
          job_id: string
          last_activity_at?: string
          last_heartbeat_at?: string | null
          progress?: Json
          started_at?: string
          status?: string
          step_id: string
          step_type: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          attempt?: number
          candidate_id?: string
          context?: Json
          created_at?: string
          draft?: Json | null
          end_reason?: string | null
          ended_at?: string | null
          event_seq?: number
          grading?: Json | null
          hidden_at?: string | null
          id?: string
          integrity_summary?: Json
          job_id?: string
          last_activity_at?: string
          last_heartbeat_at?: string | null
          progress?: Json
          started_at?: string
          status?: string
          step_id?: string
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_sessions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_step_reopens: {
        Row: {
          application_id: string
          job_id: string
          reopen_count: number
          reopened_at: string
          reopened_by: string | null
          step_id: string
        }
        Insert: {
          application_id: string
          job_id: string
          reopen_count?: number
          reopened_at?: string
          reopened_by?: string | null
          step_id: string
        }
        Update: {
          application_id?: string
          job_id?: string
          reopen_count?: number
          reopened_at?: string
          reopened_by?: string | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_step_reopens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_applicants: {
        Row: {
          blocked_by: string
          candidate_id: string
          created_at: string
          email: string | null
          email_key: string | null
          employer_id: string
          id: string
          phone: string | null
          reason: string | null
        }
        Insert: {
          blocked_by?: string
          candidate_id: string
          created_at?: string
          email?: string | null
          email_key?: never
          employer_id: string
          id?: string
          phone?: string | null
          reason?: string | null
        }
        Update: {
          blocked_by?: string
          candidate_id?: string
          created_at?: string
          email?: string | null
          email_key?: never
          employer_id?: string
          id?: string
          phone?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      blueprint_purchases: {
        Row: {
          amount_paid: number | null
          application_id: string
          id: string
          purchased_at: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          application_id: string
          id?: string
          purchased_at?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          application_id?: string
          id?: string
          purchased_at?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_purchases_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_orders: {
        Row: {
          authorized_at: string | null
          captured_at: string | null
          created_at: string
          employer_id: string
          hold_expires_at: string | null
          id: string
          job_id: string
          meta_ad_id: string | null
          meta_ad_set_id: string | null
          meta_campaign_id: string | null
          meta_creative_id: string | null
          meta_rejection_reason: string | null
          meta_review_status: string | null
          radius_miles: number
          reach_estimate_high: number | null
          reach_estimate_low: number | null
          released_at: string | null
          retry_count: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tier_cents: number
          updated_at: string
        }
        Insert: {
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          employer_id: string
          hold_expires_at?: string | null
          id?: string
          job_id: string
          meta_ad_id?: string | null
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_rejection_reason?: string | null
          meta_review_status?: string | null
          radius_miles?: number
          reach_estimate_high?: number | null
          reach_estimate_low?: number | null
          released_at?: string | null
          retry_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tier_cents: number
          updated_at?: string
        }
        Update: {
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          employer_id?: string
          hold_expires_at?: string | null
          id?: string
          job_id?: string
          meta_ad_id?: string | null
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_rejection_reason?: string | null
          meta_review_status?: string | null
          radius_miles?: number
          reach_estimate_high?: number | null
          reach_estimate_low?: number | null
          released_at?: string | null
          retry_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tier_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_events: {
        Row: {
          browser_family: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_notified_at: string | null
          last_notified_count: number
          last_seen_at: string
          last_user_id: string | null
          message: string
          occurrence_count: number
          release: string | null
          route: string
          stack: string | null
          user_role: string | null
        }
        Insert: {
          browser_family?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_notified_at?: string | null
          last_notified_count?: number
          last_seen_at?: string
          last_user_id?: string | null
          message: string
          occurrence_count?: number
          release?: string | null
          route?: string
          stack?: string | null
          user_role?: string | null
        }
        Update: {
          browser_family?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_notified_at?: string | null
          last_notified_count?: number
          last_seen_at?: string
          last_user_id?: string | null
          message?: string
          occurrence_count?: number
          release?: string | null
          route?: string
          stack?: string | null
          user_role?: string | null
        }
        Relationships: []
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
          post_signature_hash: string | null
          pre_signature_hash: string | null
          signature_event_id: string | null
          signature_method: string | null
          signer_email: string | null
          signer_name: string | null
          signer_role: string | null
          signing_order_position: number | null
          timestamp_utc: string | null
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
          post_signature_hash?: string | null
          pre_signature_hash?: string | null
          signature_event_id?: string | null
          signature_method?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_role?: string | null
          signing_order_position?: number | null
          timestamp_utc?: string | null
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
          post_signature_hash?: string | null
          pre_signature_hash?: string | null
          signature_event_id?: string | null
          signature_method?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_role?: string | null
          signing_order_position?: number | null
          timestamp_utc?: string | null
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
      document_packages: {
        Row: {
          application_id: string
          candidate_id: string
          completed_at: string | null
          created_at: string
          employer_id: string
          id: string
          name: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          employer_id: string
          id?: string
          name?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          employer_id?: string
          id?: string
          name?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_packages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          application_id: string
          candidate_id: string
          candidate_viewed_at: string | null
          created_at: string
          custom_document_name: string | null
          description: string | null
          document_type: string
          due_date: string | null
          employer_id: string
          file_name: string | null
          file_url: string | null
          id: string
          is_required: boolean
          package_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          candidate_id: string
          candidate_viewed_at?: string | null
          created_at?: string
          custom_document_name?: string | null
          description?: string | null
          document_type: string
          due_date?: string | null
          employer_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_required?: boolean
          package_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          candidate_id?: string
          candidate_viewed_at?: string | null
          created_at?: string
          custom_document_name?: string | null
          description?: string | null
          document_type?: string
          due_date?: string | null
          employer_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_required?: boolean
          package_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "document_packages"
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
          completion_certificate: Json | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          document_code: string
          document_hash: string | null
          document_type: string | null
          employer_signature_data: string | null
          employer_signed_at: string | null
          expires_at: string | null
          file_url: string
          final_pdf_hash: string | null
          id: string
          ip_address: string | null
          is_locked: boolean | null
          is_voided: boolean | null
          locked_at: string | null
          name: string
          package_id: string | null
          recipient_id: string | null
          reminder_sent_at: string | null
          sender_id: string | null
          signature_data: string | null
          signed_at: string | null
          signing_order: string | null
          status: Database["public"]["Enums"]["document_status"]
          user_agent: string | null
          v1_hash: string | null
          v2_hash: string | null
          v3_hash: string | null
          version_number: number | null
          viewed_at: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          application_id: string
          candidate_signature_data?: string | null
          candidate_signed_at?: string | null
          completion_certificate?: Json | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_code: string
          document_hash?: string | null
          document_type?: string | null
          employer_signature_data?: string | null
          employer_signed_at?: string | null
          expires_at?: string | null
          file_url: string
          final_pdf_hash?: string | null
          id?: string
          ip_address?: string | null
          is_locked?: boolean | null
          is_voided?: boolean | null
          locked_at?: string | null
          name: string
          package_id?: string | null
          recipient_id?: string | null
          reminder_sent_at?: string | null
          sender_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signing_order?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          user_agent?: string | null
          v1_hash?: string | null
          v2_hash?: string | null
          v3_hash?: string | null
          version_number?: number | null
          viewed_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          application_id?: string
          candidate_signature_data?: string | null
          candidate_signed_at?: string | null
          completion_certificate?: Json | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          document_code?: string
          document_hash?: string | null
          document_type?: string | null
          employer_signature_data?: string | null
          employer_signed_at?: string | null
          expires_at?: string | null
          file_url?: string
          final_pdf_hash?: string | null
          id?: string
          ip_address?: string | null
          is_locked?: boolean | null
          is_voided?: boolean | null
          locked_at?: string | null
          name?: string
          package_id?: string | null
          recipient_id?: string | null
          reminder_sent_at?: string | null
          sender_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signing_order?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          user_agent?: string | null
          v1_hash?: string | null
          v2_hash?: string | null
          v3_hash?: string | null
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
          {
            foreignKeyName: "documents_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "document_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      google_indexing_notifications: {
        Row: {
          created_at: string
          employer_id: string | null
          error_message: string | null
          google_response: Json | null
          id: string
          job_id: string | null
          notification_type: string
          reason: string | null
          requested_by: string | null
          status: string
          url: string
        }
        Insert: {
          created_at?: string
          employer_id?: string | null
          error_message?: string | null
          google_response?: Json | null
          id?: string
          job_id?: string | null
          notification_type: string
          reason?: string | null
          requested_by?: string | null
          status: string
          url: string
        }
        Update: {
          created_at?: string
          employer_id?: string | null
          error_message?: string | null
          google_response?: Json | null
          id?: string
          job_id?: string | null
          notification_type?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_indexing_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_indexing_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_guides: {
        Row: {
          application_id: string
          fingerprint: string | null
          generated_at: string
          generated_by: string | null
          guide: Json
          job_id: string
          model: string | null
          prompt_version: string | null
        }
        Insert: {
          application_id: string
          fingerprint?: string | null
          generated_at?: string
          generated_by?: string | null
          guide: Json
          job_id: string
          model?: string | null
          prompt_version?: string | null
        }
        Update: {
          application_id?: string
          fingerprint?: string | null
          generated_at?: string
          generated_by?: string | null
          guide?: Json
          job_id?: string
          model?: string | null
          prompt_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_guides_application_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_guides_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_guides_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_ratings: {
        Row: {
          answers: Json
          application_id: string
          created_at: string
          job_id: string
          overall_note: string
          rated_by: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          application_id: string
          created_at?: string
          job_id: string
          overall_note?: string
          rated_by: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          application_id?: string
          created_at?: string
          job_id?: string
          overall_note?: string
          rated_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_ratings_application_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_ratings_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          ai_feedback: string | null
          ai_questions: string[] | null
          application_id: string
          candidate_note: string | null
          candidate_response: string | null
          created_at: string
          duration_minutes: number | null
          employer_windows: Json | null
          id: string
          interview_type: string | null
          meeting_link: string | null
          meeting_provider: string | null
          meeting_room_name: string | null
          meeting_room_url: string | null
          notes: string | null
          proposed_times: Json | null
          scheduled_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          ai_feedback?: string | null
          ai_questions?: string[] | null
          application_id: string
          candidate_note?: string | null
          candidate_response?: string | null
          created_at?: string
          duration_minutes?: number | null
          employer_windows?: Json | null
          id?: string
          interview_type?: string | null
          meeting_link?: string | null
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_room_url?: string | null
          notes?: string | null
          proposed_times?: Json | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          ai_feedback?: string | null
          ai_questions?: string[] | null
          application_id?: string
          candidate_note?: string | null
          candidate_response?: string | null
          created_at?: string
          duration_minutes?: number | null
          employer_windows?: Json | null
          id?: string
          interview_type?: string | null
          meeting_link?: string | null
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_room_url?: string | null
          notes?: string | null
          proposed_times?: Json | null
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
      job_quiz_keys: {
        Row: {
          job_id: string
          key: Json
          question_id: string
          step_id: string
          updated_at: string
        }
        Insert: {
          job_id: string
          key: Json
          question_id: string
          step_id: string
          updated_at?: string
        }
        Update: {
          job_id?: string
          key?: Json
          question_id?: string
          step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_quiz_keys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_quiz_keys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      job_unlocks: {
        Row: {
          amount_cents: number
          created_at: string
          employer_id: string
          expires_at: string | null
          id: string
          included_applicants: number
          included_voice_interviews: number
          job_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          unlocked_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          employer_id: string
          expires_at?: string | null
          id?: string
          included_applicants?: number
          included_voice_interviews?: number
          job_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unlocked_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          employer_id?: string
          expires_at?: string | null
          id?: string
          included_applicants?: number
          included_voice_interviews?: number
          job_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unlocked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_unlocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_unlocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
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
          exclude_from_feed: boolean
          experience_level: string | null
          id: string
          is_remote: boolean
          job_code: string | null
          job_type: string | null
          latitude: number | null
          location: string | null
          location_city: string | null
          location_country: string | null
          location_country_code: string | null
          location_region: string | null
          locations: Json | null
          longitude: number | null
          passing_score: number | null
          processing_mode: string | null
          quiz_questions: Json | null
          require_resume: boolean | null
          required_wpm: number | null
          requirements: string | null
          responsibilities: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          skills_required: string[] | null
          slug: string | null
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
          exclude_from_feed?: boolean
          experience_level?: string | null
          id?: string
          is_remote?: boolean
          job_code?: string | null
          job_type?: string | null
          latitude?: number | null
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_region?: string | null
          locations?: Json | null
          longitude?: number | null
          passing_score?: number | null
          processing_mode?: string | null
          quiz_questions?: Json | null
          require_resume?: boolean | null
          required_wpm?: number | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          skills_required?: string[] | null
          slug?: string | null
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
          exclude_from_feed?: boolean
          experience_level?: string | null
          id?: string
          is_remote?: boolean
          job_code?: string | null
          job_type?: string | null
          latitude?: number | null
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_region?: string | null
          locations?: Json | null
          longitude?: number | null
          passing_score?: number | null
          processing_mode?: string | null
          quiz_questions?: Json | null
          require_resume?: boolean | null
          required_wpm?: number | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          skills_required?: string[] | null
          slug?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          workflow_difficulty?: string | null
          workflow_steps?: Json | null
        }
        Relationships: []
      }
      message_thread_state: {
        Row: {
          archived_at: string | null
          cleared_at: string | null
          contact_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          cleared_at?: string | null
          contact_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          cleared_at?: string | null
          contact_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          application_id: string | null
          content: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_read: boolean
          receiver_id: string
          sender_id: string
        }
        Insert: {
          application_id?: string | null
          content: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          receiver_id: string
          sender_id: string
        }
        Update: {
          application_id?: string | null
          content?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
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
          group_key: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          push_sent_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          push_sent_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          push_sent_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      page_view_daily: {
        Row: {
          created_at: string
          day: string
          device_class: string
          id: string
          path: string
          referrer_host: string
          updated_at: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
          view_count: number
        }
        Insert: {
          created_at?: string
          day: string
          device_class?: string
          id?: string
          path: string
          referrer_host?: string
          updated_at?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          day?: string
          device_class?: string
          id?: string
          path?: string
          referrer_host?: string
          updated_at?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          view_count?: number
        }
        Relationships: []
      }
      private_rate_limit: {
        Row: {
          bucket: string
          hits: number
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          identifier: string
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_address: string | null
          company_description: string | null
          company_logo: string | null
          company_name: string | null
          created_at: string
          email: string
          email_document_updates: boolean | null
          email_interview_reminders: boolean | null
          email_messages: boolean | null
          email_new_applications: boolean | null
          email_notifications_enabled: boolean | null
          email_phase_updates: boolean | null
          email_voice_minutes: boolean | null
          experience_years: number | null
          full_name: string | null
          id: string
          job_title: string | null
          linkedin_url: string | null
          location: string | null
          onboarding_completed: boolean | null
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
          company_address?: string | null
          company_description?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          email_document_updates?: boolean | null
          email_interview_reminders?: boolean | null
          email_messages?: boolean | null
          email_new_applications?: boolean | null
          email_notifications_enabled?: boolean | null
          email_phase_updates?: boolean | null
          email_voice_minutes?: boolean | null
          experience_years?: number | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
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
          company_address?: string | null
          company_description?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          email_document_updates?: boolean | null
          email_interview_reminders?: boolean | null
          email_messages?: boolean | null
          email_new_applications?: boolean | null
          email_notifications_enabled?: boolean | null
          email_phase_updates?: boolean | null
          email_voice_minutes?: boolean | null
          experience_years?: number | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          platform: string
          player_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          player_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          player_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempt_ledger: {
        Row: {
          attempts: number
          candidate_id: string
          job_id: string
          last_attempt_at: string | null
          retakes_granted: number
          step_id: string
        }
        Insert: {
          attempts?: number
          candidate_id: string
          job_id: string
          last_attempt_at?: string | null
          retakes_granted?: number
          step_id: string
        }
        Update: {
          attempts?: number
          candidate_id?: string
          job_id?: string
          last_attempt_at?: string | null
          retakes_granted?: number
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempt_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempt_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlisted_applications: {
        Row: {
          added_by: string | null
          application_id: string
          created_at: string
          job_id: string
        }
        Insert: {
          added_by?: string | null
          application_id: string
          created_at?: string
          job_id: string
        }
        Update: {
          added_by?: string | null
          application_id?: string
          created_at?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortlisted_applications_application_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortlisted_applications_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortlisted_applications_job_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_usage: {
        Row: {
          ai_analyses_used: number | null
          applicants_received: number | null
          created_at: string
          documents_sent: number | null
          id: string
          jobs_created: number | null
          period_end: string | null
          period_start: string | null
          team_members_added: number | null
          updated_at: string
          user_id: string
          voice_minutes_used: number | null
        }
        Insert: {
          ai_analyses_used?: number | null
          applicants_received?: number | null
          created_at?: string
          documents_sent?: number | null
          id?: string
          jobs_created?: number | null
          period_end?: string | null
          period_start?: string | null
          team_members_added?: number | null
          updated_at?: string
          user_id: string
          voice_minutes_used?: number | null
        }
        Update: {
          ai_analyses_used?: number | null
          applicants_received?: number | null
          created_at?: string
          documents_sent?: number | null
          id?: string
          jobs_created?: number | null
          period_end?: string | null
          period_start?: string | null
          team_members_added?: number | null
          updated_at?: string
          user_id?: string
          voice_minutes_used?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          cancel_at_period_end: boolean | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          onboarding_completed: boolean | null
          plan_type: string
          status: string
          stripe_customer_id: string | null
          stripe_default_payment_method_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
          voice_low_balance_notified_at: string | null
        }
        Insert: {
          amount?: number | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          onboarding_completed?: boolean | null
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
          voice_low_balance_notified_at?: string | null
        }
        Update: {
          amount?: number | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          onboarding_completed?: boolean | null
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
          voice_low_balance_notified_at?: string | null
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
          onboarding_completed: boolean
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
          onboarding_completed?: boolean
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
          onboarding_completed?: boolean
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
      trusted_result_enforcement: {
        Row: {
          enforced: boolean
          result_key: string
          updated_at: string
        }
        Insert: {
          enforced?: boolean
          result_key: string
          updated_at?: string
        }
        Update: {
          enforced?: boolean
          result_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      typing_test_starts: {
        Row: {
          application_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          step_id: string
          target_text: string
        }
        Insert: {
          application_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          step_id: string
          target_text: string
        }
        Update: {
          application_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          step_id?: string
          target_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_test_starts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
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
      voice_credits: {
        Row: {
          created_at: string | null
          expires_at: string
          granted_at: string | null
          id: string
          minutes_granted: number
          minutes_remaining: number
          pack_size: string | null
          source: string
          status: string | null
          stripe_payment_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          granted_at?: string | null
          id?: string
          minutes_granted: number
          minutes_remaining: number
          pack_size?: string | null
          source: string
          status?: string | null
          stripe_payment_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          granted_at?: string | null
          id?: string
          minutes_granted?: number
          minutes_remaining?: number
          pack_size?: string | null
          source?: string
          status?: string | null
          stripe_payment_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      voice_interview_charges: {
        Row: {
          amount_cents: number
          application_id: string | null
          billable: boolean
          created_at: string
          employer_id: string
          id: string
          job_id: string
          ordinal: number
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          voice_session_log_id: string | null
        }
        Insert: {
          amount_cents?: number
          application_id?: string | null
          billable?: boolean
          created_at?: string
          employer_id: string
          id?: string
          job_id: string
          ordinal: number
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          voice_session_log_id?: string | null
        }
        Update: {
          amount_cents?: number
          application_id?: string | null
          billable?: boolean
          created_at?: string
          employer_id?: string
          id?: string
          job_id?: string
          ordinal?: number
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          voice_session_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_interview_charges_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_interview_charges_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_interview_charges_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "published_jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_interview_charges_voice_session_log_id_fkey"
            columns: ["voice_session_log_id"]
            isOneToOne: false
            referencedRelation: "voice_session_log"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_session_log: {
        Row: {
          application_id: string | null
          caller_user_id: string
          created_at: string
          employer_id: string
          ended_at: string | null
          hard_cap_minutes: number
          id: string
          minutes_charged: number | null
          mode: string
          started_at: string
          time_limit_minutes: number
        }
        Insert: {
          application_id?: string | null
          caller_user_id: string
          created_at?: string
          employer_id: string
          ended_at?: string | null
          hard_cap_minutes?: number
          id?: string
          minutes_charged?: number | null
          mode: string
          started_at?: string
          time_limit_minutes: number
        }
        Update: {
          application_id?: string | null
          caller_user_id?: string
          created_at?: string
          employer_id?: string
          ended_at?: string | null
          hard_cap_minutes?: number
          id?: string
          minutes_charged?: number | null
          mode?: string
          started_at?: string
          time_limit_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_session_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employer_public_branding: {
        Row: {
          company_logo: string | null
          company_name: string | null
          user_id: string | null
        }
        Insert: {
          company_logo?: string | null
          company_name?: string | null
          user_id?: string | null
        }
        Update: {
          company_logo?: string | null
          company_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      published_jobs_public: {
        Row: {
          application_deadline: string | null
          application_questions: Json | null
          benefits: string[] | null
          created_at: string | null
          department: string | null
          description: string | null
          employer_id: string | null
          exclude_from_feed: boolean | null
          experience_level: string | null
          id: string | null
          is_remote: boolean | null
          job_code: string | null
          job_type: string | null
          latitude: number | null
          location: string | null
          location_city: string | null
          location_country: string | null
          location_country_code: string | null
          location_region: string | null
          locations: Json | null
          longitude: number | null
          quiz_questions: Json | null
          require_resume: boolean | null
          requirements: string | null
          responsibilities: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          skills_required: string[] | null
          slug: string | null
          title: string | null
          workflow_steps: Json | null
        }
        Insert: {
          application_deadline?: string | null
          application_questions?: never
          benefits?: string[] | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employer_id?: string | null
          exclude_from_feed?: boolean | null
          experience_level?: string | null
          id?: string | null
          is_remote?: boolean | null
          job_code?: string | null
          job_type?: string | null
          latitude?: number | null
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_region?: string | null
          locations?: Json | null
          longitude?: number | null
          quiz_questions?: never
          require_resume?: boolean | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          skills_required?: string[] | null
          slug?: string | null
          title?: string | null
          workflow_steps?: never
        }
        Update: {
          application_deadline?: string | null
          application_questions?: never
          benefits?: string[] | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employer_id?: string | null
          exclude_from_feed?: boolean | null
          experience_level?: string | null
          id?: string | null
          is_remote?: boolean | null
          job_code?: string | null
          job_type?: string | null
          latitude?: number | null
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_region?: string | null
          locations?: Json | null
          longitude?: number | null
          quiz_questions?: never
          require_resume?: boolean | null
          requirements?: string | null
          responsibilities?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          skills_required?: string[] | null
          slug?: string | null
          title?: string | null
          workflow_steps?: never
        }
        Relationships: []
      }
    }
    Functions: {
      accept_team_invitation: { Args: { p_code: string }; Returns: string }
      add_applicant_note: {
        Args: { p_application_id: string; p_body: string }
        Returns: Json
      }
      assessment_duration_text: { Args: { p_ms: number }; Returns: string }
      assessment_integrity_alert: {
        Args: { p_session_id: string }
        Returns: number
      }
      assessment_journey: {
        Args: { p_has_quiz: boolean; p_workflow_steps: Json }
        Returns: Json
      }
      assessment_jsonb_truthy: { Args: { p_value: Json }; Returns: boolean }
      assessment_notes_object: { Args: { p_notes: string }; Returns: Json }
      assessment_session_for_write: {
        Args: { p_access: Json }
        Returns: Json
      }
      assessment_session_payload: {
        Args: { p_session_id: string; p_with_turns: boolean }
        Returns: Json
      }
      assessment_step_access: {
        Args: { p_application_id: string; p_caller: string; p_step_id: string }
        Returns: Json
      }
      assessment_step_completion: {
        Args: {
          p_app_status: string
          p_application_id: string
          p_notes: Json
          p_phase: string
          p_step_id: string
          p_step_type: string
          p_voice_result: Json
        }
        Returns: Json
      }
      assign_user_role: { Args: { p_role: string }; Returns: undefined }
      block_applicant: {
        Args: { p_application_id: string; p_reason?: string | null }
        Returns: Json
      }
      block_applicants: {
        Args: { p_application_ids: string[]; p_reason?: string | null }
        Returns: Json
      }
      can_create_document_workflows_for_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_create_jobs_for_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_invite_team_members: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_view_applicant_profile: {
        Args: { p_profile_user_id: string; p_viewer_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_limit: number
          p_window_secs: number
        }
        Returns: Json
      }
      delete_applicant_note: { Args: { p_note_id: string }; Returns: boolean }
      did_candidate_apply_to_job: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: boolean
      }
      document_workflow_count_for_user: {
        Args: { target_user_id: string }
        Returns: number
      }
      document_workflow_limit_for_user: {
        Args: { target_user_id: string }
        Returns: number
      }
      email_exists: { Args: { p_email: string }; Returns: boolean }
      ensure_profile_exists: { Args: { p_user_id: string }; Returns: undefined }
      get_billing_flags: {
        Args: never
        Returns: {
          billing_enabled: boolean
          boost_enabled: boolean
        }[]
      }
      get_employer_sealed_application_ids: {
        Args: never
        Returns: {
          application_id: string
        }[]
      }
      get_job_billing_status: {
        Args: { p_job_id: string }
        Returns: {
          active_unlock_expires_at: string
          applicant_count: number
          billing_enabled: boolean
          has_active_unlock: boolean
          is_locked: boolean
          pack_count: number
          processed_allowance: number
          sealed_count: number
          unlock_count: number
          voice_included_total: number
          voice_next_is_billable: boolean
          voice_used: number
        }[]
      }
      get_careers_traffic: {
        Args: { p_days?: number }
        Returns: {
          apply_views: number
          careers_views: number
          day: string
          job_views: number
        }[]
      }
      get_job_quiz_keys: {
        Args: { p_job_id: string }
        Returns: {
          key: Json
          question_id: string
          step_id: string
        }[]
      }
      get_team_invitation_by_code: {
        Args: { p_code: string }
        Returns: {
          assigned_job_ids: string[]
          can_create_jobs: boolean
          can_delete_jobs: boolean
          can_manage_pipeline: boolean
          can_message_candidates: boolean
          can_schedule_interviews: boolean
          can_send_documents: boolean
          company_name: string
          department: string
          expires_at: string
          invitee_email: string
          invitee_name: string
          inviter_name: string
          permission_level: string
          status: Database["public"]["Enums"]["invitation_status"]
        }[]
      }
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
      grant_quiz_retake: {
        Args: { p_candidate_id: string; p_job_id: string; p_step_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_team_member_for_job: {
        Args: {
          p_job_id: string
          p_require_create_jobs?: boolean
          p_require_delete_jobs?: boolean
          p_require_manage_pipeline?: boolean
          p_user_id: string
        }
        Returns: boolean
      }
      is_job_owner: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _employer_id: string; _user_id: string }
        Returns: boolean
      }
      job_active_pack_count: { Args: { p_job_id: string }; Returns: number }
      job_applicant_count: { Args: { p_job_id: string }; Returns: number }
      job_has_active_unlock: { Args: { p_job_id: string }; Returns: boolean }
      job_is_locked: { Args: { p_job_id: string }; Returns: boolean }
      job_limit_for_user: { Args: { target_user_id: string }; Returns: number }
      job_processed_allowance: { Args: { p_job_id: string }; Returns: number }
      job_sealed_count: { Args: { p_job_id: string }; Returns: number }
      job_unlock_count: { Args: { p_job_id: string }; Returns: number }
      job_voice_included_total: { Args: { p_job_id: string }; Returns: number }
      job_voice_interview_is_billable: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      job_voice_interviews_used: { Args: { p_job_id: string }; Returns: number }
      mark_applicant_viewed: {
        Args: { p_application_id: string }
        Returns: string
      }
      mark_stale_assessment_sessions: {
        Args: { p_idle_minutes?: number }
        Returns: number
      }
      mark_waiting_on_computer: {
        Args: {
          p_application_id: string
          p_device_kind: string
          p_step_id: string
        }
        Returns: Json
      }
      open_assessment_session: {
        Args: {
          p_application_id: string
          p_candidate_id: string
          p_step_id: string
        }
        Returns: Json
      }
      protected_application_notes_subset: {
        Args: { p_notes: Json }
        Returns: Json
      }
      protected_trusted_result_notes_subset: {
        Args: { p_notes: Json }
        Returns: Json
      }
      prune_rate_limits: { Args: never; Returns: undefined }
      reconcile_orphaned_profiles: {
        Args: never
        Returns: {
          company_names_filled: number
          profiles_created: number
          roles_assigned: number
        }[]
      }
      record_client_error_event: {
        Args: {
          p_browser_family: string
          p_fingerprint: string
          p_message: string
          p_release: string
          p_route: string
          p_stack: string
          p_user_id: string
          p_user_role: string
        }
        Returns: {
          out_id: string
          out_is_new: boolean
          out_occurrence_count: number
        }[]
      }
      record_integrity_events: {
        Args: { p_application_id: string; p_events: Json; p_step_id: string }
        Returns: Json
      }
      record_page_view: {
        Args: {
          p_day: string
          p_device_class: string
          p_path: string
          p_referrer_host: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
        }
        Returns: undefined
      }
      record_quiz_answer: {
        Args: {
          p_answer: Json
          p_application_id: string
          p_question_id: string
          p_shown_at?: string
        }
        Returns: Json
      }
      save_application_draft: {
        Args: { p_answers: Json; p_application_id: string }
        Returns: Json
      }
      set_applications_shortlisted: {
        Args: { p_application_ids: string[]; p_shortlisted: boolean }
        Returns: Json
      }
      save_interview_ratings: {
        Args: {
          p_answers: Json
          p_application_id: string
          p_overall_note: string
        }
        Returns: Json
      }
      set_chat_state: {
        Args: { p_action: string; p_contact_id: string }
        Returns: Json
      }
      start_assessment_session: {
        Args: { p_application_id: string; p_step_id: string }
        Returns: Json
      }
      submit_quiz_attempt: {
        Args: {
          p_answers: Json
          p_application_id: string
          p_step_id: string
          p_violations?: Json
        }
        Returns: Json
      }
      submit_voice_interview_manual_end: {
        Args: {
          p_application_id: string
          p_duration_seconds?: number
          p_transcript: Json
        }
        Returns: Json
      }
      subscription_plan_for_limits: {
        Args: { target_user_id: string }
        Returns: string
      }
      team_member_limit_for_user: {
        Args: { target_user_id: string }
        Returns: number
      }
      touch_assessment_session: {
        Args: {
          p_active?: boolean
          p_hidden?: boolean
          p_progress?: Json
          p_session_id: string
        }
        Returns: Json
      }
      trusted_result_key_for: {
        Args: { p_key: string; p_type: string }
        Returns: string
      }
      unblock_applicant: { Args: { p_candidate_id: string }; Returns: number }
    }
    Enums: {
      app_role: "employer" | "candidate" | "team_member" | "developer"
      application_status:
        | "pending"
        | "reviewing"
        | "interview"
        | "offered"
        | "hired"
        | "rejected"
        | "in_progress"
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
        | "integrity"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["employer", "candidate", "team_member", "developer"],
      application_status: [
        "pending",
        "reviewing",
        "interview",
        "offered",
        "hired",
        "rejected",
        "in_progress",
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
        "integrity",
      ],
    },
  },
} as const
