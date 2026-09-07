const http = require("http");

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8000;
const HOST = "127.0.0.1";
const WEBSOCKET_PATH = "/ws_process";

const FACE_IN_AREA_DELAY_MS = 1_000;
const USER_SPEECH_DURATION_MS = 2_000;
const THINKING_DURATION_MS = 2_000;
const MEASUREMENT_START_DELAY_MS = 1_000;
const MEASUREMENT_RESULTS_DELAY_MS = 5_000;
const NEXT_MEASUREMENT_DELAY_MS = 1_000;
const MEASUREMENT_PLAN = ["skin", "heart_and_vessels", "vision"];

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

const buildTechMessage = (sessionId, overrides = {}) => ({
  status: "ok",
  type: "tech",
  session_id: sessionId,
  face_in_area: false,
  mic_on: false,
  mic_in_progress: false,
  i_am_thinking: false,
  ...overrides,
});

const buildScenarioEvent = (sessionId, type) => ({
  status: "ok",
  type,
  session_id: sessionId,
});

const buildMeasurementEvent = (sessionId, type, payload) => ({
  status: "ok",
  type,
  session_id: sessionId,
  ...payload,
});

const buildMeasurementResults = (completedMeasurements) =>
  MEASUREMENT_PLAN.map((type) => ({
    type,
    completed: completedMeasurements.has(type),
  }));

const buildMeasurementResultsSpeechKey = (completedMeasurements) =>
  JSON.stringify({
    skin: completedMeasurements.has("skin"),
    heart_and_vessels: completedMeasurements.has("heart_and_vessels"),
    vision: completedMeasurements.has("vision"),
  });

const selectMeasurement = (socket, client, measurement) => {
  client.activeMeasurement = measurement;
  client.measurementStarted = false;
  sendJson(
    socket,
    buildMeasurementEvent(client.sessionId, "measurement_selected", {
      measurement,
    }),
  );
};

const clearTimers = (client) => {
  client.timers.forEach(clearTimeout);
  client.timers.clear();
};

const resetClientSession = (socket) => {
  const client = clients.get(socket);
  if (!client) return false;

  clearTimers(client);
  client.sessionId = null;
  client.cycleStarted = false;
  client.faceInAreaSent = false;
  client.postGreetingFlowStarted = false;
  client.scanIntroShown = false;
  client.postScanIntroFlowStarted = false;
  client.postScanSelectionFlowStarted = false;
  client.activeMeasurement = null;
  client.measurementStarted = false;
  client.completedMeasurements.clear();
  client.awaitingResultsSpeechKey = null;

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

const startCycle = (socket) => {
  const client = clients.get(socket);
  if (!client || socket.readyState !== WebSocket.OPEN) return null;

  clearTimers(client);
  client.sessionId = createSessionId();
  client.cycleStarted = true;
  client.faceInAreaSent = false;
  client.postGreetingFlowStarted = false;
  client.scanIntroShown = false;
  client.postScanIntroFlowStarted = false;
  client.postScanSelectionFlowStarted = false;
  client.activeMeasurement = null;
  client.measurementStarted = false;
  client.completedMeasurements.clear();
  client.awaitingResultsSpeechKey = null;

  sendJson(socket, buildTechMessage(client.sessionId));

  schedule(
    client,
    () => {
      client.faceInAreaSent = true;
      sendJson(
        socket,
        buildTechMessage(client.sessionId, {
          face_in_area: true,
        }),
      );
    },
    FACE_IN_AREA_DELAY_MS,
  );

  console.log(`🎬 Cycle запущен для сессии ${client.sessionId}`);

  return client.sessionId;
};

const openApiDocument = {
  openapi: "3.0.0",
  info: {
    title: "VSP Frontend Stub",
    version: "1.0.0",
    description:
      "Минимальный event-driven WebSocket mock-backend для сценария VSP.",
  },
  servers: [{ url: `http://${HOST}:${PORT}` }],
  paths: {
    "/cycle": {
      get: {
        tags: ["Scenario"],
        summary: "Запустить полный mock-сценарий",
        description:
          "Создаёт новую сессию, отдельными events переключает экраны, имитирует выбор skin, запуск замера и готовность результатов.",
        responses: {
          200: {
            description:
              "Сценарий запущен для всех подключённых WebSocket-клиентов.",
          },
          409: {
            description:
              "Нет подключённых WebSocket-клиентов. Сценарий не запущен.",
          },
        },
      },
    },
    "/reset": {
      post: {
        tags: ["Scenario"],
        summary: "Сбросить текущую mock-сессию",
        description:
          "Отменяет ожидающие события, очищает состояние сценария и возвращает подключённый frontend на стартовый экран. WebSocket-соединение остаётся открытым.",
        responses: {
          200: {
            description:
              "Сессии всех подключённых WebSocket-клиентов сброшены.",
          },
        },
      },
    },
  },
};

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

app.get("/cycle", (_request, response) => {
  const connectedSockets = [...clients.keys()].filter(
    (socket) => socket.readyState === WebSocket.OPEN,
  );

  if (connectedSockets.length === 0) {
    response.status(409).json({
      status: "frontend_not_connected",
      message:
        "Сначала подключите frontend к WebSocket, затем повторно вызовите /cycle.",
    });

    return;
  }

  const sessionIds = connectedSockets.map(startCycle).filter(Boolean);

  response.json({
    status: "started",
    clients: sessionIds.length,
    session_ids: sessionIds,
  });
});

app.post("/reset", (_request, response) => {
  const connectedSockets = [...clients.keys()].filter(
    (socket) => socket.readyState === WebSocket.OPEN,
  );
  const resetClients = connectedSockets.filter(resetClientSession).length;

  console.log(`Сброшено сессий: ${resetClients}`);

  response.json({
    status: "reset",
    clients: resetClients,
  });
});

const server = http.createServer(app);
const webSocketServer = new WebSocketServer({
  server,
  path: WEBSOCKET_PATH,
});

webSocketServer.on("connection", (socket) => {
  const client = {
    cycleStarted: false,
    faceInAreaSent: false,
    postGreetingFlowStarted: false,
    scanIntroShown: false,
    postScanIntroFlowStarted: false,
    postScanSelectionFlowStarted: false,
    activeMeasurement: null,
    measurementStarted: false,
    completedMeasurements: new Set(),
    awaitingResultsSpeechKey: null,
    sessionId: null,
    timers: new Set(),
  };

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

    if (
      message?.type !== "avatar_state" ||
      !client.cycleStarted ||
      !client.faceInAreaSent
    ) {
      return;
    }

    const greetingFinished = message.payload?.greeted === true;
    const scanIntroFinished = message.payload?.scanIntroSpoken === true;
    const scanSelectionFinished = message.payload?.scanSelectionSpoken === true;
    const measurementInstructionFinished =
      message.payload?.measurementInstructionSpoken === true;
    const measurementInstructionSpokenFor =
      message.payload?.measurementInstructionSpokenFor;
    const measurementResultsSpokenKey =
      message.payload?.measurementResultsSpokenKey;

    if (greetingFinished && !client.postGreetingFlowStarted) {
      client.postGreetingFlowStarted = true;

      startMockUserTurn(socket, client, () => {
        client.scanIntroShown = true;
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendJson(
          socket,
          buildScenarioEvent(client.sessionId, "scan_intro_ready"),
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
        sendJson(
          socket,
          buildTechMessage(client.sessionId, {
            face_in_area: true,
            mic_on: true,
          }),
        );
        sendJson(
          socket,
          buildScenarioEvent(client.sessionId, "scan_selection_ready"),
        );
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

      schedule(
        client,
        () => {
          sendJson(
            socket,
            buildMeasurementEvent(client.sessionId, "measurement_started", {
              measurement: measuredType,
            }),
          );

          schedule(
            client,
            () => {
              client.completedMeasurements.add(measuredType);
              const results = buildMeasurementResults(
                client.completedMeasurements,
              );
              client.awaitingResultsSpeechKey =
                buildMeasurementResultsSpeechKey(client.completedMeasurements);
              client.activeMeasurement = null;
              client.measurementStarted = false;

              sendJson(
                socket,
                buildMeasurementEvent(
                  client.sessionId,
                  "measurement_results_ready",
                  {
                    results,
                  },
                ),
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
      measurementResultsSpokenKey === client.awaitingResultsSpeechKey
    ) {
      client.awaitingResultsSpeechKey = null;
      const nextMeasurement = MEASUREMENT_PLAN.find(
        (measurement) => !client.completedMeasurements.has(measurement),
      );

      if (!nextMeasurement) {
        console.log(
          `✅ Все mock-замеры завершены для сессии ${client.sessionId}`,
        );

        return;
      }

      schedule(
        client,
        () => selectMeasurement(socket, client, nextMeasurement),
        NEXT_MEASUREMENT_DELAY_MS,
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
  console.log(`🧹 Сброс сессии: POST http://${HOST}:${PORT}/reset`);
});
