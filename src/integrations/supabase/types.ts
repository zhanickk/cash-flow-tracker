export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          global_rate: number;
          id: boolean;
          updated_at: string;
        };
        Insert: {
          global_rate?: number;
          id?: boolean;
          updated_at?: string;
        };
        Update: {
          global_rate?: number;
          id?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_transactions: {
        Row: {
          amount: number;
          contact_id: string;
          created_at: string;
          currency: string;
          id: string;
          note: string | null;
          occurred_at: string;
          source: string | null;
        };
        Insert: {
          amount: number;
          contact_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          note?: string | null;
          occurred_at?: string;
          source?: string | null;
        };
        Update: {
          amount?: number;
          contact_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          note?: string | null;
          occurred_at?: string;
          source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_transactions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          created_at: string;
          custom_rate: number | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          custom_rate?: number | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          custom_rate?: number | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];
