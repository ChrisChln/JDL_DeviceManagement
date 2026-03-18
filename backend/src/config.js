import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: rootEnvPath });

export const config = {
  port: Number(process.env.PORT || 3101),
  host: process.env.HOST || "0.0.0.0",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5174,http://localhost:5173,http://127.0.0.1:5174,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
};

export function assertConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL or VITE_SUPABASE_URL");
  if (!config.supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}
