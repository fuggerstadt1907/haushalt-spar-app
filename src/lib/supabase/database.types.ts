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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          iban: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          iban?: string | null
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          iban?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      category: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          created_at?: string
          household_id?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      import: {
        Row: {
          account_id: string
          closing_balance_cents: number | null
          created_at: string
          created_by: string | null
          format: string
          household_id: string
          id: string
          opening_balance_cents: number | null
          period_from: string
          period_to: string
          source: string
          transaction_count: number
        }
        Insert: {
          account_id: string
          closing_balance_cents?: number | null
          created_at?: string
          created_by?: string | null
          format: string
          household_id?: string
          id?: string
          opening_balance_cents?: number | null
          period_from: string
          period_to: string
          source?: string
          transaction_count?: number
        }
        Update: {
          account_id?: string
          closing_balance_cents?: number | null
          created_at?: string
          created_by?: string | null
          format?: string
          household_id?: string
          id?: string
          opening_balance_cents?: number | null
          period_from?: string
          period_to?: string
          source?: string
          transaction_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_rule: {
        Row: {
          category_id: string | null
          counterparty_key: string
          counterparty_label: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: string
          necessity: string | null
          updated_at: string
          updated_by: string | null
          urgency: string | null
        }
        Insert: {
          category_id?: string | null
          counterparty_key: string
          counterparty_label: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind: string
          necessity?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Update: {
          category_id?: string | null
          counterparty_key?: string
          counterparty_label?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: string
          necessity?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_rule_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_rule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_rule_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_rule_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      private_name: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_name_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_name_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          display_name: string
          household_id: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          household_id: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction: {
        Row: {
          account_id: string
          ai_reason: string | null
          amount_cents: number
          bank_reference: string | null
          booking_date: string
          booking_status: string
          booking_text: string | null
          category_id: string | null
          counterparty: string | null
          counterparty_iban: string | null
          created_at: string
          creditor_id: string | null
          dedupe_hash: string
          household_id: string
          id: string
          import_id: string
          kind: string
          mandate_reference: string | null
          merchant_category_code: string | null
          necessity: string | null
          original_amount_cents: number | null
          original_currency: string | null
          purpose: string | null
          rating_source: string | null
          refund_of: string | null
          review_status: string
          updated_at: string
          updated_by: string | null
          urgency: string | null
          value_date: string | null
        }
        Insert: {
          account_id: string
          ai_reason?: string | null
          amount_cents: number
          bank_reference?: string | null
          booking_date: string
          booking_status: string
          booking_text?: string | null
          category_id?: string | null
          counterparty?: string | null
          counterparty_iban?: string | null
          created_at?: string
          creditor_id?: string | null
          dedupe_hash: string
          household_id?: string
          id?: string
          import_id: string
          kind: string
          mandate_reference?: string | null
          merchant_category_code?: string | null
          necessity?: string | null
          original_amount_cents?: number | null
          original_currency?: string | null
          purpose?: string | null
          rating_source?: string | null
          refund_of?: string | null
          review_status?: string
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
          value_date?: string | null
        }
        Update: {
          account_id?: string
          ai_reason?: string | null
          amount_cents?: number
          bank_reference?: string | null
          booking_date?: string
          booking_status?: string
          booking_text?: string | null
          category_id?: string | null
          counterparty?: string | null
          counterparty_iban?: string | null
          created_at?: string
          creditor_id?: string | null
          dedupe_hash?: string
          household_id?: string
          id?: string
          import_id?: string
          kind?: string
          mandate_reference?: string | null
          merchant_category_code?: string | null
          necessity?: string | null
          original_amount_cents?: number | null
          original_currency?: string | null
          purpose?: string | null
          rating_source?: string | null
          refund_of?: string | null
          review_status?: string
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_refund_of_fkey"
            columns: ["refund_of"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_import: {
        Args: {
          p_import: Json
          p_inserts: Json
          p_kind_updates: Json
          p_pending_deletes: string[]
          p_pending_updates: Json
        }
        Returns: string
      }
      delete_all_household_data: { Args: never; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
