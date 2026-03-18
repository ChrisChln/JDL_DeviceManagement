import { useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessToken } from "./api.js";
import { authEnabled, supabaseAuth } from "./auth.js";
import {
  deviceSeed,
  filterDevices,
  loadDevicesFromStorage,
  removeDeviceById,
  saveDevicesToStorage,
  upsertDevice,
} from "./deviceManagement.js";

const assetSeed = {
  warehouse: "",
  model: "",
  serial_number: "",
  brand: "",
  supplier: "",
  status: "租赁",
  monthly_rent: "",
  is_purchase_ordered: "",
  lease_start_date: "",
  lease_end_date: "",
  lease_resolution: "",
  operation_requirement: "",
  current_status: "",
  issue_feedback: "",
  last_watered_at: "",
  water_interval_days: 14,
  last_maintained_at: "",
  maintenance_interval_days: 90,
  notes: "",
};

const assetStatuses = ["租赁", "自购", "备用", "维修中", "停用", "已退租", "报废"];
const recordSeed = {
  asset_id: "",
  maintenance_date: "",
  issue_description: "",
  cost: "",
  provider: "",
  photo_url: "",
};
const transferSeed = {
  asset_ids: [],
  from_warehouse: "",
  to_warehouse: "",
  reason: "",
  note: "",
};
const nav = [
  { id: "dashboard", label: "首页概览", icon: "dashboard" },
  { id: "assets", label: "资产台账", icon: "domain" },
  { id: "transfers", label: "资产调拨", icon: "swap_horiz" },
  { id: "devices", label: "设备管理", icon: "devices" },
  { id: "maintenance", label: "维修记录", icon: "build" },
  { id: "logs", label: "操作日志", icon: "history" },
];
const statuses = ["租赁", "月租", "自有", "维修中", "闲置"];
const exportColumns = [
  { header: "仓库", value: (asset) => asset.warehouse ?? "" },
  { header: "车型", value: (asset) => asset.model ?? "" },
  { header: "序列号", value: (asset) => asset.serial_number ?? "" },
  { header: "供应商", value: (asset) => asset.supplier ?? "" },
  { header: "叉车品牌", value: (asset) => asset.brand ?? "" },
  { header: "状态", value: (asset) => asset.status ?? "" },
  { header: "月租", value: (asset) => asset.monthly_rent ?? "" },
  {
    header: "是否采购下单",
    value: (asset) =>
      formatPurchaseOrdered(
        asset.is_purchase_ordered ??
          asset.purchase_order_status ??
          asset.purchase_ordered ??
          "",
      ),
  },
  { header: "起租日期", value: (asset) => asset.lease_start_date ?? "" },
  { header: "到期日期", value: (asset) => asset.lease_end_date ?? "" },
  { header: "后期处理方式", value: (asset) => asset.lease_resolution ?? "" },
  {
    header: "运营需求",
    value: (asset) =>
      asset.operation_requirement ?? asset.operational_requirement ?? "",
  },
  {
    header: "目前状态",
    value: (asset) => asset.current_status ?? "",
  },
  {
    header: "问题反馈",
    value: (asset) => asset.issue_feedback ?? "",
  },
  { header: "上次加水日期", value: (asset) => asset.last_watered_at ?? "" },
  { header: "加水周期", value: (asset) => asset.water_interval_days ?? "" },
  { header: "上次保养日期", value: (asset) => asset.last_maintained_at ?? "" },
  { header: "保养周期", value: (asset) => asset.maintenance_interval_days ?? "" },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [view, setView] = useState("dashboard");
  const [assets, setAssets] = useState([]);
  const [records, setRecords] = useState([]);
  const [transferRecords, setTransferRecords] = useState([]);
  const [profile, setProfile] = useState(null);
  const [operationLogs, setOperationLogs] = useState([]);
  const [profileForm, setProfileForm] = useState({ full_name: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    warehouse: "",
    model: "",
    supplier: "",
    brand: "",
    status: "",
  });
  const [assetSort, setAssetSort] = useState("default");
  const [assetForm, setAssetForm] = useState(assetSeed);
  const [recordForm, setRecordForm] = useState(recordSeed);
  const [transferForm, setTransferForm] = useState(transferSeed);
  const [editingId, setEditingId] = useState("");
  const [assetOpen, setAssetOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceEditingId, setDeviceEditingId] = useState("");
  const [deviceForm, setDeviceForm] = useState(deviceSeed);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!authEnabled) return void setBooting(false);
    supabaseAuth.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAccessToken(data.session?.access_token || "");
      setBooting(false);
    });
    const { data } = supabaseAuth.auth.onAuthStateChange((_e, next) => {
      setSession(next);
      setAccessToken(next?.access_token || "");
      setBooting(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDevices(loadDevicesFromStorage(window.localStorage));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveDevicesToStorage(window.localStorage, devices);
  }, [devices]);

  const dashboard = useMemo(
    () => summarize(assets, records),
    [assets, records],
  );
  const warehouses = useMemo(
    () => uniqueOptions(assets.map((a) => a.warehouse)),
    [assets],
  );
  const models = useMemo(() => uniqueOptions(assets.map((a) => a.model)), [assets]);
  const suppliers = useMemo(
    () => uniqueOptions(assets.map((a) => a.supplier)),
    [assets],
  );
  const brands = useMemo(() => uniqueOptions(assets.map((a) => a.brand)), [assets]);
  const assetMap = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets],
  );
  const recordRows = useMemo(
    () => records.map((r) => ({ ...r, asset: assetMap.get(r.asset_id) })),
    [records, assetMap],
  );
  const transferRows = useMemo(
    () =>
      transferRecords.map((record) => ({
        ...record,
        asset: assetMap.get(record.asset_id),
      })),
    [transferRecords, assetMap],
  );
  const filtered = useMemo(
    () =>
      assets
        .filter((a) => filterAsset(a, filters))
        .sort((a, b) => compareAssets(a, b, assetSort)),
    [assets, filters, assetSort],
  );
  const filteredDevices = useMemo(
    () => filterDevices(devices, deviceSearch),
    [devices, deviceSearch],
  );

  const note = (m) => {
    setToast(m);
    clearTimeout(note.t);
    note.t = setTimeout(() => setToast(""), 2400);
  };

  async function refresh() {
    try {
      const [a, r, t, me, logs] = await Promise.all([
        api.listAssets(),
        api.listMaintenanceRecords(),
        api.listTransferRecords(),
        api.getMe(),
        api.listOperationLogs(),
      ]);
      setAssets(a);
      setRecords(r);
      setTransferRecords(t);
      setProfile(me);
      setProfileForm({ full_name: me.full_name || "" });
      setOperationLogs(logs);
    } catch (e) {
      note(e.message);
    }
  }

  async function signIn(e) {
    e.preventDefault();
    if (!authEnabled) return note("缺少前端鉴权配置。");
    try {
      setAuthLoading(true);
      const { error } = await supabaseAuth.auth.signInWithPassword(login);
      if (error) throw error;
    } catch (e2) {
      note(e2.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await supabaseAuth.auth.signOut();
    setAssets([]);
    setRecords([]);
    setTransferRecords([]);
    setProfile(null);
    setOperationLogs([]);
    note("已退出登录");
  }

  async function saveProfileSetup(e) {
    e.preventDefault();
    try {
      setProfileSaving(true);
      const data = await api.saveProfile(profileForm);
      setProfile(data);
      setProfileForm({ full_name: data.full_name || "" });
      note("用户资料已完成");
      await refresh();
    } catch (error) {
      note(error.message);
    } finally {
      setProfileSaving(false);
    }
  }

  function openNewAsset() {
    setEditingId("");
    setAssetForm(assetSeed);
    setAssetOpen(true);
  }
  function openEditAsset(a) {
    setEditingId(a.id);
    setAssetForm({
      ...assetSeed,
      ...a,
      is_purchase_ordered:
        a.is_purchase_ordered === null || a.is_purchase_ordered === undefined
          ? ""
          : a.is_purchase_ordered
            ? "是"
            : "否",
    });
    setAssetOpen(true);
  }
  async function saveAsset(e) {
    e.preventDefault();
    try {
      setBusy("asset");
      if (editingId) await api.updateAsset(editingId, assetForm);
      else await api.createAsset(assetForm);
      setAssetOpen(false);
      note("资产已保存");
      await refresh();
    } catch (e2) {
      note(e2.message);
    } finally {
      setBusy("");
    }
  }
  async function removeAsset(id) {
    if (!window.confirm("确认删除这条资产吗？")) return;
    try {
      setBusy(id);
      await api.deleteAsset(id);
      note("资产已删除");
      await refresh();
    } catch (e) {
      note(e.message);
    } finally {
      setBusy("");
    }
  }
  async function mark(id, mode) {
    try {
      setBusy(`${mode}-${id}`);
      if (mode === "water") await api.markWatered(id);
      else await api.markMaintained(id);
      note(mode === "water" ? "加水日期已更新" : "保养日期已更新");
      await refresh();
    } catch (e) {
      note(e.message);
    } finally {
      setBusy("");
    }
  }
  function openNewRecord(assetId = "") {
    const asset = assets.find((item) => item.id === assetId);
    setRecordForm({
      ...recordSeed,
      asset_id: asset?.serial_number || assetId,
    });
    setRecordOpen(true);
  }
  function openNewTransfer(assetId = "") {
    const asset = assets.find((item) => item.id === assetId);
    setTransferForm({
      ...transferSeed,
      asset_ids: asset?.id ? [asset.id] : [],
      from_warehouse: asset?.warehouse || "",
    });
    setTransferOpen(true);
  }
  async function saveRecord(e) {
    e.preventDefault();
    try {
      setBusy("record");
      const assetId = resolveAssetReference(recordForm.asset_id, assets);
      if (!assetId) {
        note("请输入可匹配的资产序列号、车型或 ID");
        return;
      }
      await api.createMaintenanceRecord({ ...recordForm, asset_id: assetId });
      setRecordOpen(false);
      note("维修记录已保存");
      await refresh();
    } catch (e2) {
      note(e2.message);
    } finally {
      setBusy("");
    }
  }
  async function removeRecord(id) {
    if (!window.confirm("确认删除这条维修记录吗？")) return;
    try {
      setBusy(`record-${id}`);
      await api.deleteMaintenanceRecord(id);
      note("维修记录已删除");
      await refresh();
    } catch (e) {
      note(e.message);
    } finally {
      setBusy("");
    }
  }
  async function saveTransfer(e) {
    e.preventDefault();
    try {
      if (!transferForm.from_warehouse) {
        note("请先选择调出仓库");
        return;
      }
      if (!transferForm.asset_ids.length) {
        note("请至少选择一台需要调拨的设备");
        return;
      }
      if (!transferForm.to_warehouse) {
        note("请选择调入仓库");
        return;
      }
      setBusy("transfer");
      const result = await api.createTransferRecord(transferForm);
      setTransferOpen(false);
      note(`已完成 ${result.count} 台设备调拨`);
      await refresh();
    } catch (error) {
      note(error.message);
    } finally {
      setBusy("");
    }
  }
  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy("import");
      const res = await api.importAssets(file);
      note(`已导入 ${res.count} 条资产`);
      await refresh();
    } catch (er) {
      note(er.message);
    } finally {
      setBusy("");
      e.target.value = "";
    }
  }
  function onExport() {
    const XLSX = window.XLSX;
    if (!XLSX) {
      note("导出失败：未加载 Excel 导出组件");
      return;
    }

    const sheetRows = filtered.map((asset) =>
      Object.fromEntries(
        exportColumns.map((column) => [column.header, column.value(asset)]),
      ),
    );
    const worksheet = XLSX.utils.json_to_sheet(sheetRows, {
      header: exportColumns.map((column) => column.header),
    });
    worksheet["!cols"] = exportColumns.map((column) => ({
      wch: Math.max(column.header.length + 4, 12),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "资产台账");
    XLSX.writeFile(
      workbook,
      `assets-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  function openNewDevice() {
    setDeviceEditingId("");
    setDeviceForm(deviceSeed);
    setDeviceOpen(true);
  }

  function openEditDevice(device) {
    setDeviceEditingId(device.id);
    setDeviceForm({
      warehouse: device.warehouse,
      assetCode: device.assetCode,
      assetType: device.assetType,
      sn: device.sn,
      brand: device.brand,
      detail: device.detail,
      quantity: String(device.quantity),
      location: device.location,
      department: device.department,
    });
    setDeviceOpen(true);
  }

  function saveDevice(e) {
    e.preventDefault();
    const result = upsertDevice(devices, deviceForm, deviceEditingId);
    if (result.errors.length) {
      note(result.errors[0]);
      return;
    }
    setDevices(result.devices);
    setDeviceOpen(false);
    note(deviceEditingId ? "设备记录已更新" : "设备记录已新增");
  }

  function removeDevice(id) {
    if (!window.confirm("确认删除这条设备记录吗？")) return;
    setDevices((prev) => removeDeviceById(prev, id));
    note("设备记录已删除");
  }

  if (booting)
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="empty-state">正在初始化登录状态...</div>
        </div>
      </div>
    );
  if (!session)
    return (
      <div className="auth-shell">
        <form className="auth-card auth-card-premium" onSubmit={signIn}>
          <h1 className="auth-title">登录系统</h1>
          <label className="auth-field">
            <span>邮箱</span>
            <input
              value={login.email}
              onChange={(e) =>
                setLogin((s) => ({ ...s, email: e.target.value }))
              }
              type="email"
              required
            />
          </label>
          <label className="auth-field">
            <span>密码</span>
            <input
              value={login.password}
              onChange={(e) =>
                setLogin((s) => ({ ...s, password: e.target.value }))
              }
              type="password"
              required
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={authLoading}
          >
            <span className="material-symbols-outlined">login</span>
            {authLoading ? "登录中..." : "进入系统"}
          </button>
          {toast ? <div className="toast is-visible">{toast}</div> : null}
        </form>
      </div>
    );

  return (
    <div className="ui-shell">
      <aside className="ui-sidebar">
        <div className="ui-brand">
          <div className="ui-brand-icon">
            <img alt="JDL Logo" src="/jdl-logo.png" />
          </div>
          <div>
            <h1>JDL资产管理</h1>
          </div>
        </div>
        <p className="ui-label">主控制台</p>
        {nav.map((n) => (
          <button
            key={n.id}
            className={`ui-nav ${view === n.id ? "active" : ""}`}
            onClick={() => setView(n.id)}
            type="button"
          >
            <span className="material-symbols-outlined">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        {view === "assets" || view === "devices" || view === "transfers" ? (
          <button
            className="ui-primary side"
            type="button"
            onClick={
              view === "devices"
                ? openNewDevice
                : view === "transfers"
                  ? () => openNewTransfer()
                  : openNewAsset
            }
          >
            <span className="material-symbols-outlined">add</span>
            {view === "devices"
              ? "新增设备"
              : view === "transfers"
                ? "发起调拨"
                : "新增资产"}
          </button>
        ) : null}
      </aside>
      <div className="ui-main">
        {view === "dashboard" && (
          <Dashboard
            session={session}
            profile={profile}
            dashboard={dashboard}
            onRefresh={refresh}
            onSignOut={signOut}
          />
        )}
        {view === "assets" && (
          <Assets
            session={session}
            profile={profile}
            assets={assets}
            rows={filtered}
            dashboard={dashboard}
            filters={filters}
            setFilters={setFilters}
            assetSort={assetSort}
            setAssetSort={setAssetSort}
            warehouses={warehouses}
            models={models}
            suppliers={suppliers}
            brands={brands}
            busy={busy}
            fileRef={fileRef}
            onImport={onImport}
            onExport={onExport}
            onCreate={openNewAsset}
            onEdit={openEditAsset}
            onWater={(a) => mark(a.id, "water")}
            onMaintain={(a) => mark(a.id, "maintain")}
            onTransfer={(a) => openNewTransfer(a.id)}
            onRepair={(a) => openNewRecord(a.id)}
            onDelete={removeAsset}
            onSignOut={signOut}
          />
        )}
        {view === "transfers" && (
          <Transfers
            session={session}
            profile={profile}
            assets={assets}
            rows={transferRows}
            warehouses={warehouses}
            onCreate={openNewTransfer}
            onSignOut={signOut}
          />
        )}
        {view === "devices" && (
          <DeviceManagement
            session={session}
            profile={profile}
            rows={filteredDevices}
            total={devices.length}
            search={deviceSearch}
            setSearch={setDeviceSearch}
            onCreate={openNewDevice}
            onEdit={openEditDevice}
            onDelete={removeDevice}
            onSignOut={signOut}
          />
        )}
        {view === "maintenance" && (
          <Maintenance
            session={session}
            profile={profile}
            rows={recordRows}
            assets={assets}
            busy={busy}
            onCreate={() => openNewRecord()}
            onDelete={removeRecord}
            onSignOut={signOut}
          />
        )}
        {view === "logs" && (
          <OperationLogs
            session={session}
            profile={profile}
            rows={operationLogs}
            onSignOut={signOut}
          />
        )}
      </div>
      {session && profile && !profile.full_name && (
        <ProfileSetupModal
          value={profileForm.full_name}
          busy={profileSaving}
          onChange={(value) => setProfileForm({ full_name: value })}
          onSubmit={saveProfileSetup}
        />
      )}
      {assetOpen && (
        <Modal
          title={editingId ? "编辑资产" : "新增资产"}
          onClose={() => setAssetOpen(false)}
        >
          <form className="form-grid" onSubmit={saveAsset}>
            {assetFields(assetForm, setAssetForm)}
            <div className="modal-actions full-width">
              <button
                className="ui-ghost"
                type="button"
                onClick={() => setAssetOpen(false)}
              >
                取消
              </button>
              <button
                className="ui-primary"
                type="submit"
                disabled={busy === "asset"}
              >
                {busy === "asset" ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deviceOpen && (
        <Modal
          title={deviceEditingId ? "编辑设备" : "新增设备"}
          onClose={() => setDeviceOpen(false)}
        >
          <form className="form-grid" onSubmit={saveDevice}>
            {deviceFields(deviceForm, setDeviceForm)}
            <div className="modal-actions full-width">
              <button
                className="ui-ghost"
                type="button"
                onClick={() => setDeviceOpen(false)}
              >
                取消
              </button>
              <button className="ui-primary" type="submit">
                保存
              </button>
            </div>
          </form>
        </Modal>
      )}
      {recordOpen && (
        <Modal title="新增维修记录" onClose={() => setRecordOpen(false)}>
          <form className="form-grid" onSubmit={saveRecord}>
            <label className="full-width">
              <span>资产</span>
              <input
                value={recordForm.asset_id}
                onChange={(e) =>
                  setRecordForm((s) => ({ ...s, asset_id: e.target.value }))
                }
                required
                placeholder="输入资产序列号、车型或 ID"
              />
            </label>
            <label>
              <span>日期</span>
              <input
                type="date"
                value={recordForm.maintenance_date}
                onChange={(e) =>
                  setRecordForm((s) => ({
                    ...s,
                    maintenance_date: e.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              <span>供应商</span>
              <input
                value={recordForm.provider}
                onChange={(e) =>
                  setRecordForm((s) => ({ ...s, provider: e.target.value }))
                }
              />
            </label>
            <label>
              <span>费用</span>
              <input
                type="number"
                step="0.01"
                value={recordForm.cost}
                onChange={(e) =>
                  setRecordForm((s) => ({ ...s, cost: e.target.value }))
                }
              />
            </label>
            <label>
              <span>照片地址</span>
              <input
                value={recordForm.photo_url}
                onChange={(e) =>
                  setRecordForm((s) => ({ ...s, photo_url: e.target.value }))
                }
              />
            </label>
            <label className="full-width">
              <span>问题描述</span>
              <textarea
                rows="4"
                value={recordForm.issue_description}
                onChange={(e) =>
                  setRecordForm((s) => ({
                    ...s,
                    issue_description: e.target.value,
                  }))
                }
                required
              />
            </label>
            <div className="modal-actions full-width">
              <button
                className="ui-ghost"
                type="button"
                onClick={() => setRecordOpen(false)}
              >
                取消
              </button>
              <button
                className="ui-primary"
                type="submit"
                disabled={busy === "record"}
              >
                {busy === "record" ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {transferOpen && (
        <Modal
          title="资产调拨"
          onClose={() => setTransferOpen(false)}
          closeOnBackdrop={false}
          className="transfer-modal-card"
        >
          <form className="transfer-form" onSubmit={saveTransfer}>
            <TransferFields
              state={transferForm}
              setState={setTransferForm}
              assets={assets}
              warehouses={warehouses}
            />
            <div className="modal-actions transfer-modal-actions">
              <button
                className="ui-ghost"
                type="button"
                onClick={() => setTransferOpen(false)}
              >
                取消
              </button>
              <button
                className="ui-primary"
                type="submit"
                disabled={busy === "transfer"}
              >
                {busy === "transfer" ? "提交中..." : "确认调拨"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {toast ? <div className="toast is-visible">{toast}</div> : null}
    </div>
  );
}

function Dashboard({ session, profile, dashboard, onRefresh, onSignOut }) {
  return (
    <>
      <header className="page-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="系统管理员"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="page-heading">
          <h2>首页总览</h2>
          <p>实时查看固定资产提醒与运行状态。</p>
        </div>
        <div className="dash-hero">
          <div>
            <small>核心提醒引擎</small>
            <h3>{dashboard.alerts.length} 条待处理提醒</h3>
            <p>租赁到期、加水、保养提醒会按紧急程度自动排序。</p>
          </div>
          <div className="dash-side">
            <div>
              <span>资产总数</span>
              <strong>{dashboard.summary.totalAssets}</strong>
            </div>
            <div>
              <span>维修记录</span>
              <strong>{dashboard.summary.maintenanceRecords}</strong>
            </div>
          </div>
        </div>
        <div className="dash-cards">
          {metric("contract", "即将到期", dashboard.summary.leaseSoon, "green")}
          {metric("water_drop", "待加水", dashboard.summary.waterDue, "blue")}
          {metric(
            "engineering",
            "待保养",
            dashboard.summary.maintenanceSoon,
            "teal",
          )}
        </div>
        <div className="dash-grid">
          <div className="white-card">
            <div className="card-title">
              <h3>紧急提醒</h3>
              <button type="button" onClick={onRefresh}>
                刷新
              </button>
            </div>
            <div className="reminders">
              {dashboard.alerts.map((a) => (
                <div className="reminder-row" key={`${a.type}-${a.assetId}`}>
                  <div className={`dot ${a.level}`}></div>
                  <div>
                    <strong>{a.title}</strong>
                    <span>{a.subtitle}</span>
                  </div>
                  <small>{a.badge}</small>
                </div>
              ))}
              {!dashboard.alerts.length && (
                <div className="empty-state">暂无提醒。</div>
              )}
            </div>
          </div>
          <div className="dark-card">
            <h3>今日状态</h3>
            <div>
              <span>到期提醒</span>
              <strong>{dashboard.summary.leaseSoon}</strong>
            </div>
            <div>
              <span>加水提醒</span>
              <strong>{dashboard.summary.waterDue}</strong>
            </div>
            <div>
              <span>保养提醒</span>
              <strong>{dashboard.summary.maintenanceSoon}</strong>
            </div>
            <div>
              <span>维修中</span>
              <strong>{dashboard.summary.inRepair}</strong>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Assets({
  session,
  profile,
  assets,
  rows,
  dashboard,
  filters,
  setFilters,
  assetSort,
  setAssetSort,
  warehouses,
  models,
  suppliers,
  brands,
  busy,
  fileRef,
  onImport,
  onExport,
  onCreate,
  onEdit,
  onWater,
  onMaintain,
  onTransfer,
  onRepair,
  onDelete,
  onSignOut,
}) {
  return (
    <>
      <header className="records-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="资产管理员"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="records-heading">
          <div>
            <p>SWISS TIER 1 MANAGEMENT</p>
            <h1>资产台账</h1>
            <span>精确管理叉车及其他特种设备。</span>
          </div>
          <div className="records-head-actions">
            <input
              ref={fileRef}
              className="hidden-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onImport}
            />
            <button className="ui-dark" onClick={onCreate} type="button">
              新增资产
            </button>
            <button className="ui-ghost" onClick={onExport} type="button">
              导出
            </button>
            <button
              className="ui-ghost"
              onClick={() => fileRef.current?.click()}
              type="button"
              disabled={busy === "import"}
            >
              {busy === "import" ? "导入中..." : "导入"}
            </button>
          </div>
        </div>
        <div className="dash-cards">
          {metric("inventory_2", "资产总数", assets.length, "teal")}
          {metric("contract", "到期提醒", dashboard.summary.leaseSoon, "green")}
          {metric("water_drop", "加水提醒", dashboard.summary.waterDue, "blue")}
          {metric(
            "build",
            "保养提醒",
            dashboard.summary.maintenanceSoon,
            "orange",
          )}
        </div>
        <div className="filters-bar">
          <div className="filter-primary">
            <div className="filter-search">
              <span className="material-symbols-outlined">search</span>
              <input
                value={filters.search}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, search: e.target.value }))
                }
                placeholder="搜索序列号、品牌、车型"
              />
            </div>
            <span className="filter-stat">
              当前显示 {rows.length} / {assets.length}
            </span>
          </div>
          <div className="filter-grid">
            <label className="filter-field">
              <span>仓库</span>
              <select
                value={filters.warehouse}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, warehouse: e.target.value }))
                }
              >
                <option value="">全部仓库</option>
                {warehouses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>车型</span>
              <select
                value={filters.model}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, model: e.target.value }))
                }
              >
                <option value="">全部车型</option>
                {models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>供应商</span>
              <select
                value={filters.supplier}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, supplier: e.target.value }))
                }
              >
                <option value="">全部供应商</option>
                {suppliers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>叉车品牌</span>
              <select
                value={filters.brand}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, brand: e.target.value }))
                }
              >
                <option value="">全部品牌</option>
                {brands.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>状态</span>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, status: e.target.value }))
                }
              >
                <option value="">全部状态</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-shell asset-list-shell">
          <table className="grid-table asset-grid-table">
            <thead>
              <tr>
                <th>
                  <button
                    className={`asset-head-button${assetSort === "default" ? " active" : ""}`}
                    onClick={() => setAssetSort("default")}
                    type="button"
                  >
                    仓库
                  </button>
                </th>
                <th>序列号</th>
                <th>车型</th>
                <th>供应商</th>
                <th>叉车品牌</th>
                <th>
                  <button
                    className={`asset-head-button${assetSort === "lease" ? " active" : ""}`}
                    onClick={() => setAssetSort("lease")}
                    type="button"
                  >
                    到期提醒
                  </button>
                </th>
                <th>
                  <button
                    className={`asset-head-button${assetSort === "water" ? " active" : ""}`}
                    onClick={() => setAssetSort("water")}
                    type="button"
                  >
                    加水提醒
                  </button>
                </th>
                <th>
                  <button
                    className={`asset-head-button${assetSort === "maintenance" ? " active" : ""}`}
                    onClick={() => setAssetSort("maintenance")}
                    type="button"
                  >
                    保养提醒
                  </button>
                </th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.warehouse}</td>
                  <td className="strong-cell">{a.serial_number}</td>
                  <td>{a.model}</td>
                  <td>{a.supplier || "无供应商"}</td>
                  <td>{a.brand}</td>
                  <td>{chip("到期", a.reminders.lease, a.lease_end_date)}</td>
                  <td>
                    {chip(
                      "加水",
                      a.reminders.water,
                      a.reminders.water.nextDate,
                      () => onWater(a),
                      busy === `water-${a.id}`,
                    )}
                  </td>
                  <td>
                    {chip(
                      "保养",
                      a.reminders.maintenance,
                      a.reminders.maintenance.nextDate,
                      () => onMaintain(a),
                      busy === `maintain-${a.id}`,
                    )}
                  </td>
                  <td>
                    <span className={`status-tag ${statusClassName(a.status)}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    <div className="asset-actions">
                      <button onClick={() => onEdit(a)} type="button">
                        编辑
                      </button>
                      <button onClick={() => onTransfer(a)} type="button">
                        调拨
                      </button>
                      <button onClick={() => onRepair(a)} type="button">
                        报修
                      </button>
                      <button
                        className="danger"
                        onClick={() => onDelete(a.id)}
                        type="button"
                        disabled={busy === a.id}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="10">
                    <div className="empty-state">没有找到资产。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DeviceManagement({
  session,
  profile,
  rows,
  total,
  search,
  setSearch,
  onCreate,
  onEdit,
  onDelete,
  onSignOut,
}) {
  return (
    <>
      <header className="records-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="设备管理员"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="records-heading">
          <div>
            <p>SMART DEVICE OPERATIONS</p>
            <h1>设备管理</h1>
            <span>管理电脑、PDA 等小型设备，确保资产去向清晰可追踪。</span>
          </div>
          <div className="records-head-actions">
            <button className="ui-primary" onClick={onCreate} type="button">
              新增设备
            </button>
          </div>
        </div>
        <div className="filters-bar">
          <div className="filter-search">
            <span className="material-symbols-outlined">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="资产编码、SN、品牌、部门..."
            />
          </div>
          <span>
            当前显示 {rows.length} / {total}
          </span>
        </div>
        <div className="table-shell">
          <table className="grid-table device-table">
            <thead>
              <tr>
                <th>仓库</th>
                <th>资产编码</th>
                <th>资产类型</th>
                <th>SN</th>
                <th>资产品牌</th>
                <th>资产详单</th>
                <th>数量</th>
                <th>详细地点</th>
                <th>责任人部门</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((device) => (
                <tr key={device.id}>
                  <td>{device.warehouse}</td>
                  <td>
                    <strong>{device.assetCode}</strong>
                  </td>
                  <td>{device.assetType}</td>
                  <td>{device.sn}</td>
                  <td>{device.brand}</td>
                  <td>{device.detail}</td>
                  <td>{device.quantity}</td>
                  <td>{device.location}</td>
                  <td>{device.department}</td>
                  <td>
                    <div className="action-row">
                      <button type="button" onClick={() => onEdit(device)}>
                        编辑
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => onDelete(device.id)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="10">
                    <div className="empty-state">暂无设备记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Transfers({
  session,
  profile,
  assets,
  rows,
  warehouses,
  onCreate,
  onSignOut,
}) {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [status, setStatus] = useState("");

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const warehouseMatch =
        !warehouse ||
        row.from_warehouse === warehouse ||
        row.to_warehouse === warehouse;
      const statusMatch = !status || row.status === status;
      if (!warehouseMatch || !statusMatch) return false;
      if (!query) return true;
      return [
        row.transfer_no,
        row.asset_serial_number,
        row.asset_model,
        row.asset_brand,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [rows, search, warehouse, status]);

  const monthCount = filteredRows.filter((row) => {
    const date = new Date(row.created_at);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }).length;

  return (
    <>
      <header className="records-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="调拨管理员"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="records-heading">
          <div>
            <p>WAREHOUSE TRANSFER FLOW</p>
            <h1>资产调拨</h1>
            <span>管理仓库内资产调拨，完成后自动更新资产所在仓库并沉淀调拨记录。</span>
          </div>
          <div className="records-head-actions">
            <button className="ui-primary" onClick={onCreate} type="button">
              发起调拨
            </button>
          </div>
        </div>
        <div className="dash-cards">
          {metric("swap_horiz", "调拨总数", rows.length, "teal")}
          {metric("calendar_month", "本月调拨", monthCount, "orange")}
          {metric("inventory_2", "可调拨资产", assets.length, "blue")}
        </div>
        <div className="filters-bar">
          <div className="filter-primary">
            <div className="filter-search">
              <span className="material-symbols-outlined">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索调拨单号、序列号、设备名"
              />
            </div>
            <span className="filter-stat">
              当前显示 {filteredRows.length} / {rows.length}
            </span>
          </div>
          <div className="filter-grid transfer-filter-grid">
            <label className="filter-field">
              <span>仓库</span>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">全部仓库</option>
                {warehouses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>状态</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">全部状态</option>
                <option value="已完成">已完成</option>
                <option value="待处理">待处理</option>
                <option value="已取消">已取消</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-shell">
          <table className="grid-table">
            <thead>
              <tr>
                <th>调拨单号</th>
                <th>序列号</th>
                <th>设备名</th>
                <th>叉车品牌</th>
                <th>调出仓库</th>
                <th>调入仓库</th>
                <th>申请人</th>
                <th>调拨原因</th>
                <th>调拨时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="strong-cell">{row.transfer_no}</td>
                  <td>{row.asset_serial_number}</td>
                  <td>{row.asset_model}</td>
                  <td>{row.asset_brand}</td>
                  <td>{row.from_warehouse}</td>
                  <td>{row.to_warehouse}</td>
                  <td>{row.requested_by_name}</td>
                  <td>{row.reason}</td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>
                    <span className={`status-tag ${row.status === "已完成" ? "owned" : "unknown"}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan="10">
                    <div className="empty-state">暂无调拨记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Maintenance({
  session,
  profile,
  rows,
  assets,
  busy,
  onCreate,
  onDelete,
  onSignOut,
}) {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const warehouseOptions = useMemo(
    () => uniqueOptions(assets.map((asset) => asset.warehouse)),
    [assets],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const assetWarehouse = row.asset?.warehouse ?? "";
      const matchWarehouse = !warehouse || assetWarehouse === warehouse;
      if (!matchWarehouse) return false;
      if (!query) return true;
      const serial = (row.asset?.serial_number ?? row.asset_id ?? "").toLowerCase();
      const model = (row.asset?.model ?? "").toLowerCase();
      return serial.includes(query) || model.includes(query);
    });
  }, [rows, search, warehouse]);

  return (
    <>
      <header className="records-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="维修管理员"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="records-heading">
          <div>
            <h1>维修记录</h1>
            <span>查看并管理设备维修历史。</span>
          </div>
        </div>
        <div className="dash-cards">
          {metric("list_alt", "记录总数", filteredRows.length, "teal")}
          {metric(
            "payments",
            "年度费用",
            Intl.NumberFormat("zh-CN", {
              style: "currency",
              currency: "CNY",
              maximumFractionDigits: 2,
            }).format(sumMaintenanceCost(filteredRows)),
            "orange",
          )}
          {metric(
            "warning",
            "维修中设备",
            assets.filter((a) => a.status === "维修中").length,
            "green",
          )}
        </div>
        <div className="filters-bar">
          <div className="filter-primary">
            <div className="filter-search">
              <span className="material-symbols-outlined">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索序列号、设备名"
              />
            </div>
            <div className="filter-stat">当前显示 {filteredRows.length} / {rows.length}</div>
          </div>
          <div className="filter-grid maintenance-filter-grid">
            <label className="filter-field">
              <span>仓库</span>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">全部仓库</option>
                {warehouseOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-shell">
          <table className="grid-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>序列号</th>
                <th>设备名</th>
                <th>问题描述</th>
                <th>仓库</th>
                <th>供应商</th>
                <th>费用</th>
                <th>照片</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.maintenance_date)}</td>
                  <td>
                    <strong>{r.asset?.serial_number || r.asset_id}</strong>
                  </td>
                  <td>
                    {r.asset?.model || "未关联资产"}
                  </td>
                  <td>
                    <strong>{r.issue_description}</strong>
                  </td>
                  <td>{r.asset?.warehouse || "-"}</td>
                  <td>{r.provider || "-"}</td>
                  <td>
                    {r.cost
                      ? `$${Number(r.cost).toLocaleString("en-US")}`
                      : "-"}
                  </td>
                  <td>
                    {r.photo_url ? (
                      <a
                        className="table-link"
                        href={r.photo_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看照片
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                      className="ui-ghost danger-line maintenance-delete"
                      onClick={() => onDelete(r.id)}
                      type="button"
                      disabled={busy === `record-${r.id}`}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">暂无符合条件的维修记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function OperationLogs({ session, profile, rows, onSignOut }) {
  return (
    <>
      <header className="records-top no-search">
        <ProfileMenu
          session={session}
          profile={profile}
          role="系统日志"
          onSignOut={onSignOut}
        />
      </header>
      <section className="page-body">
        <div className="records-heading">
          <div>
            <h1>操作日志</h1>
            <span>记录资产与维修相关操作，显示首次填写的用户全名。</span>
          </div>
        </div>
        <div className="table-shell">
          <table className="grid-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>用户</th>
                <th>操作</th>
                <th>类型</th>
                <th>对象</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>
                    <strong>{row.actor_name}</strong>
                    <span>{row.actor_email || "-"}</span>
                  </td>
                  <td>{row.action}</td>
                  <td>{row.target_type}</td>
                  <td>{row.target_label || "-"}</td>
                  <td>{row.details || "-"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">暂无操作日志。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ProfileSetupModal({ value, busy, onChange, onSubmit }) {
  return (
    <div className="modal-backdrop profile-setup-backdrop">
      <div className="modal-card profile-setup-card">
        <div className="modal-head profile-setup-head">
          <h3>完善用户资料</h3>
        </div>
        <p className="profile-setup-copy">
          首次登录请填写用户全名
        </p>
        <form className="form-grid" onSubmit={onSubmit}>
          <label className="full-width">
            <span>用户全名</span>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={60}
              required
              autoFocus
              placeholder="请输入你的全名"
            />
          </label>
          <div className="modal-actions full-width">
            <button className="ui-primary" type="submit" disabled={busy}>
              {busy ? "保存中..." : "进入系统"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileMenu({ session, profile, role, onSignOut }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const name = profile?.full_name || session.user.email?.split("@")[0] || "用户";

  useEffect(() => {
    function handlePointerDown(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        className="avatar-button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="user-avatar">
          <span className="material-symbols-outlined">person</span>
        </div>
      </button>
      {open ? (
        <div className="profile-popover" role="menu">
          <div className="profile-meta">
            <strong>{name}</strong>
            <span>{role}</span>
            <small>{session.user.email}</small>
          </div>
          <button className="profile-action" type="button" onClick={onSignOut}>
            <span className="material-symbols-outlined">logout</span>
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}

function deviceFields(state, setState) {
  const bind = (key) => ({
    value: state[key] ?? "",
    onChange: (e) => setState((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <>
      {field("仓库", <input {...bind("warehouse")} required />)}
      {field("资产编码", <input {...bind("assetCode")} required />)}
      {field("资产类型", <input {...bind("assetType")} required />)}
      {field("SN", <input {...bind("sn")} required />)}
      {field("资产品牌", <input {...bind("brand")} required />)}
      {field("资产详单", <input {...bind("detail")} required />)}
      {field(
        "数量",
        <input type="number" min="1" step="1" {...bind("quantity")} required />,
      )}
      {field("详细地点", <input {...bind("location")} required />)}
      {field("责任人部门", <input {...bind("department")} required />)}
    </>
  );
}

function assetFields(state, setState) {
  const bind = (k) => ({
    value: state[k] ?? "",
    onChange: (e) => setState((s) => ({ ...s, [k]: e.target.value })),
  });
  return (
    <>
      {field("仓库", <input {...bind("warehouse")} required />)}
      {field("车型", <input {...bind("model")} required />)}
      {field("序列号", <input {...bind("serial_number")} required />)}
      {field("叉车品牌", <input {...bind("brand")} required />)}
      {field("供应商", <input {...bind("supplier")} />)}
      {field(
        "状态",
        <select {...bind("status")}>
          {assetStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>,
      )}
      {field(
        "月租",
        <input type="number" step="0.01" {...bind("monthly_rent")} />,
      )}
      {field("是否采购下单", <input {...bind("is_purchase_ordered")} />)}
      {field("起租日期", <input type="date" {...bind("lease_start_date")} />)}
      {field("到期日期", <input type="date" {...bind("lease_end_date")} />)}
      {field("后期处理方式", <input {...bind("lease_resolution")} />)}
      {field("运营需求", <input {...bind("operation_requirement")} />)}
      {field("目前状态", <input {...bind("current_status")} />)}
      <label className="full-width">
        <span>问题反馈</span>
        <textarea rows="3" {...bind("issue_feedback")} />
      </label>
      {field("上次加水", <input type="date" {...bind("last_watered_at")} />)}
      {field(
        "加水周期",
        <input type="number" {...bind("water_interval_days")} />,
      )}
      {field("上次保养", <input type="date" {...bind("last_maintained_at")} />)}
      {field(
        "保养周期",
        <input type="number" {...bind("maintenance_interval_days")} />,
      )}
      <label className="full-width">
        <span>备注</span>
        <textarea rows="3" {...bind("notes")} />
      </label>
    </>
  );
}

function TransferFields({ state, setState, assets, warehouses }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const candidateAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets
      .filter((asset) =>
        state.from_warehouse ? asset.warehouse === state.from_warehouse : true,
      )
      .filter((asset) => (status ? asset.status === status : true))
      .filter((asset) => {
        if (!query) return true;
        return [asset.serial_number, asset.model, asset.brand, asset.supplier]
          .some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          );
      })
      .sort(compareDefaultOrder);
  }, [assets, search, state.from_warehouse, status]);

  const selectedAssets = useMemo(
    () =>
      assets.filter((asset) => state.asset_ids.includes(asset.id)),
    [assets, state.asset_ids],
  );

  const targetWarehouses = warehouses.filter(
    (item) => item && item !== state.from_warehouse,
  );

  function toggleAsset(assetId) {
    setState((prev) => ({
      ...prev,
      asset_ids: prev.asset_ids.includes(assetId)
        ? prev.asset_ids.filter((id) => id !== assetId)
        : [...prev.asset_ids, assetId],
    }));
  }

  return (
    <div className="transfer-builder full-width">
      <div className="transfer-pane">
        <div className="transfer-pane-head">
          <div>
            <h4>选择设备</h4>
            <span>先锁定调出仓库，再批量选择需要调拨的设备。</span>
          </div>
          <span className="transfer-count-pill">已选 {selectedAssets.length} 台</span>
        </div>
        <div className="transfer-toolbar">
          <label className="filter-field">
            <span>调出仓库</span>
            <select
              value={state.from_warehouse}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  from_warehouse: e.target.value,
                  asset_ids: [],
                  to_warehouse:
                    e.target.value === prev.to_warehouse ? "" : prev.to_warehouse,
                }))
              }
              required
            >
              <option value="">请选择仓库</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field transfer-status-filter">
            <span>状态</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!state.from_warehouse}
            >
              <option value="">全部状态</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-search transfer-search">
            <span className="material-symbols-outlined">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索序列号、设备名、品牌、供应商"
              disabled={!state.from_warehouse}
            />
          </div>
        </div>
        <div className="transfer-device-list">
          {!state.from_warehouse ? (
            <div className="empty-state transfer-empty">
              先选择调出仓库，再从左侧设备池里勾选需要调拨的设备。
            </div>
          ) : candidateAssets.length ? (
            candidateAssets.map((asset) => {
              const checked = state.asset_ids.includes(asset.id);
              return (
                <button
                  key={asset.id}
                  className={`transfer-device-card${checked ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleAsset(asset.id)}
                >
                  <span className={`transfer-device-check${checked ? " is-selected" : ""}`}>
                    {checked ? "✓" : ""}
                  </span>
                  <div className="transfer-device-copy">
                    <div className="transfer-device-mainline">
                      <strong>{asset.model}</strong>
                      <span className={`status-tag ${statusClassName(asset.status)}`}>
                        {asset.status}
                      </span>
                    </div>
                    <span>{asset.serial_number}</span>
                    <small>
                      {asset.brand} · {asset.supplier || "无供应商"} · {asset.warehouse}
                    </small>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="empty-state transfer-empty">
              这个仓库下没有符合筛选条件的设备。
            </div>
          )}
        </div>
      </div>

      <div className="transfer-pane transfer-summary-pane">
        <div className="transfer-pane-head">
          <div>
            <h4>调拨详情</h4>
            <span>确认目标仓库、调拨原因和补充说明。</span>
          </div>
        </div>
        <div className="transfer-selected-list">
          {selectedAssets.length ? (
            selectedAssets.map((asset) => (
              <div className="transfer-selected-card" key={asset.id}>
                <div>
                  <strong>{asset.model}</strong>
                  <span>{asset.serial_number}</span>
                </div>
                <button type="button" onClick={() => toggleAsset(asset.id)}>
                  移除
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state transfer-empty">
              还没有选择需要调拨的设备。
            </div>
          )}
        </div>
        <label className="full-width">
          <span>调入仓库</span>
          <select
            value={state.to_warehouse}
            onChange={(e) =>
              setState((prev) => ({ ...prev, to_warehouse: e.target.value }))
            }
            required
            disabled={!state.from_warehouse}
          >
            <option value="">请选择目标仓库</option>
            {targetWarehouses.map((warehouse) => (
              <option key={warehouse} value={warehouse}>
                {warehouse}
              </option>
            ))}
          </select>
        </label>
        <label className="full-width">
          <span>调拨原因</span>
          <input
            value={state.reason}
            onChange={(e) =>
              setState((prev) => ({ ...prev, reason: e.target.value }))
            }
            required
            placeholder="例如：波次高峰支援、车型调整、临时借调"
          />
        </label>
        <label className="full-width">
          <span>备注说明</span>
          <textarea
            rows="5"
            value={state.note}
            onChange={(e) =>
              setState((prev) => ({ ...prev, note: e.target.value }))
            }
            placeholder="补充调拨背景、接收人、预计使用时间等"
          />
        </label>
      </div>
    </div>
  );
}
function field(label, control) {
  return (
    <label>
      <span>{label}</span>
      {control}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
  closeOnBackdrop = true,
  className = "",
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`modal-card${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="ui-ghost icon" onClick={onClose} type="button">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function metric(icon, label, value, tone) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function chip(label, reminder, date, onClick, disabled = false) {
  const detail = reminder.label || "未设置";
  const className = `cycle-chip${onClick ? " is-action" : ""}`;
  if (onClick) {
    return (
      <button
        className={className}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <span className="cycle-chip-label">{label}</span>
        <span className={`badge ${reminder.level}`}>{detail}</span>
      </button>
    );
  }
  return (
    <div className={className}>
      <span className="cycle-chip-label">{label}</span>
      <span className={`badge ${reminder.level}`}>{detail}</span>
    </div>
  );
}
function metaTag(label, value) {
  return (
    <span className="meta-tag" key={`${label}-${value}`}>
      <b>{label}</b>
      {value}
    </span>
  );
}
function filterAsset(a, f) {
  const q = f.search.trim().toLowerCase();
  const warehouseQuery = f.warehouse.trim();
  const modelQuery = f.model.trim();
  const supplierQuery = f.supplier.trim();
  const brandQuery = f.brand.trim();
  const statusQuery = f.status.trim();
  const s =
    !q ||
    [a.serial_number, a.brand, a.model, a.warehouse, a.supplier].some((v) =>
      String(v || "")
        .toLowerCase()
        .includes(q),
    );
  const w = !warehouseQuery || String(a.warehouse || "") === warehouseQuery;
  const m = !modelQuery || String(a.model || "") === modelQuery;
  const sp = !supplierQuery || String(a.supplier || "") === supplierQuery;
  const b = !brandQuery || String(a.brand || "") === brandQuery;
  const st = !statusQuery || String(a.status || "") === statusQuery;
  return s && w && m && sp && b && st;
}
function compareAssets(a, b, sortMode) {
  if (sortMode === "lease") {
    return compareReminderDates(a.lease_end_date, b.lease_end_date) || compareDefaultOrder(a, b);
  }
  if (sortMode === "water") {
    return (
      compareReminderDates(a.reminders?.water?.nextDate, b.reminders?.water?.nextDate) ||
      compareDefaultOrder(a, b)
    );
  }
  if (sortMode === "maintenance") {
    return (
      compareReminderDates(
        a.reminders?.maintenance?.nextDate,
        b.reminders?.maintenance?.nextDate,
      ) || compareDefaultOrder(a, b)
    );
  }
  return compareDefaultOrder(a, b);
}
function compareDefaultOrder(a, b) {
  return (
    compareText(a.warehouse, b.warehouse) ||
    compareText(a.model, b.model) ||
    compareText(a.supplier, b.supplier) ||
    compareText(a.serial_number, b.serial_number)
  );
}
function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "zh-CN");
}
function compareReminderDates(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}
function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))].sort(
    (a, b) => a.localeCompare(b, "zh-CN"),
  );
}
function resolveAssetReference(value, assets) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return "";

  const exact = assets.find(
    (asset) =>
      String(asset.id || "").toLowerCase() === query ||
      String(asset.serial_number || "").toLowerCase() === query,
  );
  if (exact) return exact.id;

  const partialMatches = assets.filter(
    (asset) =>
      String(asset.model || "").toLowerCase().includes(query) ||
      String(asset.serial_number || "").toLowerCase().includes(query),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0].id || "";
  }
  // 模糊匹配结果为 0 或多条时，不进行静默关联，交由调用方/界面处理
  return "";
}
function summarize(assets, records) {
  const alerts = assets
    .flatMap((a) =>
      ["lease", "water", "maintenance"]
        .filter((k) => a.reminders?.[k]?.show)
        .map((k) => ({
          assetId: a.id,
          type: k,
          level: a.reminders[k].level,
          badge: k === "lease" ? "到期" : k === "water" ? "加水" : "保养",
          title: `${a.serial_number} · ${a.model}`,
          subtitle: `${a.warehouse} · ${formatDate(k === "lease" ? a.lease_end_date : a.reminders[k].nextDate)}`,
          daysUntil: a.reminders[k].daysUntil,
        })),
    )
    .sort(
      (a, b) =>
        rank(a.level) - rank(b.level) ||
        (a.daysUntil ?? 999) - (b.daysUntil ?? 999),
    );
  return {
    alerts,
    summary: {
      totalAssets: assets.length,
      maintenanceRecords: records.length,
      leaseSoon: assets.filter((a) => a.reminders?.lease?.show).length,
      waterDue: assets.filter((a) => a.reminders?.water?.show).length,
      maintenanceSoon: assets.filter((a) => a.reminders?.maintenance?.show)
        .length,
      inRepair: assets.filter((a) => a.status === "维修中").length,
    },
  };
}
function statusClassName(status) {
  return {
    租赁: "lease",
    月租: "rent",
    自有: "owned",
    维修中: "repair",
    闲置: "idle",
  }[status] ?? "unknown";
}
function rank(level) {
  return { high: 0, medium: 1, low: 2, none: 3 }[level] ?? 4;
}
function formatDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function formatDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
function formatPurchaseOrdered(value) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return "是";
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return "否";
  }
  return "";
}
function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "未设";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `¥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
function sumMaintenanceCost(rows) {
  return rows.reduce((s, r) => s + Number(r.cost || 0), 0);
}
