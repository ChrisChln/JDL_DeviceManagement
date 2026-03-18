import { getSupabaseAdmin } from "./supabase.js";

export async function listAssets() {
  const { data, error } = await getSupabaseAdmin().from("assets").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAssetById(id) {
  const { data, error } = await getSupabaseAdmin().from("assets").select("*").eq("id", id).maybeSingle();
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

export async function getMaintenanceRecordById(id) {
  const { data, error } = await getSupabaseAdmin()
    .from("maintenance_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTransferRecords({ limit = 100, offset = 0 } = {}) {
  const { data, error } = await getSupabaseAdmin()
    .from("transfer_records")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}

export async function createAssetTransfer(transfer) {
  const { data, error } = await getSupabaseAdmin()
    .rpc("create_asset_transfer", {
      p_asset_id: transfer.asset_id,
      p_to_warehouse: transfer.to_warehouse,
      p_requested_by_user_id: transfer.requested_by_user_id ?? null,
      p_requested_by_name: transfer.requested_by_name,
      p_reason: transfer.reason,
      p_note: transfer.note ?? "",
    });
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

export async function getUserProfile(userId) {
  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createUserProfile(profile) {
  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .insert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listOperationLogs({
  page = 1,
  pageSize = 100,
  from,
  to,
  action,
  actorId,
} = {}) {
  // Ensure page and pageSize are within reasonable bounds to keep responses bounded
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const maxPageSize = 1000;
  const rawPageSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 100;
  const safePageSize = Math.min(Math.max(1, rawPageSize), maxPageSize);
  const fromIndex = (safePage - 1) * safePageSize;
  const toIndex = fromIndex + safePageSize - 1;

  let query = getSupabaseAdmin()
    .from("operation_logs")
    .select("*");

  if (from) {
    query = query.gte("created_at", from);
  }

  if (to) {
    query = query.lte("created_at", to);
  }

  if (action) {
    query = query.eq("action", action);
  }

  if (actorId) {
    query = query.eq("actor_id", actorId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(fromIndex, toIndex);
  if (error) throw error;
  return data;
}

export async function insertOperationLog(log) {
  const { data, error } = await getSupabaseAdmin()
    .from("operation_logs")
    .insert(log)
    .select()
    .single();
  if (error) throw error;
  return data;
}
