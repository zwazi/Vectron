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

var zoneTool_typeArray = {
    undefined: ["null", "#888888"],
    0: ["death", "#ff0000"],
    1: ["win", "#00a800"],
    2: ["target", "#00ff00"],
    3: ["rubber", "#ffc12b"],
    4: ["fortress", "#62bef6"],
    5: ["checkpoint", "#9b59b6"],
    6: ["speed", "#3498db"],
    7: ["teleport", "#e67e22"]
}

var zoneTool_whatType = {
    "death":0,
    "win":1,
    "target":2,
    "rubber":3,
    "fortress":4,
    "checkpoint":5,
    "speed":6,
    "teleport":7
}

var zoneTool_radius = 1;
var zoneTool_guideObj = null;
var zoneTool_type = 0;

var zoneTool_placingSize = false;
var zoneTool_centerRealX = 0;
var zoneTool_centerRealY = 0;
var zoneTool_centerMapX = 0;
var zoneTool_centerMapY = 0;
var zoneTool_points = [];
var zoneTool_stage = "shape";
var zoneTool_pendingZone = null;

var ZONE_TOOL_CENTER_MARKER_RADIUS = 4;
var ZONE_TOOL_MIN_POLYGON_POINTS = 3;
var ZONE_TOOL_DIRECTION_EPSILON = 1e-9;
var ZONE_TOOL_DEFAULT_XDIR = 1;
var ZONE_TOOL_DEFAULT_YDIR = 0;
var ZONE_TOOL_LEGACY_CHECKPOINT_ORDER = 1;
var ZONE_TOOL_RACING_CHECKPOINT_ORDER = 0;
var ZONE_TOOL_LEGACY_TYPES = [0, 1, 2, 3, 4, 5];
var ZONE_TOOL_RACING_TYPES = [0, 1, 3, 5, 6, 7];

function zoneTool_validCheckpointOrder(value, racing) {
    var minimum = racing ? ZONE_TOOL_RACING_CHECKPOINT_ORDER : ZONE_TOOL_LEGACY_CHECKPOINT_ORDER;
    return isFinite(value) && value >= minimum && Math.floor(value) === value;
}

function zoneTool_removeGuide() {
    if(zoneTool_guideObj != null) {
        zoneTool_guideObj.remove();
        zoneTool_guideObj = null;
    }
}

function zoneTool_setStatus(message) {
    $("#zone-tool-status").text(message);
}

function zoneTool_resetPlacement() {
    zoneTool_removeGuide();
    if(zoneTool_pendingZone && aamap_objects.indexOf(zoneTool_pendingZone) < 0 &&
        zoneTool_pendingZone.obj) zoneTool_pendingZone.obj.remove();
    zoneTool_points = [];
    zoneTool_stage = "shape";
    zoneTool_pendingZone = null;
    zoneTool_placingSize = false;
    vectron_toolActive = false;
}

function zoneTool_cancelPlacement() {
    zoneTool_resetPlacement();
    zoneTool_updateStatus();
    zoneTool_guide();
}

function zoneTool_updateStatus() {
    var shape = xml_game_mode === "armaracing" ? $("#dZoneShape").val() : "circle";
    if(zoneTool_stage === "teleport-position") {
        zoneTool_setStatus("Click the teleport destination.");
    } else if(zoneTool_stage === "teleport-direction") {
        zoneTool_setStatus("Click to set the destination direction.");
    } else if(shape === "polygon") {
        zoneTool_setStatus(zoneTool_points.length ?
            "Keep placing vertices; double-click or use Finish Polygon." :
            "Click to place polygon vertices.");
    } else if(shape === "rectangle") {
        zoneTool_setStatus(zoneTool_points.length ?
            "Click the opposite corner." : "Click the first corner.");
    } else {
        zoneTool_setStatus(zoneTool_placingSize ?
            "Click the circle edge." : "Click the circle center.");
    }
    $("#zone-tool-finish").toggle(shape === "polygon" && zoneTool_stage === "shape" &&
        zoneTool_points.length >= ZONE_TOOL_MIN_POLYGON_POINTS);
    $("#zone-tool-cancel").toggle(vectron_toolActive);
}

function zoneTool_connect() {
    $(".toolbar-toolZone").addClass("toolbar-tool-active");
    zoneTool_radius = vectron_grid_spacing;
    zoneTool_updateRubberBar();
    $("#zone-tool-window").show();
    zoneTool_updateWindowActiveType();
    zoneTool_updateStatus();
    gui_refreshFloatingWindows();
}

function zoneTool_setGameMode(mode) {
    xml_game_mode = mode === "armaracing" ? "armaracing" : "armagetron";
    $("#map_game_mode").val(xml_game_mode);
    $(".armaracing-only").toggle(xml_game_mode === "armaracing");
    $(".zone-type-btn[data-type='2'],.zone-type-btn[data-type='4']").toggle(xml_game_mode !== "armaracing");
    $("#map_axes").attr("min", xml_game_mode === "armaracing" ? 1 : 2)
        .attr("max", xml_game_mode === "armaracing" ? 65535 : 360);
    if(xml_game_mode !== "armaracing" && zoneTool_type > 5) zoneTool_type = 0;
    var checkpoint = $("#dCheckpointOrder");
    checkpoint.attr("min", xml_game_mode === "armaracing" ?
        ZONE_TOOL_RACING_CHECKPOINT_ORDER : ZONE_TOOL_LEGACY_CHECKPOINT_ORDER);
    if(xml_game_mode === "armaracing" &&
        Number(checkpoint.val()) === ZONE_TOOL_LEGACY_CHECKPOINT_ORDER) {
        checkpoint.val(ZONE_TOOL_RACING_CHECKPOINT_ORDER);
    }
    if(xml_game_mode !== "armaracing" &&
        Number(checkpoint.val()) < ZONE_TOOL_LEGACY_CHECKPOINT_ORDER) {
        checkpoint.val(ZONE_TOOL_LEGACY_CHECKPOINT_ORDER);
    }
    zoneTool_updateRubberBar();
    zoneTool_updateWindowActiveType();
}

function zoneTool_disconnect() {
    zoneTool_resetPlacement();
    $(".toolbar-toolZone").removeClass("toolbar-tool-active");
    $("#rubber-zone-bar").hide();
    $("#zone-tool-window").hide();
    gui_refreshFloatingWindows();
}

function zoneTool_updateRubberBar() {
    if(zoneTool_type === 3 && xml_game_mode !== "armaracing") {
        $("#zone-rubber-setting").show();
    } else {
        $("#zone-rubber-setting").hide();
    }
    if(zoneTool_type === 5) {
        $("#zone-checkpoint-setting").show();
    } else {
        $("#zone-checkpoint-setting").hide();
    }
    $("#zone-speed-setting").toggle(xml_game_mode === "armaracing" && zoneTool_type === 6);
    $("#zone-racing-rubber-setting").toggle(xml_game_mode === "armaracing" && zoneTool_type === 3);
    $("#zone-teleport-setting").toggle(xml_game_mode === "armaracing" && zoneTool_type === 7);
    var customShape = xml_game_mode === "armaracing" && $("#dZoneShape").val() !== "circle";
    $("#zone-polygon-setting").toggle(xml_game_mode === "armaracing" && $("#dZoneShape").val() === "polygon");
    $("#zone-quick-placement").toggle(!customShape);
    $("#zone-quick-size-row").toggle(!customShape && $("#zone-quick-placement-toggle").is(":checked"));
    zoneTool_updateStatus();
    vectron_render();
}

function zoneTool_updateWindowActiveType() {
    $(".zone-type-btn").removeClass("active-zone-type");
    $(".zone-type-btn[data-type='" + zoneTool_type + "']").addClass("active-zone-type");
}

function zoneTool_guide() {
    zoneTool_removeGuide();

    var color = zoneTool_typeArray[zoneTool_type][1];
    if(zoneTool_stage === "teleport-position") {
        zoneTool_guideObj = vectron_screen.circle(cursor_realX, cursor_realY, 6)
            .attr({"stroke":"#00d9ff", "fill":"#00d9ff", "fill-opacity":0.45});
        return;
    }
    if(zoneTool_stage === "teleport-direction") {
        var start = zoneTool_points[0];
        zoneTool_guideObj = vectron_screen.path([
            "M", aamap_realX(start.x), aamap_realY(start.y),
            "L", cursor_realX, cursor_realY
        ]).attr({"stroke":"#00d9ff", "stroke-width":2, "stroke-dasharray":"--"});
        return;
    }

    var shape = xml_game_mode === "armaracing" ? $("#dZoneShape").val() : "circle";
    if(shape === "polygon" && zoneTool_points.length) {
        var polygonPath = ["M", aamap_realX(zoneTool_points[0].x), aamap_realY(zoneTool_points[0].y)];
        for(var p = 1; p < zoneTool_points.length; p++) {
            polygonPath.push("L", aamap_realX(zoneTool_points[p].x), aamap_realY(zoneTool_points[p].y));
        }
        polygonPath.push("L", cursor_realX, cursor_realY);
        if(zoneTool_points.length >= ZONE_TOOL_MIN_POLYGON_POINTS) {
            polygonPath.push("L", aamap_realX(zoneTool_points[0].x), aamap_realY(zoneTool_points[0].y));
        }
        zoneTool_guideObj = vectron_screen.path(polygonPath).attr({
            "stroke":color, "stroke-dasharray":"--..", "fill":"none"
        });
        return;
    }
    if(shape === "rectangle" && zoneTool_points.length) {
        var corner = zoneTool_points[0];
        zoneTool_guideObj = vectron_screen.rect(
            Math.min(aamap_realX(corner.x), cursor_realX),
            Math.min(aamap_realY(corner.y), cursor_realY),
            Math.abs(aamap_realX(corner.x) - cursor_realX),
            Math.abs(aamap_realY(corner.y) - cursor_realY)
        ).attr({"stroke":color, "stroke-dasharray":"--..", "fill":color, "fill-opacity":0.2});
        return;
    }

    if (shape === "circle" && zoneTool_placingSize) {
        var dx = cursor_realX - zoneTool_centerRealX;
        var dy = cursor_realY - zoneTool_centerRealY;
        var screenRadius = Math.sqrt(dx * dx + dy * dy);
        zoneTool_guideObj = vectron_screen.circle(
            zoneTool_centerRealX, zoneTool_centerRealY, screenRadius
        ).attr({
            "stroke": color, "stroke-dasharray": "--..",
            "fill": color, "fill-opacity": "0.2"
        });
    } else if (shape === "circle" && $("#zone-quick-placement-toggle").is(":checked")) {
        var quickR = parseFloat($("#zone-quick-size").val());
        if (isNaN(quickR) || quickR <= 0) quickR = 32;
        var screenR = quickR * vectron_zoom;
        zoneTool_guideObj = vectron_screen.circle(
            cursor_realX, cursor_realY, screenR
        ).attr({
            "stroke": color, "stroke-dasharray": "--..",
            "fill": color, "fill-opacity": "0.2"
        });
    } else {
        zoneTool_guideObj = vectron_screen.circle(
            cursor_realX, cursor_realY, ZONE_TOOL_CENTER_MARKER_RADIUS
        ).attr({"stroke": color, "fill": color, "fill-opacity": "0.5"});
    }
}

function zoneTool_addZone(newZone) {
    aamap_add(newZone);
    aamap_recordAction({
        label: "Add zone",
        undo: function() { _aamap_removeObj(newZone); vectron_render(); },
        redo: function() { aamap_objects.push(newZone); vectron_render(); }
    });
    zoneTool_resetPlacement();
    zoneTool_updateStatus();
    vectron_render();
}

function zoneTool_finishGeometry(newZone) {
    if(zoneTool_type === 7 && xml_game_mode === "armaracing") {
        zoneTool_pendingZone = newZone;
        zoneTool_points = [];
        zoneTool_stage = "teleport-position";
        zoneTool_placingSize = true;
        vectron_toolActive = true;
        zoneTool_updateStatus();
        zoneTool_guide();
        return;
    }
    zoneTool_addZone(newZone);
}

function zoneTool_finishPolygon() {
    if(zoneTool_stage !== "shape" || zoneTool_points.length < ZONE_TOOL_MIN_POLYGON_POINTS) {
        gui_writeLog("Polygon zones require at least three points.");
        return;
    }
    var points = zoneTool_points.slice();
    var x = 0, y = 0;
    for(var i = 0; i < points.length; i++) { x += points[i].x; y += points[i].y; }
    x /= points.length; y /= points.length;
    var details = zoneTool_buildDetails(x, y, 1);
    details.polygonScale = 1;
    // ShapePolygon stores an absolute origin followed by vertices local to that origin.
    details.polygonPoints = points.map(function(point) {
        return {x:point.x - x, y:point.y - y};
    });
    zoneTool_finishGeometry(new Zone(x, y, 0, ZONE_DEFAULT_GROWTH, zoneTool_type,
        zoneTool_getOption(), details));
}

function zoneTool_complete() {
    if(zoneTool_type === 5) {
        var checkpointOrder = Number($("#dCheckpointOrder").val());
        var minimumOrder = xml_game_mode === "armaracing" ?
            ZONE_TOOL_RACING_CHECKPOINT_ORDER : ZONE_TOOL_LEGACY_CHECKPOINT_ORDER;
        if(!zoneTool_validCheckpointOrder(checkpointOrder, xml_game_mode === "armaracing")) {
            gui_writeLog("Checkpoint order must be a whole number starting at " + minimumOrder + ".");
            return;
        }
    }

    if(zoneTool_stage === "teleport-position") {
        var destinationX = aamap_mapX(cursor_realX);
        var destinationY = aamap_mapY(cursor_realY);
        zoneTool_pendingZone.options.destination_x = destinationX;
        zoneTool_pendingZone.options.destination_y = destinationY;
        $("#dTeleportX").val(destinationX);
        $("#dTeleportY").val(destinationY);
        zoneTool_points = [{x:destinationX, y:destinationY}];
        zoneTool_stage = "teleport-direction";
        zoneTool_updateStatus();
        zoneTool_guide();
        return;
    }
    if(zoneTool_stage === "teleport-direction") {
        var destination = zoneTool_points[0];
        var directionX = aamap_mapX(cursor_realX) - destination.x;
        var directionY = aamap_mapY(cursor_realY) - destination.y;
        var directionLength = Math.sqrt(directionX * directionX + directionY * directionY);
        if(directionLength <= ZONE_TOOL_DIRECTION_EPSILON) {
            // Clicking on the destination itself keeps the format's default eastward direction.
            directionX = ZONE_TOOL_DEFAULT_XDIR;
            directionY = ZONE_TOOL_DEFAULT_YDIR;
        }
        else { directionX /= directionLength; directionY /= directionLength; }
        zoneTool_pendingZone.options.xdir = directionX;
        zoneTool_pendingZone.options.ydir = directionY;
        $("#dTeleportXDir").val(directionX);
        $("#dTeleportYDir").val(directionY);
        zoneTool_addZone(zoneTool_pendingZone);
        return;
    }

    var shape = xml_game_mode === "armaracing" ? $("#dZoneShape").val() : "circle";
    var clickPoint = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
    if(shape === "polygon") {
        var previous = zoneTool_points[zoneTool_points.length - 1];
        // A finishing double-click produces two mouse-up events at the same vertex.
        if(!previous || previous.x !== clickPoint.x || previous.y !== clickPoint.y) {
            zoneTool_points.push(clickPoint);
        }
        zoneTool_placingSize = true;
        vectron_toolActive = true;
        zoneTool_updateStatus();
        zoneTool_guide();
        return;
    }
    if(shape === "rectangle") {
        if(!zoneTool_points.length) {
            zoneTool_points.push(clickPoint);
            zoneTool_placingSize = true;
            vectron_toolActive = true;
            zoneTool_updateStatus();
            zoneTool_guide();
            return;
        }
        var first = zoneTool_points[0];
        if(first.x === clickPoint.x || first.y === clickPoint.y) {
            gui_writeLog("Rectangle width and height must be greater than 0.");
            return;
        }
        var rectangleDetails = zoneTool_buildDetails(0, 0, 1);
        rectangleDetails.minx = Math.min(first.x, clickPoint.x);
        rectangleDetails.miny = Math.min(first.y, clickPoint.y);
        rectangleDetails.maxx = Math.max(first.x, clickPoint.x);
        rectangleDetails.maxy = Math.max(first.y, clickPoint.y);
        zoneTool_finishGeometry(new Zone(0, 0, 0, ZONE_DEFAULT_GROWTH, zoneTool_type,
            zoneTool_getOption(), rectangleDetails));
        return;
    }

    // Quick placement: place a circular zone at the cursor with a preset radius.
    if ($("#zone-quick-placement-toggle").is(":checked")) {
        var quickR = parseFloat($("#zone-quick-size").val());
        if (isNaN(quickR) || quickR <= 0) quickR = 32;
        var cx = aamap_mapX(cursor_realX);
        var cy = aamap_mapY(cursor_realY);
        var quickDetails = zoneTool_buildDetails(cx, cy, quickR);
        if(!quickDetails) return;
        var newZone = new Zone(cx, cy, quickR, ZONE_DEFAULT_GROWTH, zoneTool_type,
            zoneTool_getOption(), quickDetails);
        zoneTool_finishGeometry(newZone);
        return;
    }

    if (!zoneTool_placingSize) {
        zoneTool_centerRealX = cursor_realX;
        zoneTool_centerRealY = cursor_realY;
        zoneTool_centerMapX = aamap_mapX(cursor_realX);
        zoneTool_centerMapY = aamap_mapY(cursor_realY);
        zoneTool_placingSize = true;
        vectron_toolActive = true;
        zoneTool_guide();
        return;
    }

    var dx = cursor_realX - zoneTool_centerRealX;
    var dy = cursor_realY - zoneTool_centerRealY;
    var screenRadius = Math.sqrt(dx * dx + dy * dy);
    var radius = screenRadius / vectron_zoom;

    if (radius <= 0) {
        gui_writeLog("Zone radius must be greater than 0.");
        return;
    }

    var newX = zoneTool_centerMapX;
    var newY = zoneTool_centerMapY;

    var prevObjs = aamap_objects;
    for(var i = 0; i < prevObjs.length; i++) {
        if(prevObjs[i] instanceof Zone) {
            if(prevObjs[i].x == newX && prevObjs[i].y == newY &&
                prevObjs[i].radius == radius) {

                gui_writeLog("Prevented Duplicate Zone anytype.<br>" +
                    "Check settings to disable this feature.");
                return;
            }
        }
    }

    var details = zoneTool_buildDetails(newX, newY, radius);
    if(!details) return;
    var newZone = new Zone(newX, newY, radius, ZONE_DEFAULT_GROWTH, zoneTool_type,
        zoneTool_getOption(), details);
    zoneTool_finishGeometry(newZone);
}

function zoneTool_numberValue(selector, fallback) {
    var value = Number($(selector).val());
    return isFinite(value) ? value : fallback;
}

function zoneTool_getOption() {
    if(zoneTool_type === 5) return zoneTool_numberValue("#dCheckpointOrder",
        xml_game_mode === "armaracing" ? ZONE_TOOL_RACING_CHECKPOINT_ORDER :
            ZONE_TOOL_LEGACY_CHECKPOINT_ORDER);
    if(zoneTool_type === 3 && xml_game_mode !== "armaracing") return zoneTool_numberValue("#dRubberVal", 2);
    return 0;
}

function zoneTool_buildDetails(x, y, size) {
    var details = {
        zoneName: zoneTool_typeArray[zoneTool_type][0],
        shapeType: xml_game_mode === "armaracing" ? $("#dZoneShape").val() : "circle",
        options: {}
    };
    if(xml_game_mode !== "armaracing") return details;

    var priority = $("#dZonePriority").val();
    var startTick = $("#dZoneStartTick").val();
    var endTick = $("#dZoneEndTick").val();
    details.priority = priority === "" ? undefined : Number(priority);
    details.startTick = startTick === "" ? undefined : Number(startTick);
    details.endTick = endTick === "" ? undefined : Number(endTick);
    details.trigger = $("#dZoneTrigger").val();

    if(details.shapeType === "rectangle") {
        details.minx = x - size; details.miny = y - size;
        details.maxx = x + size; details.maxy = y + size;
    } else if(details.shapeType === "polygon") {
        details.polygonScale = 1;
        details.polygonPoints = [];
    }

    if(zoneTool_type === 6) {
        details.options.delta_mps = zoneTool_numberValue("#dSpeedDelta", 5);
        details.options.duration_ticks = zoneTool_numberValue("#dSpeedDuration", 90);
    } else if(zoneTool_type === 3) {
        details.options.delta = zoneTool_numberValue("#dRacingRubberDelta", 500);
        details.options.duration_ticks = zoneTool_numberValue("#dRacingRubberDuration", 120);
    } else if(zoneTool_type === 7) {
        details.options.destination_x = zoneTool_numberValue("#dTeleportX", 0);
        details.options.destination_y = zoneTool_numberValue("#dTeleportY", 0);
        details.options.xdir = zoneTool_numberValue("#dTeleportXDir", 1);
        details.options.ydir = zoneTool_numberValue("#dTeleportYDir", 0);
    }
    return details;
}
