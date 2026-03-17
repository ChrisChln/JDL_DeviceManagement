import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLaborSchedulePayload } from "./schedule-utils.js";

test("normalizeLaborSchedulePayload should normalize valid payload", () => {
  const payload = normalizeLaborSchedulePayload({
    planDate: "2026-03-18",
    templateVersion: "v3",
    day_shift_forecast: "30000",
    night_shift_forecast: 10000,
    actual_day_shift: 20000,
    actual_night_shift: "10000",
    tocLabor: {
      Pick: { total: 52, ds: 38, ns: 14, day_shift_capacity: 30600, night_shift_capacity: 10800 },
    },
    notes: "ok",
    updatedBy: "admin@example.com",
  });

  assert.equal(payload.plan_date, "2026-03-18");
  assert.equal(payload.template_version, "v3");
  assert.equal(payload.day_shift_forecast, 30000);
  assert.equal(payload.night_shift_forecast, 10000);
  assert.equal(payload.actual_day_shift, 20000);
  assert.equal(payload.actual_night_shift, 10000);
  assert.deepEqual(payload.toc_labor.Pick, {
    total: 52,
    ds: 38,
    ns: 14,
    day_shift_capacity: 30600,
    night_shift_capacity: 10800,
  });
});

test("normalizeLaborSchedulePayload should throw when plan_date is missing", () => {
  assert.throws(() => normalizeLaborSchedulePayload({}), /plan_date is required/);
});

test("normalizeLaborSchedulePayload should throw on negative metric", () => {
  assert.throws(
    () => normalizeLaborSchedulePayload({ plan_date: "2026-03-18", day_shift_forecast: -1 }),
    /non-negative/,
  );
});

test("normalizeLaborSchedulePayload should throw on invalid toc_labor", () => {
  assert.throws(
    () => normalizeLaborSchedulePayload({ plan_date: "2026-03-18", toc_labor: [] }),
    /toc_labor must be a JSON object/,
  );
});
