#!/usr/bin/env python3
"""
End-to-end проверка плагина «Переключение между парсерами» в настоящей Lampa.

Запускает официальную сборку Lampa в Chromium, подключает плагин как обычный
плагин (через <script src>), затем проверяет:

  - в разделе «Парсер» появились поля для ссылки и ключа и кнопка «Добавить»;
  - добавленный парсер сохраняется в список и прописывается в настройки Lampa;
  - переключение между двумя парсерами меняет настройки;
  - список парсеров показывает статусы доступности.
"""

import os
import sys
import time

from playwright.sync_api import sync_playwright

LAMPA_URL = "https://yumata.github.io/lampa/"
PLUGIN_ORIGIN = "https://plugins.local"

# Ссылку на плагин можно задать аргументом — так проверяется и локальная
# версия, и уже опубликованная:
#   python3 tests/e2e.py https://raw.githubusercontent.com/TetriBee/lampa-parser-switch/main/plugin.js
PLUGIN_URL = sys.argv[1] if len(sys.argv) > 1 else PLUGIN_ORIGIN + "/plugin.js"
PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  OK   " if ok else "  FAIL ") + name + ((" — " + str(detail)) if detail else ""))


def serve_plugin(route, request):
    """Отдаём файлы плагина с локального диска по выдуманному https-адресу."""
    name = request.url.rsplit("/", 1)[-1] or "index.html"
    path = os.path.join(PLUGIN_DIR, name)

    if not os.path.isfile(path):
        route.fulfill(status=404, body="not found")
        return

    with open(path, "rb") as f:
        body = f.read()

    content_type = "application/json" if name.endswith(".json") else "text/javascript"

    route.fulfill(
        status=200,
        body=body,
        headers={
            "content-type": content_type,
            "access-control-allow-origin": "*",
        },
    )


def add_parser(page, url, key=""):
    """Заполняем поля раздела «Парсер» и жмём «Добавить парсер»."""
    page.evaluate(
        """([url, key]) => {
            window.Lampa.Storage.set('parser_switch_new_url', url);
            window.Lampa.Storage.set('parser_switch_new_key', key);
            window.Lampa.Params.listener.send('button', { name: 'parser_switch_new_button' });
        }""",
        [url, key],
    )
    page.wait_for_timeout(600)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        page.route(PLUGIN_ORIGIN + "/**", serve_plugin)

        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
                if m.type == "error" else None)

        print("Открываем Lampa...")
        page.goto(LAMPA_URL, wait_until="domcontentloaded", timeout=60000)

        # При первом запуске Lampa спрашивает язык
        try:
            page.wait_for_selector("text=Русский", timeout=15000)
            page.click("text=Русский")
            print("  Выбран язык интерфейса")
        except Exception:
            print("  Экран выбора языка не показан")

        page.wait_for_function("() => window.appready === true", timeout=90000)
        print("  Lampa запустилась, appready = true")

        print("Подключаем плагин...")
        page.add_script_tag(url=PLUGIN_URL)

        page.wait_for_function(
            "() => window.Lampa && window.Lampa.SettingsApi "
            "&& !!window.Lampa.SettingsApi.getComponent('parser_switch')",
            timeout=20000,
        )

        state = page.evaluate(
            """() => ({
                components: Object.keys(window.Lampa.SettingsApi.allComponents()),
                parser_params: (window.Lampa.SettingsApi.getParam('parser') || []).map(p => p.param.name),
                own_params: (window.Lampa.SettingsApi.getParam('parser_switch') || []).map(p => p.param.name),
                torrents_use: window.lampa_settings.torrents_use,
                user_list: window.Lampa.Storage.get('parser_switch_user_list', [])
            })"""
        )

        check("папка «Парсеры» появилась в настройках", "parser_switch" in state["components"], state["components"])
        check("в разделе «Парсер» есть поля ссылки и ключа",
              {"parser_switch_new_url", "parser_switch_new_key", "parser_switch_new_button"} <= set(state["parser_params"]),
              state["parser_params"])
        check("в разделе «Парсер» есть выбор парсера",
              "parser_switch_main" in state["parser_params"], state["parser_params"])
        check("папка плагина даёт переключение, резерв и проверку",
              {"parser_switch_main", "parser_switch_backup", "parser_switch_auto"} <= set(state["own_params"]),
              state["own_params"])
        check("раздел «Парсер» включён (torrents_use)", state["torrents_use"] is True)
        check("плагин стартует с пустым списком", len(state["user_list"]) == 0, state["user_list"])

        # ── добавляем два парсера, как это сделал бы пользователь ──────────
        print("Добавляем парсеры...")
        add_parser(page, "https://jac.red")
        add_parser(page, "https://jr.maxvol.pro")

        added = page.evaluate(
            """() => window.Lampa.Storage.get('parser_switch_user_list', [])
                    .map(p => ({ id: p.id, url: p.url, key: p.key }))"""
        )
        check("оба парсера попали в список", len(added) == 2, added)
        check("у парсеров без ключа ключ пустой", all(not p["key"] for p in added), added)

        settings = page.evaluate(
            """() => ({
                url: window.Lampa.Storage.get('jackett_url'),
                type: window.Lampa.Storage.get('parser_torrent_type'),
                use: window.Lampa.Storage.get('parser_use'),
                main: window.Lampa.Storage.get('parser_switch_main')
            })"""
        )
        check("парсер прописан в настройки Lampa",
              settings["url"] in ("https://jac.red", "https://jr.maxvol.pro"), settings)
        check("парсер включён", settings["use"] is True, settings)

        # ── переключаемся между парсерами ──────────────────────────────────
        switched = page.evaluate(
            """() => {
                const users = window.Lampa.Storage.get('parser_switch_user_list', []);
                const target = users.find(u => u.url.indexOf('jr.maxvol.pro') > -1);
                const param = window.Lampa.SettingsApi.getParam('parser')
                    .find(p => p.param.name === 'parser_switch_main');
                param.onChange(target.id);
                return {
                    url: window.Lampa.Storage.get('jackett_url'),
                    main: window.Lampa.Storage.get('parser_switch_main')
                };
            }"""
        )
        check("переключение между парсерами работает",
              switched["url"] == "https://jr.maxvol.pro", switched)

        # ── список парсеров со статусами ──────────────────────────────────
        page.evaluate("() => window.Lampa.Controller.toggle('settings')")
        page.wait_for_timeout(1500)

        folder = page.evaluate(
            """() => {
                const el = document.querySelector('.settings-folder[data-component="parser_switch"]');
                return el ? el.textContent.trim() : null;
            }"""
        )
        check("папка «Парсеры» видна в интерфейсе настроек", folder is not None, folder)

        # ── встроенный раздел «Парсер» ───────────────────────────────────
        # Именно его открытие проверяем: там плагин добавляет поля ввода
        page.evaluate(
            """() => {
                const el = document.querySelector('.settings-folder[data-component="parser"]');
                if (el) el.dispatchEvent(new Event('hover:enter', {bubbles: true}));
            }"""
        )
        page.wait_for_timeout(2000)

        in_parser = page.evaluate(
            """() => [...document.querySelectorAll('.settings-param')]
                    .map(e => e.getAttribute('data-name')).filter(Boolean)"""
        ) or []

        check("раздел «Парсер» открывается и показывает поля",
              "parser_switch_new_url" in in_parser and "parser_switch_new_key" in in_parser, in_parser)

        broken = page.evaluate("() => !!document.querySelector('.about, .error')")
        check("раздел «Парсер» отрисован без ошибок", not broken)

        # Возвращаемся к списку настроек
        page.evaluate("() => window.Lampa.Controller.back()")
        page.wait_for_timeout(1500)

        page.evaluate(
            """() => {
                const el = document.querySelector('.settings-folder[data-component="parser_switch"]');
                if (el) el.dispatchEvent(new Event('hover:enter', {bubbles: true}));
            }"""
        )
        page.wait_for_timeout(1500)

        page.evaluate(
            """() => {
                const el = document.querySelector('[data-name="parser_switch_list_button"]');
                if (el) el.dispatchEvent(new Event('hover:enter', {bubbles: true}));
            }"""
        )

        deadline = time.time() + 60
        subs = []

        while time.time() < deadline:
            subs = page.evaluate(
                """() => [...document.querySelectorAll('.selectbox-item__subtitle')].map(e => e.textContent.trim())"""
            ) or []

            if any("Доступен" in s or "Недоступен" in s for s in subs):
                break

            time.sleep(2)

        sheet = page.evaluate(
            """() => [...document.querySelectorAll('.selectbox-item__title')].map(e => e.textContent.trim())"""
        ) or []

        check("список парсеров открывается", len(sheet) >= 2, sheet)
        check("в списке появились статусы",
              any("Доступен" in s or "Недоступен" in s for s in subs), subs)

        page.evaluate("() => window.Lampa.Select.close()")
        page.wait_for_timeout(600)

        # ── кнопка проверки ────────────────────────────────────────────────
        clicked = page.evaluate(
            """() => {
                const el = document.querySelector('[data-name="parser_switch_check_button"]');
                if (!el) return false;
                el.dispatchEvent(new Event('hover:enter', {bubbles: true}));
                return true;
            }"""
        )
        check("кнопка проверки доступна в интерфейсе", clicked)

        page.wait_for_timeout(12000)

        noty = page.evaluate("() => document.querySelector('.noty')?.textContent?.trim()")
        check("проверка отработала и показала результат", noty is not None, noty)

        status = page.evaluate("() => window.Lampa.Storage.get('parser_switch_status', {})")
        resolved = {k: v.get("base") for k, v in (status or {}).items() if v.get("ok")}

        check("плагин запомнил рабочий протокол для доступных парсеров",
              len(resolved) > 0 and all(str(b).startswith("http") for b in resolved.values()),
              resolved)

        real_errors = [e for e in errors if "favicon" not in e.lower()]

        browser.close()

    failed = [r for r in results if not r[1]]

    print()
    print(f"Итог: {len(results) - len(failed)}/{len(results)} проверок пройдено")

    if real_errors:
        print("Ошибки в консоли:")
        for e in real_errors[:10]:
            print("  -", e[:300])

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
