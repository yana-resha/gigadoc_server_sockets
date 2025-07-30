const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { type } = require('os');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ Клиент подключён');

  ws.on('message', (message) => {
    console.log('📩 Получено сообщение от клиента:', message);
    ws.send(JSON.stringify({ type: 'echo', payload: message }));
  });

  ws.on('close', () => {
    console.log('❌ Клиент отключился');
  });

  // Пример: каждые 5 секунд отправляем разные типы данных
  let toggle = 0;
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      let message = undefined;
      switch (toggle) {
      case 0:
          message = {
            type: 'camera',
            camera_x_size: 480,
            camera_y_size: 640,
          }
          break
      case 1:
        message = {
          type: 'params',
            age: {value: "32"},
            age_std: {value: '2'},
            bmi: {
              value: 42.95459959, 
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            cholesterol: {
              value: 7.9,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            diabetes: {
              value: 0.047,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            emotion: {value: "Happiness"},
            ethnicity: {value: "Asian"},
            glycated_hemoglobin: {
              value: 6.8,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            heart_rate: {value: 60},
            raw_ppg: {value: [10, 160, 30, 0, 160, 50, 160, 0]},
            gender: {value: 0},
            lower_ap: {
              value: 130,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            pnn50: {
              value: 16,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            respiratory: {value: 18.039459385397222},
            rigidity: {
              value: 15,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            sdnn: {
              value: 18,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            stress: {
              value: 999.33333333333334, 
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            upper_ap: {
              value: 120,
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
            fatigue: { 
              value: 'small',
              step_values: [
                {from: 14, to: 18.5, status: 'deviation'}, 
                {from: 18.5, to: 25, status: 'normal'}, 
                {from: 25, to: 30, status: 'problem'}, 
                {from: 25, to: 45, status: 'serious',}
              ],
            },
          
        }
        break
      case 2:
        message = {
          type: 'facecoords',
          x1: 230.44,
          x2: 380.83,
          y1: 170.42,
          y2: 300.32,
        }
        break

        case 3:
          message = {
            type: 'tech',
            ppg_progress: 1,
            proximity: 0.9
          }
          break
      default:
        console.warn('⚠️ Неизвестный тип сообщения', data)
      }

      ws.send(JSON.stringify(message));
      toggle >= 3 ? toggle = 0 : ++toggle
    }
  }, 100);

  ws.on('close', () => clearInterval(interval));
});

app.get('/', (req, res) => {
  res.send('WebSocket-сервер работает');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});

/*             camera_x_size: 640,
            camera_y_size: 480, */

/*                       x1: 285.44,
          x2: 425.83,
          y1: 50.42,
          y2: 230.32, */