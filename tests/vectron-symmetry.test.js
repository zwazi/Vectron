"use strict";

/*
 * Symmetry tooling regression tests.
 *
 * Run with: node tests/vectron-symmetry.test.js
 *
 * The editor is plain browser globals, so the sources are evaluated inside one
 * vm context against small jQuery/Raphael stubs. That keeps the geometry and
 * history logic under test without needing a real DOM.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const indexSource = read("index.html");
const eventSource = read("js/eventHandler.js");
const cssSource = read("css/vectron.css");
const darkCssSource = read("css/vectron-dark.css");

// ---------------------------------------------------------------- markup ----

[
    "symmetry-menu-toggle", "symmetry-summary", "symmetry-menu",
    "symmetry-x-toggle", "symmetry-y-toggle", "symmetry-origin-toggle",
    "symmetry-custom-x-toggle", "symmetry-custom-y-toggle",
    "symmetry-custom-point-toggle", "symmetry-custom-x-value",
    "symmetry-custom-y-value", "symmetry-custom-point-x",
    "symmetry-custom-point-y", "symmetry-check-toggle"
].forEach(id => assert.ok(indexSource.includes('id="' + id + '"'),
    "index.html is missing #" + id));
assert.ok(indexSource.includes('class="info-section info-symmetry-section"'),
    "The symmetry picker lives in the info bar");
assert.ok(cssSource.includes("#symmetry-menu {") && cssSource.includes(".symmetry-menu-row {"),
    "vectron.css styles the symmetry menu");
assert.ok(darkCssSource.includes("#symmetry-menu {"),
    "vectron-dark.css restyles the symmetry menu for the dark theme");
assert.ok(eventSource.includes("eventHandler_updateSymmetry"),
    "eventHandler.js wires the symmetry controls");
assert.strictEqual((indexSource.match(/id="dCheckpointOrder"/g) || []).length, 1,
    "Vectron exposes one authoritative checkpoint ID field");
assert.ok(!indexSource.includes('id="zone-selected-checkpoint-id"'),
    "Selected checkpoints do not get a second conflicting ID field");
assert.ok(indexSource.includes('id="zone-private-per-player"'),
    "Zone placement exposes the per-player control");
assert.ok(indexSource.includes('id="zone-selected-private"'),
    "Selected zones expose the per-player control");

// The Armaracing format must not come back with the symmetry tooling.
["armaracing", "xml_game_mode", "map_game_mode", "ShapeRectangle", "ShapePolygon"]
    .forEach(token => {
        const offenders = [];
        const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).forEach(entry => {
            const full = path.join(dir, entry.name);
            if(entry.isDirectory()) { if(entry.name !== "libs") walk(full); return; }
            if(!/\.(js|html|css|md)$/.test(entry.name)) return;
            if(path.relative(root, full).startsWith("tests" + path.sep)) return;
            if(fs.readFileSync(full, "utf8").toLowerCase().includes(token.toLowerCase())) {
                offenders.push(path.relative(root, full));
            }
        });
        walk(root);
        assert.deepStrictEqual(offenders, [],
            "The Armaracing format is gone: found \"" + token + "\"");
    });

// -------------------------------------------------------------- harness -----

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
        path(value) { const result = element(); result.path = value; return result; },
        circle(x, y, radius) {
            const result = element();
            result.attrs = {cx:x, cy:y, r:radius};
            return result;
        },
        rect() { return element(); },
        text() { return element(); },
        set() {
            const set = element();
            set.items = [];
            set.push = function(...items) { this.items.push(...items); return this; };
            return set;
        }
    };
}

const controls = {
    "#symmetry-x-toggle": {checked:false, value:""},
    "#symmetry-y-toggle": {checked:false, value:""},
    "#symmetry-origin-toggle": {checked:false, value:""},
    "#symmetry-custom-x-toggle": {checked:false, value:""},
    "#symmetry-custom-y-toggle": {checked:false, value:""},
    "#symmetry-custom-point-toggle": {checked:false, value:""},
    "#symmetry-custom-x-value": {value:"0"},
    "#symmetry-custom-y-value": {value:"0"},
    "#symmetry-custom-point-x": {value:"0"},
    "#symmetry-custom-point-y": {value:"0"},
    "#symmetry-check-toggle": {checked:false, value:""},
    "#dRubberVal": {value:"2"},
    "#dCheckpointOrder": {value:"1"},
    "#dCheckpointMode": {value:"2"},
    "#zone-private-per-player": {checked:false, value:""},
    "#zone-selected-private": {checked:false, value:""}
};

function jquery(selector) {
    const key = typeof selector === "string" ? selector : "__object";
    const control = controls[key] || (controls[key] = {value:"", data:{}, attrs:{}});
    control.data = control.data || {};
    control.attrs = control.attrs || {};
    const api = {
        0:control, length:1,
        val(value) { if(value === undefined) return control.value; control.value = String(value); return api; },
        text(value) { if(value !== undefined) control.text = String(value); return api; },
        data(name, value) { if(value === undefined) return control.data[name]; control.data[name] = value; return api; },
        prop(name, value) { if(value === undefined) return control[name]; control[name] = value; return api; },
        attr(name, value) { if(value === undefined) return control.attrs[name]; control.attrs[name] = value; return api; },
        toggle() { return api; }, show() { return api; }, hide() { return api; },
        toggleClass() { return api; }, addClass() { return api; }, removeClass() { return api; },
        find() { return api; }, first() { return api; },
        is(query) { return query === ":checked" ? !!control.checked : false; }
    };
    return api;
}

const context = vm.createContext({
    console, Math, Number, String, Array, Object, JSON, isFinite, isNaN,
    $:jquery, vectron_screen:paper(), vectron_objectID:0,
    vectron_width:800, vectron_height:600, vectron_zoom:1,
    vectron_panX:0, vectron_panY:0, vectron_grid_spacing:8,
    vectron_currentTool:"", vectron_toolActive:false,
    cursor_realX:400, cursor_realY:300, cursor_neverSnappedX:400,
    cursor_neverSnappedY:300, cursor_snap:false, config_isDark:false,
    gui_writeLog() {}, gui_toast() {}, vectron_render() {},
    actionHistory_update() {}, alert() {}, setTimeout
});
context.window = context;

function load(relative) {
    vm.runInContext(read(relative), context, {filename:relative});
}

load("js/AamapObjects/Spawn.js");
load("js/AamapObjects/Wall.js");
load("js/AamapObjects/Zone.js");
load("js/AamapTools/wallTool.js");
load("js/AamapTools/zoneTool.js");
load("js/aamap.js");
load("js/AamapTools/selectTool.js");

const {Wall, WallPoint, Spawn, Zone} = context;

function reset() {
    context.aamap_objects = [];
    context.aamap_undoStack = [];
    context.aamap_redoStack = [];
    context.selectTool_selectedObjs = [];
    Object.keys(controls).filter(key => key.startsWith("#symmetry"))
        .forEach(key => { controls[key].checked = false; });
    controls["#symmetry-custom-x-value"].value = "0";
    controls["#symmetry-custom-y-value"].value = "0";
    controls["#symmetry-custom-point-x"].value = "0";
    controls["#symmetry-custom-point-y"].value = "0";
    controls["#zone-private-per-player"].checked = false;
    controls["#zone-selected-private"].checked = false;
}

function wall(points, height) {
    const object = new Wall();
    object.height = height === undefined ? 4 : height;
    object.points = points.map(point => new WallPoint(point[0], point[1]));
    return object;
}

// Values built inside the vm context have foreign prototypes, so anything
// compared with deepStrictEqual is copied into a host array first.
const host = value => Array.from(value);
const positions = objects => host(objects).map(o => [o.x, o.y]).sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]);

// ------------------------------------------------------------ transforms ----

reset();
assert.strictEqual(context.aamap_symmetryEnabled(), false,
    "Symmetry is off until a line or point is chosen");
assert.strictEqual(context.aamap_symmetryCheckEnabled(), false);

controls["#symmetry-check-toggle"].checked = true;
assert.strictEqual(context.aamap_symmetryCheckEnabled(), false,
    "Check mode needs an actual axis before it does anything");
controls["#symmetry-check-toggle"].checked = false;

controls["#symmetry-x-toggle"].checked = true;
assert.deepStrictEqual(host(context.aamap_symmetryTransforms()).map(t => t.line), ["x=0"]);

controls["#symmetry-y-toggle"].checked = true;
assert.deepStrictEqual(host(context.aamap_symmetryTransforms()).map(t => t.line),
    ["x=0", "y=0", "origin"],
    "Two perpendicular mirrors imply the diagonal point reflection");
assert.deepStrictEqual(host(context.aamap_symmetryTransforms()).map(t => t.derived),
    [false, false, true],
    "The implied point reflection is marked derived so it draws no extra guide");

controls["#symmetry-origin-toggle"].checked = true;
assert.strictEqual(context.aamap_symmetryTransforms().length, 3,
    "Explicitly asking for the origin does not duplicate the derived transform");
assert.strictEqual(context.aamap_symmetryTransforms()[2].derived, false,
    "An explicit request promotes the derived transform to a real one");

reset();
controls["#symmetry-custom-x-toggle"].checked = true;
controls["#symmetry-custom-x-value"].value = "10";
const custom = context.aamap_symmetryTransforms()[0];
assert.strictEqual(custom.line, "x=10");
assert.deepStrictEqual(
    {...context.aamap_symmetryPoint({x:12, y:3}, custom)}, {x:8, y:3},
    "An off-origin mirror reflects across its own line");

// ---------------------------------------------------------------- clones ----

reset();
controls["#symmetry-x-toggle"].checked = true;
const mirrorX = context.aamap_symmetryTransforms()[0];

const clonedWall = context.aamap_symmetryClone(wall([[1, 2], [5, 6]], 7), mirrorX);
assert.deepStrictEqual(host(clonedWall.points).map(p => [p.x, p.y]), [[-1, 2], [-5, 6]]);
assert.strictEqual(clonedWall.height, 7, "Wall height survives the reflection");
assert.ok(clonedWall.points[0] instanceof WallPoint);

const sourceSpawn = new Spawn();
sourceSpawn.x = 3; sourceSpawn.y = 4;
sourceSpawn.xDir = 1; sourceSpawn.yDir = 0;
const clonedSpawn = context.aamap_symmetryClone(sourceSpawn, mirrorX);
assert.deepStrictEqual(
    [clonedSpawn.x, clonedSpawn.y, clonedSpawn.xDir, clonedSpawn.yDir],
    [-3, 4, -1, 0],
    "A mirrored spawn faces the mirrored direction, not the original one");
assert.strictEqual(clonedSpawn.guideObj, null,
    "Clones never inherit the placement guide of a spawn under construction");

const sourcePrivateZone = new Zone(6, -2, 9, 1, 5, 3);
sourcePrivateZone.privatePerPlayer = true;
const clonedZone = context.aamap_symmetryClone(sourcePrivateZone, mirrorX);
assert.deepStrictEqual(
    [clonedZone.x, clonedZone.y, clonedZone.radius, clonedZone.growth,
        clonedZone.type, clonedZone.option, clonedZone.privatePerPlayer],
    [-6, -2, 9, 1, 5, 3, true],
    "Per-player status survives symmetry cloning");

const checkpoint = new Zone(4, 8, 6, 0, 5, {checkpointId:3, legacyTime:"42.5"});
assert.match(checkpoint.getXML(), /<Checkpoint id="3" time="42\.5"\/>/,
    "Checkpoint time is silently preserved for imported legacy maps");

const absoluteTeleport = new Zone(5, 6, 7, 0, 6, {
    mode:"abs", destX:40, destY:-20, dirX:0, dirY:1, reloc:1.25
});
assert.match(absoluteTeleport.getXML(),
    /<Teleport destX="40" destY="-20" dirX="0" dirY="1" modes="abs" reloc="0"\/>/,
    "Absolute teleports discard entry-dependent exit compensation");
absoluteTeleport.move(2, 3);
assert.deepStrictEqual(
    [absoluteTeleport.x, absoluteTeleport.y,
        absoluteTeleport.zoneData.destX, absoluteTeleport.zoneData.destY],
    [7, 9, 42, -17],
    "Moving an absolute teleport also moves its destination");

const relativeTeleport = new Zone(5, 6, 7, 0, 6, {
    mode:"rel", destX:10, destY:-4, dirX:1, dirY:0, reloc:1
});
relativeTeleport.move(2, 3);
assert.deepStrictEqual(
    [relativeTeleport.x, relativeTeleport.y,
        relativeTeleport.zoneData.destX, relativeTeleport.zoneData.destY],
    [7, 9, 10, -4],
    "Moving a relative teleport leaves its destination offset unchanged");

const mirroredTeleport = context.aamap_symmetryClone(new Zone(6, 2, 4, 0, 6, {
    mode:"abs", destX:30, destY:8, dirX:1, dirY:0, reloc:1
}), mirrorX);
assert.deepStrictEqual(
    [mirroredTeleport.x, mirroredTeleport.y,
        mirroredTeleport.zoneData.destX, mirroredTeleport.zoneData.destY,
        mirroredTeleport.zoneData.dirX, mirroredTeleport.zoneData.dirY],
    [-6, 2, -30, 8, -1, 0],
    "Teleport destination and exit direction follow map symmetry");

const mirroredCycleTeleport = context.aamap_symmetryClone(new Zone(6, 2, 4, 0, 6, {
    mode:"cycle", destX:30, destY:8, dirX:0, dirY:0, reloc:1
}), mirrorX);
assert.deepStrictEqual(
    [mirroredCycleTeleport.zoneData.destX, mirroredCycleTeleport.zoneData.destY],
    [30, -8],
    "Mirroring reverses only the lateral component of a cycle-relative jump");

reset();
context.aamap_add(new Zone(4, 8, 6, 0, 5, {checkpointId:1, legacyTime:"19"}));
context.aamap_add(new Zone(10, 12, 5, 0, 6, {
    mode:"abs", destX:90, destY:25, dirX:0, dirY:0, reloc:1
}));
const specialXml = context.aamap_buildXml(
    "SpecialZones", "Tester", "maps", "1", "sty.dtd", 4,
    ["RACE_CHECKPOINT_REQUIRE_HIT 1", "SIZE_FACTOR 2"]
).xml;
assert.match(specialXml, /DOCTYPE Resource SYSTEM "map-0\.2\.9_styctap_v1\.5\.dtd"/,
    "Special zones select the compatible DTD at export");
assert.strictEqual((specialXml.match(/name="RACE_CHECKPOINT_REQUIRE_HIT"/g) || []).length, 1,
    "Checkpoint mode is emitted exactly once");
assert.match(specialXml, /name="RACE_CHECKPOINT_REQUIRE_HIT" value="1"/,
    "Unordered checkpoint mode survives export");
assert.match(specialXml, /<Checkpoint id="1" time="19"\/>/);
assert.match(specialXml, /<Teleport destX="90" destY="25" dirX="0" dirY="0" modes="abs" reloc="0"\/>/);

reset();
const globalDeath = new Zone(0, 0, 4, 0, 0, 0);
const privateWin = new Zone(10, 0, 5, 1, 1, 0);
privateWin.privatePerPlayer = true;
const privateRubber = new Zone(20, 0, 6, 0, 3, 2);
privateRubber.privatePerPlayer = true;
context.aamap_add(globalDeath);
context.aamap_add(wall([[0, 0], [1, 1]]));
context.aamap_add(privateWin);
context.aamap_add(privateRubber);
const privateXml = context.aamap_buildXml(
    "PrivateZones", "Tester", "maps", "1", "sty.dtd", 4,
    ["PLAYER_PRIVATE_ZONES_V1 99", "SIZE_FACTOR 2"]
).xml;
assert.match(privateXml, /DOCTYPE Resource SYSTEM "sty\.dtd"/,
    "Per-player status alone does not require a custom DTD");
assert.strictEqual((privateXml.match(/name="PLAYER_PRIVATE_ZONES_V1"/g) || []).length, 1,
    "Export replaces stale private-zone metadata instead of duplicating it");
assert.match(privateXml, /name="PLAYER_PRIVATE_ZONES_V1" value="2,3"/,
    "Only zones count toward the one-based private-zone ordinals");
assert.strictEqual((privateXml.match(/<Zone /g) || []).length, 3,
    "Private zones remain ordinary zone XML for stock-server fallback");

context.selectTool_selectedObjs = [globalDeath];
assert.doesNotThrow(() => context.zoneTool_syncSelectedProperties(),
    "Selecting an ordinary zone never reads teleport-only properties");
controls["#zone-selected-private"].checked = true;
context.zoneTool_applySelectedProperties();
assert.strictEqual(globalDeath.privatePerPlayer, true,
    "The selected-zone control applies to ordinary zone types");

context.xml_settings = ["SIZE_FACTOR 2", "RACE_CHECKPOINT_REQUIRE_HIT 2"];
context.zoneTool_setCheckpointMode("1");
assert.deepStrictEqual(
    Array.from(context.xml_settings),
    ["SIZE_FACTOR 2", "RACE_CHECKPOINT_REQUIRE_HIT 1"],
    "Changing the whole-map mode updates the settings used by export"
);

// ------------------------------------------------------------- placement ----

reset();
controls["#symmetry-x-toggle"].checked = true;
const placedZone = new Zone(10, 5, 3, 0, 0, 0);
const zoneGroup = context.aamap_addWithSymmetry(placedZone);
assert.strictEqual(zoneGroup.length, 2, "Placing one zone also places its mirror");
assert.strictEqual(context.aamap_objects.length, 2);
assert.deepStrictEqual(positions(context.aamap_objects), [[-10, 5], [10, 5]]);
assert.strictEqual(zoneGroup[0]._symmetryGroup, zoneGroup[1]._symmetryGroup,
    "Both halves share one group object");

reset();
controls["#symmetry-x-toggle"].checked = true;
const onAxis = context.aamap_addWithSymmetry(new Zone(0, 5, 3, 0, 0, 0));
assert.strictEqual(onAxis.length, 1,
    "A zone centred on the mirror is its own reflection and is not duplicated");
assert.strictEqual(context.aamap_objects.length, 1);

reset();
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-y-toggle"].checked = true;
context.aamap_addWithSymmetry(new Zone(4, 7, 1, 0, 0, 0));
assert.deepStrictEqual(positions(context.aamap_objects),
    [[-4, -7], [-4, 7], [4, -7], [4, 7]],
    "Two mirrors produce the full four-fold pattern");

// A wall centred on the mirror but asymmetric about it is still duplicated.
reset();
controls["#symmetry-x-toggle"].checked = true;
const asymmetric = context.aamap_addWithSymmetry(wall([[-4, 0], [4, 1]]));
assert.strictEqual(asymmetric.length, 2,
    "Sharing the mirror line does not make asymmetric geometry symmetric");

// A wall that is genuinely symmetric about the mirror is not duplicated,
// including when the reflection merely reverses its point order.
reset();
controls["#symmetry-x-toggle"].checked = true;
assert.strictEqual(context.aamap_addWithSymmetry(wall([[-4, 1], [0, 3], [4, 1]])).length, 1,
    "A wall whose reflection is itself reversed is recognised as the same wall");

assert.strictEqual(
    context.aamap_symmetryObjectKey(wall([[0, 0], [1, 1], [2, 0]])),
    context.aamap_symmetryObjectKey(wall([[2, 0], [1, 1], [0, 0]])),
    "Wall identity ignores the direction the author happened to draw in");
assert.notStrictEqual(
    context.aamap_symmetryObjectKey(wall([[0, 0], [1, 1]], 4)),
    context.aamap_symmetryObjectKey(wall([[0, 0], [1, 1]], 8)),
    "Wall identity still respects height");

// ------------------------------------------------------------------ move ----

reset();
controls["#symmetry-x-toggle"].checked = true;
const [primary, mirror] = context.aamap_addWithSymmetry(new Zone(10, 0, 2, 0, 0, 0));
const plan = context.aamap_symmetryMovePlan([primary], 3, 5);
plan.entries.forEach(entry => entry.object.move(entry.dx, entry.dy));
context.aamap_compactSymmetryMovePlan(plan);
assert.deepStrictEqual(positions([primary, mirror]), [[-13, 5], [13, 5]],
    "Dragging one half drags the other half the mirrored way");

context.aamap_restoreSymmetryMovePlanBefore(plan);
plan.entries.forEach(entry => entry.object.move(-entry.dx, -entry.dy));
assert.deepStrictEqual(positions(context.aamap_objects), [[-10, 0], [10, 0]],
    "Undo puts a mirrored move back exactly where it started");

plan.entries.forEach(entry => entry.object.move(entry.dx, entry.dy));
context.aamap_restoreSymmetryMovePlanAfter(plan);
assert.deepStrictEqual(positions(context.aamap_objects), [[-13, 5], [13, 5]],
    "Redo reapplies the mirrored move");

// Moving an on-axis object off the axis has to materialise the missing copy,
// and undo has to take it away again.
reset();
controls["#symmetry-x-toggle"].checked = true;
const centred = context.aamap_addWithSymmetry(new Zone(0, 0, 2, 0, 0, 0))[0];
assert.strictEqual(context.aamap_objects.length, 1);
const splitPlan = context.aamap_symmetryMovePlan([centred], 6, 0);
splitPlan.entries.forEach(entry => entry.object.move(entry.dx, entry.dy));
context.aamap_compactSymmetryMovePlan(splitPlan);
assert.deepStrictEqual(positions(context.aamap_objects), [[-6, 0], [6, 0]],
    "Dragging off the mirror line grows the missing reflected copy");

context.aamap_restoreSymmetryMovePlanBefore(splitPlan);
splitPlan.entries.forEach(entry => entry.object.move(-entry.dx, -entry.dy));
assert.strictEqual(context.aamap_objects.length, 1,
    "Undo removes the copy that the move created");
assert.deepStrictEqual(positions(context.aamap_objects), [[0, 0]]);

// The reverse: dragging two halves onto each other collapses them to one.
reset();
controls["#symmetry-x-toggle"].checked = true;
const pair = context.aamap_addWithSymmetry(new Zone(6, 0, 2, 0, 0, 0));
const mergePlan = context.aamap_symmetryMovePlan([pair[0]], -6, 0);
mergePlan.entries.forEach(entry => entry.object.move(entry.dx, entry.dy));
context.aamap_compactSymmetryMovePlan(mergePlan);
assert.strictEqual(context.aamap_objects.length, 1,
    "Two halves dragged onto the mirror line collapse into one object");
context.aamap_restoreSymmetryMovePlanBefore(mergePlan);
mergePlan.entries.forEach(entry => entry.object.move(-entry.dx, -entry.dy));
assert.deepStrictEqual(positions(context.aamap_objects), [[-6, 0], [6, 0]],
    "Undo restores the half that the merge removed");

// With symmetry off the plan is a plain per-object move.
reset();
const plainZone = new Zone(1, 1, 1, 0, 0, 0);
context.aamap_add(plainZone);
const plainPlan = context.aamap_symmetryMovePlan([plainZone], 2, 2);
assert.deepStrictEqual(host(plainPlan.entries).map(e => [e.dx, e.dy]), [[2, 2]]);
assert.strictEqual(plainPlan.created.length, 0);

// ---------------------------------------------------------------- delete ----

reset();
controls["#symmetry-x-toggle"].checked = true;
const deletable = context.aamap_addWithSymmetry(new Zone(8, 0, 2, 0, 0, 0));
context.selectTool_selectedObjs = [deletable[0]];
assert.strictEqual(
    context.aamap_symmetryExpandObjectGroups(context.selectTool_selectedObjs).length, 2,
    "Deleting one half of a symmetric pair deletes both");
context.selectTool_delete();
assert.strictEqual(context.aamap_objects.length, 0);
context.aamap_undoStack.pop().undo();
assert.strictEqual(context.aamap_objects.length, 2, "Undo brings both halves back");

// With symmetry disabled the group is no longer expanded, so an author can
// break a pair apart deliberately.
reset();
controls["#symmetry-x-toggle"].checked = true;
const breakable = context.aamap_addWithSymmetry(new Zone(8, 0, 2, 0, 0, 0));
controls["#symmetry-x-toggle"].checked = false;
assert.deepStrictEqual(host(context.aamap_symmetryExpandObjectGroups([breakable[0]])),
    [breakable[0]], "Turning symmetry off unlinks existing pairs");

// ----------------------------------------------------------------- batch ----

reset();
controls["#symmetry-x-toggle"].checked = true;
const pastedA = new Zone(5, 1, 1, 0, 0, 0);
const pastedB = new Zone(-5, 1, 1, 0, 0, 0);
context.aamap_add(pastedA);
context.aamap_add(pastedB);
context.aamap_addSymmetryCopiesForExistingBatch([pastedA, pastedB]);
assert.strictEqual(context.aamap_objects.length, 2,
    "Pasting an already-mirrored pair does not generate two more copies");
assert.strictEqual(pastedA._symmetryGroup, pastedB._symmetryGroup,
    "Existing mirrored objects are adopted into one symmetry group");

reset();
controls["#symmetry-x-toggle"].checked = true;
const loneA = new Zone(5, 1, 1, 0, 0, 0);
const loneB = new Zone(5, 9, 1, 0, 0, 0);
context.aamap_add(loneA);
context.aamap_add(loneB);
context.aamap_addSymmetryCopiesForExistingBatch([loneA, loneB]);
assert.deepStrictEqual(positions(context.aamap_objects),
    [[-5, 1], [-5, 9], [5, 1], [5, 9]],
    "Unmatched pasted objects each get their own reflection");

// ----------------------------------------------------------- check guides ----

reset();
controls["#symmetry-x-toggle"].checked = true;
controls["#symmetry-check-toggle"].checked = true;
context.aamap_add(new Zone(20, 0, 2, 0, 0, 0));
context.aamap_renderSymmetryCheckCopies();
assert.strictEqual(context.aamap_symmetryCheckObjects.length, 1,
    "Check mode draws a throwaway reflection of each object");
assert.strictEqual(context.aamap_objects.length, 1,
    "Check mode never adds anything to the map itself");
const clip = context.aamap_symmetryCheckClipRect({x:-1, y:1});
assert.deepStrictEqual([clip.x, clip.width], [0, context.aamap_realX(0)],
    "A mirrored check copy is clipped to the far side of its axis");

context.aamap_drawSymmetryGuides();
assert.strictEqual(context.aamap_symmetryGuides.items.length, 1,
    "One chosen mirror draws one guide line");
controls["#symmetry-y-toggle"].checked = true;
context.aamap_drawSymmetryGuides();
assert.strictEqual(context.aamap_symmetryGuides.items.length, 2,
    "The derived point reflection does not draw a third guide");

// ---------------------------------------------------------------- reset -----

controls["#symmetry-summary"] = {value:"", text:"2 active"};
context.aamap_disableSymmetry();
assert.strictEqual(context.aamap_symmetryEnabled(), false,
    "Importing a map clears the previous session's symmetry");
assert.strictEqual(controls["#symmetry-summary"].text, "Off");
assert.ok(read("js/xml.js").includes("aamap_disableSymmetry()"),
    "xml.js resets symmetry when a map is imported");

console.log("All symmetry tests passed.");
