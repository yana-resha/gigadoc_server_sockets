const http = require("http");

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const { WebSocketServer, WebSocket } = require("ws");

const {
  buildMeasurementSnapshot,
  buildTechMessage,
} = require("./lib/protocol");
const { createOpenApiDocument } = require("./lib/openapi");
const { createScenarioState, transitionScenario } = require("./lib/state-machine");

const PORT = Number(process.env.PORT) || 8081;
const HOST = "127.0.0.1";
const WEBSOCKET_PATH = "/ws/frontend/v1";
const GREETING_DELAY_MS = 1_000;
const SESSION_RESTART_DELAY_MS = 250;

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

  return {
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
    qr: "Наведите камеру телефона",
  }[event.type];
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

const clearTimers = (client) => {
  client.timers.forEach(clearTimeout);
  client.timers.clear();
};

const schedule = (client, callback, delayMs) => {
  const timer = setTimeout(() => {
    client.timers.delete(timer);
    callback();
  }, delayMs);

  client.timers.add(timer);
};

const sendMeasurementSnapshot = (socket, client) => {
  client.snapshotRevision += 1;

  return sendJson(
    socket,
    buildMeasurementSnapshot(
      client.sessionId,
      client.scenario?.completedMeasurements ?? [],
      client.snapshotRevision,
    ),
  );
};

const resetClientSession = (socket) => {
  const client = clients.get(socket);
  if (!client) return false;

  clearTimers(client);
  client.sessionId = null;
  client.scenario = null;
  client.snapshotRevision = 0;
  sendMicrophoneText(socket, client, null);

  return sendJson(socket, buildTechMessage(null));
};

const startCycle = (socket, declineMeasurements = false) => {
  const client = clients.get(socket);
  if (!client || socket.readyState !== WebSocket.OPEN) return null;

  clearTimers(client);
  client.sessionId = createSessionId();
  client.scenario = createScenarioState(client.sessionId);
  client.snapshotRevision = 0;

  sendJson(socket, buildTechMessage(client.sessionId));
  sendMeasurementSnapshot(socket, client);
  schedule(client, () => {
    sendMicrophoneText(socket, client, "Здравствуйте! Хотите замериться?");

    if (declineMeasurements) {
      handleMockUserIntent(socket, client, { intent: "decline_measurements" });
    }
  }, GREETING_DELAY_MS);

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

  const previousSessionId = client.scenario?.sessionId ?? null;
  const result = transitionScenario(client.scenario, payload, { createSessionId });
  client.scenario = result.state;
  client.sessionId = result.state?.sessionId ?? null;
  sendEvents(socket, client, result.events);

  if (client.sessionId && client.sessionId !== previousSessionId) {
    client.snapshotRevision = 0;
    sendMeasurementSnapshot(socket, client);
  }

  if (
    result.events.some((event) =>
      ["measurement_results_ready", "measurement_reset"].includes(event.type),
    )
  ) {
    sendMeasurementSnapshot(socket, client);
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

app.get("/openapi.json", (_request, response) => response.json(openApiDocument));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

const getConnectedSockets = () =>
  [...clients.keys()].filter((socket) => socket.readyState === WebSocket.OPEN);

app.get("/cycle", async (_request, response) => {
  const sockets = getConnectedSockets();
  if (sockets.length === 0) {
    response.status(409).json({
      status: "frontend_not_connected",
      message: "Сначала подключите frontend к WebSocket, затем повторно вызовите /cycle.",
    });

    return;
  }

  const sessionIds = (await Promise.all(sockets.map((socket) => restartCycle(socket)))).filter(Boolean);
  response.json({ status: "started", clients: sessionIds.length, session_ids: sessionIds });
});

app.post("/decline-measurements", async (_request, response) => {
  const sockets = getConnectedSockets();
  if (sockets.length === 0) {
    response.status(409).json({
      status: "frontend_not_connected",
      message: "Сначала подключите frontend к WebSocket, затем повторно вызовите /decline-measurements.",
    });

    return;
  }

  const sessionIds = (
    await Promise.all(sockets.map((socket) => restartCycle(socket, true)))
  ).filter(Boolean);
  response.json({ status: "started", scenario: "measurements_declined", clients: sessionIds.length, session_ids: sessionIds });
});

app.post("/reset", (_request, response) => {
  const resetClients = getConnectedSockets().filter(resetClientSession).length;
  response.json({ status: "reset", clients: resetClients });
});

const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server, path: WEBSOCKET_PATH });

webSocketServer.on("connection", (socket) => {
  const client = {
    restartVersion: 0,
    sessionId: null,
    scenario: null,
    snapshotRevision: 0,
    subtitleSequence: 0,
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
    if (message?.type === "mock_user_intent") {
      handleMockUserIntent(socket, client, message.payload);
    }
  });

  socket.on("close", () => {
    clearTimers(client);
    clients.delete(socket);
  });
  socket.on("error", (error) => console.error("❌ WebSocket:", error));
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 VSP WebSocket stub: ws://${HOST}:${PORT}${WEBSOCKET_PATH}`);
  console.log(`📚 Swagger: http://${HOST}:${PORT}/api-docs`);
});
