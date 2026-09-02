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
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.wallTool_axisGuideStyle())),
    {stroke:"#22c55e", "stroke-width":0.5, "stroke-dasharray":"--", opacity:0.28},
    "8-axis alignment guides retain subtle defaults"
);
context.config_wallAxisGuideColor = "#123456";
context.config_wallAxisGuideThickness = 2.4;
context.config_wallAxisGuideOpacity = 0.63;
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.wallTool_axisGuideStyle())),
    {stroke:"#123456", "stroke-width":2.4, "stroke-dasharray":"--", opacity:0.63},
    "Saved guide appearance settings override every tunable attribute"
);

const configSource = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
assert.match(configSource, /label: 'Wall alignment guides'/);
assert.match(configSource, /_config_get\('wallAxisGuideColor'\)/);
assert.match(configSource, /_config_get\('wallAxisGuideThickness'\)/);
assert.match(configSource, /_config_get\('wallAxisGuideOpacity'\)/);
assert.match(configSource, /opacityInp\.min = '1'/);
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(indexSource, /js\/config\.js\?v=20260902-guide-settings-1/);

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
