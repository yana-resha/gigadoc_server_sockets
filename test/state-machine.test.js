const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PHASES,
  createScenarioState,
  transitionScenario,
} = require("../lib/state-machine");

const apply = (state, intent, data, sessionId = state?.sessionId) =>
  transitionScenario(state, {
    intent,
    session_id: sessionId,
    ...(data ? { data } : {}),
  });

test("первая пользовательская фраза создаёт сессию без HTTP-запуска", () => {
  const result = transitionScenario(
    null,
    { intent: "begin_measurements", session_id: null },
    { createSessionId: () => "panel-session" },
  );

  assert.equal(result.state.sessionId, "panel-session");
  assert.equal(result.state.phase, PHASES.SCAN_INTRO);
  assert.deepEqual(
    result.events.map(({ type }) => type),
    ["tech", "scan_intro_ready"],
  );
});

test("полный intent-сценарий отдаёт production-like события без таймеров", () => {
  let state = createScenarioState("session-1");

  let   result = apply(state, "begin_measurements");
  assert.deepEqual(result.events.map(({ type }) => type), ["scan_intro_ready"]);
  state = result.state;

  result = apply(state, "begin_profile_questions");
  assert.equal(result.state.phase, PHASES.PROFILE_QUESTIONS);
  assert.equal(result.events[0].type, "profile_questions_ready");
  state = result.state;

  result = apply(state, "continue_with_profile");
  assert.equal(result.state.profileProvided, true);
  assert.equal(result.events[0].type, "scan_selection_ready");
  state = result.state;

  for (const measurement of ["skin", "heart_and_vessels", "vision"]) {
    result = apply(state, "select_measurement", { measurement });
    assert.equal(result.events[0].type, "measurement_selected");
    state = result.state;

    result = apply(state, "start_measurement");
    assert.equal(result.events[0].type, "measurement_started");
    state = result.state;

    result = apply(state, "complete_measurement", { measurement });
    assert.deepEqual(result.events.map(({ type }) => type), ["measurement_results_ready"]);
    state = result.state;
  }

  result = apply(state, "finish_measurements");
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
    session_id: "session-1",
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

test("guards отклоняют неверную фазу и session_id", () => {
  const state = createScenarioState("actual");

  const wrongPhase = apply(state, "start_measurement");
  assert.equal(wrongPhase.events[0].status, "fail");
  assert.equal(wrongPhase.events[0].error_code, "invalid_transition");
  assert.strictEqual(wrongPhase.state, state);

  const wrongSession = apply(state, "begin_measurements", undefined, "stale");
  assert.equal(wrongSession.events[0].status, "fail");
  assert.equal(wrongSession.events[0].error_code, "session_mismatch");
  assert.strictEqual(wrongSession.state, state);

  const staleRestart = transitionScenario(
    state,
    { intent: "restart_session", session_id: "stale" },
    { createSessionId: () => "must-not-be-used" },
  );
  assert.equal(staleRestart.events[0].error_code, "session_mismatch");
  assert.strictEqual(staleRestart.state, state);
});

test("reset_measurement удаляет результат и возвращает выбор", () => {
  let state = createScenarioState("session-3");

  state = apply(state, "begin_measurements").state;
  state = apply(state, "begin_profile_questions").state;
  state = apply(state, "continue_without_profile").state;
  state = apply(state, "select_measurement", { measurement: "skin" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;

  const result = apply(state, "reset_measurement", { measurement: "skin" });

  assert.equal(result.events[0].type, "measurement_reset");
  assert.equal(result.state.phase, PHASES.SCAN_SELECTION);
  assert.deepEqual(result.state.completedMeasurements, []);
});

test("после частичных результатов можно вернуться к пропущенным замерам", () => {
  let state = createScenarioState("session-4");

  state = apply(state, "begin_measurements").state;
  state = apply(state, "begin_profile_questions").state;
  state = apply(state, "continue_without_profile").state;
  state = apply(state, "select_measurement", { measurement: "skin" }).state;
  state = apply(state, "start_measurement").state;
  state = apply(state, "complete_measurement").state;
  state = apply(state, "finish_measurements").state;

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
    { intent: "restart_session", session_id: "old" },
    { createSessionId: () => "new" },
  );

  assert.equal(result.state.sessionId, "new");
  assert.deepEqual(
    result.events.map(({ session_id }) => session_id),
    [null, "new"],
  );
  assert.equal(result.events[1].face_in_area, true);
});
