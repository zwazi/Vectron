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
 * Wall Join Tool
 *
 * Step 1: User clicks a wall to select it as the first wall.
 * Step 2: User clicks a second wall that shares at least one endpoint with the first.
 *         The tool figures out which ends connect, reverses walls as needed, and merges them.
 */

var joinTool_selecting = false;
var joinTool_selectionStartMapX = null;
var joinTool_selectionStartMapY = null;
var joinTool_selectionCurrentMapX = null;
var joinTool_selectionCurrentMapY = null;
var joinTool_selectionBox = null;
var joinTool_highlightA = null;
var joinTool_highlightB = null;

var JOIN_TOLERANCE = 0.1; // map units – endpoints within this distance are considered touching

function joinTool_connect() {
    $(".toolbar-toolJoin").addClass("toolbar-tool-active");
    cursor_active = false;
    joinTool_cancelSelection();
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
}

function joinTool_disconnect() {
    joinTool_cancelSelection();
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
    cursor_active = true;
    vectron_toolActive = false;
    $(".toolbar-toolJoin").removeClass("toolbar-tool-active");
}

function joinTool_cancelSelection() {
    joinTool_selecting = false;
    joinTool_selectionStartMapX = null;
    joinTool_selectionStartMapY = null;
    joinTool_selectionCurrentMapX = null;
    joinTool_selectionCurrentMapY = null;
    if (joinTool_selectionBox) { joinTool_selectionBox.remove(); joinTool_selectionBox = null; }
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
}

function joinTool_clearHighlightA() {
    if (joinTool_highlightA) { joinTool_highlightA.remove(); joinTool_highlightA = null; }
}

function joinTool_clearHighlightB() {
    if (joinTool_highlightB) { joinTool_highlightB.remove(); joinTool_highlightB = null; }
}

function joinTool_clearSelectionBox() {
    if (joinTool_selectionBox) { joinTool_selectionBox.remove(); joinTool_selectionBox = null; }
}

function joinTool_drawSelectionBox() {
    joinTool_clearSelectionBox();
    if (joinTool_selectionStartMapX == null || joinTool_selectionStartMapY == null ||
        joinTool_selectionCurrentMapX == null || joinTool_selectionCurrentMapY == null) {
        return;
    }
    var left = Math.min(joinTool_selectionStartMapX, joinTool_selectionCurrentMapX);
    var top = Math.max(joinTool_selectionStartMapY, joinTool_selectionCurrentMapY);
    var right = Math.max(joinTool_selectionStartMapX, joinTool_selectionCurrentMapX);
    var bottom = Math.min(joinTool_selectionStartMapY, joinTool_selectionCurrentMapY);
    joinTool_selectionBox = vectron_screen.rect(
        aamap_realX(left),
        aamap_realY(top),
        Math.max(0, aamap_realX(right) - aamap_realX(left)),
        Math.max(0, aamap_realY(bottom) - aamap_realY(top))
    ).attr({
        stroke: '#51a0ff',
        'stroke-width': 1,
        'stroke-dasharray': '--',
        fill: '#51a0ff',
        'fill-opacity': 0.12
    });
}

function joinTool_drawWallPath(wall, color, width) {
    var arr = [];
    for (var i = 0; i < wall.points.length; i++) {
        arr.push(i === 0 ? 'M' : 'L');
        arr.push(aamap_realX(wall.points[i].x));
        arr.push(aamap_realY(wall.points[i].y));
    }
    return vectron_screen.path(arr).attr({
        stroke: color,
        'stroke-width': width || 3,
        'stroke-opacity': 0.8
    });
}

/** Find which wall is nearest to the cursor (same logic as split tool). */
function joinTool_findHoveredWall() {
    var mapX = aamap_mapX(cursor_neverSnappedX);
    var mapY = aamap_mapY(cursor_neverSnappedY);
    var threshold = 8 / vectron_zoom;

    var best = null;
    var bestDist = threshold;
    for (var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if (!(obj instanceof Wall)) continue;
        // nearest point on polyline
        var dist = joinTool_distToWall(obj, mapX, mapY);
        if (dist < bestDist) {
            bestDist = dist;
            best = obj;
        }
    }
    return best;
}

function joinTool_distToWall(wall, mapX, mapY) {
    var best = Infinity;
    for (var j = 0; j < wall.points.length - 1; j++) {
        var p1 = wall.points[j];
        var p2 = wall.points[j + 1];
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var len2 = dx * dx + dy * dy;
        var t = 0;
        if (len2 > 1e-12) {
            t = ((mapX - p1.x) * dx + (mapY - p1.y) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
        }
        var nx = p1.x + t * dx;
        var ny = p1.y + t * dy;
        var d = Math.sqrt((mapX - nx) * (mapX - nx) + (mapY - ny) * (mapY - ny));
        if (d < best) best = d;
    }
    return best;
}

function joinTool_ptEq(a, b) {
    return Math.abs(a.x - b.x) <= JOIN_TOLERANCE && Math.abs(a.y - b.y) <= JOIN_TOLERANCE;
}

function joinTool_getWallBounds(wall) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (!wall || !wall.points || wall.points.length === 0) return null;
    for (var i = 0; i < wall.points.length; i++) {
        var pt = wall.points[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }
    return { left: minX, right: maxX, top: maxY, bottom: minY };
}

function joinTool_rectsOverlap(a, b) {
    if (!a || !b) return false;
    return !(a.right < b.left || a.left > b.right || a.top < b.bottom || a.bottom > b.top);
}

function joinTool_findWallsInSelectionBox() {
    if (joinTool_selectionStartMapX == null || joinTool_selectionStartMapY == null ||
        joinTool_selectionCurrentMapX == null || joinTool_selectionCurrentMapY == null) {
        return [];
    }
    var bounds = {
        left: Math.min(joinTool_selectionStartMapX, joinTool_selectionCurrentMapX),
        right: Math.max(joinTool_selectionStartMapX, joinTool_selectionCurrentMapX),
        top: Math.max(joinTool_selectionStartMapY, joinTool_selectionCurrentMapY),
        bottom: Math.min(joinTool_selectionStartMapY, joinTool_selectionCurrentMapY)
    };
    var walls = [];
    for (var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if (!(obj instanceof Wall)) continue;
        var wallBounds = joinTool_getWallBounds(obj);
        if (joinTool_rectsOverlap(bounds, wallBounds)) {
            walls.push(obj);
        }
    }
    return walls;
}

function joinTool_mergePair(wallA, wallB, desc) {
    var ptsA = wallA.points.slice();
    var ptsB = wallB.points.slice();

    if (desc.reverseA) ptsA.reverse();
    if (desc.reverseB) ptsB.reverse();

    var combined = desc.swap ? ptsB.concat(ptsA.slice(1)) : ptsA.concat(ptsB.slice(1));
    var merged = new Wall();
    merged.height = wallA.height;
    merged.points = combined;
    return merged;
}

function joinTool_joinWalls(selectedWalls) {
    var working = selectedWalls.slice();
    var mergedAny = false;
    var joinedOriginals = [];

    function markJoined(wall) {
        if (joinedOriginals.indexOf(wall) === -1) joinedOriginals.push(wall);
    }

    var progress = true;
    while(progress) {
        progress = false;
        outer: for (var i = 0; i < working.length; i++) {
            for (var j = i + 1; j < working.length; j++) {
                var desc = joinTool_findJoin(working[i], working[j]);
                if (!desc) continue;
                markJoined(working[i]);
                markJoined(working[j]);
                var merged = joinTool_mergePair(working[i], working[j], desc);
                working.splice(j, 1);
                working.splice(i, 1);
                working.push(merged);
                mergedAny = true;
                progress = true;
                break outer;
            }
        }
    }

    return {
        mergedAny: mergedAny,
        joinedOriginals: joinedOriginals,
        finalWalls: working
    };
}

/** Check if two walls share an endpoint. Returns a join descriptor or null. */
function joinTool_findJoin(wallA, wallB) {
    var aFirst = wallA.points[0];
    var aLast  = wallA.points[wallA.points.length - 1];
    var bFirst = wallB.points[0];
    var bLast  = wallB.points[wallB.points.length - 1];

    // A.last connects B.first  →  A + B
    if (joinTool_ptEq(aLast, bFirst))
        return { reverseA: false, reverseB: false };

    // A.last connects B.last   →  A + rev(B)
    if (joinTool_ptEq(aLast, bLast))
        return { reverseA: false, reverseB: true };

    // A.first connects B.first →  rev(A) + B
    if (joinTool_ptEq(aFirst, bFirst))
        return { reverseA: true, reverseB: false };

    // A.first connects B.last  →  B + A  (swap concat order so junction removed correctly)
    if (joinTool_ptEq(aFirst, bLast))
        return { reverseA: false, reverseB: false, swap: true };

    return null;
}

/** Called on mouse move. */
function joinTool_guide() {
    if (joinTool_selecting) {
        joinTool_drawSelectionBox();
        return;
    }
    joinTool_clearHighlightB();
    var hovered = joinTool_findHoveredWall();
    if (hovered) {
        joinTool_highlightB = joinTool_drawWallPath(hovered, '#ffcc00', 3);
    }
}

function joinTool_start() {
    joinTool_selecting = true;
    joinTool_selectionStartMapX = aamap_mapX(cursor_realX);
    joinTool_selectionStartMapY = aamap_mapY(cursor_realY);
    joinTool_selectionCurrentMapX = joinTool_selectionStartMapX;
    joinTool_selectionCurrentMapY = joinTool_selectionStartMapY;
    joinTool_clearSelectionBox();
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
    vectron_toolActive = true;
    joinTool_drawSelectionBox();
}

function joinTool_progress() {
    if (!joinTool_selecting) return;
    joinTool_selectionCurrentMapX = aamap_mapX(cursor_realX);
    joinTool_selectionCurrentMapY = aamap_mapY(cursor_realY);
    joinTool_drawSelectionBox();
}

function joinTool_finish() {
    if (!joinTool_selecting) {
        var wall = joinTool_findHoveredWall();
        if (!wall) return;
        joinTool_selecting = true;
        joinTool_selectionStartMapX = aamap_mapX(cursor_realX);
        joinTool_selectionStartMapY = aamap_mapY(cursor_realY);
        joinTool_selectionCurrentMapX = joinTool_selectionStartMapX;
        joinTool_selectionCurrentMapY = joinTool_selectionStartMapY;
    } else {
        joinTool_selectionCurrentMapX = aamap_mapX(cursor_realX);
        joinTool_selectionCurrentMapY = aamap_mapY(cursor_realY);
    }

    var dragDx = Math.abs(joinTool_selectionCurrentMapX - joinTool_selectionStartMapX);
    var dragDy = Math.abs(joinTool_selectionCurrentMapY - joinTool_selectionStartMapY);
    var selectedWalls = (dragDx < 0.1 && dragDy < 0.1) ? (function() {
        var hovered = joinTool_findHoveredWall();
        return hovered ? [hovered] : [];
    })() : joinTool_findWallsInSelectionBox();

    joinTool_clearSelectionBox();
    joinTool_selecting = false;
    vectron_toolActive = false;

    if (!selectedWalls.length) {
        joinTool_cancelSelection();
        vectron_render();
        gui_writeLog("Join Tool: no walls selected.");
        return;
    }

    var result = joinTool_joinWalls(selectedWalls);
    if (!result.mergedAny) {
        var failedOnly = selectedWalls.length;
        if (failedOnly > 0) {
            gui_toast("Unable to join (" + failedOnly + ") walls");
        }
        vectron_render();
        return;
    }

    for (var i = 0; i < selectedWalls.length; i++) {
        _aamap_removeObj(selectedWalls[i]);
    }
    for (var j = 0; j < result.finalWalls.length; j++) {
        aamap_objects.push(result.finalWalls[j]);
    }

    var originalWalls = selectedWalls.slice();
    var finalWalls = result.finalWalls.slice();
    aamap_recordAction({
        label: "Join walls",
        undo: function() {
            finalWalls.forEach(function(w) { _aamap_removeObj(w); });
            originalWalls.forEach(function(w) { aamap_objects.push(w); });
            vectron_render();
        },
        redo: function() {
            originalWalls.forEach(function(w) { _aamap_removeObj(w); });
            finalWalls.forEach(function(w) { aamap_objects.push(w); });
            vectron_render();
        }
    });

    var failedCount = selectedWalls.filter(function(w) { return result.joinedOriginals.indexOf(w) === -1; }).length;
    if (failedCount > 0) {
        gui_toast("Unable to join (" + failedCount + ") walls");
    } else {
        gui_writeLog("Join Tool: walls joined successfully.");
    }
    vectron_render();
}
