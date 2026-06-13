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

var wallVertexMoveTool_dots = null;
var wallVertexMoveTool_dragWall = null;
var wallVertexMoveTool_dragPtIdx = -1;
var wallVertexMoveTool_origX = 0;
var wallVertexMoveTool_origY = 0;

/** Currently selected (clicked but not dragging) vertex for deletion */
var wallVertexMoveTool_selectedWall = null;
var wallVertexMoveTool_selectedPtIdx = -1;

/** Pixel threshold for clicking a vertex */
var wallVertexMoveTool_threshold = 10;

function wallVertexMoveTool_connect() {
    $(".toolbar-toolWallVertexMove").addClass("toolbar-tool-active");
    cursor_active = true;
    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_disconnect() {
    if(wallVertexMoveTool_dots != null) {
        wallVertexMoveTool_dots.remove();
        wallVertexMoveTool_dots = null;
    }
    wallVertexMoveTool_dragWall = null;
    wallVertexMoveTool_dragPtIdx = -1;
    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;
    vectron_toolActive = false;
    $(".toolbar-toolWallVertexMove").removeClass("toolbar-tool-active");
}

function wallVertexMoveTool_drawDots() {
    if(wallVertexMoveTool_dots != null) {
        wallVertexMoveTool_dots.remove();
    }
    wallVertexMoveTool_dots = vectron_screen.set();
    for(var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if(obj instanceof Wall) {
            for(var j = 0; j < obj.points.length; j++) {
                var rx = aamap_realX(obj.points[j].x);
                var ry = aamap_realY(obj.points[j].y);
                var isSelected = (obj === wallVertexMoveTool_selectedWall && j === wallVertexMoveTool_selectedPtIdx);
                var dot = vectron_screen.circle(rx, ry, isSelected ? 7 : 5)
                    .attr({
                        fill: isSelected ? "#ff4444" : "#ffdd00",
                        stroke: isSelected ? "#ff0000" : "#ff8800",
                        "fill-opacity": 0.9,
                        "stroke-width": isSelected ? 2 : 1.5,
                        cursor: "pointer"
                    });
                wallVertexMoveTool_dots.push(dot);
            }
        }
    }
}

/**
 * Finds the closest wall vertex to the given screen coordinates.
 * Returns {wall, ptIdx} or null if none is within threshold.
 */
function wallVertexMoveTool_findVertex(realX, realY) {
    var best = null;
    var bestDist = wallVertexMoveTool_threshold;
    for(var i = 0; i < aamap_objects.length; i++) {
        var obj = aamap_objects[i];
        if(!(obj instanceof Wall)) continue;
        for(var j = 0; j < obj.points.length; j++) {
            var rx = aamap_realX(obj.points[j].x);
            var ry = aamap_realY(obj.points[j].y);
            var dist = Math.sqrt(Math.pow(realX - rx, 2) + Math.pow(realY - ry, 2));
            if(dist < bestDist) {
                bestDist = dist;
                best = {wall: obj, ptIdx: j};
            }
        }
    }
    return best;
}

function wallVertexMoveTool_start() {
    var hit = wallVertexMoveTool_findVertex(cursor_neverSnappedX, cursor_neverSnappedY);
    if(hit == null) {
        // Clicked empty space — deselect
        wallVertexMoveTool_selectedWall = null;
        wallVertexMoveTool_selectedPtIdx = -1;
        wallVertexMoveTool_drawDots();
        return;
    }

    // Select this vertex (for potential deletion)
    wallVertexMoveTool_selectedWall = hit.wall;
    wallVertexMoveTool_selectedPtIdx = hit.ptIdx;

    // Also begin drag
    wallVertexMoveTool_dragWall = hit.wall;
    wallVertexMoveTool_dragPtIdx = hit.ptIdx;
    wallVertexMoveTool_origX = hit.wall.points[hit.ptIdx].x;
    wallVertexMoveTool_origY = hit.wall.points[hit.ptIdx].y;
    vectron_toolActive = true;
    wallVertexMoveTool_drawDots();
}

/**
 * Delete the currently selected vertex.
 * If the wall has only 2 points, remove the entire wall.
 * If the wall has 3+ points, remove the point.
 */
function wallVertexMoveTool_deleteSelected() {
    if(wallVertexMoveTool_selectedWall == null || wallVertexMoveTool_selectedPtIdx < 0) return;

    var wall = wallVertexMoveTool_selectedWall;
    var ptIdx = wallVertexMoveTool_selectedPtIdx;

    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;

    if(wall.points.length <= 2) {
        // Remove entire wall
        var removedWall = wall;
        _aamap_removeObj(removedWall);
        aamap_recordAction({
            label: "Delete vertex (wall removed)",
            undo: function() { aamap_objects.push(removedWall); vectron_render(); wallVertexMoveTool_drawDots(); },
            redo: function() { _aamap_removeObj(removedWall); vectron_render(); wallVertexMoveTool_drawDots(); }
        });
    } else {
        // Remove just the point
        var removedPt = wall.points[ptIdx];
        wall.points.splice(ptIdx, 1);
        wall.render();
        aamap_recordAction({
            label: "Delete vertex",
            undo: function() { wall.points.splice(ptIdx, 0, removedPt); wall.render(); vectron_render(); wallVertexMoveTool_drawDots(); },
            redo: function() { wall.points.splice(ptIdx, 1); wall.render(); vectron_render(); wallVertexMoveTool_drawDots(); }
        });
    }

    vectron_render();
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_progress() {
    if(wallVertexMoveTool_dragWall == null) return;

    var newX = Math.round(aamap_mapX(cursor_realX) * 1e6) / 1e6;
    var newY = Math.round(aamap_mapY(cursor_realY) * 1e6) / 1e6;

    wallVertexMoveTool_dragWall.points[wallVertexMoveTool_dragPtIdx].x = newX;
    wallVertexMoveTool_dragWall.points[wallVertexMoveTool_dragPtIdx].y = newY;

    wallVertexMoveTool_dragWall.render();
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_complete() {
    if(wallVertexMoveTool_dragWall == null) return;

    var newX = Math.round(aamap_mapX(cursor_realX) * 1e6) / 1e6;
    var newY = Math.round(aamap_mapY(cursor_realY) * 1e6) / 1e6;

    wallVertexMoveTool_dragWall.points[wallVertexMoveTool_dragPtIdx].x = newX;
    wallVertexMoveTool_dragWall.points[wallVertexMoveTool_dragPtIdx].y = newY;

    var wall = wallVertexMoveTool_dragWall;
    var ptIdx = wallVertexMoveTool_dragPtIdx;
    var prevX = wallVertexMoveTool_origX;
    var prevY = wallVertexMoveTool_origY;
    var finalX = newX;
    var finalY = newY;

    if(prevX !== finalX || prevY !== finalY) {
        aamap_recordAction({
            label: "Move vertex",
            undo: function() {
                wall.points[ptIdx].x = prevX;
                wall.points[ptIdx].y = prevY;
                wall.render();
                vectron_render();
            },
            redo: function() {
                wall.points[ptIdx].x = finalX;
                wall.points[ptIdx].y = finalY;
                wall.render();
                vectron_render();
            }
        });
    }

    wallVertexMoveTool_dragWall = null;
    wallVertexMoveTool_dragPtIdx = -1;
    vectron_toolActive = false;

    vectron_render();
    wallVertexMoveTool_drawDots();
}
