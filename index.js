const http = require("http");

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const { WebSocketServer, WebSocket } = require("ws");

const {
  buildMeasurementSnapshot,
  buildVoiceStateMessage,
  fail,
} = require("./lib/protocol");
const { createOpenApiDocument } = require("./lib/openapi");
const { createScenarioState, transitionScenario } = require("./lib/state-machine");
const { transitionUnrestrictedScenario } = require("./lib/unrestricted-scenario");

const PORT = Number(process.env.PORT) || 8081;
const HOST = "127.0.0.1";
const WEBSOCKET_PATH = "/ws/frontend/v1";
const SCENARIO_START_DELAY_MS = 1_000;
const SESSION_RESTART_DELAY_MS = 250;
const MOCK_LISTENING_DELAY_MS = 700;
const MOCK_THINKING_DELAY_MS = 900;
const IMMEDIATE_INTENTS = new Set(["start_session", "restart_session", "complete_measurement", "reset_measurement", "show_idle_warning", "end_session"]);

let sessionCounter = 0;
const clients = new Map();

const createSessionId = () => {
  sessionCounter += 1;

  return `vsp-mock-${Date.now()}-${sessionCounter}`;
};

const sendJson = (socket, message) => {
  if (socket.readyState !== WebSocket.OPEN) return false;

  socket.send(JSON.stringify(message));
  const client = clients.get(socket);
  if (client && message.type === "session_start") client.frontendSessionActive = true;
  if (client && message.type === "session_end") client.frontendSessionActive = false;
  console.log("➡️ ", message);

  return true;
};

const sendVoiceState = (socket, state) => sendJson(socket, buildVoiceStateMessage(state));

const sendEvents = (socket, events) => {
  events.forEach((event) => {
    sendJson(socket, event);
    if (event.type === "session_end") sendVoiceState(socket, "waiting");
  });
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
      client.scenario,
    ),
  );
};

const resetClientSession = (socket) => {
  const client = clients.get(socket);
  if (!client) return false;

  clearTimers(client);
  client.restartVersion += 1;
  client.pendingTurn = false;
  client.sessionId = null;
  client.scenario = null;
  client.snapshotRevision = 0;
  const sent = sendJson(socket, { status: "ok", type: "session_end" });
  sendVoiceState(socket, "waiting");
  return sent;
};

const startCycle = (socket, declineMeasurements = false) => {
  const client = clients.get(socket);
  if (!client || socket.readyState !== WebSocket.OPEN) return null;

  clearTimers(client);
  client.pendingTurn = false;
  client.sessionId = createSessionId();
  client.scenario = createScenarioState(client.sessionId);
  client.snapshotRevision = 0;

  sendJson(socket, { status: "ok", type: "session_start" });
  sendVoiceState(socket, "waiting");
  sendMeasurementSnapshot(socket, client);
  schedule(client, () => {
    handleMockUserIntent(socket, client, {
      intent: declineMeasurements ? "decline_measurements" : "begin_measurements",
    });
  }, SCENARIO_START_DELAY_MS);

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
  if (payload?.unrestricted === true || ["restart_session", "end_session"].includes(payload?.intent)) {
    clearTimers(client);
    client.pendingTurn = false;
  }

  if (client.pendingTurn) {
    sendJson(socket, fail(client.sessionId, "invalid_transition", "Дождитесь завершения mock-ответа."));

    return;
  }

  const previousSessionId = client.scenario?.sessionId ?? null;
  const transition = payload?.unrestricted === true ? transitionUnrestrictedScenario : transitionScenario;
  const result = transition(client.scenario, payload, { createSessionId });
  if (result.events.some((event) => event.status === "fail")) {
    sendEvents(socket, result.events);
    sendVoiceState(socket, "waiting");

    return;
  }

  client.scenario = result.state;
  client.sessionId = result.state?.sessionId ?? null;
  const createdSession = Boolean(client.sessionId &&
    (client.sessionId !== previousSessionId || !client.frontendSessionActive));
  // A replacement click may reuse a session whose delayed start was never sent.
  if (createdSession && !result.events.some((event) => event.type === "session_start")) {
    result.events.unshift({ status: "ok", type: "session_start" });
  }

  const deliverResult = () => {
    if (payload.unrestricted === true) {
      // Start/reset before fixture data and navigation, preserving wire order.
      sendEvents(socket, result.events.filter((event) => ["session_start", "session_end"].includes(event.type)));
      if (client.sessionId) {
        if (createdSession) client.snapshotRevision = 0;
        sendMeasurementSnapshot(socket, client);
      }
      sendEvents(socket, result.events.filter((event) => !["session_start", "session_end"].includes(event.type)));
    } else {
      if (createdSession) {
        client.snapshotRevision = 0;
        sendEvents(socket, result.events.filter((event) => ["session_start", "session_end"].includes(event.type)));
      }
      if (createdSession || result.events.some((event) => ["measurement_selected", "measurement_started", "measurement_results_ready", "measurement_reset"].includes(event.type))) {
        sendMeasurementSnapshot(socket, client);
      }
      sendEvents(socket, result.events.filter((event) => !createdSession || !["session_start", "session_end"].includes(event.type)));
    }
    sendVoiceState(socket, "waiting");
  };

  if (IMMEDIATE_INTENTS.has(payload.intent)) {
    deliverResult();
    return;
  }

  // Statuses precede the first session_start, just as on the production backend.
  client.pendingTurn = true;
  sendVoiceState(socket, "listening");
  schedule(client, () => {
    sendVoiceState(socket, "thinking");
    schedule(client, () => {
      client.pendingTurn = false;
      deliverResult();
    }, MOCK_THINKING_DELAY_MS);
  }, MOCK_LISTENING_DELAY_MS);
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
  response.json({ status: "started", clients: sessionIds.length });
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
  response.json({ status: "started", scenario: "measurements_declined", clients: sessionIds.length });
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
    pendingTurn: false,
    frontendSessionActive: false,
    timers: new Set(),
  };
  clients.set(socket, client);
  sendVoiceState(socket, "waiting");
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
