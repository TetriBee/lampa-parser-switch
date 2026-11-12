/*!
 * Lampa — плагин «Переключение между парсерами»
 * =============================================
 *
 * Что делает:
 *   - даёт завести свой список торрент-парсеров (ссылка + API-ключ);
 *   - переключает активный парсер в один тап, без ручного ввода в настройки Lampa;
 *   - умеет держать резервный парсер (Lampa склеивает выдачу двух ссылок);
 *   - проверяет доступность парсеров и в автоматическом режиме переключается
 *     на рабочий, если текущий упал.
 *
 * Плагин не поставляет ни адресов, ни ключей: список заполняет пользователь
 * в разделе «Настройки → Парсер» → «Добавить парсер».
 *
 * Установка:
 *   Lampa → Настройки → Расширения → Добавить плагин → <ссылка на этот файл>
 *
 * Лицензия: MIT
 * Автор: TetriBee
 */

(function (root, factory) {
    'use strict';

    var api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;

        return;
    }

    api.boot(root);
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Флаг загрузки                                                       */
    /* ------------------------------------------------------------------ */

    var PLUGIN_FLAG = 'lampa_parser_switch_loaded';

    /* ------------------------------------------------------------------ */
    /* Настройки плагина                                                    */
    /* ------------------------------------------------------------------ */

    var CONFIG = {
        // Папка в настройках Lampa
        component: 'parser_switch',

        // Ключи настроек самой Lampa, которые меняет плагин
        lampa: {
            use:       'parser_use',
            type:      'parser_torrent_type',
            link:      'parser_use_link',
            interview: 'jackett_interview',
            url:       { jackett: 'jackett_url',     prowlarr: 'prowlarr_url' },
            key:       { jackett: 'jackett_key',     prowlarr: 'prowlarr_key' },
            url_two:   { jackett: 'jackett_url_two', prowlarr: 'prowlarr_url_two' },
            key_two:   { jackett: 'jackett_key_two', prowlarr: 'prowlarr_key_two' }
        },

        // Собственные ключи плагина (хранятся в localStorage Lampa)
        own: {
            main:      'parser_switch_main',
            backup:    'parser_switch_backup',
            auto:      'parser_switch_auto',
            status:    'parser_switch_status',
            user_list: 'parser_switch_user_list',
            new_url:   'parser_switch_new_url',
            new_key:   'parser_switch_new_key'
        },

        // Таймаут проверки доступности, мс
        timeout: 4000,

        // Как часто перепроверять парсеры в автоматическом режиме, мс
        auto_interval: 1000 * 60 * 5,

        // Lampa из магазинов LG/Tizen прячет раздел «Парсер» (torrents_use = false).
        // Плагин возвращает его — иначе парсером нельзя пользоваться.
        // Аналогично делает штатный плагин etor.
        enable_torrents_section: true,

        // «Облегчённый» режим сборок из магазина: read_only и demo.
        // Если не хотите трогать эти флаги — поставьте false.
        disable_light_mode: true
    };

    /* ------------------------------------------------------------------ */
    /* Переводы                                                             */
    /* ------------------------------------------------------------------ */

    var LANG = {
        parser_switch_title: {
            ru: 'Парсеры',
            en: 'Parsers',
            uk: 'Парсери',
            be: 'Парсеры',
            bg: 'Парсери'
        },
        parser_switch_main: {
            ru: 'Парсер',
            en: 'Parser',
            uk: 'Парсер',
            be: 'Парсер',
            bg: 'Парсер'
        },
        parser_switch_main_descr: {
            ru: 'Какой парсер использовать для поиска торрентов',
            en: 'Which parser to use for torrent search',
            uk: 'Який парсер використовувати для пошуку торентів',
            be: 'Які парсер выкарыстоўваць для пошуку тэрэнтаў',
            bg: 'Кой парсер да използва за търсене на торенти'
        },
        parser_switch_backup: {
            ru: 'Резервный парсер',
            en: 'Backup parser',
            uk: 'Резервний парсер',
            be: 'Рэзервовы парсер',
            bg: 'Резервен парсер'
        },
        parser_switch_backup_descr: {
            ru: 'Если основной парсер недоступен, Lampa возьмёт результаты с резервного',
            en: 'If the main parser is down, Lampa will take results from the backup one',
            uk: 'Якщо основний парсер недоступний, Lampa візьме результати з резервного',
            be: 'Калі асноўны парсер недаступны, Lampa возьме вынікі з рэзервовага',
            bg: 'Ако основният парсер е недостъпен, Lampa ще вземе резултатите от резервния'
        },
        parser_switch_auto: {
            ru: 'Автопереключение',
            en: 'Auto switch',
            uk: 'Автоперемикання',
            be: 'Аўтапераключэнне',
            bg: 'Автоматично превключване'
        },
        parser_switch_auto_descr: {
            ru: 'Проверять парсеры и переключаться на рабочий, если текущий упал',
            en: 'Check parsers and switch to a working one if the current one is down',
            uk: 'Перевіряти парсери та перемикатися на робочий, якщо поточний впав',
            be: 'Правяраць парсеры і пераключацца на працоўны, калі бягучы адваліўся',
            bg: 'Проверява парсерите и се превключва към работещ, ако текущият е паднал'
        },
        parser_switch_list: {
            ru: 'Список парсеров',
            en: 'Parser list',
            uk: 'Список парсерів',
            be: 'Спіс парсераў',
            bg: 'Списък на парсерите'
        },
        parser_switch_check: {
            ru: 'Проверить доступность',
            en: 'Check availability',
            uk: 'Перевірити доступність',
            be: 'Праверыць даступнасць',
            bg: 'Проверка на достъпност'
        },
        parser_switch_checking: {
            ru: 'Проверяем парсеры...',
            en: 'Checking parsers...',
            uk: 'Перевіряємо парсери...',
            be: 'Правяраем парсеры...',
            bg: 'Проверяваме парсерите...'
        },
        parser_switch_checked: {
            ru: 'Доступно парсеров',
            en: 'Available parsers',
            uk: 'Доступних парсерів',
            be: 'Даступных парсераў',
            bg: 'Достъпни парсери'
        },
        parser_switch_new_url: {
            ru: 'Парсер — ссылка',
            en: 'Parser — address',
            uk: 'Парсер — адреса',
            be: 'Парсер — адрас',
            bg: 'Парсер — адрес'
        },
        parser_switch_new_key: {
            ru: 'Парсер — API-ключ',
            en: 'Parser — API key',
            uk: 'Парсер — API-ключ',
            be: 'Парсер — API-ключ',
            bg: 'Парсер — API ключ'
        },
        parser_switch_new_descr: {
            ru: 'Вставьте ссылку и ключ, затем нажмите «Добавить парсер». Добавить можно сколько угодно',
            en: 'Paste the address and key, then press «Add parser». You can add as many as you need',
            uk: 'Вставте адресу та ключ, потім натисніть «Додати парсер». Додати можна скільки завгодно',
            be: 'Устаўце адрас і ключ, потым націсніце «Дадаць парсер». Дадаць можна столькі, колькі трэба',
            bg: 'Поставете адреса и ключ, после натиснете «Добави парсер». Може да добавите колкото искате'
        },
        parser_switch_new_add: {
            ru: 'Добавить парсер',
            en: 'Add parser',
            uk: 'Додати парсер',
            be: 'Дадаць парсер',
            bg: 'Добави парсер'
        },
        parser_switch_new_added: {
            ru: 'Парсер добавлен',
            en: 'Parser added',
            uk: 'Парсер додано',
            be: 'Парсер дададзены',
            bg: 'Парсерът е добавен'
        },
        parser_switch_new_empty: {
            ru: 'Укажите ссылку на парсер',
            en: 'Enter the parser address',
            uk: 'Вкажіть адресу парсера',
            be: 'Укажыце адрас парсера',
            bg: 'Въведете адреса на парсера'
        },
        parser_switch_new_deleted: {
            ru: 'Парсер удалён',
            en: 'Parser deleted',
            uk: 'Парсер видалено',
            be: 'Парсер выдалены',
            bg: 'Парсерът е изтрит'
        },
        parser_switch_delete_title: {
            ru: 'Удалить парсер?',
            en: 'Delete parser?',
            uk: 'Видалити парсер?',
            be: 'Выдаліць парсер?',
            bg: 'Да изтриете ли парсера?'
        },
        parser_switch_delete_descr: {
            ru: 'Парсер будет удалён из списка. Настройки Lampa не изменятся.',
            en: 'The parser will be removed from the list. Lampa settings stay unchanged.',
            uk: 'Парсер буде видалено зі списку. Налаштування Lampa не зміняться.',
            be: 'Парсер будзе выдалены са спіска. Налады Lampa не зменяцца.',
            bg: 'Парсерът ще бъде изтрит от списъка. Настройките на Lampa не се променят.'
        },
        parser_switch_delete_hint: {
            ru: 'Удерживайте ОК, чтобы удалить парсер',
            en: 'Hold OK to delete a parser',
            uk: 'Утримуйте ОК, щоб видалити парсер',
            be: 'Утрымайце ОК, каб выдаліць парсер',
            bg: 'Задръжте ОК, за да изтриете парсер'
        },
        parser_switch_empty: {
            ru: 'Список пуст — добавьте парсер',
            en: 'List is empty — add a parser',
            uk: 'Список порожній — додайте парсер',
            be: 'Спіс пусты — дададзьце парсер',
            bg: 'Списъкът е празен — добавете парсер'
        },
        parser_switch_applied: {
            ru: 'Парсер включён',
            en: 'Parser enabled',
            uk: 'Парсер увімкнено',
            be: 'Парсер уключаны',
            bg: 'Парсерът е включен'
        },
        parser_switch_backup_set: {
            ru: 'Резервный парсер установлен',
            en: 'Backup parser set',
            uk: 'Резервний парсер встановлено',
            be: 'Рэзервовы парсер устаноўлены',
            bg: 'Резервният парсер е зададен'
        },
        parser_switch_backup_off: {
            ru: 'Резервный парсер отключён',
            en: 'Backup parser disabled',
            uk: 'Резервний парсер вимкнено',
            be: 'Рэзервовы парсер выключаны',
            bg: 'Резервният парсер е изключен'
        },
        parser_switch_available: {
            ru: 'Доступен',
            en: 'Available',
            uk: 'Доступний',
            be: 'Даступны',
            bg: 'Достъпен'
        },
        parser_switch_unavailable: {
            ru: 'Недоступен',
            en: 'Unavailable',
            uk: 'Недоступний',
            be: 'Недаступны',
            bg: 'Недостъпен'
        },
        parser_switch_unknown: {
            ru: 'Не проверялся',
            en: 'Not checked',
            uk: 'Не перевірявся',
            be: 'Не правяраўся',
            bg: 'Не е проверяван'
        },
        parser_switch_not_selected: {
            ru: 'Не выбран',
            en: 'Not selected',
            uk: 'Не вибрано',
            be: 'Не выбраны',
            bg: 'Не е избран'
        },
        parser_switch_fallback: {
            ru: 'Основной парсер недоступен, включён резервный',
            en: 'Main parser is down, backup parser enabled',
            uk: 'Основний парсер недоступний, увімкнено резервний',
            be: 'Асноўны парсер недаступны, уключаны рэзервовы',
            bg: 'Основният парсер е недостъпен, включен е резервният'
        },
        parser_switch_switched: {
            ru: 'Парсер переключён автоматически',
            en: 'Parser switched automatically',
            uk: 'Парсер перемкнено автоматично',
            be: 'Парсер пераключаны аўтаматычна',
            bg: 'Парсерът е превключен автоматично'
        },
        parser_switch_none: {
            ru: 'Ни один парсер сейчас не доступен',
            en: 'No parsers are available right now',
            uk: 'Жоден парсер зараз недоступний',
            be: 'Ні адзін парсер зараз недаступны',
            bg: 'В момента няма достъпен парсер'
        }
    };

    /* ------------------------------------------------------------------ */
    /* Ядро: чистые функции без зависимости от Lampa (покрыты тестами)     */
    /* ------------------------------------------------------------------ */

    /**
     * Идентификатор из названия
     * @param {string} text
     * @returns {string}
     */
    function slug(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[^a-z0-9а-яё]+/gi, '-')
            .replace(/^-+|-+$/g, '');
    }

    /**
     * Приводит список парсеров к единому виду.
     * Принимает массив или объект вида {results: [...]} / {parsers: [...]}.
     *
     * @param {Array|Object} raw
     * @returns {Array}
     */
    function normalizeList(raw) {
        var result = [];
        var seen   = {};

        if (!raw) return result;

        if (!Array.isArray(raw)) {
            if (Array.isArray(raw.parsers)) raw = raw.parsers;
            else if (Array.isArray(raw.results)) raw = raw.results;
        }

        if (!Array.isArray(raw)) return result;

        raw.forEach(function (item) {
            if (!item || typeof item !== 'object') return;

            var url = item.url || item.baseUrl || item.base || '';

            if (!url) return;

            url = String(url).trim();

            if (!url) return;

            var name = String(item.name || item.title || item.id || '').trim() || url;
            var id   = String(item.id || '').trim() || slug(name);

            if (!id || seen[id]) return;

            seen[id] = true;

            result.push({
                id: id,
                name: name,
                url: url.replace(/\/+$/, ''),
                key: item.key == null ? '' : String(item.key),
                type: item.type === 'prowlarr' ? 'prowlarr' : 'jackett',
                interview: item.interview === 'healthy' ? 'healthy' : 'all',
                note: String(item.note || item.descr || '')
            });
        });

        return result;
    }

    /**
     * Адрес парсера с протоколом
     * @param {string} url
     * @returns {string}
     */
    function baseUrl(url) {
        var u = String(url || '').trim();

        if (!u) return '';

        if (!/^https?:\/\//i.test(u)) u = 'http://' + u;

        return u.replace(/\/+$/, '');
    }

    /**
     * Меняет протокол местами: http://x → https://x и наоборот.
     * Нужно, чтобы проверить парсер и по тому протоколу, по которому
     * приложение реально ходит к серверам.
     *
     * @param {string} url
     * @returns {string}
     */
    function swapProtocol(url) {
        var u = String(url || '');

        if (u.indexOf('https://') === 0) return 'http://' + u.slice(8);
        if (u.indexOf('http://') === 0) return 'https://' + u.slice(7);

        return '';
    }

    /**
     * Путь API для проверки доступности. Ровно тот же запрос, который Lampa
     * делает при поиске торрентов, — поэтому «доступен» здесь значит
     * «доступен и для Lampa».
     *
     * @param {Object} parser
     * @returns {string}
     */
    function checkPath(parser) {
        if (!parser) return '';

        var key = encodeURIComponent(parser.key || '');

        if (parser.type === 'prowlarr')
            return '/api/v1/search?apikey=' + key + '&query=' + encodeURIComponent('test');

        var indexers = parser.interview === 'healthy' ? 'status:healthy' : 'all';

        return '/api/v2.0/indexers/' + indexers + '/results?apikey=' + key + '&Query=' + encodeURIComponent('test');
    }

    /**
     * Полный адрес проверки
     * @param {Object} parser
     * @param {string} [base] — адрес с уже выбранным протоколом
     * @returns {string}
     */
    function checkUrl(parser, base) {
        if (!parser) return '';

        var root = baseUrl(base || parser.url);

        if (!root) return '';

        return root + checkPath(parser);
    }

    /**
     * Поиск парсера по id
     * @param {Array} list
     * @param {string} id
     * @returns {Object|null}
     */
    function findParser(list, id) {
        if (!id) return null;

        var items = Array.isArray(list) ? list : [];

        for (var i = 0; i < items.length; i++) {
            if (items[i] && items[i].id === id) return items[i];
        }

        return null;
    }

    /**
     * Карта {id: название} для select-параметра Lampa
     * @param {Array} list
     * @param {boolean} [withEmpty]
     * @returns {Object}
     */
    function parserValues(list, withEmpty) {
        var values = {};

        if (withEmpty) values[''] = '#{parser_switch_not_selected}';

        (Array.isArray(list) ? list : []).forEach(function (item) {
            if (item && item.id) values[item.id] = item.name;
        });

        return values;
    }

    /**
     * Прописывает парсер в настройки Lampa.
     *
     * slot = 'one' — основной парсер, slot = 'two' — резервный.
     * opts.url — адрес с протоколом (если проверка показала, какой работает).
     *
     * @param {Object} storage — Lampa.Storage
     * @param {Object} parser
     * @param {Object} [opts]
     * @returns {boolean}
     */
    function applyParser(storage, parser, opts) {
        opts = opts || {};

        if (!storage || !parser) return false;

        var type = parser.type === 'prowlarr' ? 'prowlarr' : 'jackett';
        var slot = opts.slot === 'two' ? 'two' : 'one';
        var url  = opts.url || parser.url;

        storage.set(CONFIG.lampa.type, type);

        if (slot === 'two') {
            storage.set(CONFIG.lampa.url_two[type], url);
            storage.set(CONFIG.lampa.key_two[type], parser.key);
        }
        else {
            storage.set(CONFIG.lampa.url[type], url);
            storage.set(CONFIG.lampa.key[type], parser.key);
        }

        if (type === 'jackett')
            storage.set(CONFIG.lampa.interview, parser.interview === 'healthy' ? 'healthy' : 'all');

        storage.set(CONFIG.lampa.use, true);

        return true;
    }

    /**
     * Какой парсер сейчас прописан в настройках Lampa
     * @param {Object} storage — Lampa.Storage
     * @param {Array} list
     * @returns {Object|null}
     */
    function currentParser(storage, list) {
        if (!storage) return null;

        var url = String(storage.get(CONFIG.lampa.url.jackett, '') || '').replace(/\/+$/, '');

        if (!url) return null;

        var items = Array.isArray(list) ? list : [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            if (!item) continue;

            if (String(item.url).replace(/\/+$/, '') === url) return item;
        }

        return null;
    }

    /* ------------------------------------------------------------------ */
    /* Интерфейс                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * @param {Window} window
     * @returns {boolean}
     */
    function boot(window) {
        if (!window) return false;

        if (window[PLUGIN_FLAG]) return false;

        window[PLUGIN_FLAG] = { timer: null };

        // В сборках Lampa из магазинов LG/Tizen раздел «Парсер» выключен.
        // Возвращаем его — без этого парсером пользоваться невозможно.
        if (window.lampa_settings) {
            if (CONFIG.enable_torrents_section)
                window.lampa_settings.torrents_use = true;

            if (CONFIG.disable_light_mode) {
                window.lampa_settings.read_only = false;
                window.lampa_settings.demo      = false;
            }
        }

        function start() {
            var Lampa = window.Lampa;

            if (!Lampa) {
                setTimeout(start, 100);

                return;
            }

            var net_check = new Lampa.Reguest();

            var list   = [];   // список парсеров пользователя
            var status = {};   // id -> {ok, time, base}
            var timer  = null;

            if (Lampa.Lang && Lampa.Lang.add) Lampa.Lang.add(LANG);

            /* ------------------ список парсеров ------------------ */

            /**
             * Парсеры, добавленные пользователем
             * @returns {Array}
             */
            function userParsers() {
                return normalizeList(Lampa.Storage.get(CONFIG.own.user_list, '[]'));
            }

            function reloadList() {
                list = userParsers();

                return list;
            }

            /* ------------------ добавление и удаление ------------------ */

            /**
             * Добавляет парсер из полей ввода в список и делает его основным.
             */
            function addParser(quiet) {
                var url = String(Lampa.Storage.get(CONFIG.own.new_url, '') || '').trim();
                var key = String(Lampa.Storage.get(CONFIG.own.new_key, '') || '').trim();

                if (!url) {
                    if (!quiet) Lampa.Noty.show(Lampa.Lang.translate('parser_switch_new_empty'));

                    return false;
                }

                var host = url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0];

                var parser = {
                    id: 'user_' + slug(host),
                    name: host,
                    url: url.replace(/\/+$/, ''),
                    key: key,
                    type: 'jackett',
                    interview: 'all',
                    note: url
                };

                var users = userParsers().filter(function (item) {
                    return item.id !== parser.id;
                });

                users.unshift(parser);

                Lampa.Storage.set(CONFIG.own.user_list, users);

                Lampa.Storage.set(CONFIG.own.new_url, '');
                Lampa.Storage.set(CONFIG.own.new_key, '');

                reloadList();

                updateValues();

                applyMain(parser.id, quiet);

                if (!quiet)
                    Lampa.Noty.show(Lampa.Lang.translate('parser_switch_new_added') + ': ' + host, { time: 2500 });

                return true;
            }

            /**
             * Удаляет парсер из списка пользователя
             */
            function removeParser(id) {
                if (!id || id.indexOf('user_') !== 0) return false;

                var users = userParsers().filter(function (item) {
                    return item.id !== id;
                });

                Lampa.Storage.set(CONFIG.own.user_list, users);

                if (Lampa.Storage.get(CONFIG.own.main, '') === id) Lampa.Storage.set(CONFIG.own.main, '');
                if (Lampa.Storage.get(CONFIG.own.backup, '') === id) Lampa.Storage.set(CONFIG.own.backup, '');

                reloadList();

                updateValues();

                Lampa.Noty.show(Lampa.Lang.translate('parser_switch_new_deleted'), { time: 2500 });

                return true;
            }

            function confirmRemove(id) {
                if (!Lampa.Modal || !Lampa.Modal.open) {
                    removeParser(id);

                    return;
                }

                Lampa.Modal.open({
                    title: Lampa.Lang.translate('parser_switch_delete_title'),
                    align: 'center',
                    html: $('<div class="about">' + Lampa.Lang.translate('parser_switch_delete_descr') + '</div>'),
                    buttons: [
                        {
                            name: Lampa.Lang.translate('settings_param_no'),
                            onSelect: function () {
                                Lampa.Modal.close();
                            }
                        },
                        {
                            name: Lampa.Lang.translate('settings_param_yes'),
                            onSelect: function () {
                                Lampa.Modal.close();

                                removeParser(id);
                            }
                        }
                    ],
                    onBack: function () {
                        Lampa.Modal.close();
                    }
                });
            }

            /* ------------------ применение ------------------ */

            function applyMain(id, quiet) {
                var parser = findParser(list, id);

                if (!parser) return false;

                applyParser(Lampa.Storage, parser, { slot: 'one', url: resolvedUrl(parser) });

                Lampa.Storage.set(CONFIG.own.main, id);

                var backup = findParser(list, Lampa.Storage.get(CONFIG.own.backup, ''));

                if (backup) {
                    applyParser(Lampa.Storage, backup, { slot: 'two', url: resolvedUrl(backup) });

                    Lampa.Storage.set(CONFIG.lampa.link, 'both');
                }
                else {
                    Lampa.Storage.set(CONFIG.lampa.link, 'one');
                }

                if (!quiet)
                    Lampa.Noty.show(Lampa.Lang.translate('parser_switch_applied') + ': ' + parser.name, { time: 2500 });

                return true;
            }

            function applyBackup(id, quiet) {
                var parser = findParser(list, id);

                if (!parser) {
                    // Такого парсера в списке нет — сбрасываем выбор
                    Lampa.Storage.set(CONFIG.own.backup, '');

                    Lampa.Storage.set(CONFIG.lampa.link, 'one');

                    if (!quiet) Lampa.Noty.show(Lampa.Lang.translate('parser_switch_backup_off'));

                    return false;
                }

                Lampa.Storage.set(CONFIG.own.backup, id);

                applyParser(Lampa.Storage, parser, { slot: 'two', url: resolvedUrl(parser) });

                Lampa.Storage.set(CONFIG.lampa.link, 'both');

                if (!quiet)
                    Lampa.Noty.show(Lampa.Lang.translate('parser_switch_backup_set') + ': ' + parser.name, { time: 2500 });

                return true;
            }

            /**
             * Адрес парсера с протоколом, который реально отвечает.
             * Если проверка ещё не проходила — обычный адрес из списка.
             */
            function resolvedUrl(parser) {
                var st = status[parser.id];

                return st && st.ok && st.base ? st.base : parser.url;
            }

            /* ------------------ проверка доступности ------------------ */

            function checkOne(parser, done) {
                // Сначала пробуем тот адрес, по которому к парсеру пойдёт сама Lampa,
                // параллельно — вариант с другим протоколом.
                var bases = [];

                bases.push(Lampa.Utils.checkEmptyUrl(parser.url));

                var alternate = swapProtocol(bases[0]);

                if (alternate) bases.push(alternate);

                var pending  = bases.length;
                var finished = false;

                function failed() {
                    pending--;

                    if (pending <= 0 && !finished) {
                        finished = true;

                        done(false, '');
                    }
                }

                bases.forEach(function (base) {
                    net_check.timeout(CONFIG.timeout);

                    net_check.silent(checkUrl(parser, base), function (json) {
                        if (finished) return;

                        if (json && json.error) {
                            failed();

                            return;
                        }

                        finished = true;

                        done(true, base);
                    }, failed);
                });
            }

            function checkAll(done) {
                var items   = list.slice(0);
                var result  = {};
                var pending = items.length;

                function finish() {
                    status = result;

                    Lampa.Storage.set(CONFIG.own.status, result);

                    updateValues();

                    if (done) done(result);
                }

                if (!pending) {
                    finish();

                    return;
                }

                // Проверяем все парсеры одновременно — иначе ожидание растёт
                items.forEach(function (parser) {
                    checkOne(parser, function (ok, base) {
                        result[parser.id] = { ok: ok, time: Date.now(), base: ok ? base : '' };

                        if (--pending <= 0) finish();
                    });
                });
            }

            /* ------------------ значения для select ------------------ */

            function updateValues() {
                var values = {};

                list.forEach(function (item) {
                    var st = status[item.id];
                    var mark = '';

                    if (st) mark = st.ok ? ' ✓' : ' ✗';

                    values[item.id] = item.name + mark;
                });

                values[''] = '#{parser_switch_not_selected}';

                Lampa.Params.select(CONFIG.own.main, values, '');
                Lampa.Params.select(CONFIG.own.backup, values, '');

                // Перерисовываем настройки, только если их сейчас видно
                var enabled = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled().name : '';

                if (enabled == 'settings' || enabled == 'settings_component')
                    Lampa.Settings.update();
            }

            /* ------------------ список с галочками ------------------ */

            function needCheck() {
                var time = 0;

                for (var id in status) {
                    if (!status[id] || !status[id].time) continue;

                    time = Math.max(time, status[id].time);
                }

                if (!time) return true;

                return Date.now() - time > CONFIG.auto_interval;
            }

            function showList() {
                var items  = [];
                var mainId = Lampa.Storage.get(CONFIG.own.main, '');

                // На чём был фокус до открытия списка — туда и вернёмся по «назад»
                var enabled = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled().name : '';

                if (!list.length) {
                    items.push({
                        title: Lampa.Lang.translate('parser_switch_empty'),
                        subtitle: Lampa.Lang.translate('parser_switch_new_descr'),
                        value: ''
                    });
                }

                list.forEach(function (item) {
                    var st = status[item.id];

                    var subtitle = item.note || item.url;

                    if (st) subtitle = Lampa.Lang.translate(st.ok ? 'parser_switch_available' : 'parser_switch_unavailable') + ' · ' + subtitle;
                    else subtitle = Lampa.Lang.translate('parser_switch_unknown') + ' · ' + subtitle;

                    items.push({
                        title: item.name,
                        subtitle: subtitle,
                        value: item.id,
                        selected: item.id === mainId
                    });
                });

                Lampa.Select.show({
                    title: Lampa.Lang.translate('parser_switch_list'),
                    items: items,
                    onBack: function () {
                        // close() вызывает onBack — закрывать лист самому нельзя,
                        // только вернуть фокус на предыдущий экран
                        if (enabled) Lampa.Controller.toggle(enabled);
                    },
                    onSelect: function (item) {
                        if (!item || !item.value) return;

                        applyMain(item.value);
                    },
                    onLong: function (item) {
                        // долгое нажатие — удалить свой парсер из списка
                        if (!item || !item.value || item.value.indexOf('user_') !== 0) return;

                        confirmRemove(item.value);
                    }
                });

                // Статусы устарели — проверяем заново и обновляем список
                if (needCheck()) {
                    checkAll(function () {
                        if (!Lampa.Select.opened()) return;

                        setTimeout(function () {
                            if (!Lampa.Select.opened()) return;

                            Lampa.Select.close();

                            showList();
                        }, 300);
                    });
                }
            }

            /* ------------------ автоматический режим ------------------ */

            function autoCheck() {
                if (!Lampa.Storage.get(CONFIG.own.auto, false)) return;

                if (!list.length) return;

                checkAll(function (result) {
                    var main = findParser(list, Lampa.Storage.get(CONFIG.own.main, ''));

                    if (main && result[main.id] && result[main.id].ok) return;

                    var backup = findParser(list, Lampa.Storage.get(CONFIG.own.backup, ''));

                    if (backup && result[backup.id] && result[backup.id].ok) {
                        applyMain(backup.id, true);

                        Lampa.Noty.show(Lampa.Lang.translate('parser_switch_fallback') + ': ' + backup.name, { time: 4000 });

                        return;
                    }

                    for (var i = 0; i < list.length; i++) {
                        var parser = list[i];

                        if (result[parser.id] && result[parser.id].ok) {
                            applyMain(parser.id, true);

                            Lampa.Noty.show(Lampa.Lang.translate('parser_switch_switched') + ': ' + parser.name, { time: 4000 });

                            return;
                        }
                    }

                    Lampa.Noty.show(Lampa.Lang.translate('parser_switch_none'), { time: 4000 });
                });
            }

            /* ------------------ настройки ------------------ */

            function registerSettings() {
                var values = parserValues(list, true);

                Lampa.Params.select(CONFIG.own.main, values, '');
                Lampa.Params.select(CONFIG.own.backup, values, '');
                Lampa.Params.trigger(CONFIG.own.auto, false);

                Lampa.Params.select(CONFIG.own.new_url, '', '');
                Lampa.Params.select(CONFIG.own.new_key, '', '');

                Lampa.SettingsApi.addComponent({
                    component: CONFIG.component,
                    icon: '<svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 14h20l-5-5M34 28H14l5 5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    name: Lampa.Lang.translate('parser_switch_title')
                });

                // --- добавление парсера: прямо в разделе «Парсер» ---

                Lampa.SettingsApi.addParam({
                    component: 'parser',
                    param: {
                        name: CONFIG.own.new_url,
                        type: 'input',
                        values: '',
                        default: ''
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_new_url'),
                        description: Lampa.Lang.translate('parser_switch_new_descr')
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: 'parser',
                    param: {
                        name: CONFIG.own.new_key,
                        type: 'input',
                        values: '',
                        default: ''
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_new_key')
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: 'parser',
                    param: {
                        name: 'parser_switch_new_button',
                        type: 'button',
                        default: false
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_new_add')
                    }
                });

                // --- выбор активного парсера: тоже в разделе «Парсер» ---

                Lampa.SettingsApi.addParam({
                    component: 'parser',
                    param: {
                        name: CONFIG.own.main,
                        type: 'select',
                        values: values,
                        default: ''
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_main'),
                        description: Lampa.Lang.translate('parser_switch_main_descr')
                    },
                    onChange: function (value) {
                        applyMain(value);
                    }
                });

                // --- папка плагина: переключение, резерв, проверка ---

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: CONFIG.own.main,
                        type: 'select',
                        values: values,
                        default: ''
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_main'),
                        description: Lampa.Lang.translate('parser_switch_main_descr')
                    },
                    onChange: function (value) {
                        applyMain(value);
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: CONFIG.own.backup,
                        type: 'select',
                        values: values,
                        default: ''
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_backup'),
                        description: Lampa.Lang.translate('parser_switch_backup_descr')
                    },
                    onChange: function (value) {
                        applyBackup(value);
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: CONFIG.own.auto,
                        type: 'trigger',
                        default: false
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_auto'),
                        description: Lampa.Lang.translate('parser_switch_auto_descr')
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: 'parser_switch_list_button',
                        type: 'button',
                        default: false
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_list')
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: 'parser_switch_check_button',
                        type: 'button',
                        default: false
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_check')
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: CONFIG.component,
                    param: {
                        name: 'parser_switch_new_button',
                        type: 'button',
                        default: false
                    },
                    field: {
                        name: Lampa.Lang.translate('parser_switch_new_add')
                    }
                });
            }

            function registerButtons() {
                if (!Lampa.Params.listener || !Lampa.Params.listener.follow) return;

                Lampa.Params.listener.follow('button', function (event) {
                    if (!event || !event.name) return;

                    if (event.name === 'parser_switch_new_button') addParser();

                    if (event.name === 'parser_switch_list_button') showList();

                    if (event.name === 'parser_switch_check_button') {
                        if (!list.length) {
                            Lampa.Noty.show(Lampa.Lang.translate('parser_switch_empty'));

                            return;
                        }

                        Lampa.Noty.show(Lampa.Lang.translate('parser_switch_checking'), { time: 2000 });

                        checkAll(function (result) {
                            var ok = 0;

                            for (var id in result) if (result[id].ok) ok++;

                            Lampa.Noty.show(Lampa.Lang.translate('parser_switch_checked') + ': ' + ok + '/' + list.length, { time: 4000 });
                        });
                    }
                });
            }

            /* ------------------ старт ------------------ */

            reloadList();

            status = Lampa.Storage.get(CONFIG.own.status, '{}') || {};

            if (typeof status === 'string') {
                try {
                    status = JSON.parse(status);
                } catch (e) {
                    status = {};
                }
            }

            registerSettings();
            registerButtons();

            updateValues();

            if (Lampa.Storage.get(CONFIG.own.auto, false)) autoCheck();

            timer = setInterval(autoCheck, CONFIG.auto_interval);

            // В Node (тесты) интервал не должен удерживать процесс
            if (timer && typeof timer.unref === 'function') timer.unref();

            window[PLUGIN_FLAG].timer = timer;
        }

        // Ждём готовности приложения: до события 'ready' нельзя трогать
        // настройки, меню и активности.
        if (window.appready) start();
        else if (window.Lampa && window.Lampa.Listener)
            window.Lampa.Listener.follow('app', function (event) {
                if (event && event.type === 'ready') start();
            });
        else setTimeout(start, 100);

        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Экспорт                                                              */
    /* ------------------------------------------------------------------ */

    return {
        CONFIG: CONFIG,
        slug: slug,
        normalizeList: normalizeList,
        baseUrl: baseUrl,
        swapProtocol: swapProtocol,
        checkPath: checkPath,
        checkUrl: checkUrl,
        findParser: findParser,
        parserValues: parserValues,
        applyParser: applyParser,
        currentParser: currentParser,
        boot: boot
    };
});
