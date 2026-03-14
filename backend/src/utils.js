import XLSX from "xlsx";

export function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateInput(date);
}

export function formatDateInput(date) {
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

export function diffInDays(value) {
  if (!value) return null;
  const today = new Date(formatDateInput(new Date()));
  const target = new Date(value);
  return Math.round((target - today) / 86400000);
}

export function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeAssetPayload(payload) {
  const normalized = {
    warehouse: payload.warehouse || "",
    model: payload.model || "",
    serial_number: payload.serial_number || "",
    brand: payload.brand || "",
    supplier: payload.supplier || "",
    status: payload.status || "lease",
    monthly_rent: toNullableNumber(payload.monthly_rent),
    lease_start_date: normalizeDate(payload.lease_start_date),
    lease_end_date: normalizeDate(payload.lease_end_date),
    lease_resolution: payload.lease_resolution || "",
    last_watered_at: normalizeDate(payload.last_watered_at),
    water_interval_days: Number(payload.water_interval_days || 14),
    last_maintained_at: normalizeDate(payload.last_maintained_at),
    maintenance_interval_days: Number(payload.maintenance_interval_days || 90),
    notes: payload.notes || "",
  };
  if (payload.id) normalized.id = payload.id;
  return normalized;
}

export function normalizeMaintenancePayload(payload) {
  return {
    asset_id: payload.asset_id,
    maintenance_date: normalizeDate(payload.maintenance_date),
    issue_description: payload.issue_description || "",
    cost: toNullableNumber(payload.cost),
    provider: payload.provider || "",
    photo_url: payload.photo_url || "",
  };
}

export function computeAssetStatus(asset) {
  const leaseDaysUntil = asset.lease_end_date ? diffInDays(asset.lease_end_date) : null;
  const waterNextDate = asset.last_watered_at ? addDays(asset.last_watered_at, Number(asset.water_interval_days || 14)) : null;
  const maintenanceNextDate = asset.last_maintained_at
    ? addDays(asset.last_maintained_at, Number(asset.maintenance_interval_days || 90))
    : null;

  return {
    ...asset,
    reminders: {
      lease: buildLeaseReminder(leaseDaysUntil),
      water: buildCycleReminder(waterNextDate, 1),
      maintenance: buildCycleReminder(maintenanceNextDate, 7),
    },
  };
}

function buildLeaseReminder(daysUntil) {
  if (daysUntil === null) return { show: false, daysUntil: null, nextDate: null, level: "none", label: "未设置" };
  if (daysUntil > 90) return { show: false, daysUntil, nextDate: null, level: "none", label: `${daysUntil} 天后` };
  if (daysUntil < 0) return { show: true, daysUntil, nextDate: null, level: "high", label: `逾期 ${Math.abs(daysUntil)} 天` };
  if (daysUntil <= 30) return { show: true, daysUntil, nextDate: null, level: "high", label: `${daysUntil} 天内` };
  if (daysUntil <= 60) return { show: true, daysUntil, nextDate: null, level: "medium", label: `${daysUntil} 天内` };
  return { show: true, daysUntil, nextDate: null, level: "low", label: `${daysUntil} 天内` };
}

function buildCycleReminder(nextDate, warningWindow) {
  if (!nextDate) return { show: true, daysUntil: null, nextDate: null, level: "high", label: "未设置" };
  const daysUntil = diffInDays(nextDate);
  if (daysUntil > warningWindow) return { show: false, daysUntil, nextDate, level: "none", label: `${daysUntil} 天后` };
  if (daysUntil < 0) return { show: true, daysUntil, nextDate, level: "high", label: `逾期 ${Math.abs(daysUntil)} 天` };
  if (daysUntil === 0) return { show: true, daysUntil, nextDate, level: "high", label: "今天到期" };
  return { show: true, daysUntil, nextDate, level: "medium", label: `${daysUntil} 天内` };
}
