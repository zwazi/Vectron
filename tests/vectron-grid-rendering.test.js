"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const aamapSource = fs.readFileSync(path.join(root, "js/aamap.js"), "utf8");
const context = vm.createContext({
    console,
    Math,
    Number,
    isFinite,
    window: {devicePixelRatio: 2}
});

vm.runInContext(aamapSource, context, {filename:"js/aamap.js"});

assert.strictEqual(
    context.aamap_deviceAlignedStrokeCoordinate(10.2, 0, 1, 1),
    10.5,
    "An odd one-device-pixel stroke is centered on a device pixel"
);
assert.strictEqual(
    context.aamap_deviceAlignedStrokeCoordinate(10.2, 0, 2, 1),
    10,
    "An even two-device-pixel stroke is centered between device pixels"
);

const vertical = context.aamap_alignGridLineToDevicePixels(
    {x1:10.2, y1:0, x2:10.2, y2:100}, 1, 1, 0, 0
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vertical)),
    {x1:10.5, y1:0, x2:10.5, y2:100});
const horizontal = context.aamap_alignGridLineToDevicePixels(
    {x1:0, y1:20.2, x2:100, y2:20.2}, 1, 1, 0, 0
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(horizontal)),
    {x1:0, y1:20.5, x2:100, y2:20.5});
const diagonalInput = {x1:0.2, y1:1.3, x2:40.7, y2:42.8};
const diagonal = context.aamap_alignGridLineToDevicePixels(
    diagonalInput, 1, 1, 0, 0
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(diagonal)), diagonalInput,
    "Diagonal geometry remains exact and is antialiased by the browser");

const rendered = [];
context.vectron_screen = {
    path(commands) {
        const attributes = {};
        const nodeAttributes = {};
        const result = {
            commands,
            attributes,
            nodeAttributes,
            node: {
                setAttribute(name, value) { nodeAttributes[name] = value; }
            },
            attr(values) {
                Object.assign(attributes, values);
                return result;
            }
        };
        rendered.push(result);
        return result;
    }
};
const target = [];
target.push = Array.prototype.push;
context.aamap_renderGridLines(target, [
    {x1:1.2, y1:0, x2:1.2, y2:100},
    {x1:2.2, y1:0, x2:2.2, y2:100}
], "#1a1a1a", 1, 1, 0, 0);

assert.strictEqual(rendered.length, 2,
    "Grid lines render as independent SVG primitives, not compound subpaths");
assert.strictEqual(target.length, 2);
rendered.forEach(line => {
    assert.strictEqual(line.attributes.stroke, "#1a1a1a");
    assert.strictEqual(line.attributes["stroke-width"], 1);
    assert.strictEqual(line.nodeAttributes["shape-rendering"], "geometricPrecision");
    assert.strictEqual(line.nodeAttributes["vector-effect"], "non-scaling-stroke");
});

rendered.length = 0;
context.vectron_width = 1394;
context.vectron_height = 658;
context.vectron_zoom = 1;
context.vectron_panX = 0;
context.vectron_panY = 0;
context.vectron_grid_visible = true;
context.vectron_grid_spacing = 16;
context.vectron_grid_render_spacing = 16;
context.vectron_grid_render_locked = false;
context.GRID_LAYOUT_EPSILON = 1e-9;
context.config_autoAdjustGridSpacing = false;
context.config_gridLayout = "square";
context.config_isDark = true;
context.config_gridNarrowColor = "";
context.config_gridTenthColor = "";
context.config_gridAxisXColor = "";
context.config_gridAxisYColor = "";
context.config_gridNarrowThickness = 0;
context.config_gridTenthThickness = 0;
context.config_gridAxisXThickness = 0;
context.config_gridAxisYThickness = 0;
context.aamap_grid = null;
context.gridLayout_getLineFamilies = (_layout, spacing) => [
    {angle:0, spacing},
    {angle:Math.PI / 2, spacing}
];
context.vectron_screen.canvas = {
    getBoundingClientRect() { return {left:0, top:0}; }
};
context.vectron_screen.set = () => {
    const set = [];
    set.remove = () => {};
    return set;
};
context.aamap_drawGrid();

assert.ok(rendered.length > 100 && rendered.length < 150,
    "A screenshot-sized square grid has a bounded number of independent lines");
rendered.forEach(line => {
    const coordinates = line.commands.filter(value => typeof value === "number");
    assert.ok(coordinates.every(value => value >= 0 && value <= 1394),
        "Every grid primitive is clipped to the visible SVG bounds");
});

assert.doesNotMatch(aamapSource, /shapeRendering\s*=\s*["']crispedges/i,
    "The grid must not opt into Firefox's lossy crispEdges snapping path");
assert.match(aamapSource, /var viewportLeft = 0;/,
    "Grid paths are clipped to the visible viewport instead of oversized bounds");

const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(indexSource, /js\/aamap\.js\?v=20260903-firefox-grid-1/);
assert.match(indexSource, /targetVersion = 1\.117/);

console.log("Vectron grid rendering tests passed.");
