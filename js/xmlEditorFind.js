/*
 * Literal find/replace helpers shared by the XML editor and its regression
 * tests. Search text is never interpreted as a regular expression.
 */
(function(root) {
    "use strict";

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function findMatches(content, query, matchCase) {
        var text = String(content || "");
        var needle = String(query || "");
        var matches = [];
        var expression;
        var match;

        if(!needle) return matches;
        expression = new RegExp(escapeRegExp(needle), matchCase ? "g" : "gi");
        while((match = expression.exec(text)) !== null) {
            matches.push({start: match.index, end: match.index + match[0].length});
        }
        return matches;
    }

    function replaceAll(content, query, replacement, matchCase) {
        var text = String(content || "");
        var replacementText = String(replacement || "");
        var matches = findMatches(text, query, matchCase);
        var pieces = [];
        var cursor = 0;

        matches.forEach(function(match) {
            pieces.push(text.slice(cursor, match.start), replacementText);
            cursor = match.end;
        });
        pieces.push(text.slice(cursor));
        return {text: pieces.join(""), count: matches.length};
    }

    root.VectronXmlFind = {
        findMatches: findMatches,
        replaceAll: replaceAll
    };
})(typeof window !== "undefined" ? window : globalThis);
