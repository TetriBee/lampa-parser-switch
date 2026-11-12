/**
 * Минимальная заглушка Lampa для тестов плагина.
 *
 * Повторяет поведение реальных модулей приложения в том, что важно плагину:
 *   - Storage: JSON-значения, преобразование 'true'/'false' в boolean;
 *   - Params: реестр select/trigger и шина событий;
 *   - SettingsApi: компоненты и параметры настроек.
 */

'use strict';

function createStorage() {
    var data = {};

    return {
        get: function (name, empty) {
            var value = data[name];

            if (typeof value === 'undefined') return empty || '';

            if (value === 'true') return true;
            if (value === 'false') return false;

            if (value && typeof value === 'object') return value;

            if (typeof value === 'string' && (value[0] === '[' || value[0] === '{')) {
                try {
                    return JSON.parse(value);
                } catch (e) {}
            }

            return value;
        },

        set: function (name, value) {
            data[name] = (value && typeof value === 'object') ? JSON.stringify(value) : value;

            return value;
        },

        field: function (name) {
            return this.get(name, '');
        },

        value: function (name, empty) {
            return data[name] != null ? data[name] : (empty || '');
        },

        /* Доступ к сырым данным — только для тестов */
        raw: function () {
            return data;
        }
    };
}

function createParams() {
    var values   = {};
    var defaults = {};
    var listeners = {};

    return {
        values: values,
        defaults: defaults,
        params: {},

        select: function (name, data, def) {
            values[name] = data;
            defaults[name] = def;
        },

        trigger: function (name, def) {
            values[name] = { 'true': 'да', 'false': 'нет' };
            defaults[name] = def;
        },

        listener: {
            follow: function (event, callback) {
                if (!listeners[event]) listeners[event] = [];

                listeners[event].push(callback);
            },

            send: function (event, data) {
                (listeners[event] || []).forEach(function (callback) {
                    callback(data);
                });
            }
        }
    };
}

function createSettingsApi(params_api, values, defaults) {
    var components = {};
    var params     = params_api;

    return {
        components: components,
        params: params,

        addComponent: function (data) {
            components[data.component] = data;
        },

        removeComponent: function (component) {
            delete components[component];
            delete params[component];
        },

        addParam: function (data) {
            if (!params[data.component]) params[data.component] = [];

            params[data.component].push(data);

            // Настоящий SettingsApi регистрирует значения параметра:
            // без values у select/input значение становится undefined,
            // и Lampa падает при отрисовке настроек.
            if (data.param.type == 'select' || data.param.type == 'input') {
                if (typeof data.param.values === 'undefined')
                    throw new Error('SettingsApi.addParam: у параметра ' + data.param.name + ' нет values');

                values[data.param.name] = data.param.values;
                defaults[data.param.name] = data.param.default;
            }

            if (data.param.type == 'trigger') {
                values[data.param.name] = { 'true': 'да', 'false': 'нет' };
                defaults[data.param.name] = data.param.default;
            }
        },

        removeParams: function (component) {
            delete params[component];
        },

        getParam: function (component) {
            return params[component];
        },

        getComponent: function (component) {
            return components[component];
        },

        allComponents: function () {
            return components;
        },

        allParams: function () {
            return params;
        }
    };
}

/**
 * @param {Object} [options]
 * @param {Object} [options.responses] — карта «адрес → ответ» для Reguest
 * @param {boolean} [options.online] — отвечать успехом на любой запрос
 */
function createLampa(options) {
    options = options || {};

    var responses = options.responses || {};

    var storage    = createStorage();
    var params     = createParams();
    var settingsApi = createSettingsApi(params.params, params.values, params.defaults);
    var langs      = {};
    var noty       = [];
    var selects    = [];

    var Lampa = {
        Storage: storage,
        Params: params,
        SettingsApi: settingsApi,

        Lang: {
            add: function (data) {
                for (var name in data) {
                    if (!langs[name]) langs[name] = {};

                    for (var code in data[name]) langs[name][code] = data[name][code];
                }
            },

            translate: function (key) {
                var name = String(key || '');

                if (name.indexOf('#{') >= 0) return name;

                return (langs[name] && langs[name].ru) || name;
            }
        },

        Utils: {
            checkEmptyUrl: function (url) {
                var u = String(url || '');

                if (u.indexOf('http://') === 0 || u.indexOf('https://') === 0) return u;

                return 'http://' + u;
            },

            rewriteIfHTTPS: function (url) {
                return url;
            }
        },

        Reguest: function () {
            var timeout = 30000;

            this.timeout = function (time) {
                timeout = time;
            };

            this.silent = function (url, oncomplite, onerror) {
                if (responses[url]) {
                    oncomplite(responses[url]);

                    return;
                }

                if (options.online) {
                    oncomplite({ Results: [] });

                    return;
                }

                if (onerror) onerror();
            };

            this.native = this.silent;

            this.clear = function () {};
        },

        Noty: {
            show: function (text) {
                noty.push(text);
            }
        },

        Select: {
            show: function (data) {
                selects.push(data);
            },

            close: function () {}
        },

        Listener: {
            follow: function () {}
        },

        Settings: {
            main: function () {
                return { render: function () { return { length: 0 }; } };
            },

            update: function () {}
        },

        Activity: {
            push: function () {}
        },

        _noty: noty,
        _selects: selects
    };

    return Lampa;
}

module.exports = {
    createStorage: createStorage,
    createParams: createParams,
    createSettingsApi: createSettingsApi,
    createLampa: createLampa
};
