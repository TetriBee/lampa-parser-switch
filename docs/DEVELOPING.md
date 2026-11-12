# Разработка

## Структура

```text
lampa-parser-switch/
├── plugin.js                 # сам плагин (один файл, без зависимостей)
├── store.json                # запись для стороннего магазина плагинов Lampa
├── docs/
│   ├── INSTALL.md            # установка на ТВ
│   └── DEVELOPING.md         # этот файл
├── tests/
│   ├── parser-switch.test.cjs  # юнит-тесты ядра + интеграция с заглушкой Lampa
│   ├── stub-lampa.cjs           # заглушка Lampa для тестов
│   └── e2e.py                   # проверка в настоящей Lampa (playwright)
├── package.json
└── .github/workflows/pages.yml  # автопубликация на GitHub Pages
```

## Как устроен plugin.js

Файл самодостаточный: ни сборки, ни зависимостей. Он одинаково работает и в
Lampa, и в Node (в Node отдаёт ядро через `module.exports` — так его и
тестируют).

Внутри две части:

- **Ядро** — чистые функции без `Lampa`: `normalizeList`, `baseUrl`,
  `swapProtocol`, `checkPath`, `checkUrl`, `findParser`, `parserValues`,
  `applyParser`, `currentParser`. Их покрывают тесты.
- **Интерфейс** — регистрация папки в настройках (`Lampa.SettingsApi`),
  параметры (`Lampa.Params`), лист выбора (`Lampa.Select`), уведомления
  (`Lampa.Noty`) и проверка доступности (`Lampa.Reguest`).

Порядок работы:

1. Плагин выставляет `window.lampa_settings.torrents_use = true` — иначе в
   сборках из магазина нет раздела «Парсер».
2. Ждёт события `app:ready` (до него настройки трогать нельзя).
3. Читает список пользователя из `localStorage` (`parser_switch_user_list`) —
   плагин не подгружает никаких списков извне.
4. Регистрирует поля «ссылка» и «API-ключ» с кнопкой «Добавить парсер»
   в разделе «Парсер» и папку «Парсеры» с переключением и проверкой.
5. В фоне проверяет доступность парсеров и, если включено автопереключение,
   переключается на рабочий.

## Тесты

```bash
npm test
```

Проверяются:

- в плагине нет чужих адресов и встроенного списка (регекс по коду);
- нормализация списка (массив, `results`, `parsers`, битые записи, дубликаты);
- адреса проверки — должны совпадать с запросами самой Lampa
  (`/api/v2.0/indexers/{all|status:healthy}/results?apikey=…`);
- запись в ключи `Storage` Lampa (основной и резервный парсер, prowlarr);
- интеграционный сценарий: плагин ставится в заглушку Lampa, после этого
  добавление и переключение парсеров пишут правильные настройки.

### End-to-end

```bash
npm run e2e
```

Скрипт открывает настоящую Lampa в Chromium, подключает плагин как обычный
`<script src>`, проверяет появление папки в настройках, работу списка со
статусами, кнопки проверки и то, что в `Storage` попали правильные значения.

Требуются `playwright` с chromium и доступ в интернет.

## Публикация

Репозиторий публикуется через GitHub Pages: workflow
`.github/workflows/pages.yml` выкладывает `plugin.js`, `store.json` и
`README.md` в корень сайта. Ссылка для установки:

```text
https://TetriBee.github.io/lampa-parser-switch/plugin.js
```

Свой домен или другой хостинг — тоже подойдёт, главное, чтобы файл
отдавался по https.

## Как добавить парсер

Плагин не поставляет адресов — пользователь добавляет их сам в настройках.
Для разработчика и для документации полезно уметь проверить инстанс:

```bash
curl -s -A "Mozilla/5.0" "http://<адрес>/api/v2.0/indexers/all/results?apikey=<ключ>&Query=test" | head -c 200
```

Если инстанс отвечает `200` и JSON с `Results` — Lampa с ним сработает.
У **JacRed** (форк Jackett) API-ключ не требуется, у обычного Jackett — нужен.

Прогоните тесты: `npm test`.

## Совместимость с API Lampa

Плагин опирается на публичные API приложения:

| Что | Где в исходниках Lampa |
|-----|--------------------------|
| Ключи настроек парсера | `src/templates/settings/parser.js` |
| Логика запроса к парсеру | `src/core/api/sources/parser.js` |
| Значения параметров (`select`/`trigger`) | `src/interaction/settings/params.js` |
| Регистрация своих настроек | `src/interaction/settings/api.js` |
| Формат стороннего магазина | `src/interaction/extensions/main.js` |

Если в новой версии Lampa поменяются ключи настроек, правки в `CONFIG.lampa`
в `plugin.js` — единственное, что понадобится.
