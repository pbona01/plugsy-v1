import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = (process.env.VITE_SUPABASE_URL || "https://vnilkycbtxxcyoynakge.supabase.co").trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY).trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Testing insert with duration_seconds...");
  const { data, error } = await supabase.from("messages").insert({
    chat_id: "961e4fba-3804-44f6-90b1-629562af5e08", // existing chat ID from sample
    sender_id: "test-user",
    sender_role: "user",
    content: "Test voice note duration",
    message_type: "voice_note",
    duration_seconds: 45
  }).select();

  if (error) {
    console.error("Insert failed:", error.message, error.code);
  } else {
    console.log("Insert succeeded! Data:", data);
    // clean up
    if (data && data[0]?.id) {
      await supabase.from("messages").delete().eq("id", data[0].id);
      console.log("Cleanup succeeded.");
    }
  }
}

test();
