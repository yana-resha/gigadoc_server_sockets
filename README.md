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

Тестовая панель frontend всегда показывает все действия и отправляет
`mock_user_intent` с `payload.unrestricted: true`. Этот режим предназначен
для просмотра макетов: переходы выполняются сразу из любой фазы, без ожидания
mock-реплики; при необходимости создаётся сессия. Для экранов результатов
stub заполняет все зоны тестовыми данными и отправляет snapshot перед
экранной командой. Новое нажатие отменяет отложенный ответ предыдущего.
Завершённый замер можно выбрать повторно. Для старта/завершения замера
используется выбранная зона, а если её нет — FPG. Обычные сообщения без флага
сохраняют последовательные проверки сценария.
Повторные `end_session` и `finish_session` без активной сессии отправляют только
`session_end`, без создания новой сессии и промежуточного `session_start`.

Пример обычного `mock_user_intent`:

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
- `reset_measurement` → `measurement_reset` с конкретной активной зоной в `measurement` (`fpg`, `cardio`, `derm`, `vision`) и обновлённый snapshot; сбрасывает выбор/сканирование, сохраняет полученные результаты. Без data.measurement мок использует активную зону
- `finish_measurements` → `profile_questions_ready` перед первым просмотром результатов. После ответа или пропуска профиля открывается `results_intro_ready`; при повторном завершении замеров профиль не запрашивается снова.
- `resume_measurements` → `measurements_resume_ready`
- `show_results_overview` → `results_view_ready` (`overview`)
- `open_category` с `data.category` → `results_view_ready` (`category_cards`)
- `open_category_table` с `data.category` → `results_view_ready` (`category_table`)
- `show_all_deviations` → `results_view_ready` (`all_deviations`)
- `show_all_indicators` → `results_view_ready` (`all_indicators`)
- `open_checkup_general`, `open_checkup_heart`, `open_checkup_skin`, `open_checkup_vision` → отдельные плоские события `checkup_general_ready`, `checkup_heart_ready`, `checkup_skin_ready`, `checkup_vision_ready`. Доступны в активной сессии без замеров; назад к каталогу — `show_all_checkups`.
- `show_all_checkups` → `results_view_ready` (`all_checkups`); доступен в любой активной сессии, без замеров. Показывает каталог чекапов, из него можно перейти к замерам или вернуться к полученным результатам.
- `save_results` → `qr`, затем `results_view_ready` (`qr`)
- `finish_session` → выход с замерами или без них; `session_exit_with_measurements` содержит `countdown_seconds: 60`
- `restart_session` → новая сессия
- `show_idle_warning` → `session_idle_warning` с `countdown_seconds: 15`, сохраняет фазу и данные текущего сценария
- `continue_session` → повторяет прежнюю экранную команду после предупреждения; сразу после приветствия открывает `scan_intro_ready`
- `end_session` → явный `session_end` без финального экрана

В активной сессии mock-панель предлагает «Показать „Вы ещё здесь?“». На экране предупреждения доступны продолжение и завершение. Локальный frontend-отсчёт останавливается на `00:00`; stub не запускает автоматическое завершение.

Поддерживаемые категории: `skin`, `heart_and_vessels`, `vision`. Snapshot использует зоны SberMedAI: `fpg` и `cardio` для сердца, `derm` для кожи и `vision` для зрения. Ветка отказа не отправляет QR.

Для проверки ограничения таблиц snapshot содержит 18 показателей FPG и 2 cardio (20 вместе), 11 известных показателей кожи и 9 дополнительных, 8 известных показателей зрения и 12 дополнительных. Дополнительные показатели используют ключи `test_skin_N` и `test_vision_N` и проходят обычный поток данных frontend без специального mock-хука. Названия, значения, статусы и шкалы передаются в attribute. После всех замеров каждая таблица содержит 20 показателей: видны 16 строк и подпись «и ещё 4 — в сохранённых показателях». Только после FPG: «и ещё 2 — в сохранённых показателях». Все показатели учитываются в общих списках и QR-счётчике; карточки сначала показывают полученные приоритетные ключи, затем добирают остальные до шести. После изменения данных перезапустите stub и начните новую сессию.

Stub не синтезирует речь и не отправляет аудиочанки. Поток `voice_audio_chunk` / `voice_interrupt` проверяется с настоящим backend и 2DAvatar.

FPG и cardio проходят независимо. Stub хранит активную и завершённые зоны и отправляет snapshot до `measurement_selected` / `measurement_started`, со статусами `created` / `started`. Завершение отдельной зоны обновляет только её результаты. Категория сердца завершена после обеих зон; повторный выбор завершённой зоны отклоняется. Завершение списка замеров и профиль доступны даже после одной зоны.

`measurement_selected` и `measurement_started` содержат конкретную зону в measurement, без отдельного zone_id. Snapshot не нужен для выбора подписи экрана.

`measurement_results_ready` и `results_intro_ready` передают полный массив четырёх зон (`results[].type`: fpg, cardio, derm, vision), включая непройденные с completed: false. Во вводной каждая зона содержит deviations_count. `results_view_ready.category` и mock intent data.category тоже принимают зоны; fpg/cardio открывают общий раздел сердца.

`countdown_seconds` — необязательное неотрицательное целое число секунд для `session_idle_warning` и `session_exit_with_measurements`. При отсутствии или некорректном значении frontend принимает экран без ошибки и выбирает случайную длительность: 10–20 секунд для предупреждения, 45–75 для финала с QR. Истечение локального отсчёта не завершает сессию: для этого backend отправляет `session_end`.
