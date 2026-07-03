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
