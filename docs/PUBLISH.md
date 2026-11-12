# Публикация

## Что уже есть

Репозиторий: `https://github.com/TetriBee/lampa-parser-switch`

## Ссылка для установки

```text
https://cdn.jsdelivr.net/gh/TetriBee/lampa-parser-switch@main/plugin.js
```

jsDelivr работает сразу и отдаёт файл с правильным `content-type`, поэтому
плагин исполняется. Ссылка `raw.githubusercontent.com` **не подходит**: GitHub
отдаёт оттуда `text/plain` с `nosniff`, и браузер такие скрипты не выполняет.

## GitHub Pages (своя ссылка)

Чтобы заработал адрес `https://TetriBee.github.io/lampa-parser-switch/plugin.js`:

1. Положить в репозиторий файл `.github/workflows/pages.yml` (он уже есть в
   этом репозитории, см. ниже).
2. В репозитории: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**.
3. После этого workflow сам выложит `plugin.js`, `store.json` и `README.md`.

## Как долить остальные файлы

Если в репозитории пока только `plugin.js`, остальное можно залить так:

```bash
cd lampa-parser-switch
git remote add origin https://github.com/TetriBee/lampa-parser-switch.git
git pull --rebase origin main      # содержимое plugin.js совпадает, конфликтов не будет
git push -u origin main
```

Либо через веб-интерфейс GitHub: **Add file → Upload files** — но вложенную
папку `.github/workflows` так не загрузить, для workflow придётся создать файл
вручную по пути `.github/workflows/pages.yml`.

## Что должно лежать в репозитории

```text
plugin.js                 # сам плагин
README.md                 # описание
LICENSE                   # MIT
store.json                # запись для стороннего магазина плагинов Lampa
package.json              # npm test / npm run e2e
docs/INSTALL.md           # установка на ТВ
docs/DEVELOPING.md        # разработка
docs/screenshot.png       # скриншоты
tests/                    # тесты
.github/workflows/pages.yml  # автопубликация на Pages
```

## Свой магазин плагинов

`store.json` можно опубликовать рядом с плагином и открыть в Lampa как
сторонний магазин: **Настройки → Расширения → свой магазин → ссылка на
store.json**.
