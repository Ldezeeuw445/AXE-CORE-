import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pqnngpcgbdwxavbatbia.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbm5ncGNnYmR3eGF2YmF0YmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Nzc1ODgsImV4cCI6MjA5MDQ1MzU4OH0.S9DOUSTmNFfehOo5vY7JGce7wCTDyHqVciWKHJP48N8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
