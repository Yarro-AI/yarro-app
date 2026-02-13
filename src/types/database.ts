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
      c1_contractors: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          active: boolean
          category: string
          contractor_email: string | null
          contractor_name: string
          contractor_phone: string | null
          created_at: string
          id: string
          property_ids: string[] | null
          property_manager_id: string | null
        }
        Insert: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          category: string
          contractor_email?: string | null
          contractor_name: string
          contractor_phone?: string | null
          created_at?: string
          id?: string
          property_ids?: string[] | null
          property_manager_id?: string | null
        }
        Update: {
          _audit_log?: Json | null
          _import_batch_id?: string | null
          _imported_at?: string | null
          active?: boolean
          category?: string
          contractor_email?: string | null
          contractor_name?: string
          contractor_phone?: string | null
          created_at?: string
          id?: string
          property_ids?: string[] | null
          property_manager_id?: string | null
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
        Relationships: []
      }
      c1_messages: {
        Row: {
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
          contractors?: Json | null
          created_at?: string | null
          landlord?: Json | null
          manager?: Json | null
          stage?: string | null
          suppress_webhook?: boolean | null
          ticket_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      c1_properties: {
        Row: {
          _audit_log: Json | null
          _import_batch_id: string | null
          _imported_at: string | null
          access_instructions: string | null
          address: string
          auto_approve_limit: number | null
          contractor_mapping: Json | null
          created_at: string
          emergency_access_contact: string | null
          id: string
          landlord_email: string | null
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
          contractor_mapping?: Json | null
          created_at?: string
          emergency_access_contact?: string | null
          id?: string
          landlord_email?: string | null
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
          contractor_mapping?: Json | null
          created_at?: string
          emergency_access_contact?: string | null
          id?: string
          landlord_email?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          property_manager_id?: string | null
        }
        Relationships: []
      }
      c1_property_managers: {
        Row: {
          business_name: string
          contractor_reminder_minutes: number | null
          contractor_timeout_minutes: number | null
          created_at: string
          dispatch_mode: string
          email: string
          emergency_contact: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          business_name: string
          contractor_reminder_minutes?: number | null
          contractor_timeout_minutes?: number | null
          created_at?: string
          dispatch_mode?: string
          email: string
          emergency_contact?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          business_name?: string
          contractor_reminder_minutes?: number | null
          contractor_timeout_minutes?: number | null
          created_at?: string
          dispatch_mode?: string
          email?: string
          emergency_contact?: string | null
          id?: string
          name?: string
          phone?: string | null
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
        Relationships: []
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
          contractor_quote: number | null
          conversation_id: string | null
          date_logged: string
          final_amount: number | null
          handoff: boolean | null
          id: string
          images: Json | null
          is_manual: boolean | null
          issue_description: string | null
          job_stage: string | null
          landlord_approved_on: string | null
          priority: string | null
          property_id: string | null
          property_manager_id: string | null
          reporter_role: string | null
          scheduled_date: string | null
          status: string
          tenant_id: string | null
          updates_recipient: string | null
          verified_by: string | null
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
          contractor_quote?: number | null
          conversation_id?: string | null
          date_logged?: string
          final_amount?: number | null
          handoff?: boolean | null
          id?: string
          images?: Json | null
          is_manual?: boolean | null
          issue_description?: string | null
          job_stage?: string | null
          landlord_approved_on?: string | null
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
          updates_recipient?: string | null
          verified_by?: string | null
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
          contractor_quote?: number | null
          conversation_id?: string | null
          date_logged?: string
          final_amount?: number | null
          handoff?: boolean | null
          id?: string
          images?: Json | null
          is_manual?: boolean | null
          issue_description?: string | null
          job_stage?: string | null
          landlord_approved_on?: string | null
          priority?: string | null
          property_id?: string | null
          property_manager_id?: string | null
          reporter_role?: string | null
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
          updates_recipient?: string | null
          verified_by?: string | null
        }
        Relationships: []
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
          landlord_name: string | null
          landlord_phone: string | null
          open_tickets: Json | null
          property_id: string | null
          property_manager_id: string | null
          recent_tickets: Json | null
          tenants: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      c1_ticket_context: {
        Args: { ticket_uuid: string }
        Returns: {
          access: string
          access_granted: boolean
          access_instructions: string
          auto_approve_limit: number
          availability: string
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
    }
    Enums: {
      [_ in never]: never
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
