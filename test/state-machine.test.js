const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PHASES,
  createScenarioState,
  transitionScenario,
} = require("../lib/state-machine");

const apply = (state, intent, data) =>
  transitionScenario(state, {
    intent,
    ...(data ? { data } : {}),
  });

test("первая пользовательская фраза создаёт сессию без HTTP-запуска", () => {
  const result = transitionScenario(
    null,
    { intent: "begin_measurements" },
    { createSessionId: () => "panel-session" },
  );

  assert.equal(result.state.sessionId, "panel-session");
  assert.equal(result.state.phase, PHASES.SCAN_SELECTION);
  assert.deepEqual(
    result.events.map(({ type }) => type),
    ["session_start", "scan_selection_ready"],
  );
});

test("после согласия можно сразу выбрать замер на планшете", () => {
  const started = apply(createScenarioState("tablet-session"), "begin_measurements");
  const selected = apply(started.state, "select_measurement", { measurement: "derm" });

  assert.equal(selected.events[0].type, "measurement_selected");
  assert.equal(selected.state.activeMeasurement, "skin");
});

test("начать сессию запускает только приветствие и не выбирает экран", () => {
  const result = transitionScenario(null, { intent: "start_session" }, {
    createSessionId: () => "greeting-session",
  });

  assert.equal(result.state.phase, PHASES.START);
  assert.deepEqual(result.events.map(({ type }) => type), ["session_start"]);
  assert.equal(apply(result.state, "start_session").events[0].status, "fail");
});

test("профиль запрашивается после замеров до открытия категорий", () => {
  let state = apply(createScenarioState("profile-session"), "begin_measurements").state;
  assert.equal(apply(state, "begin_profile_questions").events[0].status, "fail");
  state = apply(state, "select_measurement", { measurement: "derm" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;
  const finished = apply(state, "finish_measurements");
  assert.equal(finished.events[0].type, "profile_questions_ready");
  assert.deepEqual(finished.state.completedMeasurements, ["skin"]);
  assert.equal(apply(finished.state, "open_category", { category: "skin" }).events[0].status, "fail");
  const skipped = apply(finished.state, "continue_without_profile");
  assert.equal(skipped.events[0].type, "results_intro_ready");
  assert.equal(apply(skipped.state, "open_category", { category: "skin" }).events[0].view, "category_cards");
  state = apply(skipped.state, "resume_measurements").state;
  state = apply(state, "select_measurement", { measurement: "vision" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;
  assert.equal(apply(state, "finish_measurements").events[0].type, "results_intro_ready");
});

test("полный intent-сценарий отдаёт production-like события без таймеров", () => {
  let state = createScenarioState("session-1");

  let   result = apply(state, "begin_measurements");
  assert.deepEqual(result.events.map(({ type }) => type), ["scan_selection_ready"]);
  state = result.state;

  for (const [measurement, zone_id] of [["skin", "derm"], ["heart_and_vessels", "fpg"], ["heart_and_vessels", "cardio"], ["vision", "vision"]]) {
    result = apply(state, "select_measurement", { measurement: zone_id });
    assert.equal(result.events[0].type, "measurement_selected");
    state = result.state;

    result = apply(state, "start_measurement");
    assert.equal(result.events[0].type, "measurement_started");
    state = result.state;

    result = apply(state, "complete_measurement");
    assert.deepEqual(result.events.map(({ type }) => type), ["measurement_results_ready"]);
    state = result.state;
  }

  result = apply(state, "finish_measurements");
  assert.equal(result.events[0].type, "profile_questions_ready");
  state = result.state;
  result = apply(state, "continue_with_profile");
  assert.equal(result.state.profileProvided, true);
  assert.equal(result.events[0].type, "results_intro_ready");
  assert.equal(
    result.events[0].results.every(({ completed }) => completed),
    true,
  );
  state = result.state;

  result = apply(state, "open_category", { category: "skin" });
  assert.equal(result.events[0].view, "category_cards");
  state = result.state;

  result = apply(state, "show_results_overview");
  assert.deepEqual(result.events[0], {
    status: "ok",
    type: "results_view_ready",
    view: "overview",
  });
  state = result.state;

  result = apply(state, "open_category", { category: "skin" });
  assert.equal(result.events[0].view, "category_cards");
  state = result.state;

  result = apply(state, "open_category_table", {
    category: "heart_and_vessels",
  });
  assert.equal(result.events[0].view, "category_table");
  state = result.state;

  result = apply(state, "show_all_deviations");
  assert.equal(result.events[0].view, "all_deviations");
  state = result.state;

  result = apply(state, "save_results");
  assert.deepEqual(result.events.map(({ type }) => type), [
    "qr",
    "results_view_ready",
  ]);
  assert.match(result.events[0].svg, /<svg\b/);
  assert.equal(result.events[1].view, "qr");
  state = result.state;

  result = apply(state, "finish_session");
  assert.equal(result.events[0].type, "session_exit_with_measurements");
  assert.equal(result.state.phase, PHASES.EXITED);
});

test("отказ завершается без QR", () => {
  let state = createScenarioState("session-2");
  let result = apply(state, "decline_measurements");
  state = result.state;

  result = apply(state, "finish_session");

  assert.deepEqual(result.events.map(({ type }) => type), [
    "session_exit_without_measurements",
  ]);
});

test("guards отклоняют неверную фазу", () => {
  const state = createScenarioState("actual");

  const wrongPhase = apply(state, "start_measurement");
  assert.equal(wrongPhase.events[0].status, "fail");
  assert.equal(wrongPhase.events[0].error_code, "invalid_transition");
  assert.strictEqual(wrongPhase.state, state);

});

test("reset_measurement удаляет результат и возвращает выбор", () => {
  let state = createScenarioState("session-3");

  state = apply(state, "begin_measurements").state;
  state = apply(state, "select_measurement", { measurement: "derm" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;

  const result = apply(state, "reset_measurement", { measurement: "derm" });

  assert.equal(result.events[0].type, "measurement_reset");
  assert.equal(result.state.phase, PHASES.SCAN_SELECTION);
  assert.deepEqual(result.state.completedMeasurements, []);
});

test("после частичных результатов можно вернуться к пропущенным замерам", () => {
  let state = createScenarioState("session-4");

  state = apply(state, "begin_measurements").state;
  state = apply(state, "select_measurement", { measurement: "derm" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;
  state = apply(state, "finish_measurements").state;
  state = apply(state, "continue_without_profile").state;

  const resumed = apply(state, "resume_measurements");

  assert.equal(resumed.events[0].type, "measurements_resume_ready");
  assert.equal(resumed.state.phase, PHASES.SCAN_SELECTION);
  assert.deepEqual(resumed.state.completedMeasurements, ["skin"]);

  const nextMeasurement = apply(resumed.state, "select_measurement", {
    measurement: "vision",
  });
  assert.equal(nextMeasurement.events[0].type, "measurement_selected");
});

test("restart_session создаёт новую сессию мгновенно", () => {
  const state = createScenarioState("old");
  const result = transitionScenario(
    state,
    { intent: "restart_session" },
    { createSessionId: () => "new" },
  );

  assert.equal(result.state.sessionId, "new");
  assert.deepEqual(
    result.events.map(({ type }) => type),
    ["session_end", "session_start"],
  );
});

test("две зоны сердца выбираются и завершаются независимо", () => {
  const { buildMeasurementSnapshot } = require('../lib/protocol');
  let state = apply(createScenarioState('zones'), 'begin_measurements').state;
  assert.equal(apply(state, 'select_measurement', { measurement: 'heart_and_vessels' }).events[0].status, 'fail');
  for (const zone_id of ['fpg', 'cardio']) {
    const selected = apply(state, 'select_measurement', { measurement: zone_id });
    assert.equal(selected.events[0].type, 'measurement_selected');
    state = selected.state;
    let snapshot = buildMeasurementSnapshot('zones', state.completedMeasurements, 1, state);
    assert.equal(snapshot.data.zones.find((zone) => zone.zone_id === zone_id).status, 'created');
    state = apply(state, 'start_measurement').state;
    snapshot = buildMeasurementSnapshot('zones', state.completedMeasurements, 2, state);
    assert.equal(snapshot.data.zones.find((zone) => zone.zone_id === zone_id).status, 'started');
    state = apply(state, 'complete_measurement').state;
    snapshot = buildMeasurementSnapshot('zones', state.completedMeasurements, 3, state);
    assert.equal(snapshot.data.zones.find((zone) => zone.zone_id === zone_id).status, 'completed');
    assert.equal(apply(state, 'select_measurement', { measurement: zone_id }).events[0].status, 'fail');
    if (zone_id === 'fpg') {
      assert.equal(snapshot.data.zones.find((zone) => zone.zone_id === 'cardio').status, 'not_started');
      assert.equal(state.completedMeasurements.includes('heart_and_vessels'), false);
    }
  }
  assert.equal(state.completedMeasurements.includes('heart_and_vessels'), true);
});
