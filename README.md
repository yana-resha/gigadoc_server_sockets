# VSP WebSocket Stub

Локальный WebSocket mock backend для VSP Client. Он отправляет техническое состояние, события сценария, `measurement_snapshot` и QR. Голосовой поток не имитируется.

## Запуск

```bash
npm install
npm start
npm test
```

- WebSocket: `ws://127.0.0.1:8081/ws/frontend/v1`
- Swagger UI: `http://127.0.0.1:8081/api-docs`
- OpenAPI JSON: `GET http://127.0.0.1:8081/openapi.json`
- Автоматический старт сценария: `GET http://127.0.0.1:8081/cycle`
- Автоматический отказ от замеров: `POST http://127.0.0.1:8081/decline-measurements`
- Сброс: `POST http://127.0.0.1:8081/reset`

Порт задаётся переменной `PORT`. `/cycle` и `/decline-measurements` создают сессию, отправляют `tech` и snapshot, а затем проходят mock-стадии прослушивания и ожидания ответа перед intro или отказом. `/reset` отменяет таймеры и отправляет `tech` с пустым `session_id`, не закрывая WebSocket.

## Ручной mock-сценарий

Тестовая панель frontend отправляет `mock_user_intent`:

```json
{
  "type": "mock_user_intent",
  "payload": {
    "intent": "select_measurement",
    "data": { "measurement": "skin" }
  }
}
```

Первая команда `begin_measurements` или `decline_measurements` создаёт сессию. Для тестовых пользовательских фраз stub отправляет `tech.mic_in_progress: true` на 700 мс, затем `tech.i_am_thinking: true` на 900 мс, после чего отдаёт сценарное событие и сбрасывает оба флага. Аватар в frontend имитирует `isSpeaking` по новому экрану. Технические команды завершения и сброса замера, а также `restart_session`, выполняются сразу. `restart_session` отправляет сброс `tech`, затем новый `tech`. При неверной фазе или payload stub возвращает `status: "fail"`.

Доступные intents:

- `begin_measurements` → `scan_intro_ready`
- `decline_measurements` → `measurements_declined`
- `begin_profile_questions` → `profile_questions_ready`
- `continue_with_profile`, `continue_without_profile` → `scan_selection_ready`
- `select_measurement` с `data.measurement` → `measurement_selected`
- `start_measurement` → `measurement_started`
- `complete_measurement` → `measurement_results_ready` и обновлённый `measurement_snapshot`
- `reset_measurement` → `measurement_reset` и обновлённый snapshot
- `finish_measurements` → `results_intro_ready`
- `resume_measurements` → `measurements_resume_ready`
- `show_results_overview` → `results_view_ready` (`overview`)
- `open_category` с `data.category` → `results_view_ready` (`category_cards`)
- `open_category_table` с `data.category` → `results_view_ready` (`category_table`)
- `show_all_deviations` → `results_view_ready` (`all_deviations`)
- `show_all_indicators` → `results_view_ready` (`all_indicators`)
- `save_results` → `qr`, затем `results_view_ready` (`qr`)
- `finish_session` → выход с замерами или без них
- `restart_session` → новая сессия

Поддерживаемые категории: `skin`, `heart_and_vessels`, `vision`. Snapshot использует зоны SberMedAI: `fpg` и `cardio` для сердца, `derm` для кожи и `vision` для зрения. Ветка отказа не отправляет QR.

Stub не синтезирует речь и не отправляет аудиочанки. Поток `voice_audio_chunk` / `voice_interrupt` проверяется с настоящим backend и 2DAvatar.
