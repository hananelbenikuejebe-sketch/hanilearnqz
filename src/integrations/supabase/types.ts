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
      affiliate_attributions: {
        Row: {
          affiliate_user_id: string
          code: string
          created_at: string
          referred_user_id: string
        }
        Insert: {
          affiliate_user_id: string
          code: string
          created_at?: string
          referred_user_id: string
        }
        Update: {
          affiliate_user_id?: string
          code?: string
          created_at?: string
          referred_user_id?: string
        }
        Relationships: []
      }
      affiliate_codes: {
        Row: {
          clicks: number
          code: string
          created_at: string
          signups: number
          user_id: string
        }
        Insert: {
          clicks?: number
          code: string
          created_at?: string
          signups?: number
          user_id: string
        }
        Update: {
          clicks?: number
          code?: string
          created_at?: string
          signups?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          credits_cost: number | null
          feature: string
          id: string
          input_tokens: number | null
          meta: Json | null
          model: string | null
          output_tokens: number | null
          quiz_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits_cost?: number | null
          feature: string
          id?: string
          input_tokens?: number | null
          meta?: Json | null
          model?: string | null
          output_tokens?: number | null
          quiz_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits_cost?: number | null
          feature?: string
          id?: string
          input_tokens?: number | null
          meta?: Json | null
          model?: string | null
          output_tokens?: number | null
          quiz_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
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
      attempts: {
        Row: {
          ai_feedback: Json | null
          answers: Json
          awarded: number
          correct_count: number
          id: string
          quiz_id: string
          score_pct: number
          started_at: string
          student_id: string
          submitted_at: string | null
          time_taken_sec: number
          total: number
        }
        Insert: {
          ai_feedback?: Json | null
          answers?: Json
          awarded?: number
          correct_count?: number
          id?: string
          quiz_id: string
          score_pct?: number
          started_at?: string
          student_id: string
          submitted_at?: string | null
          time_taken_sec?: number
          total?: number
        }
        Update: {
          ai_feedback?: Json | null
          answers?: Json
          awarded?: number
          correct_count?: number
          id?: string
          quiz_id?: string
          score_pct?: number
          started_at?: string
          student_id?: string
          submitted_at?: string | null
          time_taken_sec?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_permissions: {
        Row: {
          ai_enabled: boolean
          analytics_enabled: boolean
          can_publish: boolean
          created_at: string
          granted_by: string | null
          id: string
          max_quizzes: number
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_enabled?: boolean
          analytics_enabled?: boolean
          can_publish?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          max_quizzes?: number
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_enabled?: boolean
          analytics_enabled?: boolean
          can_publish?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          max_quizzes?: number
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exam_quizzes: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          position: number
          quiz_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          position?: number
          quiz_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          position?: number
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_quizzes_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_quizzes_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          banner_path: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_published: boolean
          order_mode: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_path?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean
          order_mode?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_path?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean
          order_mode?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      free_credit_grants: {
        Row: {
          amount_kobo: number
          created_at: string
          period: string
          user_id: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          period: string
          user_id: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      monnify_webhook_events: {
        Row: {
          event_type: string | null
          id: string
          payload: Json
          processed: boolean
          received_at: string
          transaction_reference: string | null
        }
        Insert: {
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean
          received_at?: string
          transaction_reference?: string | null
        }
        Update: {
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          received_at?: string
          transaction_reference?: string | null
        }
        Relationships: []
      }
      options: {
        Row: {
          id: string
          is_correct: boolean
          position: number
          question_id: string
          text: string
        }
        Insert: {
          id?: string
          is_correct?: boolean
          position?: number
          question_id: string
          text: string
        }
        Update: {
          id?: string
          is_correct?: boolean
          position?: number
          question_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          affiliate_user_id: string | null
          amount_kobo: number
          created_at: string
          id: string
          meta: Json
          monnify_tx_ref: string | null
          paid_at: string | null
          payment_reference: string
          purpose: string
          status: string
          user_id: string
        }
        Insert: {
          affiliate_user_id?: string | null
          amount_kobo: number
          created_at?: string
          id?: string
          meta?: Json
          monnify_tx_ref?: string | null
          paid_at?: string | null
          payment_reference: string
          purpose: string
          status?: string
          user_id: string
        }
        Update: {
          affiliate_user_id?: string | null
          amount_kobo?: number
          created_at?: string
          id?: string
          meta?: Json
          monnify_tx_ref?: string | null
          paid_at?: string | null
          payment_reference?: string
          purpose?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          admin_note: string | null
          amount_kobo: number
          auto_confidence: number
          auto_reason: string | null
          created_at: string
          extracted: Json
          file_path: string
          granted: boolean
          id: string
          payment_intent_id: string | null
          purpose: string
          quiz_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          used_ai: boolean
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_kobo: number
          auto_confidence?: number
          auto_reason?: string | null
          created_at?: string
          extracted?: Json
          file_path: string
          granted?: boolean
          id?: string
          payment_intent_id?: string | null
          purpose: string
          quiz_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          used_ai?: boolean
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_kobo?: number
          auto_confidence?: number
          auto_reason?: string | null
          created_at?: string
          extracted?: Json
          file_path?: string
          granted?: boolean
          id?: string
          payment_intent_id?: string | null
          purpose?: string
          quiz_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          used_ai?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          affiliate_pct: number
          ai_credit_expiry_days: number
          ai_credit_min_topup_kobo: number
          ai_essay_price_kobo: number
          ai_generate_price_kobo: number
          ai_parser_rate_per_1k_input_kobo: number
          ai_parser_rate_per_1k_output_kobo: number
          ai_result_price_kobo: number
          ai_review_price_kobo: number
          creator_access_duration_days: number
          creator_access_includes_ai: boolean
          creator_access_price_kobo: number
          creator_access_quiz_cap: number
          feature_locks: Json
          free_ai_parse: boolean
          free_max_questions_per_quiz: number
          free_max_quizzes_per_month: number
          free_monthly_ai_credit_kobo: number
          free_offline_parse_limit: number
          free_tier_enabled: boolean
          id: string
          pay_account_name: string
          pay_account_number: string
          pay_bank_name: string
          proof_auto_approve: boolean
          proof_laxity: string
          proof_max_age_days: number
          proof_min_confidence: number
          proof_use_ai: boolean
          quiz_platform_fee_pct: number
          support_whatsapp: string
          updated_at: string
          withdrawal_min_kobo: number
          withdrawal_whatsapp: string
        }
        Insert: {
          affiliate_pct?: number
          ai_credit_expiry_days?: number
          ai_credit_min_topup_kobo?: number
          ai_essay_price_kobo?: number
          ai_generate_price_kobo?: number
          ai_parser_rate_per_1k_input_kobo?: number
          ai_parser_rate_per_1k_output_kobo?: number
          ai_result_price_kobo?: number
          ai_review_price_kobo?: number
          creator_access_duration_days?: number
          creator_access_includes_ai?: boolean
          creator_access_price_kobo?: number
          creator_access_quiz_cap?: number
          feature_locks?: Json
          free_ai_parse?: boolean
          free_max_questions_per_quiz?: number
          free_max_quizzes_per_month?: number
          free_monthly_ai_credit_kobo?: number
          free_offline_parse_limit?: number
          free_tier_enabled?: boolean
          id?: string
          pay_account_name?: string
          pay_account_number?: string
          pay_bank_name?: string
          proof_auto_approve?: boolean
          proof_laxity?: string
          proof_max_age_days?: number
          proof_min_confidence?: number
          proof_use_ai?: boolean
          quiz_platform_fee_pct?: number
          support_whatsapp?: string
          updated_at?: string
          withdrawal_min_kobo?: number
          withdrawal_whatsapp?: string
        }
        Update: {
          affiliate_pct?: number
          ai_credit_expiry_days?: number
          ai_credit_min_topup_kobo?: number
          ai_essay_price_kobo?: number
          ai_generate_price_kobo?: number
          ai_parser_rate_per_1k_input_kobo?: number
          ai_parser_rate_per_1k_output_kobo?: number
          ai_result_price_kobo?: number
          ai_review_price_kobo?: number
          creator_access_duration_days?: number
          creator_access_includes_ai?: boolean
          creator_access_price_kobo?: number
          creator_access_quiz_cap?: number
          feature_locks?: Json
          free_ai_parse?: boolean
          free_max_questions_per_quiz?: number
          free_max_quizzes_per_month?: number
          free_monthly_ai_credit_kobo?: number
          free_offline_parse_limit?: number
          free_tier_enabled?: boolean
          id?: string
          pay_account_name?: string
          pay_account_number?: string
          pay_bank_name?: string
          proof_auto_approve?: boolean
          proof_laxity?: string
          proof_max_age_days?: number
          proof_min_confidence?: number
          proof_use_ai?: boolean
          quiz_platform_fee_pct?: number
          support_whatsapp?: string
          updated_at?: string
          withdrawal_min_kobo?: number
          withdrawal_whatsapp?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          device_fingerprint: string | null
          email: string | null
          full_name: string | null
          handle: string | null
          id: string
          is_guest: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          full_name?: string | null
          handle?: string | null
          id: string
          is_guest?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          is_guest?: boolean
        }
        Relationships: []
      }
      questions: {
        Row: {
          ai_confidence: number | null
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          explanation: string | null
          id: string
          needs_review: boolean
          points: number | null
          position: number
          quiz_id: string
          raw_import_text: string | null
          review_reason: string | null
          sample_answer: string | null
          subsection: string | null
          tags: string[]
          text: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          id?: string
          needs_review?: boolean
          points?: number | null
          position?: number
          quiz_id: string
          raw_import_text?: string | null
          review_reason?: string | null
          sample_answer?: string | null
          subsection?: string | null
          tags?: string[]
          text: string
          type?: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          id?: string
          needs_review?: boolean
          points?: number | null
          position?: number
          quiz_id?: string
          raw_import_text?: string | null
          review_reason?: string | null
          sample_answer?: string | null
          subsection?: string | null
          tags?: string[]
          text?: string
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          is_hidden: boolean
          quiz_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          quiz_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          quiz_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_comments_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_likes: {
        Row: {
          created_at: string
          id: string
          quiz_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quiz_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quiz_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_likes_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_purchases: {
        Row: {
          created_at: string
          id: string
          payment_intent_id: string | null
          price_kobo: number
          quiz_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_intent_id?: string | null
          price_kobo?: number
          quiz_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_intent_id?: string | null
          price_kobo?: number
          quiz_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_purchases_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_purchases_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_shares: {
        Row: {
          channel: string
          created_at: string
          id: string
          quiz_id: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          quiz_id: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          quiz_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_shares_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          access_key: string | null
          allow_comments: boolean
          allow_likes: boolean
          allow_retakes: boolean
          allow_sharing: boolean
          banner_path: string | null
          banner_url: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          duration_min: number
          end_at: string | null
          enforce_time: boolean
          id: string
          input_method: string
          instructions: string | null
          is_published: boolean
          max_attempts: number | null
          parsing_settings: Json
          price_kobo: number
          randomize_questions: boolean
          scheduled_at: string | null
          share_image_url: string | null
          show_answers_after: boolean
          show_explanations: boolean
          show_leaderboard: boolean
          shuffle_options: boolean
          source_type: string | null
          start_at: string | null
          subject: string | null
          title: string
          total_score: number | null
          updated_at: string
          visibility: string
        }
        Insert: {
          access_key?: string | null
          allow_comments?: boolean
          allow_likes?: boolean
          allow_retakes?: boolean
          allow_sharing?: boolean
          banner_path?: string | null
          banner_url?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          duration_min?: number
          end_at?: string | null
          enforce_time?: boolean
          id?: string
          input_method?: string
          instructions?: string | null
          is_published?: boolean
          max_attempts?: number | null
          parsing_settings?: Json
          price_kobo?: number
          randomize_questions?: boolean
          scheduled_at?: string | null
          share_image_url?: string | null
          show_answers_after?: boolean
          show_explanations?: boolean
          show_leaderboard?: boolean
          shuffle_options?: boolean
          source_type?: string | null
          start_at?: string | null
          subject?: string | null
          title: string
          total_score?: number | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          access_key?: string | null
          allow_comments?: boolean
          allow_likes?: boolean
          allow_retakes?: boolean
          allow_sharing?: boolean
          banner_path?: string | null
          banner_url?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          duration_min?: number
          end_at?: string | null
          enforce_time?: boolean
          id?: string
          input_method?: string
          instructions?: string | null
          is_published?: boolean
          max_attempts?: number | null
          parsing_settings?: Json
          price_kobo?: number
          randomize_questions?: boolean
          scheduled_at?: string | null
          share_image_url?: string | null
          show_answers_after?: boolean
          show_explanations?: boolean
          show_leaderboard?: boolean
          shuffle_options?: boolean
          source_type?: string | null
          start_at?: string | null
          subject?: string | null
          title?: string
          total_score?: number | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active: boolean
          created_at: string
          expires_at: string
          id: string
          kind: string
          source_payment_intent: string | null
          starts_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expires_at: string
          id?: string
          kind?: string
          source_payment_intent?: string | null
          starts_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          source_payment_intent?: string | null
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_source_payment_intent_fkey"
            columns: ["source_payment_intent"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
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
      wallet_transactions: {
        Row: {
          amount_kobo: number
          bucket: string
          created_at: string
          id: string
          kind: string
          meta: Json
          monnify_ref: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_kobo: number
          bucket?: string
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          monnify_ref?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_kobo?: number
          bucket?: string
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          monnify_ref?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          ai_credit_balance_kobo: number
          ai_credit_expires_at: string | null
          balance_kobo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credit_balance_kobo?: number
          ai_credit_expires_at?: string | null
          balance_kobo?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credit_balance_kobo?: number
          ai_credit_expires_at?: string | null
          balance_kobo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          account_name: string
          account_number: string
          admin_note: string | null
          amount_kobo: number
          bank_name: string
          created_at: string
          id: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          admin_note?: string | null
          amount_kobo: number
          bank_name: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          admin_note?: string | null
          amount_kobo?: number
          bank_name?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_active_creator_subscription: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "student" | "creator" | "super_admin"
      difficulty_level: "easy" | "medium" | "hard"
      question_type: "mcq" | "tf" | "short" | "essay"
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
      app_role: ["admin", "student", "creator", "super_admin"],
      difficulty_level: ["easy", "medium", "hard"],
      question_type: ["mcq", "tf", "short", "essay"],
    },
  },
} as const
