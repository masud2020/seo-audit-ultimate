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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip: string | null
          metadata: Json
          path: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_citation_results: {
        Row: {
          cited: boolean
          created_at: string
          error: string | null
          id: string
          mentions: number
          model: string
          prompt: string
          response: string | null
          run_id: string
          snippet: string | null
          user_id: string
        }
        Insert: {
          cited?: boolean
          created_at?: string
          error?: string | null
          id?: string
          mentions?: number
          model: string
          prompt: string
          response?: string | null
          run_id: string
          snippet?: string | null
          user_id: string
        }
        Update: {
          cited?: boolean
          created_at?: string
          error?: string | null
          id?: string
          mentions?: number
          model?: string
          prompt?: string
          response?: string | null
          run_id?: string
          snippet?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_citation_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_citation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_citation_runs: {
        Row: {
          created_at: string
          hits: number
          id: string
          models_count: number
          prompts_count: number
          target_domain: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hits?: number
          id?: string
          models_count?: number
          prompts_count?: number
          target_domain: string
          user_id: string
        }
        Update: {
          created_at?: string
          hits?: number
          id?: string
          models_count?: number
          prompts_count?: number
          target_domain?: string
          user_id?: string
        }
        Relationships: []
      }
      api_settings: {
        Row: {
          claude_key: string | null
          dataforseo_login: string | null
          dataforseo_password: string | null
          gemini_key: string | null
          groq_key: string | null
          majestic_key: string | null
          moz_token: string | null
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
          dataforseo_login?: string | null
          dataforseo_password?: string | null
          gemini_key?: string | null
          groq_key?: string | null
          majestic_key?: string | null
          moz_token?: string | null
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
          dataforseo_login?: string | null
          dataforseo_password?: string | null
          gemini_key?: string | null
          groq_key?: string | null
          majestic_key?: string | null
          moz_token?: string | null
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
      bkash_payments: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          created_at: string
          id: string
          plan_slug: string
          reviewed_at: string | null
          reviewed_by: string | null
          sender_msisdn: string
          status: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_bdt: number
          created_at?: string
          id?: string
          plan_slug: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_msisdn: string
          status?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_bdt?: number
          created_at?: string
          id?: string
          plan_slug?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_msisdn?: string
          status?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bkash_settings: {
        Row: {
          account_type: string
          id: number
          instructions: string | null
          merchant_number: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          id?: number
          instructions?: string | null
          merchant_number?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          id?: number
          instructions?: string | null
          merchant_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blog_sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          url?: string
        }
        Relationships: []
      }
      brand_settings: {
        Row: {
          accent_color: string | null
          app_name: string | null
          company_address: string | null
          favicon_url: string | null
          footer_text: string | null
          logo_url: string | null
          primary_color: string | null
          privacy_url: string | null
          support_email: string | null
          terms_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          app_name?: string | null
          company_address?: string | null
          favicon_url?: string | null
          footer_text?: string | null
          logo_url?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          app_name?: string | null
          company_address?: string | null
          favicon_url?: string | null
          footer_text?: string | null
          logo_url?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      link_check_items: {
        Row: {
          check_id: string
          checked_at: string
          error: string | null
          id: string
          is_external: boolean
          source_url: string
          status_bucket: string
          status_code: number | null
          target_url: string
          user_id: string
        }
        Insert: {
          check_id: string
          checked_at?: string
          error?: string | null
          id?: string
          is_external?: boolean
          source_url: string
          status_bucket: string
          status_code?: number | null
          target_url: string
          user_id: string
        }
        Update: {
          check_id?: string
          checked_at?: string
          error?: string | null
          id?: string
          is_external?: boolean
          source_url?: string
          status_bucket?: string
          status_code?: number | null
          target_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_check_items_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "link_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      link_checks: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          links_broken: number
          links_total: number
          pages_scanned: number
          root_url: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          links_broken?: number
          links_total?: number
          pages_scanned?: number
          root_url: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          links_broken?: number
          links_total?: number
          pages_scanned?: number
          root_url?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      llm_visibility_runs: {
        Row: {
          competitors: string[]
          created_at: string
          hits: number
          id: string
          mode: string
          prompts: Json
          providers: string[]
          results: Json
          score: number | null
          summary: Json
          target_domain: string | null
          target_url: string | null
          topic: string | null
          total: number
          user_id: string
        }
        Insert: {
          competitors?: string[]
          created_at?: string
          hits?: number
          id?: string
          mode: string
          prompts?: Json
          providers?: string[]
          results?: Json
          score?: number | null
          summary?: Json
          target_domain?: string | null
          target_url?: string | null
          topic?: string | null
          total?: number
          user_id: string
        }
        Update: {
          competitors?: string[]
          created_at?: string
          hits?: number
          id?: string
          mode?: string
          prompts?: Json
          providers?: string[]
          results?: Json
          score?: number | null
          summary?: Json
          target_domain?: string | null
          target_url?: string | null
          topic?: string | null
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      mega_audits: {
        Row: {
          competitor_url: string | null
          created_at: string
          error: string | null
          id: string
          max_pages: number
          overall_score: number | null
          progress: number
          results: Json | null
          status: string
          status_message: string | null
          target_keyword: string | null
          target_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          competitor_url?: string | null
          created_at?: string
          error?: string | null
          id?: string
          max_pages?: number
          overall_score?: number | null
          progress?: number
          results?: Json | null
          status?: string
          status_message?: string | null
          target_keyword?: string | null
          target_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          competitor_url?: string | null
          created_at?: string
          error?: string | null
          id?: string
          max_pages?: number
          overall_score?: number | null
          progress?: number
          results?: Json | null
          status?: string
          status_message?: string | null
          target_keyword?: string | null
          target_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monitored_backlinks: {
        Row: {
          anchor: string | null
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          last_status: string
          lost_at: string | null
          source: string
          source_authority: number | null
          source_url: string
          target_domain: string
          target_url: string
          user_id: string
        }
        Insert: {
          anchor?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_status?: string
          lost_at?: string | null
          source?: string
          source_authority?: number | null
          source_url: string
          target_domain: string
          target_url: string
          user_id: string
        }
        Update: {
          anchor?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_status?: string
          lost_at?: string | null
          source?: string
          source_authority?: number | null
          source_url?: string
          target_domain?: string
          target_url?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          id: string
          in_app: boolean
          notify_error: boolean
          notify_success: boolean
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          in_app?: boolean
          notify_error?: boolean
          notify_success?: boolean
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          in_app?: boolean
          notify_error?: boolean
          notify_success?: boolean
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          label: string | null
          message: string
          read: boolean
          run_id: string | null
          status: string
          tool: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          message: string
          read?: boolean
          run_id?: string | null
          status: string
          tool: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          message?: string
          read?: boolean
          run_id?: string | null
          status?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
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
      pricing_plans: {
        Row: {
          created_at: string
          cta_label: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          price_bdt: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          price_bdt?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price_bdt?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_note: string | null
          approval_status: string
          approved_by: string | null
          approved_until: string | null
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          approval_note?: string | null
          approval_status?: string
          approved_by?: string | null
          approved_until?: string | null
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          approval_note?: string | null
          approval_status?: string
          approved_by?: string | null
          approved_until?: string | null
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
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
      report_recommendations: {
        Row: {
          created_at: string
          fixes: Json
          id: string
          model: string | null
          report_id: string
          report_type: string
          section_slug: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fixes?: Json
          id?: string
          model?: string | null
          report_id: string
          report_type: string
          section_slug: string
          summary?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fixes?: Json
          id?: string
          model?: string | null
          report_id?: string
          report_type?: string
          section_slug?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          report_id: string
          report_type: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          report_id: string
          report_type: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          report_id?: string
          report_type?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_links: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_sheets: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          url?: string
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
      site_audits: {
        Row: {
          created_at: string
          error: string | null
          id: string
          issues: Json
          max_pages: number
          overall_score: number | null
          pages: Json
          pages_audited: number
          start_url: string
          status: string
          summary: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          max_pages?: number
          overall_score?: number | null
          pages?: Json
          pages_audited?: number
          start_url: string
          status?: string
          summary?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          issues?: Json
          max_pages?: number
          overall_score?: number | null
          pages?: Json
          pages_audited?: number
          start_url?: string
          status?: string
          summary?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      tool_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          label: string | null
          ref_id: string | null
          ref_table: string | null
          result: Json
          status: string
          tool: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          label?: string | null
          ref_id?: string | null
          ref_table?: string | null
          result?: Json
          status?: string
          tool: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          label?: string | null
          ref_id?: string | null
          ref_table?: string | null
          result?: Json
          status?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
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
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan_slug: string
          source: string
          source_payment_id: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_slug: string
          source?: string
          source_payment_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_slug?: string
          source?: string
          source_payment_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "bkash_payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
