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
      api_settings: {
        Row: {
          claude_key: string | null
          gemini_key: string | null
          groq_key: string | null
          openai_key: string | null
          perplexity_key: string | null
          provider: string
          semrush_key: string | null
          sender_email: string | null
          sender_name: string | null
          serpapi_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claude_key?: string | null
          gemini_key?: string | null
          groq_key?: string | null
          openai_key?: string | null
          perplexity_key?: string | null
          provider?: string
          semrush_key?: string | null
          sender_email?: string | null
          sender_name?: string | null
          serpapi_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claude_key?: string | null
          gemini_key?: string | null
          groq_key?: string | null
          openai_key?: string | null
          perplexity_key?: string | null
          provider?: string
          semrush_key?: string | null
          sender_email?: string | null
          sender_name?: string | null
          serpapi_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audits: {
        Row: {
          ai_recommendations: Json | null
          created_at: string
          error: string | null
          id: string
          overall_score: number | null
          project_id: string | null
          sections: Json
          status: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          ai_recommendations?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          overall_score?: number | null
          project_id?: string | null
          sections?: Json
          status?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          ai_recommendations?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          overall_score?: number | null
          project_id?: string | null
          sections?: Json
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_progress: {
        Row: {
          checked: boolean
          id: string
          item_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          id?: string
          item_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          id?: string
          item_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competitors: {
        Row: {
          created_at: string
          domain: string
          id: string
          notes: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          notes?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_optimizations: {
        Row: {
          analysis: Json
          content: string
          created_at: string
          id: string
          project_id: string | null
          target_keyword: string
          title: string | null
          user_id: string
        }
        Insert: {
          analysis?: Json
          content: string
          created_at?: string
          id?: string
          project_id?: string | null
          target_keyword: string
          title?: string | null
          user_id: string
        }
        Update: {
          analysis?: Json
          content?: string
          created_at?: string
          id?: string
          project_id?: string | null
          target_keyword?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_optimizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      disavow_entries: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          scope: string
          source_domain: string
          source_url: string | null
          target_domain: string
          toxicity_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          scope?: string
          source_domain: string
          source_url?: string | null
          target_domain: string
          toxicity_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          scope?: string
          source_domain?: string
          source_url?: string | null
          target_domain?: string
          toxicity_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gsc_verifications: {
        Row: {
          created_at: string
          id: string
          site_url: string
          token: string
          updated_at: string
          user_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          site_url: string
          token: string
          updated_at?: string
          user_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          site_url?: string
          token?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      keywords: {
        Row: {
          alert_threshold: number
          created_at: string
          current_position: number | null
          history: Json
          id: string
          keyword: string
          last_alerted_at: string | null
          previous_position: number | null
          project_id: string | null
          target_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_threshold?: number
          created_at?: string
          current_position?: number | null
          history?: Json
          id?: string
          keyword: string
          last_alerted_at?: string | null
          previous_position?: number | null
          project_id?: string | null
          target_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_threshold?: number
          created_at?: string
          current_position?: number | null
          history?: Json
          id?: string
          keyword?: string
          last_alerted_at?: string | null
          previous_position?: number | null
          project_id?: string | null
          target_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ping_history: {
        Row: {
          created_at: string
          id: string
          results: Json
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          results?: Json
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          results?: Json
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          domain: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_audits: {
        Row: {
          cadence: string
          created_at: string
          email: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          next_run_at: string
          project_id: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          project_id?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          cadence?: string
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          project_id?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_crawls: {
        Row: {
          created_at: string
          error: string | null
          id: string
          issues: Json
          max_pages: number
          pages: Json
          pages_crawled: number
          project_id: string | null
          start_url: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          max_pages?: number
          pages?: Json
          pages_crawled?: number
          project_id?: string | null
          start_url: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          max_pages?: number
          pages?: Json
          pages_crawled?: number
          project_id?: string | null
          start_url?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_crawls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
