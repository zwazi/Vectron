"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const configSource = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
const vectronSource = fs.readFileSync(path.join(root, "js/vectron.js"), "utf8");
const eventSource = fs.readFileSync(path.join(root, "js/eventHandler.js"), "utf8");
const xmlSource = fs.readFileSync(path.join(root, "js/xml.js"), "utf8");
const guiSource = fs.readFileSync(path.join(root, "js/gui.js"), "utf8");
const darkCssSource = fs.readFileSync(path.join(root, "css/vectron-dark.css"), "utf8");
const readmeSource = fs.readFileSync(path.join(root, "README.md"), "utf8");
const billboardIconSource = fs.readFileSync(
    path.join(root, "images/ObjectTools/BillboardTool.svg"), "utf8");
const neomapSchema = JSON.parse(fs.readFileSync(
    path.resolve(root, "../../docs/neomap-v1.schema.json"), "utf8"));
assert.ok(neomapSchema.required.includes("metadata"));
assert.deepStrictEqual(neomapSchema.$defs.metadata.required, ["tags", "revision"]);
assert.strictEqual(neomapSchema.$defs.metadata.properties.tags.type, "array");
assert.strictEqual(neomapSchema.$defs.metadata.properties.tags.uniqueItems, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    neomapSchema.$defs.metadata.properties, "category"), false);
assert.strictEqual(neomapSchema.$defs.metadata.properties.revision.pattern,
    "^neomap-revision-v1:[0-9a-f]{64}$");
assert.strictEqual(neomapSchema.$defs.number.maximum, 9007199254740991);
assert.strictEqual(neomapSchema.$defs.safeInteger.maximum, 9007199254740991);
assert.strictEqual(neomapSchema.$defs.checkpointZone.allOf[1]
    .properties.order.allOf[1].maximum, 4294967295,
    "Checkpoint order matches the game's u32 storage without shrinking safeInteger");
assert.strictEqual(neomapSchema.$defs.spawn.properties.direction.$ref,
    "#/$defs/nonzeroVector");
assert.strictEqual(neomapSchema.properties.axes.oneOf[1].items.$ref,
    "#/$defs/nonzeroVector");
assert.strictEqual(neomapSchema.$defs.teleportZone.allOf[1]
    .properties.direction.oneOf[0].$ref, "#/$defs/nonzeroVector");
assert.strictEqual(neomapSchema.$defs.zone.oneOf.length, 8);
["deathZone","winZone","checkpointZone","healthZone","speedZone",
    "rubberZone","settingZone","teleportZone"].forEach(function(name) {
    assert.strictEqual(neomapSchema.$defs[name].unevaluatedProperties, false);
});
assert.strictEqual(neomapSchema.$defs.zoneBase.properties.show_icon.type, "boolean");
assert.strictEqual(neomapSchema.$defs.zoneBase.properties.show_icon.default, true);
assert.deepStrictEqual(neomapSchema.$defs.billboard.required,
    ["start", "end", "height", "url"]);
assert.strictEqual(neomapSchema.properties.billboards.items.$ref, "#/$defs/billboard");
assert.strictEqual(neomapSchema.$defs.billboard.properties.url.pattern,
    "^https?://(?![^/?#]*@)(?!:)[^\\s/?#]+(?:[/?#][^\\s]*)?$");
assert.deepStrictEqual(neomapSchema.$defs.billboard.properties.facing.enum,
    ["left", "right"]);
assert.strictEqual(neomapSchema.$defs.billboard.properties.facing.default, "right");
assert.strictEqual(neomapSchema.$defs.billboard.properties.dual_sided.default, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    neomapSchema.$defs.deathZone.allOf[1].properties, "delta"), false);
assert.strictEqual(neomapSchema.$defs.movement.properties.instances.uniqueItems, true);
assert.strictEqual(neomapSchema.$defs.movement.properties.pulse_radii.minContains, 2);
assert.deepStrictEqual(neomapSchema.$defs.movement.allOf[0].not.required,
    ["spawn_at_vertices", "instances"]);
assert.doesNotMatch(indexSource, /dZoneSpawnAtVertices|Vertex copies/);
assert.match(indexSource, /id="dZonePulse"/);
assert.match(indexSource, /id="dZoneShowIcon"[^>]*checked/);
assert.match(indexSource, /id="selection-zone-show-icon"/);
assert.match(indexSource, /id="dBillboardUrl"/);
assert.match(indexSource, /id="dBillboardHeight"/);
assert.match(indexSource, /id="dBillboardDualSided"/);
assert.match(indexSource, /id="selection-billboard-facing"/);
assert.match(indexSource, /id="selection-billboard-dual-sided"/);
assert.match(indexSource, /class="toolbar-toolBillboard"[^>]*><\/a>/);
assert.match(billboardIconSource, /<svg[\s\S]*<rect[\s\S]*<path/);
assert.match(indexSource, /id="symmetry-menu-toggle"/);
assert.match(indexSource, /id="symmetry-menu"/);
assert.doesNotMatch(indexSource, /id="symmetry-custom-popover"/);
assert.doesNotMatch(indexSource, />Finish Polygon</);
assert.match(indexSource, /id="theme" href="\.\/css\/vectron-dark\.css"/);
assert.doesNotMatch(indexSource, /id="dark-theme"|Enable dark theme/i);
assert.match(configSource, /var config_isDark = true;/);
assert.doesNotMatch(configSource, /function (?:enable|disable)_dark_theme|"darkTheme"/);
assert.doesNotMatch(eventSource, /#dark-theme|disable_dark_theme/);
assert.match(vectronSource, /mime:\s*"application\/json"/);
assert.match(vectronSource, /extension:\s*"\.neomap.json"/);
assert.doesNotMatch(vectronSource, /mime:\s*"text\/xml"|description:\s*"(?:Legacy )?XML/i,
    "Every author-facing save path advertises canonical .neomap.json JSON");
assert.match(configSource, /select:\s*'1'[\s\S]*wall:\s*'2'[\s\S]*floor:\s*'3'[\s\S]*zone:\s*'4'[\s\S]*spawn:\s*'5'[\s\S]*ramp:\s*'6'[\s\S]*split:\s*'7'[\s\S]*join:\s*'8'[\s\S]*wallVertexMove:\s*'9'/);
assert.doesNotMatch(indexSource, /id="keybinds-config"|id="new-map-popover"/);
assert.match(indexSource, /id="symmetry-check-toggle"/);
assert.match(indexSource, /id="symmetry-origin-toggle"/);
assert.match(indexSource, /id="symmetry-custom-x-toggle"/);
assert.match(indexSource, /id="symmetry-custom-y-toggle"/);
assert.match(indexSource, /id="symmetry-custom-point-toggle"/);
assert.match(indexSource, /id="code-viewer-find"/);
assert.match(indexSource, /id="code-viewer-replace-all"/);
assert.match(indexSource, /id="map_author_password"[^>]*maxlength="120"/);
assert.match(indexSource,
    /id="dCheckpointAutoIncrementEvery"[^>]*value="1"[^>]*step="1"[^>]*min="1"/);
assert.match(indexSource,
    /type="text"[^>]*id="dCheckpointOrder"[^>]*inputmode="numeric"[^>]*pattern="\[1-9\]\[0-9\]\*"/);
assert.match(indexSource, /id="dWallSegments"[^>]*min="3"/);
assert.doesNotMatch(indexSource, /id="dWallSegments"[^>]*\bmax=/,
    "Circular, arc, and elliptical walls have no editor wall-count ceiling");
assert.match(indexSource, /class="export-password-popover-body"/);
assert.match(darkCssSource,
    /\.export-password-popover-body\s*\{[^}]*background:#1d1d1d;[^}]*color:#eee;[^}]*border-color:#555;/);
assert.match(darkCssSource,
    /#export-password-confirm\s*\{[^}]*background:#2b2b2b;[^}]*color:#eee;[^}]*border-color:#555;/);
assert.match(indexSource, /for="map_category"[^>]*>Tags<\/label>/);
assert.doesNotMatch(indexSource, /id="map_version"/,
    "The generated map revision remains internal rather than a user input");
assert.match(indexSource, /<option value="0\.10" selected>Coarse \(10% – default\)<\/option>/);
assert.match(configSource, /var config_zoomStep = 0\.10;/);
assert.match(eventSource, /armamap_applyRevision\(nativeDocument\)/,
    "Code Viewer applies intentional edits with a fresh revision");
assert.match(eventSource,
    /Mousetrap\.bind\('shift\+z',[\s\S]*?vectron_ensureToolConnected\("zone"\)/,
    "Shift+Z uses the same active-placement guard as Zone subtype buttons");
assert.match(xmlSource, /xml_process\(parsed, false\)/,
    "File import preserves authored coordinates in both supported formats");
assert.doesNotMatch(xmlSource, /centerOnOrigin/,
    "Legacy XML import must not translate geometry to the world origin");
assert.match(indexSource, /Ctrl\+N[\s\S]*Ctrl\+O[\s\S]*Ctrl\+S/);
assert.match(eventSource, /Mousetrap\.bind\('mod\+n'/);
assert.match(eventSource, /Mousetrap\.bind\('mod\+o'/);
assert.match(eventSource, /Mousetrap\.bind\('mod\+s'/);
assert.match(eventSource, /Set an author-time password in Map Settings before exporting\./);
assert.match(indexSource, /id="dZoneLineWidth"[^>]*\bmin="0"/);
assert.match(guiSource,
    /name: "ZONE_PULSE_SPEED"[^\n]*defaultVal: "0\.1"/);
assert.match(indexSource, /Code Viewer/);
assert.match(indexSource, /id="code-viewer-format"/);
assert.doesNotMatch(indexSource, />XML Editor<|>View XML<|Toggle the XML editor/);
assert.doesNotMatch(eventSource, /codeViewer_sourceFormat\s*===\s*["']legacy-xml["']/,
    "The Code Viewer never switches back to compatibility XML");
assert.match(indexSource, /Vectron 1\.2 — Neotron Edition/);
assert.match(readmeSource, /browser map editor for Neotron/);
assert.match(vectronSource, /description:"Neotron map \(\.neomap.json\)"/);
assert.match(guiSource, /Welcome to Vectron for Neotron\./);
assert.match(fs.readFileSync(path.join(root, "js/armamap.js"), "utf8"),
    /var NEOMAP_FORMAT = "neotron-map";/,
    "Vectron emits the Neotron-native map discriminator");

const shortcutContext = vm.createContext({
    console, Math, Date, Number, JSON, isFinite, isNaN,
    window:null
});
shortcutContext.window = shortcutContext;
vm.runInContext(configSource, shortcutContext, {filename:"js/config.js"});
assert.strictEqual(shortcutContext.config_zoomStep, 0.10);
assert.strictEqual(shortcutContext._config_check_default("zoomStep"), "0.10");
assert.deepStrictEqual(plain(shortcutContext.vectron_defaultKeybinds), {
    select:"1", wall:"2", floor:"3", zone:"4", spawn:"5", ramp:"6",
    split:"7", join:"8", wallVertexMove:"9"
});
assert.deepStrictEqual([
    shortcutContext.keybinds_nextSAction(100),
    shortcutContext.keybinds_nextSAction(200),
    shortcutContext.keybinds_nextSAction(300),
    shortcutContext.keybinds_nextSAction(800)
], ["select", "spawn", "split", "select"]);
shortcutContext.keybinds_nextSAction(900);
shortcutContext.keybinds_resetSSequence();
assert.strictEqual(shortcutContext.keybinds_nextSAction(1000), "select");

function element() {
    return {
        attrs:{}, removed:false, node:{style:{}},
        attr(value) { if(value) Object.assign(this.attrs, value); return this; },
        data() { return this; }, remove() { this.removed = true; return this; },
        transform(value) { this.transformValue = value; return this; },
        clone() { return element(); },
        translate() { return this; }, animate() { return this; },
        hoverset() { return this; }, unhover() { return this; },
        insertBefore() { return this; }, toFront() { return this; },
        getBBox() { return {width:1, height:1}; }
    };
}

function paper() {
    return {
        pathCalls:0, circleCalls:0,
        path(value) {
            this.pathCalls++;
            const result = element(); result.path = value; return result;
        },
        circle(x, y, radius) {
            this.circleCalls++;
            const result = element();
            result.attrs = {cx:x, cy:y, r:radius};
            return result;
        }, rect() { return element(); },
        text(x, y, value) {
            const result = element();
            result.textX = x; result.textY = y; result.textValue = String(value);
            return result;
        },
        set() {
            const set = element();
            set.items = [];
            set.push = function(...items) { this.items.push(...items); return this; };
            return set;
        }
    };
}

const controls = {
    "#map_axes_forced": {checked:false, value:""},
    "#dCheckpointOrder": {value:"1"},
    "#dCheckpointOrdered": {checked:true, value:""},
    "#dCheckpointAutoIncrement": {checked:true, value:""},
    "#dCheckpointAutoIncrementEvery": {value:"1"},
    "#dZoneShape": {value:"circle"},
    "#dZoneLineWidth": {value:"2"},
    "#dZoneTrigger": {value:""},
    "#dZoneMoving": {checked:false, value:""},
    "#dZoneMovementSpeed": {value:"20"},
    "#dZoneRotationSpeed": {value:"0"},
    "#dZoneMovementMode": {value:"circular"},
    "#dZonePulse": {checked:false, value:""},
    "#dZoneShowIcon": {checked:true, value:""},
    "#dBillboardUrl": {value:"https://example.com/ad.png"},
    "#dBillboardHeight": {value:"4"},
    "#dBillboardDualSided": {checked:false, value:""},
    "#selection-zone-show-icon": {checked:true, value:""},
    "#selection-billboard-facing": {value:"right"},
    "#selection-billboard-dual-sided": {checked:false, value:""},
    "#dGameSetting": {value:"CYCLE_ACCEL"},
    "#dGameSettingValue": {value:"20"},
    "#symmetry-x-toggle": {checked:false, value:""},
    "#symmetry-y-toggle": {checked:false, value:""},
    "#symmetry-origin-toggle": {checked:false, value:""},
    "#symmetry-custom-x-toggle": {checked:false, value:""},
    "#symmetry-custom-y-toggle": {checked:false, value:""},
    "#symmetry-custom-point-toggle": {checked:false, value:""},
    "#symmetry-custom-x-value": {checked:false, value:"0"},
    "#symmetry-custom-y-value": {checked:false, value:"0"},
    "#symmetry-custom-point-x": {checked:false, value:"0"},
    "#symmetry-custom-point-y": {checked:false, value:"0"},
    "#symmetry-check-toggle": {checked:false, value:""}
};

function jquery(selector) {
    const key = typeof selector === "string" ? selector : "__object";
    const control = controls[key] || (controls[key] = {value:"", data:{}, attrs:{}});
    control.data = control.data || {};
    control.attrs = control.attrs || {};
    const api = {
        0:control, length:control.present === false ? 0 : 1,
        val(value) { if(value === undefined) return control.value; control.value = String(value); return api; },
        text(value) { if(value !== undefined) control.text = String(value); return api; },
        html(value) { if(value === undefined) return control.html || ""; control.html = String(value); return api; },
        data(name, value) { if(value === undefined) return control.data[name]; control.data[name] = value; return api; },
        prop(name, value) { if(value === undefined) return control[name]; control[name] = value; return api; },
        toggle() { return api; }, show() { return api; }, hide() { return api; },
        toggleClass() { return api; }, addClass() { return api; }, removeClass() { return api; },
        attr(name, value) { if(value === undefined) return control.attrs[name]; control.attrs[name] = value; return api; },
        find() { return api; }, first() { return api; }, children() { return api; }, parents() { return api; },
        is(query) { return query === ":checked" ? !!control.checked : false; }
    };
    return api;
}
jquery.parseXML = function() { throw new Error("DOM parser not available in core test"); };

const context = vm.createContext({
    console, Math, Number, String, Array, Object, JSON, isFinite, isNaN,
    window:null, document:{
        getElementsByTagName() { return []; },
        getElementById(id) {
            const control = controls["#" + id];
            if(!control) return null;
            control.dataset = control.dataset || {};
            control.removeAttribute = function(name) { delete control.attrs[name]; };
            return control;
        }
    },
    $:jquery, vectron_screen:paper(), vectron_objectID:0,
    vectron_width:800, vectron_height:600, vectron_zoom:1,
    vectron_panX:0, vectron_panY:0, vectron_grid_spacing:8,
    vectron_grid_visible:false, vectron_currentTool:"", vectron_toolActive:false,
    cursor_realX:400, cursor_realY:300, cursor_neverSnappedX:400,
    cursor_neverSnappedY:300, cursor_snap:false, config_isDark:false,
    eventHandler_ctrl:false,
    config_autoAdjustGridSpacing:false, vectron_grid_render_locked:false,
    config_gridLayout:"square", gui_writeLog() {}, gui_toast() {},
    vectron_render() {}, actionHistory_update() {},
    zoneTool_typeArray:{0:["death", "#f00"], 1:["win", "#0a0"], 3:["rubber", "#fc0"],
        5:["checkpoint", "#95b"], 6:["speed", "#38d"], 7:["teleport", "#e72"]},
    zoneTool_type:0, alert() {}, setTimeout
});
context.window = context;

function load(relative) {
    vm.runInContext(fs.readFileSync(path.join(root, relative), "utf8"), context,
        {filename:relative});
}

load("js/AamapObjects/Spawn.js");
load("js/AamapObjects/Wall.js");
load("js/AamapObjects/Zone.js");
load("js/AamapObjects/Ramp.js");
load("js/AamapObjects/Floor.js");
load("js/AamapObjects/Billboard.js");
load("js/AamapTools/floorTool.js");
load("js/aamap.js");
load("js/AamapTools/wallTool.js");
load("js/AamapTools/zoneTool.js");
load("js/AamapTools/selectTool.js");
load("js/AamapTools/rampTool.js");
load("js/AamapTools/billboardTool.js");
load("js/xml.js");
load("js/armamap.js");
load("js/eventHandler.js");
load("js/preview3d.js");

// Generated conics retain the exact authored wall count above the editor's
// former size-derived and 720-wall ceilings.
controls["#dWallSegments"] = {value:"1201", attrs:{max:"720"}};
assert.strictEqual(context.wallTool_refreshCountInput(), 1201);
assert.strictEqual(Number(controls["#dWallSegments"].value), 1201);
assert.strictEqual(controls["#dWallSegments"].attrs.max, undefined);
assert.strictEqual(context.wallTool_circlePoints({x:0,y:0}, 10, 1201, 0).length, 1202);
assert.strictEqual(context.wallTool_arcPoints({x:0,y:0}, 10, 0, Math.PI, 1201, false).length, 1202);
assert.strictEqual(context.wallTool_ellipsePoints(
    {x:0,y:0}, {x:10,y:0}, {x:0,y:4}, 1201).length, 1202);
controls["#dWallSegments"].value = "1";
assert.strictEqual(context.wallTool_refreshCountInput(false), null);
assert.strictEqual(controls["#dWallSegments"].value, "1",
    "A transient first digit is not rewritten before the author can finish typing");
controls["#dWallSegments"].value = "12";
assert.strictEqual(context.wallTool_refreshCountInput(false), 12);
controls["#dWallSegments"].value = "100000000";
assert.strictEqual(context.wallTool_refreshCountInput(), 100000000,
    "Large authored counts are retained rather than capped");
assert.strictEqual(context.wallTool_getPreviewSegmentInput(), null,
    "Huge authored counts do not build a synchronous live preview");
assert.deepStrictEqual(plain(context.wallTool_circlePoints(
    {x:0,y:0}, 10, Infinity, 0)), [],
    "Non-finite counts cannot enter a nonterminating generator loop");
controls["#dWallSegments"].value = "16";

assert.strictEqual(context.zoneTool_validCheckpointNumberText("1", false), true);
assert.strictEqual(context.zoneTool_validCheckpointNumberText("248", false), true);
assert.strictEqual(context.zoneTool_validCheckpointNumberText("4294967295", false), true);
assert.strictEqual(context.zoneTool_shiftLegacyCheckpointOrder(4294967294), 4294967295);
assert.strictEqual(context.zoneTool_shiftLegacyCheckpointOrder(4294967295), 4294967295,
    "Legacy zero-based checkpoint migration saturates like the game loader");
assert.strictEqual(context.zoneTool_shiftLegacyCheckpointOrder(4294967296), null);
["4294967296", "9007199254740991"].forEach(function(value) {
    assert.strictEqual(context.zoneTool_validCheckpointNumberText(value, false), false);
});
const maxOrderCheckpoint = new context.Zone(0, 0, 1, 0, 5, 4294967295, {
    zoneName:"checkpoint", shapeType:"circle", options:{}
});
assert.strictEqual(context.armamap_zone(maxOrderCheckpoint).order, 4294967295);
maxOrderCheckpoint.option = 4294967296;
assert.throws(function() { context.armamap_zone(maxOrderCheckpoint); },
    /unsigned 32-bit range/);
["", "0", "-1", "+1", "1.5", "1e2", "two"].forEach(function(value) {
    assert.strictEqual(context.zoneTool_validCheckpointNumberText(value, false), false);
});
assert.strictEqual(context.zoneTool_validCheckpointNumberText("", true), true,
    "The field may be temporarily empty while replacing its value");
const checkpointInputMock = {value:"12", selectionStart:1, selectionEnd:2};
assert.strictEqual(context.zoneTool_checkpointInputCandidate(checkpointInputMock, "7"), "17");
assert.strictEqual(context.eventHandler_releasesShortcutFocus({tagName:"SELECT"}), true);
assert.strictEqual(context.eventHandler_releasesShortcutFocus({tagName:"INPUT",type:"checkbox"}), true);
assert.strictEqual(context.eventHandler_releasesShortcutFocus({tagName:"INPUT",type:"number"}), false);
assert.strictEqual(context.zoneTool_buildDetails().showIcon, true);
controls["#dZoneShowIcon"].checked = false;
assert.strictEqual(context.zoneTool_buildDetails().showIcon, false);
controls["#dZoneShowIcon"].checked = true;

controls["#dCheckpointOrder"].value = "42";
context.aamap_objects = [];
assert.strictEqual(context.zoneTool_resetCheckpointNumberForMap(), true);
assert.strictEqual(controls["#dCheckpointOrder"].value, "1");
assert.strictEqual(controls["#dCheckpointOrder"].dataset.lastValidValue, "1");
controls["#dCheckpointOrder"].value = "7";
assert.strictEqual(context.zoneTool_ensureCheckpointNumber(), 7,
    "Authors may override the empty-map checkpoint default");
context.aamap_objects = [{zoneName:"checkpoint", option:4}];
controls["#dCheckpointOrder"].value = "9";
assert.strictEqual(context.zoneTool_resetCheckpointNumberForMap(), false);
assert.strictEqual(controls["#dCheckpointOrder"].value, "9",
    "Loading a map with checkpoints does not overwrite the author's next number");
context.aamap_objects = [];
assert.strictEqual(context.zoneTool_syncCheckpointNumberForAvailability(), false);
assert.strictEqual(controls["#dCheckpointOrder"].value, "1",
    "Removing the final checkpoint resets the next checkpoint number");
controls["#dCheckpointOrder"].value = "6";
assert.strictEqual(context.zoneTool_syncCheckpointNumberForAvailability(), false);
assert.strictEqual(controls["#dCheckpointOrder"].value, "6",
    "A manual override remains available while the map stays checkpoint-free");
context.zoneTool_checkpointPlacementsSinceIncrement = 2;
const manualCheckpointState = context.zoneTool_captureCheckpointEditorState();
controls["#dCheckpointOrder"].value = "1";
context.zoneTool_resetCheckpointIncrementProgress();
context.zoneTool_restoreCheckpointEditorState(manualCheckpointState, [], false);
assert.strictEqual(controls["#dCheckpointOrder"].value, "6",
    "Map-state undo can restore an empty map's manual next number");
assert.strictEqual(context.zoneTool_checkpointPlacementsSinceIncrement, 2,
    "Map-state undo restores checkpoint auto-increment cadence progress");
context.zoneTool_resetCheckpointIncrementProgress();
controls["#dCheckpointOrder"].value = "4294967295";
assert.strictEqual(context.zoneTool_advanceCheckpointAfterPlacement(
    {zoneName:"checkpoint", option:4294967295}), false);
assert.strictEqual(controls["#dCheckpointOrder"].value, "4294967295",
    "Auto-increment never emits a value beyond the game's u32 range");
controls["#dCheckpointOrder"].value = "1";

const initialPathCalls = context.vectron_screen.pathCalls;
const initialCircleCalls = context.vectron_screen.circleCalls;
context.aamap_beginBulkLoad();
let bulkObjects;
try {
    bulkObjects = [new context.Spawn(), new context.Wall(),
        new context.Zone(0, 0, 1, 0, 0, 0, {zoneName:"death"}),
        new context.Ramp({x:-1,y:0}, {x:1,y:0}, {x:-1,y:5}, {x:1,y:5}, 0, 1),
        new context.Floor(1),
        new context.Billboard({x:-2,y:3}, {x:2,y:3}, 4,
            "https://example.com/ad.png", 0)];
} finally {
    context.aamap_endBulkLoad();
}
assert.ok(bulkObjects.every(function(object) { return object.obj === null; }),
    "Bulk import constructs model objects without temporary Raphael nodes");
assert.strictEqual(bulkObjects[0].guideObj, null);
assert.strictEqual(bulkObjects[1].guideObj, null);
assert.strictEqual(context.vectron_screen.pathCalls, initialPathCalls);
assert.strictEqual(context.vectron_screen.circleCalls, initialCircleCalls);
assert.strictEqual(context.aamap_isBulkLoading(), false);

assert.strictEqual(context.codeViewer_formatJsonText('{"format":"neotron-map","walls":[]}'),
    '{\n  "format": "neotron-map",\n  "walls": []\n}\n');
assert.strictEqual(context.codeViewer_formatXmlText(
    '<Resource name="readable"><Map><World><Field><Spawn x="1" y="2"/></Field></World></Map></Resource>'),
    '<Resource name="readable">\n  <Map>\n    <World>\n      <Field>\n' +
    '        <Spawn x="1" y="2"/>\n      </Field>\n    </World>\n  </Map>\n</Resource>\n');
context.codeViewer_setSourceFormat("legacy-xml");
assert.strictEqual(context.codeViewer_sourceFormat, "neomap-json",
    "Legacy imports cannot make the Code Viewer expose compatibility XML");
context.codeViewer_setSourceFormat("not-a-format");
assert.strictEqual(context.codeViewer_sourceFormat, "neomap-json");
assert.deepStrictEqual(plain(context.codeViewer_findMatches(
    '"name": "Alpha alpha"', "alpha", false)), [
    {start:9,end:14}, {start:15,end:20}
]);
assert.deepStrictEqual(plain(context.codeViewer_findMatches(
    '"name": "Alpha alpha"', "Alpha", true)), [{start:9,end:14}]);
assert.deepStrictEqual(plain(context.codeViewer_replaceAllText(
    'Alpha alpha ALPHA', "alpha", "zone", false)), {
    text:'zone zone zone', count:3
});
const selectionEnvelopeDocument = {
    format:"neotron-map", format_version:1,
    metadata:{name:"Envelope",tags:["racing"],revision:"generated-a"},
    axes:4, levels:{count:1,gaps:[]}, settings:{RIM_HEIGHT:8},
    validation:{version:1,ticks:1,fraction:0,tick_rate:60,fraction_scale:1000000,
        proof_algorithm:"test",replay_proof:"proof"},
    spawns:[],walls:[{points:[[0,0],[8,0]]}],floors:[],ramps:[],zones:[]
};
const selectionGeometryEdit = plain(selectionEnvelopeDocument);
selectionGeometryEdit.metadata.revision = "generated-b";
selectionGeometryEdit.walls[0].points[0][0] = 2;
assert.strictEqual(context.codeViewer_selectionEnvelopeMatches(
    selectionGeometryEdit, selectionEnvelopeDocument), true,
    "Selection code may change object arrays and the generated revision");
const selectionMetadataEdit = plain(selectionGeometryEdit);
selectionMetadataEdit.metadata.name = "Changed through Selection";
assert.strictEqual(context.codeViewer_selectionEnvelopeMatches(
    selectionMetadataEdit, selectionEnvelopeDocument), false,
    "Selection code rejects map-wide metadata edits");
const selectionSettingsEdit = plain(selectionGeometryEdit);
selectionSettingsEdit.settings.RIM_HEIGHT = 12;
assert.strictEqual(context.codeViewer_selectionEnvelopeMatches(
    selectionSettingsEdit, selectionEnvelopeDocument), false,
    "Selection code rejects map-wide settings edits");

const originalPieceProcessor = context.xml_process_piece;
context.xml_checkpoint_order_base_one = false;
let canonicalSelectionSawBaseOne = false;
context.xml_process_piece = function() {
    canonicalSelectionSawBaseOne = context.xml_checkpoint_order_base_one;
    return "processed";
};
assert.strictEqual(context.codeViewer_processCanonicalSelection("<Resource/>"), "processed");
assert.strictEqual(canonicalSelectionSawBaseOne, true,
    "Selection replacement parses canonical checkpoint orders as one-based");
assert.strictEqual(context.xml_checkpoint_order_base_one, false,
    "Selection replacement restores the surrounding legacy parser state");
context.xml_process_piece = function() {
    assert.strictEqual(context.xml_checkpoint_order_base_one, true);
    throw new Error("selection import failed");
};
assert.throws(function() {
    context.codeViewer_processCanonicalSelection("<Resource/>");
}, /selection import failed/);
assert.strictEqual(context.xml_checkpoint_order_base_one, false,
    "Selection replacement restores parser state after an exception");
context.xml_process_piece = originalPieceProcessor;

const pasteGridObjects = [
    {getPosition() { return [0, 0]; }},
    {getPosition() { return [8, 0]; }}
];
context.cursor_snap = true;
assert.deepStrictEqual(plain(context.selectTool_pasteTranslation(
    pasteGridObjects, 16, 8)), {x:16,y:8},
    "A snapped paste uses a lattice offset instead of the off-grid 12-unit centre offset");
context.cursor_snap = false;
assert.deepStrictEqual(plain(context.selectTool_pasteTranslation(
    pasteGridObjects, 16, 8)), {x:12,y:8},
    "Disabling grid snap retains the exact cursor-centering offset");

// Pasting a clipboard that already contains both sides of a mirrored pair
// must not generate a second overlapping pair. Undo owns only this paste and
// leaves pre-existing map objects untouched.
const pasteExistingWall = new context.Wall();
pasteExistingWall.points = [{x:30,y:30},{x:34,y:30}];
context.aamap_objects = [pasteExistingWall];
context.selectTool_selectedObjs = [];
context.aamap_clearHistory();
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = false;
controls["#symmetry-origin-toggle"].checked = false;
controls["#symmetry-custom-x-toggle"].checked = false;
controls["#symmetry-custom-y-toggle"].checked = false;
controls["#symmetry-custom-point-toggle"].checked = false;
const originalXmlProcessPiece = context.xml_process_piece;
context.xml_process_piece = function() {
    const right = new context.Wall();
    right.points = [{x:2,y:1},{x:4,y:1}];
    const left = new context.Wall();
    left.points = [{x:-2,y:1},{x:-4,y:1}];
    context.aamap_add(right);
    context.aamap_add(left);
};
context.selectTool_clipboard = "<Field/>";
context.cursor_snap = false;
context.cursor_realX = context.aamap_realX(0);
context.cursor_realY = context.aamap_realY(0);
context.selectTool_paste();
assert.strictEqual(context.aamap_objects.length, 3,
    "Batch symmetry dedupe keeps the two pasted primaries without generated overlaps");
assert.strictEqual(context.selectTool_selectedObjs.length, 2);
assert.ok(context.selectTool_selectedObjs.every(function(object) {
    return object !== pasteExistingWall;
}), "Paste selection contains only newly pasted objects");
assert.strictEqual(context.selectTool_selectedObjs[0]._symmetryGroup,
    context.selectTool_selectedObjs[1]._symmetryGroup,
    "Existing mirrored primaries become one coherent symmetry group");
const pastedPairMove = context.aamap_symmetryMovePlan(
    context.selectTool_selectedObjs, 1, 0);
assert.strictEqual(pastedPairMove.created.length, 0,
    "Moving an already mirrored pasted pair does not create overlapping copies");
assert.strictEqual(pastedPairMove.entries.length, 2);
assert.deepStrictEqual(plain(pastedPairMove.entries.map(function(entry) {
    return entry.dx;
}).sort(function(a, b) { return a - b; })), [-1, 1],
"The pasted pair moves as one linked symmetry group");
assert.strictEqual(context.aamap_objects.length, 3);
context.aamap_undo();
assert.deepStrictEqual(context.aamap_objects, [pasteExistingWall],
    "Undo removes only the pasted batch");
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 3);
assert.strictEqual(context.aamap_objects[0], pasteExistingWall);
context.aamap_objects.slice(1).forEach(context.aamap_removeObjectVisuals);
context.aamap_objects = [];
context.selectTool_selectedObjs = [];
context.selectTool_clipboard = "";
context.xml_process_piece = originalXmlProcessPiece;
const duplicatePrimaryA = new context.Wall();
duplicatePrimaryA.points = [{x:2,y:3},{x:4,y:3}];
const duplicatePrimaryB = new context.Wall();
duplicatePrimaryB.points = [{x:2,y:3},{x:4,y:3}];
context.aamap_add(duplicatePrimaryA);
context.aamap_add(duplicatePrimaryB);
const duplicateSymmetryBatch = context.aamap_addSymmetryCopiesForExistingBatch(
    [duplicatePrimaryA, duplicatePrimaryB]);
assert.strictEqual(duplicateSymmetryBatch.length, 4,
    "Symmetry paste preserves intentional duplicate multiplicity");
assert.notStrictEqual(duplicatePrimaryA._symmetryGroup,
    duplicatePrimaryB._symmetryGroup,
    "Identical authored primaries retain independent symmetry groups");
context.aamap_removeObjectGroup(duplicateSymmetryBatch);
controls["#symmetry-x-toggle"].checked = false;

const line = new context.Zone(0, 0, 0, 0, 5, 0, {
    zoneName:"checkpoint", shapeType:"line", lineWidth:2,
    lineStart:{x:-3, y:1}, lineEnd:{x:3, y:1}, options:{}
});
line.level = 1;
assert.match(line.getXML(),
    /<Zone level="1" type="checkpoint" show_icon="true" order="0">/);
assert.match(line.getXML(), /<ShapeLine width="2">/);
assert.deepStrictEqual(plain(line.getLineFootprintPoints()), [
    {x:-3,y:2}, {x:3,y:2}, {x:3,y:0}, {x:-3,y:0}
]);
assert.deepStrictEqual(plain(line.getBounds()), {minx:-3,miny:0,maxx:3,maxy:2});
line.render();
assert.strictEqual(line.obj.attrs.stroke, "#ffffff");
assert.strictEqual(line.obj.attrs["stroke-linecap"], "butt");
assert.strictEqual(line.obj.attrs["stroke-width"], 1);
assert.strictEqual(line.obj.attrs.fill, "#ffffff");
assert.strictEqual(line.obj.path[line.obj.path.length - 1], "Z");
assert.strictEqual(line.checkpointLabelObj.textValue, "ANY");
assert.strictEqual(line.checkpointLabelObj.attrs.fill, "#ffffff");
assert.strictEqual(line.checkpointLabelObj.attrs.stroke, "none");
assert.strictEqual(line.checkpointLabelOutlineObj.attrs.fill, "none");
assert.strictEqual(line.checkpointLabelOutlineObj.attrs.stroke, "#000000");
assert.strictEqual(line.checkpointLabelOutlineObj.attrs["stroke-width"], 5);
assert.strictEqual(line.checkpointLabelObj.textX, context.aamap_realX(0));
assert.strictEqual(line.checkpointLabelObj.textY, context.aamap_realY(1));

const zeroWidthLine = new context.Zone(0, 0, 0, 0, 0, 0, {
    zoneName:"death", shapeType:"line", lineWidth:0,
    lineStart:{x:-3, y:1}, lineEnd:{x:3, y:1}, options:{}
});
assert.strictEqual(zeroWidthLine.lineWidth, 0);
assert.strictEqual(zeroWidthLine.radius, 3);
assert.deepStrictEqual(plain(zeroWidthLine.getLineFootprintPoints()), [
    {x:-3,y:1}, {x:3,y:1}
]);
assert.deepStrictEqual(plain(zeroWidthLine.getBounds()), {minx:-3,miny:1,maxx:3,maxy:1});
assert.match(zeroWidthLine.getXML(), /<ShapeLine width="0">/);
zeroWidthLine.render();
assert.deepStrictEqual(plain(zeroWidthLine.obj.path), [
    "M", context.aamap_realX(-3), context.aamap_realY(1),
    "L", context.aamap_realX(3), context.aamap_realY(1)
]);
assert.strictEqual(zeroWidthLine.obj.attrs["stroke-linecap"], "butt");
assert.strictEqual(zeroWidthLine.obj.attrs.fill, "none");
assert.strictEqual(context.selectTool_pointInZoneHitArea(zeroWidthLine,
    context.aamap_realX(3.01), context.aamap_realY(1), 0), false,
"The zero-width hit area stops at the authored endpoint");
assert.strictEqual(context.selectTool_pointInZoneHitArea(line,
    context.aamap_realX(3.01), context.aamap_realY(1), 0), false,
    "The positive-width box has square ends instead of capsule extensions");

// Existing selected line zones expose a contextual numeric property. A
// literal zero updates the model, bounds, renderer form, and XML, and remains
// a normal undoable editor action.
zeroWidthLine.lineWidth = 2;
zeroWidthLine.updateLineBounds();
context.aamap_objects = [zeroWidthLine];
context.aamap_clearHistory();
context.vectron_currentTool = "select";
context.selectTool_selectedObjs = [zeroWidthLine];
context.selectTool_updateSelectionProperties();
assert.strictEqual(controls["#selection-line-zone-width"].value, "2");
assert.strictEqual(context.selectTool_applySelectedLineWidth("0"), true);
assert.strictEqual(zeroWidthLine.lineWidth, 0);
assert.match(zeroWidthLine.getXML(), /<ShapeLine width="0">/);
assert.strictEqual(controls["#selection-line-zone-width"].value, "0");
context.aamap_undo();
assert.strictEqual(zeroWidthLine.lineWidth, 2);
context.aamap_redo();
assert.strictEqual(zeroWidthLine.lineWidth, 0);
assert.strictEqual(context.selectTool_applySelectedLineWidth("-1"), false);

assert.strictEqual(zeroWidthLine.showIcon, true,
    "Legacy/imported zones default their game icon to enabled");
assert.strictEqual(context.selectTool_applySelectedZoneShowIcon(false), true);
assert.strictEqual(zeroWidthLine.showIcon, false);
assert.match(zeroWidthLine.getXML(), /show_icon="false"/);
context.aamap_undo();
assert.strictEqual(zeroWidthLine.showIcon, true);
context.aamap_redo();
assert.strictEqual(zeroWidthLine.showIcon, false);
zeroWidthLine.showIcon = true;

const zeroWidthPreview = context.preview3d_newScene();
context.preview3d_addZone(zeroWidthPreview, zeroWidthLine);
assert.strictEqual(zeroWidthPreview.lines.length, 1);
assert.deepStrictEqual(plain({
    a:zeroWidthPreview.lines[0].a.slice(0, 2),
    b:zeroWidthPreview.lines[0].b.slice(0, 2)
}), {a:[-3,1],b:[3,1]});
const positiveWidthPreview = context.preview3d_newScene();
context.preview3d_addZone(positiveWidthPreview, line);
assert.strictEqual(positiveWidthPreview.lines.length, 4);
assert.deepStrictEqual(plain(positiveWidthPreview.lines.map(function(edge) {
    return [edge.a.slice(0, 2), edge.b.slice(0, 2)];
})), [
    [[-3,2],[3,2]], [[3,2],[3,0]], [[3,0],[-3,0]], [[-3,0],[-3,2]]
]);

const rectangleCheckpoint = new context.Zone(0, 0, 0, 0, 5, 1, {
    zoneName:"checkpoint", shapeType:"rectangle", options:{},
    minx:10, miny:20, maxx:18, maxy:26
});
rectangleCheckpoint.render();
assert.deepStrictEqual(plain(rectangleCheckpoint.getShapeCenter()), {x:14,y:23});
assert.strictEqual(rectangleCheckpoint.checkpointLabelObj.textX, context.aamap_realX(14));
assert.strictEqual(rectangleCheckpoint.checkpointLabelObj.textY, context.aamap_realY(23));

const polygonCheckpoint = new context.Zone(100, 50, 0, 0, 5, 2, {
    zoneName:"checkpoint", shapeType:"polygon", options:{}, polygonScale:1,
    polygonPoints:[{x:0,y:0},{x:9,y:0},{x:0,y:6}]
});
polygonCheckpoint.render();
assert.deepStrictEqual(plain(polygonCheckpoint.getShapeCenter()), {x:103,y:52});
assert.strictEqual(polygonCheckpoint.checkpointLabelObj.textX, context.aamap_realX(103));
assert.strictEqual(polygonCheckpoint.checkpointLabelObj.textY, context.aamap_realY(52));

// Runtime zone icons use the arithmetic mean of polygon vertices. Irregular
// polygons must use that same center in Vectron rather than their area centroid.
const irregularPolygonCheckpoint = new context.Zone(10, 20, 0, 0, 5, 3, {
    zoneName:"checkpoint", shapeType:"polygon", options:{}, polygonScale:1,
    polygonPoints:[{x:0,y:0},{x:8,y:0},{x:8,y:2},{x:0,y:6}]
});
irregularPolygonCheckpoint.render();
assert.deepStrictEqual(plain(irregularPolygonCheckpoint.getShapeCenter()), {x:14,y:22});
assert.strictEqual(irregularPolygonCheckpoint.checkpointLabelObj.textX,
    context.aamap_realX(14));
assert.strictEqual(irregularPolygonCheckpoint.checkpointLabelObj.textY,
    context.aamap_realY(22));

// Scale Map applies one uniform factor to zone geometry and all secondary
// data. In particular, a teleport source must not drift away from its moving
// path and destination because one source coordinate was scaled twice.
const scalableTeleport = new context.Zone(3, 4, 2, 0, 7, 0, {
    zoneName:"teleport", shapeType:"circle",
    options:{destination_x:12, destination_y:-6, destination_level:0, xdir:1, ydir:0},
    movementPath:[{x:3,y:4},{x:8,y:9}]
});
scalableTeleport.scale(2);
assert.deepStrictEqual(plain({
    x:scalableTeleport.x, y:scalableTeleport.y, radius:scalableTeleport.radius,
    path:scalableTeleport.movementPath,
    destination:{x:scalableTeleport.options.destination_x,
        y:scalableTeleport.options.destination_y}
}), {
    x:6, y:8, radius:4,
    path:[{x:6,y:8},{x:16,y:18}], destination:{x:24,y:-12}
});

const scalablePolygon = new context.Zone(5, 7, 0, 0, 5, 0, {
    zoneName:"checkpoint", shapeType:"polygon", options:{}, polygonScale:1,
    polygonPoints:[{x:-2,y:-1},{x:4,y:-1},{x:-2,y:2}]
});
scalablePolygon.scale(3);
assert.deepStrictEqual(plain(scalablePolygon.getMapPoints()), [
    {x:9,y:18},{x:27,y:18},{x:9,y:27}
]);

const movingCheckpoint = new context.Zone(0, 0, 2, 0, 5, 0, {
    zoneName:"checkpoint", shapeType:"circle", options:{}, movementInstances:[1,2],
    movementPath:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]
});
movingCheckpoint.render();
assert.strictEqual(movingCheckpoint.movementPathObj.items.length, 9,
    "Three path legs plus two moving-copy ghosts and their layered checkpoint labels");

const sparsePulsePath = [
    {x:0,y:0}, {x:10,y:0}, {x:20,y:0}, {x:30,y:0}
];
assert.strictEqual(context.zone_movementRadiusAtVertex(
    sparsePulsePath, [null,4,null,8], "instant", 0, 2), 4,
    "Instant motion holds the first pulse key through an unkeyed prefix");
assert.strictEqual(context.zone_movementRadiusAtVertex(
    sparsePulsePath, [4,null,8,null], "ping_pong", 3, 2), 8,
    "Ping-pong motion holds the last pulse key through an unkeyed suffix");
assert.strictEqual(context.zone_movementRadiusAtVertex(
    sparsePulsePath, [null,4,null,8], "instant", 2, 2), 6,
    "Sparse pulse keys interpolate by distance at instance reset vertices");
const circularResetRadius = context.zone_movementRadiusAtVertex(
    sparsePulsePath.slice(0, 3), [null,4,8], "circular", 0, 2);
assert.ok(Math.abs(circularResetRadius - 16 / 3) < 1e-9,
    "Circular reset poses interpolate over the closing leg");

const sparsePulseZone = new context.Zone(0, 0, 2, 0, 0, 0, {
    zoneName:"death", shapeType:"circle", options:{}, movementMode:"instant",
    movementInstances:[2], movementPath:sparsePulsePath,
    movementPulseRadii:[null,4,null,8]
});
sparsePulseZone.render();
assert.strictEqual(sparsePulseZone.obj.attrs.r, 4,
    "The 2D source pose renders its resolved reset radius");
assert.strictEqual(sparsePulseZone.movementPathObj.items[3].attrs.r, 6,
    "The 2D instance ghost renders its interpolated reset radius");
assert.strictEqual(sparsePulseZone.radius, 2,
    "Resolving a reset pose does not overwrite the authored base radius");
assert.deepStrictEqual(plain(sparsePulseZone.movementPulseRadii), [null,4,null,8],
    "Resolving a reset pose does not mutate serialized pulse keys");

const teleport = new context.Zone(0, 0, 4, 0, 7, 0, {
    zoneName:"teleport", shapeType:"circle",
    options:{destination_x:8, destination_y:9, destination_level:2, xdir:1, ydir:0}
});
assert.match(teleport.getXML(), /destination_level="2"/);

const health = new context.Zone(0, 0, 4, 0, 3, 0, {
    zoneName:"health", shapeType:"circle", options:{delta:-12.5}
});
assert.match(health.getXML(), /type="health" show_icon="true" delta="-12.5"/);
const rubber = new context.Zone(3, -2, 4, 0, 4, 0, {
    zoneName:"rubber", shapeType:"circle",
    options:{delta:-125, duration_ticks:240}
});
assert.match(rubber.getXML(),
    /type="rubber" show_icon="true" delta="-125" duration_ticks="240"/);
assert.deepStrictEqual(plain(context.armamap_zone(rubber)), {
    type:"rubber",level:0,shape:{type:"circle",center:[3,-2],radius:4},
    show_icon:true,delta:-125,duration_ticks:240
}, "Imported rubber stays a rubber effect with its signed delta and duration");
const setting = new context.Zone(0, 0, 4, 0, 8, 0, {
    zoneName:"setting", shapeType:"circle",
    options:{setting:"CYCLE_ACCEL", value:20}
});
assert.match(setting.getXML(),
    /type="setting" show_icon="true" setting="CYCLE_ACCEL" value="20"/);
controls["#dGameSetting"].value = "JUMP_ENABLED";
context.zoneTool_updateGameSettingValue(true);
assert.strictEqual(controls["#dGameSettingValue"].value, "1");
assert.strictEqual(controls["#dGameSettingValue"].attrs.min, 0);
assert.strictEqual(controls["#dGameSettingValue"].attrs.max, 1);
context.zoneTool_type = 8;
assert.deepStrictEqual(plain(context.zoneTool_buildDetails().options), {
    setting:"JUMP_ENABLED", value:1
});
assert.strictEqual(context.zoneTool_settingValidationError("JUMP_ENABLED", 1), null);
assert.match(context.zoneTool_settingValidationError("JUMP_ENABLED", 2), /0 or 1/);
assert.match(context.zoneTool_settingValidationError("TURN_SPEED_LOSS", -0.1), /0 through 100/);
assert.match(context.zoneTool_settingValidationError("TURN_SPEED_LOSS", 100.1), /0 through 100/);
context.zoneTool_type = 0;

const movingZone = new context.Zone(2, 3, 4, 0, 0, 0, {
    zoneName:"death", shapeType:"rectangle", options:{},
    minx:-2, miny:-1, maxx:6, maxy:7,
    movementSpeed:20, rotationSpeed:-15,
    movementMode:"instant", movementInstances:[1,2],
    movementPath:[{x:2,y:3}, {x:12,y:3}, {x:12,y:9}]
});
const movingXml = movingZone.getXML();
assert.match(movingXml, /movement_speed="20" rotation_speed="-15"/);
assert.match(movingXml, /<MovementPath\b[^>]*\bloop="true"/);
assert.match(movingXml, /mode="instant" instances="1,2"/);
assert.strictEqual((movingXml.match(/<MovementPath[\s\S]*?<Point /) || []).length, 1);
movingZone.render();
assert.strictEqual(movingZone.movementPathObj.items.length, 4,
    "Instant draws two directed legs plus each additional copy's reset-phase ghost");
assert.strictEqual(movingZone.movementPathObj.items[0].attrs["arrow-end"],
    "classic-wide-long");
movingZone.move(1, -2);
assert.deepStrictEqual(plain(movingZone.movementPath), [
    {x:3,y:1}, {x:13,y:1}, {x:13,y:7}
]);
const rotatingCircle = new context.Zone(0, 0, 4, 0, 0, 0, {
    zoneName:"death", shapeType:"circle", options:{},
    movementSpeed:5, rotationSpeed:17.5,
    movementPath:[{x:0,y:0}, {x:10,y:0}]
});
assert.strictEqual(rotatingCircle.rotationSpeed, 17.5,
    "Circle zones must retain imported path rotation");
assert.match(rotatingCircle.getXML(), /rotation_speed="17.5"/);
assert.strictEqual(context.armamap_zone(rotatingCircle).movement.rotation, 17.5);

assert.strictEqual(context.wallTool_isGridDiagonalSegment({x:0,y:0}, {x:5,y:5}), true);
assert.strictEqual(context.wallTool_isGridDiagonalSegment({x:0,y:0}, {x:-5,y:5}), true);
assert.strictEqual(context.wallTool_isGridDiagonalSegment({x:0,y:0}, {x:-5,y:-5}), true);
assert.strictEqual(context.wallTool_isGridDiagonalSegment({x:0,y:0}, {x:5,y:-5}), true);
assert.strictEqual(context.wallTool_isGridDiagonalSegment({x:0,y:0}, {x:5,y:4}), false);

// Polygon and line zones use the same cyan active-segment feedback as the
// freeform wall tool at grid diagonals, without recoloring committed edges.
context.zoneTool_type = 0;
context.zoneTool_stage = "shape";
controls["#dZoneShape"].value = "polygon";
context.zoneTool_points = [{x:0,y:0}, {x:4,y:0}];
context.cursor_realX = context.aamap_realX(8);
context.cursor_realY = context.aamap_realY(4);
context.zoneTool_guide();
assert.strictEqual(context.zoneTool_guideObj.items[0].attrs.stroke,
    context.zoneTool_typeArray[0][1]);
assert.strictEqual(context.zoneTool_guideObj.items[1].attrs.stroke, "#00cfff");
assert.strictEqual(context.zoneTool_guideObj.items[1].attrs["stroke-width"], 3);
context.cursor_realY = context.aamap_realY(3);
context.zoneTool_guide();
assert.strictEqual(context.zoneTool_guideObj.items[1].attrs.stroke,
    context.zoneTool_typeArray[0][1]);

controls["#dZoneShape"].value = "line";
controls["#dZoneLineWidth"].value = "0";
context.zoneTool_points = [{x:0,y:0}];
context.cursor_realX = context.aamap_realX(-5);
context.cursor_realY = context.aamap_realY(5);
context.zoneTool_guide();
assert.strictEqual(context.zoneTool_getLineWidth(true), 0);
assert.strictEqual(context.zoneTool_guideObj.items[0].attrs["stroke-linecap"], "butt");
assert.strictEqual(context.zoneTool_guideObj.items[0].attrs.fill, "none");
assert.strictEqual(context.zoneTool_guideObj.items[0].path.includes("Z"), false);
assert.strictEqual(context.zoneTool_guideObj.items[1].attrs.stroke, "#00cfff");
assert.strictEqual(context.zoneTool_guideObj.items[1].attrs["stroke-dasharray"], "--");
controls["#dZoneLineWidth"].value = "2";
controls["#dZoneShape"].value = "circle";
context.zoneTool_points = [];

const ase = context.preview3d_parseAse(fs.readFileSync(
    path.resolve(root, "../../assets/models/cycle.ASE"), "utf8"));
assert.ok(ase && ase.vertices.length > 700 && ase.edges.length > 2000);
assert.strictEqual(context.preview3d_levelElevation(3, [6, 8, 10]), 24);
const projected = context.preview3d_projectPoint([0, 10, 0],
    {x:0,y:0,z:0,yaw:0,pitch:0,fov:68}, 800, 600);
assert.ok(projected && Math.abs(projected.x - 400) < 1e-9);
const concaveFloorPoints = [
    {x:0,y:0}, {x:6,y:0}, {x:6,y:2},
    {x:2,y:2}, {x:2,y:6}, {x:0,y:6}
];
const concaveTriangles = context.preview3d_triangulatePolygon(concaveFloorPoints);
assert.strictEqual(concaveTriangles.length, 4);
const triangulatedArea = concaveTriangles.reduce((sum, triangle) =>
    sum + Math.abs(context.preview3d_polygonSignedArea(triangle)), 0);
assert.strictEqual(triangulatedArea, 20);
const nearClippedLine = context.preview3d_clipProjectLine(
    [0, 0, 0], [0, 10, 0], {x:0,y:0,z:0,yaw:0,pitch:0,fov:68}, 800, 600);
assert.ok(nearClippedLine && nearClippedLine.a && nearClippedLine.b);
assert.ok(Math.abs(nearClippedLine.a.depth - context.PREVIEW3D_NEAR) < 1e-9);
assert.deepStrictEqual(plain(context.preview3d_closedPathPosition(
    [{x:0,y:0}, {x:10,y:0}], 5, 1)), {x:5,y:0});
assert.deepStrictEqual(plain(context.preview3d_closedPathPosition(
    [{x:0,y:0}, {x:10,y:0}], 5, 3)), {x:5,y:0});
assert.deepStrictEqual(plain(context.preview3d_closedPathPosition(
    [{x:0,y:0}, {x:10,y:0}, {x:20,y:0}], 10, 3, "ping_pong")), {x:10,y:0});
assert.deepStrictEqual(plain(context.preview3d_closedPathPosition(
    [{x:0,y:0}, {x:10,y:0}, {x:10,y:10}], 10, 2.5, "instant")), {x:5,y:0});
const movingPoint = context.preview3d_transformMovingZonePoint([2,0,3], {
    path:[{x:0,y:0}, {x:10,y:0}], speed:5, rotationSpeed:90
}, 1);
assert.ok(Math.abs(movingPoint[0] - 5) < 1e-9);
assert.ok(Math.abs(movingPoint[1] - 2) < 1e-9);
assert.strictEqual(movingPoint[2], 3);
const shortInstantPoint = context.preview3d_transformMovingZonePoint([2,0,3], {
    path:[{x:0,y:0}, {x:1,y:0}], speed:10, rotationSpeed:0,
    mode:"instant", scaleCenter:{x:0,y:0}
}, 0.15);
assert.ok(Math.abs(shortInstantPoint[0] - 0.7) < 1e-9,
    "Instant zones use a fixed half-second regrowth even when the route is shorter");

const rimScene = context.preview3d_newScene();
context.preview3d_addRimWall(rimScene, [0,0,2], [10,0,5], 6);
assert.strictEqual(rimScene.triangles.length, 2);
assert.strictEqual(rimScene.lines.length, 1);
assert.strictEqual(rimScene.triangles[0].color, context.PREVIEW3D_RIM_COLOR);
assert.strictEqual(rimScene.bounds.max[2], 11);

const oneSidedPreview = context.preview3d_newScene();
context.preview3d_addBillboard(oneSidedPreview, new context.Billboard(
    {x:-4,y:0},{x:4,y:0},3,"https://example.com/front.png",0,"left",false));
assert.strictEqual(oneSidedPreview.triangles.length, 2);
assert.strictEqual(oneSidedPreview.triangles[0].dualSided, false);
assert.deepStrictEqual(plain(oneSidedPreview.triangles[0].frontNormal), [0,1,0]);
assert.strictEqual(oneSidedPreview.lines.length, 5,
    "The 3D placeholder includes four neon edges and its facing indicator");

const wall = new context.Wall();
wall.level = 1;
wall.points = [{x:0, y:0}, {x:5, y:0}];

const slopedWall = new context.Wall();
slopedWall.level = 1;
slopedWall.height = 4;
slopedWall.slopedHeight = true;
slopedWall.points = [new context.WallPoint(0, 0, 2.5),
    new context.WallPoint(5, 0, 7.25)];
assert.match(slopedWall.getXML(), /^<Wall level="1">/);
assert.doesNotMatch(slopedWall.getXML(), /<Wall[^>]* height=/);
assert.match(slopedWall.getXML(), /<Point x="0" y="0" height="2\.5"\/>/);
assert.match(slopedWall.getXML(), /<Point x="5" y="0" height="7\.25"\/>/);
context.aamap_resetLevels(2, [8]);
const slopedWallPreview = context.preview3d_buildScene([slopedWall]);
assert.strictEqual(slopedWallPreview.bounds.max[2], 15.25);
const reflectedSlopedWall = context.aamap_symmetryClone(slopedWall, {x:-1,y:1});
assert.strictEqual(reflectedSlopedWall.slopedHeight, true);
assert.deepStrictEqual(plain(reflectedSlopedWall.points.map(point => [point.x,point.height])),
    [[0,2.5],[-5,7.25]]);

const sparseHeightWall = new context.Wall();
sparseHeightWall.level = 0;
sparseHeightWall.height = 8;
sparseHeightWall.heightAuthored = false;
sparseHeightWall.slopedHeight = true;
sparseHeightWall.points = [new context.WallPoint(0,0,2), new context.WallPoint(8,0)];
assert.doesNotMatch(sparseHeightWall.getXML(), /<Wall[^>]* height=/);
assert.match(sparseHeightWall.getXML(), /<Point x="0" y="0" height="2"\/>/);
assert.match(sparseHeightWall.getXML(), /<Point x="8" y="0"\/>/);
const reflectedSparseWall = context.aamap_symmetryClone(sparseHeightWall, {x:-1,y:1});
assert.strictEqual(reflectedSparseWall.heightAuthored, false);
assert.strictEqual(reflectedSparseWall.points[1].height, undefined);

const floor = new context.Floor(2);
floor.points = [{x:0, y:0}, {x:8, y:0}, {x:8, y:6}, {x:0, y:6}];
assert.match(floor.getXML(), /^<Floor level="2">/);
floor.render();
assert.strictEqual(floor.obj.attrs.fill, context.FLOOR_INFILL_COLOR);
assert.strictEqual(floor.obj.attrs["fill-opacity"], context.FLOOR_INFILL_OPACITY);
assert.strictEqual(floor.obj.attrs["stroke-dasharray"], undefined);

const baseFloor = new context.Floor(0);
baseFloor.points = floor.points.map(point => ({x:point.x, y:point.y}));
baseFloor.render();
assert.strictEqual(baseFloor.getXML(), "");
assert.strictEqual(baseFloor.getBounds(), null);
assert.deepStrictEqual(plain(baseFloor.obj.attrs), {});
context.aamap_resetLevels(1, []);
assert.strictEqual(context.aamap_isObjectVisible(baseFloor), false);

const baseFloorLoop = new context.Wall();
baseFloorLoop.level = 0;
baseFloorLoop.points = [{x:0,y:0}, {x:10,y:0}, {x:10,y:10}, {x:0,y:10}, {x:0,y:0}];
const upperFloorLoop = new context.Wall();
upperFloorLoop.level = 1;
upperFloorLoop.points = [{x:2,y:2}, {x:8,y:2}, {x:8,y:8}, {x:2,y:8}, {x:2,y:2}];
context.aamap_resetLevels(2, [8]);
context.aamap_activeLevel = 1;
context.aamap_objects = [baseFloor, baseFloorLoop, upperFloorLoop];
context.aamap_drawFloorInfills();
assert.strictEqual(context.aamap_floorInfills.items.length, 0);
context.aamap_levelVisible[1] = false;
context.aamap_drawFloorInfills();
assert.strictEqual(context.aamap_floorInfills.items.length, 0);
context.aamap_objects = [];
assert.strictEqual(context.floorTool_isSimplePolygon(floor.points), true);
assert.strictEqual(context.floorTool_isSimplePolygon([
    {x:0,y:0}, {x:4,y:4}, {x:0,y:4}, {x:4,y:0}
]), false);

const ramp = new context.Ramp(
    {x:5,y:3}, {x:5,y:-3}, {x:10,y:4}, {x:10,y:-4}, 0, 2);
const rampXml = ramp.getXML();
assert.match(rampXml, /^<Ramp from_level="0" to_level="2">/);
assert.doesNotMatch(rampXml, /width=/);
assert.deepStrictEqual(Array.from(rampXml.matchAll(/<Point x="([^"]+)" y="([^"]+)"/g), m => [Number(m[1]), Number(m[2])]), [
    [5,3], [5,-3], [10,4], [10,-4]
]);

context.xml_settings = ["RIM_HEIGHT 6"];
assert.strictEqual(context.preview3d_configuredRimHeight([]), 6);
const authoredHeightWall = new context.Wall();
authoredHeightWall.height = 7;
assert.strictEqual(context.preview3d_configuredRimHeight([authoredHeightWall]), 7);
context.aamap_resetLevels(3, [6, 8]);
const rampPreviewScene = context.preview3d_buildScene([ramp]);
assert.strictEqual(rampPreviewScene.triangles.filter(triangle =>
    triangle.color === context.PREVIEW3D_RIM_COLOR).length, 4);
assert.strictEqual(rampPreviewScene.bounds.max[2], 20);
context.aamap_levelVisible = [false, false, false];
const hiddenRampPreviewScene = context.preview3d_buildScene([ramp]);
assert.strictEqual(hiddenRampPreviewScene.triangles.length, 0);
context.aamap_levelVisible = [true, true, true];
context.xml_settings = [];

const legacyRamp = context.xml_createRampFromData(
    [{x:5,y:0}, {x:10,y:0}], 7, 0, 1);
assert.deepStrictEqual(Array.from(legacyRamp.getPosition()), [7.5, 0]);
assert.deepStrictEqual(plain(legacyRamp.points.map(p => [p.x,p.y])), [
    [5,3.5], [5,-3.5], [10,3.5], [10,-3.5]
]);
assert.match(legacyRamp.getXML(), /^<Ramp from_level="0" to_level="1" width="7">/);
assert.deepStrictEqual(Array.from(legacyRamp.getXML().matchAll(
    /<Point x="([^"]+)" y="([^"]+)"/g), m => [Number(m[1]),Number(m[2])]),
    [[5,0],[10,0]]);

// Legacy XML migration applies one rigid offset to every position-bearing
// object field. Combined bounds land on world 0,0 without changing dimensions,
// local polygon vertices, directions, widths, heights, or relative placement.
const centerSpawn = new context.Spawn();
centerSpawn.x = 110; centerSpawn.y = 210;
centerSpawn.xDir = 0; centerSpawn.yDir = 1;
const centerWall = new context.Wall();
centerWall.points = [new context.WallPoint(100,200,2),
    new context.WallPoint(140,200,7)];
centerWall.slopedHeight = true;
const centerFloor = new context.Floor(1);
centerFloor.points = [{x:105,y:205},{x:115,y:205},{x:105,y:215}];
const centerRamp = context.xml_createRampFromData(
    [{x:110,y:220},{x:120,y:220}], 4, 0, 1);
const centerTeleport = new context.Zone(120,230,2,0,7,0,{
    zoneName:"teleport", shapeType:"circle",
    options:{destination_x:160,destination_y:260,destination_level:0,
        xdir:1,ydir:0},
    movementPath:[{x:120,y:230},{x:150,y:250}]
});
const centerRectangle = new context.Zone(0,0,0,0,0,0,{
    zoneName:"death",shapeType:"rectangle",options:{},
    minx:115,miny:205,maxx:130,maxy:220
});
const centerPolygon = new context.Zone(130,240,0,0,0,0,{
    zoneName:"death",shapeType:"polygon",options:{},polygonScale:1,
    polygonPoints:[{x:0,y:0},{x:5,y:0},{x:0,y:5}]
});
const centerLine = new context.Zone(0,0,0,0,0,0,{
    zoneName:"death",shapeType:"line",options:{},lineWidth:0,
    lineStart:{x:100,y:250},lineEnd:{x:120,y:250}
});
const centerResult = context.aamap_centerObjectsOnOrigin([
    centerSpawn,centerWall,centerFloor,centerRamp,centerTeleport,
    centerRectangle,centerPolygon,centerLine
]);
assert.deepStrictEqual(plain(centerResult), {
    dx:-130,dy:-230,bounds:{minx:-30,miny:-30,maxx:30,maxy:30}
});
assert.deepStrictEqual(plain({
    spawn:[centerSpawn.x,centerSpawn.y,centerSpawn.xDir,centerSpawn.yDir],
    wall:centerWall.points.map(point => [point.x,point.y,point.height]),
    floor:centerFloor.points,
    rampSource:centerRamp.sourceTwoPoint,
    rampPoints:centerRamp.points,
    teleport:{source:[centerTeleport.x,centerTeleport.y],
        destination:[centerTeleport.options.destination_x,
            centerTeleport.options.destination_y],path:centerTeleport.movementPath},
    rectangle:[centerRectangle.minx,centerRectangle.miny,
        centerRectangle.maxx,centerRectangle.maxy],
    polygon:{origin:[centerPolygon.x,centerPolygon.y],points:centerPolygon.polygonPoints},
    line:[centerLine.lineStart,centerLine.lineEnd]
}), {
    spawn:[-20,-20,0,1],
    wall:[[-30,-30,2],[10,-30,7]],
    floor:[{x:-25,y:-25},{x:-15,y:-25},{x:-25,y:-15}],
    rampSource:{start:{x:-20,y:-10},end:{x:-10,y:-10},width:4},
    rampPoints:[{x:-20,y:-8},{x:-20,y:-12},{x:-10,y:-8},{x:-10,y:-12}],
    teleport:{source:[-10,0],destination:[30,30],
        path:[{x:-10,y:0},{x:20,y:20}]},
    rectangle:[-15,-25,0,-10],
    polygon:{origin:[0,10],points:[{x:0,y:0},{x:5,y:0},{x:0,y:5}]},
    line:[{x:-30,y:20},{x:-10,y:20}]
});
assert.strictEqual(centerWall.points[1].x - centerWall.points[0].x, 40);
assert.strictEqual(centerRamp.sourceTwoPoint.width, 4);
assert.strictEqual(centerTeleport.radius, 2);

// A moving zone occupies its complete footprint at every path pivot. Raw path
// points alone would incorrectly center this radius-10 circle at x=45.
const sweptCenterCircle = new context.Zone(0,0,10,0,0,0,{
    zoneName:"death",shapeType:"circle",options:{},
    movementPath:[{x:0,y:0},{x:100,y:0}]
});
sweptCenterCircle.level = 1;
assert.deepStrictEqual(plain(sweptCenterCircle.getBounds()),
    {minx:-10,miny:-10,maxx:110,maxy:10});
assert.strictEqual(sweptCenterCircle.getBounds([true,false]), null);
const sweptCenterResult = context.aamap_centerObjectsOnOrigin([sweptCenterCircle]);
assert.deepStrictEqual(plain(sweptCenterResult), {
    dx:-50,dy:0,bounds:{minx:-60,miny:-10,maxx:60,maxy:10}
});
assert.deepStrictEqual(plain({source:[sweptCenterCircle.x,sweptCenterCircle.y],
    path:sweptCenterCircle.movementPath}), {
    source:[-50,0],path:[{x:-50,y:0},{x:50,y:0}]
});
assert.deepStrictEqual(plain(context.aamap_centerObjectsOnOrigin([sweptCenterCircle])), {
    dx:0,dy:0,bounds:{minx:-60,miny:-10,maxx:60,maxy:10}
});

// Any nonzero authored rotation can eventually present every orientation.
// Conservatively bound an off-pivot polygon by its maximum pivot radius.
const rotatingCenterPolygon = new context.Zone(0,0,0,0,0,0,{
    zoneName:"death",shapeType:"polygon",options:{},polygonScale:1,
    polygonPoints:[{x:0,y:0},{x:10,y:0},{x:0,y:10}],rotationSpeed:30,
    movementPath:[{x:0,y:0},{x:100,y:0}]
});
assert.deepStrictEqual(plain(rotatingCenterPolygon.getBounds()),
    {minx:-10,miny:-10,maxx:110,maxy:10});

// Hiding the source floor must still allow a visible teleport destination,
// while hiding the destination must retain only the moving source footprint.
const sweptCenterTeleport = new context.Zone(0,0,5,0,7,0,{
    zoneName:"teleport",shapeType:"circle",movementPath:[{x:0,y:0},{x:100,y:0}],
    options:{destination_x:250,destination_y:20,destination_level:0,xdir:1,ydir:0}
});
sweptCenterTeleport.level = 1;
assert.deepStrictEqual(plain(sweptCenterTeleport.getBounds([true,false])),
    {minx:250,miny:20,maxx:250,maxy:20});
assert.deepStrictEqual(plain(sweptCenterTeleport.getBounds([false,true])),
    {minx:-5,miny:-5,maxx:105,maxy:5});

const spawn = new context.Spawn();
spawn.x = 0; spawn.y = 0; spawn.level = 0;
context.aamap_objects = [spawn, legacyRamp];
const legacyRampNative = context.armamap_build("legacy-ramp", "tester", "racing", "1", 4, []);
assert.deepStrictEqual(plain(legacyRampNative.document.ramps), [{
    from_level:0,to_level:1,width:7,points:[[5,0],[10,0]]
}]);

context.aamap_resetLevels(1, []);
context.aamap_objects = [spawn, zeroWidthLine];
const zeroWidthOutput = context.aamap_buildXml(
    "zero-width-line", "tester", "racing", "1", 4, []);
assert.deepStrictEqual(Array.from(zeroWidthOutput.validationErrors), []);
assert.match(zeroWidthOutput.xml, /<ShapeLine width="0">/);
zeroWidthLine.lineWidth = -0.25;
assert.ok(Array.from(context.aamap_validateForExport(4)).some(function(message) {
    return /width must be 0 or greater/i.test(message);
}));
zeroWidthLine.lineWidth = 0;

context.aamap_resetLevels(3, [6, 8]);
context.aamap_objects = [spawn, wall, line, teleport, ramp, floor, baseFloor];
const output = context.aamap_buildXml("figure-eight", "tester", "racing", "1", 4,
    ["CYCLE_START_SPEED 10"]);
assert.match(output.xml, /<Field level_heights="6,8">/);
assert.match(output.xml, /<Level index="0"\/>/);
assert.match(output.xml, /<Level index="1"\/>/);
assert.match(output.xml, /<Level index="2"\/>/);
assert.match(output.xml, /<Floor level="2">/);
assert.doesNotMatch(output.xml, /<Floor level="0">/);
assert.match(output.xml, /<Ramp from_level="0" to_level="2">/);
assert.deepStrictEqual(Array.from(output.validationErrors), []);
assert.deepStrictEqual(Array.from(output.validationWarnings), []);
assert.doesNotMatch(output.xml, /<Axis\s+xdir=|effect=|Map version="0\.2\.8"/);

const passwordVerifier = "sha256-v1:" + "01".repeat(16) + ":" + "ab".repeat(32);
const nativeOutput = context.armamap_build("figure-eight", "tester", "racing", "1", 4,
    ["CYCLE_START_SPEED 10"], passwordVerifier);
assert.strictEqual(nativeOutput.fileName, "figure-eight.neomap.json");
assert.strictEqual(nativeOutput.document.format, "neotron-map");
assert.strictEqual(nativeOutput.document.format_version, 1);
assert.deepStrictEqual(plain(nativeOutput.document.metadata.tags), ["racing"]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    nativeOutput.document.metadata, "category"), false);
assert.match(nativeOutput.document.metadata.revision,
    /^neomap-revision-v1:[0-9a-f]{64}$/);
assert.deepStrictEqual(plain(nativeOutput.document.levels), {count:3,gaps:[6,8]});
assert.strictEqual(nativeOutput.document.metadata.author_password_hash, passwordVerifier);
assert.ok(nativeOutput.document.floors.every(floor =>
    floor.points.every(point => point.length === 2)));
assert.ok(nativeOutput.document.ramps.every(ramp =>
    ramp.points.every(point => point.length === 2)));
assert.ok(nativeOutput.document.zones.every(zone => zone.type !== "target" && zone.type !== "rubber"));
assert.doesNotThrow(function() {
    context.armamap_toCompatibilityXml(JSON.parse(nativeOutput.text));
});
const rubberNativeOutput = context.armamap_build("rubber-compatibility", "tester",
    "racing", "", 4, [], passwordVerifier, [rubber]);
assert.deepStrictEqual(plain(rubberNativeOutput.document.zones), [{
    type:"rubber",level:0,shape:{type:"circle",center:[3,-2],radius:4},
    show_icon:true,delta:-125,duration_ticks:240
}], "Native JSON export does not rewrite imported rubber as health");
const hiddenIconZone = new context.Zone(0, 0, 2, 0, 0, 0, {
    zoneName:"death",shapeType:"circle",showIcon:false,options:{}
});
const billboard = new context.Billboard({x:-6,y:12}, {x:10,y:12}, 5.5,
    "https://cdn.example.com/banner.png", 2, "left", false);
const maximumBillboardUrl = "https://example.com/" +
    "a".repeat(context.NEOMAP_MAX_BILLBOARD_URL_CHARACTERS -
        "https://example.com/".length);
assert.strictEqual(context.billboard_isExternalUrl(maximumBillboardUrl), true);
assert.strictEqual(context.billboard_isExternalUrl(maximumBillboardUrl + "a"), false);
assert.strictEqual(context.billboard_isExternalUrl(" https://example.com/image.png"), false);
const billboardOutput = context.armamap_build("billboard", "tester", "racing", "", 4,
    [], passwordVerifier, [hiddenIconZone,billboard]);
assert.deepStrictEqual(plain(billboardOutput.document.billboards), [{
    level:2,start:[-6,12],end:[10,12],height:5.5,
    url:"https://cdn.example.com/banner.png",facing:"left",dual_sided:false
}]);
assert.strictEqual(billboardOutput.document.zones[0].show_icon, false);
const billboardCompatibility = context.armamap_toCompatibilityXml(
    billboardOutput.document);
assert.match(billboardCompatibility,
    /<Billboard level="2" height="5\.5" url="https:\/\/cdn\.example\.com\/banner\.png" facing="left" dual_sided="false">/);
const legacyFacingDefaults = context.armamap_toCompatibilityXml({
    format:"neotron-map",format_version:1,metadata:{},
    spawns:[],billboards:[{start:[0,0],end:[4,0],height:1,
        url:"https://example.com/legacy.png"}]
});
assert.match(legacyFacingDefaults, /facing="right" dual_sided="true"/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map",format_version:1,metadata:{},spawns:[],
        billboards:[{start:[0,0],end:[4,0],height:1,
            url:"https://example.com/a.png",facing:"up"}]
    });
}, /facing must be left or right/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map",format_version:1,metadata:{},spawns:[],
        billboards:[{start:[0,0],end:[4,0],height:1,
            url:"https://example.com/a.png",dual_sided:"false"}]
    });
}, /dual_sided must be boolean/);
assert.match(billboardCompatibility, /<Zone[^>]*show_icon="false"/);
assert.strictEqual(context.billboard_isExternalUrl("https://example.com/ad.webp"), true);
assert.strictEqual(context.billboard_isExternalUrl("file:///tmp/ad.webp"), false);
assert.strictEqual(context.billboard_isExternalUrl("https://user@example.com/ad.webp"), false);
const tooManyCanonicalBillboards = Array.from({
    length:context.NEOMAP_MAX_BILLBOARDS + 1
}, function() {
    return {start:[0,0],end:[1,0],height:0,url:"https://example.com/image.png"};
});
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map",format_version:1,metadata:{},spawns:[],
        billboards:tooManyCanonicalBillboards
    });
}, /billboards cannot contain more than 256 entries/);
const tooManyEditorBillboards = Array.from({
    length:context.NEOMAP_MAX_BILLBOARDS + 1
}, function(_, index) {
    return new context.Billboard({x:index,y:0}, {x:index + 1,y:0}, 0,
        "https://example.com/image.png", 0);
});
const billboardLimitOutput = context.armamap_build("billboard-limit", "tester", "racing",
    "", 4, [], passwordVerifier, tooManyEditorBillboards);
assert.ok(Array.from(billboardLimitOutput.validationErrors).some(function(error) {
    return /at most 256 billboards/.test(error);
}));
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"arma-racing-map",format_version:1,metadata:{},billboards:[]
    });
}, /not a supported Neotron map/,
"The former native JSON discriminator is no longer accepted");
const selectionOutput = context.armamap_build("figure-eight", "tester", "racing", "1", 4,
    ["CYCLE_START_SPEED 10"], passwordVerifier, [wall]);
assert.strictEqual(selectionOutput.document.walls.length, 1);
assert.deepStrictEqual(plain([
    selectionOutput.document.spawns.length,
    selectionOutput.document.floors.length,
    selectionOutput.document.ramps.length,
    selectionOutput.document.zones.length,
    selectionOutput.document.billboards.length
]), [0,0,0,0,0], "Selection code serializes only the selected object arrays");
const revisionFixture = {
    format:"neotron-map",format_version:1,
    metadata:{name:"Revision fixture",author:"Mapper",tags:["racing","technical"]},
    axes:8,levels:{count:1,gaps:[]},
    settings:{CYCLE_START_SPEED:10,ZONE_PULSE_SPEED:0.1},
    spawns:[{level:0,position:[0,0],direction:[1,0]}],
    walls:[],floors:[],ramps:[],zones:[]
};
assert.strictEqual(context.armamap_applyRevision(revisionFixture),
    "neomap-revision-v1:a38e0ed6d22356d88f98c4f2242469dcf98aa0aa3139c1149eef1955cc4ef7be");
assert.strictEqual(context.armamap_computeRevision(revisionFixture),
    revisionFixture.metadata.revision, "An unchanged export keeps its revision");
const unsupportedRevisionFixture = JSON.parse(JSON.stringify(revisionFixture));
unsupportedRevisionFixture.metadata.revision = "neomap-revision-v2:" + "0".repeat(64);
assert.throws(function() { context.armamap_verifyRevision(unsupportedRevisionFixture); },
    /unsupported .neomap.json revision algorithm/);
unsupportedRevisionFixture.metadata.revision = "neomap-revision-v1:ABC";
assert.throws(function() { context.armamap_verifyRevision(unsupportedRevisionFixture); },
    /malformed .neomap.json revision hash/);
const changedRevisionFixture = JSON.parse(JSON.stringify(revisionFixture));
changedRevisionFixture.metadata.tags[1] = "precision";
assert.notStrictEqual(context.armamap_computeRevision(changedRevisionFixture),
    revisionFixture.metadata.revision, "Presentation metadata edits are revisioned");
changedRevisionFixture.metadata.tags[1] = "technical";
changedRevisionFixture.spawns[0].position[0] = 1;
assert.throws(function() { context.armamap_verifyRevision(changedRevisionFixture); },
    /revision does not match its persisted content/);
const reorderedRevisionFixture = {
    zones:revisionFixture.zones,ramps:revisionFixture.ramps,floors:revisionFixture.floors,
    walls:revisionFixture.walls,spawns:revisionFixture.spawns,settings:revisionFixture.settings,
    levels:revisionFixture.levels,axes:revisionFixture.axes,
    metadata:{revision:revisionFixture.metadata.revision,tags:["racing","technical"],
        author:"Mapper",name:"Revision fixture"},
    format_version:1,format:"neotron-map"
};
assert.strictEqual(context.armamap_computeRevision(reorderedRevisionFixture),
    revisionFixture.metadata.revision, "JSON key order is not revision content");
assert.strictEqual(context.armamap_numberToken(-0), "~0000000000000000");
assert.strictEqual(context.armamap_numberToken(1e-7), "~3e7ad7f29abcaf48");
assert.strictEqual(context.armamap_numberToken(0.000001), "~3eb0c6f7a0b5ed8d");
assert.throws(function() { context.armamap_numberToken(1e20); }, /safe integers/);
assert.throws(function() { context.armamap_numberToken(9007199254740992); },
    /safe integers/);
const astralKey = String.fromCodePoint(0x10000);
const privateUseKey = String.fromCodePoint(0xe000);
assert.ok(context.armamap_compareUnicodeScalars(privateUseKey, astralKey) < 0,
    "Revision keys use Unicode scalar order rather than JavaScript UTF-16 order");
const unicodeSettings = {};
unicodeSettings[astralKey] = 1e-7;
unicodeSettings[privateUseKey] = 0.000001;
const unicodeRevisionFixture = {
    format:"neotron-map",format_version:1,
    metadata:{name:"Numeric fixture",tags:[astralKey,privateUseKey]},
    settings:unicodeSettings,
    spawns:[{position:[-0,1e-7],direction:[1,0]}],
    walls:[{points:[[0,0],[1,0.000001]]}]
};
assert.strictEqual(context.armamap_computeRevision(unicodeRevisionFixture),
    "neomap-revision-v1:e885f10062e42a5b63a69c0556fb001328a6e8834ffdb81fdff1a2bd72d5cc54");
assert.deepStrictEqual(plain(context.armamap_parseTags(
    " racing, racing, technical ")), ["racing","technical"]);
assert.throws(function() { context.armamap_parseTags([" racing "]); },
    /must already be trimmed/);
assert.throws(function() { context.armamap_parseTags(["racing", "racing"]); },
    /duplicate tags/);
assert.throws(function() { context.armamap_parseTags(["racing", " "]); },
    /cannot contain empty tags/);
assert.match(context.armamap_toCompatibilityXml({
    format:"neotron-map",format_version:1,
    metadata:{catregory:"technical",revision:"legacy-1"},
    spawns:[{position:[0,0],direction:[1,0]}]
}), /category="technical"/);
const canonicalRubberCompatibility = context.armamap_toCompatibilityXml({
    format:"neotron-map",format_version:1,metadata:{},spawns:[],zones:[{
        type:"rubber",delta:-125,duration_ticks:240,show_icon:false,
        shape:{type:"circle",center:[0,0],radius:1}
    }]
});
assert.match(canonicalRubberCompatibility,
    /<Zone level="0" type="rubber" show_icon="false" delta="-125" duration_ticks="240">/,
"Canonical rubber import retains both effect fields in the compatibility bridge");
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[],zones:[{type:"rubber",delta:-125,
            shape:{type:"circle",center:[0,0],radius:1}}]});
}, /duration_ticks must be a finite number/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[],zones:[{type:"rubber",delta:1.5,duration_ticks:10,
            shape:{type:"circle",center:[0,0],radius:1}}]});
}, /delta must be an integer/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[],zones:[{type:"death",delta:5,
            shape:{type:"circle",center:[0,0],radius:1}}]});
}, /death zone does not support field delta/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[{position:[0,0],direction:[0,0]}],zones:[]});
}, /needs a nonzero direction vector/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},widht:4,spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /map document\.widht is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{extra:"lost"},spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /metadata\.extra is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[{position:[0,0],direction:[1,0],angle:0}],zones:[]});
}, /spawns\[0\]\.angle is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{tags:["racing"],category:"race"},
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /cannot be combined/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{author_password_hash:"plaintext"},
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /author_password_hash is invalid/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},axes:[[1,0],[0,0]],
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /axis 1 must be a finite nonzero direction vector/i);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},levels:{count:2},spawns:[],zones:[],
        ramps:[{from_level:0,to_level:1,points:[[0,0],[10,0]]}]});
}, /needs a positive width/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"neotron-map",format_version:1,
        metadata:{},spawns:[],ramps:[],zones:[
            {type:"health",shape:{type:"circle",center:[0,0],radius:1}}
        ]});
}, /health zone needs delta/);
const teleportDefaultsXml = context.armamap_toCompatibilityXml({
    format:"neotron-map",format_version:1,metadata:{},levels:{count:3},
    spawns:[],ramps:[],zones:[{type:"teleport",level:2,destination:[4,5],
        shape:{type:"circle",center:[0,0],radius:1}}]
});
assert.match(teleportDefaultsXml, /destination_level="2"/);
assert.doesNotMatch(teleportDefaultsXml, /\bxdir=|\bydir=|\bdirection=/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map",format_version:1,metadata:{},spawns:[],ramps:[],
        zones:[{type:"teleport",destination:[4,5],direction:[0,0],
            shape:{type:"circle",center:[0,0],radius:1}}]
    });
}, /teleport direction must be a finite nonzero direction vector/i);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map",format_version:1,metadata:{},spawns:[],ramps:[],
        zones:[{type:"teleport",destination:[4,5],direction:[Infinity,0],
            shape:{type:"circle",center:[0,0],radius:1}}]
    });
}, /teleport direction must be a finite nonzero direction vector/i);
assert.match(context.armamap_toCompatibilityXml({
    format:"neotron-map",format_version:1,metadata:{},spawns:[],ramps:[],
    zones:[{type:"teleport",destination:[4,5],direction:[0,2],
        shape:{type:"circle",center:[0,0],radius:1}}]
}), /xdir="0" ydir="2"/);

function strictGeometryDocument() {
    return {
        format:"neotron-map",format_version:1,
        metadata:{name:"Strict geometry",tags:["racing"]},
        axes:4,levels:{count:2,gaps:[8]},settings:{},
        spawns:[{level:0,position:[0,0],direction:[1,0]}],
        walls:[{level:0,height:4,points:[[0,0],[8,0]]}],
        floors:[{level:1,points:[[0,0],[8,0],[0,8]]}],
        ramps:[{from_level:0,to_level:1,width:4,points:[[0,2],[8,2]]}],
        zones:[
            {type:"death",shape:{type:"circle",center:[1,1],radius:2}},
            {type:"win",shape:{type:"line",start:[-2,0],end:[2,0],width:1}},
            {type:"health",delta:1,
                shape:{type:"rectangle",min:[-2,-2],max:[2,2]}},
            {type:"checkpoint",order:1,
                shape:{type:"polygon",points:[[0,0],[3,0],[0,3]]}},
            {type:"teleport",destination:[10,12],direction:"north",
                shape:{type:"circle",center:[4,4],radius:1}},
            {type:"death",shape:{type:"circle",center:[0,0],radius:1},
                movement:{speed:10,path:[[0,0],[10,0]]}}
        ]
    };
}
assert.doesNotThrow(function() {
    context.armamap_toCompatibilityXml(strictGeometryDocument());
});
const scalarSettingsDocument = strictGeometryDocument();
scalarSettingsDocument.settings = {STRING_VALUE:"20", NUMBER_VALUE:20, BOOLEAN_VALUE:true};
assert.doesNotThrow(function() {
    context.armamap_toCompatibilityXml(scalarSettingsDocument);
}, "Canonical settings retain the schema's string, number, and boolean scalar support");
[
    ["format version string", function(map) { map.format_version = "1"; }, /supported Neotron map/],
    ["metadata name type", function(map) { map.metadata.name = ["not", "a", "name"]; }, /metadata\.name must be a string/],
    ["metadata author type", function(map) { map.metadata.author = false; }, /metadata\.author must be a string/],
    ["metadata tags type", function(map) { map.metadata.tags = "racing"; }, /metadata\.tags must be an array/],
    ["settings null", function(map) { map.settings = null; }, /settings must be an object/],
    ["settings object value", function(map) { map.settings = {CYCLE_ACCEL:{value:20}}; }, /settings\.CYCLE_ACCEL must be a string, finite number, or boolean/],
    ["settings null value", function(map) { map.settings = {CYCLE_ACCEL:null}; }, /settings\.CYCLE_ACCEL must be a string, finite number, or boolean/],
    ["zone trigger", function(map) { map.zones[0].trigger = "enter"; }, /trigger is invalid/],
    ["unpaired start tick", function(map) { map.zones[0].start_tick = 10; }, /start_tick and end_tick together/],
    ["tick string", function(map) { map.zones[0].start_tick = "10"; map.zones[0].end_tick = 20; }, /start_tick must be a finite number/],
    ["unsupported setting zone", function(map) { map.zones.push({type:"setting",setting:"NOT_A_GAME_SETTING",value:1,shape:{type:"circle",center:[0,0],radius:1}}); }, /supported game setting/],
    ["setting zone range", function(map) { map.zones.push({type:"setting",setting:"JUMP_ENABLED",value:2,shape:{type:"circle",center:[0,0],radius:1}}); }, /must use 0 or 1/],
    ["setting zone casing", function(map) { map.zones.push({type:"setting",setting:"cycle_accel",value:20,shape:{type:"circle",center:[0,0],radius:1}}); }, /canonical uppercase name/],
    ["partial validation", function(map) { map.validation = {version:1}; }, /validation\.ticks must be a finite number/],
    ["validation integer string", function(map) { map.validation = {version:1,ticks:"20",fraction:0,tick_rate:60,fraction_scale:1000000,proof_algorithm:"test",replay_proof:"proof"}; }, /validation\.ticks must be a finite number/],
    ["validation proof type", function(map) { map.validation = {version:1,ticks:20,fraction:0,tick_rate:60,fraction_scale:1000000,proof_algorithm:true,replay_proof:"proof"}; }, /validation\.proof_algorithm must be a nonempty string/]
].forEach(function(testCase) {
    const invalid = strictGeometryDocument();
    testCase[1](invalid);
    assert.throws(function() { context.armamap_toCompatibilityXml(invalid); },
        testCase[2], testCase[0] + " is rejected before Code Viewer Apply mutates the map");
});
assert.throws(function() {
    context.armamap_applyRevision({format:"neotron-map",format_version:1,metadata:null});
}, /metadata must be an object/,
"Revision stamping cannot silently replace malformed metadata");
assert.throws(function() {
    context.armamap_applyRevision({format:"neotron-map",format_version:1,
        metadata:{category:{name:"racing"}}});
}, /legacy metadata category must be a string/,
"Revision stamping validates transitional metadata before migrating it");
[
    ["axes type", function(map) { map.axes = "four"; }],
    ["axes empty", function(map) { map.axes = []; }],
    ["spawn position", function(map) { map.spawns[0].position[0] = "oops"; }],
    ["wall point", function(map) { map.walls[0].points[0][1] = "oops"; }],
    ["floor point", function(map) { map.floors[0].points[1][0] = "oops"; }],
    ["ramp point", function(map) { map.ramps[0].points[1][1] = "oops"; }],
    ["circle radius", function(map) { map.zones[0].shape.radius = "2"; }],
    ["line endpoint", function(map) { map.zones[1].shape.end[0] = "oops"; }],
    ["rectangle corner", function(map) { map.zones[2].shape.min[1] = "oops"; }],
    ["polygon point", function(map) { map.zones[3].shape.points[2][0] = "oops"; }],
    ["teleport destination", function(map) { map.zones[4].destination[0] = "oops"; }],
    ["movement path", function(map) { map.zones[5].movement.path[1][0] = "oops"; }]
].forEach(function(testCase) {
    const invalid = strictGeometryDocument();
    testCase[1](invalid);
    assert.throws(function() { context.armamap_toCompatibilityXml(invalid); },
        /must|finite|direction vectors/, testCase[0] + " is rejected before Apply can clear the map");
});

context.aamap_objects = [spawn, sparseHeightWall];
const sparseNative = context.armamap_build("sparse-wall", "tester", "racing", "1", 4,
    ["RIM_HEIGHT 8"]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(sparseNative.document.walls[0], "height"), false);
assert.deepStrictEqual(plain(sparseNative.document.walls[0].points), [[0,0,2],[8,0]]);

const namedTeleport = new context.Zone(0,0,1,0,7,0,{zoneName:"teleport",options:{
    destination_x:4,destination_y:5,destination_level:0,direction:"east"
}});
assert.strictEqual(context.armamap_zone(namedTeleport).direction, "east");
const zeroDirectionTeleport = new context.Zone(0,0,1,0,7,0,{zoneName:"teleport",options:{
    destination_x:4,destination_y:5,destination_level:0,xdir:0,ydir:0
}});
assert.throws(function() { context.armamap_zone(zeroDirectionTeleport); },
    /Teleport direction must be a finite nonzero direction vector/);

context.xml_map_validation = {version:"1",ticks:"720",fraction:"0",tick_rate:"60",
    fraction_scale:"1000000",proof_algorithm:"fixture",replay_proof:"proof"};
context.xml_settings = ["ARCHITECT_TIME 12", "CYCLE_ACCEL 20"];
context.aamap_objects = [spawn];
const validatedNative = context.armamap_build("validated", "tester", "racing", "1", 4,
    context.xml_settings);
assert.deepStrictEqual(plain(validatedNative.document.validation),
    {version:1,ticks:720,fraction:0,tick_rate:60,fraction_scale:1000000,
        proof_algorithm:"fixture",replay_proof:"proof"});
assert.match(context.armamap_toCompatibilityXml(validatedNative.document), /<MapValidation\b/);
context.aamap_recordAction({label:"course mutation",undo:function(){},redo:function(){}});
assert.strictEqual(context.xml_map_validation, null);
assert.deepStrictEqual(plain(context.xml_settings), ["CYCLE_ACCEL 20"]);

assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map", format_version:1, metadata:{},
        levels:{count:1}, spawns:[], ramps:[], zones:[{
            type:"death", shape:{type:"circle",center:[0,0],radius:1},
            movement:{speed:0,rotation:0,mode:"circular",spawn_at_vertices:false,
                path:[[0,0],[10,0]]}
        }]
    });
}, /speed must be greater than zero/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map", format_version:1, metadata:{},
        levels:{count:1}, spawns:[], ramps:[], zones:[{
            type:"death", shape:{type:"circle",center:[0,0],radius:1},
            movement:{speed:10,spawn_at_vertices:false,instances:[1],
                path:[[0,0],[10,0]]}
        }]
    });
}, /cannot combine instances/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map", format_version:1, metadata:{},
        levels:{count:1}, spawns:[], ramps:[], zones:[{
            type:"death", shape:{type:"circle",center:[0,0],radius:1},
            movement:{speed:10,instances:0,path:[[0,0],[10,0]]}
        }]
    });
}, /instances must be unique/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"neotron-map", format_version:1, metadata:{},
        levels:{count:1}, spawns:[], ramps:[], zones:[{
            type:"death", shape:{type:"rectangle",min:[0,0],max:[2,2]},
            movement:{speed:10,instances:[1],pulse_radii:[1,2],
                path:[[0,0],[10,0]]}
        }]
    });
}, /circle pulse/);
assert.match(context.armamap_toCompatibilityXml({
    format:"neotron-map", format_version:1, metadata:{},
    levels:{count:1}, spawns:[], ramps:[], zones:[{
        type:"death", shape:{type:"circle",center:[0,0],radius:1},
        movement:{speed:10,instances:[1],pulse_radii:[1,3],
            path:[[0,0],[10,0]]}
    }]
}), /instances="1"[\s\S]*radius="1"[\s\S]*radius="3"/);
context.xml_map_validation = {version:"1"};
context.xml_settings = ["ARCHITECT_TIME 12", "CYCLE_ACCEL 20"];
spawn.x = 3;
context.aamap_objects = [spawn];
assert.strictEqual(context.eventHandler_scaleMap(2, "Quick scale"), true);
assert.strictEqual(spawn.x, 6);
assert.strictEqual(context.xml_map_validation, null);
assert.deepStrictEqual(plain(context.xml_settings), ["CYCLE_ACCEL 20"]);
context.aamap_undo();
assert.strictEqual(spawn.x, 3);
spawn.x = 0;
context.vectron_panX = 0;
context.vectron_panY = 0;

const mountainOnlyOutput = context.aamap_buildXml(
    "mountain-only", "tester", "racing", "1", 4,
    ["LANDSCAPE CITY", "RIM_HEIGHT 6"]
);
assert.doesNotMatch(mountainOnlyOutput.xml, /LANDSCAPE/);
assert.match(mountainOnlyOutput.xml, /<Setting name="RIM_HEIGHT" value="6"\/>/);

assert.strictEqual(context.xml_isValidAuthorPasswordHash(passwordVerifier), true);
context.xml_author_password_hash = "";
assert.strictEqual(context.eventHandler_hasAuthorPasswordForExport(), false);
context.xml_author_password_hash = passwordVerifier;
assert.strictEqual(context.eventHandler_hasAuthorPasswordForExport(), true);
const uppercaseHexVerifier = "sha256-v1:" + "AB".repeat(16) + ":" + "CD".repeat(32);
assert.strictEqual(context.xml_isValidAuthorPasswordHash(uppercaseHexVerifier), true);
const verifierFixturePayload = Buffer.concat([
    Buffer.from("ArmaRacing Author Password v1\0", "ascii"),
    Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
    Buffer.from("correct horse", "utf8")
]);
assert.strictEqual(context.xml_bytesToHex(
    context.xml_sha256Fallback(new Uint8Array(verifierFixturePayload))),
"0d59ec2118692af3acaeeb6b37a889c192aa633ccba4a432a79dca704e28b984");
const passwordOutput = context.aamap_buildXml("password", "tester", "racing", "1", 4,
    [], passwordVerifier);
assert.match(passwordOutput.xml, new RegExp(
    '<Map version="2" author_password_hash="' + passwordVerifier + '">'));
const invalidPasswordOutput = context.aamap_buildXml("password", "tester", "racing", "1", 4,
    [], "plaintext");
assert.doesNotMatch(invalidPasswordOutput.xml, /author_password_hash=/);

context.aamap_objects = [spawn, wall];
const floorlessUpperOutput = context.aamap_buildXml(
    "floorless-upper", "tester", "racing", "1", 4, []);
assert.deepStrictEqual(Array.from(floorlessUpperOutput.validationErrors), []);
assert.strictEqual(floorlessUpperOutput.validationWarnings.length, 1);
assert.match(floorlessUpperOutput.validationWarnings[0],
    /upper levels but no upper-level floors/i);
context.aamap_objects = [spawn, baseFloor];
const implicitBaseFloorOutput = context.aamap_buildXml(
    "base-floor-only", "tester", "racing", "1", 4, []);
assert.strictEqual(implicitBaseFloorOutput.validationWarnings.length, 1,
    "A level-0 Floor object must not hide the missing upper-floor warning");

context.aamap_resetLevels(1, []);
context.aamap_objects = [spawn];
const singleLevelOutput = context.aamap_buildXml("single", "tester", "racing", "1", 4, []);
assert.match(singleLevelOutput.xml, /<Field>/);
assert.match(singleLevelOutput.xml, /<Level index="0"\/>/);
assert.doesNotMatch(singleLevelOutput.xml, /level_height|level_heights|<Spawn level=/);
assert.deepStrictEqual(Array.from(singleLevelOutput.validationWarnings), []);

controls["#map_axes_forced"].checked = true;
const axesOutput = context.aamap_buildXml("axes", "tester", "racing", "1", 4, []);
assert.match(axesOutput.xml, /<Axes number="4"\/>/);
assert.doesNotMatch(axesOutput.xml, /<Axis\s/);
context.xml_axis_vectors = [[1,0],[0.2,0.98],[-1,0]];
const customAxesOutput = context.armamap_build("custom-axes", "tester", "racing", "1", 3, []);
assert.deepStrictEqual(plain(customAxesOutput.document.axes), [[1,0],[0.2,0.98],[-1,0]]);
assert.match(context.armamap_toCompatibilityXml(customAxesOutput.document),
    /<Axes number="3" normalize="false"><Axis xdir="1" ydir="0"\/>/);
assert.deepStrictEqual(plain(context.xml_normalizeLegacyAxis("1", "1")), [0.707,0.707]);
assert.deepStrictEqual(plain(context.xml_normalizeLegacyAxis("-.707", ".707")), [-0.707,0.707]);
context.xml_axis_vectors = null;
controls["#map_axes_forced"].checked = false;

const aliasElement = {
    attr(name) { return {movementSpeed:"18", rotation:"-12"}[name]; }
};
assert.strictEqual(context.xml_firstAttribute(aliasElement,
    ["movement_speed", "movementSpeed"]), "18");
assert.strictEqual(context.xml_firstAttribute(aliasElement,
    ["rotation_speed", "rotationSpeed", "rotation"]), "-12");

// Four clicks: first edge, level switch, second edge. No numeric ramp inputs.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(3, [6, 8]);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "ramp";
context.rampTool_resetPlacement();
function setMapCursor(x, y) {
    context.cursor_realX = context.cursor_neverSnappedX = 400 + x;
    context.cursor_realY = context.cursor_neverSnappedY = 300 - y;
}

// The billboard tool authors width with two clicks and facing with a third.
// URL, bottom height, dual-sided behavior, level, symmetry, and history remain
// ordinary map state.
context.aamap_objects = [];
context.aamap_clearHistory();
context.vectron_currentTool = "billboard";
controls["#dBillboardUrl"].value = "https://cdn.example.com/banner.png";
controls["#dBillboardHeight"].value = "6.5";
controls["#dBillboardDualSided"].checked = false;
context.billboardTool_reset();
setMapCursor(3, 7);
assert.strictEqual(context.billboardTool_click(), true);
setMapCursor(13, 7);
assert.strictEqual(context.billboardTool_click(), true);
assert.strictEqual(context.aamap_objects.length, 0,
    "The width click waits for a facing-side click");
setMapCursor(8, 12);
assert.strictEqual(context.billboardTool_click(), true);
assert.strictEqual(context.aamap_objects.length, 1);
assert.ok(context.aamap_objects[0] instanceof context.Billboard);
assert.deepStrictEqual(plain({
    start:context.aamap_objects[0].start,
    end:context.aamap_objects[0].end,
    height:context.aamap_objects[0].height,
    url:context.aamap_objects[0].url,
    level:context.aamap_objects[0].level,
    facing:context.aamap_objects[0].facing,
    dualSided:context.aamap_objects[0].dualSided
}), {start:{x:3,y:7},end:{x:13,y:7},height:6.5,
    url:"https://cdn.example.com/banner.png",level:0,
    facing:"left",dualSided:false});
const facingArrow = context.billboard_facingArrow(
    context.aamap_objects[0].start, context.aamap_objects[0].end,
    context.aamap_objects[0].facing);
assert.ok(facingArrow.tip.y > facingArrow.center.y,
    "The perpendicular editor arrow points toward the selected left side");
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 1);
context.aamap_removeObjectGroup(context.aamap_objects.slice());
context.aamap_clearHistory();

const selectedBillboard = new context.Billboard({x:-5,y:1},{x:5,y:1},3,
    "https://example.com/selected.png",0,"left",false);
context.selectTool_selectedObjs = [selectedBillboard];
context.vectron_currentTool = "select";
assert.strictEqual(context.selectTool_applySelectedBillboardFacing("right"), true);
assert.strictEqual(selectedBillboard.facing, "right");
context.aamap_undo();
assert.strictEqual(selectedBillboard.facing, "left");
context.aamap_redo();
assert.strictEqual(selectedBillboard.facing, "right");
assert.strictEqual(context.selectTool_applySelectedBillboardDualSided(true), true);
assert.strictEqual(selectedBillboard.dualSided, true);
context.aamap_undo();
assert.strictEqual(selectedBillboard.dualSided, false);
context.aamap_redo();
assert.strictEqual(selectedBillboard.dualSided, true);
selectedBillboard.isSelected = true;
selectedBillboard.render();
const selectedBillboardGlow = selectedBillboard.glowObj;
context.selectTool_selectedObjs = [selectedBillboard];
context.selectTool_deselectAll();
assert.strictEqual(selectedBillboard.isSelected, false);
assert.strictEqual(selectedBillboardGlow.removed, true,
    "Clicking away removes the billboard's former selected highlight path");
assert.notStrictEqual(selectedBillboard.glowObj, selectedBillboardGlow);
assert.strictEqual(selectedBillboard.glowObj.removed, false);
context.aamap_clearHistory();

// Checkpoints use one-based visible numbering, advance only after the complete
// zone is committed, and mirror as a single undoable placement.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "zone";
context.zoneTool_type = 5;
controls["#dZoneShape"].value = "circle";
controls["#dZoneMoving"].checked = false;
controls["#dCheckpointOrder"].value = "1";
controls["#dCheckpointOrdered"].checked = true;
assert.strictEqual(context.zoneTool_getOption(), 1);
controls["#dCheckpointOrdered"].checked = false;
assert.strictEqual(context.zoneTool_getOption(), 0);
controls["#dCheckpointOrdered"].checked = true;
controls["#dCheckpointAutoIncrement"].checked = true;
assert.strictEqual(context.ZONE_TOOL_DEFAULT_CHECKPOINT_INCREMENT_EVERY, 1);
assert.strictEqual(context.zoneTool_validCheckpointIncrementEvery(3), true);
assert.strictEqual(context.zoneTool_validCheckpointIncrementEvery(2.5), false);
controls["#dCheckpointAutoIncrementEvery"].present = false;
assert.strictEqual(context.zoneTool_checkpointIncrementEvery(true), 1,
    "older pages without the cadence input retain one increment per placement");
controls["#dCheckpointAutoIncrementEvery"].present = true;
function placeCheckpointCircle(x, y) {
    setMapCursor(x, y); context.zoneTool_complete();
    setMapCursor(x + 2, y); context.zoneTool_complete();
}

// A configurable cadence groups several completed placements under one
// checkpoint number. Symmetry copies are part of one placement, not extra
// increments.
controls["#dCheckpointOrder"].value = "7";
controls["#dCheckpointAutoIncrementEvery"].value = "3";
context.zoneTool_resetCheckpointIncrementProgress();
context.zoneTool_resetPlacement();
placeCheckpointCircle(2, 4);
assert.strictEqual(controls["#dCheckpointOrder"].value, "7");
placeCheckpointCircle(8, 4);
assert.strictEqual(controls["#dCheckpointOrder"].value, "7");
placeCheckpointCircle(14, 4);
assert.strictEqual(controls["#dCheckpointOrder"].value, "8");
assert.deepStrictEqual(context.aamap_objects.map(zone => zone.option), [7, 7, 7]);
context.aamap_undo();
assert.strictEqual(controls["#dCheckpointOrder"].value, "7");
assert.strictEqual(context.zoneTool_checkpointPlacementsSinceIncrement, 2,
    "Undo restores cadence progress before the placement");
context.aamap_redo();
assert.strictEqual(controls["#dCheckpointOrder"].value, "8");
assert.strictEqual(context.zoneTool_checkpointPlacementsSinceIncrement, 0,
    "Redo restores cadence progress after the placement");

// Invalid fractional intervals block placement instead of silently rounding.
controls["#dCheckpointAutoIncrementEvery"].value = "1.5";
context.zoneTool_resetPlacement();
setMapCursor(20, 4); context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 3);
assert.strictEqual(context.vectron_toolActive, false);

context.aamap_objects = [];
controls["#dCheckpointOrder"].value = "1";
controls["#dCheckpointAutoIncrementEvery"].value = "1";
context.zoneTool_resetCheckpointIncrementProgress();
context.zoneTool_resetPlacement();
setMapCursor(3, 4); context.zoneTool_complete();
setMapCursor(7, 4); context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(context.aamap_objects[0].option, 1);
assert.strictEqual(controls["#dCheckpointOrder"].value, "2");
context.aamap_objects[0].render();
assert.strictEqual(context.aamap_objects[0].checkpointLabelObj.textValue, "1");
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);
assert.strictEqual(controls["#dCheckpointOrder"].value, "1",
    "Undoing the final checkpoint resets the active Zone control immediately");
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(controls["#dCheckpointOrder"].value, "2");

context.selectTool_selectedObjs = [context.aamap_objects[0]];
context.selectTool_delete();
assert.strictEqual(context.aamap_objects.length, 0);
assert.strictEqual(controls["#dCheckpointOrder"].value, "1",
    "Deleting the final checkpoint resets the control before tool reactivation");
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(controls["#dCheckpointOrder"].value, "2",
    "Undoing checkpoint deletion restores the prior next number");
context.aamap_redo();
assert.strictEqual(controls["#dCheckpointOrder"].value, "1");
context.aamap_undo();
assert.strictEqual(controls["#dCheckpointOrder"].value, "2");

controls["#symmetry-x-toggle"].checked = true;
controls["#dCheckpointAutoIncrement"].checked = false;
controls["#dCheckpointOrder"].value = "2";
context.zoneTool_resetPlacement();
setMapCursor(10, 4); context.zoneTool_complete();
setMapCursor(12, 4); context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 3);
const symmetricCheckpoints = context.aamap_objects.filter(zone => zone.option === 2);
assert.deepStrictEqual(symmetricCheckpoints.map(zone => zone.x).sort((a, b) => a - b), [-10, 10]);
assert.ok(symmetricCheckpoints.every(zone => zone.activeStartTick === null &&
    zone.activeEndTick === null),
    "Symmetry clones preserve an untimed zone instead of converting null to tick zero");
assert.ok(symmetricCheckpoints.every(zone =>
    !/start_tick=|end_tick=/.test(zone.getXML())));
assert.strictEqual(controls["#dCheckpointOrder"].value, "2");
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 1);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 3);

// A centre on the reflection line does not make asymmetric geometry symmetric.
// Clone first, then let exact serialized equality remove only true duplicates.
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = false;
const axisCenteredWall = new context.Wall();
axisCenteredWall.points = [{x:-3,y:4}, {x:1,y:4}, {x:2,y:7}];
assert.deepStrictEqual(plain(context.aamap_symmetryObjectCenter(axisCenteredWall)), {x:0,y:5});
const axisCenteredWallGroup = context.aamap_addWithSymmetry(axisCenteredWall);
assert.strictEqual(axisCenteredWallGroup.length, 2);
assert.notStrictEqual(axisCenteredWallGroup[0].getXML(), axisCenteredWallGroup[1].getXML());
context.aamap_removeObjectGroup(axisCenteredWallGroup);

// Semantic symmetry keys tolerate harmless endpoint/winding/encoding changes
// without collapsing objects whose gameplay state is genuinely different.
const symmetricLineZone = new context.Zone(0, 2, 0, 0, 0, 0, {
    zoneName:"death",shapeType:"line",options:{},lineWidth:2,
    lineStart:{x:-5,y:2},lineEnd:{x:5,y:2}
});
const symmetricLineGroup = context.aamap_addWithSymmetry(symmetricLineZone);
assert.strictEqual(symmetricLineGroup.length, 1,
    "Reversed ShapeLine endpoints do not stack an identical zone");
context.aamap_removeObjectGroup(symmetricLineGroup);

const symmetricBillboard = new context.Billboard(
    {x:-5,y:8},{x:5,y:8},3,"https://example.com/symmetric.png",0);
const symmetricBillboardGroup = context.aamap_addWithSymmetry(symmetricBillboard);
assert.strictEqual(symmetricBillboardGroup.length, 1,
    "Reversed billboard endpoints do not stack an identical billboard");
context.aamap_removeObjectGroup(symmetricBillboardGroup);

const asymmetricBillboard = new context.Billboard(
    {x:2,y:4},{x:8,y:4},7,"https://example.com/asymmetric.png",1);
const asymmetricBillboardGroup = context.aamap_addWithSymmetry(asymmetricBillboard);
assert.deepStrictEqual(plain(asymmetricBillboardGroup.map(function(object) {
    return [Math.min(object.start.x,object.end.x),Math.max(object.start.x,object.end.x),
        object.height,object.url,object.level,object.facing,object.dualSided];
}).sort(function(left,right) { return left[0] - right[0]; })), [
    [-8,-2,7,"https://example.com/asymmetric.png",1,"left",true],
    [2,8,7,"https://example.com/asymmetric.png",1,"right",true]
]);
context.aamap_removeObjectGroup(asymmetricBillboardGroup);

const symmetricFloor = new context.Floor(1);
symmetricFloor.points = [
    {x:-4,y:-2},{x:4,y:-2},{x:4,y:2},{x:-4,y:2}
];
const symmetricFloorGroup = context.aamap_addWithSymmetry(symmetricFloor);
assert.strictEqual(symmetricFloorGroup.length, 1,
    "Cyclic-start and winding changes do not stack an identical floor");
context.aamap_removeObjectGroup(symmetricFloorGroup);

const namedDirectionTeleport = new context.Zone(0, 3, 1, 0, 7, 0, {
    zoneName:"teleport",shapeType:"circle",
    options:{destination_x:0,destination_y:12,destination_level:0,direction:"north"}
});
const namedDirectionTeleportGroup = context.aamap_addWithSymmetry(namedDirectionTeleport);
assert.strictEqual(namedDirectionTeleportGroup.length, 1,
    "A cardinal teleport direction equals its reflected numeric vector encoding");
context.aamap_removeObjectGroup(namedDirectionTeleportGroup);

const symmetricTwoPointRamp = new context.Ramp(
    {x:-5,y:0},{x:5,y:0},4,0,1);
const symmetricTwoPointRampGroup = context.aamap_addWithSymmetry(symmetricTwoPointRamp);
assert.strictEqual(symmetricTwoPointRampGroup.length, 2,
    "Reflecting a from-level start onto the to-level end keeps the opposite slope");
assert.deepStrictEqual(plain(symmetricTwoPointRampGroup.map(function(ramp) {
    return [ramp.sourceTwoPoint.start.x,ramp.sourceTwoPoint.end.x];
}).sort(function(left, right) { return left[0] - right[0]; })), [
    [-5,5],[5,-5]
]);
context.aamap_removeObjectGroup(symmetricTwoPointRampGroup);

controls["#symmetry-x-toggle"].checked = false;
controls["#symmetry-y-toggle"].checked = true;
const symmetricFourPointRamp = new context.Ramp(
    {x:-5,y:-2},{x:-5,y:2},{x:5,y:-2},{x:5,y:2},0,1);
const symmetricFourPointRampGroup = context.aamap_addWithSymmetry(symmetricFourPointRamp);
assert.strictEqual(symmetricFourPointRampGroup.length, 1,
    "A coherent edge-winding reversal does not stack an identical ramp");
context.aamap_removeObjectGroup(symmetricFourPointRampGroup);

// With both lines selected, directional objects on a line can still produce
// distinct same-position copies because their directions are reflected too.
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = true;
function symmetrySpawn(x, y) {
    const spawn = new context.Spawn();
    spawn.x = x; spawn.y = y;
    return spawn;
}
const centeredOnXGroup = context.aamap_addWithSymmetry(symmetrySpawn(0, 5));
assert.deepStrictEqual(plain(centeredOnXGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[1] - b[1])), [[0,-5], [0,-5], [0,5], [0,5]]);
context.aamap_removeObjectGroup(centeredOnXGroup);
const centeredOnYGroup = context.aamap_addWithSymmetry(symmetrySpawn(5, 0));
assert.deepStrictEqual(plain(centeredOnYGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[0] - b[0])), [[-5,0], [5,0]]);
context.aamap_removeObjectGroup(centeredOnYGroup);
const centeredOnBothGroup = context.aamap_addWithSymmetry(symmetrySpawn(0, 0));
assert.strictEqual(centeredOnBothGroup.length, 2);
context.aamap_removeObjectGroup(centeredOnBothGroup);

controls["#symmetry-x-toggle"].checked = false;
controls["#symmetry-y-toggle"].checked = false;
controls["#symmetry-origin-toggle"].checked = true;
const originGroup = context.aamap_addWithSymmetry(symmetrySpawn(5, 7));
assert.deepStrictEqual(plain(originGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[0] - b[0])), [[-5,-7], [5,7]]);
context.aamap_removeObjectGroup(originGroup);

controls["#symmetry-origin-toggle"].checked = false;
controls["#symmetry-custom-x-toggle"].checked = true;
controls["#symmetry-custom-x-value"].value = "10";
const customXGroup = context.aamap_addWithSymmetry(symmetrySpawn(6, 2));
assert.deepStrictEqual(plain(customXGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[0] - b[0])), [[6,2], [14,2]]);
context.aamap_removeObjectGroup(customXGroup);
const customAxisPolygon = new context.Zone(10, 5, 0, 0, 0, 0, {
    zoneName:"death", shapeType:"polygon", options:{}, polygonScale:1,
    polygonPoints:[{x:-3,y:0},{x:1,y:1},{x:2,y:-1}]
});
assert.deepStrictEqual(plain(context.aamap_symmetryObjectCenter(customAxisPolygon)),
    {x:10,y:5});
const customAxisPolygonGroup = context.aamap_addWithSymmetry(customAxisPolygon);
assert.strictEqual(customAxisPolygonGroup.length, 2,
    "An asymmetric polygon centred on its custom line still gets a copy");
assert.deepStrictEqual(plain(customAxisPolygonGroup[1].getMapPoints()), [
    {x:8,y:4},{x:9,y:6},{x:13,y:5}
], "Custom translation applies to the polygon anchor, not its local offsets");
context.aamap_removeObjectGroup(customAxisPolygonGroup);

controls["#symmetry-custom-x-toggle"].checked = false;
controls["#symmetry-custom-y-toggle"].checked = true;
controls["#symmetry-custom-y-value"].value = "-3";
const customYGroup = context.aamap_addWithSymmetry(symmetrySpawn(6, 2));
assert.deepStrictEqual(plain(customYGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[1] - b[1])), [[6,-8], [6,2]]);
context.aamap_removeObjectGroup(customYGroup);

controls["#symmetry-custom-y-toggle"].checked = false;
controls["#symmetry-custom-point-toggle"].checked = true;
controls["#symmetry-custom-point-x"].value = "4";
controls["#symmetry-custom-point-y"].value = "-2";
const customPointGroup = context.aamap_addWithSymmetry(symmetrySpawn(6, 3));
assert.deepStrictEqual(plain(customPointGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[1] - b[1])), [[2,-7], [6,3]]);
context.aamap_removeObjectGroup(customPointGroup);
const customPointPolygon = new context.Zone(4, -2, 0, 0, 0, 0, {
    zoneName:"death", shapeType:"polygon", options:{}, polygonScale:1,
    polygonPoints:[{x:-3,y:0},{x:1,y:1},{x:2,y:-1}]
});
assert.deepStrictEqual(plain(context.aamap_symmetryObjectCenter(customPointPolygon)),
    {x:4,y:-2});
const customPointPolygonGroup = context.aamap_addWithSymmetry(customPointPolygon);
assert.strictEqual(customPointPolygonGroup.length, 2,
    "An asymmetric polygon centred on the custom point still gets a copy");
assert.deepStrictEqual(plain(customPointPolygonGroup[1].getMapPoints()), [
    {x:7,y:-2},{x:3,y:-3},{x:2,y:-1}
]);
context.aamap_removeObjectGroup(customPointPolygonGroup);

const affineFloor = new context.Floor(1);
affineFloor.points = [{x:1,y:2},{x:3,y:2},{x:1,y:4}];
const affineFloorCopy = context.aamap_symmetryClone(
    affineFloor, {x:-1,y:-1,tx:8,ty:-4});
assert.deepStrictEqual(plain(affineFloorCopy.points), [
    {x:7,y:-6},{x:5,y:-6},{x:7,y:-8}
], "Custom point symmetry applies tx/ty to absolute floor geometry");

const affineTeleport = new context.Zone(3, 4, 0, 0, 7, 0, {
    zoneName:"teleport",shapeType:"rectangle",minx:1,miny:2,maxx:5,maxy:6,
    options:{destination_x:14,destination_y:-3,destination_level:1,xdir:1,ydir:0},
    movementPath:[{x:3,y:4},{x:8,y:9}],movementSpeed:5
});
const affineTeleportCopy = context.aamap_symmetryClone(
    affineTeleport, {x:-1,y:1,tx:20,ty:0});
assert.deepStrictEqual(plain({
    rectangle:[affineTeleportCopy.minx,affineTeleportCopy.miny,
        affineTeleportCopy.maxx,affineTeleportCopy.maxy],
    path:affineTeleportCopy.movementPath,
    destination:[affineTeleportCopy.options.destination_x,
        affineTeleportCopy.options.destination_y],
    direction:affineTeleportCopy.getTeleportDirection()
}), {
    rectangle:[15,2,19,6],path:[{x:17,y:4},{x:12,y:9}],
    destination:[6,-3],direction:{x:-1,y:0}
}, "Custom-axis affine clones transform rectangle, path, destination, and direction");
context.aamap_removeObjectVisuals(affineFloorCopy);
context.aamap_removeObjectVisuals(affineTeleportCopy);
controls["#symmetry-custom-point-toggle"].checked = false;

controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = false;
const mirroredSource = symmetricCheckpoints.find(zone => zone.x === 10);
const mirroredMove = context.aamap_symmetryMovePlan([mirroredSource], 2, 3);
assert.deepStrictEqual(plain(mirroredMove.entries.map(entry =>
    [entry.object.x, entry.dx, entry.dy]).sort((a, b) => a[0] - b[0])), [
    [-10, -2, 3], [10, 2, 3]
]);
assert.strictEqual(context.aamap_symmetryExpandObjectGroups([mirroredSource]).length, 2);
const axisCircle = new context.Zone(0, 12, 1, 0, 0, 0, {
    zoneName:"death",shapeType:"circle",options:{}
});
const axisCircleGroup = context.aamap_addWithSymmetry(axisCircle);
assert.strictEqual(axisCircleGroup.length, 1,
    "A copy coincident on the symmetry axis stays hidden until needed");
const parallelAxisMove = context.aamap_symmetryMovePlan([axisCircle], 0, 2);
assert.strictEqual(parallelAxisMove.created.length, 0,
    "Moving parallel to a symmetry axis does not create an overlapping copy");
assert.strictEqual(parallelAxisMove.entries.length, 1);
const splitAxisMove = context.aamap_symmetryMovePlan([axisCircle], 2, 0);
assert.strictEqual(splitAxisMove.created.length, 1,
    "Moving off a symmetry axis materializes the formerly coincident copy");
splitAxisMove.entries.forEach(function(entry) {
    entry.object.move(entry.dx, entry.dy);
});
assert.deepStrictEqual(plain(splitAxisMove.entries.map(function(entry) {
    return entry.object.x;
}).sort(function(a, b) { return a - b; })), [-2, 2]);
splitAxisMove.entries.forEach(function(entry) {
    entry.object.move(-entry.dx, -entry.dy);
});
context.aamap_removeObjectGroup(splitAxisMove.created);
assert.strictEqual(axisCircle.x, 0,
    "Undoing the split move leaves the authored axis object in place");
context.aamap_restoreObjectGroup(splitAxisMove.created);
splitAxisMove.entries.forEach(function(entry) {
    entry.object.move(entry.dx, entry.dy);
});
assert.deepStrictEqual(plain(splitAxisMove.entries.map(function(entry) {
    return entry.object.x;
}).sort(function(a, b) { return a - b; })), [-2, 2],
"Redo restores the latent copy before replaying the mirrored move");
splitAxisMove.entries.forEach(function(entry) {
    entry.object.move(-entry.dx, -entry.dy);
});
context.aamap_removeObjectGroup(splitAxisMove.created);
context.aamap_removeObjectGroup(axisCircleGroup);
const divergentWall = new context.Wall();
divergentWall.points = [{x:20,y:1},{x:24,y:1}];
context.aamap_add(divergentWall);
const firstDivergentMove = context.aamap_symmetryMovePlan([divergentWall], 1, 2);
assert.strictEqual(firstDivergentMove.created.length, 1);
firstDivergentMove.entries.forEach(entry => entry.object.move(entry.dx, entry.dy));
firstDivergentMove.entries.forEach(entry => entry.object.move(-entry.dx, -entry.dy));
context.aamap_removeObjectGroup(firstDivergentMove.created);
const removedSymmetryCopy = firstDivergentMove.created[0];
const replacementDivergentMove = context.aamap_symmetryMovePlan([divergentWall], 3, 4);
assert.strictEqual(replacementDivergentMove.created.length, 1,
    "A new move after undo recreates the removed mirrored member");
assert.notStrictEqual(replacementDivergentMove.created[0], removedSymmetryCopy);
assert.strictEqual(context.aamap_objects.includes(replacementDivergentMove.created[0]), true);
context.aamap_drawSymmetryGuides();
assert.strictEqual(context.aamap_symmetryGuides.items.length, 1);
controls["#symmetry-y-toggle"].checked = true;
context.aamap_drawSymmetryGuides();
assert.strictEqual(context.aamap_symmetryGuides.items.length, 2);
controls["#symmetry-check-toggle"].checked = true;
assert.strictEqual(context.aamap_symmetryCheckEnabled(), true);
assert.deepStrictEqual(plain(context.aamap_symmetryCheckClipRect({x:1,y:1})),
    {x:400,y:0,width:400,height:300});
assert.deepStrictEqual(plain(context.aamap_symmetryCheckClipRect({x:-1,y:-1})),
    {x:0,y:300,width:400,height:300});
const symmetryCheckWall = new context.Wall();
symmetryCheckWall.points = [{x:2,y:2},{x:6,y:2}];
symmetryCheckWall.render();
context.aamap_applySymmetryCheckClip(symmetryCheckWall, {x:1,y:1}, false);
assert.strictEqual(symmetryCheckWall.obj.attrs["clip-rect"], "400 0 400 300");
controls["#symmetry-check-toggle"].checked = false;
controls["#symmetry-x-toggle"].checked = false;
controls["#symmetry-y-toggle"].checked = false;

context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(3, [6, 8]);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "ramp";
context.rampTool_resetPlacement();
setMapCursor(0, 0); context.rampTool_click();
setMapCursor(4, 0); context.rampTool_click();
assert.strictEqual(context.aamap_setActiveLevel(2), true);
setMapCursor(0, 10); context.rampTool_click();
setMapCursor(4, 10); context.rampTool_click();
assert.strictEqual(context.aamap_objects.length, 1);
const placedRamp = context.aamap_objects[0];
assert.deepStrictEqual(plain(placedRamp.points.map(p => [p.x,p.y])), [[0,0],[4,0],[0,10],[4,10]]);
assert.strictEqual(placedRamp.fromLevel, 0);
assert.strictEqual(placedRamp.toLevel, 2);
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 1);

// The level picker remains usable while a ramp is waiting for its destination
// floor. Creating a floor preserves the authored first edge and selects the
// new floor for the ramp's second edge.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "ramp";
context.rampTool_resetPlacement();
setMapCursor(1, 2); context.rampTool_click();
assert.strictEqual(context.aamap_addLevel(), false,
    "a new level is still blocked before the first ramp edge is complete");
setMapCursor(5, 2); context.rampTool_click();
assert.strictEqual(context.rampTool_allowsLevelAddition(), true);
assert.strictEqual(context.aamap_addLevel(), true);
assert.strictEqual(context.aamap_activeLevel, 1);
assert.strictEqual(context.rampTool_fromLevel, 0);
assert.strictEqual(context.rampTool_toLevel, 1);
assert.deepStrictEqual(plain(context.rampTool_fromEdge.map(point => [point.x, point.y])),
    [[1,2], [5,2]]);

// Undoing level creation restores a valid pending ramp with no stale target;
// redo restores the new destination. Starting a new action after undo also
// clears the old redo and can select a fresh destination normally.
context.aamap_undo();
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0]);
assert.strictEqual(context.aamap_activeLevel, 0);
assert.strictEqual(context.rampTool_toLevel, null);
assert.deepStrictEqual(plain(context.rampTool_fromEdge.map(point => [point.x, point.y])),
    [[1,2], [5,2]]);
context.aamap_redo();
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1]);
assert.strictEqual(context.aamap_activeLevel, 1);
assert.strictEqual(context.rampTool_toLevel, 1);
context.aamap_undo();
assert.strictEqual(context.rampTool_toLevel, null);
assert.strictEqual(context.aamap_addLevel(), true);
assert.strictEqual(context.rampTool_toLevel, 1);
setMapCursor(1, 12); context.rampTool_click();
setMapCursor(5, 12); context.rampTool_click();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(context.aamap_objects[0].fromLevel, 0);
assert.strictEqual(context.aamap_objects[0].toLevel, 1);

// Full history traversal never resurrects an active placement beside the
// completed ramp.
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);
assert.strictEqual(context.vectron_toolActive, true);
context.aamap_undo();
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0]);
assert.strictEqual(context.rampTool_toLevel, null);
context.aamap_redo();
assert.strictEqual(context.rampTool_toLevel, 1);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(context.vectron_toolActive, false);
assert.deepStrictEqual(plain(context.rampTool_fromEdge), []);

// Teleport destinations use the same two-click directional marker interaction
// as spawns, inherit the selected destination floor, and keep the source zone
// visible while the destination is being authored.
assert.strictEqual(context.spawnMarker_toDegrees(-1e-15, 1), -90);
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(2, [8]);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "zone";
context.zoneTool_type = 7;
controls["#dZoneShape"].value = "circle";
controls["#dZoneMoving"].checked = false;
context.zoneTool_resetPlacement();
setMapCursor(1, 1); context.zoneTool_complete();
setMapCursor(5, 1); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "teleport-position");
assert.ok(context.zoneTool_pendingZone);
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs.stroke, "#e67e22");
assert.strictEqual(context.aamap_objects.length, 0);
assert.strictEqual(context.aamap_setActiveLevel(1), true);
assert.strictEqual(context.zoneTool_stage, "teleport-position");
assert.strictEqual(context.zoneTool_pendingZone.obj.removed, false);
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs.stroke, "#e67e22");
setMapCursor(10, 10); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "teleport-direction");
assert.strictEqual(context.zoneTool_pendingZone.options.destination_level, 1);
setMapCursor(10, 14); context.zoneTool_guide();
assert.strictEqual(context.zoneTool_guideObj.attrs.stroke, "#e67e22");
assert.strictEqual(context.zoneTool_guideObj.attrs.fill, "#e67e22");
assert.strictEqual(context.zoneTool_guideObj.transformValue, "R-90");
context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 1);
const placedTeleport = context.aamap_objects[0];
assert.strictEqual(placedTeleport.options.destination_x, 10);
assert.strictEqual(placedTeleport.options.destination_y, 10);
assert.strictEqual(placedTeleport.options.destination_level, 1);
assert.ok(Math.abs(placedTeleport.options.xdir) < 1e-9);
assert.ok(Math.abs(placedTeleport.options.ydir - 1) < 1e-9);
placedTeleport.render();
assert.deepStrictEqual(plain(placedTeleport.destinationObj.path),
    plain(context.spawnMarker_path(context.aamap_realX(10), context.aamap_realY(10),
        context.SPAWN_MARKER_SIZE)));
assert.strictEqual(placedTeleport.destinationObj.transformValue, "R-90");
assert.strictEqual(placedTeleport.destinationObj.attrs.stroke, "#e67e22");
assert.doesNotMatch(placedTeleport.getXML(), /priority=|start_tick=|end_tick=/);

// Selecting a teleport reveals its relationship line. Its destination is an
// independent hit target on the destination floor and a drag only updates the
// destination coordinates, with one undoable XML-visible action.
context.aamap_objects = [placedTeleport];
context.aamap_clearHistory();
context.vectron_currentTool = "select";
context.aamap_activeLevel = 1;
placedTeleport.isSelected = true;
placedTeleport.render();
assert.ok(placedTeleport.teleportLinkObj);
assert.deepStrictEqual(plain(placedTeleport.teleportLinkObj.path), [
    "M", context.aamap_realX(1), context.aamap_realY(1),
    "L", context.aamap_realX(10), context.aamap_realY(10)
]);
assert.strictEqual(context.selectTool_isTeleportDestinationEditable(placedTeleport), true);
context.cursor_realX = context.cursor_neverSnappedX = context.aamap_realX(10);
context.cursor_realY = context.cursor_neverSnappedY = context.aamap_realY(10);
assert.strictEqual(context.selectTool_resolveHoveredSetFromCursor(), true);
assert.strictEqual(context.selectTool_hoveredAamapObj, placedTeleport);
assert.strictEqual(context.selectTool_hoveredPart, "teleport-destination");
context.selectTool_start();
assert.strictEqual(context.selectTool_selectedTeleportDestination, placedTeleport);
context.cursor_realX = context.cursor_neverSnappedX = context.aamap_realX(12);
context.cursor_realY = context.cursor_neverSnappedY = context.aamap_realY(13);
context.selectTool_progress();
context.selectTool_complete();
assert.deepStrictEqual([
    placedTeleport.options.destination_x,
    placedTeleport.options.destination_y,
    placedTeleport.options.destination_level
], [12,13,1]);
assert.match(placedTeleport.getXML(), /destination_x="12" destination_y="13" destination_level="1"/);
context.aamap_undo();
assert.deepStrictEqual([
    placedTeleport.options.destination_x, placedTeleport.options.destination_y
], [10,10]);
context.aamap_redo();
assert.deepStrictEqual([
    placedTeleport.options.destination_x, placedTeleport.options.destination_y
], [12,13]);
context.selectTool_deselectAll();

// Relationship lines use the actual shape center rather than the Zone's
// nominal x/y fields, including while a destination is being dragged.
const rectangleTeleport = new context.Zone(0, 0, 0, 0, 7, 0, {
    zoneName:"teleport", shapeType:"rectangle",
    minx:2, miny:4, maxx:6, maxy:10,
    options:{destination_x:20, destination_y:20, destination_level:1, xdir:1, ydir:0}
});
rectangleTeleport.x = 0;
rectangleTeleport.y = 0;
rectangleTeleport.level = 1;
rectangleTeleport.isSelected = true;
rectangleTeleport.render();
assert.deepStrictEqual(plain(rectangleTeleport.teleportLinkObj.path.slice(0, 3)), [
    "M", context.aamap_realX(4), context.aamap_realY(7)
]);
context.selectTool_setTeleportDestinationPreview(rectangleTeleport, 22, 21);
assert.deepStrictEqual(plain(rectangleTeleport.teleportLinkObj.attrs.path.slice(0, 3)), [
    "M", context.aamap_realX(4), context.aamap_realY(7)
]);
context.aamap_removeObjectVisuals(rectangleTeleport);

// Destination-only dragging participates in symmetry just like whole-object
// movement: reflected destinations receive reflected deltas and share undo.
context.aamap_objects = [placedTeleport];
context.aamap_clearHistory();
controls["#symmetry-x-toggle"].checked = true;
placedTeleport.isSelected = false;
placedTeleport.render();
setMapCursor(12, 13);
assert.strictEqual(context.selectTool_resolveHoveredSetFromCursor(), true);
context.selectTool_start();
setMapCursor(14, 17);
context.selectTool_progress();
context.selectTool_complete();
const reflectedTeleport = context.aamap_objects.filter(object =>
    object !== placedTeleport)[0];
assert.ok(reflectedTeleport);
assert.deepStrictEqual([
    placedTeleport.options.destination_x, placedTeleport.options.destination_y
], [14,17]);
assert.deepStrictEqual([
    reflectedTeleport.options.destination_x, reflectedTeleport.options.destination_y
], [-14,17]);
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 1);
assert.deepStrictEqual([
    placedTeleport.options.destination_x, placedTeleport.options.destination_y
], [12,13]);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 2);
assert.deepStrictEqual([
    reflectedTeleport.options.destination_x, reflectedTeleport.options.destination_y
], [-14,17]);
controls["#symmetry-x-toggle"].checked = false;
context.selectTool_deselectAll();
context.vectron_currentTool = "zone";

// A moving teleport starts its path on the source floor even when its
// destination was authored on another floor.
context.aamap_objects = [];
context.zoneTool_resetPlacement();
assert.strictEqual(context.aamap_setActiveLevel(0), true);
controls["#dZoneMoving"].checked = true;
setMapCursor(2, 2); context.zoneTool_complete();
setMapCursor(6, 2); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_finishMovementPath(), true);
assert.strictEqual(context.zoneTool_stage, "movement-shape");
setMapCursor(2, 2); context.zoneTool_complete();
setMapCursor(6, 2); context.zoneTool_complete();
assert.strictEqual(context.aamap_setActiveLevel(1), true);
setMapCursor(10, 10); context.zoneTool_complete();
setMapCursor(14, 10); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-instances");
assert.strictEqual(context.aamap_activeLevel, 0);
assert.strictEqual(context.zoneTool_pendingZone.level, 0);
assert.strictEqual(context.zoneTool_pendingZone.options.destination_level, 1);
assert.deepStrictEqual(plain(context.zoneTool_pendingZone.movementPath),
    [{x:2,y:2},{x:6,y:2}]);
context.zoneTool_cancelPlacement();
controls["#dZoneMoving"].checked = false;

// Floor placement, transforms, hit testing, and undo/redo.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
context.vectron_currentTool = "floor";
context.floorTool_reset();
setMapCursor(0, 0);
assert.strictEqual(context.floorTool_click(), false);
assert.deepStrictEqual(plain(context.floorTool_points), []);
assert.match(controls["#floor-tool-status"].text, /implicit full floor/i);
assert.strictEqual(context.aamap_addLevel(), true);
assert.strictEqual(context.aamap_activeLevel, 1);
assert.match(controls["#floor-tool-status"].text, /Click at least three corners/i);
context.aamap_undo();
assert.strictEqual(context.aamap_activeLevel, 0);
assert.match(controls["#floor-tool-status"].text, /implicit full floor/i);
context.aamap_redo();
assert.strictEqual(context.aamap_activeLevel, 1);
assert.match(controls["#floor-tool-status"].text, /Click at least three corners/i);
context.aamap_clearHistory();
context.aamap_resetLevels(3, [6, 8]);
context.aamap_activeLevel = 2;
context.vectron_currentTool = "floor";
context.floorTool_reset();
setMapCursor(0, 0); context.floorTool_click();
setMapCursor(6, 0); context.floorTool_click();
setMapCursor(3, 5); context.floorTool_click();
assert.strictEqual(context.floorTool_finish(), true);
const placedFloor = context.aamap_objects[0];
assert.strictEqual(context.selectTool_pointInGlow(placedFloor,
    context.aamap_realX(3), context.aamap_realY(2)), true);
placedFloor.move(2, 3);
assert.deepStrictEqual(plain(placedFloor.points.map(p => [p.x,p.y])), [[2,3],[8,3],[5,8]]);
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 1);

// Adding a level is itself undoable and restores adjacent-height state.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
assert.strictEqual(context.aamap_addLevel(), true);
assert.deepStrictEqual(Array.from(context.xml_level_heights), [8]);
context.aamap_undo();
assert.strictEqual(context.aamap_levelCount(), 1);
context.aamap_redo();
assert.strictEqual(context.aamap_levelCount(), 2);

// A lower floor can be removed sparsely without renumbering upper floors, and
// both variants remain fully undoable.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(4, [5, 7, 9]);
const upperWall = new context.Wall();
upperWall.level = 3;
upperWall.points = [{x:0,y:0}, {x:5,y:0}];
const deletedWall = new context.Wall();
deletedWall.level = 1;
deletedWall.points = [{x:0,y:1}, {x:5,y:1}];
context.aamap_objects = [upperWall, deletedWall];
assert.strictEqual(context.aamap_deleteLevel(1, false), true);
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,2,3]);
assert.strictEqual(upperWall.level, 3);
assert.deepStrictEqual(Array.from(context.xml_level_heights), [5,7,9]);
assert.strictEqual(context.aamap_objects.includes(deletedWall), false);
context.aamap_undo();
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1,2,3]);
assert.strictEqual(context.aamap_objects.includes(deletedWall), true);
assert.strictEqual(context.aamap_deleteLevel(1, true), true);
assert.strictEqual(upperWall.level, 2);
assert.deepStrictEqual(Array.from(context.xml_level_heights), [7,9]);
context.aamap_undo();
assert.strictEqual(upperWall.level, 3);

// Level 0 is permanent and cannot be deleted sparsely. Deleting its authored
// contents requires shifting upper levels down, while the implicit base slot
// remains present.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(3, [5, 7]);
context.aamap_activeLevel = 0;
context.aamap_updateLayerControls();
const baseDeleteTag = controls["#level-menu-list"].html.match(
    /<button class="level-delete-btn" data-level="0"[^>]*>/)[0];
assert.doesNotMatch(baseDeleteTag, /disabled/);
const baseWall = new context.Wall();
baseWall.level = 0;
baseWall.points = [{x:0,y:0}, {x:4,y:0}];
const levelTwoWall = new context.Wall();
levelTwoWall.level = 2;
levelTwoWall.points = [{x:0,y:2}, {x:4,y:2}];
context.aamap_objects = [baseWall, levelTwoWall];
assert.strictEqual(context.aamap_deleteLevel(0, false), false);
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1,2]);
assert.strictEqual(context.aamap_objects.includes(baseWall), true);
assert.strictEqual(context.aamap_deleteLevel(0, true), true);
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1]);
assert.strictEqual(context.aamap_objects.includes(baseWall), false);
assert.strictEqual(levelTwoWall.level, 1);
assert.deepStrictEqual(Array.from(context.xml_level_heights), [7]);
const shiftedBaseXml = context.aamap_buildXml("shifted", "tester", "racing", "1", 4, []).xml;
assert.match(shiftedBaseXml, /<Level index="0"\/>/);
assert.match(shiftedBaseXml, /<Level index="1"\/>/);
context.aamap_undo();
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1,2]);
assert.strictEqual(levelTwoWall.level, 2);
assert.strictEqual(context.aamap_objects.includes(baseWall), true);

context.aamap_objects = [];
context.aamap_resetLevels(1, []);
assert.strictEqual(context.aamap_deleteLevel(0, false), false);
context.aamap_updateLayerControls();
const lastDeleteTag = controls["#level-menu-list"].html.match(
    /<button class="level-delete-btn" data-level="0"[^>]*>/)[0];
assert.match(lastDeleteTag, /disabled/);

context.aamap_resetLevels(3, [5, 7], {2:true});
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,2]);
context.aamap_ensureLevel(1);
assert.deepStrictEqual(Array.from(context.aamap_existingLevels()), [0,1,2]);
assert.strictEqual(context.aamap_levelExistsAt(0), true);

// Level 0 always keeps the broad legacy arena floor. A stale authored base
// Floor is ignored rather than replacing it with a mapper-defined polygon.
context.aamap_resetLevels(1, []);
const concaveFloor = new context.Floor(0);
concaveFloor.points = concaveFloorPoints;
context.aamap_objects = [concaveFloor];
const explicitFloorScene = context.preview3d_buildScene(context.aamap_objects);
assert.strictEqual(explicitFloorScene.triangles.length, 2);
context.aamap_objects = [];
const fallbackFloorScene = context.preview3d_buildScene(context.aamap_objects);
assert.strictEqual(fallbackFloorScene.triangles.length, 2);

// Authored upper floors remain polygonal and preserve concave outlines.
context.aamap_resetLevels(2, [8]);
const concaveUpperFloor = new context.Floor(1);
concaveUpperFloor.points = concaveFloorPoints;
context.aamap_objects = [concaveUpperFloor];
const upperFloorScene = context.preview3d_buildScene(context.aamap_objects);
assert.strictEqual(upperFloorScene.triangles.length, 6);

const animatedPreviewZone = new context.Zone(0, 0, 2, 0, 0, 0, {
    zoneName:"death", shapeType:"circle", options:{}, movementSpeed:5,
    rotationSpeed:45, movementMode:"ping_pong", movementInstances:[1],
    movementPath:[{x:0,y:0}, {x:10,y:0}]
});
const animatedZoneScene = context.preview3d_newScene();
assert.strictEqual(animatedPreviewZone.rotationSpeed, 45);
context.preview3d_addZone(animatedZoneScene, animatedPreviewZone);
assert.strictEqual(animatedZoneScene.dynamicZones.length, 2);
assert.deepStrictEqual(Array.from(animatedZoneScene.dynamicZones, function(zone) {
    return zone.phaseSeconds;
}), [0, 2]);
assert.strictEqual(animatedZoneScene.lines.length, 0,
    "3D preview explicit instances are moving rather than stationary geometry");
const pulsePreviewMotion = {
    path:[{x:0,y:0},{x:10,y:0}], speed:10, mode:"circular",
    pulseRadii:[2,6]
};
assert.strictEqual(context.preview3d_pulseRadius(pulsePreviewMotion, 0.5), 4);
assert.strictEqual(context.preview3d_pulseRadius(pulsePreviewMotion, 1.5), 4,
    "The circular closing leg interpolates from the last radius back to the first");

// Moving instances use a fixed screen-space target instead of requiring an
// exact map-coordinate click. The hit area therefore stays usable at every
// zoom level while still selecting the nearest unused path vertex.
const instanceHitPath = [{x:0,y:0},{x:10,y:0},{x:12,y:0}];
context.vectron_panX = 0;
context.vectron_panY = 0;
context.vectron_zoom = 1;
assert.strictEqual(context.zoneTool_nearestUnusedMovementVertex(
    context.aamap_realX(10) + 7, context.aamap_realY(0), instanceHitPath.slice(0, 2), []), 1);
assert.strictEqual(context.zoneTool_nearestUnusedMovementVertex(
    context.aamap_realX(10) + 9, context.aamap_realY(0), instanceHitPath.slice(0, 2), []), -1);
context.vectron_zoom = 4;
assert.strictEqual(context.zoneTool_nearestUnusedMovementVertex(
    context.aamap_realX(10) + 7, context.aamap_realY(0), instanceHitPath, []), 2,
    "The nearest vertex wins when two targets overlap");
assert.strictEqual(context.zoneTool_nearestUnusedMovementVertex(
    context.aamap_realX(10) + 7, context.aamap_realY(0), instanceHitPath, [2]), 1,
    "Already-authored instances are skipped");
context.vectron_zoom = 1;

// Moving-zone placement is a single undoable editor action. The first path
// point is the authored zone centre and loop options survive the one action.
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
context.zoneTool_type = 0;
controls["#dZoneMoving"].checked = true;
controls["#dZoneMovementSpeed"].value = "20";
controls["#dZoneRotationSpeed"].value = "30";
controls["#dZoneMovementMode"].value = "ping_pong";
controls["#dZonePulse"].checked = false;
setMapCursor(2, 3); context.zoneTool_complete();
setMapCursor(12, 3); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-path");
assert.strictEqual(context.zoneTool_pendingZone, null);
assert.strictEqual(context.zoneTool_finishMovementPath(), true);
assert.strictEqual(context.zoneTool_stage, "movement-shape");
setMapCursor(2, 3); context.zoneTool_complete();
setMapCursor(6, 3); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-instances");
assert.ok(context.zoneTool_pendingZone);
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs["stroke-dasharray"], "--");
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs["fill-opacity"], 0.16);
controls["#dZoneMovementSpeed"].value = "27";
controls["#dZoneRotationSpeed"].value = "45";
controls["#dZoneMovementMode"].value = "instant";
setMapCursor(12, 3); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_finishMovementInstances(), true);
assert.strictEqual(context.aamap_objects.length, 1);
assert.deepStrictEqual(plain(context.aamap_objects[0].movementPath), [{x:2,y:3},{x:12,y:3}]);
assert.strictEqual(context.aamap_objects[0].movementSpeed, 27);
assert.strictEqual(context.aamap_objects[0].rotationSpeed, 0,
    "Circular zones do not expose or retain a meaningless rotation speed");
assert.strictEqual(context.aamap_objects[0].movementMode, "instant");
assert.deepStrictEqual(plain(context.aamap_objects[0].movementInstances), [1]);
assert.match(context.aamap_objects[0].getXML(), /movement_speed="27"/);
assert.match(context.aamap_objects[0].getXML(), /rotation_speed="0"/);
assert.doesNotMatch(context.aamap_objects[0].getXML(), /spawn_at_vertices/);
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);

// Zoom/pan changes between a circle's center and edge clicks cannot alter its
// authored map-space radius.
context.aamap_objects = [];
controls["#dZoneMoving"].checked = false;
controls["#dZoneShape"].value = "circle";
context.zoneTool_resetPlacement();
context.vectron_zoom = 1;
context.vectron_panX = 0;
context.vectron_panY = 0;
setMapCursor(5, 7); context.zoneTool_complete();
context.vectron_zoom = 2;
context.vectron_panX = 3;
context.vectron_panY = -2;
context.cursor_realX = context.cursor_neverSnappedX = context.aamap_realX(9);
context.cursor_realY = context.cursor_neverSnappedY = context.aamap_realY(7);
context.zoneTool_complete();
assert.strictEqual(context.aamap_objects[0].radius, 4);
assert.deepStrictEqual(plain(context.aamap_objects[0].getShapeCenter()), {x:5,y:7});

// Pulsing circles record explicit instance phases and absolute radius
// keyframes after the path is authored.
context.aamap_objects = [];
context.zoneTool_resetPlacement();
context.vectron_zoom = 1;
context.vectron_panX = 0;
context.vectron_panY = 0;
controls["#dZoneMoving"].checked = true;
controls["#dZonePulse"].checked = true;
setMapCursor(0, 0); context.zoneTool_complete();
setMapCursor(10, 0); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_finishMovementPath(), true);
setMapCursor(0, 0); context.zoneTool_complete();
setMapCursor(2, 0); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-instances");
assert.strictEqual(controls["#dZonePulse"].disabled, true,
    "Pulse configuration locks after the source circle creates its keyframes");
setMapCursor(10, 0); context.zoneTool_complete();
setMapCursor(16, 0); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_finishMovementInstances(), true);
assert.deepStrictEqual(plain(context.aamap_objects[0].movementInstances), [1]);
assert.deepStrictEqual(plain(context.aamap_objects[0].movementPulseRadii), [2,6]);
assert.match(context.aamap_objects[0].getXML(), /instances="1"/);
assert.match(context.aamap_objects[0].getXML(), /radius="2"[\s\S]*radius="6"/);
assert.doesNotMatch(context.aamap_objects[0].getXML(), /spawn_at_vertices/);
assert.strictEqual(controls["#dZonePulse"].disabled, false,
    "Finishing the moving-zone group unlocks Pulse for the next placement");
controls["#dZonePulse"].checked = false;
controls["#dZoneMoving"].checked = false;

const invalidMoving = new context.Zone(0, 0, 2, 0, 0, 0, {
    zoneName:"death", shapeType:"circle", options:{}, movementSpeed:20,
    rotationSpeed:0, movementPath:[{x:0,y:0}]
});
context.aamap_objects = [spawn, invalidMoving];
assert.ok(Array.from(context.aamap_validateForExport(4)).some(message =>
    /at least two distinct/.test(message)));

// The Zone tool accepts an exact zero from its numeric input and preserves it
// through the same placement path used by the browser UI.
assert.strictEqual(context.zoneTool_parseLineWidth("0"), 0);
assert.strictEqual(context.zoneTool_parseLineWidth("-0"), 0);
assert.strictEqual(context.zoneTool_parseLineWidth("0.125"), 0.125);
assert.strictEqual(context.zoneTool_parseLineWidth(""), null);
assert.strictEqual(context.zoneTool_parseLineWidth("-0.001"), null);
context.aamap_objects = [];
context.aamap_clearHistory();
context.aamap_resetLevels(1, []);
context.aamap_activeLevel = 0;
context.zoneTool_type = 0;
controls["#dZoneShape"].value = "line";
controls["#dZoneLineWidth"].value = "0";
controls["#dZoneMoving"].checked = false;
controls["#symmetry-x-toggle"].checked = false;
controls["#symmetry-y-toggle"].checked = false;
context.zoneTool_resetPlacement();
setMapCursor(-4, 2); context.zoneTool_complete();
setMapCursor(6, 2); context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 1);
assert.strictEqual(context.aamap_objects[0].lineWidth, 0);
assert.deepStrictEqual(plain(context.aamap_objects[0].getMapPoints()), [
    {x:-4,y:2}, {x:6,y:2}
]);
assert.match(context.aamap_objects[0].getXML(), /<ShapeLine width="0">/);

console.log("Vectron Neotron core tests passed.");
