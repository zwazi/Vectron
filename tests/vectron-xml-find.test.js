"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const context = vm.createContext({});
context.globalThis = context;
vm.runInContext(read("js/xmlEditorFind.js"), context, {filename: "js/xmlEditorFind.js"});

const find = context.VectronXmlFind;
assert.ok(find, "The XML find helpers are exported for the editor");

assert.deepStrictEqual(
    Array.from(find.findMatches("<Wall/><wall/><WALL/>", "<wall", false), match => ({
        start: match.start,
        end: match.end
    })),
    [{start: 0, end: 5}, {start: 7, end: 12}, {start: 14, end: 19}],
    "Find defaults to case-insensitive matching"
);
assert.deepStrictEqual(
    Array.from(find.findMatches("<Wall/><wall/>", "<Wall", true), match => match.start),
    [0],
    "Match case limits results to exact casing"
);
assert.deepStrictEqual(
    Array.from(find.findMatches("a.b a?b a.b", "a.b", true), match => match.start),
    [0, 8],
    "Regular-expression punctuation is searched literally"
);
assert.deepStrictEqual(
    Array.from(find.findMatches("aaaa", "aa", true), match => match.start),
    [0, 2],
    "Matches are non-overlapping like a normal editor search"
);

let result = find.replaceAll("Win win WIN", "win", "target", false);
assert.strictEqual(result.text, "target target target");
assert.strictEqual(result.count, 3);

result = find.replaceAll("$value $value", "$value", "$&", true);
assert.strictEqual(result.text, "$& $&", "Replacement dollar signs stay literal");
assert.strictEqual(result.count, 2);

result = find.replaceAll("abc", "", "ignored", false);
assert.strictEqual(result.text, "abc", "An empty query cannot replace content");
assert.strictEqual(result.count, 0);

const index = read("index.html");
const eventSource = read("js/eventHandler.js");
const css = read("css/vectron.css");
const darkCss = read("css/vectron-dark.css");
[
    "xml-editor-find-bar", "xml-editor-find", "xml-editor-replace",
    "xml-editor-find-previous", "xml-editor-find-next",
    "xml-editor-replace-one", "xml-editor-replace-all",
    "xml-editor-match-case", "xml-editor-find-status", "xml-editor-find-toggle"
].forEach(id => assert.ok(index.includes(`id="${id}"`), `index.html is missing #${id}`));
assert.ok(
    index.indexOf("./js/xmlEditorFind.js") < index.indexOf("./js/eventHandler.js"),
    "Find helpers load before the XML editor event handlers"
);
assert.match(eventSource, /key === 'f' \|\| key === 'h'/);
assert.match(eventSource, /xmlEditor_findStep\(e\.shiftKey \? -1 : 1, false\)/);
assert.match(eventSource, /window\.VectronXmlFind\.replaceAll/);
assert.match(css, /#xml-editor-find-bar/);
assert.match(darkCss, /#xml-editor-find-bar/);

const targetVersion = index.match(/var targetVersion = ([0-9.]+);/);
const runtimeVersion = read("js/vectron.js").match(/window\.vtVersion = ([0-9.]+);/);
assert.ok(targetVersion && runtimeVersion);
assert.strictEqual(targetVersion[1], runtimeVersion[1], "The cache-busting versions stay aligned");

console.log("Vectron XML find/replace tests passed.");
