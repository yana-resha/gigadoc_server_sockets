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

Порт задаётся переменной `PORT`. `/cycle` и `/decline-measurements` отправляют `session_start`, затем `tech` и snapshot, а после mock-стадий прослушивания и ожидания ответа — выбор замера на планшете или отказ. `/reset` отменяет таймеры и отправляет `session_end`, не закрывая WebSocket.

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

Первая команда `begin_measurements` или `decline_measurements` создаёт сессию и отправляет `session_start`. Для тестовых пользовательских фраз stub отправляет `tech.mic_in_progress: true` на 700 мс, затем `tech.i_am_thinking: true` на 900 мс, после чего отдаёт сценарное событие и сбрасывает оба флага. Аватар в frontend имитирует `isSpeaking` по новому экрану. Технические команды завершения и сброса замера, а также `restart_session`, выполняются сразу. `restart_session` отправляет `session_end`, затем `session_start`. При неверной фазе или payload stub возвращает `status: "fail"`.

Доступные intents:

- `start_session` («Начать сессию») → только `session_start`, без навигации. Mock-аватар frontend имитирует приветствие 8 секунд; через 5 секунд frontend сам открывает вводную, продолжая ту же имитацию. Stub не отправляет аудио.

- `begin_measurements` («Хочу измериться») → `scan_selection_ready`: сразу экран выбора замера на планшете, с возможностью выбрать замер без вопросов о профиле.
- `decline_measurements` → `measurements_declined`
- `begin_profile_questions` → `profile_questions_ready`, доступен после получения замеров
- `continue_with_profile`, `continue_without_profile` → `results_intro_ready`, затем можно раскрыть категорию
- `select_measurement` с `data.measurement: fpg | cardio | derm | vision` → `measurement_selected` с той же зоной в measurement.
- `start_measurement` → `measurement_started`
- `complete_measurement` → `measurement_results_ready` и обновлённый `measurement_snapshot`
- `reset_measurement` → `measurement_reset` и обновлённый snapshot
- `finish_measurements` → `profile_questions_ready` перед первым просмотром результатов. После ответа или пропуска профиля открывается `results_intro_ready`; при повторном завершении замеров профиль не запрашивается снова.
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

FPG и cardio проходят независимо. Stub хранит активную и завершённые зоны и отправляет snapshot до `measurement_selected` / `measurement_started`, со статусами `created` / `started`. Завершение отдельной зоны обновляет только её результаты. Категория сердца завершена после обеих зон; повторный выбор завершённой зоны отклоняется. Завершение списка замеров и профиль доступны даже после одной зоны.

`measurement_selected` и `measurement_started` содержат конкретную зону в measurement, без отдельного zone_id. Snapshot не нужен для выбора подписи экрана.
