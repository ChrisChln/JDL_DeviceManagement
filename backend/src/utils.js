import XLSX from "xlsx";

const statusMap = {
  lease: "租赁",
  rent: "月租",
  owned: "自有",
  repair: "维修中",
  idle: "闲置",
  "租赁": "租赁",
  "在租": "租赁",
  "租借": "租赁",
  "月租": "月租",
  "租用": "月租",
  "自有": "自有",
  "采购": "自有",
  "已采购": "自有",
  "维修": "维修中",
  "维修中": "维修中",
  "故障": "维修中",
  "闲置": "闲置",
  "空闲": "闲置",
  "停用": "闲置",
};

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

export function toNullableBoolean(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "是", "已下单", "已采购", "采购", "下单"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "否", "未下单", "未采购", "未下采购单"].includes(normalized)) {
    return false;
  }
  return null;
}

export function normalizeAssetStatus(value) {
  if (value === null || value === undefined || value === "") return "租赁";
  const normalized = String(value).trim().toLowerCase();
  return statusMap[normalized] ?? null;
}

export function normalizeAssetPayload(payload) {
  const normalizedStatus = normalizeAssetStatus(payload.status);
  const normalized = {
    warehouse: payload.warehouse || "",
    department: payload.department || "",
    model: payload.model || "",
    serial_number: payload.serial_number || "",
    brand: payload.brand || "",
    supplier: payload.supplier || "",
    status: normalizedStatus || "租赁",
    monthly_rent: toNullableNumber(payload.monthly_rent),
    is_purchase_ordered: toNullableBoolean(payload.is_purchase_ordered),
    lease_start_date: normalizeDate(payload.lease_start_date),
    lease_end_date: normalizeDate(payload.lease_end_date),
    lease_resolution: payload.lease_resolution || "",
    operation_requirement: payload.operation_requirement || "",
    current_status:
      payload.current_status || (normalizedStatus ? "" : String(payload.status || "")),
    issue_feedback: payload.issue_feedback || "",
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
  if (daysUntil < 0) return { show: true, daysUntil, nextDate: null, level: "high", label: "已过期" };
  if (daysUntil === 0) return { show: true, daysUntil, nextDate: null, level: "high", label: "今天" };
  if (daysUntil <= 30) return { show: true, daysUntil, nextDate: null, level: "high", label: `${daysUntil} 天后` };
  if (daysUntil <= 60) return { show: true, daysUntil, nextDate: null, level: "medium", label: `${daysUntil} 天后` };
  return { show: true, daysUntil, nextDate: null, level: "low", label: `${daysUntil} 天后` };
}

function buildCycleReminder(nextDate, warningWindow) {
  if (!nextDate) return { show: true, daysUntil: null, nextDate: null, level: "high", label: "未设置" };
  const daysUntil = diffInDays(nextDate);
  if (daysUntil > warningWindow) return { show: false, daysUntil, nextDate, level: "none", label: `${daysUntil} 天后` };
  if (daysUntil < 0) return { show: true, daysUntil, nextDate, level: "high", label: "已过期" };
  if (daysUntil === 0) return { show: true, daysUntil, nextDate, level: "high", label: "今天" };
  return { show: true, daysUntil, nextDate, level: "medium", label: `${daysUntil} 天后` };
}
