export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Profile = {
  Row: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type Project = {
  Row: {
    id: string;
    user_id: string;
    name: string;
    data: Json;
    thumbnail_url: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    name?: string;
    data?: Json;
    thumbnail_url?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    name?: string;
    data?: Json;
    thumbnail_url?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      profiles: Profile;
      projects: Project;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DefaultSchema = Database['public'];

export type Tables<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Update'];
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T];
export type CompositeTypes<T extends keyof DefaultSchema['CompositeTypes']> = DefaultSchema['CompositeTypes'][T];

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
