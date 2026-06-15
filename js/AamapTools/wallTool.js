/*
********************************************************************************
Vectron - map editor for Armagetron Advanced.
Copyright (C) 2017  Glen Harpring       (armanelgtron@gmail.com)
Copyright (C) 2014  Tristan Whitcher    (tristan.whitcher@gmail.com)
David Dubois        (ddubois@jotunstudios.com)
Copyright (C) 2010  Carlo Veneziano     (carlorfeo@gmail.com)
********************************************************************************

This file is part of Vectron.

Vectron is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Vectron is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Vectron.  If not, see <http://www.gnu.org/licenses/>.

*/

/**
 * Represents a wall point OBJECT
 *
 */
function WallPoint(x, y) {
    this.x = x;
    this.y = y;
}

var wallTool_currentObj = null;
var wallTool_previewObj = null;
var wallTool_mode = "freeform";
var wallTool_step = 0;
var wallTool_stagePoints = [];

// Minimum segment length used to cap segment counts; smaller shapes get lower limits.
var WALL_TOOL_MIN_SEGMENTS = 3;
var WALL_TOOL_SEGMENT_LENGTH = 4;
// Hard ceiling to keep giant circles from generating too many tiny walls.
var WALL_TOOL_MAX_SEGMENTS = 720;
// Keep wall coordinates stable when rounding generated points.
var WALL_TOOL_COORD_PRECISION = 1e6;
var WALL_TOOL_BUTTON_LABEL_FINISH = "Finish Wall";
var WALL_TOOL_BUTTON_LABEL_GENERATE = "Generate Walls";
var WALL_TOOL_BUTTON_LABEL_SUBMIT = "Submit";
var WALL_TOOL_TEXT_ALPHA_THRESHOLD = 24;
var WALL_TOOL_TEXT_FONT_SEARCH_ITERATIONS = 12;
var WALL_TOOL_TEXT_BOX_PADDING_FACTOR = 0.9;
var WALL_TOOL_TEXT_LINE_HEIGHT_MULTIPLIER = 1.15;
var WALL_TOOL_TEXT_MAX_COLS = 96;
var WALL_TOOL_TEXT_MIN_COLS = 24;
var WALL_TOOL_TEXT_MAX_ROWS = 72;
var WALL_TOOL_TEXT_MIN_ROWS = 12;
var WALL_TOOL_TEXT_RASTER_SCALE_FACTOR = 2;
var WALL_TOOL_TEXT_SIMPLIFY_EPSILON = 1e-9;

function wallTool_clearPreview() {
    if(wallTool_previewObj != null) {
        wallTool_previewObj.remove();
        wallTool_previewObj = null;
    }
}

function wallTool_clearCurrentWall() {
    if(wallTool_currentObj != null) {
        wallTool_currentObj.obj.remove();
        wallTool_currentObj.guideObj.remove();
        wallTool_currentObj = null;
    }
}

function wallTool_resetDraft() {
    wallTool_clearPreview();
    wallTool_clearCurrentWall();
    wallTool_step = 0;
    wallTool_stagePoints = [];
    vectron_toolActive = false;
}

function wallTool_getHeight() {
    var h = parseInt($("#dWallHeight").val());
    if(isNaN(h) || h < 1) h = 1;
    if(h > 50) h = 50;
    $("#dWallHeight").val(h);
    return h;
}

function wallTool_setMode(mode) {
    if(!mode) mode = "freeform";
    if(wallTool_mode === mode) {
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }
    wallTool_resetDraft();
    wallTool_mode = mode;
    wallTool_updateWindow();
    wallTool_renderCurrent();
}

function wallTool_isParametricMode() {
    return wallTool_mode !== "freeform";
}

function wallTool_isCountPhase() {
    if(wallTool_mode === "circleCenter") return wallTool_step >= 2;
    if(wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt" || wallTool_mode === "ellipse3pt") return wallTool_step >= 3;
    return false;
}

function wallTool_getSegmentInput() {
    var el = document.getElementById("dWallSegments");
    if(!el) return WALL_TOOL_MIN_SEGMENTS;
    var v = parseInt(el.value);
    if(isNaN(v) || v < WALL_TOOL_MIN_SEGMENTS) v = WALL_TOOL_MIN_SEGMENTS;
    return v;
}

function wallTool_wallCountLimit(perimeter) {
    var limit = Math.floor(perimeter / WALL_TOOL_SEGMENT_LENGTH);
    if(limit < WALL_TOOL_MIN_SEGMENTS) limit = WALL_TOOL_MIN_SEGMENTS;
    if(limit > WALL_TOOL_MAX_SEGMENTS) limit = WALL_TOOL_MAX_SEGMENTS;
    return limit;
}

function wallTool_applyCountLimit(limit, warnIfReduced) {
    var el = document.getElementById("dWallSegments");
    if(!el) return WALL_TOOL_MIN_SEGMENTS;
    if(limit < WALL_TOOL_MIN_SEGMENTS) limit = WALL_TOOL_MIN_SEGMENTS;
    el.max = limit;

    var v = parseInt(el.value);
    if(isNaN(v) || v < WALL_TOOL_MIN_SEGMENTS) v = WALL_TOOL_MIN_SEGMENTS;
    if(v > limit) {
        el.value = limit;
        if(warnIfReduced) {
            gui_toast("Too many walls for this size. Capped at " + limit + ".");
            gui_writeLog("Too many walls for this size. Capped at " + limit + ".");
        }
        return limit;
    }
    return v;
}

function wallTool_pointDistance(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function wallTool_normalizeAngle(angle) {
    while(angle < 0) angle += Math.PI * 2;
    while(angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
}

function wallTool_angleDiff(fromAngle, toAngle) {
    return wallTool_normalizeAngle(toAngle - fromAngle);
}

function wallTool_circumcenter(a, b, c) {
    // Standard circumcenter formula for three non-collinear points.
    var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if(Math.abs(d) < 1e-9) return null;
    var a2 = a.x * a.x + a.y * a.y;
    var b2 = b.x * b.x + b.y * b.y;
    var c2 = c.x * c.x + c.y * c.y;
    return {
        x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
        y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
    };
}

function wallTool_pushPoint(list, x, y) {
    list.push(new WallPoint(
        Math.round(x * WALL_TOOL_COORD_PRECISION) / WALL_TOOL_COORD_PRECISION,
        Math.round(y * WALL_TOOL_COORD_PRECISION) / WALL_TOOL_COORD_PRECISION
    ));
}

function wallTool_makePath(points) {
    if(!points || points.length < 2) return [];
    var path = ["M", aamap_realX(points[0].x), aamap_realY(points[0].y)];
    for(var i = 1; i < points.length; i++) {
        path.push("L", aamap_realX(points[i].x), aamap_realY(points[i].y));
    }
    return path;
}

function wallTool_drawPreview(points) {
    wallTool_clearPreview();
    if(!points || points.length < 2) return;
    wallTool_previewObj = vectron_screen.path(wallTool_makePath(points)).attr({
        stroke: "#aaa",
        "stroke-dasharray": "--..",
        "fill": "none"
    });
}

function wallTool_drawPreviewSegments(segments) {
    wallTool_clearPreview();
    if(!segments || segments.length === 0) return;
    wallTool_previewObj = vectron_screen.set();
    for(var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var path = vectron_screen.path(wallTool_makePath(seg)).attr({
            stroke: "#aaa",
            "stroke-dasharray": "--..",
            "fill": "none"
        });
        wallTool_previewObj.push(path);
    }
}

function wallTool_getTextInput() {
    var el = document.getElementById("dWallText");
    return el ? el.value : "";
}

function wallTool_getTextModeBox(points) {
    if(!points || points.length < 2) return null;
    var a = points[0];
    var b = points[1];
    var left = Math.min(a.x, b.x);
    var right = Math.max(a.x, b.x);
    var top = Math.max(a.y, b.y);
    var bottom = Math.min(a.y, b.y);
    var width = right - left;
    var height = top - bottom;
    if(width <= 0 || height <= 0) return null;
    return {
        left: left,
        right: right,
        top: top,
        bottom: bottom,
        width: width,
        height: height
    };
}

function wallTool_getTextCanvas() {
    return document.createElement("canvas");
}

function wallTool_fitTextFont(ctx, lines, width, height) {
    var low = 1;
    var high = Math.max(8, Math.floor(Math.min(width, height)));
    var best = low;

    for(var i = 0; i < WALL_TOOL_TEXT_FONT_SEARCH_ITERATIONS; i++) {
        var mid = Math.max(1, Math.floor((low + high) / 2));
        ctx.font = "bold " + mid + "px monospace";
        var lineHeight = mid * WALL_TOOL_TEXT_LINE_HEIGHT_MULTIPLIER;
        var maxLineWidth = 0;
        for(var j = 0; j < lines.length; j++) {
            var measured = ctx.measureText(lines[j] || " ").width;
            if(measured > maxLineWidth) maxLineWidth = measured;
        }
        var totalHeight = lineHeight * lines.length;
        if(maxLineWidth <= width * WALL_TOOL_TEXT_BOX_PADDING_FACTOR && totalHeight <= height * WALL_TOOL_TEXT_BOX_PADDING_FACTOR) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
        if(low > high) break;
    }

    return Math.max(1, best);
}

function wallTool_rasterizeText(text, cols, rows) {
    var canvas = wallTool_getTextCanvas();
    canvas.width = cols;
    canvas.height = rows;
    var ctx = canvas.getContext("2d");
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    if(lines.length === 0) lines = [""];

    ctx.clearRect(0, 0, cols, rows);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var fontSize = wallTool_fitTextFont(ctx, lines, cols, rows);
    var lineHeight = fontSize * WALL_TOOL_TEXT_LINE_HEIGHT_MULTIPLIER;
    var totalHeight = lineHeight * lines.length;
    var startY = (rows - totalHeight) / 2 + lineHeight / 2;
    ctx.font = "bold " + fontSize + "px monospace";

    for(var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i] || " ", cols / 2, startY + i * lineHeight);
    }

    var pixels = ctx.getImageData(0, 0, cols, rows).data;
    var mask = [];
    for(var y = 0; y < rows; y++) {
        mask[y] = [];
        for(var x = 0; x < cols; x++) {
            var idx = (y * cols + x) * 4 + 3;
            mask[y][x] = pixels[idx] > WALL_TOOL_TEXT_ALPHA_THRESHOLD;
        }
    }

    return mask;
}

function wallTool_maskToSegments(mask, cols, rows) {
    var segments = [];

    function isFilled(x, y) {
        return !!(mask[y] && mask[y][x]);
    }

    for(var y = 0; y < rows; y++) {
        for(var x = 0; x < cols; x++) {
            if(!isFilled(x, y)) continue;
            if(!isFilled(x, y - 1)) segments.push({ x1: x, y1: y, x2: x + 1, y2: y });
            if(!isFilled(x + 1, y)) segments.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
            if(!isFilled(x, y + 1)) segments.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1 });
            if(!isFilled(x - 1, y)) segments.push({ x1: x, y1: y + 1, x2: x, y2: y });
        }
    }

    return segments;
}

function wallTool_mergeSegments(segments) {
    var horizontals = {};
    var verticals = {};

    function stringifyKey(value) {
        return String(value);
    }

    function normalizeSegment(seg) {
        var normalized = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
        if(normalized.y1 === normalized.y2 && normalized.x2 < normalized.x1) {
            var tmp = normalized.x1;
            normalized.x1 = normalized.x2;
            normalized.x2 = tmp;
        } else if(normalized.x1 === normalized.x2 && normalized.y2 < normalized.y1) {
            var tmpY = normalized.y1;
            normalized.y1 = normalized.y2;
            normalized.y2 = tmpY;
        }
        return normalized;
    }

    segments.forEach(function(seg) {
        if(seg.y1 === seg.y2) {
            var normalizedHorizontal = normalizeSegment(seg);
            var y = normalizedHorizontal.y1;
            if(!horizontals[stringifyKey(y)]) horizontals[stringifyKey(y)] = [];
            horizontals[stringifyKey(y)].push(normalizedHorizontal);
        } else if(seg.x1 === seg.x2) {
            var normalizedVertical = normalizeSegment(seg);
            var x = normalizedVertical.x1;
            if(!verticals[stringifyKey(x)]) verticals[stringifyKey(x)] = [];
            verticals[stringifyKey(x)].push(normalizedVertical);
        }
    });

    var merged = [];
    Object.keys(horizontals).sort(function(a, b) { return parseFloat(a) - parseFloat(b); }).forEach(function(key) {
        var list = horizontals[key].sort(function(a, b) { return a.x1 - b.x1; });
        var cur = null;
        list.forEach(function(seg) {
            if(!cur) {
                cur = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
                return;
            }
            if(cur.y1 === seg.y1 && cur.x2 === seg.x1) {
                cur.x2 = seg.x2;
            } else {
                merged.push(cur);
                cur = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
            }
        });
        if(cur) merged.push(cur);
    });

    Object.keys(verticals).sort(function(a, b) { return parseFloat(a) - parseFloat(b); }).forEach(function(key) {
        var list = verticals[key].sort(function(a, b) { return a.y1 - b.y1; });
        var cur = null;
        list.forEach(function(seg) {
            if(!cur) {
                cur = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
                return;
            }
            if(cur.x1 === seg.x1 && cur.y2 === seg.y1) {
                cur.y2 = seg.y2;
            } else {
                merged.push(cur);
                cur = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
            }
        });
        if(cur) merged.push(cur);
    });

    return merged;
}

function wallTool_textSegmentsToWalls(segments, box) {
    var walls = [];
    if(!box || !segments || segments.length === 0) return walls;

    function toPoint(px, py) {
        return new WallPoint(
            box.left + (px / box.cols) * box.width,
            box.top - (py / box.rows) * box.height
        );
    }

    function keyForPoint(px, py) {
        var normalizedX = Math.round(px * WALL_TOOL_COORD_PRECISION) / WALL_TOOL_COORD_PRECISION;
        var normalizedY = Math.round(py * WALL_TOOL_COORD_PRECISION) / WALL_TOOL_COORD_PRECISION;
        return normalizedX + "," + normalizedY;
    }

    var adjacency = {};
    for(var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var startKey = keyForPoint(seg.x1, seg.y1);
        var endKey = keyForPoint(seg.x2, seg.y2);
        if(!adjacency[startKey]) adjacency[startKey] = [];
        if(!adjacency[endKey]) adjacency[endKey] = [];
        adjacency[startKey].push(i);
        adjacency[endKey].push(i);
    }

    var used = new Array(segments.length);
    for(var u = 0; u < segments.length; u++) {
        used[u] = false;
    }
    for(var j = 0; j < segments.length; j++) {
        if(used[j]) continue;

        var currentSeg = segments[j];
        var currentPoints = [
            toPoint(currentSeg.x1, currentSeg.y1),
            toPoint(currentSeg.x2, currentSeg.y2)
        ];
        used[j] = true;

        var startPointKey = keyForPoint(currentSeg.x1, currentSeg.y1);
        var currentPointKey = keyForPoint(currentSeg.x2, currentSeg.y2);

        while(true) {
            var connections = adjacency[currentPointKey];
            var nextSegIndex = -1;
            if(connections) {
                for(var k = 0; k < connections.length; k++) {
                    if(!used[connections[k]]) {
                        nextSegIndex = connections[k];
                        break;
                    }
                }
            }

            if(nextSegIndex < 0) {
                break;
            }

            var nextSeg = segments[nextSegIndex];
            used[nextSegIndex] = true;

            var nextStartKey = keyForPoint(nextSeg.x1, nextSeg.y1);
            var nextEndKey = keyForPoint(nextSeg.x2, nextSeg.y2);
            var nextPoint;
            if(currentPointKey === nextStartKey) {
                nextPoint = toPoint(nextSeg.x2, nextSeg.y2);
                currentPointKey = nextEndKey;
            } else {
                nextPoint = toPoint(nextSeg.x1, nextSeg.y1);
                currentPointKey = nextStartKey;
            }

            var lastIndex = currentPoints.length - 1;
            var lastPoint = currentPoints[lastIndex];
            if(lastPoint.x !== nextPoint.x || lastPoint.y !== nextPoint.y) {
                currentPoints.push(nextPoint);
            }

            if(currentPointKey === startPointKey) {
                break;
            }
        }

        walls.push(currentPoints);
    }

    return walls;
}

function wallTool_pointsEqual(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
}

function wallTool_simplifyWallPoints(points) {
    if(!points || points.length < 3) return points ? points.slice() : [];

    var closed = wallTool_pointsEqual(points[0], points[points.length - 1]);
    var source = closed ? points.slice(0, -1) : points.slice();
    if(source.length < 3) return closed ? points.slice() : source;

    var simplified = [source[0]];
    for(var i = 1; i < source.length - 1; i++) {
        var prev = simplified[simplified.length - 1];
        var curr = source[i];
        var next = source[i + 1];
        if(wallTool_pointsEqual(prev, curr)) continue;
        var dx1 = curr.x - prev.x;
        var dy1 = curr.y - prev.y;
        var dx2 = next.x - curr.x;
        var dy2 = next.y - curr.y;
        if(Math.abs(dx1 * dy2 - dy1 * dx2) < WALL_TOOL_TEXT_SIMPLIFY_EPSILON) continue;
        simplified.push(curr);
    }

    var last = source[source.length - 1];
    if(!wallTool_pointsEqual(simplified[simplified.length - 1], last)) {
        simplified.push(last);
    }

    if(closed && !wallTool_pointsEqual(simplified[0], simplified[simplified.length - 1])) {
        simplified.push(simplified[0]);
    }

    return simplified;
}

function wallTool_buildTextWalls(points, text) {
    var box = wallTool_getTextModeBox(points);
    if(!box) return null;

    var rawText = String(text || "");
    if(rawText.replace(/\s/g, "") === "") return [];

    var cols = Math.min(WALL_TOOL_TEXT_MAX_COLS, Math.max(WALL_TOOL_TEXT_MIN_COLS, Math.round(box.width * WALL_TOOL_TEXT_RASTER_SCALE_FACTOR)));
    var rows = Math.min(WALL_TOOL_TEXT_MAX_ROWS, Math.max(WALL_TOOL_TEXT_MIN_ROWS, Math.round(box.height * WALL_TOOL_TEXT_RASTER_SCALE_FACTOR)));
    box.cols = cols;
    box.rows = rows;

    var mask = wallTool_rasterizeText(rawText, cols, rows);
    var segments = wallTool_mergeSegments(wallTool_maskToSegments(mask, cols, rows));
    var walls = wallTool_textSegmentsToWalls(segments, box);
    for(var i = 0; i < walls.length; i++) {
        walls[i] = wallTool_simplifyWallPoints(walls[i]);
    }
    return walls.filter(function(wall) { return wall && wall.length >= 2; });
}

function wallTool_selectWalls(walls) {
    selectTool_deselectAll();
    for(var i = 0; i < walls.length; i++) {
        walls[i].isSelected = true;
        selectTool_selectedObjs.push(walls[i]);
    }
}

function wallTool_makeRectangle(a, b) {
    return [
        new WallPoint(a.x, a.y),
        new WallPoint(b.x, a.y),
        new WallPoint(b.x, b.y),
        new WallPoint(a.x, b.y),
        new WallPoint(a.x, a.y)
    ];
}

function wallTool_makeCenterRectangle(center, corner) {
    var dx = Math.abs(corner.x - center.x);
    var dy = Math.abs(corner.y - center.y);
    return [
        new WallPoint(center.x - dx, center.y - dy),
        new WallPoint(center.x + dx, center.y - dy),
        new WallPoint(center.x + dx, center.y + dy),
        new WallPoint(center.x - dx, center.y + dy),
        new WallPoint(center.x - dx, center.y - dy)
    ];
}

function wallTool_circleGeometry(center, radiusPoint) {
    var radius = wallTool_pointDistance(center, radiusPoint);
    if(radius <= 0) return null;
    return {
        center: center,
        radius: radius,
        startAngle: Math.atan2(radiusPoint.y - center.y, radiusPoint.x - center.x)
    };
}

function wallTool_circlePoints(center, radius, segments, startAngle) {
    var pts = [];
    if(segments < WALL_TOOL_MIN_SEGMENTS) segments = WALL_TOOL_MIN_SEGMENTS;
    for(var i = 0; i <= segments; i++) {
        var ang = startAngle + (Math.PI * 2 * i / segments);
        wallTool_pushPoint(pts, center.x + Math.cos(ang) * radius, center.y + Math.sin(ang) * radius);
    }
    return pts;
}

function wallTool_arcPoints(center, radius, startAngle, endAngle, segments, clockwise) {
    var pts = [];
    if(segments < WALL_TOOL_MIN_SEGMENTS) segments = WALL_TOOL_MIN_SEGMENTS;
    var sweep = clockwise ? -wallTool_angleDiff(endAngle, startAngle) : wallTool_angleDiff(startAngle, endAngle);
    for(var i = 0; i <= segments; i++) {
        var ang = startAngle + sweep * (i / segments);
        wallTool_pushPoint(pts, center.x + Math.cos(ang) * radius, center.y + Math.sin(ang) * radius);
    }
    return pts;
}

function wallTool_ellipsePoints(center, majorPoint, minorPoint, segments) {
    var majorDx = majorPoint.x - center.x;
    var majorDy = majorPoint.y - center.y;
    var majorLen = Math.sqrt(majorDx * majorDx + majorDy * majorDy);
    if(majorLen <= 0) return null;

    var minorLen = wallTool_pointDistance(center, minorPoint);
    if(minorLen <= 0) return null;

    var majorUnitX = majorDx / majorLen;
    var majorUnitY = majorDy / majorLen;
    var perp1X = -majorUnitY;
    var perp1Y = majorUnitX;
    var perp2X = majorUnitY;
    var perp2Y = -majorUnitX;
    var rawMinorX = minorPoint.x - center.x;
    var rawMinorY = minorPoint.y - center.y;
    var dot1 = perp1X * rawMinorX + perp1Y * rawMinorY;
    var dot2 = perp2X * rawMinorX + perp2Y * rawMinorY;
    var minorUnitX = (Math.abs(dot1) >= Math.abs(dot2)) ? perp1X : perp2X;
    var minorUnitY = (Math.abs(dot1) >= Math.abs(dot2)) ? perp1Y : perp2Y;
    if((minorUnitX * rawMinorX + minorUnitY * rawMinorY) < 0) {
        minorUnitX *= -1;
        minorUnitY *= -1;
    }

    if(segments < WALL_TOOL_MIN_SEGMENTS) segments = WALL_TOOL_MIN_SEGMENTS;
    var pts = [];
    for(var i = 0; i <= segments; i++) {
        var t = (Math.PI * 2 * i) / segments;
        wallTool_pushPoint(
            pts,
            center.x + majorUnitX * majorLen * Math.cos(t) + minorUnitX * minorLen * Math.sin(t),
            center.y + majorUnitY * majorLen * Math.cos(t) + minorUnitY * minorLen * Math.sin(t)
        );
    }
    return pts;
}

function wallTool_modeLabel() {
    var labels = {
        "freeform": "Freeform Wall",
        "rect2": "2-point Rectangle",
        "centerRect": "Center-point Rectangle",
        "circleCenter": "Center-point Circle",
        "circle3pt": "3-point Circle",
        "arc3pt": "3-point Arc",
        "ellipse3pt": "3-point Ellipse",
        "text": "Text Walls"
    };
    return labels[wallTool_mode] || "Wall Tool";
}

function wallTool_setStatus(message) {
    var el = document.getElementById("wall-tool-status");
    if(el) el.textContent = message;
}

function wallTool_updateWindow() {
    var mode = wallTool_mode;
    var isFreeform = (mode === "freeform");
    var isTextMode = (mode === "text");
    var isCountMode = wallTool_isCountPhase();
    var finishBtn = document.getElementById("wall-tool-finish");
    var countSection = document.getElementById("wall-tool-count-section");
    var pointsSection = document.getElementById("wall-tool-points-section");
    var textSection = document.getElementById("wall-tool-text-section");
    var modeButtons = $(".wall-tool-mode-btn");

    modeButtons.removeClass("active");
    modeButtons.filter("[data-mode='" + mode + "']").addClass("active");

    if(pointsSection) pointsSection.style.display = isFreeform ? "" : "none";
    if(textSection) textSection.style.display = isTextMode ? "" : "none";
    if(countSection) countSection.style.display = isCountMode ? "" : "none";
    if(finishBtn) {
        var showFinish = isCountMode || (isTextMode && wallTool_stagePoints.length >= 2) || (isFreeform && wallTool_currentObj != null && wallTool_currentObj.points.length >= 2);
        finishBtn.style.display = showFinish ? "" : "none";
        finishBtn.innerHTML = isTextMode ? WALL_TOOL_BUTTON_LABEL_SUBMIT : (isCountMode ? WALL_TOOL_BUTTON_LABEL_GENERATE : WALL_TOOL_BUTTON_LABEL_FINISH);
    }

    if(isFreeform) {
        wallTool_setStatus("Click to place wall points. Double-click or Shift+W to finish.");
    } else if(mode === "rect2") {
        wallTool_setStatus("Click opposite corners of the rectangle.");
    } else if(mode === "centerRect") {
        wallTool_setStatus("Click the center point, then a corner.");
    } else if(mode === "circleCenter") {
        wallTool_setStatus(wallTool_step < 2 ? "Click the center, then a radius point." : "Set the wall count, then generate the circle.");
    } else if(mode === "circle3pt") {
        wallTool_setStatus(wallTool_step < 3 ? "Click three points on the circumference." : "Set the wall count, then generate the circle.");
    } else if(mode === "arc3pt") {
        wallTool_setStatus(wallTool_step < 3 ? "Click two endpoints and a radius point." : "Set the wall count, then generate the arc.");
    } else if(mode === "ellipse3pt") {
        wallTool_setStatus(wallTool_step < 3 ? "Click the center, major axis, then minor axis." : "Set the wall count, then generate the ellipse.");
    } else if(isTextMode) {
        wallTool_setStatus(wallTool_stagePoints.length < 2 ? "Click two corners to set the text box." : "Review the preview, then press Submit.");
    }
}

function wallTool_getDraftPoints(candidatePoint) {
    if(wallTool_mode === "freeform") {
        return null;
    }

    var pts = wallTool_stagePoints.slice();
    if(candidatePoint) pts.push(candidatePoint);

    if(wallTool_mode === "rect2") {
        if(pts.length < 2) return pts;
        return wallTool_makeRectangle(pts[0], pts[1]);
    }

    if(wallTool_mode === "centerRect") {
        if(pts.length < 2) return pts;
        return wallTool_makeCenterRectangle(pts[0], pts[1]);
    }

    if(wallTool_mode === "circleCenter") {
        if(pts.length < 2) return pts;
        var g = wallTool_circleGeometry(pts[0], pts[1]);
        if(!g) return null;
        return wallTool_circlePoints(g.center, g.radius, wallTool_getSegmentInput(), g.startAngle);
    }

    if(wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt") {
        if(pts.length < 3) return pts;
        var center = wallTool_circumcenter(pts[0], pts[1], pts[2]);
        if(!center) return null;
        var radius = wallTool_pointDistance(center, pts[0]);
        if(radius <= 0) return null;
        if(wallTool_mode === "circle3pt") {
            return wallTool_circlePoints(center, radius, wallTool_getSegmentInput(), Math.atan2(pts[0].y - center.y, pts[0].x - center.x));
        }
        var startAngle = Math.atan2(pts[0].y - center.y, pts[0].x - center.x);
        var radiusAngle = Math.atan2(pts[2].y - center.y, pts[2].x - center.x);
        var endAngle = Math.atan2(pts[1].y - center.y, pts[1].x - center.x);
        var counterClockwiseSweep = wallTool_angleDiff(startAngle, endAngle);
        var radiusSweep = wallTool_angleDiff(startAngle, radiusAngle);
        var clockwise = (radiusSweep > counterClockwiseSweep);
        return wallTool_arcPoints(center, radius, startAngle, endAngle, wallTool_getSegmentInput(), clockwise);
    }

    if(wallTool_mode === "ellipse3pt") {
        if(pts.length < 3) return pts;
        return wallTool_ellipsePoints(pts[0], pts[1], pts[2], wallTool_getSegmentInput());
    }

    if(wallTool_mode === "text") {
        if(pts.length < 2) return pts;
        return wallTool_buildTextWalls(pts, wallTool_getTextInput());
    }

    return null;
}

function wallTool_getDraftPerimeter() {
    if(wallTool_mode === "circleCenter" && wallTool_stagePoints.length >= 2) {
        var g = wallTool_circleGeometry(wallTool_stagePoints[0], wallTool_stagePoints[1]);
        if(!g) return 0;
        return 2 * Math.PI * g.radius;
    }

    if(wallTool_mode === "circle3pt" && wallTool_stagePoints.length >= 3) {
        var center = wallTool_circumcenter(wallTool_stagePoints[0], wallTool_stagePoints[1], wallTool_stagePoints[2]);
        if(!center) return 0;
        return 2 * Math.PI * wallTool_pointDistance(center, wallTool_stagePoints[0]);
    }

    if(wallTool_mode === "arc3pt" && wallTool_stagePoints.length >= 3) {
        var arcCenter = wallTool_circumcenter(wallTool_stagePoints[0], wallTool_stagePoints[1], wallTool_stagePoints[2]);
        if(!arcCenter) return 0;
        var arcRadius = wallTool_pointDistance(arcCenter, wallTool_stagePoints[0]);
        var startAngle = Math.atan2(wallTool_stagePoints[0].y - arcCenter.y, wallTool_stagePoints[0].x - arcCenter.x);
        var endAngle = Math.atan2(wallTool_stagePoints[1].y - arcCenter.y, wallTool_stagePoints[1].x - arcCenter.x);
        var radiusAngle = Math.atan2(wallTool_stagePoints[2].y - arcCenter.y, wallTool_stagePoints[2].x - arcCenter.x);
        var counterClockwiseSweep = wallTool_angleDiff(startAngle, endAngle);
        var radiusSweep = wallTool_angleDiff(startAngle, radiusAngle);
        var sweep = (radiusSweep > counterClockwiseSweep) ? (Math.PI * 2 - counterClockwiseSweep) : counterClockwiseSweep;
        return arcRadius * sweep;
    }

    if(wallTool_mode === "ellipse3pt" && wallTool_stagePoints.length >= 3) {
        var majorLen = wallTool_pointDistance(wallTool_stagePoints[0], wallTool_stagePoints[1]);
        var minorLen = wallTool_pointDistance(wallTool_stagePoints[0], wallTool_stagePoints[2]);
        if(majorLen <= 0 || minorLen <= 0) return 0;
        // Ramanujan's approximation is accurate enough for a wall-count limit.
        return Math.PI * (3 * (majorLen + minorLen) - Math.sqrt((3 * majorLen + minorLen) * (majorLen + 3 * minorLen)));
    }

    return 0;
}

function wallTool_refreshCountInput(warnIfReduced) {
    var el = document.getElementById("dWallSegments");
    if(!el) return WALL_TOOL_MIN_SEGMENTS;
    var limit = wallTool_wallCountLimit(wallTool_getDraftPerimeter());
    return wallTool_applyCountLimit(limit, warnIfReduced);
}

function wallTool_finalizePoints(points) {
    if(!points || points.length < 2) return false;
    var wall = new Wall();
    wall.height = wallTool_getHeight();
    wall.points = points;
    wallTool_clearPreview();
    wallTool_clearCurrentWall();
    wallTool_stagePoints = [];
    wallTool_step = 0;
    aamap_add(wall);
    wall.render();
    aamap_recordAction({
        label: "Add wall",
        undo: function() { _aamap_removeObj(wall); vectron_render(); },
        redo: function() { aamap_objects.push(wall); vectron_render(); }
    });
    vectron_toolActive = false;
    wallTool_updateWindow();
    return true;
}

function wallTool_completeShape() {
    if(wallTool_mode === "text") {
        if(wallTool_stagePoints.length < 2) {
            gui_writeLog("Click two corners before submitting text walls.");
            return;
        }
        var draftWallPoints = wallTool_buildTextWalls(wallTool_stagePoints, wallTool_getTextInput());
        if(draftWallPoints === null) {
            gui_writeLog("Text box must have a width and a height.");
            return;
        }
        if(draftWallPoints.length === 0) {
            gui_writeLog("Enter text before submitting.");
            return;
        }
        var addedTextWalls = [];
        for(var tw = 0; tw < draftWallPoints.length; tw++) {
            var wall = new Wall();
            wall.height = wallTool_getHeight();
            wall.points = draftWallPoints[tw];
            addedTextWalls.push(wall);
            aamap_add(wall);
        }
        wallTool_clearPreview();
        wallTool_stagePoints = [];
        wallTool_step = 0;
        wallTool_currentObj = null;
        vectron_toolActive = false;
        aamap_recordAction({
            label: "Add text walls",
            undo: function() {
                addedTextWalls.forEach(function(wall) {
                    wall.isSelected = false;
                    _aamap_removeObj(wall);
                });
                selectTool_selectedObjs = [];
                selectTool_hoveredSet = null;
                selectTool_hoveredAamapObj = null;
                vectron_render();
            },
            redo: function() {
                addedTextWalls.forEach(function(wall) {
                    aamap_objects.push(wall);
                });
                wallTool_selectWalls(addedTextWalls);
                vectron_render();
            }
        });
        wallTool_updateWindow();
        wallTool_renderCurrent();
        wallTool_selectWalls(addedTextWalls);
        vectron_render();
        if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
        return;
    }

    if(wallTool_mode === "circleCenter" && wallTool_stagePoints.length < 2) {
        gui_writeLog("Select a center point and a radius point first.");
        return;
    }
    if((wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt" || wallTool_mode === "ellipse3pt") && wallTool_stagePoints.length < 3) {
        gui_writeLog("Select all required points first.");
        return;
    }

    var pts = wallTool_getDraftPoints();
    if(!pts || pts.length < 2) {
        gui_writeLog("Not enough points to generate a wall.");
        return;
    }
    var count = wallTool_getSegmentInput();
    var limit = wallTool_refreshCountInput(true);
    if(count > limit) count = limit;

    var finalPts = pts;
    if(wallTool_mode === "circleCenter") {
        var g = wallTool_circleGeometry(wallTool_stagePoints[0], wallTool_stagePoints[1]);
        if(!g) { gui_writeLog("Circle radius must be greater than 0."); return; }
        finalPts = wallTool_circlePoints(g.center, g.radius, count, g.startAngle);
    } else if(wallTool_mode === "circle3pt") {
        var center = wallTool_circumcenter(wallTool_stagePoints[0], wallTool_stagePoints[1], wallTool_stagePoints[2]);
        if(!center) { gui_writeLog("Those points do not form a circle."); return; }
        finalPts = wallTool_circlePoints(center, wallTool_pointDistance(center, wallTool_stagePoints[0]), count, Math.atan2(wallTool_stagePoints[0].y - center.y, wallTool_stagePoints[0].x - center.x));
    } else if(wallTool_mode === "arc3pt") {
        var arcCenter = wallTool_circumcenter(wallTool_stagePoints[0], wallTool_stagePoints[1], wallTool_stagePoints[2]);
        if(!arcCenter) { gui_writeLog("Those points do not form an arc."); return; }
        var arcRadius = wallTool_pointDistance(arcCenter, wallTool_stagePoints[0]);
        var startAngle = Math.atan2(wallTool_stagePoints[0].y - arcCenter.y, wallTool_stagePoints[0].x - arcCenter.x);
        var endAngle = Math.atan2(wallTool_stagePoints[1].y - arcCenter.y, wallTool_stagePoints[1].x - arcCenter.x);
        var radiusAngle = Math.atan2(wallTool_stagePoints[2].y - arcCenter.y, wallTool_stagePoints[2].x - arcCenter.x);
        var counterClockwiseSweep = wallTool_angleDiff(startAngle, endAngle);
        var radiusSweep = wallTool_angleDiff(startAngle, radiusAngle);
        var clockwise = (radiusSweep > counterClockwiseSweep);
        finalPts = wallTool_arcPoints(arcCenter, arcRadius, startAngle, endAngle, count, clockwise);
    } else if(wallTool_mode === "ellipse3pt") {
        finalPts = wallTool_ellipsePoints(wallTool_stagePoints[0], wallTool_stagePoints[1], wallTool_stagePoints[2], count);
        if(!finalPts) {
            gui_writeLog("Ellipse axes must be greater than 0.");
            return;
        }
    } else {
        gui_writeLog("Unsupported wall tool mode.");
        return;
    }

    wallTool_finalizePoints(finalPts);
}

function wallTool_handleShapeClick() {
    var pt = new WallPoint(
        aamap_mapX(cursor_realX),
        aamap_mapY(cursor_realY)
    );

    if((wallTool_mode === "circleCenter" && wallTool_stagePoints.length >= 2) ||
        ((wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt" || wallTool_mode === "ellipse3pt") && wallTool_stagePoints.length >= 3)) {
        wallTool_renderCurrent();
        return;
    }

    if(wallTool_mode === "rect2") {
        wallTool_stagePoints.push(pt);
        wallTool_step = wallTool_stagePoints.length;
        if(wallTool_stagePoints.length >= 2) {
            wallTool_finalizePoints(wallTool_makeRectangle(wallTool_stagePoints[0], wallTool_stagePoints[1]));
            return;
        }
        vectron_toolActive = true;
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }

    if(wallTool_mode === "centerRect") {
        wallTool_stagePoints.push(pt);
        wallTool_step = wallTool_stagePoints.length;
        if(wallTool_stagePoints.length >= 2) {
            wallTool_finalizePoints(wallTool_makeCenterRectangle(wallTool_stagePoints[0], wallTool_stagePoints[1]));
            return;
        }
        vectron_toolActive = true;
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }

    if(wallTool_mode === "circleCenter") {
        wallTool_stagePoints.push(pt);
        wallTool_step = wallTool_stagePoints.length;
        if(wallTool_stagePoints.length >= 2) {
            wallTool_step = 2;
            vectron_toolActive = true;
            wallTool_refreshCountInput(false);
            wallTool_updateWindow();
            var countEl = document.getElementById("dWallSegments");
            if(countEl) { countEl.focus(); countEl.select(); }
            wallTool_renderCurrent();
            return;
        }
        vectron_toolActive = true;
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }

    if(wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt" || wallTool_mode === "ellipse3pt") {
        wallTool_stagePoints.push(pt);
        wallTool_step = wallTool_stagePoints.length;
        if(wallTool_stagePoints.length >= 3) {
            wallTool_step = 3;
            vectron_toolActive = true;
            wallTool_refreshCountInput(false);
            wallTool_updateWindow();
            var countEl2 = document.getElementById("dWallSegments");
            if(countEl2) { countEl2.focus(); countEl2.select(); }
            wallTool_renderCurrent();
            return;
        }
        vectron_toolActive = true;
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }

    if(wallTool_mode === "text") {
        if(wallTool_stagePoints.length >= 2) {
            wallTool_renderCurrent();
            return;
        }
        wallTool_stagePoints.push(pt);
        wallTool_step = wallTool_stagePoints.length;
        if(wallTool_stagePoints.length >= 2) {
            wallTool_step = 2;
            vectron_toolActive = true;
            wallTool_updateWindow();
            wallTool_renderCurrent();
            return;
        }
        vectron_toolActive = true;
        wallTool_updateWindow();
        wallTool_renderCurrent();
        return;
    }
}

function wallTool_handleFreeformClick() {
    if(!vectron_toolActive) {
        wallTool_currentObj = new Wall();
        wallTool_currentObj.height = wallTool_getHeight();
        wallTool_currentObj.points.push(
            new WallPoint(
                aamap_mapX(cursor_realX),
                aamap_mapY(cursor_realY))
        );
        wallTool_currentObj.render();
        vectron_toolActive = true;
        wallTool_updatePointsList();
        return;
    }

    var newX = Math.round(100 * aamap_mapX(cursor_realX)) / 100;
    var newY = Math.round(100 * aamap_mapY(cursor_realY)) / 100;
    var prevPoint = wallTool_currentObj.points[wallTool_currentObj.points.length - 1];
    if(newX == prevPoint.x && newY == prevPoint.y) {
        gui_writeLog("Prevented Duplicate points.");
        return;
    }
    wallTool_currentObj.points.push(new WallPoint(newX, newY));
    wallTool_currentObj.render();
    wallTool_updatePointsList();
}

function wallTool_handleClick() {
    if(wallTool_mode === "freeform") {
        wallTool_handleFreeformClick();
    } else {
        wallTool_handleShapeClick();
    }
}

function wallTool_renderCurrent() {
    if(wallTool_mode === "freeform") {
        if(vectron_toolActive && wallTool_currentObj != null) {
            wallTool_currentObj.render();
            wallTool_currentObj.guide();
        }
        wallTool_updatePointsList();
        return;
    }

    if(wallTool_mode === "text") {
        var previewWallPoints = wallTool_getDraftPoints(
            wallTool_stagePoints.length >= 1 ? new WallPoint(aamap_mapX(cursor_realX), aamap_mapY(cursor_realY)) : null
        );
        if(!previewWallPoints || previewWallPoints.length === 0) {
            wallTool_clearPreview();
            wallTool_updatePointsList();
            return;
        }
        wallTool_drawPreviewSegments(previewWallPoints);
        wallTool_updatePointsList();
        return;
    }

    var pts = wallTool_getDraftPoints(
        (wallTool_mode === "rect2" || wallTool_mode === "centerRect") ? new WallPoint(aamap_mapX(cursor_realX), aamap_mapY(cursor_realY)) :
        (wallTool_mode === "circleCenter" && wallTool_stagePoints.length >= 1) ? new WallPoint(aamap_mapX(cursor_realX), aamap_mapY(cursor_realY)) :
        (wallTool_mode === "circle3pt" || wallTool_mode === "arc3pt" || wallTool_mode === "ellipse3pt") ? new WallPoint(aamap_mapX(cursor_realX), aamap_mapY(cursor_realY)) :
        null
    );

    if(!pts || pts.length < 2) {
        wallTool_clearPreview();
        wallTool_updatePointsList();
        return;
    }

    wallTool_drawPreview(pts);
    wallTool_updatePointsList();
}

function wallTool_start() {
    if(wallTool_mode !== "freeform") {
        wallTool_handleShapeClick();
        return;
    }
    wallTool_handleFreeformClick();
}

function wallTool_progress() {
    if(wallTool_mode !== "freeform") {
        wallTool_renderCurrent();
        return;
    }
    if(!vectron_toolActive || wallTool_currentObj == null) return;
    var newX = Math.round(100 * aamap_mapX(cursor_realX)) / 100;
    var newY = Math.round(100 * aamap_mapY(cursor_realY)) / 100;
    var prevPoint = wallTool_currentObj.points[wallTool_currentObj.points.length - 1];
    if(newX == prevPoint.x && newY == prevPoint.y) {
        return;
    }
    wallTool_currentObj.points.push(new WallPoint(newX, newY));
    wallTool_currentObj.render();
    wallTool_updatePointsList();
}

function wallTool_complete() {
    if(wallTool_mode !== "freeform") {
        wallTool_completeShape();
        return;
    }
    wallTool_progress();
    if(wallTool_currentObj == null) return;
    if(wallTool_currentObj.points.length < 2) {
        wallTool_currentObj.obj.remove();
        wallTool_currentObj.guideObj.remove();
        wallTool_currentObj = null;
        vectron_toolActive = false;
        gui_writeLog("Wall canceled, < 2 points");
        wallTool_updatePointsList();
        return;
    } else {
        var last = wallTool_currentObj.points[wallTool_currentObj.points.length-1];
        var secLast = wallTool_currentObj.points[wallTool_currentObj.points.length-2];
        if(last.x == secLast.x && last.y == secLast.y) {
            wallTool_currentObj.points.pop();
            gui_writeLog("Removed duplicate point at end of wall.");
        }
    }
    wallTool_currentObj.guideObj.remove();
    var completedWall = wallTool_currentObj;
    aamap_add(completedWall);
    aamap_recordAction({
        label: "Add wall",
        undo: function() { _aamap_removeObj(completedWall); vectron_render(); },
        redo: function() { aamap_objects.push(completedWall); vectron_render(); }
    });
    wallTool_currentObj = null;
    vectron_toolActive = false;
    wallTool_updatePointsList();
    vectron_render();
}

function wallTool_finishWall() {
    if(wallTool_mode !== "freeform") {
        wallTool_completeShape();
        return;
    }
    if(wallTool_currentObj == null) return;
    if(wallTool_currentObj.points.length < 2) {
        wallTool_currentObj.obj.remove();
        wallTool_currentObj.guideObj.remove();
        wallTool_currentObj = null;
        vectron_toolActive = false;
        gui_writeLog("Wall canceled, < 2 points");
        wallTool_updatePointsList();
        return;
    }
    wallTool_currentObj.guideObj.remove();
    var completedWall = wallTool_currentObj;
    aamap_add(completedWall);
    aamap_recordAction({
        label: "Add wall",
        undo: function() { _aamap_removeObj(completedWall); vectron_render(); },
        redo: function() { aamap_objects.push(completedWall); vectron_render(); }
    });
    wallTool_currentObj = null;
    vectron_toolActive = false;
    wallTool_updatePointsList();
    vectron_render();
}

function wallTool_disconnect(keepWindowOpen) {
    wallTool_clearPreview();
    wallTool_clearCurrentWall();
    wallTool_step = 0;
    wallTool_stagePoints = [];
    vectron_toolActive = false;
    $(".toolbar-toolWall").removeClass("toolbar-tool-active");
    if(!keepWindowOpen) {
        $("#wall-tool-window").hide();
    }
    gui_refreshFloatingWindows();
}

function wallTool_connect() {
    $(".toolbar-toolWall").addClass("toolbar-tool-active");
    $("#wall-tool-window").show();
    if(!wallTool_mode) wallTool_mode = "freeform";
    wallTool_updateWindow();
    wallTool_renderCurrent();
    gui_refreshFloatingWindows();
}

/** Update the points/walls list in the wall tool popover */
function wallTool_updatePointsList() {
    var wall = wallTool_currentObj;
    var listEl = document.getElementById('wall-tool-points-list');
    var section = document.getElementById('wall-tool-points-section');
    var finishBtn = document.getElementById('wall-tool-finish');
    if (!listEl) return;
    if (!section || !finishBtn) return;

    if(wallTool_mode !== "freeform") {
        section.style.display = 'none';
        listEl.innerHTML = '';
        return;
    }

    if (!wall || wall.points.length === 0) {
        section.style.display = 'none';
        finishBtn.style.display = 'none';
        listEl.innerHTML = '';
        return;
    }

    section.style.display = '';
    finishBtn.style.display = (wall.points.length >= 2) ? '' : 'none';
    listEl.innerHTML = '';

    for (var i = 0; i < wall.points.length; i++) {
        (function(idx) {
            var pt = wall.points[idx];
            var div = document.createElement('div');
            div.className = 'wtp-point';

            var lbl = document.createElement('span');
            lbl.textContent = (idx + 1) + ':';
            lbl.style.cssText = 'min-width:18px;font-weight:bold;font-size:11px;';

            var xIn = document.createElement('input');
            xIn.type = 'number';
            xIn.value = Math.round(pt.x * 100) / 100;
            xIn.step = '1';
            xIn.title = 'X';

            var yIn = document.createElement('input');
            yIn.type = 'number';
            yIn.value = Math.round(pt.y * 100) / 100;
            yIn.step = '1';
            yIn.title = 'Y';

            function applyCoords() {
                var nx = parseFloat(xIn.value);
                var ny = parseFloat(yIn.value);
                if(!isNaN(nx)) wall.points[idx].x = nx;
                if(!isNaN(ny)) wall.points[idx].y = ny;
                wall.render();
                vectron_render();
            }
            xIn.addEventListener('change', applyCoords);
            yIn.addEventListener('change', applyCoords);

            div.appendChild(lbl);
            div.appendChild(document.createTextNode('x:'));
            div.appendChild(xIn);
            div.appendChild(document.createTextNode(' y:'));
            div.appendChild(yIn);
            listEl.appendChild(div);

            // Show wall segment length after each point except last
            if (idx < wall.points.length - 1) {
                var next = wall.points[idx + 1];
                var dx = next.x - pt.x;
                var dy = next.y - pt.y;
                var len = Math.sqrt(dx * dx + dy * dy);
                var wallDiv = document.createElement('div');
                wallDiv.className = 'wtp-wall';
                wallDiv.style.cssText = 'color:#aaa;font-size:10px;padding-left:20px;';
                wallDiv.textContent = '→ wall ' + (idx + 1) + '-' + (idx + 2) + ': ' + len.toFixed(2);
                listEl.appendChild(wallDiv);
            }
        })(i);
    }
}


/**
 * Finish the current wall WITHOUT adding a new point.
 * Used by the "Finish Wall" button click — as opposed to wallTool_complete()
 * which is invoked by a double-click and intentionally adds the cursor position
 * as a final point before closing.
 */

/**
 * Splits all walls at grid line intersections based on the current grid spacing.
 */
function wallTool_splitByGrid() {
    var gs = vectron_grid_spacing;
    if(gs <= 0) {
        alert("Grid must be enabled to split walls.");
        return;
    }

    var newObjects = [];
    var toRemove = [];

    for(var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if(!(obj instanceof Wall)) {
            newObjects.push(obj);
            continue;
        }

        toRemove.push(obj);
        var currentWallPoints = [obj.points[0]];

        for(var j = 0; j < obj.points.length - 1; j++) {
            var p1 = obj.points[j];
            var p2 = obj.points[j + 1];

            // Find all grid intersections along this segment
            var intersections = [];

            var x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
            var dx = x2 - x1, dy = y2 - y1;

            // Vertical grid lines
            if(Math.abs(dx) > 1e-9) {
                var startGx = Math.ceil(Math.min(x1, x2) / gs);
                var endGx = Math.floor(Math.max(x1, x2) / gs);
                for(var gx = startGx; gx <= endGx; gx++) {
                    var gxVal = gx * gs;
                    if(Math.abs(gxVal - x1) < 1e-9 || Math.abs(gxVal - x2) < 1e-9) continue;
                    var t = (gxVal - x1) / dx;
                    if(t > 1e-9 && t < 1 - 1e-9) {
                        intersections.push({t: t, x: gxVal, y: y1 + t * dy});
                    }
                }
            }

            // Horizontal grid lines
            if(Math.abs(dy) > 1e-9) {
                var startGy = Math.ceil(Math.min(y1, y2) / gs);
                var endGy = Math.floor(Math.max(y1, y2) / gs);
                for(var gy = startGy; gy <= endGy; gy++) {
                    var gyVal = gy * gs;
                    if(Math.abs(gyVal - y1) < 1e-9 || Math.abs(gyVal - y2) < 1e-9) continue;
                    var t2 = (gyVal - y1) / dy;
                    if(t2 > 1e-9 && t2 < 1 - 1e-9) {
                        intersections.push({t: t2, x: x1 + t2 * dx, y: gyVal});
                    }
                }
            }

            // Sort intersections by parameter t
            intersections.sort(function(a, b) { return a.t - b.t; });

            // Remove duplicate intersections
            var unique = [];
            for(var k = 0; k < intersections.length; k++) {
                if(unique.length === 0 || Math.abs(intersections[k].t - unique[unique.length-1].t) > 1e-9) {
                    unique.push(intersections[k]);
                }
            }

            // Add intersection points to the current segment
            for(var k = 0; k < unique.length; k++) {
                currentWallPoints.push(new WallPoint(
                    Math.round(unique[k].x * 1e6) / 1e6,
                    Math.round(unique[k].y * 1e6) / 1e6
                ));

                // Start a new wall at each intersection
                var splitWall = new Wall();
                splitWall.points = currentWallPoints.slice();
                splitWall.height = obj.height;
                newObjects.push(splitWall);
                currentWallPoints = [currentWallPoints[currentWallPoints.length - 1]];
            }

            currentWallPoints.push(p2);
        }

        // Finish the last wall segment
        if(currentWallPoints.length >= 2) {
            var finalWall = new Wall();
            finalWall.points = currentWallPoints.slice();
            finalWall.height = obj.height;
            newObjects.push(finalWall);
        }
    }

    aamap_objects = newObjects;
    vectron_render();
    gui_writeLog("Walls split at grid lines.");
}
