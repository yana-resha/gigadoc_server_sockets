const MOCK_INTENTS = [
  "begin_measurements",
  "decline_measurements",
  "begin_profile_questions",
  "continue_with_profile",
  "continue_without_profile",
  "select_measurement",
  "start_measurement",
  "complete_measurement",
  "reset_measurement",
  "finish_measurements",
  "resume_measurements",
  "show_results_overview",
  "open_category",
  "open_category_table",
  "show_all_deviations",
  "show_all_indicators",
  "save_results",
  "finish_session",
  "restart_session",
  "clear_microphone_text",
];

const MEASUREMENTS = ["skin", "heart_and_vessels", "vision"];

const createOpenApiDocument = ({ host, port, webSocketPath }) => ({
  openapi: "3.0.0",
  info: {
    title: "VSP Frontend Stub",
    version: "2.0.0",
    description:
      "Event-driven WebSocket mock VSP. Полный ручной сценарий управляется сообщениями mock_user_intent.",
  },
  servers: [{ url: `http://${host}:${port}` }],
  paths: {
    "/cycle": {
      get: {
        tags: ["Scenario"],
        summary: "Запустить голосовой mock-сценарий",
        description:
          "Запускает серверный mock-сценарий с сообщениями состояния и таймерами.",
        responses: {
          200: { description: "Сценарий запущен." },
          409: { description: "Нет подключённых WebSocket-клиентов." },
        },
      },
    },
    "/decline-measurements": {
      post: {
        tags: ["Scenario"],
        summary: "Запустить голосовой сценарий отказа",
        responses: {
          200: { description: "Сценарий отказа запущен." },
          409: { description: "Нет подключённых WebSocket-клиентов." },
        },
      },
    },
    "/reset": {
      post: {
        tags: ["Scenario"],
        summary: "Сбросить активные mock-сессии",
        responses: {
          200: { description: "Активные сессии сброшены." },
        },
      },
    },
  },
  components: {
    schemas: {
      Measurement: { type: "string", enum: MEASUREMENTS },
      MockUserIntent: { type: "string", enum: MOCK_INTENTS },
      MockUserIntentMessage: {
        type: "object",
        required: ["type", "payload"],
        properties: {
          type: { type: "string", enum: ["mock_user_intent"] },
          payload: {
            type: "object",
            required: ["intent"],
            properties: {
              intent: { $ref: "#/components/schemas/MockUserIntent" },
              session_id: { type: "string", nullable: true },
              data: {
                type: "object",
                properties: {
                  measurement: { $ref: "#/components/schemas/Measurement" },
                  category: { $ref: "#/components/schemas/Measurement" },
                },
              },
            },
          },
        },
      },
      ResultsViewReady: {
        type: "object",
        required: ["status", "type", "session_id", "view"],
        properties: {
          status: { type: "string", enum: ["ok"] },
          type: { type: "string", enum: ["results_view_ready"] },
          session_id: { type: "string" },
          view: {
            type: "string",
            enum: [
              "overview",
              "category_cards",
              "category_table",
              "all_deviations",
              "all_indicators",
              "qr",
            ],
          },
          category: { $ref: "#/components/schemas/Measurement" },
        },
      },
      MeasurementsResumeReady: {
        type: "object",
        required: ["status", "type", "session_id"],
        properties: {
          status: { type: "string", enum: ["ok"] },
          type: { type: "string", enum: ["measurements_resume_ready"] },
          session_id: { type: "string" },
        },
      },
      SessionExitWithMeasurements: {
        type: "object",
        required: ["status", "type", "session_id"],
        properties: {
          status: { type: "string", enum: ["ok"] },
          type: {
            type: "string",
            enum: ["session_exit_with_measurements"],
          },
          session_id: { type: "string" },
        },
      },
      IntentFailure: {
        type: "object",
        required: ["status", "type", "error_code", "error_text"],
        properties: {
          status: { type: "string", enum: ["fail"] },
          type: { type: "string", enum: ["mock_user_intent"] },
          session_id: { type: "string", nullable: true },
          error_code: {
            type: "string",
            enum: [
              "invalid_transition",
              "invalid_payload",
              "session_mismatch",
              "unknown_intent",
            ],
          },
          error_text: { type: "string" },
        },
      },
    },
  },
  "x-websocket": {
    url: `ws://${host}:${port}${webSocketPath}`,
    incoming: {
      avatar_state:
        "Runtime-состояние аватара; не управляет сценарием и не подтверждает реплики.",
      mock_user_intent: {
        schema: { $ref: "#/components/schemas/MockUserIntentMessage" },
        description:
          "Мгновенный управляемый путь без ожидания речи и таймеров. Переданный session_id обязан совпадать с активной сессией.",
      },
    },
    outgoing: {
      existing:
        "tech, measurement_snapshot, scan_intro_ready, profile_questions_ready, scan_selection_ready, measurements_declined, session_exit_without_measurements, measurement_selected, measurement_started, measurement_results_ready, measurement_reset, results_intro_ready, qr",
      added: [
        { $ref: "#/components/schemas/ResultsViewReady" },
        { $ref: "#/components/schemas/MeasurementsResumeReady" },
        { $ref: "#/components/schemas/SessionExitWithMeasurements" },
        { $ref: "#/components/schemas/IntentFailure" },
      ],
    },
  },
});

module.exports = { MOCK_INTENTS, createOpenApiDocument };
