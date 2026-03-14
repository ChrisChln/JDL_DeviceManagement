import { useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessToken } from "./api.js";
import { authEnabled, supabaseAuth } from "./auth.js";

const assetSeed = {
  warehouse: "", model: "", serial_number: "", brand: "", supplier: "", status: "lease",
  monthly_rent: "", lease_start_date: "", lease_end_date: "", lease_resolution: "",
  last_watered_at: "", water_interval_days: 14, last_maintained_at: "", maintenance_interval_days: 90, notes: "",
};
const recordSeed = { asset_id: "", maintenance_date: "", issue_description: "", cost: "", provider: "", photo_url: "" };
const nav = [{ id: "dashboard", label: "首页概览", icon: "dashboard" }, { id: "assets", label: "资产台账", icon: "domain" }, { id: "maintenance", label: "维修记录", icon: "build" }];
const statuses = ["lease", "rent", "owned", "repair", "idle"];

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [view, setView] = useState("dashboard");
  const [assets, setAssets] = useState([]);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ search: "", warehouse: "all", status: "all", due: "all" });
  const [assetForm, setAssetForm] = useState(assetSeed);
  const [recordForm, setRecordForm] = useState(recordSeed);
  const [editingId, setEditingId] = useState("");
  const [assetOpen, setAssetOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
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

  useEffect(() => { if (session) refresh(); }, [session]);

  const dashboard = useMemo(() => summarize(assets, records), [assets, records]);
  const warehouses = useMemo(() => ["all", ...new Set(assets.map((a) => a.warehouse).filter(Boolean))], [assets]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const recordRows = useMemo(() => records.map((r) => ({ ...r, asset: assetMap.get(r.asset_id) })), [records, assetMap]);
  const filtered = useMemo(() => assets.filter((a) => filterAsset(a, filters)), [assets, filters]);

  const note = (m) => {
    setToast(m);
    clearTimeout(note.t);
    note.t = setTimeout(() => setToast(""), 2400);
  };

  async function refresh() {
    try {
      const [a, r] = await Promise.all([api.listAssets(), api.listMaintenanceRecords()]);
      setAssets(a);
      setRecords(r);
    } catch (e) { note(e.message); }
  }

  async function signIn(e) {
    e.preventDefault();
    if (!authEnabled) return note("缺少前端鉴权配置。");
    try {
      setAuthLoading(true);
      const { error } = await supabaseAuth.auth.signInWithPassword(login);
      if (error) throw error;
    } catch (e2) { note(e2.message); } finally { setAuthLoading(false); }
  }

  async function signOut() {
    await supabaseAuth.auth.signOut();
    setAssets([]); setRecords([]); note("已退出登录");
  }

  function openNewAsset() { setEditingId(""); setAssetForm(assetSeed); setAssetOpen(true); }
  function openEditAsset(a) {
    setEditingId(a.id);
    setAssetForm({ ...assetSeed, ...a });
    setAssetOpen(true);
  }
  async function saveAsset(e) {
    e.preventDefault();
    try {
      setBusy("asset");
      if (editingId) await api.updateAsset(editingId, assetForm); else await api.createAsset(assetForm);
      setAssetOpen(false); note("资产已保存"); await refresh();
    } catch (e2) { note(e2.message); } finally { setBusy(""); }
  }
  async function removeAsset(id) {
    if (!window.confirm("确认删除这条资产吗？")) return;
    try { setBusy(id); await api.deleteAsset(id); note("资产已删除"); await refresh(); } catch (e) { note(e.message); } finally { setBusy(""); }
  }
  async function mark(id, mode) {
    try {
      setBusy(`${mode}-${id}`);
      if (mode === "water") await api.markWatered(id); else await api.markMaintained(id);
      note(mode === "water" ? "加水日期已更新" : "保养日期已更新");
      await refresh();
    } catch (e) { note(e.message); } finally { setBusy(""); }
  }
  function openNewRecord(assetId = "") { setRecordForm({ ...recordSeed, asset_id: assetId }); setRecordOpen(true); }
  async function saveRecord(e) {
    e.preventDefault();
    try { setBusy("record"); await api.createMaintenanceRecord(recordForm); setRecordOpen(false); note("维修记录已保存"); await refresh(); } catch (e2) { note(e2.message); } finally { setBusy(""); }
  }
  async function removeRecord(id) {
    if (!window.confirm("确认删除这条维修记录吗？")) return;
    try { setBusy(`record-${id}`); await api.deleteMaintenanceRecord(id); note("维修记录已删除"); await refresh(); } catch (e) { note(e.message); } finally { setBusy(""); }
  }
  async function onImport(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try { setBusy("import"); const res = await api.importAssets(file); note(`已导入 ${res.count} 条资产`); await refresh(); } catch (er) { note(er.message); } finally { setBusy(""); e.target.value = ""; }
  }
  function onExport() {
    const rows = filtered.map((a) => [a.warehouse, a.model, a.serial_number, a.brand, a.status, a.lease_end_date || "", a.last_watered_at || "", a.last_maintained_at || ""]);
    const csv = [["仓库","车型","序列号","品牌","状态","到期日期","上次加水","上次保养"], ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `assets-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (booting) return <div className="auth-shell"><div className="auth-card"><div className="empty-state">正在初始化登录状态...</div></div></div>;
  if (!session) return (
    <div className="auth-shell">
      <form className="auth-card auth-card-premium" onSubmit={signIn}>
        <div className="auth-mark"><span className="material-symbols-outlined">spa</span></div>
        <p className="eyebrow">Swiss Asset Console</p><h1 className="auth-title">登录系统</h1>
        <p className="auth-note">使用你的 Supabase 账号进入固定资产管理系统。</p>
        <label className="auth-field"><span>邮箱</span><input value={login.email} onChange={(e) => setLogin((s) => ({ ...s, email: e.target.value }))} type="email" required /></label>
        <label className="auth-field"><span>密码</span><input value={login.password} onChange={(e) => setLogin((s) => ({ ...s, password: e.target.value }))} type="password" required /></label>
        <button className="primary-button" type="submit" disabled={authLoading}><span className="material-symbols-outlined">login</span>{authLoading ? "登录中..." : "进入系统"}</button>
        {toast ? <div className="toast is-visible">{toast}</div> : null}
      </form>
    </div>
  );

  return (
    <div className="ui-shell">
      <aside className="ui-sidebar">
        <div className="ui-brand"><div className="ui-brand-icon"><span className="material-symbols-outlined">spa</span></div><div><h1>SWISS SPA MGMT</h1><p>PREMIUM ASSET LEDGER</p></div></div>
        <p className="ui-label">主控制台</p>
        {nav.map((n) => <button key={n.id} className={`ui-nav ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)} type="button"><span className="material-symbols-outlined">{n.icon}</span><span>{n.label}</span></button>)}
        <button className="ui-primary side" type="button" onClick={openNewAsset}><span className="material-symbols-outlined">add</span>新增资产</button>
      </aside>
      <div className="ui-main">
        {view === "dashboard" && <Dashboard session={session} dashboard={dashboard} onRefresh={refresh} onSignOut={signOut} />}
        {view === "assets" && <Assets session={session} assets={assets} rows={filtered} dashboard={dashboard} filters={filters} setFilters={setFilters} warehouses={warehouses} busy={busy} fileRef={fileRef} onImport={onImport} onExport={onExport} onCreate={openNewAsset} onEdit={openEditAsset} onWater={(a) => mark(a.id, "water")} onMaintain={(a) => mark(a.id, "maintain")} onRepair={(a) => openNewRecord(a.id)} onDelete={removeAsset} onSignOut={signOut} />}
        {view === "maintenance" && <Maintenance session={session} rows={recordRows} assets={assets} busy={busy} onCreate={() => openNewRecord()} onDelete={removeRecord} onSignOut={signOut} />}
      </div>
      {assetOpen && <Modal title={editingId ? "编辑资产" : "新增资产"} onClose={() => setAssetOpen(false)}><form className="form-grid" onSubmit={saveAsset}>{assetFields(assetForm, setAssetForm)}<div className="modal-actions full-width"><button className="ui-ghost" type="button" onClick={() => setAssetOpen(false)}>取消</button><button className="ui-primary" type="submit" disabled={busy === "asset"}>{busy === "asset" ? "保存中..." : "保存"}</button></div></form></Modal>}
      {recordOpen && <Modal title="新增维修记录" onClose={() => setRecordOpen(false)}><form className="form-grid" onSubmit={saveRecord}><label className="full-width"><span>资产</span><select value={recordForm.asset_id} onChange={(e) => setRecordForm((s) => ({ ...s, asset_id: e.target.value }))} required><option value="">请选择资产</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.serial_number} · {a.model}</option>)}</select></label><label><span>日期</span><input type="date" value={recordForm.maintenance_date} onChange={(e) => setRecordForm((s) => ({ ...s, maintenance_date: e.target.value }))} required /></label><label><span>供应商</span><input value={recordForm.provider} onChange={(e) => setRecordForm((s) => ({ ...s, provider: e.target.value }))} /></label><label><span>费用</span><input type="number" step="0.01" value={recordForm.cost} onChange={(e) => setRecordForm((s) => ({ ...s, cost: e.target.value }))} /></label><label><span>照片地址</span><input value={recordForm.photo_url} onChange={(e) => setRecordForm((s) => ({ ...s, photo_url: e.target.value }))} /></label><label className="full-width"><span>问题描述</span><textarea rows="4" value={recordForm.issue_description} onChange={(e) => setRecordForm((s) => ({ ...s, issue_description: e.target.value }))} required /></label><div className="modal-actions full-width"><button className="ui-ghost" type="button" onClick={() => setRecordOpen(false)}>取消</button><button className="ui-primary" type="submit" disabled={busy === "record"}>{busy === "record" ? "保存中..." : "保存"}</button></div></form></Modal>}
      {toast ? <div className="toast is-visible">{toast}</div> : null}
    </div>
  );
}

function Dashboard({ session, dashboard, onRefresh, onSignOut }) {
  return <><header className="page-top no-search"><ProfileMenu session={session} role="系统管理员" onSignOut={onSignOut} /></header><section className="page-body"><div className="page-heading"><h2>首页总览</h2><p>实时查看固定资产提醒与运行状态。</p></div><div className="dash-hero"><div><small>核心提醒引擎</small><h3>{dashboard.alerts.length} 条待处理提醒</h3><p>租赁到期、加水、保养提醒会按紧急程度自动排序。</p></div><div className="dash-side"><div><span>资产总数</span><strong>{dashboard.summary.totalAssets}</strong></div><div><span>维修记录</span><strong>{dashboard.summary.maintenanceRecords}</strong></div></div></div><div className="dash-cards">{metric("contract","即将到期",dashboard.summary.leaseSoon,"green")}{metric("water_drop","待加水",dashboard.summary.waterDue,"blue")}{metric("engineering","待保养",dashboard.summary.maintenanceSoon,"teal")}</div><div className="dash-grid"><div className="white-card"><div className="card-title"><h3>紧急提醒</h3><button type="button" onClick={onRefresh}>刷新</button></div><div className="reminders">{dashboard.alerts.map((a) => <div className="reminder-row" key={`${a.type}-${a.assetId}`}><div className={`dot ${a.level}`}></div><div><strong>{a.title}</strong><span>{a.subtitle}</span></div><small>{a.badge}</small></div>)}{!dashboard.alerts.length && <div className="empty-state">暂无提醒。</div>}</div></div><div className="dark-card"><h3>今日状态</h3><div><span>到期提醒</span><strong>{dashboard.summary.leaseSoon}</strong></div><div><span>加水提醒</span><strong>{dashboard.summary.waterDue}</strong></div><div><span>保养提醒</span><strong>{dashboard.summary.maintenanceSoon}</strong></div><div><span>维修中</span><strong>{dashboard.summary.inRepair}</strong></div></div></div></section></>;
}

function Assets({ session, assets, rows, dashboard, filters, setFilters, warehouses, busy, fileRef, onImport, onExport, onCreate, onEdit, onWater, onMaintain, onRepair, onDelete, onSignOut }) {
  return <><header className="records-top no-search"><ProfileMenu session={session} role="资产管理员" onSignOut={onSignOut} /></header><section className="page-body"><div className="records-heading"><div><p>SWISS TIER 1 MANAGEMENT</p><h1>资产台账</h1><span>精确管理叉车及其他特种设备。</span></div><div className="records-head-actions"><input ref={fileRef} className="hidden-input" type="file" accept=".xlsx,.xls,.csv" onChange={onImport} /><button className="ui-dark" onClick={onCreate} type="button">新增资产</button><button className="ui-ghost" onClick={onExport} type="button">导出</button><button className="ui-ghost" onClick={() => fileRef.current?.click()} type="button" disabled={busy === "import"}>{busy === "import" ? "导入中..." : "导入"}</button></div></div><div className="dash-cards">{metric("inventory_2","资产总数",assets.length,"teal")}{metric("contract","到期提醒",dashboard.summary.leaseSoon,"green")}{metric("water_drop","加水提醒",dashboard.summary.waterDue,"blue")}{metric("build","保养提醒",dashboard.summary.maintenanceSoon,"orange")}</div><div className="filters-bar"><div className="filter-search"><span className="material-symbols-outlined">search</span><input value={filters.search} onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))} placeholder="序列号、品牌、设备..." /></div><select value={filters.warehouse} onChange={(e) => setFilters((s) => ({ ...s, warehouse: e.target.value }))}>{warehouses.map((w) => <option key={w} value={w}>{w === "all" ? "全部仓库" : w}</option>)}</select><select value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}><option value="all">全部状态</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select><select value={filters.due} onChange={(e) => setFilters((s) => ({ ...s, due: e.target.value }))}><option value="all">全部提醒</option><option value="lease90">到期提醒</option><option value="water">加水提醒</option><option value="maintenance">保养提醒</option><option value="overdue">仅逾期</option></select><span>当前显示 {rows.length} / {assets.length}</span></div><div className="table-shell"><table className="grid-table"><thead><tr><th>资产标识</th><th>规格信息</th><th>所在仓库</th><th>周期提醒</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((a) => <tr key={a.id}><td><strong>{a.serial_number}</strong><span>{a.brand}</span></td><td><strong>{a.model}</strong><span>{a.supplier || "无供应商"}</span></td><td>{a.warehouse}</td><td><div className="cycle-stack">{chip(a.reminders.lease, a.lease_end_date)}{chip(a.reminders.water, a.reminders.water.nextDate)}{chip(a.reminders.maintenance, a.reminders.maintenance.nextDate)}</div></td><td><span className={`status-tag ${a.status}`}>{a.status}</span></td><td><div className="action-row"><button onClick={() => onEdit(a)} type="button">编辑</button><button onClick={() => onWater(a)} type="button" disabled={busy === `water-${a.id}`}>已加水</button><button onClick={() => onMaintain(a)} type="button" disabled={busy === `maintain-${a.id}`}>已保养</button><button onClick={() => onRepair(a)} type="button">报修</button><button className="danger" onClick={() => onDelete(a.id)} type="button" disabled={busy === a.id}>删除</button></div></td></tr>)}{!rows.length && <tr><td colSpan="6"><div className="empty-state">没有找到资产。</div></td></tr>}</tbody></table></div></section></>;
}

function Maintenance({ session, rows, assets, busy, onCreate, onDelete, onSignOut }) {
  return <><header className="records-top no-search"><ProfileMenu session={session} role="维修管理员" onSignOut={onSignOut} /></header><section className="page-body"><div className="records-heading"><div><h1>维修记录</h1><span>查看并管理设备维修历史。</span></div><div className="records-head-actions"><button className="ui-ghost" type="button">导出 PDF</button><button className="ui-primary" onClick={onCreate} type="button">新增记录</button></div></div><div className="dash-cards">{metric("list_alt","记录总数",rows.length,"teal")}{metric("payments","年度费用",`¥ ${sumMaintenanceCost(rows).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`,"orange")}{metric("warning","维修中设备",assets.filter((a) => a.status === "repair").length,"green")}</div><div className="table-shell"><table className="grid-table"><thead><tr><th>日期</th><th>序列号</th><th>问题描述</th><th>供应商</th><th>费用</th><th>操作</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{formatDate(r.maintenance_date)}</td><td><strong>{r.asset?.serial_number || r.asset_id}</strong></td><td><strong>{r.issue_description}</strong><span>{r.asset?.model || "未关联资产"}</span></td><td>{r.provider || "-"}</td><td>{r.cost ? `¥ ${Number(r.cost).toLocaleString("zh-CN")}` : "-"}</td><td><button className="danger" onClick={() => onDelete(r.id)} type="button" disabled={busy === `record-${r.id}`}>删除</button></td></tr>)}{!rows.length && <tr><td colSpan="6"><div className="empty-state">暂无维修记录。</div></td></tr>}</tbody></table></div></section></>;
}

function ProfileMenu({ session, role, onSignOut }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const name = session.user.email?.split("@")[0] || "用户";

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

  return <div className="profile-menu" ref={menuRef}>
    <button className="avatar-button" type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
      <div className="user-avatar"><span className="material-symbols-outlined">person</span></div>
    </button>
    {open ? <div className="profile-popover" role="menu">
      <div className="profile-meta">
        <strong>{name}</strong>
        <span>{role}</span>
        <small>{session.user.email}</small>
      </div>
      <button className="profile-action" type="button" onClick={onSignOut}>
        <span className="material-symbols-outlined">logout</span>
        退出登录
      </button>
    </div> : null}
  </div>;
}

function assetFields(state, setState) {
  const bind = (k) => ({ value: state[k] ?? "", onChange: (e) => setState((s) => ({ ...s, [k]: e.target.value })) });
  return <>{field("仓库", <input {...bind("warehouse")} required />)}{field("车型", <input {...bind("model")} required />)}{field("序列号", <input {...bind("serial_number")} required />)}{field("品牌", <input {...bind("brand")} required />)}{field("供应商", <input {...bind("supplier")} />)}{field("状态", <select {...bind("status")}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>)}{field("月租", <input type="number" step="0.01" {...bind("monthly_rent")} />)}{field("起租日期", <input type="date" {...bind("lease_start_date")} />)}{field("到期日期", <input type="date" {...bind("lease_end_date")} />)}{field("到期处理方式", <input {...bind("lease_resolution")} />)}{field("上次加水", <input type="date" {...bind("last_watered_at")} />)}{field("加水周期", <input type="number" {...bind("water_interval_days")} />)}{field("上次保养", <input type="date" {...bind("last_maintained_at")} />)}{field("保养周期", <input type="number" {...bind("maintenance_interval_days")} />)}<label className="full-width"><span>备注</span><textarea rows="3" {...bind("notes")} /></label></>;
}
function field(label, control) { return <label><span>{label}</span>{control}</label>; }
function Modal({ title, children, onClose }) { return <div className="modal-backdrop" onClick={onClose}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="ui-ghost icon" onClick={onClose} type="button"><span className="material-symbols-outlined">close</span></button></div>{children}</div></div>; }
function metric(icon, label, value, tone) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><span className="material-symbols-outlined">{icon}</span></div><div><p>{label}</p><strong>{value}</strong></div></div>; }
function chip(reminder, date) { return <div className="cycle-chip"><span className={`badge ${reminder.level}`}>{reminder.label}</span><small>{date ? formatDate(date) : "-"}</small></div>; }
function filterAsset(a, f) { const q = f.search.trim().toLowerCase(); const s = !q || [a.serial_number, a.brand, a.model, a.warehouse].some((v) => String(v || "").toLowerCase().includes(q)); const w = f.warehouse === "all" || a.warehouse === f.warehouse; const st = f.status === "all" || a.status === f.status; const d = f.due === "all" || (f.due === "lease90" && a.reminders?.lease?.show) || (f.due === "water" && a.reminders?.water?.show) || (f.due === "maintenance" && a.reminders?.maintenance?.show) || (f.due === "overdue" && [a.reminders?.lease, a.reminders?.water, a.reminders?.maintenance].some((x) => (x?.daysUntil ?? 1) < 0)); return s && w && st && d; }
function summarize(assets, records) { const alerts = assets.flatMap((a) => ["lease", "water", "maintenance"].filter((k) => a.reminders?.[k]?.show).map((k) => ({ assetId: a.id, type: k, level: a.reminders[k].level, badge: k === "lease" ? "到期" : k === "water" ? "加水" : "保养", title: `${a.serial_number} · ${a.model}`, subtitle: `${a.warehouse} · ${formatDate(k === "lease" ? a.lease_end_date : a.reminders[k].nextDate)}`, daysUntil: a.reminders[k].daysUntil }))).sort((a, b) => rank(a.level) - rank(b.level) || (a.daysUntil ?? 999) - (b.daysUntil ?? 999)); return { alerts, summary: { totalAssets: assets.length, maintenanceRecords: records.length, leaseSoon: assets.filter((a) => a.reminders?.lease?.show).length, waterDue: assets.filter((a) => a.reminders?.water?.show).length, maintenanceSoon: assets.filter((a) => a.reminders?.maintenance?.show).length, inRepair: assets.filter((a) => a.status === "repair").length } }; }
function rank(level) { return { high: 0, medium: 1, low: 2, none: 3 }[level] ?? 4; }
function formatDate(v) { if (!v) return "-"; const d = new Date(v); if (Number.isNaN(d.getTime())) return v; return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function sumMaintenanceCost(rows) { return rows.reduce((s, r) => s + Number(r.cost || 0), 0); }
function csvCell(v) { return `"${String(v ?? "").replaceAll('"', '""')}"`; }
