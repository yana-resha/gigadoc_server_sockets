const { MEASUREMENT_PLAN, ok } = require("./protocol");
const { PHASES, createScenarioState, transitionScenario } = require("./state-machine");

const ZONES = ["fpg", "cardio", "derm", "vision"];
const CATEGORY_BY_ZONE = { fpg: "heart_and_vessels", cardio: "heart_and_vessels", derm: "skin", vision: "vision" };
const RESULT_INTENTS = new Set([
  "begin_profile_questions", "continue_with_profile", "continue_without_profile",
  "finish_measurements", "show_results_overview", "open_category", "open_category_table",
  "show_all_deviations", "show_all_indicators", "save_results", "finish_session",
]);

/** Debug-only adapter: reuse regular events while removing scenario prerequisites for the panel. */
const transitionUnrestrictedScenario = (state, payload, options = {}) => {
  const intent = payload?.intent;
  if (!state?.sessionId && ["end_session", "finish_session"].includes(intent)) {
    // Ending an already-ended session must never bootstrap another one.
    return { state: null, events: [ok(null, "session_end")] };
  }
  if (intent === "start_session" || intent === "restart_session") {
    return transitionScenario(state, {
      ...payload,
      intent: state?.sessionId ? "restart_session" : intent,
    }, options);
  }
  if (!state?.sessionId && typeof options.createSessionId !== "function") {
    return transitionScenario(state, payload, options);
  }

  const createdSession = !state?.sessionId;
  let prepared = createdSession ? createScenarioState(options.createSessionId()) : { ...state };
  const prefix = createdSession ? [ok(prepared.sessionId, "session_start")] : [];
  const declinedFarewell = intent === "finish_session" && prepared.phase === PHASES.MEASUREMENTS_DECLINED;

  if (RESULT_INTENTS.has(intent) && !declinedFarewell) {
    prepared = {
      ...prepared,
      completedZones: [...ZONES],
      completedMeasurements: [...MEASUREMENT_PLAN],
      activeZone: null,
      activeMeasurement: null,
      phase: PHASES.RESULTS_OVERVIEW,
    };
  }

  switch (intent) {
    case "begin_measurements":
    case "decline_measurements":
      prepared.phase = PHASES.START;
      break;
    case "begin_profile_questions":
    case "finish_measurements":
      prepared.phase = PHASES.MEASUREMENT_RESULTS;
      break;
    case "continue_with_profile":
    case "continue_without_profile":
      prepared.phase = PHASES.PROFILE_QUESTIONS;
      break;
    case "select_measurement": {
      const zone = payload.data?.measurement;
      prepared.phase = PHASES.SCAN_SELECTION;
      prepared.completedZones = prepared.completedZones.filter((id) => id !== zone);
      prepared.completedMeasurements = MEASUREMENT_PLAN.filter((category) =>
        ZONES.filter((id) => CATEGORY_BY_ZONE[id] === category).every((id) => prepared.completedZones.includes(id)));
      break;
    }
    case "start_measurement":
    case "complete_measurement":
    case "reset_measurement": {
      const zone = payload.data?.measurement ?? prepared.activeZone ?? "fpg";
      if (!ZONES.includes(zone)) return transitionScenario(state, payload, options);
      prepared.activeZone = zone;
      prepared.activeMeasurement = CATEGORY_BY_ZONE[zone];
      prepared.phase = intent === "start_measurement" ? PHASES.MEASUREMENT_SELECTED : PHASES.MEASUREMENT_IN_PROGRESS;
      // The frontend validates reset against its active zone; establish the same target first.
      if (intent === "reset_measurement") prefix.push(ok(prepared.sessionId, "measurement_selected", { measurement: zone }));
      break;
    }
    case "resume_measurements": {
      const event = ok(prepared.sessionId, "measurements_resume_ready");
      return {
        state: { ...prepared, phase: PHASES.SCAN_SELECTION, activeZone: null, activeMeasurement: null, idleWarningVisible: false, lastScreenEvent: event },
        events: [...prefix, event],
      };
    }
    case "continue_session":
      prepared.idleWarningVisible = true;
      break;
  }

  const result = transitionScenario(prepared, payload, options);
  if (result.events.some((event) => event.status === "fail")) return { ...result, state };

  return { ...result, events: [...prefix, ...result.events] };
};

module.exports = { transitionUnrestrictedScenario };
