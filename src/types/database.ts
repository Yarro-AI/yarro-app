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
      c1_compliance_certificates: {
        Row: {
          certificate_number: string | null
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          contractor_id: string | null
          created_at: string
          document_url: string | null
          expiry_date: string | null
          id: string
          issued_by: string | null
          issued_date: string | null
          last_reminder_at: string | null
          notes: string | null
          property_id: string
          property_manager_id: string | null
          reminder_count: number
          reminder_days_before: number | null
          reminder_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          contractor_id?: string | null
          created_at?: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          property_id: string
          property_manager_id?: string | null
          reminder_count?: number
          reminder_days_before?: number | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          certificate_type?: Database["public"]["Enums"]["certificate_type"]
          contractor_id?: string | null
          created_at?: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          property_id?: string
          property_manager_id?: string | null
          reminder_count?: number
          reminder_days_before?: number | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_compliance_certificates_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "c1_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_compliance_certificates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_compliance_certificates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "c1_compliance_certificates_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_compliance_requirements: {
        Row: {
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          created_at: string
          id: string
          is_required: boolean
          property_id: string
          property_manager_id: string
        }
        Insert: {
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          created_at?: string
          id?: string
          is_required?: boolean
          property_id: string
          property_manager_id: string
        }
        Update: {
          certificate_type?: Database["public"]["Enums"]["certificate_type"]
          created_at?: string
          id?: string
          is_required?: boolean
          property_id?: string
          property_manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_compliance_requirements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_compliance_requirements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "c1_compliance_requirements_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_contractors: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          active: boolean
          categories: string[]
          category: string
          contact_method: string
          contractor_email: string | null
          contractor_name: string
          contractor_phone: string | null
          created_at: string
          external_ref: string | null
          id: string
          is_demo: boolean | null
          property_ids: string[] | null
          property_manager_id: string | null
          service_areas: string[] | null
          verification_sent_at: string | null
          verification_token: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          categories?: string[]
          category: string
          contact_method?: string
          contractor_email?: string | null
          contractor_name: string
          contractor_phone?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          is_demo?: boolean | null
          property_ids?: string[] | null
          property_manager_id?: string | null
          service_areas?: string[] | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          categories?: string[]
          category?: string
          contact_method?: string
          contractor_email?: string | null
          contractor_name?: string
          contractor_phone?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          is_demo?: boolean | null
          property_ids?: string[] | null
          property_manager_id?: string | null
          service_areas?: string[] | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_contractors_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_conversations: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          caller_name: string | null
          caller_phone: string | null
          caller_role: string | null
          caller_tag: string | null
          handoff: boolean | null
          id: string
          last_updated: string
          log: Json
          phone: string
          property_id: string | null
          property_manager_id: string | null
          stage: string | null
          status: string
          tenant_confirmed: boolean | null
          tenant_id: string | null
          updates_recipient: string | null
          verification_type: string | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          caller_role?: string | null
          caller_tag?: string | null
          handoff?: boolean | null
          id?: string
          last_updated?: string
          log?: Json
          phone: string
          property_id?: string | null
          property_manager_id?: string | null
          stage?: string | null
          status?: string
          tenant_confirmed?: boolean | null
          tenant_id?: string | null
          updates_recipient?: string | null
          verification_type?: string | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          caller_role?: string | null
          caller_tag?: string | null
          handoff?: boolean | null
          id?: string
          last_updated?: string
          log?: Json
          phone?: string
          property_id?: string | null
          property_manager_id?: string | null
          stage?: string | null
          status?: string
          tenant_confirmed?: boolean | null
          tenant_id?: string | null
          updates_recipient?: string | null
          verification_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "c1_conversations_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "c1_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_events: {
        Row: {
          actor_name: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          portfolio_id: string
          property_label: string | null
          ticket_id: string | null
        }
        Insert: {
          actor_name?: string | null
          actor_type: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          portfolio_id: string
          property_label?: string | null
          ticket_id?: string | null
        }
        Update: {
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          portfolio_id?: string
          property_label?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_events_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_feedback: {
        Row: {
          category: string
          context: string | null
          created_at: string | null
          id: string
          message: string
          property_manager_id: string
          ticket_id: string | null
        }
        Insert: {
          category?: string
          context?: string | null
          created_at?: string | null
          id?: string
          message: string
          property_manager_id: string
          ticket_id?: string | null
        }
        Update: {
          category?: string
          context?: string | null
          created_at?: string | null
          id?: string
          message?: string
          property_manager_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_feedback_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_import_jobs: {
        Row: {
          completed_at: string | null
          counts: Json | null
          created_at: string
          errors: Json | null
          id: string
          import_batch_id: string | null
          integration_id: string
          property_manager_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          counts?: Json | null
          created_at?: string
          errors?: Json | null
          id?: string
          import_batch_id?: string | null
          integration_id: string
          property_manager_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          counts?: Json | null
          created_at?: string
          errors?: Json | null
          id?: string
          import_batch_id?: string | null
          integration_id?: string
          property_manager_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_import_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "c1_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_import_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "v_integrations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_import_jobs_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_integrations: {
        Row: {
          access_token: string | null
          connected_at: string | null
          created_at: string
          credentials: Json
          error_message: string | null
          id: string
          last_sync_at: string | null
          property_manager_id: string
          provider: string
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          credentials?: Json
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          property_manager_id: string
          provider: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          credentials?: Json
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          property_manager_id?: string
          provider?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_integrations_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_job_completions: {
        Row: {
          attempts: Json | null
          completed: boolean | null
          completion_text: string | null
          contractor_id: string | null
          conversation_id: string | null
          created_at: string
          fillout_submission_id: string | null
          id: string
          inbound_sid: string | null
          job_stage_at_receive: string | null
          markup_amount: number | null
          media_urls: Json | null
          notes: string | null
          property_id: string | null
          quote_amount: number | null
          reason: string | null
          received_at: string
          source: string | null
          tenant_id: string | null
          ticket_status_at_receive: string | null
          total_amount: number | null
        }
        Insert: {
          attempts?: Json | null
          completed?: boolean | null
          completion_text?: string | null
          contractor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          fillout_submission_id?: string | null
          id: string
          inbound_sid?: string | null
          job_stage_at_receive?: string | null
          markup_amount?: number | null
          media_urls?: Json | null
          notes?: string | null
          property_id?: string | null
          quote_amount?: number | null
          reason?: string | null
          received_at: string
          source?: string | null
          tenant_id?: string | null
          ticket_status_at_receive?: string | null
          total_amount?: number | null
        }
        Update: {
          attempts?: Json | null
          completed?: boolean | null
          completion_text?: string | null
          contractor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          fillout_submission_id?: string | null
          id?: string
          inbound_sid?: string | null
          job_stage_at_receive?: string | null
          markup_amount?: number | null
          media_urls?: Json | null
          notes?: string | null
          property_id?: string | null
          quote_amount?: number | null
          reason?: string | null
          received_at?: string
          source?: string | null
          tenant_id?: string | null
          ticket_status_at_receive?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_job_completions_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "c1_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_job_completions_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_job_completions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_job_completions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "c1_job_completions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "c1_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_landlords: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          contact_method: string
          created_at: string
          email: string | null
          external_ref: string | null
          full_name: string
          id: string
          phone: string | null
          property_manager_id: string | null
          updated_at: string
          verification_sent_at: string | null
          verification_token: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          contact_method?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
          full_name: string
          id?: string
          phone?: string | null
          property_manager_id?: string | null
          updated_at?: string
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          contact_method?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          property_manager_id?: string | null
          updated_at?: string
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_landlords_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_ledger: {
        Row: {
          actor_role: string
          created_at: string
          data: Json | null
          event_type: string
          id: string
          ticket_id: string
        }
        Insert: {
          actor_role?: string
          created_at?: string
          data?: Json | null
          event_type: string
          id?: string
          ticket_id: string
        }
        Update: {
          actor_role?: string
          created_at?: string
          data?: Json | null
          event_type?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_ledger_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_messages: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          completion_pm_escalated_at: string | null
          completion_reminder_sent_at: string | null
          contractors: Json | null
          created_at: string | null
          landlord: Json | null
          manager: Json | null
          stage: string | null
          suppress_webhook: boolean | null
          ticket_id: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          completion_pm_escalated_at?: string | null
          completion_reminder_sent_at?: string | null
          contractors?: Json | null
          created_at?: string | null
          landlord?: Json | null
          manager?: Json | null
          stage?: string | null
          suppress_webhook?: boolean | null
          ticket_id: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          completion_pm_escalated_at?: string | null
          completion_reminder_sent_at?: string | null
          contractors?: Json | null
          created_at?: string | null
          landlord?: Json | null
          manager?: Json | null
          stage?: string | null
          suppress_webhook?: boolean | null
          ticket_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_outbound_log: {
        Row: {
          body: string | null
          content_variables: Json | null
          id: string
          message_type: string
          recipient_phone: string
          recipient_role: string
          sent_at: string | null
          status: string | null
          template_sid: string | null
          ticket_id: string | null
          twilio_sid: string | null
        }
        Insert: {
          body?: string | null
          content_variables?: Json | null
          id?: string
          message_type: string
          recipient_phone: string
          recipient_role: string
          sent_at?: string | null
          status?: string | null
          template_sid?: string | null
          ticket_id?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string | null
          content_variables?: Json | null
          id?: string
          message_type?: string
          recipient_phone?: string
          recipient_role?: string
          sent_at?: string | null
          status?: string | null
          template_sid?: string | null
          ticket_id?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_outbound_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "c1_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_profiles: {
        Row: {
          active: boolean
          contractor_id: string | null
          created_at: string
          email: string | null
          id: string
          is_ooh_contact: boolean
          name: string
          phone: string | null
          pm_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          contractor_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_ooh_contact?: boolean
          name: string
          phone?: string | null
          pm_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          contractor_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_ooh_contact?: boolean
          name?: string
          phone?: string | null
          pm_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_profiles_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "c1_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_profiles_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_properties: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          access_instructions: string | null
          address: string
          auto_approve_limit: number | null
          city: string | null
          contractor_mapping: Json | null
          created_at: string
          emergency_access_contact: string | null
          external_ref: string | null
          id: string
          is_demo: boolean | null
          landlord_email: string | null
          landlord_id: string | null
          landlord_name: string | null
          landlord_phone: string | null
          property_manager_id: string | null
          property_type: string | null
          require_landlord_approval: boolean
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          access_instructions?: string | null
          address: string
          auto_approve_limit?: number | null
          city?: string | null
          contractor_mapping?: Json | null
          created_at?: string
          emergency_access_contact?: string | null
          external_ref?: string | null
          id?: string
          is_demo?: boolean | null
          landlord_email?: string | null
          landlord_id?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          property_manager_id?: string | null
          property_type?: string | null
          require_landlord_approval?: boolean
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          access_instructions?: string | null
          address?: string
          auto_approve_limit?: number | null
          city?: string | null
          contractor_mapping?: Json | null
          created_at?: string
          emergency_access_contact?: string | null
          external_ref?: string | null
          id?: string
          is_demo?: boolean | null
          landlord_email?: string | null
          landlord_id?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          property_manager_id?: string | null
          property_type?: string | null
          require_landlord_approval?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "c1_properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "c1_landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_properties_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_property_managers: {
        Row: {
          business_days: string[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          business_name: string
          completion_reminder_hours: number | null
          completion_timeout_hours: number | null
          contractor_reminder_minutes: number | null
          contractor_timeout_minutes: number | null
          created_at: string
          dispatch_mode: string
          email: string
          emergency_contact: string | null
          id: string
          landlord_followup_hours: number | null
          landlord_timeout_hours: number | null
          min_booking_lead_hours: number
          name: string
          onboarding_completed_at: string | null
          ooh_enabled: boolean
          ooh_routine_action: string
          phone: string | null
          preferred_contact_method: string | null
          role: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          ticket_mode: string
          trial_ends_at: string | null
          trial_starts_at: string | null
          user_id: string | null
        }
        Insert: {
          business_days?: string[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name: string
          completion_reminder_hours?: number | null
          completion_timeout_hours?: number | null
          contractor_reminder_minutes?: number | null
          contractor_timeout_minutes?: number | null
          created_at?: string
          dispatch_mode?: string
          email: string
          emergency_contact?: string | null
          id?: string
          landlord_followup_hours?: number | null
          landlord_timeout_hours?: number | null
          min_booking_lead_hours?: number
          name: string
          onboarding_completed_at?: string | null
          ooh_enabled?: boolean
          ooh_routine_action?: string
          phone?: string | null
          preferred_contact_method?: string | null
          role?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          ticket_mode?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          user_id?: string | null
        }
        Update: {
          business_days?: string[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name?: string
          completion_reminder_hours?: number | null
          completion_timeout_hours?: number | null
          contractor_reminder_minutes?: number | null
          contractor_timeout_minutes?: number | null
          created_at?: string
          dispatch_mode?: string
          email?: string
          emergency_contact?: string | null
          id?: string
          landlord_followup_hours?: number | null
          landlord_timeout_hours?: number | null
          min_booking_lead_hours?: number
          name?: string
          onboarding_completed_at?: string | null
          ooh_enabled?: boolean
          ooh_routine_action?: string
          phone?: string | null
          preferred_contact_method?: string | null
          role?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          ticket_mode?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      c1_rent_ledger: {
        Row: {
          amount_due: number
          amount_paid: number | null
          created_at: string | null
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          property_manager_id: string
          reminder_1_sent_at: string | null
          reminder_2_sent_at: string | null
          reminder_3_sent_at: string | null
          room_id: string
          status: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          created_at?: string | null
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          property_manager_id: string
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          room_id: string
          status?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          created_at?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          property_manager_id?: string
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          room_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_rent_ledger_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_rent_ledger_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "c1_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_rent_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "c1_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_rooms: {
        Row: {
          created_at: string | null
          current_tenant_id: string | null
          floor: string | null
          id: string
          is_vacant: boolean | null
          monthly_rent: number | null
          property_id: string
          property_manager_id: string
          rent_due_day: number | null
          rent_frequency: string
          room_name: string | null
          room_number: string
          tenancy_end_date: string | null
          tenancy_start_date: string | null
          tenancy_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_tenant_id?: string | null
          floor?: string | null
          id?: string
          is_vacant?: boolean | null
          monthly_rent?: number | null
          property_id: string
          property_manager_id: string
          rent_due_day?: number | null
          rent_frequency?: string
          room_name?: string | null
          room_number: string
          tenancy_end_date?: string | null
          tenancy_start_date?: string | null
          tenancy_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_tenant_id?: string | null
          floor?: string | null
          id?: string
          is_vacant?: boolean | null
          monthly_rent?: number | null
          property_id?: string
          property_manager_id?: string
          rent_due_day?: number | null
          rent_frequency?: string
          room_name?: string | null
          room_number?: string
          tenancy_end_date?: string | null
          tenancy_start_date?: string | null
          tenancy_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_rooms_current_tenant_id_fkey"
            columns: ["current_tenant_id"]
            isOneToOne: false
            referencedRelation: "c1_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "c1_rooms_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      c1_tenants: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          created_at: string
          email: string | null
          external_ref: string | null
          full_name: string | null
          id: string
          is_demo: boolean | null
          phone: string | null
          property_id: string | null
          property_manager_id: string | null
          role_tag: string | null
          room_id: string | null
          verification_sent_at: string | null
          verification_token: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          external_ref?: string | null
          full_name?: string | null
          id?: string
          is_demo?: boolean | null
          phone?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          role_tag?: string | null
          room_id?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          external_ref?: string | null
          full_name?: string | null
          id?: string
          is_demo?: boolean | null
          phone?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          role_tag?: string | null
          room_id?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_tenants_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_tenants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "c1_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
        ]
      }
      c1_tickets: {
        Row: {
          _audit_log: Json | null
          access: string | null
          access_granted: boolean | null
          archived: boolean | null
          archived_at: string | null
          availability: string | null
          category: string | null
          compliance_certificate_id: string | null
          confirmation_date: string | null
          contractor_id: string | null
          contractor_ids: string[] | null
          contractor_quote: number | null
          contractor_token: string | null
          contractor_token_at: string | null
          conversation_id: string | null
          date_logged: string
          dispatch_after: string | null
          final_amount: number | null
          handoff: boolean | null
          held_at: string | null
          id: string
          images: Json | null
          is_demo: boolean | null
          is_manual: boolean | null
          issue_description: string | null
          issue_title: string | null
          job_stage: string | null
          landlord_allocated: boolean | null
          landlord_allocated_at: string | null
          landlord_approved_on: string | null
          landlord_cost: number | null
          landlord_notes: string | null
          landlord_outcome: string | null
          landlord_outcome_at: string | null
          landlord_submissions: Json | null
          landlord_token: string | null
          next_action: string | null
          next_action_reason: string | null
          on_hold: boolean | null
          ooh_contact_id: string | null
          ooh_cost: number | null
          ooh_dispatched: boolean | null
          ooh_dispatched_at: string | null
          ooh_notes: string | null
          ooh_outcome: string | null
          ooh_outcome_at: string | null
          ooh_submissions: Json | null
          ooh_token: string | null
          pending_review: boolean
          priority: string | null
          property_id: string | null
          property_manager_id: string | null
          reporter_role: string | null
          reschedule_date: string | null
          reschedule_decided_at: string | null
          reschedule_reason: string | null
          reschedule_requested: boolean | null
          reschedule_status: string | null
          resolved_at: string | null
          room_id: string | null
          scheduled_date: string | null
          sla_due_at: string | null
          status: string
          tenant_id: string | null
          tenant_token: string | null
          tenant_token_at: string | null
          tenant_updates: Json | null
          total_hold_duration: string | null
          updates_recipient: string | null
          verified_by: string | null
          was_handoff: boolean | null
        }
        Insert: {
          _audit_log?: Json | null
          access?: string | null
          access_granted?: boolean | null
          archived?: boolean | null
          archived_at?: string | null
          availability?: string | null
          category?: string | null
          compliance_certificate_id?: string | null
          confirmation_date?: string | null
          contractor_id?: string | null
          contractor_ids?: string[] | null
          contractor_quote?: number | null
          contractor_token?: string | null
          contractor_token_at?: string | null
          conversation_id?: string | null
          date_logged?: string
          dispatch_after?: string | null
          final_amount?: number | null
          handoff?: boolean | null
          held_at?: string | null
          id?: string
          images?: Json | null
          is_demo?: boolean | null
          is_manual?: boolean | null
          issue_description?: string | null
          issue_title?: string | null
          job_stage?: string | null
          landlord_allocated?: boolean | null
          landlord_allocated_at?: string | null
          landlord_approved_on?: string | null
          landlord_cost?: number | null
          landlord_notes?: string | null
          landlord_outcome?: string | null
          landlord_outcome_at?: string | null
          landlord_submissions?: Json | null
          landlord_token?: string | null
          next_action?: string | null
          next_action_reason?: string | null
          on_hold?: boolean | null
          ooh_contact_id?: string | null
          ooh_cost?: number | null
          ooh_dispatched?: boolean | null
          ooh_dispatched_at?: string | null
          ooh_notes?: string | null
          ooh_outcome?: string | null
          ooh_outcome_at?: string | null
          ooh_submissions?: Json | null
          ooh_token?: string | null
          pending_review?: boolean
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          reschedule_date?: string | null
          reschedule_decided_at?: string | null
          reschedule_reason?: string | null
          reschedule_requested?: boolean | null
          reschedule_status?: string | null
          resolved_at?: string | null
          room_id?: string | null
          scheduled_date?: string | null
          sla_due_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_token?: string | null
          tenant_token_at?: string | null
          tenant_updates?: Json | null
          total_hold_duration?: string | null
          updates_recipient?: string | null
          verified_by?: string | null
          was_handoff?: boolean | null
        }
        Update: {
          _audit_log?: Json | null
          access?: string | null
          access_granted?: boolean | null
          archived?: boolean | null
          archived_at?: string | null
          availability?: string | null
          category?: string | null
          compliance_certificate_id?: string | null
          confirmation_date?: string | null
          contractor_id?: string | null
          contractor_ids?: string[] | null
          contractor_quote?: number | null
          contractor_token?: string | null
          contractor_token_at?: string | null
          conversation_id?: string | null
          date_logged?: string
          dispatch_after?: string | null
          final_amount?: number | null
          handoff?: boolean | null
          held_at?: string | null
          id?: string
          images?: Json | null
          is_demo?: boolean | null
          is_manual?: boolean | null
          issue_description?: string | null
          issue_title?: string | null
          job_stage?: string | null
          landlord_allocated?: boolean | null
          landlord_allocated_at?: string | null
          landlord_approved_on?: string | null
          landlord_cost?: number | null
          landlord_notes?: string | null
          landlord_outcome?: string | null
          landlord_outcome_at?: string | null
          landlord_submissions?: Json | null
          landlord_token?: string | null
          next_action?: string | null
          next_action_reason?: string | null
          on_hold?: boolean | null
          ooh_contact_id?: string | null
          ooh_cost?: number | null
          ooh_dispatched?: boolean | null
          ooh_dispatched_at?: string | null
          ooh_notes?: string | null
          ooh_outcome?: string | null
          ooh_outcome_at?: string | null
          ooh_submissions?: Json | null
          ooh_token?: string | null
          pending_review?: boolean
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          reschedule_date?: string | null
          reschedule_decided_at?: string | null
          reschedule_reason?: string | null
          reschedule_requested?: boolean | null
          reschedule_status?: string | null
          resolved_at?: string | null
          room_id?: string | null
          scheduled_date?: string | null
          sla_due_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_token?: string | null
          tenant_token_at?: string | null
          tenant_updates?: Json | null
          total_hold_duration?: string | null
          updates_recipient?: string | null
          verified_by?: string | null
          was_handoff?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_tickets_compliance_certificate_id_fkey"
            columns: ["compliance_certificate_id"]
            isOneToOne: false
            referencedRelation: "c1_compliance_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_tickets_ooh_contact_id_fkey"
            columns: ["ooh_contact_id"]
            isOneToOne: false
            referencedRelation: "c1_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_tickets_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "c1_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "c1_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "c1_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "v_properties_hub"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "c1_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_integrations_safe: {
        Row: {
          connected_at: string | null
          created_at: string | null
          error_message: string | null
          has_credentials: boolean | null
          id: string | null
          last_sync_at: string | null
          property_manager_id: string | null
          provider: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string | null
          error_message?: string | null
          has_credentials?: never
          id?: string | null
          last_sync_at?: string | null
          property_manager_id?: string | null
          provider?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string | null
          error_message?: string | null
          has_credentials?: never
          id?: string | null
          last_sync_at?: string | null
          property_manager_id?: string | null
          provider?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_integrations_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_properties_hub: {
        Row: {
          access_instructions: string | null
          address: string | null
          auto_approve_limit: number | null
          contractors: Json | null
          emergency_access_contact: string | null
          landlord_email: string | null
          landlord_id: string | null
          landlord_name: string | null
          landlord_phone: string | null
          occupied_rooms: number | null
          open_tickets: Json | null
          property_id: string | null
          property_manager_id: string | null
          recent_tickets: Json | null
          require_landlord_approval: boolean | null
          tenants: Json | null
          total_rooms: number | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "c1_landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c1_properties_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_generate_rent_all_pms: { Args: never; Returns: undefined }
      auto_generate_rent_entries: {
        Args: { p_month: number; p_pm_id: string; p_year: number }
        Returns: number
      }
      bulk_import_properties: {
        Args: { p_data: Json; p_pm_id: string }
        Returns: Json
      }
      bulk_import_tenants: {
        Args: { p_data: Json; p_pm_id: string }
        Returns: Json
      }
      c1_allocate_to_landlord: { Args: { p_ticket_id: string }; Returns: Json }
      c1_check_same_day_reminder: {
        Args: { p_ticket_id: string }
        Returns: {
          access_text: string
          arrival_slot: string
          contractor_phone: string
          contractor_token: string
          formatted_time: string
          formatted_window: string
          issue_title: string
          property_address: string
          scheduled_date: string
          ticket_id: string
        }[]
      }
      c1_complete_handoff_ticket: {
        Args: {
          p_access?: string
          p_availability?: string
          p_category?: string
          p_contractor_ids?: string[]
          p_issue_description?: string
          p_priority?: string
          p_property_id: string
          p_tenant_id?: string
          p_ticket_id: string
        }
        Returns: string
      }
      c1_completion_followup_check: { Args: never; Returns: number }
      c1_compute_next_action: {
        Args: { p_ticket_id: string }
        Returns: {
          next_action: string
          next_action_reason: string
        }[]
      }
      c1_confirm_followup_sent: {
        Args: {
          p_confirm_type: string
          p_contractor_id?: string
          p_ticket_id: string
        }
        Returns: undefined
      }
      c1_context_logic: {
        Args: { _message: Json; _phone: string }
        Returns: Json
      }
      c1_contractor_context: { Args: { ticket_uuid: string }; Returns: Json[] }
      c1_contractor_mark_sent: {
        Args: {
          p_body?: string
          p_contractor_id: string
          p_direction?: string
          p_has_image?: boolean
          p_status?: string
          p_ticket_id: string
          p_to?: string
          p_twilio_sid?: string
        }
        Returns: undefined
      }
      c1_contractor_timeout_check: { Args: never; Returns: number }
      c1_convo_append_outbound: {
        Args: { _conversation_id: string; _entry: Json }
        Returns: Json
      }
      c1_convo_close_no_match: {
        Args: { _conversation_id: string; _entry: Json }
        Returns: Json
      }
      c1_convo_finalize: {
        Args: { _conversation_id: string; _entry: Json }
        Returns: Json
      }
      c1_convo_finalize_quick: {
        Args: { _conversation_id: string; _entry: Json }
        Returns: Json
      }
      c1_create_manual_ticket: {
        Args: {
          p_access?: string
          p_availability?: string
          p_category?: string
          p_compliance_certificate_id?: string
          p_contractor_ids?: string[]
          p_images?: Json
          p_issue_description?: string
          p_issue_title?: string
          p_priority?: string
          p_property_id: string
          p_property_manager_id: string
          p_tenant_id?: string
        }
        Returns: string
      }
      c1_create_ticket: {
        Args: { _conversation_id: string; _issue: Json }
        Returns: {
          _audit_log: Json | null
          access: string | null
          access_granted: boolean | null
          archived: boolean | null
          archived_at: string | null
          availability: string | null
          category: string | null
          compliance_certificate_id: string | null
          confirmation_date: string | null
          contractor_id: string | null
          contractor_ids: string[] | null
          contractor_quote: number | null
          contractor_token: string | null
          contractor_token_at: string | null
          conversation_id: string | null
          date_logged: string
          dispatch_after: string | null
          final_amount: number | null
          handoff: boolean | null
          held_at: string | null
          id: string
          images: Json | null
          is_demo: boolean | null
          is_manual: boolean | null
          issue_description: string | null
          issue_title: string | null
          job_stage: string | null
          landlord_allocated: boolean | null
          landlord_allocated_at: string | null
          landlord_approved_on: string | null
          landlord_cost: number | null
          landlord_notes: string | null
          landlord_outcome: string | null
          landlord_outcome_at: string | null
          landlord_submissions: Json | null
          landlord_token: string | null
          next_action: string | null
          next_action_reason: string | null
          on_hold: boolean | null
          ooh_contact_id: string | null
          ooh_cost: number | null
          ooh_dispatched: boolean | null
          ooh_dispatched_at: string | null
          ooh_notes: string | null
          ooh_outcome: string | null
          ooh_outcome_at: string | null
          ooh_submissions: Json | null
          ooh_token: string | null
          pending_review: boolean
          priority: string | null
          property_id: string | null
          property_manager_id: string | null
          reporter_role: string | null
          reschedule_date: string | null
          reschedule_decided_at: string | null
          reschedule_reason: string | null
          reschedule_requested: boolean | null
          reschedule_status: string | null
          resolved_at: string | null
          room_id: string | null
          scheduled_date: string | null
          sla_due_at: string | null
          status: string
          tenant_id: string | null
          tenant_token: string | null
          tenant_token_at: string | null
          tenant_updates: Json | null
          total_hold_duration: string | null
          updates_recipient: string | null
          verified_by: string | null
          was_handoff: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "c1_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      c1_dispatch_from_review: {
        Args: {
          p_category?: string
          p_issue_description?: string
          p_priority?: string
          p_ticket_id: string
        }
        Returns: Json
      }
      c1_finalize_job: { Args: { p_ticket_id: string }; Returns: Json }
      c1_find_property_candidate: {
        Args: { _raw: string }
        Returns: {
          id: string
          match_type: string
        }[]
      }
      c1_find_tenant_candidate: {
        Args: { _property_id: string; _search: string }
        Returns: {
          id: string
          match_type: string
        }[]
      }
      c1_get_contractor_quote_context: {
        Args: { p_token: string }
        Returns: Json
      }
      c1_get_contractor_ticket: { Args: { p_token: string }; Returns: Json }
      c1_get_dashboard_todo: { Args: { p_pm_id: string }; Returns: Json[] }
      c1_get_dashboard_todo_extras: {
        Args: { p_pm_id: string }
        Returns: Json[]
      }
      c1_get_landlord_ticket: { Args: { p_token: string }; Returns: Json }
      c1_get_onboarding_checklist: { Args: { p_pm_id: string }; Returns: Json }
      c1_get_ooh_contacts: {
        Args: { p_pm_id: string }
        Returns: {
          contractor_id: string
          email: string
          id: string
          name: string
          phone: string
          role: string
        }[]
      }
      c1_get_ooh_ticket: { Args: { p_token: string }; Returns: Json }
      c1_get_recent_events: {
        Args: { p_cursor?: string; p_limit?: number; p_pm_id: string }
        Returns: Json
      }
      c1_get_tenant_ticket: { Args: { p_token: string }; Returns: Json }
      c1_inbound_reply: {
        Args: {
          p_body: string
          p_from: string
          p_interactive_data?: string
          p_message_sid?: string
          p_num_media?: number
          p_original_sid?: string
        }
        Returns: Json
      }
      c1_is_within_business_hours: {
        Args: { p_check_time?: string; p_pm_id: string }
        Returns: boolean
      }
      c1_job_reminder_list: { Args: { p_run_date: string }; Returns: Json[] }
      c1_job_reminder_payload: { Args: { p_ticket_id: string }; Returns: Json }
      c1_landlord_mark_sent: {
        Args: {
          p_body: string
          p_direction: string
          p_status: string
          p_ticket_id: string
          p_to: string
          p_twilio_sid: string
        }
        Returns: undefined
      }
      c1_landlord_timeout_check: { Args: never; Returns: number }
      c1_log_event: {
        Args: {
          p_actor_name?: string
          p_actor_type?: string
          p_event_type: string
          p_metadata?: Json
          p_property_label?: string
          p_ticket_id: string
        }
        Returns: undefined
      }
      c1_log_outbound: {
        Args: {
          p_body?: string
          p_content_variables?: Json
          p_message_type: string
          p_recipient_phone: string
          p_recipient_role: string
          p_status?: string
          p_template_sid?: string
          p_ticket_id: string
          p_twilio_sid?: string
        }
        Returns: string
      }
      c1_log_system_event: {
        Args: {
          p_event_type: string
          p_metadata?: Json
          p_pm_id: string
          p_property_label?: string
        }
        Returns: undefined
      }
      c1_manager_decision_from_app: {
        Args: { p_approved: boolean; p_markup?: string; p_ticket_id: string }
        Returns: Json
      }
      c1_message_next_action: { Args: { p_ticket_id: string }; Returns: Json }
      c1_msg_merge_contractor: {
        Args: { p_contractor_id: string; p_patch: Json; p_ticket_id: string }
        Returns: number
      }
      c1_pm_mark_sent: {
        Args: {
          p_body?: string
          p_contractor_id: string
          p_direction?: string
          p_status?: string
          p_ticket_id: string
          p_to?: string
          p_twilio_sid?: string
        }
        Returns: undefined
      }
      c1_prepare_landlord_sms: { Args: { p_ticket_id: string }; Returns: Json }
      c1_process_delayed_dispatches: { Args: never; Returns: Json }
      c1_process_job_completion: {
        Args: {
          p_completed: boolean
          p_completion_text?: string
          p_fillout_submission_id?: string
          p_inbound_sid?: string
          p_media_urls?: Json
          p_notes?: string
          p_reason?: string
          p_source: string
          p_ticket_id: string
        }
        Returns: Json
      }
      c1_public_ticket_images: { Args: { p_ticket_id: string }; Returns: Json }
      c1_redispatch_contractor: {
        Args: { p_contractor_id: string; p_ticket_id: string }
        Returns: Json
      }
      c1_reset_account: { Args: { p_pm_id: string }; Returns: Json }
      c1_submit_contractor_completion: {
        Args: { p_notes?: string; p_photos?: Json; p_token: string }
        Returns: Json
      }
      c1_submit_contractor_not_completed: {
        Args: { p_reason?: string; p_token: string }
        Returns: Json
      }
      c1_submit_contractor_schedule: {
        Args: {
          p_date: string
          p_notes?: string
          p_time_slot?: string
          p_token: string
        }
        Returns: Json
      }
      c1_submit_landlord_outcome: {
        Args: {
          p_cost?: number
          p_notes?: string
          p_outcome: string
          p_token: string
        }
        Returns: Json
      }
      c1_submit_ooh_outcome: {
        Args: {
          p_cost?: number
          p_notes?: string
          p_outcome: string
          p_token: string
        }
        Returns: Json
      }
      c1_submit_reschedule_decision: {
        Args: { p_approved: boolean; p_token: string }
        Returns: Json
      }
      c1_submit_reschedule_request: {
        Args: { p_proposed_date: string; p_reason: string; p_token: string }
        Returns: Json
      }
      c1_submit_tenant_confirmation: {
        Args: { p_notes?: string; p_resolved: boolean; p_token: string }
        Returns: Json
      }
      c1_ticket_context: {
        Args: { ticket_uuid: string }
        Returns: {
          access: string
          access_granted: boolean
          access_instructions: string
          auto_approve_limit: number
          availability: string
          business_name: string
          caller_name: string
          caller_phone: string
          caller_role: string
          caller_tag: string
          category: string
          contractor_mapping: Json
          conversation_id: string
          date_logged: string
          emergency_access_contact: string
          handoff: boolean
          has_images: boolean
          is_matched_tenant: boolean
          issue_description: string
          job_stage: string
          label: string
          landlord_email: string
          landlord_id: string
          landlord_name: string
          landlord_phone: string
          manager_email: string
          manager_name: string
          manager_phone: string
          priority: string
          property_address: string
          property_id: string
          property_manager_id: string
          recipient: Json
          reporter_role: string
          tenant_contact: Json
          tenant_email: string
          tenant_name: string
          tenant_phone: string
          tenant_role_tag: string
          tenant_verified_by: string
          ticket_id: string
          ticket_status: string
          update_contact: Json
          updates_recipient: string
        }[]
      }
      c1_toggle_hold: {
        Args: { p_on_hold: boolean; p_ticket_id: string }
        Returns: Json
      }
      c1_upsert_contact: {
        Args: {
          p_email: string
          p_full_name: string
          p_phone: string
          p_property_id: string
          p_role_tag?: string
          p_verified_by?: string
        }
        Returns: string
      }
      compliance_delete_certificate: {
        Args: { p_cert_id: string; p_pm_id: string }
        Returns: boolean
      }
      compliance_get_all_statuses: {
        Args: { p_pm_id: string }
        Returns: {
          cert_id: string
          certificate_number: string
          certificate_type: string
          days_remaining: number
          display_status: string
          document_url: string
          expiry_date: string
          issued_by: string
          issued_date: string
          property_address: string
          property_id: string
          renewal_ticket_id: string
        }[]
      }
      compliance_get_certificates: {
        Args: { p_pm_id: string; p_property_id: string }
        Returns: {
          certificate_number: string
          certificate_type: string
          contractor_id: string
          created_at: string
          document_url: string
          expiry_date: string
          id: string
          issued_by: string
          issued_date: string
          notes: string
          property_id: string
          property_manager_id: string
          reminder_days_before: number
          reminder_sent_at: string
          status: string
          updated_at: string
        }[]
      }
      compliance_get_property_status: {
        Args: { p_pm_id: string; p_property_id: string }
        Returns: {
          cert_id: string
          certificate_number: string
          certificate_type: string
          contractor_id: string
          days_remaining: number
          display_status: string
          document_url: string
          expiry_date: string
          issued_by: string
          reminder_days_before: number
          renewal_ticket_id: string
        }[]
      }
      compliance_get_summary: { Args: { p_pm_id: string }; Returns: Json }
      compliance_get_todos: {
        Args: { p_pm_id: string }
        Returns: {
          action: string
          cert_id: string
          cert_type: string
          days_remaining: number
          property_address: string
          property_id: string
          urgency_label: string
        }[]
      }
      compliance_set_property_type: {
        Args: {
          p_pm_id: string
          p_property_id: string
          p_property_type: string
        }
        Returns: undefined
      }
      compliance_submit_contractor_renewal: {
        Args: {
          p_certificate_number?: string
          p_document_url: string
          p_expiry_date: string
          p_issued_by?: string
          p_notes?: string
          p_token: string
        }
        Returns: Json
      }
      compliance_upsert_certificate: {
        Args: {
          p_certificate_number?: string
          p_certificate_type: string
          p_contractor_id?: string
          p_expiry_date?: string
          p_issued_by?: string
          p_issued_date?: string
          p_notes?: string
          p_pm_id: string
          p_property_id: string
          p_reminder_days_before?: number
        }
        Returns: string
      }
      compliance_upsert_requirements: {
        Args: { p_pm_id: string; p_property_id: string; p_requirements: Json }
        Returns: undefined
      }
      create_rent_ledger_entries: {
        Args: {
          p_month: number
          p_pm_id: string
          p_property_id: string
          p_year: number
        }
        Returns: number
      }
      generate_verification_token: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      generate_verification_tokens_batch: {
        Args: { p_entity_ids: string[]; p_entity_type: string; p_pm_id: string }
        Returns: Json
      }
      get_ai_actions_count: { Args: { p_pm_id: string }; Returns: Json }
      get_compliance_expiring: {
        Args: { p_days_ahead?: number; p_pm_id?: string }
        Returns: {
          cert_id: string
          certificate_type: string
          contractor_contact_method: string
          contractor_email: string
          contractor_id: string
          contractor_name: string
          contractor_phone: string
          days_remaining: number
          expiry_date: string
          pm_email: string
          pm_name: string
          pm_phone: string
          property_address: string
          property_id: string
          property_manager_id: string
          reminder_count: number
          reminder_days_before: number
        }[]
      }
      get_occupancy_summary: { Args: { p_pm_id: string }; Returns: Json }
      get_onboarding_send_targets: {
        Args: { p_entity_type: string; p_pm_id: string }
        Returns: Json
      }
      get_pm_id: { Args: never; Returns: string }
      get_rent_cashflow_distribution: {
        Args: { p_month: number; p_pm_id: string; p_year: number }
        Returns: {
          collected_amount: number
          due_day: number
          entry_count: number
          expected_amount: number
        }[]
      }
      get_rent_collection_trend: {
        Args: { p_months_back?: number; p_pm_id: string }
        Returns: {
          collection_rate: number
          entry_count: number
          month: number
          month_label: string
          total_collected: number
          total_due: number
          total_overdue: number
          year: number
        }[]
      }
      get_rent_dashboard_summary: { Args: { p_pm_id: string }; Returns: Json }
      get_rent_income_summary: { Args: { p_pm_id: string }; Returns: Json }
      get_rent_ledger_for_month: {
        Args: { p_month: number; p_pm_id: string; p_year: number }
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          effective_status: string
          property_address: string
          property_id: string
          rent_ledger_id: string
          room_number: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_rent_portfolio_summary: {
        Args: { p_month: number; p_pm_id: string; p_year: number }
        Returns: {
          collection_rate: number
          occupied_rooms: number
          outstanding: number
          overdue_amount: number
          overdue_count: number
          paid_count: number
          partial_count: number
          pending_count: number
          property_address: string
          property_id: string
          total_due: number
          total_paid: number
          total_rooms: number
        }[]
      }
      get_rent_reminders_due: {
        Args: never
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          ledger_id: string
          property_address: string
          property_manager_id: string
          reminder_level: number
          room_id: string
          room_number: string
          status: string
          tenant_id: string
          tenant_name: string
          tenant_phone: string
        }[]
      }
      get_rent_summary_for_property: {
        Args: {
          p_month: number
          p_pm_id: string
          p_property_id: string
          p_year: number
        }
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          effective_status: string
          is_vacant: boolean
          notes: string
          paid_at: string
          payment_method: string
          rent_ledger_id: string
          room_id: string
          room_name: string
          room_number: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_rent_tenant_health: {
        Args: { p_months_back?: number; p_pm_id: string }
        Returns: {
          current_month_status: string
          late_count: number
          months_tracked: number
          on_time_count: number
          on_time_rate: number
          property_address: string
          room_number: string
          tenant_id: string
          tenant_name: string
          total_owed: number
          unpaid_count: number
        }[]
      }
      get_rooms_for_property: {
        Args: { p_pm_id: string; p_property_id: string }
        Returns: {
          created_at: string
          current_tenant_id: string
          floor: string
          id: string
          is_vacant: boolean
          monthly_rent: number
          property_id: string
          rent_due_day: number
          rent_frequency: string
          room_name: string
          room_number: string
          tenancy_end_date: string
          tenancy_start_date: string
          tenant_name: string
        }[]
      }
      mark_rent_paid: {
        Args: {
          p_amount_paid: number
          p_notes?: string
          p_payment_method: string
          p_pm_id: string
          p_rent_ledger_id: string
        }
        Returns: undefined
      }
      norm_uk_postcode: { Args: { p_in: string }; Returns: string }
      onboarding_create_account: {
        Args: {
          p_business_name?: string
          p_email: string
          p_name: string
          p_phone: string
          p_preferred_contact?: string
          p_role?: string
          p_user_id: string
        }
        Returns: Json
      }
      onboarding_create_property: {
        Args: {
          p_address: string
          p_city: string
          p_pm_id: string
          p_postcode: string
          p_property_type?: string
          p_room_count?: number
        }
        Returns: Json
      }
      onboarding_create_tenants: {
        Args: { p_pm_id: string; p_property_id: string; p_tenants: Json }
        Returns: Json
      }
      onboarding_seed_demo: {
        Args: {
          p_category?: string
          p_issue_description?: string
          p_issue_title?: string
          p_pm_id: string
          p_priority?: string
        }
        Returns: Json
      }
      room_assign_tenant: {
        Args: {
          p_pm_id: string
          p_room_id: string
          p_tenancy_end?: string
          p_tenancy_start: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      room_delete: {
        Args: { p_pm_id: string; p_room_id: string }
        Returns: boolean
      }
      room_end_tenancy: {
        Args: { p_pm_id: string; p_room_id: string }
        Returns: undefined
      }
      room_remove_tenant: {
        Args: { p_pm_id: string; p_room_id: string }
        Returns: undefined
      }
      room_upsert: {
        Args: {
          p_floor?: string
          p_monthly_rent?: number
          p_pm_id: string
          p_property_id: string
          p_rent_due_day?: number
          p_rent_frequency?: string
          p_room_id?: string
          p_room_name?: string
          p_room_number: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_entity: { Args: { p_token: string }; Returns: Json }
    }
    Enums: {
      certificate_type:
        | "hmo_license"
        | "gas_safety"
        | "eicr"
        | "epc"
        | "fire_risk"
        | "pat"
        | "legionella"
        | "smoke_alarms"
        | "co_alarms"
        | "building_insurance"
        | "landlord_insurance"
        | "rent_guarantee_insurance"
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
      certificate_type: [
        "hmo_license",
        "gas_safety",
        "eicr",
        "epc",
        "fire_risk",
        "pat",
        "legionella",
        "smoke_alarms",
        "co_alarms",
        "building_insurance",
        "landlord_insurance",
        "rent_guarantee_insurance",
      ],
    },
  },
} as const
