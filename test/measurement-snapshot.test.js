const assert = require("node:assert/strict");
const test = require("node:test");
const { existsSync, readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const fixture = require("../fixtures/measurement-parameters.json");
const { buildMeasurementSnapshot, buildResultsIntro, buildTechMessage } = require("../lib/protocol");

const allZones = ["fpg", "cardio", "derm", "vision"];
const snapshot = (completedZones = allZones) => buildMeasurementSnapshot("mock", [], 3, { completedZones });
const attributes = (message, zoneId) => message.data.zones.filter(z => !zoneId || z.zone_id === zoneId)
  .flatMap(z => z.checkups.flatMap(c => c.results.flatMap(r => r.attributes)));
const byCode = (message, zoneId) => Object.fromEntries(attributes(message, zoneId).map(a => [a.indicator, a]));
const isDeviation = a => ["deviation", "problem", "serious"].includes(a.status);

test("tech содержит только используемые frontend флаги состояния", () => {
  const tech = buildTechMessage("mock-session", { mic_in_progress: true, i_am_thinking: true });
  assert.equal(tech.mic_in_progress, true);
  assert.equal(tech.i_am_thinking, true);
  for (const key of ["mic_on", "face_in_area", "session_id"]) assert.equal(Object.hasOwn(tech, key), false);
});

test("snapshot сохраняет четыре независимые зоны и отдаёт результаты только завершённых", () => {
  const received = snapshot(["fpg", "derm"]);
  assert.equal(received.type, "measurement_snapshot");
  assert.equal(received.revision, 3);
  assert.equal(received.data.status, "in_progress");
  assert.equal(Object.hasOwn(received, "session_id"), false);
  assert.deepEqual(received.data.zones.map(z => [z.zone_id, z.status]), [
    ["fpg", "completed"], ["cardio", "not_started"], ["derm", "completed"], ["vision", "not_started"],
  ]);
  assert.equal(attributes(received, "cardio").length, 0);
  assert.equal(attributes(received, "vision").length, 0);
  assert.equal(attributes(received, "derm").length, 10);
  const legacy = buildMeasurementSnapshot("mock", ["heart_and_vessels", "skin"], 3);
  assert.equal(legacy.data.zones.find(z => z.zone_id === "cardio").status, "completed");
});

test("выдача скрывает удалённые, QR-only и искусственные показатели", () => {
  const hidden = new Set(["wrinkles", "upper_ap", "lower_ap", "bmi", "age", "glycated_hemoglobin",
    "sdnn", "is_male", "diabet", "qtc", "cq_sdnn", "lf_hf", "lf", "hf", "vlf", "irregular_rhythm",
    "p_wave_duration", "pq_pr", "qrs", "qt", "diastolic_dysfunction", "systolic_dysfunction", "ischemic", "diabetes2",
    "cholesterol", "triglycerides", "cholesterol_hd", "cholesterol_ld", "lpa50",
    "clean_ecg", "standard_cardiocycle", "scattergram", "rr_intervals"]);
  for (const message of [snapshot(["fpg"]), snapshot()]) {
    for (const a of attributes(message)) {
      assert.equal(hidden.has(a.indicator), false, a.indicator);
      assert.equal(a.indicator.startsWith("test_"), false);
      assert.equal(typeof a.value, "string");
      for (const key of ["unit", "status", "label", "step_values"]) assert.ok(Object.hasOwn(a, key), key);
      assert.ok(a.label === null || typeof a.label === "string");
      for (const step of a.step_values) assert.deepEqual(Object.keys(step).sort(), ["from", "label", "status", "to"]);
    }
  }
});

test("приоритет ЭКГ подавляет только полученные дубли FPG, включая сводку", () => {
  const partial = byCode(snapshot(["fpg"]), "fpg");
  const full = byCode(snapshot(), "fpg");
  assert.equal(partial.hr.value, "72");
  assert.equal(partial.stress.value, "650");
  assert.equal(full.hr, undefined);
  assert.equal(full.stress, undefined);
  assert.equal(full.fatigue.label, "Средний");
  assert.equal(buildResultsIntro(["fpg"])[0].deviations_count, 3);
  assert.equal(buildResultsIntro(allZones)[0].deviations_count, 2);
  for (const completed of [["fpg"], ["cardio"], allZones]) {
    const received = snapshot(completed);
    for (const row of buildResultsIntro(completed)) {
      assert.equal(row.deviations_count, attributes(received, row.type).filter(isDeviation).length);
    }
  }
});

test("кожа сохраняет точечную ступень и подпись до округления, ПАРС и усталость используют backend labels", () => {
  const received = snapshot();
  const skin = byCode(received, "derm");
  assert.deepEqual(skin.comedone.step_values[0], { from: 0, to: 0, status: "normal", label: "Признак отсутствует" });
  assert.deepEqual([skin.comedone.value, skin.comedone.status, skin.comedone.label], ["0", "normal", "Лёгкая"]);
  assert.deepEqual([skin.post_acne.value, skin.post_acne.status, skin.post_acne.label], ["6", "normal", "Умеренная"]);
  assert.deepEqual([skin.redness.value, skin.redness.status, skin.redness.label], ["10", "serious", "Крайне выраженная"]);
  assert.deepEqual([skin.eyes_circles_blisters.value, skin.eyes_circles_blisters.label], ["0", "Признак отсутствует"]);
  const heart = byCode(received, "cardio");
  const pars = heart.regulatory_systems_activity;
  assert.deepEqual([pars.value, pars.status, pars.label], ["8", "deviation", "Перенапряжение"]);
  const fatigue = byCode(received, "fpg").fatigue;
  assert.deepEqual([fatigue.value, fatigue.status, fatigue.label, fatigue.step_values], ["middle", "deviation", "Средний", []]);
  assert.deepEqual([byCode(received, "fpg").health_index.value, byCode(received, "fpg").health_index.status], ["8", "normal"]);
  assert.equal(heart.tp.status, null);
  assert.deepEqual(heart.tp.step_values, []);
});

test("зрение содержит оба глаза Амслера, актуальный контраст и текстовые цветовые ответы", () => {
  const vision = byCode(snapshot(), "vision");
  assert.equal(Object.keys(vision).length, 8);
  assert.deepEqual([vision.leftEye.value, vision.leftEye.status], ["Патология выявлена", "deviation"]);
  assert.deepEqual([vision.rightEye.value, vision.rightEye.status], ["Не выявлены нарушения", "normal"]);
  assert.deepEqual([vision.redSegment.value, vision.redSegment.label, vision.redSegment.status], ["Без отклонений", "Без отклонений", "normal"]);
  assert.deepEqual([vision.greenSegment.value, vision.greenSegment.label, vision.greenSegment.status], ["Снижена чувствительность", "Снижена чувствительность", "deviation"]);
  assert.deepEqual([vision.blueSegment.status, vision.blueSegment.label], [null, null]);
  assert.deepEqual([vision.contrast.value, vision.contrast.unit, vision.contrast.status], ["5", "%", "normal"]);
  assert.equal(vision.contrast.step_values.length, 4);
  assert.deepEqual([vision.leftEyeAcuity.value, vision.leftEyeAcuity.status], ["0.9", "deviation"]);
});

const catalogPath = path.resolve(__dirname, "../../vsp-backend/config/measurement-parameters.json");
test("fixture сверена с текущим каталогом backend: типы и все границы, статусы и подписи ступеней", { skip: !existsSync(catalogPath) }, () => {
  const bytes = readFileSync(catalogPath);
  const catalog = JSON.parse(bytes);
  assert.equal(fixture.source.catalog_version, catalog.catalog_version);
  assert.equal(fixture.source.catalog_sha256, createHash("sha256").update(bytes).digest("hex"));
  const params = Object.fromEntries(catalog.parameters.map(p => [p.code, p]));
  for (const zone of fixture.zones) for (const result of zone.results) for (const a of result.attributes) {
    const parameter = params[a.indicator];
    assert.ok(parameter, a.indicator);
    assert.equal(a.type, parameter.type);
    const scale = parameter.scales.find(s => !s.definition.when.sex || s.definition.when.sex === "male");
    const expected = scale?.kind === "numeric" ? scale.definition.step_values.map(s => ({ from: s.from, to: s.to, status: s.status, label: s.label })) : [];
    assert.deepEqual(a.step_values, expected, a.indicator);
  }
});

test("snapshot не изменяет fixture и не разделяет изменяемые шкалы между клиентами", () => {
  const original = structuredClone(fixture);
  const first = snapshot();
  byCode(first, "derm").comedone.label = "Изменено";
  byCode(first, "derm").comedone.step_values[0].to = 100;
  assert.equal(byCode(snapshot(), "derm").comedone.step_values[0].to, 0);
  assert.deepEqual(fixture, original);
});
