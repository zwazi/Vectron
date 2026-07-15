"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const configSource = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
const eventSource = fs.readFileSync(path.join(root, "js/eventHandler.js"), "utf8");
const xmlSource = fs.readFileSync(path.join(root, "js/xml.js"), "utf8");
const guiSource = fs.readFileSync(path.join(root, "js/gui.js"), "utf8");
const darkCssSource = fs.readFileSync(path.join(root, "css/vectron-dark.css"), "utf8");
const armamapSchema = JSON.parse(fs.readFileSync(
    path.resolve(root, "../../docs/armamap-v1.schema.json"), "utf8"));
assert.ok(armamapSchema.required.includes("metadata"));
assert.deepStrictEqual(armamapSchema.$defs.metadata.required, ["tags", "revision"]);
assert.strictEqual(armamapSchema.$defs.metadata.properties.tags.type, "array");
assert.strictEqual(armamapSchema.$defs.metadata.properties.tags.uniqueItems, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    armamapSchema.$defs.metadata.properties, "category"), false);
assert.strictEqual(armamapSchema.$defs.metadata.properties.revision.pattern,
    "^armamap-revision-v1:[0-9a-f]{64}$");
assert.strictEqual(armamapSchema.$defs.number.maximum, 9007199254740991);
assert.strictEqual(armamapSchema.$defs.safeInteger.maximum, 9007199254740991);
assert.strictEqual(armamapSchema.$defs.spawn.properties.direction.$ref,
    "#/$defs/nonzeroVector");
assert.strictEqual(armamapSchema.properties.axes.oneOf[1].items.$ref,
    "#/$defs/nonzeroVector");
assert.strictEqual(armamapSchema.$defs.teleportZone.allOf[1]
    .properties.direction.oneOf[0].$ref, "#/$defs/nonzeroVector");
assert.strictEqual(armamapSchema.$defs.zone.oneOf.length, 7);
["deathZone","winZone","checkpointZone","healthZone","speedZone",
    "settingZone","teleportZone"].forEach(function(name) {
    assert.strictEqual(armamapSchema.$defs[name].unevaluatedProperties, false);
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    armamapSchema.$defs.deathZone.allOf[1].properties, "delta"), false);
assert.match(indexSource, /id="theme" href="\.\/css\/vectron-dark\.css"/);
assert.doesNotMatch(indexSource, /id="dark-theme"|Enable dark theme/i);
assert.match(configSource, /var config_isDark = true;/);
assert.doesNotMatch(configSource, /function (?:enable|disable)_dark_theme|"darkTheme"/);
assert.doesNotMatch(eventSource, /#dark-theme|disable_dark_theme/);
assert.match(configSource, /select:\s*'1'[\s\S]*wall:\s*'2'[\s\S]*floor:\s*'3'[\s\S]*zone:\s*'4'[\s\S]*spawn:\s*'5'[\s\S]*ramp:\s*'6'[\s\S]*split:\s*'7'[\s\S]*join:\s*'8'[\s\S]*wallVertexMove:\s*'9'/);
assert.doesNotMatch(indexSource, /id="keybinds-config"|id="new-map-popover"/);
assert.match(indexSource, /id="symmetry-check-toggle"/);
assert.match(indexSource, /id="map_author_password"[^>]*maxlength="120"/);
assert.match(indexSource,
    /id="dCheckpointAutoIncrementEvery"[^>]*value="1"[^>]*step="1"[^>]*min="1"/);
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
assert.match(xmlSource,
    /xml_process\(parsed, false, isNative \? null : \{centerOnOrigin:true\}\)/,
    "File import centers legacy XML but preserves canonical .armamap coordinates");
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
        circle() { this.circleCalls++; return element(); }, rect() { return element(); },
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
    "#dZoneSpawnAtVertices": {checked:false, value:""},
    "#dGameSetting": {value:"CYCLE_ACCEL"},
    "#dGameSettingValue": {value:"20"},
    "#symmetry-x-toggle": {checked:false, value:""},
    "#symmetry-y-toggle": {checked:false, value:""},
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
    window:null, document:{getElementsByTagName() { return []; }},
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
load("js/AamapTools/floorTool.js");
load("js/aamap.js");
load("js/AamapTools/wallTool.js");
load("js/AamapTools/zoneTool.js");
load("js/AamapTools/selectTool.js");
load("js/AamapTools/rampTool.js");
load("js/xml.js");
load("js/armamap.js");
load("js/eventHandler.js");
load("js/preview3d.js");

const initialPathCalls = context.vectron_screen.pathCalls;
const initialCircleCalls = context.vectron_screen.circleCalls;
context.aamap_beginBulkLoad();
let bulkObjects;
try {
    bulkObjects = [new context.Spawn(), new context.Wall(),
        new context.Zone(0, 0, 1, 0, 0, 0, {zoneName:"death"}),
        new context.Ramp({x:-1,y:0}, {x:1,y:0}, {x:-1,y:5}, {x:1,y:5}, 0, 1),
        new context.Floor(1)];
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

assert.strictEqual(context.codeViewer_formatJsonText('{"format":"arma-racing-map","walls":[]}'),
    '{\n  "format": "arma-racing-map",\n  "walls": []\n}\n');
assert.strictEqual(context.codeViewer_formatXmlText(
    '<Resource name="readable"><Map><World><Field><Spawn x="1" y="2"/></Field></World></Map></Resource>'),
    '<Resource name="readable">\n  <Map>\n    <World>\n      <Field>\n' +
    '        <Spawn x="1" y="2"/>\n      </Field>\n    </World>\n  </Map>\n</Resource>\n');
context.codeViewer_setSourceFormat("legacy-xml");
assert.strictEqual(context.codeViewer_sourceFormat, "legacy-xml");
context.codeViewer_setSourceFormat("not-a-format");
assert.strictEqual(context.codeViewer_sourceFormat, "armamap");

const line = new context.Zone(0, 0, 0, 0, 5, 0, {
    zoneName:"checkpoint", shapeType:"line", lineWidth:2,
    lineStart:{x:-3, y:1}, lineEnd:{x:3, y:1}, options:{}
});
line.level = 1;
assert.match(line.getXML(), /<Zone level="1" type="checkpoint" order="0">/);
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
    zoneName:"checkpoint", shapeType:"circle", options:{}, spawnAtVertices:true,
    movementPath:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]
});
movingCheckpoint.render();
assert.strictEqual(movingCheckpoint.movementPathObj.items.length, 9,
    "Three path legs plus two moving-copy ghosts and their layered checkpoint labels");

const teleport = new context.Zone(0, 0, 4, 0, 7, 0, {
    zoneName:"teleport", shapeType:"circle",
    options:{destination_x:8, destination_y:9, destination_level:2, xdir:1, ydir:0}
});
assert.match(teleport.getXML(), /destination_level="2"/);

const health = new context.Zone(0, 0, 4, 0, 3, 0, {
    zoneName:"health", shapeType:"circle", options:{delta:-12.5}
});
assert.match(health.getXML(), /type="health" delta="-12.5"/);
const setting = new context.Zone(0, 0, 4, 0, 8, 0, {
    zoneName:"setting", shapeType:"circle",
    options:{setting:"CYCLE_ACCEL", value:20}
});
assert.match(setting.getXML(), /type="setting" setting="CYCLE_ACCEL" value="20"/);
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
    movementMode:"instant", spawnAtVertices:true,
    movementPath:[{x:2,y:3}, {x:12,y:3}, {x:12,y:9}]
});
const movingXml = movingZone.getXML();
assert.match(movingXml, /movement_speed="20" rotation_speed="-15"/);
assert.match(movingXml, /<MovementPath\b[^>]*\bloop="true"/);
assert.match(movingXml, /mode="instant" spawn_at_vertices="true"/);
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
assert.strictEqual(nativeOutput.fileName, "figure-eight.armamap");
assert.strictEqual(nativeOutput.document.format, "arma-racing-map");
assert.strictEqual(nativeOutput.document.format_version, 1);
assert.deepStrictEqual(plain(nativeOutput.document.metadata.tags), ["racing"]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(
    nativeOutput.document.metadata, "category"), false);
assert.match(nativeOutput.document.metadata.revision,
    /^armamap-revision-v1:[0-9a-f]{64}$/);
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
const revisionFixture = {
    format:"arma-racing-map",format_version:1,
    metadata:{name:"Revision fixture",author:"Mapper",tags:["racing","technical"]},
    axes:8,levels:{count:1,gaps:[]},
    settings:{CYCLE_START_SPEED:10,ZONE_PULSE_SPEED:0.1},
    spawns:[{level:0,position:[0,0],direction:[1,0]}],
    walls:[],floors:[],ramps:[],zones:[]
};
assert.strictEqual(context.armamap_applyRevision(revisionFixture),
    "armamap-revision-v1:a927bb1700a16f0c52f9e85222e73ed585b7e178b5bb6b99bcb47c21302d252b");
assert.strictEqual(context.armamap_computeRevision(revisionFixture),
    revisionFixture.metadata.revision, "An unchanged export keeps its revision");
const unsupportedRevisionFixture = JSON.parse(JSON.stringify(revisionFixture));
unsupportedRevisionFixture.metadata.revision = "armamap-revision-v2:" + "0".repeat(64);
assert.throws(function() { context.armamap_verifyRevision(unsupportedRevisionFixture); },
    /unsupported .armamap revision algorithm/);
unsupportedRevisionFixture.metadata.revision = "armamap-revision-v1:ABC";
assert.throws(function() { context.armamap_verifyRevision(unsupportedRevisionFixture); },
    /malformed .armamap revision hash/);
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
    format_version:1,format:"arma-racing-map"
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
    format:"arma-racing-map",format_version:1,
    metadata:{name:"Numeric fixture",tags:[astralKey,privateUseKey]},
    settings:unicodeSettings,
    spawns:[{position:[-0,1e-7],direction:[1,0]}],
    walls:[{points:[[0,0],[1,0.000001]]}]
};
assert.strictEqual(context.armamap_computeRevision(unicodeRevisionFixture),
    "armamap-revision-v1:2fa16eb87916f0e9d982308cc58fec5651ce710e8083f37ce052b7d59a9977e5");
assert.deepStrictEqual(plain(context.armamap_parseTags(
    " racing, racing, technical ")), ["racing","technical"]);
assert.throws(function() { context.armamap_parseTags([" racing "]); },
    /must already be trimmed/);
assert.throws(function() { context.armamap_parseTags(["racing", "racing"]); },
    /duplicate tags/);
assert.throws(function() { context.armamap_parseTags(["racing", " "]); },
    /cannot contain empty tags/);
assert.match(context.armamap_toCompatibilityXml({
    format:"arma-racing-map",format_version:1,
    metadata:{catregory:"technical",revision:"legacy-1"},
    spawns:[{position:[0,0],direction:[1,0]}]
}), /category="technical"/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},spawns:[],zones:[{type:"rubber",shape:{type:"circle",center:[0,0],radius:1}}]});
}, /unsupported canonical zone type rubber/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},spawns:[],zones:[{type:"death",delta:5,
            shape:{type:"circle",center:[0,0],radius:1}}]});
}, /death zone does not support field delta/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},spawns:[{position:[0,0],direction:[0,0]}],zones:[]});
}, /needs a nonzero direction vector/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},widht:4,spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /map document\.widht is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{extra:"lost"},spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /metadata\.extra is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},spawns:[{position:[0,0],direction:[1,0],angle:0}],zones:[]});
}, /spawns\[0\]\.angle is not a recognized canonical field/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{tags:["racing"],category:"race"},
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /cannot be combined/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{author_password_hash:"plaintext"},
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /author_password_hash is invalid/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},axes:[[1,0],[0,0]],
        spawns:[{position:[0,0],direction:[1,0]}],zones:[]});
}, /axis 1 must be a finite nonzero direction vector/i);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},levels:{count:2},spawns:[],zones:[],
        ramps:[{from_level:0,to_level:1,points:[[0,0],[10,0]]}]});
}, /needs a positive width/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({format:"arma-racing-map",format_version:1,
        metadata:{},spawns:[],ramps:[],zones:[
            {type:"health",shape:{type:"circle",center:[0,0],radius:1}}
        ]});
}, /health zone needs delta/);
const teleportDefaultsXml = context.armamap_toCompatibilityXml({
    format:"arma-racing-map",format_version:1,metadata:{},levels:{count:3},
    spawns:[],ramps:[],zones:[{type:"teleport",level:2,destination:[4,5],
        shape:{type:"circle",center:[0,0],radius:1}}]
});
assert.match(teleportDefaultsXml, /destination_level="2"/);
assert.doesNotMatch(teleportDefaultsXml, /\bxdir=|\bydir=|\bdirection=/);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"arma-racing-map",format_version:1,metadata:{},spawns:[],ramps:[],
        zones:[{type:"teleport",destination:[4,5],direction:[0,0],
            shape:{type:"circle",center:[0,0],radius:1}}]
    });
}, /teleport direction must be a finite nonzero direction vector/i);
assert.throws(function() {
    context.armamap_toCompatibilityXml({
        format:"arma-racing-map",format_version:1,metadata:{},spawns:[],ramps:[],
        zones:[{type:"teleport",destination:[4,5],direction:[Infinity,0],
            shape:{type:"circle",center:[0,0],radius:1}}]
    });
}, /teleport direction must be a finite nonzero direction vector/i);
assert.match(context.armamap_toCompatibilityXml({
    format:"arma-racing-map",format_version:1,metadata:{},spawns:[],ramps:[],
    zones:[{type:"teleport",destination:[4,5],direction:[0,2],
        shape:{type:"circle",center:[0,0],radius:1}}]
}), /xdir="0" ydir="2"/);

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
        format:"arma-racing-map", format_version:1, metadata:{},
        levels:{count:1}, spawns:[], ramps:[], zones:[{
            type:"death", shape:{type:"circle",center:[0,0],radius:1},
            movement:{speed:0,rotation:0,mode:"circular",spawn_at_vertices:false,
                path:[[0,0],[10,0]]}
        }]
    });
}, /speed must be greater than zero/);
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

controls["#symmetry-x-toggle"].checked = true;
controls["#dCheckpointAutoIncrement"].checked = false;
controls["#dCheckpointOrder"].value = "2";
context.zoneTool_resetPlacement();
setMapCursor(10, 4); context.zoneTool_complete();
setMapCursor(12, 4); context.zoneTool_complete();
assert.strictEqual(context.aamap_objects.length, 3);
const symmetricCheckpoints = context.aamap_objects.filter(zone => zone.option === 2);
assert.deepStrictEqual(symmetricCheckpoints.map(zone => zone.x).sort((a, b) => a - b), [-10, 10]);
assert.strictEqual(controls["#dCheckpointOrder"].value, "2");
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 1);
context.aamap_redo();
assert.strictEqual(context.aamap_objects.length, 3);

// Every editable geometry type uses its object centre to decide whether a
// selected symmetry line should create a clone.
const axisCenteredSpawn = new context.Spawn();
axisCenteredSpawn.x = 0; axisCenteredSpawn.y = 4;
const axisCenteredWall = new context.Wall();
axisCenteredWall.points = [{x:-3,y:4}, {x:1,y:4}, {x:2,y:4}];
const axisCenteredFloor = new context.Floor(1);
axisCenteredFloor.points = [{x:-3,y:3}, {x:1,y:3}, {x:2,y:6}];
const axisCenteredRamp = new context.Ramp(
    {x:-2,y:2}, {x:2,y:2}, {x:-1,y:6}, {x:1,y:6}, 0, 1);
const axisCenteredZone = new context.Zone(0, 4, 2, 0, 0, 0, {
    zoneName:"death", shapeType:"circle", options:{}
});
const axisCenteredObjects = [axisCenteredSpawn, axisCenteredWall,
    axisCenteredFloor, axisCenteredRamp, axisCenteredZone];
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = false;
axisCenteredObjects.forEach(function(object) {
    assert.deepStrictEqual(plain(context.aamap_symmetryObjectCenter(object)), {x:0,y:4});
    assert.strictEqual(context.aamap_symmetryShouldSkipClone(object, {x:-1,y:1}), true);
    assert.strictEqual(context.aamap_symmetryShouldSkipClone(object, {x:1,y:-1}), false);
    const group = context.aamap_addWithSymmetry(object);
    assert.strictEqual(group.length, 1);
    context.aamap_removeObjectGroup(group);
    object.move(3, -4);
});

controls["#symmetry-x-toggle"].checked = false;
controls["#symmetry-y-toggle"].checked = true;
axisCenteredObjects.forEach(function(object) {
    assert.deepStrictEqual(plain(context.aamap_symmetryObjectCenter(object)), {x:3,y:0});
    assert.strictEqual(context.aamap_symmetryShouldSkipClone(object, {x:-1,y:1}), false);
    assert.strictEqual(context.aamap_symmetryShouldSkipClone(object, {x:1,y:-1}), true);
    const group = context.aamap_addWithSymmetry(object);
    assert.strictEqual(group.length, 1);
    context.aamap_removeObjectGroup(group);
});

// With both lines selected, a source centred on one line still reflects over
// the other line, while a source at the origin remains a single object.
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = true;
function symmetrySpawn(x, y) {
    const spawn = new context.Spawn();
    spawn.x = x; spawn.y = y;
    return spawn;
}
const centeredOnXGroup = context.aamap_addWithSymmetry(symmetrySpawn(0, 5));
assert.deepStrictEqual(plain(centeredOnXGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[1] - b[1])), [[0,-5], [0,5]]);
context.aamap_removeObjectGroup(centeredOnXGroup);
const centeredOnYGroup = context.aamap_addWithSymmetry(symmetrySpawn(5, 0));
assert.deepStrictEqual(plain(centeredOnYGroup.map(object => [object.x, object.y])
    .sort((a, b) => a[0] - b[0])), [[-5,0], [5,0]]);
context.aamap_removeObjectGroup(centeredOnYGroup);
const centeredOnBothGroup = context.aamap_addWithSymmetry(symmetrySpawn(0, 0));
assert.strictEqual(centeredOnBothGroup.length, 1);
context.aamap_removeObjectGroup(centeredOnBothGroup);

controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = false;
const mirroredSource = symmetricCheckpoints.find(zone => zone.x === 10);
const mirroredMove = context.aamap_symmetryMovePlan([mirroredSource], 2, 3);
assert.deepStrictEqual(plain(mirroredMove.entries.map(entry =>
    [entry.object.x, entry.dx, entry.dy]).sort((a, b) => a[0] - b[0])), [
    [-10, -2, 3], [10, 2, 3]
]);
assert.strictEqual(context.aamap_symmetryExpandObjectGroups([mirroredSource]).length, 2);
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
assert.strictEqual(context.aamap_setActiveLevel(1), true);
setMapCursor(10, 10); context.zoneTool_complete();
setMapCursor(14, 10); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-path");
assert.strictEqual(context.aamap_activeLevel, 0);
assert.strictEqual(context.zoneTool_pendingZone.level, 0);
assert.strictEqual(context.zoneTool_pendingZone.options.destination_level, 1);
assert.deepStrictEqual(plain(context.zoneTool_points), [{x:2,y:2}]);
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
    rotationSpeed:45, movementMode:"ping_pong", spawnAtVertices:true,
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
    "3D preview vertex copies are moving instances, not stationary geometry");

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
controls["#dZoneSpawnAtVertices"].checked = true;
setMapCursor(2, 3); context.zoneTool_complete();
setMapCursor(6, 3); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_stage, "movement-path");
assert.ok(context.zoneTool_pendingZone);
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs["stroke-dasharray"], "--");
assert.strictEqual(context.zoneTool_pendingZone.obj.attrs["fill-opacity"], 0.16);
controls["#dZoneMovementSpeed"].value = "27";
controls["#dZoneRotationSpeed"].value = "45";
controls["#dZoneMovementMode"].value = "instant";
controls["#dZoneSpawnAtVertices"].checked = false;
setMapCursor(12, 3); context.zoneTool_complete();
assert.strictEqual(context.zoneTool_finishMovementPath(), true);
assert.strictEqual(context.aamap_objects.length, 1);
assert.deepStrictEqual(plain(context.aamap_objects[0].movementPath), [{x:2,y:3},{x:12,y:3}]);
assert.strictEqual(context.aamap_objects[0].movementSpeed, 27);
assert.strictEqual(context.aamap_objects[0].rotationSpeed, 0,
    "Circular zones do not expose or retain a meaningless rotation speed");
assert.strictEqual(context.aamap_objects[0].movementMode, "instant");
assert.strictEqual(context.aamap_objects[0].spawnAtVertices, false);
assert.match(context.aamap_objects[0].getXML(), /movement_speed="27"/);
assert.match(context.aamap_objects[0].getXML(), /rotation_speed="0"/);
context.aamap_undo();
assert.strictEqual(context.aamap_objects.length, 0);

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

console.log("Vectron Arma Racing core tests passed.");
