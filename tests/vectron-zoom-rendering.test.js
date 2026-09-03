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

const context = vm.createContext({});
vm.runInContext(helperMatch[0], context, {filename:"js/eventHandler.js"});

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
assert.strictEqual(renderCount, 1, "The target zoom renders on the animation frame");
assert.strictEqual(schedule(), true, "The following frame can be scheduled normally");
assert.strictEqual(frames.length, 1);

const wheelStart = eventSource.indexOf('$("#canvas_container")[0].onwheel=');
const wheelEnd = eventSource.indexOf("\n\n    $(function()", wheelStart);
assert.ok(wheelStart >= 0 && wheelEnd > wheelStart, "The wheel handler is present");
const wheelSource = eventSource.slice(wheelStart, wheelEnd);
assert.match(wheelSource, /scheduleZoomRender\(\)/,
    "Wheel zoom requests a frame-coalesced real render");
assert.doesNotMatch(wheelSource, /style\.transform|transformOrigin|cssScale/,
    "Wheel zoom never scales the SVG's parent DOM node");

console.log("Vectron zoom rendering tests passed.");
