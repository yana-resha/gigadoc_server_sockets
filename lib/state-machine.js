const {
  QR_SVG,
  MEASUREMENT_PLAN,
  buildMeasurementResults,
  buildResultsIntro,
  fail,
  ok,
} = require("./protocol");

const PHASES = {
  START: "start",
  SCAN_INTRO: "scan_intro",
  PROFILE_QUESTIONS: "profile_questions",
  SCAN_SELECTION: "scan_selection",
  MEASUREMENTS_DECLINED: "measurements_declined",
  MEASUREMENT_SELECTED: "measurement_selected",
  MEASUREMENT_IN_PROGRESS: "measurement_in_progress",
  MEASUREMENT_RESULTS: "measurement_results",
  RESULTS_INTRO: "results_intro",
  RESULTS_OVERVIEW: "results_overview",
  CATEGORY_CARDS: "category_cards",
  CATEGORY_TABLE: "category_table",
  ALL_DEVIATIONS: "all_deviations",
  ALL_INDICATORS: "all_indicators",
  QR: "qr",
  EXITED: "exited",
};

const RESULT_PHASES = new Set([
  PHASES.RESULTS_OVERVIEW,
  PHASES.CATEGORY_CARDS,
  PHASES.CATEGORY_TABLE,
  PHASES.ALL_DEVIATIONS,
  PHASES.ALL_INDICATORS,
  PHASES.QR,
]);
const isResultPhase = (phase) =>
  phase === PHASES.RESULTS_INTRO || RESULT_PHASES.has(phase);

const createScenarioState = (sessionId) => ({
  sessionId,
  phase: PHASES.START,
  activeMeasurement: null,
  activeZone: null,
  completedZones: [],
  completedMeasurements: [],
  profileProvided: null,
});

const evolve = (state, updates, events) => ({
  state: { ...state, ...updates },
  events,
});

const invalid = (state, intent, detail) => ({
  state,
  events: [
    fail(
      state?.sessionId ?? null,
      "invalid_transition",
      detail ?? `Intent "${intent}" недоступен в фазе "${state?.phase ?? "idle"}".`,
    ),
  ],
});

const invalidPayload = (state, text) => ({
  state,
  events: [fail(state?.sessionId ?? null, "invalid_payload", text)],
});

const isKnownMeasurement = (measurement) => MEASUREMENT_PLAN.includes(measurement);
const ZONES_BY_MEASUREMENT = {
  heart_and_vessels: ["fpg", "cardio"], skin: ["derm"], vision: ["vision"],
};

const transitionScenario = (state, payload, options = {}) => {
  if (!payload || typeof payload.intent !== "string") {
    return invalidPayload(state, "payload.intent должен быть строкой.");
  }

  const { intent } = payload;

  if (intent === "start_session") {
    if (state?.sessionId) return invalid(state, intent);
    if (typeof options.createSessionId !== "function") {
      return invalidPayload(state, "Для start_session не задан генератор сессии.");
    }
    const nextState = createScenarioState(options.createSessionId());
    return { state: nextState, events: [ok(nextState.sessionId, "session_start")] };
  }

  if (intent === "restart_session") {
    if (typeof options.createSessionId !== "function") {
      return invalidPayload(state, "Для restart_session не задан генератор сессии.");
    }

    const nextState = createScenarioState(options.createSessionId());

    return {
      state: nextState,
      events: [
        ok(null, "session_end"),
        ok(nextState.sessionId, "session_start"),
      ],
    };
  }

  if (
    !state?.sessionId &&
    ["begin_measurements", "decline_measurements"].includes(intent)
  ) {
    if (typeof options.createSessionId !== "function") {
      return invalidPayload(state, "Для запуска не задан генератор сессии.");
    }

    const nextState = createScenarioState(options.createSessionId());
    const started = transitionScenario(nextState, payload, options);

    return {
      state: started.state,
      events: [
        ok(nextState.sessionId, "session_start"),
        ...started.events,
      ],
    };
  }

  if (!state?.sessionId) {
    return invalid(state, intent, "Сначала запустите /cycle или отправьте restart_session.");
  }

  const event = (type, data) => ok(state.sessionId, type, data);
  const zone = payload.data?.measurement;
  const measurement = { fpg: "heart_and_vessels", cardio: "heart_and_vessels", derm: "skin", vision: "vision" }[zone];
  const category = payload.data?.category;

  switch (intent) {
    case "begin_measurements":
      if (state.phase !== PHASES.START) return invalid(state, intent);

      return evolve(state, { phase: PHASES.SCAN_SELECTION }, [
        event("scan_selection_ready"),
      ]);

    case "decline_measurements":
      if (![PHASES.START, PHASES.SCAN_INTRO].includes(state.phase)) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.MEASUREMENTS_DECLINED }, [
        event("measurements_declined"),
      ]);

    case "begin_profile_questions":
      if (
        state.phase !== PHASES.MEASUREMENT_RESULTS ||
        state.completedZones.length === 0
      ) return invalid(state, intent);

      return evolve(state, { phase: PHASES.PROFILE_QUESTIONS }, [
        event("profile_questions_ready"),
      ]);

    case "continue_with_profile":
    case "continue_without_profile":
      if (state.phase !== PHASES.PROFILE_QUESTIONS) return invalid(state, intent);

      return evolve(
        state,
        {
          phase: PHASES.RESULTS_INTRO,
          profileProvided: intent === "continue_with_profile",
        },
        [event("results_intro_ready", {
          results: buildResultsIntro(state.completedMeasurements),
        })],
      );

    case "select_measurement":
      if (
        ![PHASES.SCAN_SELECTION, PHASES.MEASUREMENT_RESULTS].includes(state.phase)
      ) {
        return invalid(state, intent);
      }
      if (!isKnownMeasurement(measurement)) {
        return invalidPayload(state, `Неизвестный measurement "${measurement}".`);
      }
      const selectedZone = zone;
      if (state.completedZones.includes(selectedZone)) {
        return invalid(state, intent, `Замер "${measurement}" уже завершён.`);
      }

      return evolve(
        state,
        { phase: PHASES.MEASUREMENT_SELECTED, activeMeasurement: measurement, activeZone: selectedZone },
        [event("measurement_selected", { measurement: selectedZone })],
      );

    case "start_measurement":
      if (state.phase !== PHASES.MEASUREMENT_SELECTED) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.MEASUREMENT_IN_PROGRESS }, [
        event("measurement_started", {
          measurement: state.activeZone,
        }),
      ]);

    case "complete_measurement": {
      if (state.phase !== PHASES.MEASUREMENT_IN_PROGRESS) {
        return invalid(state, intent);
      }
      if (measurement && measurement !== state.activeMeasurement) {
        return invalidPayload(
          state,
          `Активен замер "${state.activeMeasurement}", а не "${measurement}".`,
        );
      }

      const completedZones = [...new Set([...state.completedZones, state.activeZone])];
      const completedMeasurements = MEASUREMENT_PLAN.filter((category) =>
        ZONES_BY_MEASUREMENT[category].every((id) => completedZones.includes(id)));

      return evolve(
        state,
        {
          phase: PHASES.MEASUREMENT_RESULTS,
          activeMeasurement: null,
          activeZone: null,
          completedZones,
          completedMeasurements,
        },
        [
          event("measurement_results_ready", {
            results: buildMeasurementResults(completedMeasurements),
          }),
        ],
      );
    }

    case "reset_measurement": {
      if (
        ![
          PHASES.MEASUREMENT_SELECTED,
          PHASES.MEASUREMENT_IN_PROGRESS,
          PHASES.MEASUREMENT_RESULTS,
        ].includes(state.phase)
      ) {
        return invalid(state, intent);
      }

      const target = measurement ?? state.activeMeasurement;
      if (!isKnownMeasurement(target)) {
        return invalidPayload(state, "reset_measurement требует data.measurement.");
      }
      if (
        state.activeMeasurement &&
        state.phase !== PHASES.MEASUREMENT_RESULTS &&
        target !== state.activeMeasurement
      ) {
        return invalidPayload(
          state,
          `Активен замер "${state.activeMeasurement}", а не "${target}".`,
        );
      }

      return evolve(
        state,
        {
          phase: PHASES.SCAN_SELECTION,
          activeMeasurement: null,
          activeZone: null,
          completedZones: state.completedZones.filter((id) =>
            state.activeZone ? id !== state.activeZone : !ZONES_BY_MEASUREMENT[target].includes(id)),
          completedMeasurements: state.completedMeasurements.filter(
            (item) => item !== target,
          ),
        },
        [event("measurement_reset", { measurement: target })],
      );
    }

    case "finish_measurements":
      if (
        state.phase !== PHASES.MEASUREMENT_RESULTS ||
        state.completedZones.length === 0
      ) {
        return invalid(state, intent);
      }

      if (state.profileProvided === null) {
        return evolve(state, { phase: PHASES.PROFILE_QUESTIONS }, [
          event("profile_questions_ready"),
        ]);
      }

      return evolve(state, { phase: PHASES.RESULTS_INTRO }, [
        event("results_intro_ready", {
          results: buildResultsIntro(state.completedMeasurements),
        }),
      ]);

    case "resume_measurements":
      if (
        !isResultPhase(state.phase) ||
        state.completedZones.length === 0 ||
        state.completedZones.length === 4
      ) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.SCAN_SELECTION }, [
        event("measurements_resume_ready"),
      ]);

    case "show_results_overview":
      if (
        state.phase !== PHASES.RESULTS_INTRO &&
        !RESULT_PHASES.has(state.phase)
      ) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.RESULTS_OVERVIEW }, [
        event("results_view_ready", { view: "overview" }),
      ]);

    case "open_category":
    case "open_category_table": {
      if (!isResultPhase(state.phase)) return invalid(state, intent);
      if (!isKnownMeasurement(category)) {
        return invalidPayload(state, `Неизвестная category "${category}".`);
      }
      if (!state.completedMeasurements.includes(category)) {
        return invalid(
          state,
          intent,
          `Категория "${category}" недоступна без завершённого замера.`,
        );
      }

      const view =
        intent === "open_category" ? "category_cards" : "category_table";

      return evolve(
        state,
        {
          phase:
            intent === "open_category"
              ? PHASES.CATEGORY_CARDS
              : PHASES.CATEGORY_TABLE,
        },
        [event("results_view_ready", { view, category })],
      );
    }

    case "show_all_deviations":
      if (!isResultPhase(state.phase)) return invalid(state, intent);

      return evolve(state, { phase: PHASES.ALL_DEVIATIONS }, [
        event("results_view_ready", { view: "all_deviations" }),
      ]);

    case "show_all_indicators":
      if (!isResultPhase(state.phase)) return invalid(state, intent);

      return evolve(state, { phase: PHASES.ALL_INDICATORS }, [
        event("results_view_ready", { view: "all_indicators" }),
      ]);

    case "save_results":
      if (!isResultPhase(state.phase)) return invalid(state, intent);

      return evolve(state, { phase: PHASES.QR }, [
        event("qr", { svg: QR_SVG }),
        event("results_view_ready", { view: "qr" }),
      ]);

    case "finish_session":
      if (state.phase === PHASES.MEASUREMENTS_DECLINED) {
        return evolve(state, { phase: PHASES.EXITED }, [
          event("session_exit_without_measurements"),
        ]);
      }
      if (!isResultPhase(state.phase)) return invalid(state, intent);

      return evolve(
        state,
        { phase: PHASES.EXITED },
        state.phase === PHASES.QR
          ? [event("session_exit_with_measurements")]
          : [
              event("qr", { svg: QR_SVG }),
              event("session_exit_with_measurements"),
            ],
      );

    default:
      return {
        state,
        events: [
          fail(state.sessionId, "unknown_intent", `Неизвестный intent "${intent}".`),
        ],
      };
  }
};

module.exports = {
  PHASES,
  RESULT_PHASES,
  createScenarioState,
  transitionScenario,
};
