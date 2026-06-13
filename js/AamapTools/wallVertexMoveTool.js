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

/** Currently selected vertex for deletion (kept for compatibility) */
var wallVertexMoveTool_selectedWall = null;
var wallVertexMoveTool_selectedPtIdx = -1;

/** Multiple selected vertices: array of {wall, ptIdx} */
var wallVertexMoveTool_selectedVertices = [];

/** Original positions of all selected vertices at drag start */
var wallVertexMoveTool_origPositions = [];

/** Map coordinates of the cursor at drag start */
var wallVertexMoveTool_dragStartMapX = 0;
var wallVertexMoveTool_dragStartMapY = 0;

/** Box selection state */
var wallVertexMoveTool_isBoxSelecting = false;
var wallVertexMoveTool_boxStartRealX = 0;
var wallVertexMoveTool_boxStartRealY = 0;
var wallVertexMoveTool_boxGuideObj = null;

/** Pixel threshold for clicking a vertex */
var wallVertexMoveTool_threshold = 10;

function wallVertexMoveTool_connect() {
    $(".toolbar-toolWallVertexMove").addClass("toolbar-tool-active");
    cursor_active = true;
    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;
    wallVertexMoveTool_selectedVertices = [];
    wallVertexMoveTool_isBoxSelecting = false;
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_disconnect() {
    wallVertexMoveTool_clearBoxGuide();
    if(wallVertexMoveTool_dots != null) {
        wallVertexMoveTool_dots.remove();
        wallVertexMoveTool_dots = null;
    }
    wallVertexMoveTool_dragWall = null;
    wallVertexMoveTool_dragPtIdx = -1;
    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;
    wallVertexMoveTool_selectedVertices = [];
    wallVertexMoveTool_isBoxSelecting = false;
    vectron_toolActive = false;
    $(".toolbar-toolWallVertexMove").removeClass("toolbar-tool-active");
}

function wallVertexMoveTool_clearBoxGuide() {
    if (wallVertexMoveTool_boxGuideObj) {
        wallVertexMoveTool_boxGuideObj.remove();
        wallVertexMoveTool_boxGuideObj = null;
    }
}

/** Check if the vertex {wall, ptIdx} is in the selected set. */
function wallVertexMoveTool_isVertexSelected(wall, ptIdx) {
    for (var i = 0; i < wallVertexMoveTool_selectedVertices.length; i++) {
        if (wallVertexMoveTool_selectedVertices[i].wall === wall &&
            wallVertexMoveTool_selectedVertices[i].ptIdx === ptIdx) {
            return true;
        }
    }
    return false;
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
                var isSelected = wallVertexMoveTool_isVertexSelected(obj, j);
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
        // Start box selection
        wallVertexMoveTool_selectedVertices = [];
        wallVertexMoveTool_selectedWall = null;
        wallVertexMoveTool_selectedPtIdx = -1;
        wallVertexMoveTool_isBoxSelecting = true;
        wallVertexMoveTool_boxStartRealX = cursor_neverSnappedX;
        wallVertexMoveTool_boxStartRealY = cursor_neverSnappedY;
        vectron_toolActive = true;
        wallVertexMoveTool_drawDots();
        return;
    }

    // Check if this vertex is already in the selection
    var alreadySelected = wallVertexMoveTool_isVertexSelected(hit.wall, hit.ptIdx);
    if (!alreadySelected) {
        // Replace selection with just this vertex
        wallVertexMoveTool_selectedVertices = [{wall: hit.wall, ptIdx: hit.ptIdx}];
        wallVertexMoveTool_selectedWall = hit.wall;
        wallVertexMoveTool_selectedPtIdx = hit.ptIdx;
    }

    // Store original positions of all selected vertices for multi-drag
    wallVertexMoveTool_origPositions = wallVertexMoveTool_selectedVertices.map(function(v) {
        return {wall: v.wall, ptIdx: v.ptIdx, x: v.wall.points[v.ptIdx].x, y: v.wall.points[v.ptIdx].y};
    });
    wallVertexMoveTool_dragStartMapX = aamap_mapX(cursor_realX);
    wallVertexMoveTool_dragStartMapY = aamap_mapY(cursor_realY);

    // Keep single-drag variables for compatibility
    wallVertexMoveTool_dragWall = hit.wall;
    wallVertexMoveTool_dragPtIdx = hit.ptIdx;
    wallVertexMoveTool_origX = hit.wall.points[hit.ptIdx].x;
    wallVertexMoveTool_origY = hit.wall.points[hit.ptIdx].y;
    vectron_toolActive = true;
    wallVertexMoveTool_drawDots();
}

/**
 * Delete all currently selected vertices.
 * If a wall ends up with fewer than 2 points, remove it entirely.
 */
function wallVertexMoveTool_deleteSelected() {
    if(wallVertexMoveTool_selectedVertices.length === 0) return;

    var toDelete = wallVertexMoveTool_selectedVertices.slice();
    wallVertexMoveTool_selectedVertices = [];
    wallVertexMoveTool_selectedWall = null;
    wallVertexMoveTool_selectedPtIdx = -1;

    // Group indices by wall
    var wallMap = [];
    for (var i = 0; i < aamap_objects.length; i++) {
        wallMap.push({wall: aamap_objects[i], indices: []});
    }
    for (var i = 0; i < toDelete.length; i++) {
        var v = toDelete[i];
        for (var k = 0; k < wallMap.length; k++) {
            if (wallMap[k].wall === v.wall) {
                wallMap[k].indices.push(v.ptIdx);
                break;
            }
        }
    }

    var removedWalls = [];
    var modifiedWalls = [];

    for (var k = 0; k < wallMap.length; k++) {
        if (wallMap[k].indices.length === 0) continue;
        var wall = wallMap[k].wall;
        var indices = wallMap[k].indices.slice().sort(function(a, b) { return b - a; });
        var origPoints = wall.points.slice();
        var remainingCount = wall.points.length - indices.length;

        if (remainingCount < 2) {
            removedWalls.push({wall: wall, origPoints: origPoints});
            _aamap_removeObj(wall);
        } else {
            for (var n = 0; n < indices.length; n++) {
                wall.points.splice(indices[n], 1);
            }
            wall.render();
            modifiedWalls.push({wall: wall, origPoints: origPoints, newPoints: wall.points.slice()});
        }
    }

    aamap_recordAction({
        label: toDelete.length > 1 ? "Delete vertices" : "Delete vertex",
        undo: function() {
            removedWalls.forEach(function(r) {
                r.wall.points = r.origPoints.slice();
                aamap_objects.push(r.wall);
            });
            modifiedWalls.forEach(function(m) {
                m.wall.points = m.origPoints.slice();
                m.wall.render();
            });
            vectron_render();
            wallVertexMoveTool_drawDots();
        },
        redo: function() {
            removedWalls.forEach(function(r) { _aamap_removeObj(r.wall); });
            modifiedWalls.forEach(function(m) {
                m.wall.points = m.newPoints.slice();
                m.wall.render();
            });
            vectron_render();
            wallVertexMoveTool_drawDots();
        }
    });

    vectron_render();
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_progress() {
    if (wallVertexMoveTool_isBoxSelecting) {
        wallVertexMoveTool_clearBoxGuide();
        var x1 = Math.min(wallVertexMoveTool_boxStartRealX, cursor_neverSnappedX);
        var y1 = Math.min(wallVertexMoveTool_boxStartRealY, cursor_neverSnappedY);
        var w  = Math.abs(cursor_neverSnappedX - wallVertexMoveTool_boxStartRealX);
        var h  = Math.abs(cursor_neverSnappedY - wallVertexMoveTool_boxStartRealY);
        wallVertexMoveTool_boxGuideObj = vectron_screen.rect(x1, y1, w, h).attr({
            stroke: '#ffdd00', 'stroke-dasharray': '--',
            fill: '#ffdd00', 'fill-opacity': 0.1
        });
        return;
    }

    if(wallVertexMoveTool_dragWall == null) return;

    var curMapX = aamap_mapX(cursor_realX);
    var curMapY = aamap_mapY(cursor_realY);
    var dx = curMapX - wallVertexMoveTool_dragStartMapX;
    var dy = curMapY - wallVertexMoveTool_dragStartMapY;

    // Move all selected vertices by the same delta from their original positions
    var renderedWalls = [];
    for (var i = 0; i < wallVertexMoveTool_origPositions.length; i++) {
        var orig = wallVertexMoveTool_origPositions[i];
        orig.wall.points[orig.ptIdx].x = Math.round((orig.x + dx) * 1e6) / 1e6;
        orig.wall.points[orig.ptIdx].y = Math.round((orig.y + dy) * 1e6) / 1e6;
        if (renderedWalls.indexOf(orig.wall) === -1) {
            orig.wall.render();
            renderedWalls.push(orig.wall);
        }
    }
    wallVertexMoveTool_drawDots();
}

function wallVertexMoveTool_complete() {
    if (wallVertexMoveTool_isBoxSelecting) {
        wallVertexMoveTool_clearBoxGuide();
        wallVertexMoveTool_isBoxSelecting = false;
        vectron_toolActive = false;

        // Convert box corners to map coordinates and select vertices inside
        var bx0 = wallVertexMoveTool_boxStartRealX;
        var by0 = wallVertexMoveTool_boxStartRealY;
        var bx1 = cursor_neverSnappedX;
        var by1 = cursor_neverSnappedY;
        var mapX1 = Math.min(aamap_mapX(bx0), aamap_mapX(bx1));
        var mapX2 = Math.max(aamap_mapX(bx0), aamap_mapX(bx1));
        var mapY1 = Math.min(aamap_mapY(by0), aamap_mapY(by1));
        var mapY2 = Math.max(aamap_mapY(by0), aamap_mapY(by1));

        wallVertexMoveTool_selectedVertices = [];
        for (var i = 0; i < aamap_objects.length; i++) {
            var obj = aamap_objects[i];
            if (!(obj instanceof Wall)) continue;
            for (var j = 0; j < obj.points.length; j++) {
                var pt = obj.points[j];
                if (pt.x >= mapX1 && pt.x <= mapX2 && pt.y >= mapY1 && pt.y <= mapY2) {
                    wallVertexMoveTool_selectedVertices.push({wall: obj, ptIdx: j});
                }
            }
        }

        if (wallVertexMoveTool_selectedVertices.length > 0) {
            var last = wallVertexMoveTool_selectedVertices[wallVertexMoveTool_selectedVertices.length - 1];
            wallVertexMoveTool_selectedWall = last.wall;
            wallVertexMoveTool_selectedPtIdx = last.ptIdx;
        } else {
            wallVertexMoveTool_selectedWall = null;
            wallVertexMoveTool_selectedPtIdx = -1;
        }
        wallVertexMoveTool_drawDots();
        return;
    }

    if(wallVertexMoveTool_dragWall == null) return;

    var curMapX = aamap_mapX(cursor_realX);
    var curMapY = aamap_mapY(cursor_realY);
    var dx = curMapX - wallVertexMoveTool_dragStartMapX;
    var dy = curMapY - wallVertexMoveTool_dragStartMapY;

    // Build final positions
    var capturedOrig  = wallVertexMoveTool_origPositions.map(function(o) {
        return {wall: o.wall, ptIdx: o.ptIdx, x: o.x, y: o.y};
    });
    var capturedFinal = wallVertexMoveTool_origPositions.map(function(o) {
        return {wall: o.wall, ptIdx: o.ptIdx,
                x: Math.round((o.x + dx) * 1e6) / 1e6,
                y: Math.round((o.y + dy) * 1e6) / 1e6};
    });

    // Apply final positions
    var renderedWalls = [];
    for (var i = 0; i < capturedFinal.length; i++) {
        var f = capturedFinal[i];
        f.wall.points[f.ptIdx].x = f.x;
        f.wall.points[f.ptIdx].y = f.y;
        if (renderedWalls.indexOf(f.wall) === -1) {
            f.wall.render();
            renderedWalls.push(f.wall);
        }
    }

    // Record undo/redo if something actually moved
    var hasChanged = capturedFinal.some(function(f, i) {
        return f.x !== capturedOrig[i].x || f.y !== capturedOrig[i].y;
    });
    if (hasChanged) {
        aamap_recordAction({
            label: capturedOrig.length > 1 ? "Move vertices" : "Move vertex",
            undo: function() {
                var rw = [];
                capturedOrig.forEach(function(o) {
                    o.wall.points[o.ptIdx].x = o.x;
                    o.wall.points[o.ptIdx].y = o.y;
                    if (rw.indexOf(o.wall) === -1) { o.wall.render(); rw.push(o.wall); }
                });
                vectron_render();
            },
            redo: function() {
                var rw = [];
                capturedFinal.forEach(function(f) {
                    f.wall.points[f.ptIdx].x = f.x;
                    f.wall.points[f.ptIdx].y = f.y;
                    if (rw.indexOf(f.wall) === -1) { f.wall.render(); rw.push(f.wall); }
                });
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
