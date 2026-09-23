const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMeasurementSnapshot } = require("../lib/protocol");

test("snapshot использует подтверждённые зоны и реальные коды показателей", () => {
  const snapshot = buildMeasurementSnapshot("mock-session", ["heart_and_vessels", "skin"], 3);
  const zones = Object.fromEntries(snapshot.data.zones.map((zone) => [zone.zone_id, zone]));

  assert.equal(snapshot.type, "measurement_snapshot");
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.data.status, "in_progress");
  assert.equal(zones.fpg.status, "completed");
  assert.equal(zones.cardio.status, "completed");
  assert.equal(zones.derm.status, "completed");
  assert.equal(zones.vision.status, "not_started");
  assert.equal(zones.fpg.checkups[0].results[0].attributes[0].indicator, "hr");
  assert.equal(zones.cardio.checkups[0].results[0].attributes[0].indicator, "heart_rate");
  assert.equal(zones.derm.checkups[0].results[0].attributes[0].indicator, "greasy_shine");
});
