"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "../js/localDraft.js"), "utf8");
const stored = new Map();
const listeners = {};
let resetCount = 0;
let renderCount = 0;
let processedXml = "";
let toast = "";
let repositoryEdit = {
    sourcePath: "Draft Author/maps/Draft-1.aamap.xml",
    sourceName: "Draft",
    sourceVersion: "1",
    sourceCategory: "maps"
};
let restoredRepositoryEdit = undefined;

const context = {
    console: {warn() {}},
    Date,
    JSON,
    encodeURIComponent,
    isFinite,
    setTimeout,
    clearTimeout,
    document: {
        visibilityState: "visible",
        addEventListener(name, handler) { listeners[name] = handler; }
    },
    localStorage: {
        getItem(key) { return stored.has(key) ? stored.get(key) : null; },
        setItem(key, value) { stored.set(key, value); },
        removeItem(key) { stored.delete(key); }
    },
    $: {
        parseXML(xml) {
            if(typeof xml !== "string" || !xml.includes("<Resource")) throw new Error("Invalid XML");
            return {};
        }
    },
    vectron_started: true,
    vectron_panX: 12,
    vectron_panY: -8,
    vectron_zoom: 2.5,
    aamap_objects: [],
    eventHandler_getExportMap() {
        return {xml: '<Resource type="aamap" name="Draft"></Resource>'};
    },
    vectron_getRepositoryEditState() { return repositoryEdit; },
    vectron_setRepositoryEditState(value) { restoredRepositoryEdit = value; },
    vectron_resetForInitialMap() { resetCount++; },
    aamap_disableSymmetry() {},
    aamap_clearHistory() {},
    xml_process(xml) { processedXml = xml; },
    vectron_render() { renderCount++; },
    gui_toast(message) { toast = message; },
    addEventListener(name, handler) { listeners[name] = handler; }
};
context.window = context;

vm.createContext(context);
vm.runInContext(source, context, {filename: "localDraft.js"});

assert.strictEqual(context.vectron_localDraftSetUser("firebase/user-a"), true);
assert.strictEqual(context.vectron_localDraftSaveNow(), true);

const userAKey = "vectron.localDraft.v1.firebase%2Fuser-a";
const userADraft = JSON.parse(stored.get(userAKey));
assert.strictEqual(userADraft.schema, 1);
assert.strictEqual(userADraft.viewport.panX, 12);
assert.strictEqual(userADraft.viewport.panY, -8);
assert.strictEqual(userADraft.viewport.zoom, 2.5);
assert.match(userADraft.xml, /name="Draft"/);
assert.deepStrictEqual(userADraft.repositoryEdit, repositoryEdit);

assert.strictEqual(context.vectron_localDraftSetUser("user-b"), true);
const userBKey = "vectron.localDraft.v1.user-b";
stored.set(userBKey, JSON.stringify({
    schema: 1,
    savedAt: new Date().toISOString(),
    xml: '<Resource type="aamap" name="Restored"></Resource>',
    repositoryEdit,
    viewport: {panX: 3, panY: 4, zoom: 1.5}
}));

assert.strictEqual(context.vectron_localDraftRestore(), true);
assert.match(processedXml, /name="Restored"/);
assert.strictEqual(context.vectron_panX, 3);
assert.strictEqual(context.vectron_panY, 4);
assert.strictEqual(context.vectron_zoom, 1.5);
assert.strictEqual(resetCount, 1);
assert.strictEqual(renderCount, 1);
assert.strictEqual(toast, "Restored your local draft.");
assert.deepStrictEqual(restoredRepositoryEdit, repositoryEdit);

assert.strictEqual(context.vectron_localDraftSetUser("corrupt-user"), true);
const corruptKey = "vectron.localDraft.v1.corrupt-user";
stored.set(corruptKey, "not json");
assert.strictEqual(context.vectron_localDraftRestore(), false);
assert.strictEqual(stored.has(corruptKey), false);
assert.strictEqual(typeof listeners.beforeunload, "function");
assert.strictEqual(typeof listeners.visibilitychange, "function");

console.log("Vectron local draft tests passed.");
