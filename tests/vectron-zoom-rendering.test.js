"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const eventSource = fs.readFileSync(path.join(root, "js/eventHandler.js"), "utf8");
const helperMatch = eventSource.match(
    /function eventHandler_createFrameScheduler\(requestFrame, render\) \{[\s\S]*?\n\}/
);
assert.ok(helperMatch, "The animation-frame render scheduler is independently testable");
const viewBoxMatch = eventSource.match(
    /function eventHandler_zoomPreviewViewBox\(width, height, startZoom, currentZoom, anchorX, anchorY\) \{[\s\S]*?\n\}/
);
const applyViewBoxMatch = eventSource.match(
    /function eventHandler_applySvgViewBox\(svg, viewBox\) \{[\s\S]*?\n\}/
);
assert.ok(viewBoxMatch && applyViewBoxMatch,
    "The native SVG zoom preview helpers are independently testable");

const context = vm.createContext({});
vm.runInContext(
    [helperMatch[0], viewBoxMatch[0], applyViewBoxMatch[0]].join("\n"),
    context,
    {filename:"js/eventHandler.js"}
);

const frames = [];
let renderCount = 0;
const schedule = context.eventHandler_createFrameScheduler(
    callback => frames.push(callback),
    () => { renderCount += 1; }
);

assert.strictEqual(schedule(), true, "The first wheel event schedules a frame");
assert.strictEqual(schedule(), false, "A second wheel event reuses the pending frame");
assert.strictEqual(schedule(), false, "A wheel burst remains coalesced");
assert.strictEqual(frames.length, 1);
assert.strictEqual(renderCount, 0);

frames.shift()();
assert.strictEqual(renderCount, 1, "The target zoom preview updates on the animation frame");
assert.strictEqual(schedule(), true, "The following frame can be scheduled normally");
assert.strictEqual(frames.length, 1);

const zoomIn = context.eventHandler_zoomPreviewViewBox(1000, 800, 1, 2, 250, 200);
assert.deepStrictEqual(JSON.parse(JSON.stringify(zoomIn)),
    {x:125, y:100, width:500, height:400});
const zoomOut = context.eventHandler_zoomPreviewViewBox(1000, 800, 1, 0.5, 250, 200);
assert.deepStrictEqual(JSON.parse(JSON.stringify(zoomOut)),
    {x:-250, y:-200, width:2000, height:1600});
function displayedCoordinate(local, start, extent, viewportExtent) {
    return (local - start) * viewportExtent / extent;
}
assert.strictEqual(displayedCoordinate(250, zoomIn.x, zoomIn.width, 1000), 250,
    "Zooming in keeps the pointer anchor fixed");
assert.strictEqual(displayedCoordinate(250, zoomOut.x, zoomOut.width, 1000), 250,
    "Zooming out keeps the pointer anchor fixed");

const width = 1000;
const height = 800;
const startZoom = 1.5;
const currentZoom = 0.9;
const anchorX = 730;
const anchorY = 180;
const startPanX = 12;
const startPanY = -7;
const currentPanX = startPanX + (anchorX - width / 2) *
    (1 / currentZoom - 1 / startZoom);
const currentPanY = startPanY - (anchorY - height / 2) *
    (1 / currentZoom - 1 / startZoom);
const mapPoint = {x:83, y:-41};
const baselinePoint = {
    x:width / 2 + (mapPoint.x + startPanX) * startZoom,
    y:height / 2 - (mapPoint.y + startPanY) * startZoom
};
const exactTarget = {
    x:width / 2 + (mapPoint.x + currentPanX) * currentZoom,
    y:height / 2 - (mapPoint.y + currentPanY) * currentZoom
};
const arbitraryPreview = context.eventHandler_zoomPreviewViewBox(
    width, height, startZoom, currentZoom, anchorX, anchorY
);
assert.ok(Math.abs(displayedCoordinate(
    baselinePoint.x, arbitraryPreview.x, arbitraryPreview.width, width
) - exactTarget.x) < 1e-9,
"Native viewBox preview matches the exact target X transform");
assert.ok(Math.abs(displayedCoordinate(
    baselinePoint.y, arbitraryPreview.y, arbitraryPreview.height, height
) - exactTarget.y) < 1e-9,
"Native viewBox preview matches the exact target Y transform");

const svgAttributes = {};
assert.strictEqual(context.eventHandler_applySvgViewBox({
    setAttribute(name, value) { svgAttributes[name] = value; }
}, {x:1 / 3, y:-0, width:500, height:400}), true);
assert.strictEqual(svgAttributes.viewBox, "0.333333 0 500 400");
assert.strictEqual(svgAttributes.preserveAspectRatio, "xMinYMin");

const wheelStart = eventSource.indexOf('$("#canvas_container")[0].onwheel=');
const wheelEnd = eventSource.indexOf("\n\n    $(function()", wheelStart);
assert.ok(wheelStart >= 0 && wheelEnd > wheelStart, "The wheel handler is present");
const wheelSource = eventSource.slice(wheelStart, wheelEnd);
const zoomSetupStart = eventSource.lastIndexOf("var prev_vectron_zoom", wheelStart);
const zoomSource = eventSource.slice(zoomSetupStart, wheelEnd);
assert.match(eventSource, /if\(zoomPreviewActive\) return;/,
    "Cursor and active-tool SVG reconstruction pauses during a zoom preview");
assert.match(wheelSource, /scheduleZoomPreview\(\)/,
    "Wheel zoom requests a frame-coalesced native SVG preview");
assert.match(zoomSource, /eventHandler_applySvgViewBox/);
assert.doesNotMatch(zoomSource, /style\.transform|transformOrigin|cssScale/,
    "Wheel zoom never scales the SVG's parent DOM node");
assert.strictEqual((zoomSource.match(/vectron_render\(\)/g) || []).length, 1,
    "A wheel gesture performs one exact redraw after it settles");
const previewCallback = zoomSource.slice(
    zoomSource.indexOf("var scheduleZoomPreview"),
    zoomSource.indexOf('if(!("onwheel"')
);
assert.doesNotMatch(previewCallback, /vectron_render\(\)/,
    "Animation frames never rebuild the full scene");
assert.doesNotMatch(previewCallback, /vectron_screen\.setViewBox/,
    "Animation frames bypass Raphaël's per-element setViewBox updates");
assert.match(previewCallback, /vectron_write_zoom_preview_info\(\)/,
    "Animation frames update only the changing zoom and anchor readouts");
assert.doesNotMatch(previewCallback, /vectron_write_info\(\)/,
    "Animation frames do not rebuild unrelated toolbar control state");

const cssSource = fs.readFileSync(path.join(root, "css/vectron.css"), "utf8");
assert.match(cssSource, /#canvas_container svg path,[\s\S]*vector-effect: non-scaling-stroke;/,
    "Strokes retain their screen-space width during native SVG previews");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(indexSource, /js\/eventHandler\.js\?v=20260903-smooth-svg-zoom-1/);
assert.match(indexSource, /css\/vectron\.css\?v=20260903-smooth-svg-zoom-1/);

console.log("Vectron zoom rendering tests passed.");
