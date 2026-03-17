import { getSupabaseAdmin } from "./supabase.js";

export async function listAssets() {
  const { data, error } = await getSupabaseAdmin().from("assets").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertAsset(asset) {
  const { data, error } = await getSupabaseAdmin()
    .from("assets")
    .upsert(asset, { onConflict: "serial_number" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAsset(id) {
  const { error } = await getSupabaseAdmin().from("assets").delete().eq("id", id);
  if (error) throw error;
}

export async function updateAsset(id, patch) {
  const { data, error } = await getSupabaseAdmin().from("assets").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function listMaintenanceRecords() {
  const { data, error } = await getSupabaseAdmin()
    .from("maintenance_records")
    .select("*")
    .order("maintenance_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertMaintenanceRecord(record) {
  const { data, error } = await getSupabaseAdmin().from("maintenance_records").insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMaintenanceRecord(id) {
  const { error } = await getSupabaseAdmin().from("maintenance_records").delete().eq("id", id);
  if (error) throw error;
}

export async function listLaborSchedules({ startDate, endDate } = {}) {
  let query = getSupabaseAdmin().from("labor_schedules").select("*").order("plan_date", { ascending: true });
  if (startDate) query = query.gte("plan_date", startDate);
  if (endDate) query = query.lte("plan_date", endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getLaborScheduleByDate(planDate) {
  const { data, error } = await getSupabaseAdmin().from("labor_schedules").select("*").eq("plan_date", planDate).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertLaborSchedule(schedule) {
  const { data, error } = await getSupabaseAdmin()
    .from("labor_schedules")
    .upsert(schedule, { onConflict: "plan_date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
