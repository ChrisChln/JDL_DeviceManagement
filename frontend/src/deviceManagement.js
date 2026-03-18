const STORAGE_KEY = "jdl-device-management-items";

export const deviceSeed = {
  assetCode: "",
  assetType: "",
  sn: "",
  brand: "",
  detail: "",
  quantity: "1",
  location: "",
  department: "",
};

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function validateDevicePayload(payload) {
  const errors = [];
  const device = {
    assetCode: sanitizeText(payload.assetCode),
    assetType: sanitizeText(payload.assetType),
    sn: sanitizeText(payload.sn),
    brand: sanitizeText(payload.brand),
    detail: sanitizeText(payload.detail),
    quantity: toPositiveInteger(payload.quantity),
    location: sanitizeText(payload.location),
    department: sanitizeText(payload.department),
  };

  if (!device.assetCode) errors.push("资产编码不能为空");
  if (!device.assetType) errors.push("资产小类不能为空");
  if (!device.sn) errors.push("SN 不能为空");
  if (!device.brand) errors.push("资产品牌不能为空");
  if (!device.detail) errors.push("资产详单不能为空");
  if (!device.location) errors.push("详细地点不能为空");
  if (!device.department) errors.push("责任人部门不能为空");
  if (device.quantity === null) errors.push("数量必须是大于 0 的整数");

  return { errors, device };
}

export function loadDevicesFromStorage(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "object" && item !== null);
  } catch {
    return [];
  }
}

export function saveDevicesToStorage(storage, devices) {
  storage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

export function upsertDevice(devices, payload, editingId = "") {
  const { errors, device } = validateDevicePayload(payload);
  if (errors.length) {
    return { errors, devices };
  }

  const timestamp = new Date().toISOString();
  const nextItem = {
    ...device,
    id:
      editingId ||
      `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    quantity: device.quantity,
    updatedAt: timestamp,
  };

  const nextDevices = editingId
    ? devices.map((item) => (item.id === editingId ? nextItem : item))
    : [nextItem, ...devices];

  return { errors: [], devices: nextDevices };
}

export function removeDeviceById(devices, id) {
  return devices.filter((item) => item.id !== id);
}

export function filterDevices(devices, keyword, filters = {}) {
  const query = sanitizeText(keyword).toLowerCase();
  const assetTypeFilter = sanitizeText(filters.assetType);
  const locationFilter = sanitizeText(filters.location);
  const departmentFilter = sanitizeText(filters.department);

  return devices.filter((item) =>
    [item.assetCode, item.assetType, item.sn, item.brand, item.location, item.department]
      .some((field) =>
        String(field ?? "")
          .toLowerCase()
          .includes(query),
      ) &&
    (!assetTypeFilter || String(item.assetType ?? "") === assetTypeFilter) &&
    (!locationFilter || String(item.location ?? "") === locationFilter) &&
    (!departmentFilter || String(item.department ?? "") === departmentFilter),
  );
}
