import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

let supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://vnilkycbtxxcyoynakge.supabase.co").trim();
if (supabaseUrl.endsWith('/')) supabaseUrl = supabaseUrl.slice(0, -1);
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa").trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const q = `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL UNIQUE,
    user_role text DEFAULT 'user',
    subscription jsonb NOT NULL,
    user_agent text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_push_subs_role ON push_subscriptions(user_role);

  ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;
  `;

  // We can't execute raw sql easily with regular supabase-js without an RPC. 
  // Let's create an RPC manually if there isn't one, or just try doing it?
  // Wait, if we can't run RAW SQL using supabase-js, I might just have to mention it.
}
run();
