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
    "Grid lines remain independent SVG primitives for reliable Firefox rendering");
assert.strictEqual(target.length, 2);
rendered.forEach(line => {
    assert.strictEqual(line.attributes.stroke, "#1a1a1a");
    assert.strictEqual(line.attributes["stroke-width"], 1);
    assert.strictEqual(line.nodeAttributes["shape-rendering"], "geometricPrecision");
    assert.strictEqual(line.nodeAttributes["vector-effect"], "non-scaling-stroke");
});

function fakeSvgElement(name) {
    return {
        name,
        attributes:{},
        children:[],
        parentNode:null,
        setAttribute(attribute, value) { this.attributes[attribute] = String(value); },
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            this.children.splice(this.children.indexOf(child), 1);
            child.parentNode = null;
        }
    };
}
const nativeDocument = {
    createElementNS(_namespace, name) { return fakeSvgElement(name); }
};
const nativeCanvas = fakeSvgElement("svg");
nativeCanvas.namespaceURI = "http://www.w3.org/2000/svg";
nativeCanvas.ownerDocument = nativeDocument;
context.vectron_screen.canvas = nativeCanvas;
const nativeLayer = context.aamap_createNativeGridLayer();
assert.ok(nativeLayer, "SVG browsers receive a detached native grid layer");
assert.strictEqual(nativeLayer.node.attributes["pointer-events"], "none");
context.aamap_renderGridLines(nativeLayer, [
    {x1:1.2, y1:0, x2:1.2, y2:100},
    {x1:2.2, y1:0, x2:2.2, y2:100}
], "#1a1a1a", 1, 1, 0, 0);
assert.strictEqual(nativeCanvas.children.length, 0,
    "The grid stays detached while its independent lines are assembled");
assert.strictEqual(nativeLayer.node.children.length, 2);
assert.strictEqual(nativeLayer.node.children[0].attributes.x1, "1.5");
assert.strictEqual(nativeLayer.node.children[0].attributes["shape-rendering"],
    "geometricPrecision");
nativeLayer.mount();
assert.strictEqual(nativeCanvas.children.length, 1,
    "The complete grid enters the live SVG in one insertion");

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

assert.ok(rendered.length > 350 && rendered.length < 420,
    "One viewport of overscan is available to the lightweight zoom preview");
rendered.forEach(line => {
    const coordinates = line.commands.filter(value => typeof value === "number");
    assert.ok(coordinates.every(value => value >= -1394 && value <= 2788),
        "Grid subpaths remain within the bounded zoom-preview overscan area");
});

assert.doesNotMatch(aamapSource, /shapeRendering\s*=\s*["']crispedges/i,
    "The grid must not opt into Firefox's lossy crispEdges snapping path");
assert.match(aamapSource, /var renderLeft = -vectron_width;/,
    "Grid paths include a bounded viewport of zoom-preview overscan");

const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(indexSource, /js\/aamap\.js\?v=20260903-smooth-svg-zoom-1/);
assert.match(indexSource, /targetVersion = 1\.118/);

console.log("Vectron grid rendering tests passed.");
