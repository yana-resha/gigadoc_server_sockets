# VSP WebSocket Stub

Event-driven mock-backend для VSP Client. Поддерживает прежний голосовой
сценарий и мгновенное ручное прохождение всех веток через WebSocket intents.

## Запуск и проверка

```bash
npm install
npm start
npm test
```

- WebSocket: `ws://127.0.0.1:8081/ws/frontend/v1`
- Swagger UI: `http://127.0.0.1:8081/api-docs`
- OpenAPI JSON: `GET http://127.0.0.1:8081/openapi.json`
- голосовой сценарий: `GET http://127.0.0.1:8081/cycle`
- голосовой отказ: `POST http://127.0.0.1:8081/decline-measurements`
- сброс: `POST http://127.0.0.1:8081/reset`

Порт задаётся переменной окружения `PORT`.

## Управляемый mock-сценарий

Frontend отправляет сообщение без ожидания речи пользователя и без серверных
таймеров:

```json
{
  "type": "mock_user_intent",
  "payload": {
    "intent": "select_measurement",
    "session_id": "vsp-mock-...",
    "data": { "measurement": "skin" }
  }
}
```

Первая команда `begin_measurements` или `decline_measurements` сама создаёт
сессию. Intent `restart_session` синхронно отправляет сброс `tech` с пустой
`session_id`, затем новый `tech` с `face_in_area: true`.

Если `session_id` передан, он обязан совпадать с активной сессией. Неверная
фаза, сессия или payload возвращают сообщение `status: "fail"` и не изменяют
состояние.

Доступные intents:

- `begin_measurements` → `scan_intro_ready`
- `decline_measurements` → `measurements_declined`
- `begin_profile_questions` → `profile_questions_ready`
- `continue_with_profile`, `continue_without_profile` → `scan_selection_ready`
- `select_measurement` с `data.measurement` → `measurement_selected`
- `start_measurement` → `measurement_started`
- `complete_measurement` → `params`, затем `measurement_results_ready`
- `reset_measurement` → `measurement_reset`
- `finish_measurements` → `results_intro_ready`
- `resume_measurements` → `measurements_resume_ready` и возврат к непройденным замерам
- `show_results_overview` → `results_view_ready` (`overview`)
- `open_category` с `data.category` → `results_view_ready` (`category_cards`)
- `open_category_table` с `data.category` → `results_view_ready` (`category_table`)
- `show_all_deviations` → `results_view_ready` (`all_deviations`)
- `show_all_indicators` → `results_view_ready` (`all_indicators`)
- `save_results` → `qr` с тестовым SVG QR-кода, затем `results_view_ready` (`qr`)
- `finish_session` → выход с замерами или без них в зависимости от ветки
- `restart_session` → новая сессия
- `clear_microphone_text` → `voice_subtitle` с `text: null`, без изменения сценарной фазы

Поддерживаемые `measurement` и `category`: `skin`, `heart_and_vessels`,
`vision`. Категорию результатов можно открыть только после соответствующего
завершённого замера.

Типовой полный путь:

```text
restart_session
→ begin_measurements
→ begin_profile_questions
→ continue_with_profile
→ select_measurement
→ start_measurement
→ complete_measurement
→ ... другие замеры ...
→ finish_measurements
→ show_results_overview
→ open_category / open_category_table / show_all_deviations / show_all_indicators
→ save_results
→ finish_session
```

`params` накапливаются по завершённым категориям. Полный fixture содержит
ровно 30 ключей текущего UI registry: 16 сердца/общих показателей, 11 кожи и
3 зрения. В данных есть нормальные значения и отклонения, а также
`step_values` для шкал.

## Голосовой путь

`/cycle`, `/decline-measurements` и сообщения `avatar_state` работают как
раньше. Сервер имитирует «слушает → думает» таймерами, ждёт фактического
окончания речи аватара и использует существующие события ранних фаз.

### Фразы индикатора микрофона

Stub имитирует целевой backend-контракт и передаёт текст только через
`voice_subtitle`. Перед сценарным событием он отправляет новую фразу, а при
`/reset` — `text: null` для её очистки:

```json
{
  "status": "ok",
  "type": "voice_subtitle",
  "turn_id": "mock-subtitle-vsp-mock-…-1",
  "sentence_index": 1,
  "text": "Начинаем?"
}
```

Фронтенд должен сохранять последнюю фразу до следующего `voice_subtitle` или
явного `text: null`; `eos`, interrupt и смена экранов её не очищают. Фразы
подобраны для всех экранов управляемого и голосового mock-сценариев, включая
результаты, QR и финальный выход.

`/reset` отменяет таймеры, очищает состояние и отправляет начальный `tech` с
пустой `session_id`, не закрывая WebSocket.

Ветка отказа завершается `session_exit_without_measurements` и никогда не
отправляет QR. Ветка с результатами завершается новым событием
`session_exit_with_measurements`.
