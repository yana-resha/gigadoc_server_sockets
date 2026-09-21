const {
  BLACK_SQUARE_SVG,
  MEASUREMENT_PLAN,
  buildMeasurementResults,
  buildParamsMessage,
  buildResultsIntro,
  buildTechMessage,
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

const hasSessionId = (payload) =>
  Object.prototype.hasOwnProperty.call(payload, "session_id") &&
  payload.session_id != null;

const transitionScenario = (state, payload, options = {}) => {
  if (!payload || typeof payload.intent !== "string") {
    return invalidPayload(state, "payload.intent должен быть строкой.");
  }

  const { intent } = payload;

  if (
    state?.sessionId &&
    hasSessionId(payload) &&
    payload.session_id !== state.sessionId
  ) {
    return {
      state,
      events: [
        fail(
          state.sessionId,
          "session_mismatch",
          `Ожидалась session_id "${state.sessionId}".`,
        ),
      ],
    };
  }

  if (intent === "restart_session") {
    if (typeof options.createSessionId !== "function") {
      return invalidPayload(state, "Для restart_session не задан генератор session_id.");
    }

    const nextState = createScenarioState(options.createSessionId());

    return {
      state: nextState,
      events: [
        buildTechMessage(null),
        buildTechMessage(nextState.sessionId, { face_in_area: true }),
      ],
    };
  }

  if (
    !state?.sessionId &&
    ["begin_measurements", "decline_measurements"].includes(intent)
  ) {
    if (typeof options.createSessionId !== "function") {
      return invalidPayload(state, "Для запуска не задан генератор session_id.");
    }

    const nextState = createScenarioState(options.createSessionId());
    const started = transitionScenario(nextState, payload, options);

    return {
      state: started.state,
      events: [
        buildTechMessage(nextState.sessionId, { face_in_area: true }),
        ...started.events,
      ],
    };
  }

  if (!state?.sessionId) {
    return invalid(state, intent, "Сначала запустите /cycle или отправьте restart_session.");
  }

  const event = (type, data) => ok(state.sessionId, type, data);
  const measurement = payload.data?.measurement;
  const category = payload.data?.category;

  switch (intent) {
    case "begin_measurements":
      if (state.phase !== PHASES.START) return invalid(state, intent);

      return evolve(state, { phase: PHASES.SCAN_INTRO }, [
        event("scan_intro_ready"),
      ]);

    case "decline_measurements":
      if (![PHASES.START, PHASES.SCAN_INTRO].includes(state.phase)) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.MEASUREMENTS_DECLINED }, [
        event("measurements_declined"),
      ]);

    case "begin_profile_questions":
      if (state.phase !== PHASES.SCAN_INTRO) return invalid(state, intent);

      return evolve(state, { phase: PHASES.PROFILE_QUESTIONS }, [
        event("profile_questions_ready"),
      ]);

    case "continue_with_profile":
    case "continue_without_profile":
      if (state.phase !== PHASES.PROFILE_QUESTIONS) return invalid(state, intent);

      return evolve(
        state,
        {
          phase: PHASES.SCAN_SELECTION,
          profileProvided: intent === "continue_with_profile",
        },
        [event("scan_selection_ready")],
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
      if (state.completedMeasurements.includes(measurement)) {
        return invalid(state, intent, `Замер "${measurement}" уже завершён.`);
      }

      return evolve(
        state,
        { phase: PHASES.MEASUREMENT_SELECTED, activeMeasurement: measurement },
        [event("measurement_selected", { measurement })],
      );

    case "start_measurement":
      if (state.phase !== PHASES.MEASUREMENT_SELECTED) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.MEASUREMENT_IN_PROGRESS }, [
        event("measurement_started", {
          measurement: state.activeMeasurement,
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

      const completedMeasurements = [
        ...new Set([...state.completedMeasurements, state.activeMeasurement]),
      ];

      return evolve(
        state,
        {
          phase: PHASES.MEASUREMENT_RESULTS,
          activeMeasurement: null,
          completedMeasurements,
        },
        [
          buildParamsMessage(state.sessionId, completedMeasurements),
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
        state.completedMeasurements.length === 0
      ) {
        return invalid(state, intent);
      }

      return evolve(state, { phase: PHASES.RESULTS_INTRO }, [
        event("results_intro_ready", {
          results: buildResultsIntro(state.completedMeasurements),
        }),
      ]);

    case "resume_measurements":
      if (
        !isResultPhase(state.phase) ||
        state.completedMeasurements.length === 0 ||
        state.completedMeasurements.length === MEASUREMENT_PLAN.length
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
        event("qr", { svg: BLACK_SQUARE_SVG }),
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
              event("qr", { svg: BLACK_SQUARE_SVG }),
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
