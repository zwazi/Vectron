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

var joinTool_firstWall = null;
var joinTool_highlightA = null;
var joinTool_highlightB = null;

var JOIN_TOLERANCE = 0.1; // map units – endpoints within this distance are considered touching

function joinTool_connect() {
    $(".toolbar-toolJoin").addClass("toolbar-tool-active");
    cursor_active = false;
    joinTool_firstWall = null;
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
}

function joinTool_disconnect() {
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
    joinTool_firstWall = null;
    cursor_active = true;
    vectron_toolActive = false;
    $(".toolbar-toolJoin").removeClass("toolbar-tool-active");
}

function joinTool_clearHighlightA() {
    if (joinTool_highlightA) { joinTool_highlightA.remove(); joinTool_highlightA = null; }
}

function joinTool_clearHighlightB() {
    if (joinTool_highlightB) { joinTool_highlightB.remove(); joinTool_highlightB = null; }
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

    // A.first connects B.last  →  rev(A) + B  (equivalent to B + A with no reversal)
    if (joinTool_ptEq(aFirst, bLast))
        return { reverseA: true, reverseB: false };

    // A.first connects B.first →  rev(A) + B (after reversing A, A.last == A.first_orig == B.first)
    if (joinTool_ptEq(aFirst, bFirst))
        return { reverseA: true, reverseB: false };

    return null;
}

/** Called on mouse move. */
function joinTool_guide() {
    joinTool_clearHighlightB();
    if (joinTool_firstWall) {
        var hovered = joinTool_findHoveredWall();
        if (hovered && hovered !== joinTool_firstWall) {
            var canJoin = joinTool_findJoin(joinTool_firstWall, hovered) !== null;
            joinTool_highlightB = joinTool_drawWallPath(hovered, canJoin ? '#00ff88' : '#ff4444', 3);
        }
    } else {
        var hovered = joinTool_findHoveredWall();
        if (hovered) {
            joinTool_highlightB = joinTool_drawWallPath(hovered, '#ffcc00', 3);
        }
    }
}

/** Called on canvas click. */
function joinTool_click() {
    var wall = joinTool_findHoveredWall();

    if (!joinTool_firstWall) {
        if (!wall) return;
        joinTool_firstWall = wall;
        joinTool_clearHighlightA();
        joinTool_clearHighlightB();
        joinTool_highlightA = joinTool_drawWallPath(wall, '#ff6600', 3);
        vectron_toolActive = true;
        gui_writeLog("Join Tool: first wall selected. Now select the second wall.");
        return;
    }

    // Clicking the same wall deselects
    if (wall === joinTool_firstWall) {
        joinTool_firstWall = null;
        vectron_toolActive = false;
        joinTool_clearHighlightA();
        joinTool_clearHighlightB();
        gui_writeLog("Join Tool: deselected first wall.");
        return;
    }

    if (!wall) {
        gui_writeLog("Join Tool: no wall found at cursor.");
        return;
    }

    var desc = joinTool_findJoin(joinTool_firstWall, wall);
    if (!desc) {
        gui_writeLog("Join Tool: walls do not share an endpoint (within tolerance " + JOIN_TOLERANCE + ").");
        return;
    }

    var ptsA = joinTool_firstWall.points.slice();
    var ptsB = wall.points.slice();

    if (desc.reverseA) ptsA.reverse();
    if (desc.reverseB) ptsB.reverse();

    // When A.first connects B.first we actually want rev(A) + B,
    // but after reverseA is applied ptsA is already reversed, so A.last now connects B.first — standard join.
    // Special-case swapOrder means we needed rev(A) + B where A.first==B.first:
    // after reversing A: aLast_new == aFirst_old == bFirst → just concat.
    var combined = ptsA.concat(ptsB.slice(1));

    var merged = new Wall();
    merged.height = joinTool_firstWall.height;
    merged.points = combined;

    // Remove both originals. Remove idxA first; if idxB was after idxA the
    // splice shifts all later indices down by one, so decrement idxB.
    var idxA = aamap_objects.indexOf(joinTool_firstWall);
    if (idxA >= 0) aamap_objects.splice(idxA, 1);
    var idxB = aamap_objects.indexOf(wall);
    if (idxB >= 0) aamap_objects.splice(idxB, 1);
    aamap_objects.push(merged);

    var origA = joinTool_firstWall, origB = wall, wM = merged;
    aamap_recordAction({
        undo: function() {
            _aamap_removeObj(wM);
            aamap_objects.push(origA); aamap_objects.push(origB);
            vectron_render();
        },
        redo: function() {
            _aamap_removeObj(origA); _aamap_removeObj(origB);
            aamap_objects.push(wM);
            vectron_render();
        }
    });

    joinTool_firstWall = null;
    vectron_toolActive = false;
    joinTool_clearHighlightA();
    joinTool_clearHighlightB();
    vectron_render();
    gui_writeLog("Join Tool: walls joined successfully.");
}
