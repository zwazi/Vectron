"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const context = vm.createContext({
    console,
    JSON,
    String,
    Array,
    Object,
    Number,
    Math,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    atob: value => Buffer.from(value, "base64").toString("binary"),
    gui_writeLog() {},
    $() { throw new Error("Map export must not depend on an axes checkbox."); }
});
context.window = context;

vm.runInContext(read("js/xml.js"), context, {filename: "js/xml.js"});
vm.runInContext(read("js/aamap.js"), context, {filename: "js/aamap.js"});
context.aamap_objects = [];

context.xml_appendRemixSource({
    map: "Original--Arena",
    author: "Zwazi",
    version: "1",
    path: "Zwazi/maps/Original--Arena-1.aamap.xml"
});
const firstRemix = context.aamap_buildXml(
    "First Remix", "Remixer One", "maps", "1", "sty.dtd", 6, []
).xml;

assert.match(firstRemix, /<Axes number="6"\/>/);
assert.match(firstRemix, /Original map: "Original- -Arena"/);
assert.match(firstRemix, /Original author: "Zwazi"/);
assert.match(firstRemix, /Vectron remix provenance data:/);
assert.doesNotMatch(firstRemix, /Original--Arena[^\n]*-->/,
    "Human-readable provenance must remain valid inside an XML comment");

context.xml_readRemixHistory(firstRemix);
context.xml_appendRemixSource({
    map: "First Remix",
    author: "Remixer One",
    version: "1",
    path: "Remixer One/maps/First Remix-1.aamap.xml"
});
const secondRemix = context.aamap_buildXml(
    "Second Remix", "Remixer Two", "maps", "1", "custom.dtd", 12, []
).xml;

assert.match(secondRemix, /Original map: "Original- -Arena"/);
assert.match(secondRemix, /Remix source 2: Map: "First Remix"; Author: "Remixer One"/);
assert.match(secondRemix, /<Axes number="12"\/>/);

context.xml_clearRemixHistory();
assert.strictEqual(context.xml_remixHistory.length, 0);
context.xml_readRemixHistory(secondRemix);
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.xml_remixHistory)), [
    {
        map: "Original--Arena",
        author: "Zwazi",
        version: "1",
        path: "Zwazi/maps/Original--Arena-1.aamap.xml"
    },
    {
        map: "First Remix",
        author: "Remixer One",
        version: "1",
        path: "Remixer One/maps/First Remix-1.aamap.xml"
    }
]);

context.xml_readRemixHistory('<Resource type="aamap" name="Fresh"></Resource>');
assert.strictEqual(context.xml_remixHistory.length, 0,
    "A non-remixed map must clear the previous remix chain");

console.log("Vectron map format tests passed.");
