import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://ykuftbqkdmqqzmtxaamu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWZ0YnFrZG1xcXptdHhhYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzY4MTUsImV4cCI6MjA5ODU1MjgxNX0.Y7OAEyF336OIZtL7YEqZTrnWeHolL5pXTHUi58kYyF0";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
