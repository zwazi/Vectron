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

Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

var selectTool_mapX = null;
var selectTool_mapY = null;

var selectTool_realX = null;
var selectTool_realY = null;

var selectTool_endX = null;
var selectTool_endY = null;

var selectTool_moveStartX = null;
var selectTool_moveStartY = null;

var selectTool_moveStartRealX = null;
var selectTool_moveStartRealY = null;

var selectTool_moveLastRealX = null;
var selectTool_moveLastRealY = null;

var shouldAddToSelected = false;


var selectTool_clickedAlreadySelected = false;
var selectTool_additiveSelection = false;
var selectTool_guideObj = null;
var selectTool_selectedObjs = [];

var selectTool_sets = [];

var selectTool_hoveredSet = null;
var selectTool_hoveredAamapObj = null;
var selectTool_hoveredPart = "object";
var selectTool_draggedPart = "object";
var selectTool_selectedTeleportDestination = null;
var SELECT_TOOL_HIGHLIGHT_OFFSET = 5;
var SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH = SELECT_TOOL_HIGHLIGHT_OFFSET * 2;
var SELECT_TOOL_HIT_TOLERANCE = SELECT_TOOL_HIGHLIGHT_OFFSET;
var SELECT_TOOL_HIT_WIDTH = SELECT_TOOL_HIT_TOLERANCE * 2;

function selectTool_selectedLineZones() {
    return selectTool_selectedObjs.filter(function(object) {
        return object instanceof Zone && object.shapeType === "line";
    });
}

function selectTool_updateSelectionProperties() {
    var panel = $("#selection-properties-window");
    if(!panel.length) return;
    var lines = selectTool_selectedLineZones();
    if(vectron_currentTool !== "select" || !lines.length) {
        panel.hide();
        return;
    }
    var firstWidth = Number(lines[0].lineWidth);
    var sameWidth = lines.every(function(line) {
        return Number(line.lineWidth) === firstWidth;
    });
    $("#selection-line-zone-width")
        .val(sameWidth ? zone_round(firstWidth) : "")
        .attr("placeholder", sameWidth ? "" : "Mixed");
    $("#selection-line-zone-width-label").text(
        lines.length === 1 ? "Line Width" : "Line Width (" + lines.length + ")");
    panel.show();
}

function selectTool_applySelectedLineWidth(value) {
    var width = zoneTool_parseLineWidth(value);
    var selectedLines = selectTool_selectedLineZones();
    if(width === null || !selectedLines.length) return false;

    var entries = selectedLines.map(function(line) {
        return {line:line, oldWidth:Number(line.lineWidth), newWidth:width};
    });
    if(entries.every(function(entry) { return entry.oldWidth === entry.newWidth; })) {
        selectTool_updateSelectionProperties();
        return true;
    }
    var applyWidths = function(useNewWidth) {
        entries.forEach(function(entry) {
            entry.line.lineWidth = useNewWidth ? entry.newWidth : entry.oldWidth;
            entry.line.updateLineBounds();
        });
        vectron_render();
        selectTool_updateSelectionProperties();
        if(window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
    };
    applyWidths(true);
    aamap_recordAction({
        label:"Set line-zone width",
        undo:function() { applyWidths(false); },
        redo:function() { applyWidths(true); }
    });
    return true;
}

function selectTool_setGlowAttrs(aamapObject, attrs) {
    if(aamapObject && aamapObject.glowObj) aamapObject.glowObj.attr(attrs);
}

function selectTool_isTeleportDestination(aamapObject) {
    return typeof aamap_isTeleport === "function" && aamap_isTeleport(aamapObject) &&
        isFinite(Number(aamapObject.options.destination_x)) &&
        isFinite(Number(aamapObject.options.destination_y));
}

function selectTool_isTeleportDestinationEditable(aamapObject) {
    if(!selectTool_isTeleportDestination(aamapObject)) return false;
    var level = aamap_normalizeLevel(
        aamapObject.options.destination_level, aamapObject.level);
    return !!aamap_levelVisible[level] && level === aamap_activeLevel;
}

function selectTool_teleportDestinationGlowAttrs(aamapObject, hovered) {
    var selected = selectTool_selectedTeleportDestination === aamapObject;
    return {
        "stroke-opacity":hovered ? (selected ? 1 : 0.55) : (selected ? 0.85 : 0),
        "fill-opacity":0,
        cursor:hovered || selected ? "pointer" : "default"
    };
}

function selectTool_setTeleportDestinationGlowAttrs(aamapObject, hovered) {
    if(aamapObject && aamapObject.destinationGlowObj) {
        aamapObject.destinationGlowObj.attr(
            selectTool_teleportDestinationGlowAttrs(aamapObject, hovered));
    }
}

function selectTool_hasArea(aamapObject) {
    return (aamapObject instanceof Zone &&
            (aamapObject.shapeType !== "line" || Number(aamapObject.lineWidth) > 0)) ||
        (typeof Floor !== "undefined" && aamapObject instanceof Floor) || aamap_isRamp(aamapObject);
}

function selectTool_defaultGlowAttrs(aamapObject) {
    var attrs = {
        "stroke-opacity": 0,
        "fill-opacity": 0,
        cursor: "default"
    };
    if(aamapObject && aamapObject.isSelected) {
        attrs["stroke-opacity"] = 0.75;
        attrs["fill-opacity"] = selectTool_hasArea(aamapObject) ? 0.18 : 0;
        attrs.cursor = "pointer";
    }
    return attrs;
}

function selectTool_hoverGlowAttrs(aamapObject) {
    var attrs = {
        "stroke-opacity": 0.45,
        "fill-opacity": selectTool_hasArea(aamapObject) ? 0.12 : 0,
        cursor: "pointer"
    };
    if(aamapObject && aamapObject.isSelected) {
        attrs["stroke-opacity"] = 0.95;
        attrs["fill-opacity"] = selectTool_hasArea(aamapObject) ? 0.25 : 0;
    }
    return attrs;
}

function selectTool_beginRenderCycle() {
    selectTool_sets = [];
    if(!vectron_toolActive) {
        selectTool_hoveredSet = null;
        selectTool_hoveredAamapObj = null;
        selectTool_hoveredPart = "object";
    }
}

function selectTool_pointInGlow(aamapObject, x, y) {
    if(!aamapObject || !aamap_isObjectEditable(aamapObject)) return false;
    if(aamapObject instanceof Wall) return selectTool_pointNearWall(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    if(aamapObject instanceof Zone) return selectTool_pointInZoneHitArea(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    if(aamapObject instanceof Spawn) return selectTool_pointNearSpawn(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    if((typeof Floor !== "undefined" && aamapObject instanceof Floor) || aamap_isRamp(aamapObject)) {
        var polygon = aamap_isRamp(aamapObject) ? aamapObject.getCorridorPoints() : aamapObject.points;
        return selectTool_pointInPolygon(polygon, aamap_mapX(x), aamap_mapY(y),
            selectTool_screenPixelsToMapUnits(SELECT_TOOL_HIT_TOLERANCE));
    }
    return false;
}

function selectTool_glowArea(aamapObject) {
    if(!aamapObject || !aamapObject.glowObj) return Infinity;
    if(aamapObject instanceof Wall) return Math.max(1, selectTool_wallScreenLength(aamapObject)) * SELECT_TOOL_HIT_WIDTH;
    if((typeof Floor !== "undefined" && aamapObject instanceof Floor) || aamap_isRamp(aamapObject)) {
        var polygonPoints = aamap_isRamp(aamapObject) ? aamapObject.getCorridorPoints() : aamapObject.points;
        var area = 0;
        for(var p = 0; p < polygonPoints.length; p++) {
            var current = selectTool_screenPointFromMapPoint(polygonPoints[p]);
            var next = selectTool_screenPointFromMapPoint(polygonPoints[(p + 1) % polygonPoints.length]);
            area += current.x * next.y - next.x * current.y;
        }
        return Math.max(1, Math.abs(area) / 2);
    }
    if(aamapObject instanceof Zone) {
        if(aamapObject.shapeType === "line") {
            var linePoints = aamapObject.getMapPoints();
            if(linePoints.length !== 2) return Infinity;
            var lineStart = selectTool_screenPointFromMapPoint(linePoints[0]);
            var lineEnd = selectTool_screenPointFromMapPoint(linePoints[1]);
            return Math.max(1, Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y)) *
                Math.max(SELECT_TOOL_HIT_WIDTH, Number(aamapObject.lineWidth) * vectron_zoom);
        }
        var r = Math.max(1, aamapObject.radius * vectron_zoom);
        return 2 * Math.PI * r * SELECT_TOOL_HIT_WIDTH;
    }
    var bbox = aamapObject.glowObj.getBBox();
    if(!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) return Infinity;
    return bbox.width * bbox.height;
}

function selectTool_findSetForObject(aamapObject, part) {
    if(!aamapObject) return null;
    part = part || "object";
    for(var i = selectTool_sets.length - 1; i >= 0; i--) {
        var set = selectTool_sets[i];
        if(!set) continue;
        if(set._aamapObject === aamapObject && set._aamapPart === part) return set;
        if(part === "object" && set[0] == aamapObject.obj) return set;
        if(part === "teleport-destination" && set[0] == aamapObject.destinationObj) return set;
    }
    return null;
}

function selectTool_resolveHoveredSetFromCursor() {
    var x = cursor_neverSnappedX;
    var y = cursor_neverSnappedY;
    if(x === undefined || y === undefined) {
        x = cursor_realX;
        y = cursor_realY;
    }
    var bestObj = null;
    var bestPart = "object";
    var bestArea = Infinity;

    for(var i = aamap_objects.length - 1; i >= 0; i--) {
        if(selectTool_pointInGlow(aamap_objects[i], x, y)) {
            var area = selectTool_glowArea(aamap_objects[i]);
            if(area < bestArea) {
                bestArea = area;
                bestObj = aamap_objects[i];
                bestPart = "object";
            }
        }
    }

    // A destination marker is an independently draggable part of its
    // teleport. Prefer its compact hit target when it overlaps the source.
    for(var destinationIndex = aamap_objects.length - 1; destinationIndex >= 0;
        destinationIndex--) {
        var destinationZone = aamap_objects[destinationIndex];
        if(selectTool_isTeleportDestinationEditable(destinationZone) &&
            selectTool_pointNearTeleportDestination(
                destinationZone, x, y, SELECT_TOOL_HIT_TOLERANCE)) {
            var destinationArea = SPAWN_MARKER_SIZE * SELECT_TOOL_HIT_WIDTH;
            if(destinationArea <= bestArea) {
                bestArea = destinationArea;
                bestObj = destinationZone;
                bestPart = "teleport-destination";
            }
        }
    }

    for(var j = 0; j < aamap_objects.length; j++) {
        selectTool_setGlowAttrs(aamap_objects[j], selectTool_defaultGlowAttrs(aamap_objects[j]));
        selectTool_setTeleportDestinationGlowAttrs(aamap_objects[j], false);
        if(aamap_objects[j].obj) aamap_objects[j].obj.attr("cursor", "default");
        if(aamap_objects[j].destinationObj) {
            aamap_objects[j].destinationObj.attr("cursor", "default");
        }
    }

    selectTool_hoveredAamapObj = bestObj;
    selectTool_hoveredPart = bestPart;
    selectTool_hoveredSet = selectTool_findSetForObject(bestObj, bestPart);
    shouldAddToSelected = bestObj ? (!bestObj.isSelected ||
        (bestPart === "teleport-destination" &&
            selectTool_selectedTeleportDestination !== bestObj)) : false;

    if(bestObj) {
        if(bestPart === "teleport-destination") {
            selectTool_setTeleportDestinationGlowAttrs(bestObj, true);
            if(bestObj.destinationObj) bestObj.destinationObj.attr("cursor", "pointer");
        } else {
            selectTool_setGlowAttrs(bestObj, selectTool_hoverGlowAttrs(bestObj));
            if(bestObj.obj) bestObj.obj.attr("cursor", "pointer");
        }
    }

    return selectTool_hoveredSet != null;
}

function selectTool_updateHoverFromCursor() {
    if(vectron_currentTool !== "select" || vectron_toolActive) return;
    selectTool_resolveHoveredSetFromCursor();
}

function selectTool_addToSelection(aamapObject) {
    if(!aamapObject || (!aamap_isObjectEditable(aamapObject) &&
        !selectTool_isTeleportDestinationEditable(aamapObject))) return;
    aamapObject.isSelected = true;
    if(selectTool_selectedObjs.indexOf(aamapObject) === -1) {
        selectTool_selectedObjs.push(aamapObject);
    }
}

function selectTool_removeSelectionBox(aamapObject) {
    if(aamapObject && aamapObject.glowObj) {
        aamapObject.glowObj.remove();
        aamapObject.glowObj = null;
    }
}

function selectTool_screenPointFromMapPoint(point) {
    return {
        x: aamap_realX(point.x),
        y: aamap_realY(point.y)
    };
}

function selectTool_distanceToScreenSegment(px, py, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    var t = 0;
    if(len2 > 1e-12) {
        t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
    }
    var nx = a.x + t * dx;
    var ny = a.y + t * dy;
    var ddx = px - nx;
    var ddy = py - ny;
    return Math.sqrt(ddx * ddx + ddy * ddy);
}

function selectTool_screenPixelsToMapUnits(pixels) {
    return pixels / Math.max(vectron_zoom, 1e-9);
}

function selectTool_expandMapRect(params, pixels) {
    var pad = selectTool_screenPixelsToMapUnits(pixels);
    return [
        params[0] - pad,
        params[1] + pad,
        params[2] + pad,
        params[3] - pad
    ];
}

function selectTool_pointNearWall(wall, screenX, screenY, tolerance) {
    if(!wall || !wall.points || wall.points.length < 2) return false;
    for(var i = 0; i < wall.points.length - 1; i++) {
        if(selectTool_distanceToScreenSegment(
            screenX,
            screenY,
            selectTool_screenPointFromMapPoint(wall.points[i]),
            selectTool_screenPointFromMapPoint(wall.points[i + 1])
        ) <= tolerance) return true;
    }
    return false;
}

function selectTool_wallScreenLength(wall) {
    var length = 0;
    if(!wall || !wall.points) return length;
    for(var i = 0; i < wall.points.length - 1; i++) {
        var a = selectTool_screenPointFromMapPoint(wall.points[i]);
        var b = selectTool_screenPointFromMapPoint(wall.points[i + 1]);
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

function selectTool_pointInZoneHitArea(zone, screenX, screenY, tolerance) {
    if(!zone) return false;
    if(zone.shapeType === "line") {
        if(Number(zone.lineWidth) > 0 &&
            typeof zone.getLineFootprintPoints === "function") {
            return selectTool_pointInPolygon(zone.getLineFootprintPoints(),
                aamap_mapX(screenX), aamap_mapY(screenY),
                selectTool_screenPixelsToMapUnits(tolerance));
        }
        return selectTool_distanceToScreenSegment(screenX, screenY,
            selectTool_screenPointFromMapPoint(zone.lineStart),
            selectTool_screenPointFromMapPoint(zone.lineEnd)) <=
            zone.lineWidth * vectron_zoom / 2 + tolerance;
    }
    if(zone.shapeType === "rectangle") {
        var mapX = aamap_mapX(screenX), mapY = aamap_mapY(screenY);
        var mapTolerance = selectTool_screenPixelsToMapUnits(tolerance);
        return mapX >= Math.min(zone.minx, zone.maxx) - mapTolerance &&
            mapX <= Math.max(zone.minx, zone.maxx) + mapTolerance &&
            mapY >= Math.min(zone.miny, zone.maxy) - mapTolerance &&
            mapY <= Math.max(zone.miny, zone.maxy) + mapTolerance;
    }
    if(zone.shapeType === "polygon") {
        return selectTool_pointInPolygon(zone.getMapPoints(), aamap_mapX(screenX),
            aamap_mapY(screenY), selectTool_screenPixelsToMapUnits(tolerance));
    }
    var cx = aamap_realX(zone.x);
    var cy = aamap_realY(zone.y);
    var radius = zone.radius * vectron_zoom;
    var dx = screenX - cx;
    var dy = screenY - cy;
    return Math.sqrt(dx * dx + dy * dy) <= radius + tolerance;
}

function selectTool_pointInPolygon(points, x, y, tolerance) {
    if(!points || points.length < 3) return false;
    var inside = false;
    for(var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var pi = points[i], pj = points[j];
        if(((pi.y > y) !== (pj.y > y)) &&
            x < (pj.x - pi.x) * (y - pi.y) / (pj.y - pi.y) + pi.x) inside = !inside;
        var screenDistance = selectTool_distanceToScreenSegment(
            aamap_realX(x), aamap_realY(y),
            selectTool_screenPointFromMapPoint(pi), selectTool_screenPointFromMapPoint(pj));
        if(screenDistance <= tolerance * vectron_zoom) return true;
    }
    return inside;
}

function selectTool_rampPoints(ramp) {
    if(!ramp) return [];
    if(typeof ramp.getCorridorPoints === "function") return ramp.getCorridorPoints();
    if(ramp.startPoint && ramp.endPoint) return [ramp.startPoint, ramp.endPoint];
    return ramp.points || [];
}

function selectTool_pointNearRamp(ramp, screenX, screenY, tolerance) {
    var points = selectTool_rampPoints(ramp);
    return selectTool_pointInPolygon(points, aamap_mapX(screenX), aamap_mapY(screenY),
        selectTool_screenPixelsToMapUnits(tolerance));
}

function selectTool_polygonIntersectsRect(points, params) {
    if(!points || points.length < 3) return false;
    for(var i = 0; i < points.length; i++) {
        var point = points[i];
        if(point.x >= params[0] && point.x <= params[2] &&
            point.y <= params[1] && point.y >= params[3]) return true;
        if(selectTool_lineIntersectsRect(point, points[(i + 1) % points.length],
            params[0], params[1], params[2], params[3])) return true;
    }
    return selectTool_pointInPolygon(points, (params[0] + params[2]) / 2,
        (params[1] + params[3]) / 2, 0);
}

function selectTool_spawnScreenPoints(spawn) {
    var x = aamap_realX(spawn.x);
    var y = aamap_realY(spawn.y);
    var scale = 16;
    var angle = -Math.atan2(spawn.yDir, spawn.xDir);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);

    function rotate(localX, localY) {
        return {
            x: x + localX * cos - localY * sin,
            y: y + localX * sin + localY * cos
        };
    }

    return [
        [rotate(0, 0), rotate(-scale / 2, 0)],
        [rotate(-scale / 2, 0), rotate(scale / 2, 0)],
        [rotate(scale / 2, 0), rotate(0, -scale / 3)],
        [rotate(scale / 2, 0), rotate(0, scale / 3)]
    ];
}

function selectTool_pointNearSpawn(spawn, screenX, screenY, tolerance) {
    if(!spawn) return false;
    var segments = selectTool_spawnScreenPoints(spawn);
    for(var i = 0; i < segments.length; i++) {
        if(selectTool_distanceToScreenSegment(screenX, screenY, segments[i][0], segments[i][1]) <= tolerance) return true;
    }
    return false;
}

function selectTool_pointNearTeleportDestination(zone, screenX, screenY, tolerance) {
    if(!selectTool_isTeleportDestination(zone)) return false;
    var direction = zone.getTeleportDirection();
    return selectTool_pointNearSpawn({
        x:Number(zone.options.destination_x),
        y:Number(zone.options.destination_y),
        xDir:direction.x,
        yDir:direction.y
    }, screenX, screenY, tolerance);
}

function selectTool_setTeleportDestinationPreview(zone, x, y) {
    if(!selectTool_isTeleportDestination(zone)) return;
    var direction = zone.getTeleportDirection();
    var path = spawnMarker_path(aamap_realX(x), aamap_realY(y), SPAWN_MARKER_SIZE);
    var transform = "R" + spawnMarker_toDegrees(direction.x, direction.y);
    if(zone.destinationObj) zone.destinationObj.attr({path:path}).transform(transform);
    if(zone.destinationGlowObj) zone.destinationGlowObj.attr({path:path}).transform(transform);
    if(zone.teleportLinkObj) {
        var sourceCenter = typeof zone.getShapeCenter === "function" ?
            zone.getShapeCenter() : {x:zone.x, y:zone.y};
        zone.teleportLinkObj.attr({path:[
            "M", aamap_realX(sourceCenter.x), aamap_realY(sourceCenter.y),
            "L", aamap_realX(x), aamap_realY(y)
        ]});
    }
}

function selectTool_moveTeleportDestination(zone, dx, dy) {
    if(!selectTool_isTeleportDestination(zone)) return false;
    var round = typeof zone_round === "function" ? zone_round : function(value) {
        return Math.round(Number(value) * 1e6) / 1e6;
    };
    zone.options.destination_x = round(Number(zone.options.destination_x) + dx);
    zone.options.destination_y = round(Number(zone.options.destination_y) + dy);
    return true;
}

function selectTool_wallGlowPath(wall) {
    var arr = [];
    if(!wall || !wall.points || wall.points.length < 2) return arr;
    for(var i = 0; i < wall.points.length; i++) {
        arr.push(i === 0 ? "M" : "L");
        arr.push(aamap_realX(wall.points[i].x));
        arr.push(aamap_realY(wall.points[i].y));
    }
    return arr;
}

function selectTool_spawnGlowPath(spawn) {
    var x = aamap_realX(spawn.x);
    var y = aamap_realY(spawn.y);
    var scale = 16;
    var path = [
        "M", x, y,
        "L", x - scale / 2, y,
             x + scale / 2, y,
        "M", x + scale / 2, y,
        "L", x, y - scale / 3,
        "M", x + scale / 2, y,
        "L", x, y + scale / 3
    ];

    return Raphael.transformPath(path, "R" + spawn.toDegrees() + "," + x + "," + y);
}

function selectTool_removeSelectedGlowRects() {
    for(var i = 0; i < selectTool_selectedObjs.length; i++) {
        selectTool_removeSelectionBox(selectTool_selectedObjs[i]);
    }
}

function selectTool_renderSelectedGlowRects() {
    if(vectron_currentTool !== "select") return;
    for(var i = 0; i < selectTool_selectedObjs.length; i++) {
        if(aamap_isObjectEditable(selectTool_selectedObjs[i]) && selectTool_selectedObjs[i].glowObj) {
            selectTool_selectedObjs[i].glowObj.toFront();
            selectTool_selectedObjs[i].obj.toFront();
        }
        if(selectTool_selectedTeleportDestination === selectTool_selectedObjs[i] &&
            selectTool_selectedObjs[i].destinationGlowObj) {
            selectTool_selectedObjs[i].destinationGlowObj.toFront();
            selectTool_selectedObjs[i].destinationObj.toFront();
        }
    }
}

function selectTool_connect() {
    $(".toolbar-toolSelect").addClass("toolbar-tool-active");
    cursor_active = false;
    // add drag to all objects
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        if(aamap_isObjectEditable(aamap_objects[i])) selectTool_addHoverSet(aamap_objects[i]);
        if(selectTool_isTeleportDestinationEditable(aamap_objects[i])) {
            selectTool_addTeleportDestinationHoverSet(aamap_objects[i]);
        }
    }
}

function selectTool_disconnect() {
    if(selectTool_guideObj != null) {
        selectTool_guideObj.remove();
    }
    selectTool_deselectAll();
    selectTool_clickedAlreadySelected = false;
    selectTool_draggedPart = "object";

    cursor_active = true;

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        if(selectTool_sets[i]) selectTool_sets[i].unhover();
        selectTool_removeInvisibleGlow(aamap_objects[i]);
    }
    $(".toolbar-toolSelect").removeClass("toolbar-tool-active");
    vectron_toolActive = false;
}

function selectTool_start() {
    if(selectTool_guideObj != null) selectTool_guideObj.remove();

    selectTool_additiveSelection = eventHandler_ctrl;
    selectTool_resolveHoveredSetFromCursor();

    if(selectTool_hoveredSet != null) {
        var hoveredObject = selectTool_hoveredAamapObj;
        var hoveredPart = selectTool_hoveredPart || "object";
        if(hoveredObject == null) {
            gui_writeLog("Could not find hovered object to move??");
            return;
        }

        selectTool_clickedAlreadySelected = hoveredObject.isSelected &&
            ((hoveredPart === "teleport-destination" &&
                selectTool_selectedTeleportDestination === hoveredObject) ||
             (hoveredPart === "object" &&
                selectTool_selectedTeleportDestination !== hoveredObject));
        if(!selectTool_additiveSelection) {
            if(!selectTool_clickedAlreadySelected) {
                selectTool_deselectAll();
                selectTool_addToSelection(hoveredObject);
            }
        } else if(shouldAddToSelected) {
            selectTool_addToSelection(hoveredObject);
        }

        selectTool_selectedTeleportDestination =
            hoveredPart === "teleport-destination" ? hoveredObject : null;
        selectTool_draggedPart = hoveredPart;

        // Selection visuals include the teleport relationship line and the
        // destination-specific glow, so refresh before starting the drag.
        vectron_render();
        selectTool_resolveHoveredSetFromCursor();
        selectTool_hoveredAamapObj = hoveredObject;

        vectron_toolActive = true;

        selectTool_moveStartX = aamap_mapX(cursor_realX);
        selectTool_moveStartY = aamap_mapY(cursor_realY); 

        var startSnapX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
        var startSnapY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
        selectTool_moveStartRealX = startSnapX;
        selectTool_moveStartRealY = startSnapY;
        selectTool_moveLastRealX = startSnapX;
        selectTool_moveLastRealY = startSnapY;
        return;
    }

    selectTool_realX = cursor_neverSnappedX;
    selectTool_realY = cursor_neverSnappedY;
    
    selectTool_mapX = aamap_mapX(cursor_neverSnappedX);
    selectTool_mapY = aamap_mapY(cursor_neverSnappedY);

    selectTool_guideObj = vectron_screen.rect(cursor_realX, cursor_realY, 0, 0)
    .attr({"stroke": "#51a0ff", "stroke-opacity": "0.5", "fill": "#51a0ff", "fill-opacity": "0.3"});
    vectron_toolActive = true;
}

function selectTool_progress() {
    if(selectTool_hoveredSet != null) {
        gui_writeLog("in progress of moving, dont select!");
        var curX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
        var curY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
        var dx = selectTool_moveLastRealX - curX;
        var dy = selectTool_moveLastRealY - curY;

        selectTool_moveLastRealX = curX;
        selectTool_moveLastRealY = curY;

        if(selectTool_draggedPart === "teleport-destination" &&
            selectTool_selectedTeleportDestination) {
            var previewDx = aamap_mapX(curX) - selectTool_moveStartX;
            var previewDy = aamap_mapY(curY) - selectTool_moveStartY;
            selectTool_setTeleportDestinationPreview(
                selectTool_selectedTeleportDestination,
                Number(selectTool_selectedTeleportDestination.options.destination_x) + previewDx,
                Number(selectTool_selectedTeleportDestination.options.destination_y) + previewDy);
            return;
        }

        selectTool_selectedObjs.forEach(function(e) {
            aamap_objectVisuals(e).forEach(function(visual) {
                if(visual && typeof visual.translate === "function") visual.translate(-dx, -dy);
            });
        });

        return;
    }


    if(selectTool_guideObj != null) selectTool_guideObj.remove();
    else {
        gui_writeLog("unknown error occured.");
        selectTool_complete();
    }

    var realX = selectTool_realX;
    var realY = selectTool_realY;
    var endRealX = cursor_neverSnappedX;
    var endRealY = cursor_neverSnappedY;

    var width = cursor_neverSnappedX - selectTool_realX;
    var height = cursor_neverSnappedY - selectTool_realY;

    if(width < 0) {
        realX = endRealX;
        width *= -1;
    }

    if(height < 0) {
        realY = endRealY;
        height *= -1;
    }
    
    //
    selectTool_selectArea(selectTool_mapX, selectTool_mapY, aamap_mapX(endRealX), aamap_mapY(endRealY), false);

    // draw selecting box
    selectTool_guideObj = vectron_screen.rect(realX, realY, width, height)
    .attr({"stroke": "#51a0ff", "stroke-opacity": "0.5", "fill": "#51a0ff", "fill-opacity": "0.3"});
}

function selectTool_complete() {
    if(selectTool_hoveredSet != null) {

        var endX = aamap_mapX(cursor_realX);
        var endY = aamap_mapY(cursor_realY);

        var dx = selectTool_moveStartX - endX;
        var dy = selectTool_moveStartY - endY;

        var finalDx = -dx, finalDy = -dy;

        if(selectTool_draggedPart === "teleport-destination" &&
            selectTool_selectedTeleportDestination) {
            var movedTeleport = selectTool_selectedTeleportDestination;
            if(selectTool_additiveSelection && selectTool_clickedAlreadySelected &&
                finalDx === 0 && finalDy === 0) {
                selectTool_selectedTeleportDestination = null;
                selectTool_deselect(movedTeleport);
                selectTool_selectedObjs = selectTool_selectedObjs.diff([movedTeleport]);
            } else if(finalDx !== 0 || finalDy !== 0) {
                var destinationMovePlan = aamap_symmetryMovePlan(
                    [movedTeleport], finalDx, finalDy);
                destinationMovePlan.entries.forEach(function(entry) {
                    selectTool_moveTeleportDestination(entry.object, entry.dx, entry.dy);
                });
                aamap_recordAction({
                    label:"Move teleport destination",
                    undo:function() {
                        destinationMovePlan.entries.forEach(function(entry) {
                            selectTool_moveTeleportDestination(
                                entry.object, -entry.dx, -entry.dy);
                        });
                        aamap_removeObjectGroup(destinationMovePlan.created);
                        vectron_render();
                    },
                    redo:function() {
                        aamap_restoreObjectGroup(destinationMovePlan.created);
                        destinationMovePlan.entries.forEach(function(entry) {
                            selectTool_moveTeleportDestination(
                                entry.object, entry.dx, entry.dy);
                        });
                        vectron_render();
                    }
                });
            }
            selectTool_clickedAlreadySelected = false;
            shouldAddToSelected = false;
            selectTool_additiveSelection = false;
            selectTool_draggedPart = "object";
            vectron_toolActive = false;
            vectron_render();
            if(window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
            return;
        }

        if(selectTool_additiveSelection && selectTool_clickedAlreadySelected && finalDx === 0 && finalDy === 0) {
            selectTool_deselect(selectTool_hoveredAamapObj);
            selectTool_selectedObjs = selectTool_selectedObjs.diff([selectTool_hoveredAamapObj]);
            selectTool_clickedAlreadySelected = false;
            shouldAddToSelected = false;
            selectTool_additiveSelection = false;
            selectTool_draggedPart = "object";
            vectron_toolActive = false;
            vectron_render();
            if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
            return;
        }

        selectTool_clickedAlreadySelected = false;

        selectTool_hoveredSet[0].remove();
        selectTool_hoveredSet[1].remove();

        selectTool_sets = [];

        var movePlan = (finalDx !== 0 || finalDy !== 0) ?
            aamap_symmetryMovePlan(selectTool_selectedObjs, finalDx, finalDy) :
            {entries:selectTool_selectedObjs.map(function(object) {
                return {object:object, dx:0, dy:0};
            }), created:[]};
        movePlan.entries.forEach(function(entry) {
            entry.object.move(entry.dx, entry.dy);
            entry.object.render();
        });

        // Record move action for undo/redo
        if (finalDx !== 0 || finalDy !== 0) {
            aamap_recordAction({
                label: "Move object(s)",
                undo: function() {
                    movePlan.entries.forEach(function(entry) {
                        entry.object.move(-entry.dx, -entry.dy);
                    });
                    aamap_removeObjectGroup(movePlan.created);
                    vectron_render();
                },
                redo: function() {
                    aamap_restoreObjectGroup(movePlan.created);
                    movePlan.entries.forEach(function(entry) {
                        entry.object.move(entry.dx, entry.dy);
                    });
                    vectron_render();
                }
            });
        }

        // render adds to sets
        for(var i = 0, ii = selectTool_sets.length; i < ii; i++) {
        	if(selectTool_hoveredAamapObj.obj == selectTool_sets[i][0]) {
        		gui_writeLog("FOUND");
        		selectTool_hoveredSet = selectTool_sets[i];
        	}
        }

        shouldAddToSelected = false;
        selectTool_additiveSelection = false;
        selectTool_draggedPart = "object";

        vectron_toolActive = false;
        if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
        return;
    }

    if(selectTool_guideObj != null) selectTool_guideObj.animate({ opacity : 0 }, 150);
    else {
        gui_writeLog("unknown error occured.");
    }
    selectTool_endX = aamap_mapX(cursor_neverSnappedX);
    selectTool_endY = aamap_mapY(cursor_neverSnappedY);

    var additiveSelection = selectTool_additiveSelection || eventHandler_ctrl;
    if(!additiveSelection) {
        selectTool_deselectAll();
    }
    selectTool_selectArea(selectTool_mapX, selectTool_mapY, selectTool_endX, selectTool_endY, true, false);
    selectTool_additiveSelection = false;
    selectTool_draggedPart = "object";
    vectron_toolActive = false;
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
}

function selectTool_delete() {
    var checkpointStateBefore = typeof zoneTool_captureCheckpointEditorState === "function" ?
        zoneTool_captureCheckpointEditorState(aamap_objects) : null;
    var deletedObjs = aamap_symmetryExpandObjectGroups(selectTool_selectedObjs);
    if(deletedObjs.indexOf(selectTool_selectedTeleportDestination) >= 0) {
        selectTool_selectedTeleportDestination = null;
    }
    // Mark as deselected and remove Raphael elements directly
    deletedObjs.forEach(function(e) {
        e.isSelected = false;
        aamap_removeObjectVisuals(e);
    });
    aamap_objects = aamap_objects.diff(deletedObjs);
    selectTool_selectedObjs = [];
    if(checkpointStateBefore &&
        typeof zoneTool_syncCheckpointNumberForAvailability === "function") {
        zoneTool_syncCheckpointNumberForAvailability(aamap_objects);
    }
    var checkpointStateAfter = checkpointStateBefore &&
        typeof zoneTool_captureCheckpointEditorState === "function" ?
        zoneTool_captureCheckpointEditorState(aamap_objects) : null;

    // Build a count label: z(zones) w(walls) v(vertices) s(spawns)
    var zCount = 0, wCount = 0, vCount = 0, sCount = 0, rCount = 0, fCount = 0;
    deletedObjs.forEach(function(e) {
        if (e instanceof Zone) { zCount++; }
        else if (e instanceof Wall) { wCount++; vCount += e.points.length; }
        else if (e instanceof Spawn) { sCount++; }
        else if (aamap_isRamp(e)) { rCount++; }
        else if (typeof Floor !== "undefined" && e instanceof Floor) { fCount++; }
    });
    var parts = [];
    if (zCount > 0) parts.push('z(' + zCount + ')');
    if (wCount > 0) parts.push('w(' + wCount + ')');
    if (vCount > 0) parts.push('v(' + vCount + ')');
    if (sCount > 0) parts.push('s(' + sCount + ')');
    if (rCount > 0) parts.push('r(' + rCount + ')');
    if (fCount > 0) parts.push('f(' + fCount + ')');
    var countLabel = parts.length > 0 ? ' ' + parts.join(' ') : '';

    aamap_recordAction({
        label: "Delete" + countLabel,
        undo: function() {
            deletedObjs.forEach(function(e) { aamap_objects.push(e); });
            if(checkpointStateBefore &&
                typeof zoneTool_restoreCheckpointEditorState === "function") {
                zoneTool_restoreCheckpointEditorState(
                    checkpointStateBefore, aamap_objects, false);
            }
            vectron_render();
        },
        redo: function() {
            aamap_objects = aamap_objects.diff(deletedObjs);
            deletedObjs.forEach(function(e) {
                aamap_removeObjectVisuals(e);
            });
            if(checkpointStateAfter &&
                typeof zoneTool_restoreCheckpointEditorState === "function") {
                zoneTool_restoreCheckpointEditorState(
                    checkpointStateAfter, aamap_objects, false);
            }
            vectron_render();
        }
    });
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
    vectron_render();
}

function selectTool_selectArea(xStart, yStart, xEnd, yEnd, select, toggle)
{
    if( select === undefined ) select = true;
    if( toggle === undefined ) toggle = false;

    var selectFunc = select ? (function()
        {
            if(toggle && curObj.isSelected) {
                selectTool_deselect(curObj);
                selectTool_selectedObjs = selectTool_selectedObjs.diff([curObj]);
            } else {
                selectTool_select(curObj);
                if(selectTool_selectedObjs.indexOf(curObj) === -1) {
                    selectTool_selectedObjs.push( curObj );
                }
            }
        }
    ) : (function()
        {
            // give to-be-selected items a green glow
            if(curObj.glowObj) {
                curObj.glowObj.attr({"stroke": "#44ff44", "stroke-opacity": 0.45, "fill-opacity": 0.08});
            }
        }
    );
    
    selectedObjs = [];
    var params = selectTool_orderCorners( xStart, yStart, xEnd, yEnd );
    var hitParams = selectTool_expandMapRect(params, SELECT_TOOL_HIT_TOLERANCE);

    //params = [left, top, right, bottom]
    for( var i = 0; i < aamap_objects.length; i++ ) {
        var curObj = aamap_objects[i];
        if(!aamap_isObjectEditable(curObj)) continue;
        
        // reset glow before and during selecting
        selectTool_setGlowAttrs(curObj, selectTool_defaultGlowAttrs(curObj));
        
        if( curObj instanceof Wall ) {
            for(var j = 0; j < curObj.points.length - 1; j++) {
                var p1 = curObj.points[j];
                var p2 = curObj.points[j+1];
                if(selectTool_lineIntersectsRect(p1, p2, hitParams[0], hitParams[1], hitParams[2], hitParams[3])) {
                    selectFunc();
                    break;
                }
            }
        } 
        
        else if(curObj instanceof Zone) {
            var zoneHit = false;
            if(curObj.shapeType === "circle") {
                zoneHit = selectTool_circIntersectsRect(new WallPoint(curObj.x, curObj.y), curObj.radius,
                    hitParams[0], hitParams[1], hitParams[2], hitParams[3]);
            } else if(curObj.shapeType === "line" && Number(curObj.lineWidth) === 0) {
                zoneHit = selectTool_lineIntersectsRect(curObj.lineStart, curObj.lineEnd,
                    hitParams[0], hitParams[1], hitParams[2], hitParams[3]);
            } else {
                var zonePoints = curObj.shapeType === "line" &&
                    typeof curObj.getLineFootprintPoints === "function" ?
                    curObj.getLineFootprintPoints() : curObj.getMapPoints();
                for(var zp = 0; zp < zonePoints.length; zp++) {
                    var nextPoint = zonePoints[(zp + 1) % zonePoints.length];
                    if(selectTool_lineIntersectsRect(zonePoints[zp], nextPoint,
                        hitParams[0], hitParams[1], hitParams[2], hitParams[3])) {
                        zoneHit = true;
                        break;
                    }
                }
                if(!zoneHit && zonePoints.length >= 3) {
                    zoneHit = selectTool_pointInPolygon(zonePoints,
                        (hitParams[0] + hitParams[2]) / 2,
                        (hitParams[1] + hitParams[3]) / 2, 0);
                }
            }
            if(zoneHit) selectFunc();
        }

        else if(aamap_isRamp(curObj)) {
            var rampPoints = selectTool_rampPoints(curObj);
            if(selectTool_polygonIntersectsRect(rampPoints, hitParams)) selectFunc();
        }

        else if(typeof Floor !== "undefined" && curObj instanceof Floor) {
            if(selectTool_polygonIntersectsRect(curObj.points, hitParams)) selectFunc();
        }

        else {
            if( hitParams[0] <= curObj.x && curObj.x <= hitParams[2] &&
                hitParams[1] >= curObj.y && curObj.y >= hitParams[3] ) {
                selectFunc();
            }
        }
    }
    if( select )
    gui_writeLog(selectTool_selectedObjs.length);
}

function selectTool_select(aamapObject) {
    aamapObject.isSelected = true;
    aamapObject.render();
}

function selectTool_deselect(aamapObject) {
    if(selectTool_selectedTeleportDestination === aamapObject) {
        selectTool_selectedTeleportDestination = null;
    }
    aamapObject.isSelected = false;
    aamapObject.render();
}

function selectTool_deselectAll() {
    selectTool_selectedTeleportDestination = null;
    for(var i = 0, ii = selectTool_selectedObjs.length; i < ii; i++) {
        selectTool_deselect(selectTool_selectedObjs[i]);
    }
    selectTool_selectedObjs = [];
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
}

var selectTool_clipboard = "";
function selectTool_copy()
{
    var len = selectTool_selectedObjs.length;
    if(len == 0)
    {
        setTimeout(function(){alert("Nothing to copy!");},0);
    }
    else
    {
        selectTool_clipboard = "<Field>";
        for(var i=0;i<len;++i)
        {
            selectTool_clipboard += selectTool_selectedObjs[i].getXML()+"\n";
        }
        selectTool_clipboard += "</Field>";
    }
}

function selectTool_paste()
{
    if(selectTool_clipboard)
    {
        var checkpointStateBefore = typeof zoneTool_captureCheckpointEditorState === "function" ?
            zoneTool_captureCheckpointEditorState(aamap_objects) : null;
        var objsBeforePaste = aamap_objects.length;

        // Load copied objects
        xml_process_piece(selectTool_clipboard);

        if(aamap_objects.length == objsBeforePaste)
        {
            // Huh.
            setTimeout(function(){alert("Pasting failed, no objects were pasted.");},0);
            return;
        }

        /*
        // If these are objects that already existed on this map
        // determine that we need to move them to the cursor position
        var moveToCursor = false;
        for(var i=objsBeforePaste-1;i>=0;--i) // objects before paste
        {
            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                if(aamap_objects[i].getXML() == aamap_objects[z].getXML())
                {
                    moveToCursor = true;
                    break;
                }
            }
        }

        if(moveToCursor)
        */
        {
            var objsPasted = aamap_objects.length-objsBeforePaste;
            var x = 0, y = 0;
            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                var pos = aamap_objects[z].getPosition();
                x += pos[0]; y += pos[1];
            }
            x /= objsPasted; y /= objsPasted;

            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                aamap_objects[z].move(aamap_mapX(cursor_realX)-x,aamap_mapY(cursor_realY)-y);
            }
        }

        // Pasting is an editor placement too. Build reflected copies only
        // after the pasted originals have moved to the cursor so symmetry is
        // evaluated around the world origin, not around their old clipboard
        // coordinates.
        if(aamap_symmetryEnabled()) {
            var pastedPrimaries = aamap_objects.slice(objsBeforePaste);
            pastedPrimaries.forEach(function(object) {
                aamap_addSymmetryCopiesForExisting(object);
            });
        }

        // select pasted elements
        selectTool_deselectAll();
        var pastedObjs = [];
        for(var i=objsBeforePaste;i<aamap_objects.length;++i) // objects pasted
        {
            selectTool_select(aamap_objects[i]);
            selectTool_selectedObjs.push(aamap_objects[i]);
            pastedObjs.push(aamap_objects[i]);
        }

        var pastedHasCheckpoint = pastedObjs.some(function(object) {
            return object && object.zoneName === "checkpoint";
        });
        if(pastedHasCheckpoint &&
            typeof zoneTool_syncCheckpointNumberForAvailability === "function") {
            zoneTool_syncCheckpointNumberForAvailability(aamap_objects);
        }
        var checkpointStateAfter = pastedHasCheckpoint && checkpointStateBefore &&
            typeof zoneTool_captureCheckpointEditorState === "function" ?
            zoneTool_captureCheckpointEditorState(aamap_objects) : null;

        // Record paste for undo/redo
        aamap_recordAction({
            label: "Paste object(s)",
            undo: function() {
                aamap_objects = aamap_objects.diff(pastedObjs);
                selectTool_selectedObjs = selectTool_selectedObjs.filter(function(object) {
                    return pastedObjs.indexOf(object) < 0;
                });
                pastedObjs.forEach(function(e) {
                    e.isSelected = false;
                    aamap_removeObjectVisuals(e);
                });
                if(checkpointStateAfter &&
                    typeof zoneTool_restoreCheckpointEditorState === "function") {
                    zoneTool_restoreCheckpointEditorState(
                        checkpointStateBefore, aamap_objects, true);
                }
                vectron_render();
                if(window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
            },
            redo: function() {
                pastedObjs.forEach(function(e) {
                    e.isSelected = false;
                    aamap_objects.push(e);
                });
                if(checkpointStateAfter &&
                    typeof zoneTool_restoreCheckpointEditorState === "function") {
                    zoneTool_restoreCheckpointEditorState(
                        checkpointStateAfter, aamap_objects, false);
                }
                vectron_render();
                if(window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
            }
        });
        if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
    }
    else
    {
        setTimeout(function(){alert("Nothing to paste!");},0);
    }
}

function selectTool_orderCorners( xStart, yStart, xEnd, yEnd ) {
    var ordered = [];
    if( xStart < xEnd ) {
        if( yStart < yEnd ) {
            ordered = [xStart, yEnd, xEnd, yStart];
        } else {
            ordered = [xStart, yStart, xEnd, yEnd];
        } 
    } else {
        if( yStart < yEnd ) {
            ordered = [xEnd, yEnd, xStart, yStart];
        } else {
            ordered = [xEnd, yStart, xStart, yEnd];
        }
    }
    return ordered;
}

function selectTool_lineIntersectsLine(l1p1, l1p2, l2p1, l2p2) {
    var q = (l1p1.y - l2p1.y) * (l2p2.x - l2p1.x) - (l1p1.x - l2p1.x) * (l2p2.y - l2p1.y);
    var d = (l1p2.x - l1p1.x) * (l2p2.y - l2p1.y) - (l1p2.y - l1p1.y) * (l2p2.x - l2p1.x);

    if( d == 0 )
    {
        return false;
    }

    var r = q / d;

    q = (l1p1.y - l2p1.y) * (l1p2.x - l1p1.x) - (l1p1.x - l2p1.x) * (l1p2.y - l1p1.y);
    var s = q / d;

    if( r < 0 || r > 1 || s < 0 || s > 1 )
    {
        return false;
    }

    return true;
}

function selectTool_lineIntersectsRect(p1, p2, x0, y0, x1, y1) {
    return selectTool_lineIntersectsLine(p1, p2, new WallPoint(x0, y0), new WallPoint(x1, y0)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x1, y0), new WallPoint(x1, y1)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x1, y1), new WallPoint(x0, y1)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x0, y1), new WallPoint(x0, y0)) ||
           ( x0 <= p1.x && p1.x <= x1 &&
                y0 >= p1.y && p1.y >= y1 );
}

function selectTool_circIntersectsRect(p1, r, x0, y0, x1, y1) {
    if( x0 <= p1.x && p1.x <= x1 &&
        y0 >= p1.y && p1.y >= y1) {

        return true;
    }

    if(y0 >= p1.y && p1.y >= y1) {
        if(Math.abs(x1 - p1.x) <= r)
            return true;
    }

    if(y0 >= p1.y && p1.y >= y1) {
        if(Math.abs(x0 - p1.x) <= r)
            return true;
    }

    if(x0 <= p1.x && x1 >= p1.x) {
        if(Math.abs(y0 - p1.y) <= r)
            return true;
    }

    if(x0 <= p1.x && x1 >= p1.x) {
        if(Math.abs(y1 - p1.y) <= r)
            return true;
    }

    var point1 = new WallPoint(x0, y0);
    var point2 = new WallPoint(x1, y0);
    var point3 = new WallPoint(x1, y1);
    var point4 = new WallPoint(x0, y1);

    var dist1x = Math.abs(p1.x - point1.x);
    var dist1y = Math.abs(p1.y - point1.y);
    if(dist1x <= r && dist1y <= r)
        return true;

    var dist2x = Math.abs(p1.x - point2.x);
    var dist2y = Math.abs(p1.y - point2.y);
    if(dist2x <= r && dist2y <= r)
        return true;

    var dist3x = Math.abs(p1.x - point3.x);
    var dist3y = Math.abs(p1.y - point3.y);
    if(dist3x <= r && dist3y <= r)
        return true;

    var dist4x = Math.abs(p1.x - point4.x);
    var dist4y = Math.abs(p1.y - point4.y);
    if(dist4x <= r && dist4y <= r)
        return true;

    return false;
}

function selectTool_addInvisibleGlow(aamapObject) {
    if(!aamap_isObjectEditable(aamapObject)) return;
    var color = config_isDark ? "#77bbff" : "#375ffc";
    if(aamapObject instanceof Wall) {
        aamapObject.glowObj = vectron_screen.path(selectTool_wallGlowPath(aamapObject));
    } else if(aamapObject instanceof Zone) {
        if(aamapObject.shapeType === "circle") {
            aamapObject.glowObj = vectron_screen.circle(
                aamap_realX(aamapObject.x), aamap_realY(aamapObject.y),
                Math.max(0, aamapObject.radius * vectron_zoom));
        } else {
            var zonePoints = aamapObject.shapeType === "line" &&
                Number(aamapObject.lineWidth) > 0 &&
                typeof aamapObject.getLineFootprintPoints === "function" ?
                aamapObject.getLineFootprintPoints() : aamapObject.getMapPoints();
            var zonePath = [];
            for(var z = 0; z < zonePoints.length; z++) {
                zonePath.push(z === 0 ? "M" : "L", aamap_realX(zonePoints[z].x), aamap_realY(zonePoints[z].y));
            }
            if((aamapObject.shapeType !== "line" || Number(aamapObject.lineWidth) > 0) &&
                zonePoints.length) zonePath.push("Z");
            aamapObject.glowObj = vectron_screen.path(zonePath);
        }
    } else if(aamapObject instanceof Spawn) {
        aamapObject.glowObj = vectron_screen.path(selectTool_spawnGlowPath(aamapObject));
    } else if(aamap_isRamp(aamapObject)) {
        var rampPoints = selectTool_rampPoints(aamapObject);
        var rampPath = [];
        rampPoints.forEach(function(point, index) {
            rampPath.push(index ? "L" : "M", aamap_realX(point.x), aamap_realY(point.y));
        });
        if(rampPoints.length) rampPath.push("Z");
        aamapObject.glowObj = vectron_screen.path(rampPath);
    } else if(typeof Floor !== "undefined" && aamapObject instanceof Floor) {
        var floorPath = [];
        aamapObject.points.forEach(function(point, index) {
            floorPath.push(index ? "L" : "M", aamap_realX(point.x), aamap_realY(point.y));
        });
        if(aamapObject.points.length) floorPath.push("Z");
        aamapObject.glowObj = vectron_screen.path(floorPath);
    }
    if(!aamapObject.glowObj) return;
    aamapObject.glowObj.attr({
        stroke: color,
        "stroke-width": SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-opacity": 0,
        fill: selectTool_hasArea(aamapObject) ? color : "none",
        "fill-opacity": 0,
        cursor: "default"
    });
    if(aamapObject instanceof Zone && aamapObject.shapeType === "line" &&
        Number(aamapObject.lineWidth) === 0) {
        aamapObject.glowObj.attr({
            "stroke-width":SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH,
            fill:"none"
        });
    } else if(aamap_isRamp(aamapObject) ||
        (typeof Floor !== "undefined" && aamapObject instanceof Floor)) {
        aamapObject.glowObj.attr({"stroke-width":SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH, fill:color});
    }
    selectTool_setGlowAttrs(aamapObject, selectTool_defaultGlowAttrs(aamapObject));
    aamapObject.glowObj.insertBefore(aamapObject.obj);
    aamapObject.obj.toFront();
}

function selectTool_removeInvisibleGlow(aamapObject) {
    if(aamapObject.glowObj) {
        aamapObject.glowObj.remove();
        aamapObject.glowObj = null;
    }
    if(aamapObject.destinationGlowObj) {
        aamapObject.destinationGlowObj.remove();
        aamapObject.destinationGlowObj = null;
    }
}

function selectTool_addTeleportDestinationInvisibleGlow(aamapObject) {
    if(!selectTool_isTeleportDestinationEditable(aamapObject) ||
        !aamapObject.destinationObj) return;
    if(aamapObject.destinationGlowObj) aamapObject.destinationGlowObj.remove();
    var direction = aamapObject.getTeleportDirection();
    var color = config_isDark ? "#77bbff" : "#375ffc";
    aamapObject.destinationGlowObj = spawnMarker_create(
        aamap_realX(Number(aamapObject.options.destination_x)),
        aamap_realY(Number(aamapObject.options.destination_y)),
        direction.x, direction.y, color, "none");
    aamapObject.destinationGlowObj.attr({
        "stroke-width":SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH,
        "stroke-linecap":"round",
        "stroke-linejoin":"round"
    });
    selectTool_setTeleportDestinationGlowAttrs(aamapObject, false);
    if(typeof aamapObject.destinationGlowObj.insertBefore === "function") {
        aamapObject.destinationGlowObj.insertBefore(aamapObject.destinationObj);
    }
    if(typeof aamapObject.destinationObj.toFront === "function") {
        aamapObject.destinationObj.toFront();
    }
}

function selectTool_addHoverSet(aamapObject) {
    if(!aamap_isObjectEditable(aamapObject)) return;
    selectTool_addInvisibleGlow(aamapObject);
    if(!aamapObject.glowObj) return;
    var set = vectron_screen.set().push(aamapObject.obj, aamapObject.glowObj);
    set._aamapObject = aamapObject;
    set._aamapPart = "object";
    selectTool_sets.push(set);
    set.hoverset(vectron_screen, selectTool_hoverIn, selectTool_hoverOut);
}

function selectTool_addHoverSetSelected(aamapObject) {
    if(!aamap_isObjectEditable(aamapObject)) return;
    selectTool_addInvisibleGlow(aamapObject);
    if(!aamapObject.glowObj) return;
    var set = vectron_screen.set().push(aamapObject.obj, aamapObject.glowObj);
    set._aamapObject = aamapObject;
    set._aamapPart = "object";
    selectTool_sets.push(set);
    set.hoverset(vectron_screen, selectTool_hoverInSelected, selectTool_hoverOutSelected);
}

function selectTool_addTeleportDestinationHoverSet(aamapObject) {
    if(!selectTool_isTeleportDestinationEditable(aamapObject)) return;
    selectTool_addTeleportDestinationInvisibleGlow(aamapObject);
    if(!aamapObject.destinationObj || !aamapObject.destinationGlowObj) return;
    var set = vectron_screen.set().push(
        aamapObject.destinationObj, aamapObject.destinationGlowObj);
    set._aamapObject = aamapObject;
    set._aamapPart = "teleport-destination";
    selectTool_sets.push(set);
    if(selectTool_selectedTeleportDestination === aamapObject) {
        set.hoverset(vectron_screen, selectTool_hoverInSelected, selectTool_hoverOutSelected);
    } else {
        set.hoverset(vectron_screen, selectTool_hoverIn, selectTool_hoverOut);
    }
}

var selectTool_hoverIn = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
}

var selectTool_hoverOut = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
    gui_writeLog("Null Now");
}

var selectTool_hoverInSelected = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
}

var selectTool_hoverOutSelected = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
    gui_writeLog("NUll now");
}
