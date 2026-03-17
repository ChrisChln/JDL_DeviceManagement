import { normalizeDate } from "./utils.js";

const METRIC_FIELDS = [
  "day_shift_forecast",
  "night_shift_forecast",
  "actual_day_shift",
  "actual_night_shift",
];

export function normalizeLaborSchedulePayload(payload) {
  const planDate = normalizeDate(payload.plan_date ?? payload.planDate);
  if (!planDate) {
    throw new Error("plan_date is required and must be a valid date");
  }

  const normalized = {
    plan_date: planDate,
    template_version: normalizeText(payload.template_version ?? payload.templateVersion, 64),
    toc_labor: normalizeTocLabor(payload.toc_labor ?? payload.tocLabor),
    notes: normalizeText(payload.notes, 2000),
    updated_by: normalizeText(payload.updated_by ?? payload.updatedBy, 255),
  };

  for (const field of METRIC_FIELDS) {
    normalized[field] = normalizeNonNegativeNumber(payload[field]);
  }

  return normalized;
}

function normalizeTocLabor(value) {
  if (value === null || value === undefined || value === "") {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("toc_labor must be a JSON object");
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const area = String(key || "").trim();
    if (!area) continue;

    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`toc_labor.${area} must be an object`);
    }

    const normalizedEntry = {
      total: normalizeNonNegativeNumber(entry.total),
      ds: normalizeNonNegativeNumber(entry.ds),
      ns: normalizeNonNegativeNumber(entry.ns),
      day_shift_capacity: normalizeNonNegativeNumber(entry.day_shift_capacity),
      night_shift_capacity: normalizeNonNegativeNumber(entry.night_shift_capacity),
    };

    result[area] = normalizedEntry;
  }

  return result;
}

function normalizeText(value, maxLength) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (text.length > maxLength) {
    throw new Error(`text value exceeds max length ${maxLength}`);
  }
  return text;
}

function normalizeNonNegativeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error("numeric field must be a finite number");
  }
  if (num < 0) {
    throw new Error("numeric field must be non-negative");
  }
  return num;
}
