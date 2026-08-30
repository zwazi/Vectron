/*
 * Browser-only multi-map library. Records live in IndexedDB and never touch
 * Firebase, Cloud Storage, or a Vectron server.
 */
(function() {
    "use strict";

    var DATABASE_NAME = "vectron-local-library";
    var DATABASE_VERSION = 1;
    var STORE_NAME = "maps";
    var ownerId = "guest";
    var databasePromise = null;

    function element(id) { return document.getElementById(id); }

    function openDatabase() {
        if(databasePromise) return databasePromise;
        databasePromise = new Promise(function(resolve, reject) {
            if(!window.indexedDB) {
                reject(new Error("This browser does not support local map storage."));
                return;
            }
            var request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = function() {
                var db = request.result;
                var store = db.objectStoreNames.contains(STORE_NAME)
                    ? request.transaction.objectStore(STORE_NAME)
                    : db.createObjectStore(STORE_NAME, {keyPath:"id"});
                if(!store.indexNames.contains("ownerId")) {
                    store.createIndex("ownerId", "ownerId", {unique:false});
                }
            };
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error || new Error("Local map storage failed.")); };
        });
        return databasePromise;
    }

    function requestResult(request) {
        return new Promise(function(resolve, reject) {
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error || new Error("Local map storage failed.")); };
        });
    }

    async function withStore(mode, callback) {
        var db = await openDatabase();
        var transaction = db.transaction(STORE_NAME, mode);
        var store = transaction.objectStore(STORE_NAME);
        var completion = new Promise(function(resolve, reject) {
            transaction.oncomplete = resolve;
            transaction.onerror = function() { reject(transaction.error || new Error("Local map storage failed.")); };
            transaction.onabort = function() { reject(transaction.error || new Error("Local map storage was cancelled.")); };
        });
        var result = await callback(store);
        await completion;
        return result;
    }

    async function records() {
        return withStore("readonly", function(store) {
            return requestResult(store.index("ownerId").getAll(ownerId));
        });
    }

    function status(message, type) {
        var node = element("local-library-status");
        if(!node) return;
        node.textContent = message || "";
        node.className = "repository-status" + (type ? " " + type : "");
        node.hidden = !message;
    }

    function currentRecord(copy) {
        if(typeof window.eventHandler_getExportMap !== "function") {
            throw new Error("The editor is not ready yet.");
        }
        if(copy && typeof window.vectron_localMapIdentityReset === "function") {
            window.vectron_localMapIdentityReset();
        }
        var identity = typeof window.vectron_localMapIdentity === "function"
            ? window.vectron_localMapIdentity()
            : "map-" + Date.now();
        var map = window.eventHandler_getExportMap();
        var now = new Date().toISOString();
        return {
            id: ownerId + ":" + identity,
            ownerId: ownerId,
            localMapId: identity,
            name: String(element("map_name") && element("map_name").value || "Untitled map").trim() || "Untitled map",
            author: String(element("map_author") && element("map_author").value || "").trim(),
            version: String(element("map_version") && element("map_version").value || "1").trim() || "1",
            updatedAt: now,
            xml: map.xml,
            viewport: {
                panX:Number(window.vectron_panX) || 0,
                panY:Number(window.vectron_panY) || 0,
                zoom:Number(window.vectron_zoom) || 1
            }
        };
    }

    async function saveCurrent(copy) {
        var record = currentRecord(copy);
        status(copy ? "Saving a separate local copy…" : "Saving map in this browser…");
        await withStore("readwrite", function(store) { store.put(record); });
        if(typeof window.vectron_localDraftSaveNow === "function") window.vectron_localDraftSaveNow();
        status((copy ? "Local copy saved. " : "Map saved. ") + "Nothing was uploaded to Firebase.", "success");
        await render();
    }

    async function removeRecord(record) {
        if(!window.confirm("Remove “" + record.name + "” from this browser? This cannot be undone.")) return;
        await withStore("readwrite", function(store) { store.delete(record.id); });
        status("Local map removed.", "success");
        await render();
    }

    async function openRecord(record) {
        if(!window.confirm("Open “" + record.name + "”? Your current unsaved editor state will be replaced.")) return;
        if(typeof window.vectron_localDraftSaveNow === "function") window.vectron_localDraftSaveNow();
        if(typeof window.vectron_resetForInitialMap === "function") window.vectron_resetForInitialMap();
        else window.aamap_objects = [];
        window.xml_process(record.xml);
        if(typeof window.vectron_localMapIdentityReset === "function") {
            window.vectron_localMapIdentityReset(record.localMapId);
        }
        var viewport = record.viewport || {};
        if(Number.isFinite(Number(viewport.panX))) window.vectron_panX = Number(viewport.panX);
        if(Number.isFinite(Number(viewport.panY))) window.vectron_panY = Number(viewport.panY);
        if(Number.isFinite(Number(viewport.zoom)) && Number(viewport.zoom) > 0) window.vectron_zoom = Number(viewport.zoom);
        if(typeof window.aamap_clearHistory === "function") window.aamap_clearHistory();
        if(typeof window.vectron_render === "function") window.vectron_render();
        if(typeof window.vectron_localDraftSaveNow === "function") window.vectron_localDraftSaveNow();
        close();
        if(typeof window.gui_toast === "function") window.gui_toast("Opened local map “" + record.name + "”.");
    }

    function exportRecord(record) {
        var fileName = record.name.replace(/[^A-Za-z0-9._ -]+/g, "_") + "-" + record.version + ".aamap.xml";
        window.vectron_saveTextAsFile(record.xml, fileName);
    }

    function action(label, icon, handler, className) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "account-card-button" + (className ? " " + className : "");
        button.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><span></span>';
        button.querySelector("span").textContent = label;
        button.addEventListener("click", handler);
        return button;
    }

    async function render() {
        var list = element("local-library-list");
        if(!list) return;
        list.replaceChildren();
        var query = String(element("local-library-search") && element("local-library-search").value || "").trim().toLocaleLowerCase();
        var items = (await records()).sort(function(a, b) {
            return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
        }).filter(function(record) {
            return !query || [record.name, record.author, record.version].join(" ").toLocaleLowerCase().includes(query);
        });
        element("local-library-summary").textContent = items.length + " local map" + (items.length === 1 ? "" : "s") + " · browser only";
        if(!items.length) {
            var empty = document.createElement("div");
            empty.className = "repository-empty";
            empty.innerHTML = "<strong>No local maps yet</strong><span>Save the current map or make a separate local copy.</span>";
            list.appendChild(empty);
            return;
        }
        items.forEach(function(record) {
            var card = document.createElement("article");
            card.className = "account-card local-library-card";
            var copy = document.createElement("div");
            copy.className = "account-card-copy";
            var heading = document.createElement("strong");
            heading.textContent = record.name;
            var meta = document.createElement("small");
            meta.textContent = (record.author || "Unknown author") + " · revision " + record.version + " · " + new Date(record.updatedAt).toLocaleString();
            copy.append(heading, meta);
            var actions = document.createElement("div");
            actions.className = "account-card-actions local-library-actions";
            actions.append(
                action("Open", "fa-folder-open", function() { openRecord(record).catch(showError); }),
                action("Export", "fa-download", function() { exportRecord(record); }),
                action("Delete", "fa-trash", function() { removeRecord(record).catch(showError); }, "danger")
            );
            card.append(copy, actions);
            list.appendChild(card);
        });
    }

    function showError(error) {
        console.error("Vectron local library failed.", error);
        status(error && error.message ? error.message : "Local map storage failed.", "error");
    }

    function open() {
        var overlay = element("local-library-overlay");
        if(!overlay) return;
        overlay.hidden = false;
        status("");
        render().catch(showError);
        var search = element("local-library-search");
        if(search) window.setTimeout(function() { search.focus(); }, 0);
    }

    function close() {
        var overlay = element("local-library-overlay");
        if(overlay) overlay.hidden = true;
    }

    function init() {
        document.querySelectorAll("[data-local-library]").forEach(function(button) {
            button.addEventListener("click", function(event) { event.preventDefault(); open(); });
        });
        var closeButton = element("local-library-close");
        var saveButton = element("local-library-save");
        var copyButton = element("local-library-save-copy");
        var searchButton = element("local-library-search-submit");
        var search = element("local-library-search");
        if(closeButton) closeButton.addEventListener("click", close);
        if(saveButton) saveButton.addEventListener("click", function() { saveCurrent(false).catch(showError); });
        if(copyButton) copyButton.addEventListener("click", function() { saveCurrent(true).catch(showError); });
        if(searchButton) searchButton.addEventListener("click", function() { render().catch(showError); });
        if(search) search.addEventListener("keydown", function(event) {
            if(event.key !== "Enter") return;
            event.preventDefault();
            render().catch(showError);
        });
        var overlay = element("local-library-overlay");
        if(overlay) overlay.addEventListener("mousedown", function(event) {
            if(event.target === overlay) close();
        });
    }

    window.vectron_localLibrarySetUser = function(userId) {
        ownerId = String(userId || "guest").trim() || "guest";
        if(element("local-library-overlay") && !element("local-library-overlay").hidden) render().catch(showError);
    };
    window.vectron_openLocalLibrary = open;
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
