import { createClient } from "@supabase/supabase-js";
import { assertConfig, config } from "./config.js";

let client;

export function getSupabaseAdmin() {
  if (!client) {
    assertConfig();
    client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
