import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_CONFIG = window.APP_CONFIG?.supabase ?? {};
const STORAGE_KEY = "jdl-device-management-demo-db";
const VIEW_TITLES = {
  dashboard: "首页总览",
  assets: "资产台账",
  maintenance: "维修记录",
};

const demoData = {
  assets: [
    {
      id: "asset-1",
      warehouse: "昆山一仓",
      model: "电动平衡重叉车",
      serial_number: "JDL-FL-24001",
      brand: "Toyota",
      supplier: "丰田物料搬运",
      status: "lease",
      monthly_rent: 3200,
      lease_start_date: "2025-10-01",
      lease_end_date: "2026-04-05",
      lease_resolution: "续租评估中",
      last_watered_at: daysFromToday(-12),
      water_interval_days: 14,
      last_maintained_at: daysFromToday(-84),
      maintenance_interval_days: 90,
      notes: "高频作业设备",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "asset-2",
      warehouse: "嘉定二仓",
      model: "前移式叉车",
      serial_number: "JDL-FL-24002",
      brand: "Linde",
      supplier: "林德",
      status: "rent",
      monthly_rent: 2800,
      lease_start_date: "2025-08-12",
      lease_end_date: "2026-03-30",
      lease_resolution: "待采购部确认",
      last_watered_at: daysFromToday(-15),
      water_interval_days: 14,
      last_maintained_at: daysFromToday(-20),
      maintenance_interval_days: 90,
      notes: "冷库区域使用",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "asset-3",
      warehouse: "太仓三仓",
      model: "堆高车",
      serial_number: "JDL-FL-24003",
      brand: "Hyster",
      supplier: "Hyster China",
      status: "owned",
      monthly_rent: 0,
      lease_start_date: null,
      lease_end_date: null,
      lease_resolution: "自有资产",
      last_watered_at: daysFromToday(-3),
      water_interval_days: 10,
      last_maintained_at: daysFromToday(-175),
      maintenance_interval_days: 180,
      notes: "夜班备用机",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "asset-4",
      warehouse: "昆山一仓",
      model: "拣选车",
      serial_number: "JDL-FL-24004",
      brand: "Crown",
      supplier: "科朗",
      status: "repair",
      monthly_rent: 2100,
      lease_start_date: "2025-07-01",
      lease_end_date: "2026-06-30",
      lease_resolution: "维修后继续使用",
      last_watered_at: daysFromToday(-14),
      water_interval_days: 14,
      last_maintained_at: daysFromToday(-95),
      maintenance_interval_days: 90,
      notes: "液压系统异常",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  maintenance: [
    {
      id: "mr-1",
      asset_id: "asset-4",
      maintenance_date: daysFromToday(-1),
      issue_description: "液压系统压力不稳定，已更换密封件并校准。",
      cost: 1250,
      provider: "科朗售后",
      photo_url: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "mr-2",
      asset_id: "asset-2",
      maintenance_date: daysFromToday(-21),
      issue_description: "电池端子氧化，完成清洁与绝缘处理。",
      cost: 360,
      provider: "林德服务商",
      photo_url: "",
      created_at: new Date().toISOString(),
    },
  ],
};

const state = {
  currentView: "dashboard",
  assets: [],
  maintenance: [],
  search: "",
  assetFilters: { warehouse: "all", status: "all", lease: "all" },
  maintenanceAssetFilter: "all",
  assetModalMode: "create",
  backend: "demo",
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  configDot: document.querySelector("#configDot"),
  configLabel: document.querySelector("#configLabel"),
  configHint: document.querySelector("#configHint"),
  globalSearch: document.querySelector("#globalSearch"),
  kpiGrid: document.querySelector("#kpiGrid"),
  alertList: document.querySelector("#alertList"),
  statusSummary: document.querySelector("#statusSummary"),
  leasePanel: document.querySelector("#leasePanel"),
  waterPanel: document.querySelector("#waterPanel"),
  maintenancePanel: document.querySelector("#maintenancePanel"),
  warehouseFilter: document.querySelector("#warehouseFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  leaseFilter: document.querySelector("#leaseFilter"),
  assetTableBody: document.querySelector("#assetTableBody"),
  maintenanceAssetFilter: document.querySelector("#maintenanceAssetFilter"),
  maintenanceTableBody: document.querySelector("#maintenanceTableBody"),
  assetModal: document.querySelector("#assetModal"),
  assetForm: document.querySelector("#assetForm"),
  assetModalTitle: document.querySelector("#assetModalTitle"),
  maintenanceModal: document.querySelector("#maintenanceModal"),
  maintenanceForm: document.querySelector("#maintenanceForm"),
  maintenanceAssetSelect: document.querySelector("#maintenanceAssetSelect"),
  importInput: document.querySelector("#importInput"),
  toast: document.querySelector("#toast"),
};

const supabase = canUseSupabase()
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

const api = supabase ? createSupabaseApi(supabase) : createLocalApi();

bootstrap();

async function bootstrap() {
  bindEvents();
  updateConnectionStatus();
  await refreshData();
}

function bindEvents() {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });

  document.querySelector("#syncButton").addEventListener("click", refreshData);
  document.querySelector("#createAssetButton").addEventListener("click", () => openAssetModal());
  document.querySelector("#addAssetToolbarButton").addEventListener("click", () => openAssetModal());
  document.querySelector("#createMaintenanceButton").addEventListener("click", () => openMaintenanceModal());
  document.querySelector("#addMaintenanceToolbarButton").addEventListener("click", () => openMaintenanceModal());
  document.querySelector("#importButton").addEventListener("click", () => els.importInput.click());
  document.querySelector("#exportButton").addEventListener("click", exportWorkbook);

  els.globalSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderAll();
  });

  els.warehouseFilter.addEventListener("change", (event) => {
    state.assetFilters.warehouse = event.target.value;
    renderAssets();
  });
  els.statusFilter.addEventListener("change", (event) => {
    state.assetFilters.status = event.target.value;
    renderAssets();
  });
  els.leaseFilter.addEventListener("change", (event) => {
    state.assetFilters.lease = event.target.value;
    renderAssets();
  });
  els.maintenanceAssetFilter.addEventListener("change", (event) => {
    state.maintenanceAssetFilter = event.target.value;
    renderMaintenance();
  });

  els.assetForm.addEventListener("submit", handleAssetSubmit);
  els.maintenanceForm.addEventListener("submit", handleMaintenanceSubmit);
  els.importInput.addEventListener("change", handleImport);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeModal}`).close());
  });
}

async function refreshData() {
  try {
    const [assets, maintenance] = await Promise.all([api.listAssets(), api.listMaintenance()]);
    state.assets = assets;
    state.maintenance = maintenance;
    populateFilters();
    renderAll();
    showToast("数据已刷新");
  } catch (error) {
    console.error(error);
    showToast(`加载失败：${error.message}`, true);
  }
}

function renderAll() {
  switchView(state.currentView, false);
  renderDashboard();
  renderAssets();
  renderMaintenance();
}

function switchView(view, updateNav = true) {
  state.currentView = view;
  els.viewTitle.textContent = VIEW_TITLES[view];
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.view === view);
  });

  if (updateNav) {
    document.querySelectorAll(".nav-link").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.viewTarget === view);
    });
  }
}

function renderDashboard() {
  const alerts = getSortedAlerts(state.assets);
  const stats = {
    total: state.assets.length,
    leaseDue: alerts.filter((item) => item.type === "lease" && item.daysUntil <= 90).length,
    waterDue: alerts.filter((item) => item.type === "water" && item.daysUntil <= 0).length,
    maintenanceDue: alerts.filter((item) => item.type === "maintenance" && item.daysUntil <= 7).length,
  };

  const kpis = [
    { icon: "inventory_2", label: "资产总数", value: String(stats.total), hint: "当前台账设备" },
    { icon: "event_upcoming", label: "90天内租赁到期", value: String(stats.leaseDue), hint: "含已逾期设备" },
    { icon: "water_drop", label: "待加水设备", value: String(stats.waterDue), hint: "到期和超期优先" },
    { icon: "build", label: "待保养设备", value: String(stats.maintenanceDue), hint: "提前 7 天提醒" },
  ];

  els.kpiGrid.innerHTML = kpis.map((kpi) => `
    <article class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-icon material-symbols-outlined">${kpi.icon}</span>
        <span class="badge">实时</span>
      </div>
      <p class="kpi-value">${kpi.value}</p>
      <p class="kpi-label">${kpi.label}</p>
      <p class="hint">${kpi.hint}</p>
    </article>
  `).join("");

  els.alertList.innerHTML = renderList(
    alerts.slice(0, 8).map((alert) => `
      <article class="alert-item asset-meta">
        <span class="severity-dot severity-${alert.severity}"></span>
        <div class="alert-main">
          <p class="alert-title">${alert.title}</p>
          <p class="alert-subtitle">${alert.subtitle}</p>
        </div>
        <span class="pill ${pillClass(alert.severity)}">${alert.badge}</span>
      </article>
    `),
    "暂无提醒项",
  );

  const summary = [
    ["租赁逾期", alerts.filter((item) => item.type === "lease" && item.daysUntil < 0).length],
    ["今日需加水", alerts.filter((item) => item.type === "water" && item.daysUntil <= 0).length],
    ["7天内需保养", alerts.filter((item) => item.type === "maintenance" && item.daysUntil <= 7).length],
    ["维修记录数", state.maintenance.length],
  ];
  els.statusSummary.innerHTML = summary.map(([label, value]) => `
    <article class="summary-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  renderReminderPanel(els.leasePanel, alerts.filter((item) => item.type === "lease").slice(0, 4), "暂无租赁提醒");
  renderReminderPanel(els.waterPanel, alerts.filter((item) => item.type === "water").slice(0, 4), "暂无加水提醒");
  renderReminderPanel(els.maintenancePanel, alerts.filter((item) => item.type === "maintenance").slice(0, 4), "暂无保养提醒");
}

function renderReminderPanel(container, items, emptyLabel) {
  container.innerHTML = renderList(
    items.map((item) => `
      <article class="mini-item">
        <div>
          <p class="alert-title">${item.asset.serial_number}</p>
          <span>${item.subtitle}</span>
        </div>
        <span class="pill ${pillClass(item.severity)}">${item.badge}</span>
      </article>
    `),
    emptyLabel,
  );
}

function renderAssets() {
  const assets = getFilteredAssets();
  els.assetTableBody.innerHTML = renderList(
    assets.map((asset) => {
      const lease = getLeaseStatus(asset);
      const water = getWaterStatus(asset);
      const maintenance = getMaintenanceStatus(asset);
      return `
        <tr>
          <td>
            <div class="asset-meta">
              <span class="asset-avatar material-symbols-outlined">forklift</span>
              <div>
                <p class="asset-name">${asset.serial_number}</p>
                <p class="asset-subtitle">${asset.model}</p>
                <p class="hint">${asset.notes ?? ""}</p>
              </div>
            </div>
          </td>
          <td>
            <p class="asset-name">${asset.warehouse}</p>
            <p class="asset-subtitle">${asset.brand} / ${asset.supplier || "-"}</p>
            <p class="hint">状态：${asset.status}</p>
          </td>
          <td>
            ${renderStatusBlock("到期日期", formatDate(asset.lease_end_date), lease)}
            <p class="hint">处理方式：${asset.lease_resolution || "-"}</p>
          </td>
          <td>
            ${renderStatusBlock("下次加水", formatDate(water.nextDate), water)}
            <div class="row-actions">
              <button class="text-button" data-action="water" data-id="${asset.id}">已加水</button>
            </div>
          </td>
          <td>
            ${renderStatusBlock("下次保养", formatDate(maintenance.nextDate), maintenance)}
            <div class="row-actions">
              <button class="text-button" data-action="maintain" data-id="${asset.id}">已保养</button>
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="text-button" data-action="edit-asset" data-id="${asset.id}">编辑</button>
              <button class="text-button danger-button" data-action="delete-asset" data-id="${asset.id}">删除</button>
            </div>
          </td>
        </tr>
      `;
    }),
    "没有符合条件的资产",
    6,
  );

  els.assetTableBody.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAssetAction(button.dataset.action, button.dataset.id));
  });
}

function renderMaintenance() {
  const rows = getFilteredMaintenance();
  els.maintenanceTableBody.innerHTML = renderList(
    rows.map((record) => {
      const asset = state.assets.find((item) => item.id === record.asset_id);
      return `
        <tr>
          <td>${formatDate(record.maintenance_date)}</td>
          <td>${asset?.serial_number ?? "未知资产"}</td>
          <td>
            <div class="record-issue">
              <div>
                <p class="asset-name">${record.issue_description}</p>
                <p>${asset?.model ?? ""}</p>
              </div>
            </div>
          </td>
          <td>${formatCurrency(record.cost)}</td>
          <td>${record.provider || "-"}</td>
          <td>${record.photo_url ? `<a class="text-button" href="${record.photo_url}" target="_blank" rel="noreferrer">查看附件</a>` : "-"}</td>
          <td><button class="text-button danger-button" data-action="delete-maintenance" data-id="${record.id}">删除</button></td>
        </tr>
      `;
    }),
    "暂无维修记录",
    7,
  );

  els.maintenanceTableBody.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleMaintenanceAction(button.dataset.action, button.dataset.id));
  });
}

function populateFilters() {
  const warehouses = ["all", ...new Set(state.assets.map((item) => item.warehouse).filter(Boolean))];
  const statuses = ["all", "lease", "rent", "owned", "repair", "idle"];

  syncSelect(els.warehouseFilter, warehouses, state.assetFilters.warehouse, { all: "全部仓库" });
  syncSelect(els.statusFilter, statuses, state.assetFilters.status, { all: "全部状态" });
  syncSelect(
    els.maintenanceAssetFilter,
    ["all", ...state.assets.map((item) => item.id)],
    state.maintenanceAssetFilter,
    { all: "全部资产", ...Object.fromEntries(state.assets.map((item) => [item.id, `${item.serial_number} / ${item.model}`])) },
  );
  syncSelect(
    els.maintenanceAssetSelect,
    state.assets.map((item) => item.id),
    state.assets[0]?.id ?? "",
    Object.fromEntries(state.assets.map((item) => [item.id, `${item.serial_number} / ${item.model}`])),
  );
}

function syncSelect(select, values, selected, labels = {}) {
  const normalized = values.filter((value, index, arr) => arr.indexOf(value) === index);
  select.innerHTML = normalized
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${labels[value] || value}</option>`)
    .join("");
}

function openAssetModal(assetId = null) {
  state.assetModalMode = assetId ? "edit" : "create";
  els.assetModalTitle.textContent = assetId ? "编辑资产" : "新增资产";
  els.assetForm.reset();
  els.assetForm.elements.id.value = "";
  if (assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    Object.entries(asset).forEach(([key, value]) => {
      if (els.assetForm.elements[key]) els.assetForm.elements[key].value = value ?? "";
    });
  }
  els.assetModal.showModal();
}

function openMaintenanceModal(assetId = null) {
  els.maintenanceForm.reset();
  populateFilters();
  els.maintenanceForm.elements.asset_id.value = assetId || state.assets[0]?.id || "";
  els.maintenanceForm.elements.maintenance_date.value = formatDateInput(new Date());
  els.maintenanceModal.showModal();
}

async function handleAssetSubmit(event) {
  event.preventDefault();
  try {
    const payload = formToObject(new FormData(els.assetForm));
    payload.monthly_rent = toNullableNumber(payload.monthly_rent);
    payload.water_interval_days = Number(payload.water_interval_days || 14);
    payload.maintenance_interval_days = Number(payload.maintenance_interval_days || 90);
    payload.id = payload.id || undefined;
    await api.upsertAsset(payload);
    els.assetModal.close();
    await refreshData();
    showToast("资产已保存");
  } catch (error) {
    console.error(error);
    showToast(`保存失败：${error.message}`, true);
  }
}

async function handleMaintenanceSubmit(event) {
  event.preventDefault();
  try {
    const payload = formToObject(new FormData(els.maintenanceForm));
    payload.cost = toNullableNumber(payload.cost);
    await api.addMaintenanceRecord(payload);
    els.maintenanceModal.close();
    await refreshData();
    showToast("维修记录已保存");
  } catch (error) {
    console.error(error);
    showToast(`保存失败：${error.message}`, true);
  }
}

async function handleAssetAction(action, id) {
  const asset = state.assets.find((item) => item.id === id);
  try {
    if (action === "edit-asset") {
      openAssetModal(id);
      return;
    }
    if (action === "water") {
      await api.markWatered(id);
      await refreshData();
      showToast(`${asset.serial_number} 已更新为今日加水`);
      return;
    }
    if (action === "maintain") {
      await api.markMaintained(id);
      await refreshData();
      showToast(`${asset.serial_number} 已更新为今日保养`);
      return;
    }
    if (action === "delete-asset") {
      if (!window.confirm(`确认删除资产 ${asset.serial_number}？`)) return;
      await api.deleteAsset(id);
      await refreshData();
      showToast("资产已删除");
    }
  } catch (error) {
    console.error(error);
    showToast(`操作失败：${error.message}`, true);
  }
}

async function handleMaintenanceAction(action, id) {
  if (action !== "delete-maintenance") return;
  if (!window.confirm("确认删除这条维修记录？")) return;
  try {
    await api.deleteMaintenanceRecord(id);
    await refreshData();
    showToast("维修记录已删除");
  } catch (error) {
    console.error(error);
    showToast(`删除失败：${error.message}`, true);
  }
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const [sheetName] = workbook.SheetNames;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    if (!rows.length) throw new Error("导入文件为空");

    for (const row of rows) {
      await api.upsertAsset({
        warehouse: row["仓库"] || row.warehouse,
        model: row["车型"] || row.model,
        serial_number: row["序列号"] || row.serial_number,
        brand: row["品牌"] || row.brand,
        supplier: row["供应商"] || row.supplier,
        status: row["状态"] || row.status || "lease",
        monthly_rent: toNullableNumber(row["月租"] || row.monthly_rent),
        lease_start_date: normalizeInputDate(row["起租日期"] || row.lease_start_date),
        lease_end_date: normalizeInputDate(row["到期日期"] || row.lease_end_date),
        lease_resolution: row["到期处理方式"] || row.lease_resolution,
        last_watered_at: normalizeInputDate(row["上次加水日期"] || row.last_watered_at),
        water_interval_days: Number(row["加水周期"] || row.water_interval_days || 14),
        last_maintained_at: normalizeInputDate(row["上次保养日期"] || row.last_maintained_at),
        maintenance_interval_days: Number(row["保养周期"] || row.maintenance_interval_days || 90),
        notes: row["备注"] || row.notes,
      });
    }

    event.target.value = "";
    await refreshData();
    showToast(`已导入 ${rows.length} 条资产`);
  } catch (error) {
    console.error(error);
    showToast(`导入失败：${error.message}`, true);
  }
}

function exportWorkbook() {
  try {
    const workbook = XLSX.utils.book_new();
    const assetSheet = XLSX.utils.json_to_sheet(
      state.assets.map((asset) => ({
        仓库: asset.warehouse,
        车型: asset.model,
        序列号: asset.serial_number,
        品牌: asset.brand,
        供应商: asset.supplier,
        状态: asset.status,
        月租: asset.monthly_rent,
        起租日期: asset.lease_start_date,
        到期日期: asset.lease_end_date,
        到期处理方式: asset.lease_resolution,
        上次加水日期: asset.last_watered_at,
        加水周期: asset.water_interval_days,
        上次保养日期: asset.last_maintained_at,
        保养周期: asset.maintenance_interval_days,
        备注: asset.notes,
      })),
    );
    const maintenanceSheet = XLSX.utils.json_to_sheet(
      state.maintenance.map((record) => {
        const asset = state.assets.find((item) => item.id === record.asset_id);
        return {
          维修日期: record.maintenance_date,
          序列号: asset?.serial_number ?? "",
          问题描述: record.issue_description,
          维修费用: record.cost,
          维修供应商: record.provider,
          照片附件: record.photo_url,
        };
      }),
    );
    XLSX.utils.book_append_sheet(workbook, assetSheet, "资产台账");
    XLSX.utils.book_append_sheet(workbook, maintenanceSheet, "维修记录");
    XLSX.writeFile(workbook, `jdl-device-management-${formatDateInput(new Date())}.xlsx`);
  } catch (error) {
    console.error(error);
    showToast(`导出失败：${error.message}`, true);
  }
}

function getFilteredAssets() {
  return state.assets.filter((asset) => {
    const lease = getLeaseStatus(asset);
    const matchesSearch =
      !state.search ||
      [asset.serial_number, asset.brand, asset.model, asset.warehouse, asset.supplier]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(state.search.toLowerCase()));
    const matchesWarehouse = state.assetFilters.warehouse === "all" || asset.warehouse === state.assetFilters.warehouse;
    const matchesStatus = state.assetFilters.status === "all" || asset.status === state.assetFilters.status;
    const matchesLease =
      state.assetFilters.lease === "all" ||
      (state.assetFilters.lease === "overdue" && lease.daysUntil < 0) ||
      (Number(state.assetFilters.lease) > 0 && lease.daysUntil <= Number(state.assetFilters.lease));

    return matchesSearch && matchesWarehouse && matchesStatus && matchesLease;
  });
}

function getFilteredMaintenance() {
  return state.maintenance
    .filter((record) => {
      const asset = state.assets.find((item) => item.id === record.asset_id);
      const matchesSearch =
        !state.search ||
        [asset?.serial_number, record.issue_description, record.provider]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(state.search.toLowerCase()));
      const matchesAsset = state.maintenanceAssetFilter === "all" || record.asset_id === state.maintenanceAssetFilter;
      return matchesSearch && matchesAsset;
    })
    .sort((a, b) => String(b.maintenance_date).localeCompare(String(a.maintenance_date)));
}

function getSortedAlerts(assets) {
  return assets
    .flatMap((asset) => {
      const lease = getLeaseStatus(asset);
      const water = getWaterStatus(asset);
      const maintenance = getMaintenanceStatus(asset);
      const items = [];
      if (lease.show) items.push({ type: "lease", asset, daysUntil: lease.daysUntil, severity: lease.severity, title: `${asset.serial_number} 租赁到期提醒`, subtitle: `${asset.warehouse} · ${formatRelativeDayLabel(lease.daysUntil)} · 处理方式：${asset.lease_resolution || "待确认"}`, badge: lease.badge });
      if (water.show) items.push({ type: "water", asset, daysUntil: water.daysUntil, severity: water.severity, title: `${asset.serial_number} 加水提醒`, subtitle: `${asset.warehouse} · 下次加水 ${formatDate(water.nextDate)}`, badge: water.badge });
      if (maintenance.show) items.push({ type: "maintenance", asset, daysUntil: maintenance.daysUntil, severity: maintenance.severity, title: `${asset.serial_number} 保养提醒`, subtitle: `${asset.warehouse} · 下次保养 ${formatDate(maintenance.nextDate)}`, badge: maintenance.badge });
      return items;
    })
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.daysUntil - b.daysUntil);
}

function getLeaseStatus(asset) {
  if (!asset.lease_end_date) return { show: false, severity: "low", badge: "无租赁", daysUntil: 9999 };
  const daysUntil = diffInDays(asset.lease_end_date);
  if (daysUntil > 90) return { show: false, severity: "low", badge: `${daysUntil}天后`, daysUntil };
  if (daysUntil < 0) return { show: true, severity: "high", badge: `逾期 ${Math.abs(daysUntil)} 天`, daysUntil };
  if (daysUntil <= 30) return { show: true, severity: "high", badge: `${daysUntil} 天内`, daysUntil };
  if (daysUntil <= 60) return { show: true, severity: "medium", badge: `${daysUntil} 天内`, daysUntil };
  return { show: true, severity: "low", badge: `${daysUntil} 天内`, daysUntil };
}

function getWaterStatus(asset) {
  if (!asset.last_watered_at) return { show: true, severity: "high", badge: "未设置", daysUntil: -999, nextDate: null };
  const nextDate = addDays(asset.last_watered_at, Number(asset.water_interval_days || 14));
  const daysUntil = diffInDays(nextDate);
  if (daysUntil > 1) return { show: false, severity: "low", badge: `${daysUntil} 天后`, daysUntil, nextDate };
  if (daysUntil < 0) return { show: true, severity: "high", badge: `超期 ${Math.abs(daysUntil)} 天`, daysUntil, nextDate };
  return { show: true, severity: daysUntil === 0 ? "high" : "medium", badge: daysUntil === 0 ? "今天到期" : "明天到期", daysUntil, nextDate };
}

function getMaintenanceStatus(asset) {
  if (!asset.last_maintained_at) return { show: true, severity: "high", badge: "未设置", daysUntil: -999, nextDate: null };
  const nextDate = addDays(asset.last_maintained_at, Number(asset.maintenance_interval_days || 90));
  const daysUntil = diffInDays(nextDate);
  if (daysUntil > 7) return { show: false, severity: "low", badge: `${daysUntil} 天后`, daysUntil, nextDate };
  if (daysUntil < 0) return { show: true, severity: "high", badge: `超期 ${Math.abs(daysUntil)} 天`, daysUntil, nextDate };
  return { show: true, severity: daysUntil <= 2 ? "high" : "medium", badge: `${daysUntil} 天内`, daysUntil, nextDate };
}

function renderStatusBlock(title, date, status) {
  return `
    <p class="asset-name">${title}</p>
    <p class="asset-subtitle">${date || "-"}</p>
    <span class="tag ${pillClass(status.severity)}">${status.badge}</span>
  `;
}

function pillClass(severity) {
  return { high: "pill-danger", medium: "pill-warning", low: "pill-info" }[severity];
}

function renderList(items, emptyLabel, colspan = 1) {
  if (items.length) return items.join("");
  if (colspan > 1) return `<tr><td colspan="${colspan}"><div class="empty-state">${emptyLabel}</div></td></tr>`;
  return `<div class="empty-state">${emptyLabel}</div>`;
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.background = isError ? "rgba(122, 35, 28, 0.94)" : "rgba(10, 23, 25, 0.92)";
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
}

function updateConnectionStatus() {
  state.backend = supabase ? "supabase" : "demo";
  els.configDot.style.background = supabase ? "var(--success)" : "var(--warning)";
  els.configLabel.textContent = supabase ? "Supabase 已连接" : "本地演示模式";
  els.configHint.textContent = supabase
    ? "当前操作会直接读写 Supabase 表 `assets` 和 `maintenance_records`。"
    : "请创建 `supabase-config.js` 后刷新页面，即可切换到 Supabase。";
}

function createSupabaseApi(client) {
  return {
    async listAssets() {
      const { data, error } = await client.from("assets").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async upsertAsset(payload) {
      const { error } = await client.from("assets").upsert(normalizeAssetPayload(payload), { onConflict: "serial_number" });
      if (error) throw error;
    },
    async deleteAsset(id) {
      const { error } = await client.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    async markWatered(id) {
      const { error } = await client.from("assets").update({ last_watered_at: formatDateInput(new Date()) }).eq("id", id);
      if (error) throw error;
    },
    async markMaintained(id) {
      const { error } = await client.from("assets").update({ last_maintained_at: formatDateInput(new Date()) }).eq("id", id);
      if (error) throw error;
    },
    async listMaintenance() {
      const { data, error } = await client.from("maintenance_records").select("*").order("maintenance_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    async addMaintenanceRecord(payload) {
      const { error } = await client.from("maintenance_records").insert(normalizeMaintenancePayload(payload));
      if (error) throw error;
    },
    async deleteMaintenanceRecord(id) {
      const { error } = await client.from("maintenance_records").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

function createLocalApi() {
  const db = readLocalDb();
  return {
    async listAssets() { return db.assets; },
    async upsertAsset(payload) {
      const normalized = normalizeAssetPayload(payload);
      const index = db.assets.findIndex((item) => item.id === normalized.id || item.serial_number === normalized.serial_number);
      if (index >= 0) db.assets[index] = { ...db.assets[index], ...normalized, updated_at: new Date().toISOString() };
      else db.assets.unshift({ ...normalized, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      persistLocalDb(db);
    },
    async deleteAsset(id) {
      db.assets = db.assets.filter((item) => item.id !== id);
      db.maintenance = db.maintenance.filter((item) => item.asset_id !== id);
      persistLocalDb(db);
    },
    async markWatered(id) {
      const asset = db.assets.find((item) => item.id === id);
      asset.last_watered_at = formatDateInput(new Date());
      asset.updated_at = new Date().toISOString();
      persistLocalDb(db);
    },
    async markMaintained(id) {
      const asset = db.assets.find((item) => item.id === id);
      asset.last_maintained_at = formatDateInput(new Date());
      asset.updated_at = new Date().toISOString();
      persistLocalDb(db);
    },
    async listMaintenance() { return db.maintenance; },
    async addMaintenanceRecord(payload) {
      db.maintenance.unshift({ ...normalizeMaintenancePayload(payload), id: crypto.randomUUID(), created_at: new Date().toISOString() });
      persistLocalDb(db);
    },
    async deleteMaintenanceRecord(id) {
      db.maintenance = db.maintenance.filter((item) => item.id !== id);
      persistLocalDb(db);
    },
  };
}

function normalizeAssetPayload(payload) {
  const normalized = {
    warehouse: payload.warehouse || "",
    model: payload.model || "",
    serial_number: payload.serial_number || "",
    brand: payload.brand || "",
    supplier: payload.supplier || "",
    status: payload.status || "lease",
    monthly_rent: toNullableNumber(payload.monthly_rent),
    lease_start_date: normalizeInputDate(payload.lease_start_date),
    lease_end_date: normalizeInputDate(payload.lease_end_date),
    lease_resolution: payload.lease_resolution || "",
    last_watered_at: normalizeInputDate(payload.last_watered_at),
    water_interval_days: Number(payload.water_interval_days || 14),
    last_maintained_at: normalizeInputDate(payload.last_maintained_at),
    maintenance_interval_days: Number(payload.maintenance_interval_days || 90),
    notes: payload.notes || "",
  };
  if (payload.id) normalized.id = payload.id;
  return normalized;
}

function normalizeMaintenancePayload(payload) {
  return {
    asset_id: payload.asset_id,
    maintenance_date: normalizeInputDate(payload.maintenance_date),
    issue_description: payload.issue_description || "",
    cost: toNullableNumber(payload.cost),
    provider: payload.provider || "",
    photo_url: payload.photo_url || "",
  };
}

function canUseSupabase() {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function readLocalDb() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(demoData));
  return JSON.parse(JSON.stringify(demoData));
}

function persistLocalDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function formToObject(formData) { return Object.fromEntries(formData.entries()); }

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(Number(value));
}

function formatDateInput(date) {
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function normalizeInputDate(value) {
  if (!value) return null;
  if (typeof value === "number" && window.XLSX) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDateInput(date);
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function diffInDays(value) {
  const start = new Date(formatDateInput(new Date()));
  const target = new Date(value);
  return Math.round((target - start) / 86400000);
}

function severityRank(severity) {
  return { high: 0, medium: 1, low: 2 }[severity] ?? 3;
}

function formatRelativeDayLabel(daysUntil) {
  if (daysUntil < 0) return `已逾期 ${Math.abs(daysUntil)} 天`;
  if (daysUntil === 0) return "今天到期";
  if (daysUntil === 1) return "明天到期";
  return `${daysUntil} 天后到期`;
}

function daysFromToday(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDateInput(date);
}
