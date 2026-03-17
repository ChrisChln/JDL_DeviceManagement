import cors from "cors";
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { requireAuth } from "./auth-middleware.js";
import { config } from "./config.js";
import {
  deleteAsset,
  getLaborScheduleByDate,
  deleteMaintenanceRecord,
  insertMaintenanceRecord,
  listLaborSchedules,
  listAssets,
  listMaintenanceRecords,
  updateAsset,
  upsertLaborSchedule,
  upsertAsset,
} from "./repository.js";
import { normalizeLaborSchedulePayload } from "./schedule-utils.js";
import {
  computeAssetStatus,
  formatDateInput,
  normalizeAssetPayload,
  normalizeDate,
  normalizeMaintenancePayload,
} from "./utils.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.use("/api", requireAuth);

app.get("/api/me", (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
  });
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const assets = (await listAssets()).map(computeAssetStatus);
    const maintenance = await listMaintenanceRecords();
    const alerts = buildAlerts(assets);
    res.json({
      kpis: {
        totalAssets: assets.length,
        leaseDue: alerts.filter((item) => item.type === "lease").length,
        waterDue: alerts.filter((item) => item.type === "water" && (item.daysUntil ?? 999) <= 0).length,
        maintenanceDue: alerts.filter((item) => item.type === "maintenance").length,
      },
      alerts,
      maintenanceCount: maintenance.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/assets", async (_req, res, next) => {
  try {
    const assets = (await listAssets()).map(computeAssetStatus);
    res.json(assets);
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets", async (req, res, next) => {
  try {
    const asset = await upsertAsset(normalizeAssetPayload(req.body));
    res.status(201).json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.put("/api/assets/:id", async (req, res, next) => {
  try {
    const asset = await upsertAsset({ ...normalizeAssetPayload(req.body), id: req.params.id });
    res.json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/assets/:id", async (req, res, next) => {
  try {
    await deleteAsset(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets/:id/mark-watered", async (req, res, next) => {
  try {
    const asset = await updateAsset(req.params.id, { last_watered_at: formatDateInput(new Date()) });
    res.json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets/:id/mark-maintained", async (req, res, next) => {
  try {
    const asset = await updateAsset(req.params.id, { last_maintained_at: formatDateInput(new Date()) });
    res.json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets/import", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Missing file" });
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const [sheetName] = workbook.SheetNames;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    const results = [];

    for (const row of rows) {
      const asset = await upsertAsset(
        normalizeAssetPayload({
          warehouse: row["仓库"] || row.warehouse,
          model: row["车型"] || row.model,
          serial_number: row["序列号"] || row.serial_number,
          brand: row["品牌"] || row.brand,
          supplier: row["供应商"] || row.supplier,
          status: row["状态"] || row.status,
          monthly_rent: row["月租"] || row.monthly_rent,
          lease_start_date: row["起租日期"] || row.lease_start_date,
          lease_end_date: row["到期日期"] || row.lease_end_date,
          lease_resolution: row["到期处理方式"] || row.lease_resolution,
          last_watered_at: row["上次加水日期"] || row.last_watered_at,
          water_interval_days: row["加水周期"] || row.water_interval_days,
          last_maintained_at: row["上次保养日期"] || row.last_maintained_at,
          maintenance_interval_days: row["保养周期"] || row.maintenance_interval_days,
          notes: row["备注"] || row.notes,
        }),
      );
      results.push(asset);
    }

    res.status(201).json({ count: results.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/maintenance-records", async (_req, res, next) => {
  try {
    res.json(await listMaintenanceRecords());
  } catch (error) {
    next(error);
  }
});

app.post("/api/maintenance-records", async (req, res, next) => {
  try {
    const record = await insertMaintenanceRecord(normalizeMaintenancePayload(req.body));
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/maintenance-records/:id", async (req, res, next) => {
  try {
    await deleteMaintenanceRecord(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/labor-schedules", async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? normalizeDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? normalizeDate(req.query.endDate) : null;
    if (req.query.startDate && !startDate) {
      return res.status(400).json({ message: "Invalid startDate format, expected YYYY-MM-DD" });
    }
    if (req.query.endDate && !endDate) {
      return res.status(400).json({ message: "Invalid endDate format, expected YYYY-MM-DD" });
    }
    res.json(await listLaborSchedules({ startDate, endDate }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/labor-schedules/:planDate", async (req, res, next) => {
  try {
    const planDate = normalizeDate(req.params.planDate);
    if (!planDate) return res.status(400).json({ message: "Invalid planDate format, expected YYYY-MM-DD" });

    const record = await getLaborScheduleByDate(planDate);
    if (!record) return res.status(404).json({ message: "Schedule not found" });
    res.json(record);
  } catch (error) {
    next(error);
  }
});

app.put("/api/labor-schedules/:planDate", async (req, res, next) => {
  try {
    const planDate = normalizeDate(req.params.planDate);
    if (!planDate) return res.status(400).json({ message: "Invalid planDate format, expected YYYY-MM-DD" });

    const payload = normalizeLaborSchedulePayload({ ...req.body, plan_date: planDate });
    const record = await upsertLaborSchedule(payload);
    res.json(record);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

function buildAlerts(assets) {
  return assets
    .flatMap((asset) => {
      const items = [];
      const lease = asset.reminders.lease;
      const water = asset.reminders.water;
      const maintenance = asset.reminders.maintenance;

      if (lease.show) items.push(makeAlert("lease", asset, lease, `${asset.warehouse} · ${asset.lease_resolution || "待确认"}`));
      if (water.show) items.push(makeAlert("water", asset, water, `${asset.warehouse} · 下次加水 ${water.nextDate || "-"}`));
      if (maintenance.show) items.push(makeAlert("maintenance", asset, maintenance, `${asset.warehouse} · 下次保养 ${maintenance.nextDate || "-"}`));

      return items;
    })
    .sort((a, b) => rankLevel(a.level) - rankLevel(b.level) || (a.daysUntil ?? 999) - (b.daysUntil ?? 999));
}

function makeAlert(type, asset, reminder, subtitle) {
  return {
    type,
    level: reminder.level,
    daysUntil: reminder.daysUntil,
    badge: reminder.label,
    title:
      type === "lease"
        ? `${asset.serial_number} 租赁到期提醒`
        : type === "water"
          ? `${asset.serial_number} 加水提醒`
          : `${asset.serial_number} 保养提醒`,
    subtitle,
    assetId: asset.id,
    serialNumber: asset.serial_number,
  };
}

function rankLevel(level) {
  return { high: 0, medium: 1, low: 2, none: 3 }[level] ?? 4;
}
