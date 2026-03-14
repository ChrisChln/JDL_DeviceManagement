import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3101),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5174",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
};

export function assertConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}
