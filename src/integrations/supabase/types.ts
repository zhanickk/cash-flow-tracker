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
          global_rate: number
          id: boolean
          updated_at: string
        }
        Insert: {
          global_rate?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          global_rate?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cash_register_history: {
        Row: {
          action: string
          cashier_name: string | null
          created_at: string
          id: string
          kind: string | null
          summary: string
          ts: string
        }
        Insert: {
          action: string
          cashier_name?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          summary: string
          ts?: string
        }
        Update: {
          action?: string
          cashier_name?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          summary?: string
          ts?: string
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount: number
          contact_tx_id: string | null
          created_at: string
          currency: string
          expense_type: string | null
          id: string
          kind: string
          name: string | null
          rate: number | null
          ts: string
        }
        Insert: {
          amount: number
          contact_tx_id?: string | null
          created_at?: string
          currency: string
          expense_type?: string | null
          id?: string
          kind: string
          name?: string | null
          rate?: number | null
          ts?: string
        }
        Update: {
          amount?: number
          contact_tx_id?: string | null
          created_at?: string
          currency?: string
          expense_type?: string | null
          id?: string
          kind?: string
          name?: string | null
          rate?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_contact_tx_id_fkey"
            columns: ["contact_tx_id"]
            isOneToOne: false
            referencedRelation: "contact_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      cashiers: {
        Row: {
          created_at: string
          id: string
          login: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          login: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          login?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_conversions: {
        Row: {
          contact_id: string
          created_at: string
          from_amount: number
          from_currency: string
          id: string
          rate: number
          to_amount: number
          to_currency: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          from_amount: number
          from_currency: string
          id?: string
          rate: number
          to_amount: number
          to_currency: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          from_amount?: number
          from_currency?: string
          id?: string
          rate?: number
          to_amount?: number
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_conversions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_transactions: {
        Row: {
          amount: number
          contact_id: string | null
          conversion_id: string | null
          created_at: string
          currency: string
          entry_date: string
          id: string
          label: string | null
          note: string | null
          occurred_at: string
          source: string | null
        }
        Insert: {
          amount: number
          contact_id?: string | null
          conversion_id?: string | null
          created_at?: string
          currency: string
          entry_date?: string
          id?: string
          label?: string | null
          note?: string | null
          occurred_at?: string
          source?: string | null
        }
        Update: {
          amount?: number
          contact_id?: string | null
          conversion_id?: string | null
          created_at?: string
          currency?: string
          entry_date?: string
          id?: string
          label?: string | null
          note?: string | null
          occurred_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_transactions_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "contact_conversions"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          custom_rate: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_rate?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_rate?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
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
