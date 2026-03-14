const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3101";
let accessToken = "";

export function setAccessToken(token) {
  accessToken = token || "";
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  getMe: () => request("/api/me"),
  getDashboard: () => request("/api/dashboard"),
  listAssets: () => request("/api/assets"),
  createAsset: (payload) => request("/api/assets", { method: "POST", body: JSON.stringify(payload) }),
  updateAsset: (id, payload) => request(`/api/assets/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAsset: (id) => request(`/api/assets/${id}`, { method: "DELETE" }),
  markWatered: (id) => request(`/api/assets/${id}/mark-watered`, { method: "POST" }),
  markMaintained: (id) => request(`/api/assets/${id}/mark-maintained`, { method: "POST" }),
  importAssets: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/assets/import", { method: "POST", body: formData });
  },
  listMaintenanceRecords: () => request("/api/maintenance-records"),
  createMaintenanceRecord: (payload) =>
    request("/api/maintenance-records", { method: "POST", body: JSON.stringify(payload) }),
  deleteMaintenanceRecord: (id) => request(`/api/maintenance-records/${id}`, { method: "DELETE" }),
};
