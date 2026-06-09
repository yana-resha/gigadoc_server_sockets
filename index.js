const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();

// для отладки можно так (или ограничить origin как раньше)
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
  res.send("WebSocket-сервер работает");
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

  ws.on("message", (message) => {
    console.log("📩 Получено сообщение от клиента:", message.toString());

    // ✅ devices WS-логика удалена полностью
    // оставим просто echo как раньше
    ws.send(JSON.stringify({ type: "echo", payload: message.toString() }));
  });

  ws.on("close", () => {
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
          message = {
            type: "camera",
            camera_x_size: 480,
            camera_y_size: 640,
          };
          break;

        case 1:
          message = {
            type: "params",
            age: { value: 32 },
            real_age: { value: 60 },
            age_std: { value: "2" },

            bmi: {
              value: 42.95459959,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
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
              status: "deviation",
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
              value: 0.047,
              status: "deviation",
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

            heart_rate: { value: null, status: null },
            raw_ppg: { value: [10, 160, 30, 0, 160, 50, 160, 0] },
            gender: { value: 0 },

            lower_ap: {
              value: 130,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
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
              value: 999.33333333333334,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            upper_ap: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            lpa50: {
              value: 29.8,
              status: "normal",
              step_values: [
                { from: 0, to: 30, status: "normal" },
                { from: 30, to: 120, status: "problem" },
                { from: 120, to: 200, status: "serious" },
              ],
            },

            ldh_chol: {
              value: 110,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            cardiac_risk: {
              value: 18.5,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            atherosclerosis_risk: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            ag_risk: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            hypoxia_risk: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            hdl_chol: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            triglycerides: {
              value: 120,
              status: "deviation",
              step_values: [
                { from: 14, to: 18.5, status: "deviation" },
                { from: 18.5, to: 25, status: "normal" },
                { from: 25, to: 30, status: "problem" },
                { from: 25, to: 45, status: "serious" },
              ],
            },

            fatigue: {
              value: 0.1,
              status: "deviation",
              step_values: [
                { from: 0, to: 18.5, status: "deviation" },
                { from: 1, to: 25, status: "normal" },
                { from: 2, to: 30, status: "problem" },
              ],
            },
          };
          break;

        case 2:
          message = {
            type: "facecoords",
            x1: 221.44,
            x2: 320.83,
            y1: 190.42,
            y2: 310.32,
          };
          break;

        case 3:
          message = {
            type: "tech",
            ppg_progress: 1,
            proximity: 0.4,
            distance_state: "close",
            session_id: "1",
          };
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

const PORT = 8000; // ✅ чтобы совпало с SERVER_PATH
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
