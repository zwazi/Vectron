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

function wallTool_connect() {
    $(".toolbar-toolWall").addClass("toolbar-tool-active");
}

function wallTool_disconnect() {
    if(wallTool_currentObj != null) {
        wallTool_currentObj.obj.remove();
        wallTool_currentObj.guideObj.remove();
        wallTool_currentObj = null;
    }
    vectron_toolActive = false;
    $(".toolbar-toolWall").removeClass("toolbar-tool-active");
}

function wallTool_start() {
    wallTool_currentObj = new Wall();
    wallTool_currentObj.points.push(
        new WallPoint(
            aamap_mapX(cursor_realX),
            aamap_mapY(cursor_realY))
    );

    wallTool_currentObj.render();
    vectron_toolActive = true;
}

function wallTool_progress() {
    var newX = Math.round(100*aamap_mapX(cursor_realX))/100;
    var newY = Math.round(100*aamap_mapY(cursor_realY))/100;

    var prevPoint = wallTool_currentObj.points[wallTool_currentObj.points.length-1];

    if(newX == prevPoint.x && newY == prevPoint.y) {
        gui_writeLog("Prevented Duplicate points.");
        return;
    }
    wallTool_currentObj.points.push( new WallPoint(newX, newY) );
    wallTool_currentObj.render();
}

function wallTool_complete() {
    wallTool_progress();
    if(wallTool_currentObj.points.length < 2) {
        wallTool_currentObj.obj.remove();
        wallTool_currentObj.guideObj.remove();
        wallTool_currentObj = null;
        vectron_toolActive = false;
        gui_writeLog("Wall canceled, < 2 points");
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
        undo: function() { _aamap_removeObj(completedWall); vectron_render(); },
        redo: function() { aamap_objects.push(completedWall); vectron_render(); }
    });
    wallTool_currentObj = null;
    vectron_toolActive = false;
}

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
