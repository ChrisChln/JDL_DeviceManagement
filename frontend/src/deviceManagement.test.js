import test from "node:test";
import assert from "node:assert/strict";
import {
  deviceSeed,
  filterDevices,
  loadDevicesFromStorage,
  removeDeviceById,
  upsertDevice,
  validateDevicePayload,
} from "./deviceManagement.js";

test("validate required fields and quantity", () => {
  const { errors } = validateDevicePayload({ ...deviceSeed, quantity: 0 });
  assert.ok(errors.length > 1);
  assert.ok(errors.includes("数量必须是大于 0 的整数"));
});

test("create a new device record", () => {
  const payload = {
    warehouse: "上海仓",
    assetCode: "IT-001",
    assetType: "电脑",
    sn: "SN123",
    brand: "Lenovo",
    detail: "ThinkPad X1",
    quantity: 2,
    location: "A 区 2 楼",
    department: "信息部",
  };
  const { errors, devices } = upsertDevice([], payload);
  assert.deepEqual(errors, []);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].quantity, 2);
});

test("filter and remove devices", () => {
  const base = [
    {
      id: "1",
      assetCode: "IT-1",
      assetType: "PDA",
      sn: "A",
      brand: "Zebra",
      warehouse: "北京",
      location: "库位1",
      department: "运营",
    },
    {
      id: "2",
      assetCode: "IT-2",
      assetType: "电脑",
      sn: "B",
      brand: "HP",
      warehouse: "上海",
      location: "库位2",
      department: "财务",
    },
  ];
  assert.equal(filterDevices(base, "pda").length, 1);
  assert.equal(removeDeviceById(base, "1").length, 1);
});

test("load invalid storage safely", () => {
  const storage = { getItem: () => "not-json" };
  assert.deepEqual(loadDevicesFromStorage(storage), []);
});
