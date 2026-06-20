// ==UserScript==
// @name         Vectron to Armawebtron Preview
// @namespace    https://github.com/Armawebtron/Vectron
// @version      0.1.0
// @description  Receives Vectron map XML and opens it in Armawebtron for a quick in-game preview.
// @match        https://armawebtron.github.io/Armawebtron/*
// @match        https://*/Armawebtron/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    "use strict";

    var MESSAGE_TYPE = "vectron-map-preview";
    var ACK_TYPE = "vectron-map-preview-ack";
    var activeRequest = 0;

    function getPageWindow() {
        return (typeof unsafeWindow != "undefined") ? unsafeWindow : window;
    }

    function getArmawebtron() {
        var page = getPageWindow();
        if(!page.game || !page.engine || !page.settings) {
            return null;
        }

        return {
            page: page,
            game: page.game,
            engine: page.engine,
            settings: page.settings,
            conf: page.conf || {},
            loadcfg: page.loadcfg,
            localStorage: page.localStorage || window.localStorage,
            storage: page.sessionStorage || window.sessionStorage
        };
    }

    function sendAck(source, ok, fileName, error, settingResult) {
        if(!source || typeof source.postMessage != "function") {
            return;
        }

        source.postMessage({
            type: ACK_TYPE,
            ok: ok,
            fileName: fileName || "",
            error: error || "",
            appliedSettings: settingResult ? settingResult.applied.length : 0,
            skippedSettings: settingResult ? settingResult.skipped : [],
            unknownSettings: settingResult ? settingResult.unknown : []
        }, "*");
    }

    function waitForArmawebtron(onReady, onTimeout) {
        var startedAt = Date.now();
        var timer = window.setInterval(function() {
            var aw = getArmawebtron();
            if(aw) {
                window.clearInterval(timer);
                onReady(aw);
                return;
            }

            if(Date.now() - startedAt > 30000) {
                window.clearInterval(timer);
                onTimeout();
            }
        }, 250);
    }

    function cleanFileName(fileName) {
        return String(fileName || "vectron-preview.aamap.xml").replace(/[^A-Za-z0-9._-]/g, "_");
    }

    function parseSettingsCustomCfg(settingsCustomCfg) {
        return String(settingsCustomCfg || "").split(/\r?\n/).reduce(function(settings, line) {
            var commentStart = line.indexOf("#");
            if(commentStart >= 0) {
                line = line.slice(0, commentStart);
            }

            line = line.trim();
            if(!line) {
                return settings;
            }

            var splitAt = line.search(/\s/);
            var name = splitAt == -1 ? line : line.slice(0, splitAt);
            var value = splitAt == -1 ? "" : line.slice(splitAt).trim();
            if(name) {
                settings.push({
                    name: name,
                    value: value
                });
            }

            return settings;
        }, []);
    }

    function applySettingsCustomCfg(aw, settingsCustomCfg) {
        var settings = parseSettingsCustomCfg(settingsCustomCfg);
        var cfg = settings.map(function(setting) {
            return setting.name + " " + setting.value;
        }).join("\n");
        var result = {
            applied: [],
            skipped: [],
            unknown: []
        };

        if(cfg) {
            try {
                aw.localStorage.setItem("settings_custom.cfg", cfg);
            } catch(e) {
                console.warn("Vectron preview could not persist settings_custom.cfg.", e);
            }
            if(typeof aw.loadcfg == "function") {
                aw.loadcfg(cfg, true);
            }
        }

        for(var i = 0; i < settings.length; i++) {
            var name = settings[i].name.toUpperCase();
            if(name == "MAP_FILE") {
                result.skipped.push(name);
                continue;
            }

            if(typeof aw.conf[name] == "undefined" && typeof aw.settings[name] == "undefined") {
                result.unknown.push(name);
                aw.settings[name] = settings[i].value;
            }

            result.applied.push(name);
        }

        return result;
    }

    function loadPreview(aw, xml, fileName, settingsCustomCfg, source, requestId) {
        var mapKey = "Vectron/preview/" + fileName;
        aw.settings.MAP_FILE = mapKey;

        aw.game.verifyMap(xml, function() {
            if(requestId != activeRequest) {
                return;
            }

            var settingResult = applySettingsCustomCfg(aw, settingsCustomCfg);
            aw.settings.MAP_FILE = mapKey;
            aw.storage.setItem(mapKey, xml);
            aw.engine.loadedMap = "";

            if(aw.engine.inputState == "game" && typeof aw.game.doNewRound == "function") {
                aw.game.doNewRound();
            } else if(typeof aw.game.play == "function") {
                aw.game.play();
            } else if(typeof aw.game.loadRound == "function") {
                aw.game.loadRound(xml);
            }

            sendAck(source, true, fileName, "", settingResult);
        }, function() {
            sendAck(source, false, fileName, "map XML did not validate");
        });
    }

    window.addEventListener("message", function(event) {
        var data = event.data;
        if(!data || data.type != MESSAGE_TYPE || data.source != "Vectron" || typeof data.xml != "string") {
            return;
        }

        activeRequest++;
        var requestId = activeRequest;
        var fileName = cleanFileName(data.fileName);

        waitForArmawebtron(function(aw) {
            loadPreview(aw, data.xml, fileName, data.settingsCustomCfg, event.source, requestId);
        }, function() {
            sendAck(event.source, false, fileName, "Armawebtron did not finish loading");
        });
    }, false);
})();
