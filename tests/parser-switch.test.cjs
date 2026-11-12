/**
 * Тесты плагина «Переключение между парсерами».
 *
 *   node --test tests/
 *
 * Ядро плагина (нормализация списка, адреса проверки, запись в настройки Lampa)
 * тестируется без браузера. Отдельно прогоняется сценарий «плагин установлен
 * в Lampa» на заглушке приложения.
 */

'use strict';

const test  = require('node:test');
const assert = require('node:assert');

const plugin = require('../plugin.js');
const stub   = require('./stub-lampa.cjs');

/* ------------------------------------------------------------------ */
/* Ядро                                                                 */
/* ------------------------------------------------------------------ */

test('normalizeList принимает массив', () => {
    const list = plugin.normalizeList([
        { id: 'a', name: 'Парсер A', url: 'https://a.example', key: 'k1' },
        { id: 'b', name: 'Парсер B', url: 'b.example:9117' }
    ]);

    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, 'a');
    assert.strictEqual(list[0].key, 'k1');
    assert.strictEqual(list[0].type, 'jackett');
    assert.strictEqual(list[0].interview, 'all');
    assert.strictEqual(list[1].url, 'b.example:9117');
    assert.strictEqual(list[1].key, '');
});

test('normalizeList принимает формат parsers.json и results', () => {
    const fromParsers = plugin.normalizeList({
        updated: '2026-11-12',
        parsers: [{ id: 'x', name: 'X', url: 'x.example' }]
    });

    const fromResults = plugin.normalizeList({
        results: [{ id: 'y', name: 'Y', url: 'y.example' }]
    });

    assert.strictEqual(fromParsers.length, 1);
    assert.strictEqual(fromResults.length, 1);
});

test('normalizeList отбрасывает битые записи и дубликаты', () => {
    const list = plugin.normalizeList([
        { id: 'a', name: 'A', url: 'a.example' },
        { id: 'a', name: 'A again', url: 'a2.example' },
        { name: 'Без адреса' },
        null,
        'строка'
    ]);

    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, 'a');
});

test('normalizeList поддерживает prowlarr и healthy', () => {
    const list = plugin.normalizeList([
        { id: 'p', name: 'P', url: 'p.example', type: 'prowlarr', interview: 'healthy' }
    ]);

    assert.strictEqual(list[0].type, 'prowlarr');
    assert.strictEqual(list[0].interview, 'healthy');
});

test('baseUrl добавляет протокол и убирает слэши', () => {
    assert.strictEqual(plugin.baseUrl('host.example'), 'http://host.example');
    assert.strictEqual(plugin.baseUrl('https://host.example/'), 'https://host.example');
    assert.strictEqual(plugin.baseUrl(''), '');
});

test('checkUrl совпадает с запросом, который делает сама Lampa', () => {
    const parser = { url: 'host.example:8443', key: '777', type: 'jackett', interview: 'all' };

    assert.strictEqual(
        plugin.checkUrl(parser),
        'http://host.example:8443/api/v2.0/indexers/all/results?apikey=777&Query=test'
    );

    parser.interview = 'healthy';

    assert.strictEqual(
        plugin.checkUrl(parser),
        'http://host.example:8443/api/v2.0/indexers/status:healthy/results?apikey=777&Query=test'
    );
});

test('checkUrl для prowlarr', () => {
    const parser = { url: 'p.example', key: 'key', type: 'prowlarr' };

    assert.strictEqual(
        plugin.checkUrl(parser),
        'http://p.example/api/v1/search?apikey=key&query=test'
    );
});

test('checkUrl уважает переданный протокол', () => {
    const parser = { url: 'host.example', key: '', type: 'jackett', interview: 'all' };

    assert.strictEqual(
        plugin.checkUrl(parser, 'https://host.example'),
        'https://host.example/api/v2.0/indexers/all/results?apikey=&Query=test'
    );
});

test('findParser ищет по id', () => {
    const list = plugin.normalizeList([{ id: 'a', name: 'A', url: 'a.example' }]);

    assert.strictEqual(plugin.findParser(list, 'a').name, 'A');
    assert.strictEqual(plugin.findParser(list, 'zzz'), null);
    assert.strictEqual(plugin.findParser(list, ''), null);
});

test('parserValues строит карту для select', () => {
    const list = plugin.normalizeList([
        { id: 'a', name: 'A', url: 'a.example' },
        { id: 'b', name: 'B', url: 'b.example' }
    ]);

    const values = plugin.parserValues(list, true);

    assert.strictEqual(values.a, 'A');
    assert.strictEqual(values.b, 'B');
    assert.ok('' in values);
});

test('applyParser пишет ключи Lampa для основного парсера', () => {
    const storage = stub.createStorage();

    const ok = plugin.applyParser(storage, {
        id: 'a', name: 'A', url: 'a.example', key: 'kk', type: 'jackett', interview: 'healthy'
    });

    assert.strictEqual(ok, true);
    assert.strictEqual(storage.get('parser_torrent_type'), 'jackett');
    assert.strictEqual(storage.get('jackett_url'), 'a.example');
    assert.strictEqual(storage.get('jackett_key'), 'kk');
    assert.strictEqual(storage.get('jackett_interview'), 'healthy');
    assert.strictEqual(storage.get('parser_use'), true);
});

test('applyParser пишет резервный парсер во второй слот', () => {
    const storage = stub.createStorage();

    plugin.applyParser(storage, { id: 'b', name: 'B', url: 'b.example', key: 'k2', type: 'jackett' }, { slot: 'two' });

    assert.strictEqual(storage.get('jackett_url_two'), 'b.example');
    assert.strictEqual(storage.get('jackett_key_two'), 'k2');
    assert.strictEqual(storage.get('jackett_url'), '');
});

test('applyParser поддерживает prowlarr', () => {
    const storage = stub.createStorage();

    plugin.applyParser(storage, { id: 'p', name: 'P', url: 'p.example', key: 'pk', type: 'prowlarr' });

    assert.strictEqual(storage.get('parser_torrent_type'), 'prowlarr');
    assert.strictEqual(storage.get('prowlarr_url'), 'p.example');
    assert.strictEqual(storage.get('prowlarr_key'), 'pk');
});

test('currentParser находит активный парсер по адресу', () => {
    const storage = stub.createStorage();

    const list = plugin.normalizeList([
        { id: 'a', name: 'A', url: 'a.example' },
        { id: 'b', name: 'B', url: 'b.example' }
    ]);

    plugin.applyParser(storage, list[1]);

    assert.strictEqual(plugin.currentParser(storage, list).id, 'b');
});

/* ------------------------------------------------------------------ */
/* Интеграция с Lampa                                                   */
/* ------------------------------------------------------------------ */

function installPlugin(options) {
    const Lampa = stub.createLampa(options || {});

    const window = {
        Lampa: Lampa,
        lampa_settings: { torrents_use: false, read_only: true, demo: true },
        appready: true
    };

    plugin.boot(window);

    return { Lampa: Lampa, window: window };
}

test('плагин включает раздел парсера в сборках из магазина', () => {
    const { window } = installPlugin();

    assert.strictEqual(window.lampa_settings.torrents_use, true);
    assert.strictEqual(window.lampa_settings.read_only, false);
});

test('плагин не инициализируется дважды', () => {
    const { window } = installPlugin();

    plugin.boot(window);

    assert.strictEqual(
        Object.keys(window.Lampa.SettingsApi.allComponents()).filter(c => c === 'parser_switch').length,
        1
    );
});

test('плагин не поставляет чужих адресов и ключей', () => {
    const fs   = require('node:fs');
    const path = require('node:path');

    const code = fs.readFileSync(path.join(__dirname, '..', 'plugin.js'), 'utf8');

    // Смотрим только строковые литералы — в коде нет ни одного адреса инстанса
    const literals = [];
    const re = /(['"])((?:\\.|(?!\1)[^\n\\])*)\1/g;
    let m;

    while ((m = re.exec(code)) !== null) literals.push(m[2]);

    const hosts = literals
        .filter(v => /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?\/?$/i.test(v))
        .map(v => v.replace(/^https?:\/\//i, '').replace(/\/$/, ''));

    const allowed = ['w3.org'];

    const foreign = hosts.filter(h => !allowed.includes(h));

    assert.deepStrictEqual(foreign, [], 'в плагине не должно быть чужих адресов: ' + foreign.join(', '));

    // И никакого встроенного списка или загрузки списка извне
    assert.strictEqual(plugin.DEFAULT_LIST, undefined);
    assert.strictEqual(plugin.CONFIG.list_file, undefined);
    assert.ok(!/currentScript/.test(code), 'плагин не должен искать свой скрипт');
});

test('в разделе «Парсер» появляются поля для ссылки и ключа', () => {
    const { Lampa } = installPlugin();

    const parserParams = Lampa.SettingsApi.getParam('parser') || [];

    const names = parserParams.map(p => p.param.name);

    assert.ok(names.includes('parser_switch_new_url'), names);
    assert.ok(names.includes('parser_switch_new_key'), names);
    assert.ok(names.includes('parser_switch_new_button'), names);
    assert.ok(names.includes('parser_switch_main'), names);
});

test('папка плагина даёт переключение, резерв и проверку', () => {
    const { Lampa } = installPlugin();

    assert.ok(Lampa.SettingsApi.getComponent('parser_switch'));

    const names = (Lampa.SettingsApi.getParam('parser_switch') || []).map(p => p.param.name);

    assert.ok(names.includes('parser_switch_main'));
    assert.ok(names.includes('parser_switch_backup'));
    assert.ok(names.includes('parser_switch_auto'));
    assert.ok(names.includes('parser_switch_list_button'));
    assert.ok(names.includes('parser_switch_check_button'));
});

test('добавленный парсер попадает в список и применяется', () => {
    const { Lampa } = installPlugin();

    Lampa.Storage.set('parser_switch_new_url', 'https://my.jackett.example');
    Lampa.Storage.set('parser_switch_new_key', 'mykey');

    Lampa.Params.listener.send('button', { name: 'parser_switch_new_button' });

    assert.strictEqual(Lampa.Storage.get('jackett_url'), 'https://my.jackett.example');
    assert.strictEqual(Lampa.Storage.get('jackett_key'), 'mykey');
    assert.strictEqual(Lampa.Storage.get('parser_torrent_type'), 'jackett');
    assert.strictEqual(Lampa.Storage.get('parser_use'), true);

    const values = Lampa.Params.values.parser_switch_main;

    assert.ok(Object.keys(values).some(id => id.indexOf('user_') === 0), Object.keys(values));

    // Поля ввода очищаются
    assert.strictEqual(Lampa.Storage.get('parser_switch_new_url'), '');
});

test('переключение между своими парсерами меняет настройки', () => {
    const { Lampa } = installPlugin();

    const button = { name: 'parser_switch_new_button' };

    Lampa.Storage.set('parser_switch_new_url', 'https://first.example');
    Lampa.Storage.set('parser_switch_new_key', 'k1');
    Lampa.Params.listener.send('button', button);

    Lampa.Storage.set('parser_switch_new_url', 'https://second.example');
    Lampa.Storage.set('parser_switch_new_key', 'k2');
    Lampa.Params.listener.send('button', button);

    const users = Lampa.Storage.get('parser_switch_user_list');

    assert.strictEqual(users.length, 2);

    const main = Lampa.SettingsApi.getParam('parser_switch').find(p => p.param.name === 'parser_switch_main');

    const first = users.find(u => u.url.indexOf('first.example') > -1);

    main.onChange(first.id);

    assert.strictEqual(Lampa.Storage.get('jackett_url'), 'https://first.example');
    assert.strictEqual(Lampa.Storage.get('jackett_key'), 'k1');
});

test('резервный парсер включает режим «оба»', () => {
    const { Lampa } = installPlugin();

    const button = { name: 'parser_switch_new_button' };

    Lampa.Storage.set('parser_switch_new_url', 'https://first.example');
    Lampa.Params.listener.send('button', button);

    Lampa.Storage.set('parser_switch_new_url', 'https://second.example');
    Lampa.Params.listener.send('button', button);

    const users = Lampa.Storage.get('parser_switch_user_list');

    const backup = Lampa.SettingsApi.getParam('parser_switch').find(p => p.param.name === 'parser_switch_backup');

    backup.onChange(users[users.length - 1].id);

    assert.strictEqual(Lampa.Storage.get('jackett_url_two'), users[users.length - 1].url);
    assert.strictEqual(Lampa.Storage.get('parser_use_link'), 'both');
});

test('снятие резервного парсера возвращает режим «один»', () => {
    const { Lampa } = installPlugin();

    const backup = Lampa.SettingsApi.getParam('parser_switch').find(p => p.param.name === 'parser_switch_backup');

    backup.onChange('user_something');

    assert.strictEqual(Lampa.Storage.get('parser_use_link'), 'one');
    assert.strictEqual(Lampa.Storage.get('parser_switch_backup'), '');
});

test('проверка без ключа идёт с пустым apikey', () => {
    const parser = { url: 'jac.red', key: '', type: 'jackett', interview: 'all' };

    assert.ok(plugin.checkUrl(parser).includes('apikey=&'));
});

test('проверка с ключом подставляет его', () => {
    const parser = { url: 'host.example', key: '777', type: 'jackett', interview: 'all' };

    assert.ok(plugin.checkUrl(parser).includes('apikey=777'));
});
