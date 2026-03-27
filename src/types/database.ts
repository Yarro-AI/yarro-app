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
      // MANUALLY ADDED — c1_compliance_certificates
      // Will be overwritten on next `supabase gen types` — verify after regeneration
      c1_compliance_certificates: {
        Row: {
          id: string
          property_id: string
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          issued_date: string | null
          expiry_date: string | null
          certificate_number: string | null
          issued_by: string | null
          document_url: string | null
          status: string
          notes: string | null
          property_manager_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          property_id: string
          certificate_type: Database["public"]["Enums"]["certificate_type"]
          issued_date?: string | null
          expiry_date?: string | null
          certificate_number?: string | null
          issued_by?: string | null
          document_url?: string | null
          status?: string
          notes?: string | null
          property_manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          property_id?: string
          certificate_type?: Database["public"]["Enums"]["certificate_type"]
          issued_date?: string | null
          expiry_date?: string | null
          certificate_number?: string | null
          issued_by?: string | null
          document_url?: string | null
          status?: string
          notes?: string | null
          property_manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "c1_compliance_certificates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "c1_properties"
            referencedColumns: ["id"]
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
      c1_contractors: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          active: boolean
          categories: string[]
          category: string
          contractor_email: string | null
          contractor_name: string
          contractor_phone: string | null
          created_at: string
          id: string
          property_ids: string[] | null
          property_manager_id: string | null
          service_areas: string[] | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          categories?: string[]
          category: string
          contractor_email?: string | null
          contractor_name: string
          contractor_phone?: string | null
          created_at?: string
          id?: string
          property_ids?: string[] | null
          property_manager_id?: string | null
          service_areas?: string[] | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          categories?: string[]
          category?: string
          contractor_email?: string | null
          contractor_name?: string
          contractor_phone?: string | null
          created_at?: string
          id?: string
          property_ids?: string[] | null
          property_manager_id?: string | null
          service_areas?: string[] | null
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
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          property_manager_id: string | null
          updated_at: string
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          property_manager_id?: string | null
          updated_at?: string
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          property_manager_id?: string | null
          updated_at?: string
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
          id: string
          landlord_email: string | null
          landlord_id: string | null
          landlord_name: string | null
          landlord_phone: string | null
          property_manager_id: string | null
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
          id?: string
          landlord_email?: string | null
          landlord_id?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          property_manager_id?: string | null
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
          id?: string
          landlord_email?: string | null
          landlord_id?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          property_manager_id?: string | null
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
          name: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
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
          name: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
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
          name?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      c1_tenants: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          property_id: string | null
          property_manager_id: string | null
          role_tag: string | null
          verified_by: string | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          role_tag?: string | null
          verified_by?: string | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          role_tag?: string | null
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
          confirmation_date: string | null
          contractor_id: string | null
          contractor_ids: string[] | null
          contractor_quote: number | null
          conversation_id: string | null
          date_logged: string
          final_amount: number | null
          handoff: boolean | null
          id: string
          images: Json | null
          is_manual: boolean | null
          issue_description: string | null
          issue_title: string | null
          job_stage: string | null
          landlord_approved_on: string | null
          next_action: string | null
          next_action_reason: string | null
          priority: string | null
          property_id: string | null
          property_manager_id: string | null
          reporter_role: string | null
          scheduled_date: string | null
          status: string
          tenant_id: string | null
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
          confirmation_date?: string | null
          contractor_id?: string | null
          contractor_ids?: string[] | null
          contractor_quote?: number | null
          conversation_id?: string | null
          date_logged?: string
          final_amount?: number | null
          handoff?: boolean | null
          id?: string
          images?: Json | null
          is_manual?: boolean | null
          issue_description?: string | null
          issue_title?: string | null
          job_stage?: string | null
          landlord_approved_on?: string | null
          next_action?: string | null
          next_action_reason?: string | null
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
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
          confirmation_date?: string | null
          contractor_id?: string | null
          contractor_ids?: string[] | null
          contractor_quote?: number | null
          conversation_id?: string | null
          date_logged?: string
          final_amount?: number | null
          handoff?: boolean | null
          id?: string
          images?: Json | null
          is_manual?: boolean | null
          issue_description?: string | null
          issue_title?: string | null
          job_stage?: string | null
          landlord_approved_on?: string | null
          next_action?: string | null
          next_action_reason?: string | null
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
          updates_recipient?: string | null
          verified_by?: string | null
          was_handoff?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "c1_tickets_property_manager_id_fkey"
            columns: ["property_manager_id"]
            isOneToOne: false
            referencedRelation: "c1_property_managers"
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
          open_tickets: Json | null
          property_id: string | null
          property_manager_id: string | null
          recent_tickets: Json | null
          tenants: Json | null
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
      [key: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
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
      ],
    },
  },
} as const
