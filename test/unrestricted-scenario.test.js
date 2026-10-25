const assert = require("node:assert/strict");
const test = require("node:test");
const { createOpenApiDocument } = require("../lib/openapi");
const { PHASES, createScenarioState, transitionScenario } = require("../lib/state-machine");
const { transitionUnrestrictedScenario } = require("../lib/unrestricted-scenario");
const { buildMeasurementSnapshot } = require("../lib/protocol");

const intents = createOpenApiDocument({ host: "127.0.0.1", port: 8081, webSocketPath: "/ws/frontend/v1" })
  .components.schemas.MockUserIntent.enum;
const dataFor = (intent) => intent === "select_measurement"
  ? { measurement: "vision" }
  : ["open_category", "open_category_table"].includes(intent) ? { category: "vision" } : undefined;
const apply = (state, intent, data = dataFor(intent)) => transitionUnrestrictedScenario(state,
  { intent, unrestricted: true, data }, { createSessionId: () => "new-debug-session" });

test("all panel intents work from every phase and without a session, without mutating source state", () => {
  for (const phase of [null, ...Object.values(PHASES)]) {
    for (const intent of intents) {
      const state = phase ? { ...createScenarioState("existing-debug-session"), phase } : null;
      const before = structuredClone(state);
      const result = apply(state, intent);
      assert.ok(result.events.length > 0);
      assert.ok(result.events.every((event) => event.status === "ok"), `${phase}: ${intent}`);
      assert.deepEqual(state, before);
      if (!state && intent !== "restart_session") assert.equal(result.events[0].type, "session_start");
    }
  }
});

test("direct category transitions have fixture data for each category before navigation", () => {
  for (const intent of ["open_category", "open_category_table", "show_all_indicators", "show_all_deviations", "show_results_overview"]) {
    for (const category of ["fpg", "cardio", "derm", "vision"]) {
      const result = apply(null, intent, { category });
      const snapshot = buildMeasurementSnapshot(result.state.sessionId, result.state.completedMeasurements, 1, result.state);
      assert.equal(snapshot.data.zones.length, 4);
      for (const zone of snapshot.data.zones) {
        assert.equal(zone.status, "completed");
        assert.ok(zone.checkups.length > 0);
      }
      assert.equal(result.events.at(-1).type, "results_view_ready");
    }
  }
});

test("completed zones can be selected again and reset establishes the frontend active zone", () => {
  const full = apply(null, "show_all_indicators").state;
  for (const zone of ["fpg", "cardio", "derm", "vision"]) {
    const selected = apply(full, "select_measurement", { measurement: zone });
    assert.equal(selected.state.activeZone, zone);
    assert.equal(selected.state.completedZones.includes(zone), false);
    const started = apply(selected.state, "start_measurement");
    assert.equal(started.events.at(-1).measurement, zone);
    const completed = apply(started.state, "complete_measurement");
    assert.ok(completed.state.completedZones.includes(zone));
    const reset = apply(full, "reset_measurement", { measurement: zone });
    assert.deepEqual(reset.events.map(event => event.type), ["measurement_selected", "measurement_reset"]);
    assert.ok(reset.events.every(event => event.measurement === zone));
  }
});

test("normal scenario transitions retain their phase and measurement prerequisites", () => {
  const state = createScenarioState("strict-session");
  for (const intent of ["open_category", "open_category_table", "show_all_indicators", "show_all_deviations", "complete_measurement"]) {
    assert.equal(transitionScenario(state, { intent, data: dataFor(intent) }).events[0].status, "fail");
  }
  assert.equal(apply(state, "open_category", { category: "invalid" }).events[0].status, "fail");
  assert.equal(apply(state, "select_measurement", { measurement: "invalid" }).events[0].status, "fail");
});
