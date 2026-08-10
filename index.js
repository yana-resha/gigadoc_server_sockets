const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const app = express();
const PORT = Number(process.env.PORT) || 8000; // ✅ чтобы совпало с SERVER_PATH

// для отладки можно так (или ограничить origin как раньше)
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ===========================
   APP STAGE STATE
=========================== */

const APP_STAGES = {
  ZERO: "zero",
  FACE_DETECTED: "face-detected",
  SCANNING: "scanning",
  RESULTS: "results",
};

const STAGE_ALIASES = {
  0: APP_STAGES.ZERO,
  none: APP_STAGES.ZERO,
  start: APP_STAGES.ZERO,
  zero: APP_STAGES.ZERO,
  face: APP_STAGES.FACE_DETECTED,
  "face-detected": APP_STAGES.FACE_DETECTED,
  detected: APP_STAGES.FACE_DETECTED,
  greeting: APP_STAGES.FACE_DETECTED,
  "after-greeting": APP_STAGES.SCANNING,
  greeted: APP_STAGES.SCANNING,
  scan: APP_STAGES.SCANNING,
  scanning: APP_STAGES.SCANNING,
  result: APP_STAGES.RESULTS,
  results: APP_STAGES.RESULTS,
};

const resolveStage = (rawStage) => STAGE_ALIASES[String(rawStage).toLowerCase()];

const readInitialStage = () => {
  const stageArg = process.argv.find((arg) => arg.startsWith("--stage="));
  const rawStage =
    process.env.APP_STAGE ||
    process.env.STAGE ||
    (stageArg ? stageArg.split("=")[1] : undefined) ||
    APP_STAGES.RESULTS;
  const stage = resolveStage(rawStage);

  if (!stage) {
    console.warn(
      `⚠️ Unknown APP_STAGE "${rawStage}", fallback to "${APP_STAGES.RESULTS}"`,
    );

    return APP_STAGES.RESULTS;
  }

  return stage;
};

let sessionCounter = 1;
const SCAN_FLOW_TIMING = {
  idleBeforeScanMs: 5000,
  beforeFarMs: 2000,
  farPauseMs: 5000,
  totalScanMs: 30000,
  farPauseProgress: 0.05,
};
const FULL_CYCLE_TIMING = {
  noPersonMs: 5000,
};
const DASHBOARD_NAVIGATION_DEMO_TIMING = {
  firstCommandDelayMs: 4000,
  betweenCommandsMs: 6000,
};
const DASHBOARD_NAVIGATION_DEMO_CATEGORY_ORDER = ["heart", "risks"];

const scanFlowState = {
  startedAt: null,
};

const appStageState = {
  stage: readInitialStage(),
  sessionId: String(sessionCounter),
};

const frontendState = {
  resultsAnnounced: false,
};

let pendingFaceDetectionTimeout = null;

const shouldMockMicrophoneListening = () =>
  appStageState.stage === APP_STAGES.RESULTS && frontendState.resultsAnnounced;

const startScanFlow = () => {
  scanFlowState.startedAt = Date.now();
};

const resetScanFlow = () => {
  scanFlowState.startedAt = null;
};

if (appStageState.stage === APP_STAGES.SCANNING) {
  startScanFlow();
}

const getScanFlowSnapshot = () => {
  if (appStageState.stage !== APP_STAGES.SCANNING || !scanFlowState.startedAt) {
    return null;
  }

  const elapsedMs = Date.now() - scanFlowState.startedAt;

  if (elapsedMs < SCAN_FLOW_TIMING.idleBeforeScanMs) {
    return {
      progress: 0,
      distance_state: "close",
      phase: "waiting-after-greeting",
      elapsed_ms: elapsedMs,
    };
  }

  const scanElapsedMs = elapsedMs - SCAN_FLOW_TIMING.idleBeforeScanMs;

  if (scanElapsedMs >= SCAN_FLOW_TIMING.totalScanMs) {
    appStageState.stage = APP_STAGES.RESULTS;
    resetScanFlow();

    return {
      progress: 1,
      distance_state: "close",
      phase: "completed",
      elapsed_ms: elapsedMs,
    };
  }

  if (scanElapsedMs < SCAN_FLOW_TIMING.beforeFarMs) {
    const progress =
      (scanElapsedMs / SCAN_FLOW_TIMING.beforeFarMs) *
      SCAN_FLOW_TIMING.farPauseProgress;

    return {
      progress,
      distance_state: "close",
      phase: "scanning-before-far",
      elapsed_ms: elapsedMs,
    };
  }

  const farPauseEndMs = SCAN_FLOW_TIMING.beforeFarMs + SCAN_FLOW_TIMING.farPauseMs;

  if (scanElapsedMs < farPauseEndMs) {
    return {
      progress: SCAN_FLOW_TIMING.farPauseProgress,
      distance_state: "far",
      phase: "far-pause",
      elapsed_ms: elapsedMs,
    };
  }

  const remainingElapsedMs = scanElapsedMs - farPauseEndMs;
  const remainingTotalMs = SCAN_FLOW_TIMING.totalScanMs - farPauseEndMs;
  const remainingRatio = Math.min(1, remainingElapsedMs / remainingTotalMs);
  const progress =
    SCAN_FLOW_TIMING.farPauseProgress +
    remainingRatio * (1 - SCAN_FLOW_TIMING.farPauseProgress);

  return {
    progress,
    distance_state: "close",
    phase: "scanning-after-far",
    elapsed_ms: elapsedMs,
  };
};

const getAppStageSnapshot = () => {
  const scan = getScanFlowSnapshot();

  return {
    stage: appStageState.stage,
    session_id: appStageState.sessionId,
    scan,
  };
};

const setAppStage = (stage) => {
  appStageState.stage = stage;

  if (stage !== APP_STAGES.RESULTS) {
    frontendState.resultsAnnounced = false;
  }

  if (stage === APP_STAGES.ZERO) {
    sessionCounter += 1;
    appStageState.sessionId = String(sessionCounter);
  }

  if (stage === APP_STAGES.SCANNING) {
    startScanFlow();
  } else {
    resetScanFlow();
  }

  return getAppStageSnapshot();
};

const startFullCycle = () => {
  if (pendingFaceDetectionTimeout) {
    clearTimeout(pendingFaceDetectionTimeout);
  }

  const snapshot = setAppStage(APP_STAGES.ZERO);
  const scheduledSessionId = snapshot.session_id;

  pendingFaceDetectionTimeout = setTimeout(() => {
    pendingFaceDetectionTimeout = null;

    if (
      appStageState.stage !== APP_STAGES.ZERO ||
      appStageState.sessionId !== scheduledSessionId
    ) {
      return;
    }

    const nextSnapshot = setAppStage(APP_STAGES.FACE_DETECTED);
    console.log("👤 Full cycle: face detected:", nextSnapshot);
  }, FULL_CYCLE_TIMING.noPersonMs);

  return {
    ...snapshot,
    cycle: {
      status: "started",
      next_stage: APP_STAGES.FACE_DETECTED,
      next_stage_in_ms: FULL_CYCLE_TIMING.noPersonMs,
    },
  };
};

const buildCameraMessage = () => ({
  type: "camera",
  camera_x_size: 480,
  camera_y_size: 640,
});

const buildEmptyFaceCoordsMessage = () => ({
  type: "facecoords",
  x1: null,
  x2: null,
  y1: null,
  y2: null,
});

const buildFaceCoordsMessage = () => ({
  type: "facecoords",
  x1: 221.44,
  x2: 320.83,
  y1: 190.42,
  y2: 310.32,
});

const buildTechMessage = () => {
  const isZeroStage = appStageState.stage === APP_STAGES.ZERO;
  const isResultsStage = appStageState.stage === APP_STAGES.RESULTS;
  const scanSnapshot = getScanFlowSnapshot();
  const isMicrophoneListening = shouldMockMicrophoneListening();

  return {
    type: "tech",
    ppg_progress: scanSnapshot?.progress ?? (isResultsStage ? 1 : 0),
    proximity: isZeroStage ? 0 : scanSnapshot?.distance_state === "far" ? 0.1 : 0.4,
    distance_state: isZeroStage ? "far" : scanSnapshot?.distance_state ?? "close",
    session_id: appStageState.sessionId,
    mic_on: isMicrophoneListening,
    mic_in_progress: isMicrophoneListening,
  };
};

const shouldSendParamsMessage = () => {
  getScanFlowSnapshot();

  return appStageState.stage === APP_STAGES.RESULTS;
};

const openApiDocument = {
  openapi: "3.0.0",
  info: {
    title: "GigaDoc Frontend Stub Sockets",
    version: "1.0.0",
    description: "Моковый сервер для прогонки экранных этапов приложения.",
  },
  servers: [{ url: `http://localhost:${PORT}` }],
  paths: {
    "/cycle": {
      get: {
        summary: "Запустить полный пользовательский цикл",
        tags: ["Stages"],
        description:
          "Создает новую сессию без человека, через 5 секунд автоматически показывает лицо, после приветствия запускает сканирование и затем отдает результаты.",
        responses: {
          200: {
            description: "Полный цикл запущен",
          },
        },
      },
    },
    "/stage": {
      get: {
        summary: "Текущий экранный этап мокового сервера",
        tags: ["Stages"],
        responses: {
          200: {
            description: "Текущий stage и session_id",
          },
        },
      },
    },
    "/stage/{stage}": {
      get: {
        summary: "Переключить экранный этап",
        tags: ["Stages"],
        parameters: [
          {
            name: "stage",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: [
                "zero",
                "0",
                "start",
                "none",
                "face-detected",
                "face",
                "detected",
                "greeting",
                "scanning",
                "scan",
                "greeted",
                "after-greeting",
                "results",
                "result",
              ],
            },
            description:
              "zero/0/start/none запускает новую сессию без лица и без отправки params; face-detected/face/detected/greeting отдает лицо в зоне без params и progress=0; scanning/scan/greeted/after-greeting запускает сценарий после приветствия: 5 секунд ожидания, затем 30 секунд сканирования с временным far на 5%; results возвращает обычный поток с params.",
          },
        ],
        responses: {
          200: {
            description: "Stage переключен",
          },
          400: {
            description: "Неизвестный stage",
          },
        },
      },
    },
    "/devices": {
      get: {
        summary: "Получить моковый список микрофонов и камер",
        tags: ["Devices"],
        responses: {
          200: {
            description: "Список устройств",
          },
        },
      },
    },
    "/devices/set": {
      get: {
        summary: "Выбрать активные микрофон и камеру",
        tags: ["Devices"],
        parameters: [
          {
            name: "mic",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "camera",
            in: "query",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Обновленное состояние устройств",
          },
        },
      },
    },
  },
};

/* ===========================
   DEVICES MOCK HELPERS (HTTP ONLY)
=========================== */

const MIC_POOL = [
  "Built-in Microphone",
  "USB Microphone",
  "AirPods Mic",
  "Logitech Headset",
  "OBS Virtual Mic",
];

const CAMERA_POOL = [
  "FaceTime HD Camera",
  "USB Webcam",
  "Logitech C920",
  "OBS Virtual Camera",
  "Elgato Facecam",
];

const pickRandom = (arr, min = 2, max = 4) => {
  const count = Math.min(
    arr.length,
    Math.floor(Math.random() * (max - min + 1)) + min,
  );
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
};

const buildDevices = ({ activeMic, activeCamera } = {}) => {
  const mics = pickRandom(MIC_POOL).map((name) => ({
    name,
    active: false,
  }));

  const cameras = pickRandom(CAMERA_POOL, 1, 3).map((name) => ({
    name,
    active: false,
  }));

  const micToActivate = activeMic || mics[0]?.name;
  const camToActivate = activeCamera || cameras[0]?.name;

  mics.forEach((m) => (m.active = m.name === micToActivate));
  cameras.forEach((c) => (c.active = c.name === camToActivate));

  return { mics, cameras };
};

/* ===========================
   DEVICES STATE (HTTP ONLY)
=========================== */

let devicesState = buildDevices();

/* ===========================
   HTTP ROUTES
=========================== */

app.get("/", (req, res) => {
  res.send(`WebSocket-сервер работает. Swagger: http://localhost:${PORT}/api-docs`);
});

app.get("/openapi.json", (req, res) => {
  res.json(openApiDocument);
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

// GET /cycle — одна ручка для полного сценария:
// никого нет -> лицо -> приветствие -> сканирование -> результаты.
app.get("/cycle", (req, res) => {
  const snapshot = startFullCycle();
  console.log("🎬 Full cycle started:", snapshot);
  res.json(snapshot);
});

// GET /stage
app.get("/stage", (req, res) => {
  res.json(getAppStageSnapshot());
});

// GET /stage/zero или /stage/0 — новая сессия без лица и без отправки params.
// GET /stage/face-detected или /stage/face — лицо в зоне, params еще не отправляем.
// GET /stage/scanning или /stage/greeted — приветствие закончено, запускаем сценарий сканирования.
// GET /stage/results — обычный поток с params/facecoords/progress=1.
app.get("/stage/:stage", (req, res) => {
  const stage = resolveStage(req.params.stage);

  if (!stage) {
    res.status(400).json({
      error: "Unknown stage",
      allowed: Object.keys(STAGE_ALIASES),
      current: getAppStageSnapshot(),
    });

    return;
  }

  const snapshot = setAppStage(stage);
  console.log("🎬 Stage switched:", snapshot);
  res.json(snapshot);
});

// GET /devices
app.get("/devices", (req, res) => {
  // можно пересобирать пул, но сохранять активные
  devicesState = buildDevices({
    activeMic: devicesState.mics.find((m) => m.active)?.name,
    activeCamera: devicesState.cameras.find((c) => c.active)?.name,
  });

  res.json(devicesState);
});

// GET /devices/set?mic=...&camera=...
app.get("/devices/set", (req, res) => {
  const { mic, camera } = req.query;

  if (mic) {
    devicesState.mics = devicesState.mics.map((m) => ({
      ...m,
      active: m.name === mic,
    }));
  }

  if (camera) {
    devicesState.cameras = devicesState.cameras.map((c) => ({
      ...c,
      active: c.name === camera,
    }));
  }

  res.json(devicesState);
});

/* ===========================
   WS CONNECTION
=========================== */

wss.on("connection", (ws) => {
  console.log("✅ Клиент подключён");

  let dashboardCapabilities = null;
  let dashboardNavigationDemoScheduled = false;
  let nextDashboardCommandId = 1;
  const dashboardNavigationTimers = new Set();

  const resetDashboardNavigationDemo = () => {
    dashboardNavigationTimers.forEach(clearTimeout);
    dashboardNavigationTimers.clear();
    dashboardNavigationDemoScheduled = false;
    nextDashboardCommandId = 1;
  };

  const sendDashboardCategoryCommand = (categoryKey) => {
    if (
      ws.readyState !== WebSocket.OPEN ||
      appStageState.stage !== APP_STAGES.RESULTS ||
      !frontendState.resultsAnnounced
    ) {
      return;
    }

    const command = {
      type: "dashboard_navigation",
      command_id: nextDashboardCommandId,
      target: {
        kind: "category",
        key: categoryKey,
      },
    };

    nextDashboardCommandId += 1;
    ws.send(JSON.stringify(command));
    console.log("🧭 Отправлена моковая команда dashboard:", command);
  };

  const scheduleDashboardNavigationDemo = () => {
    if (
      dashboardNavigationDemoScheduled ||
      !dashboardCapabilities ||
      appStageState.stage !== APP_STAGES.RESULTS ||
      !frontendState.resultsAnnounced
    ) {
      return;
    }

    const availableCategoryKeys = dashboardCapabilities.categories.map(
      (category) => category.key,
    );
    const preferredCategoryKeys = DASHBOARD_NAVIGATION_DEMO_CATEGORY_ORDER.filter(
      (categoryKey) => availableCategoryKeys.includes(categoryKey),
    );
    const categoryKeys = [
      ...preferredCategoryKeys,
      ...availableCategoryKeys.filter(
        (categoryKey) => !preferredCategoryKeys.includes(categoryKey),
      ),
    ].slice(0, 2);

    if (categoryKeys.length === 0) {
      console.warn("⚠️ В dashboard_capabilities нет категорий для моковой навигации");

      return;
    }

    dashboardNavigationDemoScheduled = true;

    categoryKeys.forEach((categoryKey, index) => {
      const delayMs =
        DASHBOARD_NAVIGATION_DEMO_TIMING.firstCommandDelayMs +
        index * DASHBOARD_NAVIGATION_DEMO_TIMING.betweenCommandsMs;
      const timer = setTimeout(() => {
        dashboardNavigationTimers.delete(timer);
        sendDashboardCategoryCommand(categoryKey);
      }, delayMs);

      dashboardNavigationTimers.add(timer);
    });

    console.log("🗓 Запланирована моковая dashboard-навигация:", {
      categories: categoryKeys,
      first_command_in_ms:
        DASHBOARD_NAVIGATION_DEMO_TIMING.firstCommandDelayMs,
      interval_ms: DASHBOARD_NAVIGATION_DEMO_TIMING.betweenCommandsMs,
    });
  };

  ws.on("message", (message) => {
    const rawMessage = message.toString();
    console.log("📩 Получено сообщение от клиента:", rawMessage);

    try {
      const parsedMessage = JSON.parse(rawMessage);
      const payload = parsedMessage?.payload;

      if (parsedMessage?.type === "dashboard_capabilities") {
        const categories = Array.isArray(payload?.categories)
          ? payload.categories.filter(
              (category) =>
                typeof category?.key === "string" &&
                Array.isArray(category?.parameter_keys),
            )
          : [];
        const gigadocModes = Array.isArray(payload?.gigadoc?.modes)
          ? payload.gigadoc.modes.filter(
              (mode) =>
                typeof mode?.key === "string" &&
                Array.isArray(mode?.parameter_keys),
            )
          : [];

        dashboardCapabilities = {
          categories,
          gigadoc: {
            key: payload?.gigadoc?.key,
            modes: gigadocModes,
          },
        };

        console.log("✅ Dashboard capabilities приняты:", dashboardCapabilities);
        scheduleDashboardNavigationDemo();

        return;
      }

      if (
        parsedMessage?.type === "avatar_state" &&
        payload?.greeted === true &&
        appStageState.stage === APP_STAGES.FACE_DETECTED
      ) {
        const snapshot = setAppStage(APP_STAGES.SCANNING);
        console.log("🎬 Greeting finished, scan flow started:", snapshot);

        return;
      }

      if (parsedMessage?.type === "avatar_state") {
        const announcedResults = payload?.resultsAnnounced === true;
        frontendState.resultsAnnounced = announcedResults;

        if (announcedResults && appStageState.stage === APP_STAGES.RESULTS) {
          console.log("🎙 Results announced, mock microphone listening enabled");
          scheduleDashboardNavigationDemo();
        } else if (!announcedResults) {
          resetDashboardNavigationDemo();
        }

        return;
      }
    } catch (error) {
      console.warn("⚠️ Не удалось разобрать сообщение клиента как JSON:", error.message);
    }

    // ✅ devices WS-логика удалена полностью
    // оставим просто echo как раньше
    ws.send(JSON.stringify({ type: "echo", payload: rawMessage }));
  });

  ws.on("close", () => {
    resetDashboardNavigationDemo();
    console.log("❌ Клиент отключился");
  });

  /* ===========================
     ТВОЙ ИСХОДНЫЙ INTERVAL
     (НЕ ТРОНУТ)
  =========================== */

  let toggle = 0;
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      let message = undefined;
      switch (toggle) {
        case 0:
          message = buildCameraMessage();
          break;

        case 1:
          if (appStageState.stage === APP_STAGES.ZERO) {
            message = buildEmptyFaceCoordsMessage();
            break;
          }
          if (!shouldSendParamsMessage()) {
            message = buildFaceCoordsMessage();
            break;
          }

          message = {
            type: "params",
            age: { value: 31 },
            real_age: { value: 20 },
            age_std: { value: "2" },
            heart_rate: {
  value: 120,
  },

            bmi: {
              value: 15.95459959,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            cholesterol: {
              value: 7.9,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            temprature: {
              value: 36.6,
              status: "normal",
              step_values: [
                { from: 0, to: 36, status: "deviation" },
                { from: 36, to: 37, status: "normal" },
                { from: 37, to: 38.5, status: "problem" },
                { from: 38.5, to: 40, status: "serious" },
              ],
            },

            cardiac_age: {
              value: 47,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            wellness_score: {
              value: 3,
              status: "deviation",
            },

            diabetes: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            emotion: { value: "Happiness" },
            ethnicity: { value: "Asian" },

            relax_level: {
              status: "deviation",
              value: 6.8,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            glycated_hemoglobin: {
              status: "deviation",
              value: 17.8,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            hemoglobin: {
              status: "deviation",
              value: 17.8,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            hematocrit: {
              status: "normal",
              value: 42.5,
              step_values: [
                { from: 20, to: 36, status: "deviation" },
                { from: 36, to: 48, status: "normal" },
                { from: 48, to: 55, status: "problem" },
                { from: 55, to: 65, status: "serious" },
              ],
            },

            glucose: {
              status: "deviation",
              value: 17.8,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            respiratory: {
              status: "normal",
              value: 18.577979797,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            saturation: {
              value: 98,
              status: "normal",
              step_values: [
                { from: 85, to: 90, status: "serious" },
                { from: 90, to: 95, status: "problem" },
                { from: 95, to: 100, status: "normal" },
              ],
            },

            raw_ppg: { value: [10, 160, 30, 0, 160, 50, 160, 0] },
            gender: { value: 0 },

            lower_ap: {
              value: 29,
              status: "problem",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            pnn50: {
              value: 16,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            rigidity: {
              status: "deviation",
              value: 15,
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            sdnn: {
              value: 18,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            stress: {
              value: 25,
              status: "problem",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            upper_ap: {
              value: 15,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            lpa: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 0, to: 30, status: "normal" },
                { from: 30, to: 120, status: "problem" },
                { from: 120, to: 200, status: "serious" },
              ],
            },

            ldl_chol: {
              value: 2.4,
              status: "normal",
              step_values: [
                { from: 0, to: 3, status: "normal" },
                { from: 3, to: 4, status: "deviation" },
                { from: 4, to: 5, status: "problem" },
                { from: 5, to: 7, status: "serious" },
              ],
            },

            cardiac_risk: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            atherosclerosis_risk: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            ag_risk: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            hypoxia_risk: {
              value: 20,
              status: "normal",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            anemia_risk: {
              value: 20.2,
              status: "normal",
              step_values: [
                { from: 0, to: 25, status: "normal" },
                { from: 25, to: 50, status: "deviation" },
                { from: 50, to: 75, status: "problem" },
              ],
            },

            hdl_chol: {
              value: 30,
              status: "problem",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            triglycerides: {
              value: 14,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },

            fatigue: {
              value: 0.1,
              status: "deviation",
              step_values: [
                { from: 0, to: 18.5, status: "deviation" },
                { from: 1, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
              ],
            },
          };
          break;

        case 2:
          message =
            appStageState.stage === APP_STAGES.ZERO
              ? buildEmptyFaceCoordsMessage()
              : buildFaceCoordsMessage();
          break;

        case 3:
          message = buildTechMessage();
          break;
      }

      ws.send(JSON.stringify(message));
      toggle >= 3 ? (toggle = 0) : ++toggle;
    }
  }, 100);

  ws.on("close", () => clearInterval(interval));
});

/* ===========================
   START SERVER
=========================== */

server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`🎬 Initial stage:`, getAppStageSnapshot());
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
});
