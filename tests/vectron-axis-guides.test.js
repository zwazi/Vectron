"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({Math});
context.window = context;
const wallSource = fs.readFileSync(path.join(root, "js/AamapTools/wallTool.js"), "utf8");
vm.runInContext(
    wallSource,
    context,
    {filename:"js/AamapTools/wallTool.js"}
);
assert.match(wallSource, /"stroke-dasharray": "--"/,
    "8-axis alignment guides use a dashed stroke");

const segments = context.wallTool_axisGuideSegments(
    [{x:50, y:40}, {x:20, y:20}],
    100,
    80
);
assert.strictEqual(segments.length, 8,
    "Four 8-axis line families are drawn through both the previous point and cursor");
segments.forEach(segment => {
    [segment.x1, segment.x2].forEach(value => assert.ok(value >= 0 && value <= 100));
    [segment.y1, segment.y2].forEach(value => assert.ok(value >= 0 && value <= 80));
    assert.ok(
        segment.x1 === 0 || segment.x1 === 100 || segment.y1 === 0 || segment.y1 === 80,
        "First endpoint is clipped to the canvas"
    );
    assert.ok(
        segment.x2 === 0 || segment.x2 === 100 || segment.y2 === 0 || segment.y2 === 80,
        "Second endpoint is clipped to the canvas"
    );
});
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.wallTool_clipGuideLine(
        {x:50, y:40}, {x:1, y:1}, 100, 80
    ))),
    {x1:10, y1:0, x2:90, y2:80},
    "Diagonal guides remain exactly 45 degrees"
);

const eventSource = fs.readFileSync(path.join(root, "js/eventHandler.js"), "utf8");
const predicate = eventSource.match(
    /function eventHandler_shouldSuggestTriangleGrid\(axes, layout\) \{[\s\S]*?\n\}/
);
assert.ok(predicate, "Triangle-grid suggestion predicate is independently testable");
const triangleContext = {result:null, Number};
vm.runInNewContext(`${predicate[0]}\nresult = [
    eventHandler_shouldSuggestTriangleGrid(3, "square"),
    eventHandler_shouldSuggestTriangleGrid(6, "diamond"),
    eventHandler_shouldSuggestTriangleGrid(3, "triangle"),
    eventHandler_shouldSuggestTriangleGrid(8, "square")
];`, triangleContext);
assert.deepStrictEqual(Array.from(triangleContext.result), [true, true, false, false]);

console.log("Vectron axis guide tests passed.");
