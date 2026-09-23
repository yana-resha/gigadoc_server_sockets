const http = require("http");

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const { WebSocketServer, WebSocket } = require("ws");

const { createOpenApiDocument } = require("./lib/openapi");
const {
  MEASUREMENT_PLAN,
  buildMeasurementSnapshot,
  buildMeasurementResults,
  buildParamsMessage,
  buildResultsIntro,
  buildTechMessage,
  ok,
} = require("./lib/protocol");
const {
  PHASES,
  createScenarioState,
  transitionScenario,
} = require("./lib/state-machine");

const PORT = Number(process.env.PORT) || 8081;
const HOST = "127.0.0.1";
const WEBSOCKET_PATH = "/ws/frontend/v1";

const FACE_IN_AREA_DELAY_MS = 1_000;
const SESSION_RESTART_DELAY_MS = 250;
const USER_SPEECH_DURATION_MS = 2_000;
const THINKING_DURATION_MS = 2_000;
const MEASUREMENT_START_DELAY_MS = 1_000;
const MEASUREMENT_RESULTS_DELAY_MS = 5_000;

let sessionCounter = 0;
const clients = new Map();

const createSessionId = () => {
  sessionCounter += 1;

  return `vsp-mock-${Date.now()}-${sessionCounter}`;
};

const sendJson = (socket, message) => {
  if (socket.readyState !== WebSocket.OPEN) return false;

  socket.send(JSON.stringify(message));
  console.log("➡️ ", message);

  return true;
};

const MICROPHONE_TEXT_BY_EVENT = {
  scan_intro_ready: "Начинаем?",
  profile_questions_ready: "Скажите, пожалуйста, ваш пол",
  scan_selection_ready: "С какого начнём?",
  measurements_declined: "Спрашивайте про здоровье — отвечу",
  session_exit_without_measurements: "Хорошего дня",
  measurement_selected: "Начинаем, когда будете готовы",
  measurement_started: "Ожидаю результат сканирования",
  measurement_results_ready: "Результаты замеров готовы",
  results_intro_ready: "Можно задать любой вопрос о здоровье",
  session_exit_with_measurements: "Хорошего дня",
};

const microphoneTextForEvent = (event) => {
  if (event.type === "results_view_ready") {
    return {
      overview: "Результаты готовы",
      category_cards: "Показатели",
      category_table: "Показатели",
      all_deviations: "Отклонения показателей",
      all_indicators: "Все показатели",
      qr: "Наведите камеру телефона",
    }[event.view];
  }

  if (event.type === "qr") return "Наведите камеру телефона";

  return MICROPHONE_TEXT_BY_EVENT[event.type];
};

const sendMicrophoneText = (socket, client, text) => {
  client.subtitleSequence += 1;

  return sendJson(socket, {
    status: "ok",
    type: "voice_subtitle",
    turn_id: `mock-subtitle-${client.sessionId ?? "idle"}-${client.subtitleSequence}`,
    sentence_index: 1,
    text,
  });
};

const sendScenarioEvent = (socket, client, event) => {
  const text = microphoneTextForEvent(event);
  if (text !== undefined) sendMicrophoneText(socket, client, text);

  return sendJson(socket, event);
};

const sendEvents = (socket, client, events) => {
  events.forEach((event) => sendScenarioEvent(socket, client, event));
};

const buildMeasurementResultsSpeechKey = (completedMeasurements) =>
  JSON.stringify({
    skin: completedMeasurements.has("skin"),
    heart_and_vessels: completedMeasurements.has("heart_and_vessels"),
    vision: completedMeasurements.has("vision"),
  });

const clearTimers = (client) => {
  client.timers.forEach(clearTimeout);
  client.timers.clear();
};

const resetLegacyFlow = (client) => {
  client.controlMode = null;
  client.cycleStarted = false;
  client.faceInAreaSent = false;
  client.postGreetingFlowStarted = false;
  client.scanIntroShown = false;
  client.postScanIntroFlowStarted = false;
  client.profileQuestionsShown = false;
  client.postProfileQuestionsFlowStarted = false;
  client.postScanSelectionFlowStarted = false;
  client.postDeclineFlowStarted = false;
  client.declineMeasurements = false;
  client.activeMeasurement = null;
  client.measurementStarted = false;
  client.completedMeasurements.clear();
  client.awaitingResultsSpeechKey = null;
  client.resultsIntroSent = false;
  client.resultsIntroAcknowledged = false;
  client.snapshotRevision = 0;
};

const sendMeasurementSnapshot = (socket, client, completedMeasurements) => {
  client.snapshotRevision += 1;

  return sendJson(
    socket,
    buildMeasurementSnapshot(
      client.sessionId,
      completedMeasurements,
      client.snapshotRevision,
    ),
  );
};

const resetClientSession = (socket) => {
  const client = clients.get(socket);
  if (!client) return false;

  clearTimers(client);
  resetLegacyFlow(client);
  client.sessionId = null;
  client.scenario = null;

  sendMicrophoneText(socket, client, null);

  return sendJson(socket, buildTechMessage(null));
};

const schedule = (client, callback, delayMs) => {
  const timer = setTimeout(() => {
    client.timers.delete(timer);
    callback();
  }, delayMs);

  client.timers.add(timer);
};

const startMockUserTurn = (socket, client, onComplete) => {
  sendJson(
    socket,
    buildTechMessage(client.sessionId, {
      face_in_area: true,
      mic_on: true,
      mic_in_progress: true,
    }),
  );

  schedule(
    client,
    () => {
      sendJson(
        socket,
        buildTechMessage(client.sessionId, {
          face_in_area: true,
          mic_on: true,
          i_am_thinking: true,
        }),
      );
      schedule(client, onComplete, THINKING_DURATION_MS);
    },
    USER_SPEECH_DURATION_MS,
  );
};

const setVoicePhase = (client, phase, updates = {}) => {
  client.scenario = {
    ...client.scenario,
    phase,
    ...updates,
  };
};

const selectMeasurement = (socket, client, measurement) => {
  client.activeMeasurement = measurement;
  client.measurementStarted = false;
  setVoicePhase(client, PHASES.MEASUREMENT_SELECTED, {
    activeMeasurement: measurement,
  });
  sendScenarioEvent(
    socket,
    client,
    ok(client.sessionId, "measurement_selected", { measurement }),
  );
};

const startCycle = (socket, declineMeasurements = false) => {
  const client = clients.get(socket);
  if (!client || socket.readyState !== WebSocket.OPEN) return null;

  clearTimers(client);
  resetLegacyFlow(client);
  client.sessionId = createSessionId();
  client.scenario = createScenarioState(client.sessionId);
  client.controlMode = "voice";
  client.cycleStarted = true;
  client.declineMeasurements = declineMeasurements;

  sendJson(socket, buildTechMessage(client.sessionId));
  sendMeasurementSnapshot(socket, client, []);
  schedule(
    client,
    () => {
      client.faceInAreaSent = true;
      sendJson(
        socket,
        buildTechMessage(client.sessionId, { face_in_area: true }),
      );
      sendMicrophoneText(socket, client, "Хотите измериться?");
    },
    FACE_IN_AREA_DELAY_MS,
  );

  console.log(`🎬 Cycle запущен для сессии ${client.sessionId}`);

  return client.sessionId;
};

const restartCycle = async (socket, declineMeasurements = false) => {
  const client = clients.get(socket);
  if (!client) return null;

  resetClientSession(socket);
  client.restartVersion += 1;
  const restartVersion = client.restartVersion;

  await new Promise((resolve) => setTimeout(resolve, SESSION_RESTART_DELAY_MS));
  if (client.restartVersion !== restartVersion) return null;

  return startCycle(socket, declineMeasurements);
};

const handleMockUserIntent = (socket, client, payload) => {
  if (payload?.intent === "clear_microphone_text") {
    sendMicrophoneText(socket, client, null);

    return;
  }

  if (client.controlMode !== "intent") {
    clearTimers(client);
    client.controlMode = "intent";
  }

  const previousSessionId = client.scenario?.sessionId ?? null;
  const result = transitionScenario(client.scenario, payload, {
    createSessionId,
  });

  if (
    payload?.intent === "restart_session" &&
    result.state.sessionId !== previousSessionId
  ) {
    clearTimers(client);
    resetLegacyFlow(client);
    client.controlMode = "intent";
    client.cycleStarted = true;
    client.faceInAreaSent = true;
  }

  client.scenario = result.state;
  client.sessionId = result.state?.sessionId ?? null;
  sendEvents(socket, client, result.events);
  if (
    result.events.some((event) =>
      ["measurement_results_ready", "measurement_reset"].includes(event.type),
    )
  ) {
    sendMeasurementSnapshot(socket, client, result.state.completedMeasurements);
  }
  if (payload?.intent === "restart_session" && result.state?.sessionId) {
    sendMicrophoneText(socket, client, "Хотите измериться?");
  }
};

const openApiDocument = createOpenApiDocument({
  host: HOST,
  port: PORT,
  webSocketPath: WEBSOCKET_PATH,
});

const app = express();

app.get("/", (_request, response) => {
  response.json({
    status: "ok",
    websocket: `ws://${HOST}:${PORT}${WEBSOCKET_PATH}`,
    swagger: `http://${HOST}:${PORT}/api-docs`,
  });
});

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

const getConnectedSockets = () =>
  [...clients.keys()].filter((socket) => socket.readyState === WebSocket.OPEN);

app.get("/cycle", async (_request, response) => {
  const connectedSockets = getConnectedSockets();

  if (connectedSockets.length === 0) {
    response.status(409).json({
      status: "frontend_not_connected",
      message:
        "Сначала подключите frontend к WebSocket, затем повторно вызовите /cycle.",
    });

    return;
  }

  const sessionIds = (
    await Promise.all(connectedSockets.map((socket) => restartCycle(socket)))
  ).filter(Boolean);

  response.json({
    status: "started",
    clients: sessionIds.length,
    session_ids: sessionIds,
  });
});

app.post("/decline-measurements", async (_request, response) => {
  const connectedSockets = getConnectedSockets();

  if (connectedSockets.length === 0) {
    response.status(409).json({
      status: "frontend_not_connected",
      message:
        "Сначала подключите frontend к WebSocket, затем повторно вызовите /decline-measurements.",
    });

    return;
  }

  const sessionIds = (
    await Promise.all(
      connectedSockets.map((socket) => restartCycle(socket, true)),
    )
  ).filter(Boolean);

  response.json({
    status: "started",
    scenario: "measurements_declined",
    clients: sessionIds.length,
    session_ids: sessionIds,
  });
});

app.post("/reset", (_request, response) => {
  const resetClients = getConnectedSockets().filter(resetClientSession).length;

  console.log(`Сброшено сессий: ${resetClients}`);
  response.json({ status: "reset", clients: resetClients });
});

const server = http.createServer(app);
const webSocketServer = new WebSocketServer({
  server,
  path: WEBSOCKET_PATH,
});

webSocketServer.on("connection", (socket) => {
  const client = {
    restartVersion: 0,
    sessionId: null,
    scenario: null,
    timers: new Set(),
    completedMeasurements: new Set(),
    subtitleSequence: 0,
  };
  resetLegacyFlow(client);
  clients.set(socket, client);
  console.log("✅ Frontend подключён и ожидает запуска /cycle");

  socket.on("message", (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      console.warn("⚠️ Frontend прислал невалидный JSON");

      return;
    }

    console.log("⬅️ ", message);

    if (message?.type === "mock_user_intent") {
      handleMockUserIntent(socket, client, message.payload);

      return;
    }

    if (
      message?.type !== "avatar_state" ||
      client.controlMode !== "voice" ||
      !client.cycleStarted ||
      !client.faceInAreaSent
    ) {
      return;
    }

    const greetingFinished = message.payload?.greeted === true;
    const scanIntroFinished = message.payload?.scanIntroSpoken === true;
    const profileQuestionsFinished =
      message.payload?.profileQuestionsSpoken === true;
    const scanSelectionFinished = message.payload?.scanSelectionSpoken === true;
    const measurementsDeclinedFinished =
      message.payload?.measurementsDeclinedSpoken === true;
    const measurementInstructionFinished =
      message.payload?.measurementInstructionSpoken === true;
    const measurementInstructionSpokenFor =
      message.payload?.measurementInstructionSpokenFor;
    const measurementResultsSpokenKey =
      message.payload?.measurementResultsSpokenKey;
    const resultsIntroSpoken = message.payload?.resultsIntroSpoken === true;

    if (greetingFinished && !client.postGreetingFlowStarted) {
      client.postGreetingFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        if (client.declineMeasurements) {
          setVoicePhase(client, PHASES.MEASUREMENTS_DECLINED);
          sendJson(
            socket,
            buildTechMessage(client.sessionId, {
              face_in_area: true,
              mic_on: true,
            }),
          );
          sendScenarioEvent(socket, client, ok(client.sessionId, "measurements_declined"));

          return;
        }

        client.scanIntroShown = true;
        setVoicePhase(client, PHASES.SCAN_INTRO);
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendScenarioEvent(socket, client, ok(client.sessionId, "scan_intro_ready"));
      });

      return;
    }

    if (
      measurementsDeclinedFinished &&
      client.declineMeasurements &&
      !client.postDeclineFlowStarted
    ) {
      client.postDeclineFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        setVoicePhase(client, PHASES.EXITED);
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendScenarioEvent(
          socket,
          client,
          ok(client.sessionId, "session_exit_without_measurements"),
        );
      });

      return;
    }

    if (
      scanIntroFinished &&
      client.scanIntroShown &&
      !client.postScanIntroFlowStarted
    ) {
      client.postScanIntroFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        client.profileQuestionsShown = true;
        setVoicePhase(client, PHASES.PROFILE_QUESTIONS);
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendScenarioEvent(socket, client, ok(client.sessionId, "profile_questions_ready"));
      });

      return;
    }

    if (
      profileQuestionsFinished &&
      client.profileQuestionsShown &&
      !client.postProfileQuestionsFlowStarted
    ) {
      client.postProfileQuestionsFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        setVoicePhase(client, PHASES.SCAN_SELECTION);
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendScenarioEvent(socket, client, ok(client.sessionId, "scan_selection_ready"));
      });

      return;
    }

    if (scanSelectionFinished && !client.postScanSelectionFlowStarted) {
      client.postScanSelectionFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        selectMeasurement(socket, client, MEASUREMENT_PLAN[0]);
      });

      return;
    }

    if (
      measurementInstructionFinished &&
      client.activeMeasurement &&
      measurementInstructionSpokenFor === client.activeMeasurement &&
      !client.measurementStarted
    ) {
      client.measurementStarted = true;
      const measuredType = client.activeMeasurement;
      setVoicePhase(client, PHASES.MEASUREMENT_IN_PROGRESS);

      schedule(
        client,
        () => {
          sendScenarioEvent(
            socket,
            client,
            ok(client.sessionId, "measurement_started", {
              measurement: measuredType,
            }),
          );

          schedule(
            client,
            () => {
              client.completedMeasurements.add(measuredType);
              const completedMeasurements = [
                ...client.completedMeasurements,
              ];
              client.awaitingResultsSpeechKey =
                buildMeasurementResultsSpeechKey(client.completedMeasurements);
              client.activeMeasurement = null;
              client.measurementStarted = false;
              setVoicePhase(client, PHASES.MEASUREMENT_RESULTS, {
                activeMeasurement: null,
                completedMeasurements,
              });

              sendJson(
                socket,
                buildParamsMessage(client.sessionId, completedMeasurements),
              );
              sendMeasurementSnapshot(socket, client, completedMeasurements);
              sendScenarioEvent(
                socket,
                client,
                ok(client.sessionId, "measurement_results_ready", {
                  results: buildMeasurementResults(completedMeasurements),
                }),
              );
            },
            MEASUREMENT_RESULTS_DELAY_MS,
          );
        },
        MEASUREMENT_START_DELAY_MS,
      );

      return;
    }

    if (
      client.awaitingResultsSpeechKey &&
      measurementResultsSpokenKey === client.awaitingResultsSpeechKey &&
      !client.resultsIntroSent
    ) {
      client.awaitingResultsSpeechKey = null;
      client.resultsIntroSent = true;

      startMockUserTurn(socket, client, () => {
        const completedMeasurements = [...client.completedMeasurements];
        setVoicePhase(client, PHASES.RESULTS_INTRO, {
          completedMeasurements,
        });
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendScenarioEvent(
          socket,
          client,
          ok(client.sessionId, "results_intro_ready", {
            results: buildResultsIntro(completedMeasurements),
          }),
        );
      });

      return;
    }

    if (
      resultsIntroSpoken &&
      client.resultsIntroSent &&
      !client.resultsIntroAcknowledged
    ) {
      client.resultsIntroAcknowledged = true;
      console.log(
        `✅ Вводная по результатам озвучена для сессии ${client.sessionId}`,
      );
    }
  });

  socket.on("close", () => {
    clearTimers(client);
    clients.delete(socket);
    console.log(
      `👋 Frontend отключён${client.sessionId ? `, сессия ${client.sessionId} завершена` : ""}`,
    );
  });

  socket.on("error", (error) => {
    console.error(
      `❌ WebSocket${client.sessionId ? ` ${client.sessionId}` : ""}:`,
      error,
    );
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 VSP WebSocket stub: ws://${HOST}:${PORT}${WEBSOCKET_PATH}`);
  console.log(`📚 Swagger: http://${HOST}:${PORT}/api-docs`);
  console.log(`🎬 Запуск сценария: http://${HOST}:${PORT}/cycle`);
  console.log(
    `⏭️ Отказ от замеров: POST http://${HOST}:${PORT}/decline-measurements`,
  );
  console.log(`🧹 Сброс сессии: POST http://${HOST}:${PORT}/reset`);
});
