const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMeasurementSnapshot, buildTechMessage } = require("../lib/protocol");

test("tech содержит только используемые frontend флаги состояния", () => {
  const tech = buildTechMessage("mock-session", {
    mic_in_progress: true,
    i_am_thinking: true,
  });

  assert.equal(tech.mic_in_progress, true);
  assert.equal(tech.i_am_thinking, true);
  assert.equal(Object.hasOwn(tech, "mic_on"), false);
  assert.equal(Object.hasOwn(tech, "face_in_area"), false);
  assert.equal(Object.hasOwn(tech, "session_id"), false);
});

test("snapshot использует подтверждённые зоны и реальные коды показателей", () => {
  const snapshot = buildMeasurementSnapshot("mock-session", ["heart_and_vessels", "skin"], 3);
  const zones = Object.fromEntries(snapshot.data.zones.map((zone) => [zone.zone_id, zone]));

  assert.equal(snapshot.type, "measurement_snapshot");
  assert.equal(snapshot.revision, 3);
  assert.equal(Object.hasOwn(snapshot, "session_id"), false);
  assert.equal(Object.hasOwn(snapshot.data, "session_id"), false);
  assert.equal(snapshot.data.status, "in_progress");
  assert.equal(zones.fpg.status, "completed");
  assert.equal(zones.cardio.status, "completed");
  assert.equal(zones.derm.status, "completed");
  assert.equal(zones.vision.status, "not_started");
  assert.equal(zones.fpg.checkups[0].results[0].attributes[0].indicator, "hr");
  assert.equal(zones.cardio.checkups[0].results[0].attributes[0].indicator, "heart_rate");
  assert.equal(zones.derm.checkups[0].results[0].attributes[0].indicator, "greasy_shine");
  assert.equal(zones.fpg.checkups[0].results[0].attributes[0].status, "normal");
  assert.equal(zones.fpg.checkups[0].results[0].attributes[0].step_values.length, 4);
  assert.equal(zones.cardio.checkups[0].results[0].attributes[1].indicator, "qtc");
});

test("шкалы кожи покрывают весь диапазон без числовых пропусков и сохраняют оценки мока", () => {
  const snapshot = buildMeasurementSnapshot("mock-session", ["skin"], 1);
  const skin = snapshot.data.zones.find((zone) => zone.zone_id === "derm");
  const attributes = skin.checkups.flatMap((checkup) =>
    checkup.results.flatMap((result) => result.attributes),
  ).filter((attribute) => attribute.step_values?.length > 1);
  assert.ok(attributes.some((attribute) => attribute.indicator === "comedone"));

  for (const attribute of attributes) {
    const steps = attribute.step_values;
    assert.equal(steps[0].from, 0);
    assert.equal(steps.at(-1).to, 10);
    for (let index = 1; index < steps.length; index += 1) {
      assert.equal(steps[index].from, steps[index - 1].to, attribute.indicator);
    }
    const step = steps.find((range, index) => attribute.value >= range.from &&
      (attribute.value < range.to || (index === steps.length - 1 && attribute.value === range.to)));
    assert.equal(step?.status, attribute.status, attribute.indicator);
  }
});

test("все числовые шкалы мока непрерывны, имеют видимые сегменты и согласованы со значениями", () => {
  const snapshot = buildMeasurementSnapshot("mock-session", ["heart_and_vessels", "skin", "vision"], 1);
  const checkedZones = new Set();

  for (const zone of snapshot.data.zones) {
    for (const checkup of zone.checkups) {
      for (const result of checkup.results) {
        for (const attribute of result.attributes) {
          const steps = attribute.step_values?.filter((step) => "from" in step);
          if (!steps?.length) continue;
          checkedZones.add(zone.zone_id);
          const label = `${zone.zone_id}:${attribute.indicator}`;
          steps.forEach((step, index) => {
            assert.ok(Number.isFinite(step.from) && Number.isFinite(step.to), label);
            assert.ok(step.to > step.from, `Нулевая или отрицательная ширина: ${label}`);
            if (index > 0) {
              assert.equal(step.from, steps[index - 1].to, `Пропуск или пересечение: ${label}`);
            }
          });
          const value = Number(attribute.value);
          const matching = steps.find((step, index) => value >= step.from &&
            (value < step.to || (index === steps.length - 1 && value === step.to)));
          assert.equal(matching?.status, attribute.status, `Статус тестового значения: ${label}`);
        }
      }
    }
  }
  assert.deepEqual([...checkedZones].sort(), ["cardio", "derm", "fpg", "vision"]);
});
