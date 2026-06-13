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
 * Wall Split Tool
 *
 * Step 1: User clicks on a wall to select it (all other walls deselected).
 * Step 2: User clicks a point on the selected wall to split it into 2 walls.
 *         If grid snap is on the point is snapped; otherwise it can be anywhere on the wall.
 */

var splitTool_selectedWall = null;
var splitTool_guideObj = null;
var splitTool_highlightObj = null;
var splitTool_hoveredWall = null;

/** Minimum parametric distance from a segment endpoint to allow splitting (avoids zero-length walls). */
var SPLIT_ENDPOINT_TOLERANCE = 1e-6;

function splitTool_connect() {
    $(".toolbar-toolSplit").addClass("toolbar-tool-active");
    cursor_active = false;
    splitTool_selectedWall = null;
    splitTool_hoveredWall = null;
    splitTool_addHoverAll();
}

function splitTool_disconnect() {
    splitTool_clearGuide();
    splitTool_clearHighlight();
    splitTool_selectedWall = null;
    splitTool_hoveredWall = null;
    cursor_active = true;
    vectron_toolActive = false;
    $(".toolbar-toolSplit").removeClass("toolbar-tool-active");
}

function splitTool_clearGuide() {
    if (splitTool_guideObj != null) {
        splitTool_guideObj.remove();
        splitTool_guideObj = null;
    }
}

function splitTool_clearHighlight() {
    if (splitTool_highlightObj != null) {
        splitTool_highlightObj.remove();
        splitTool_highlightObj = null;
    }
}

/** Find the nearest point on a wall's polyline to the given map coordinate.
 *  Returns {x, y, segIndex, t} or null if wall has < 2 points. */
function splitTool_nearestPointOnWall(wall, mapX, mapY) {
    var bestDist = Infinity;
    var bestPt = null;

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
        var dist = Math.sqrt((mapX - nx) * (mapX - nx) + (mapY - ny) * (mapY - ny));
        if (dist < bestDist) {
            bestDist = dist;
            bestPt = { x: nx, y: ny, segIndex: j, t: t, dist: bestDist };
        }
    }
    return bestPt;
}

/** Find which wall the cursor is hovering over (returns wall object or null). */
function splitTool_findHoveredWall() {
    var mapX = aamap_mapX(cursor_neverSnappedX);
    var mapY = aamap_mapY(cursor_neverSnappedY);
    var threshold = 8 / vectron_zoom; // 8 screen pixels tolerance in map units

    var best = null;
    var bestDist = threshold;
    for (var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if (!(obj instanceof Wall)) continue;
        var pt = splitTool_nearestPointOnWall(obj, mapX, mapY);
        if (pt && pt.dist < bestDist) {
            bestDist = pt.dist;
            best = obj;
        }
    }
    return best;
}

/** Draw hover highlight over a wall. */
function splitTool_drawHighlight(wall, color) {
    splitTool_clearHighlight();
    if (!wall) return;
    var arr = [];
    for (var i = 0; i < wall.points.length; i++) {
        arr.push(i === 0 ? 'M' : 'L');
        arr.push(aamap_realX(wall.points[i].x));
        arr.push(aamap_realY(wall.points[i].y));
    }
    splitTool_highlightObj = vectron_screen.path(arr).attr({
        stroke: color || '#ffcc00',
        'stroke-width': 3,
        'stroke-opacity': 0.7
    });
}

/** Draw guide dot at the projected split point on the selected wall. */
function splitTool_updateGuide() {
    splitTool_clearGuide();
    if (!splitTool_selectedWall) return;

    var mapX = aamap_mapX(cursor_snap ? cursor_realX : cursor_neverSnappedX);
    var mapY = aamap_mapY(cursor_snap ? cursor_realY : cursor_neverSnappedY);

    var pt = splitTool_nearestPointOnWall(splitTool_selectedWall, mapX, mapY);
    if (!pt) return;

    var rx = aamap_realX(pt.x);
    var ry = aamap_realY(pt.y);
    splitTool_guideObj = vectron_screen.circle(rx, ry, 5).attr({
        fill: '#ff6600',
        stroke: '#fff',
        'stroke-width': 1.5
    });
}

/** Called on mouse move. */
function splitTool_guide() {
    if (splitTool_selectedWall) {
        splitTool_updateGuide();
    } else {
        splitTool_clearGuide();
        var hovered = splitTool_findHoveredWall();
        if (hovered !== splitTool_hoveredWall) {
            splitTool_hoveredWall = hovered;
        }
        if (hovered) {
            splitTool_drawHighlight(hovered, '#ffcc00');
        } else {
            splitTool_clearHighlight();
        }
    }
}

/** Called on canvas click. */
function splitTool_click() {
    if (!splitTool_selectedWall) {
        // Step 1: select a wall
        var wall = splitTool_findHoveredWall();
        if (!wall) return;

        splitTool_selectedWall = wall;
        splitTool_drawHighlight(wall, '#ff6600');
        vectron_toolActive = true;
        gui_writeLog("Split Tool: wall selected. Click a point on it to split.");
        splitTool_updateGuide();
    } else {
        // Step 2: split the selected wall at the cursor point
        var mapX = aamap_mapX(cursor_snap ? cursor_realX : cursor_neverSnappedX);
        var mapY = aamap_mapY(cursor_snap ? cursor_realY : cursor_neverSnappedY);

        var pt = splitTool_nearestPointOnWall(splitTool_selectedWall, mapX, mapY);
        if (!pt) {
            gui_writeLog("Split Tool: could not find point on wall.");
            return;
        }

        // Don't split at an existing endpoint
        var wall = splitTool_selectedWall;
        var seg = pt.segIndex;
        var t = pt.t;

        if (t < SPLIT_ENDPOINT_TOLERANCE || t > 1 - SPLIT_ENDPOINT_TOLERANCE) {
            // Check if we're near an existing intermediate vertex
            var vertexIndex = (t < SPLIT_ENDPOINT_TOLERANCE) ? seg : seg + 1;

            if (vertexIndex > 0 && vertexIndex < wall.points.length - 1) {
                // Split at this existing intermediate vertex
                var wallA = new Wall();
                wallA.height = wall.height;
                for (var i = 0; i <= vertexIndex; i++) {
                    wallA.points.push(new WallPoint(wall.points[i].x, wall.points[i].y));
                }

                var wallB = new Wall();
                wallB.height = wall.height;
                for (var i = vertexIndex; i < wall.points.length; i++) {
                    wallB.points.push(new WallPoint(wall.points[i].x, wall.points[i].y));
                }

                var idx = aamap_objects.indexOf(wall);
                if (idx >= 0) aamap_objects.splice(idx, 1);
                aamap_objects.push(wallA);
                aamap_objects.push(wallB);

                var origWall = wall, wA = wallA, wB = wallB;
                aamap_recordAction({
                    undo: function() {
                        _aamap_removeObj(wA); _aamap_removeObj(wB);
                        aamap_objects.push(origWall);
                        vectron_render();
                    },
                    redo: function() {
                        _aamap_removeObj(origWall);
                        aamap_objects.push(wA); aamap_objects.push(wB);
                        vectron_render();
                    }
                });

                splitTool_selectedWall = null;
                splitTool_hoveredWall = null;
                vectron_toolActive = false;
                splitTool_clearHighlight();
                splitTool_clearGuide();
                vectron_render();
                gui_writeLog("Split Tool: wall split at vertex " + vertexIndex + ".");
            } else {
                gui_writeLog("Split Tool: point is at an endpoint; split cancelled.");
                splitTool_selectedWall = null;
                vectron_toolActive = false;
                splitTool_clearHighlight();
                splitTool_clearGuide();
            }
            return;
        }

        var splitX = Math.round(pt.x * 100) / 100;
        var splitY = Math.round(pt.y * 100) / 100;

        // Build first wall: points[0..seg] + splitPoint
        var wallA = new Wall();
        wallA.height = wall.height;
        for (var i = 0; i <= seg; i++) {
            wallA.points.push(new WallPoint(wall.points[i].x, wall.points[i].y));
        }
        wallA.points.push(new WallPoint(splitX, splitY));

        // Build second wall: splitPoint + points[seg+1..]
        var wallB = new Wall();
        wallB.height = wall.height;
        wallB.points.push(new WallPoint(splitX, splitY));
        for (var i = seg + 1; i < wall.points.length; i++) {
            wallB.points.push(new WallPoint(wall.points[i].x, wall.points[i].y));
        }

        // Remove original wall and add the two new walls
        var idx = aamap_objects.indexOf(wall);
        if (idx >= 0) aamap_objects.splice(idx, 1);
        aamap_objects.push(wallA);
        aamap_objects.push(wallB);

        var origWall = wall, wA = wallA, wB = wallB;
        aamap_recordAction({
            undo: function() {
                _aamap_removeObj(wA); _aamap_removeObj(wB);
                aamap_objects.push(origWall);
                vectron_render();
            },
            redo: function() {
                _aamap_removeObj(origWall);
                aamap_objects.push(wA); aamap_objects.push(wB);
                vectron_render();
            }
        });

        splitTool_selectedWall = null;
        splitTool_hoveredWall = null;
        vectron_toolActive = false;
        splitTool_clearHighlight();
        splitTool_clearGuide();
        vectron_render();
        gui_writeLog("Split Tool: wall split at (" + splitX + ", " + splitY + ").");
    }
}

function splitTool_addHoverAll() {
    // No Raphael hover sets needed; we do proximity detection in guide/click
}
