import cors from "cors";
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { requireAuth } from "./auth-middleware.js";
import { config } from "./config.js";
import {
  createAssetTransfer,
  createUserProfile,
  deleteAsset,
  deleteMaintenanceRecord,
  getAssetById,
  getMaintenanceRecordById,
  getUserProfile,
  insertMaintenanceRecord,
  insertOperationLog,
  listAssets,
  listMaintenanceRecords,
  listOperationLogs,
  listTransferRecords,
  updateAsset,
  upsertAsset,
} from "./repository.js";
import {
  computeAssetStatus,
  formatDateInput,
  normalizeAssetPayload,
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
  getUserProfile(req.user.id)
    .then((profile) => {
      res.json({
        id: req.user.id,
        email: req.user.email,
        full_name: profile?.full_name || "",
      });
    })
    .catch((error) => {
      res.status(500).json({ message: error.message || "Internal server error" });
    });
});

app.post("/api/me/profile", async (req, res, next) => {
  try {
    const fullName = String(req.body?.full_name || "").trim();
    if (!fullName) {
      return res.status(400).json({ message: "请输入用户全名" });
    }
    if (fullName.length > 60) {
      return res.status(400).json({ message: "用户全名不能超过 60 个字符" });
    }

    const existing = await getUserProfile(req.user.id);
    if (existing && typeof existing.full_name === "string" && existing.full_name.trim() !== "") {
      return res.json({
        id: req.user.id,
        email: req.user.email,
        full_name: existing.full_name,
      });
    }

    const profile = await createUserProfile({
      user_id: req.user.id,
      email: req.user.email || "",
      full_name: fullName,
    });

    await safeLogOperation(req, {
      action: "首次填写用户全名",
      target_type: "用户资料",
      target_label: fullName,
      details: "完成首次登录资料设置",
      actorNameOverride: fullName,
    });

    res.status(201).json({
      id: req.user.id,
      email: req.user.email,
      full_name: profile.full_name,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/operation-logs", async (_req, res, next) => {
  try {
    res.json(await listOperationLogs());
  } catch (error) {
    next(error);
  }
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
    await safeLogOperation(req, {
      action: "创建资产",
      target_type: "资产",
      target_label: `${asset.serial_number} · ${asset.model}`,
      details: `${asset.warehouse} / ${asset.status}`,
    });
    res.status(201).json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.put("/api/assets/:id", async (req, res, next) => {
  try {
    const asset = await upsertAsset({ ...normalizeAssetPayload(req.body), id: req.params.id });
    await safeLogOperation(req, {
      action: "更新资产",
      target_type: "资产",
      target_label: `${asset.serial_number} · ${asset.model}`,
      details: `${asset.warehouse} / ${asset.status}`,
    });
    res.json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/assets/:id", async (req, res, next) => {
  try {
    const asset = await getAssetById(req.params.id);
    await deleteAsset(req.params.id);
    await safeLogOperation(req, {
      action: "删除资产",
      target_type: "资产",
      target_label: asset ? `${asset.serial_number} · ${asset.model}` : req.params.id,
      details: asset?.warehouse || "",
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets/:id/mark-watered", async (req, res, next) => {
  try {
    const asset = await updateAsset(req.params.id, { last_watered_at: formatDateInput(new Date()) });
    await safeLogOperation(req, {
      action: "更新加水日期",
      target_type: "资产",
      target_label: `${asset.serial_number} · ${asset.model}`,
      details: asset.last_watered_at || formatDateInput(new Date()),
    });
    res.json(computeAssetStatus(asset));
  } catch (error) {
    next(error);
  }
});

app.post("/api/assets/:id/mark-maintained", async (req, res, next) => {
  try {
    const asset = await updateAsset(req.params.id, { last_maintained_at: formatDateInput(new Date()) });
    await safeLogOperation(req, {
      action: "更新保养日期",
      target_type: "资产",
      target_label: `${asset.serial_number} · ${asset.model}`,
      details: asset.last_maintained_at || formatDateInput(new Date()),
    });
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

    for (const [index, row] of rows.entries()) {
      try {
        const asset = await upsertAsset(
          normalizeAssetPayload({
            warehouse: row["仓库"] || row.warehouse,
            model: row["车型"] || row.model,
            serial_number: row["序列号"] || row.serial_number,
            brand: row["叉车品牌"] || row["品牌"] || row.brand,
            supplier: row["供应商"] || row.supplier,
            status: row["状态"] || row.status,
            monthly_rent: row["月租"] || row.monthly_rent,
            is_purchase_ordered:
              row["是否采购下单"] ?? row.is_purchase_ordered,
            lease_start_date: row["起租日期"] || row.lease_start_date,
            lease_end_date: row["到期日期"] || row.lease_end_date,
            lease_resolution:
              row["后期处理方式"] ||
              row["到期处理方式"] ||
              row.lease_resolution,
            operation_requirement:
              row["运营需求"] || row.operation_requirement,
            current_status: row["目前状态"] || row.current_status,
            issue_feedback: row["问题反馈"] || row.issue_feedback,
            last_watered_at: row["上次加水日期"] || row.last_watered_at,
            water_interval_days: row["加水周期"] || row.water_interval_days,
            last_maintained_at: row["上次保养日期"] || row.last_maintained_at,
            maintenance_interval_days: row["保养周期"] || row.maintenance_interval_days,
            notes: row["备注"] || row.notes,
          }),
        );
        results.push(asset);
      } catch (error) {
        throw new Error(`第 ${index + 2} 行导入失败：${error.message}`);
      }
    }

    await safeLogOperation(req, {
      action: "导入资产",
      target_type: "资产",
      target_label: `共 ${results.length} 条`,
      details: `文件：${req.file.originalname}`,
    });

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

app.get("/api/transfer-records", async (_req, res, next) => {
  try {
    res.json(await listTransferRecords());
  } catch (error) {
    next(error);
  }
});

app.post("/api/transfer-records", async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.user.id);
    const requestedByName =
      profile?.full_name || req.user.email?.split("@")[0] || "用户";
    const assetIds = Array.isArray(req.body?.asset_ids)
      ? [...new Set(req.body.asset_ids.map((item) => String(item).trim()).filter(Boolean))]
      : [];
    const toWarehouse = String(req.body?.to_warehouse || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const note = String(req.body?.note || "").trim();

    if (!assetIds.length) {
      return res.status(400).json({ message: "请至少选择一台需要调拨的设备" });
    }

    const selectedAssets = await Promise.all(assetIds.map((assetId) => getAssetById(assetId)));
    const missing = selectedAssets.some((asset) => !asset);
    if (missing) {
      return res.status(400).json({ message: "部分设备不存在或已被删除" });
    }

    const sourceWarehouse = selectedAssets[0].warehouse;
    const mixedWarehouse = selectedAssets.some(
      (asset) => asset.warehouse !== sourceWarehouse,
    );
    if (mixedWarehouse) {
      return res.status(400).json({ message: "一次调拨只能选择同一仓库下的设备" });
    }

    const transfers = [];
    for (const assetId of assetIds) {
      const transfer = await createAssetTransfer({
        asset_id: assetId,
        to_warehouse: toWarehouse,
        requested_by_user_id: req.user.id,
        requested_by_name: requestedByName,
        reason,
        note,
      });
      transfers.push(transfer);

      await safeLogOperation(req, {
        action: "资产调拨",
        target_type: "调拨记录",
        target_label: `${transfer.transfer_no} · ${transfer.asset_serial_number}`,
        details: `${transfer.from_warehouse} → ${transfer.to_warehouse}`,
      });
    }

    res.status(201).json({ count: transfers.length, records: transfers });
  } catch (error) {
    next(error);
  }
});

app.post("/api/maintenance-records", async (req, res, next) => {
  try {
    const record = await insertMaintenanceRecord(normalizeMaintenancePayload(req.body));
    const asset = await getAssetById(record.asset_id);
    await safeLogOperation(req, {
      action: "创建维修记录",
      target_type: "维修记录",
      target_label: asset ? `${asset.serial_number} · ${asset.model}` : record.asset_id,
      details: record.issue_description,
    });
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/maintenance-records/:id", async (req, res, next) => {
  try {
    const record = await getMaintenanceRecordById(req.params.id);
    const asset = record?.asset_id ? await getAssetById(record.asset_id) : null;
    await deleteMaintenanceRecord(req.params.id);
    await safeLogOperation(req, {
      action: "删除维修记录",
      target_type: "维修记录",
      target_label: asset ? `${asset.serial_number} · ${asset.model}` : req.params.id,
      details: record?.issue_description || "",
    });
    res.status(204).send();
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

async function safeLogOperation(req, payload) {
  try {
    const profile = await getUserProfile(req.user.id);
    const actorName =
      payload.actorNameOverride ||
      profile?.full_name ||
      req.user.email?.split("@")[0] ||
      "用户";
    await insertOperationLog({
      actor_user_id: req.user.id,
      actor_name: actorName,
      actor_email: req.user.email || "",
      action: payload.action,
      target_type: payload.target_type,
      target_label: payload.target_label || "",
      details: payload.details || "",
    });
  } catch (error) {
    console.error("Failed to write operation log", error);
  }
}
