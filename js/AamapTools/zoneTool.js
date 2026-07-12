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

var ZONE_TOOL_CENTER_MARKER_RADIUS = 4;
var ZONE_TOOL_MIN_POLYGON_POINTS = 3;
var ZONE_TOOL_LEGACY_CHECKPOINT_ORDER = 1;
var ZONE_TOOL_RACING_CHECKPOINT_ORDER = 0;

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

function zoneTool_connect() {
    $(".toolbar-toolZone").addClass("toolbar-tool-active");
    zoneTool_radius = vectron_grid_spacing;
    zoneTool_updateRubberBar();
    $("#zone-tool-window").show();
    zoneTool_updateWindowActiveType();
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
    zoneTool_removeGuide();
    zoneTool_placingSize = false;
    vectron_toolActive = false;
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
    $("#zone-polygon-setting").toggle(xml_game_mode === "armaracing" && $("#dZoneShape").val() === "polygon");
    vectron_render();
}

function zoneTool_updateWindowActiveType() {
    $(".zone-type-btn").removeClass("active-zone-type");
    $(".zone-type-btn[data-type='" + zoneTool_type + "']").addClass("active-zone-type");
}

function zoneTool_guide() {
    zoneTool_removeGuide();

    var color = zoneTool_typeArray[zoneTool_type][1];

    if (zoneTool_placingSize) {
        var dx = cursor_realX - zoneTool_centerRealX;
        var dy = cursor_realY - zoneTool_centerRealY;
        var screenRadius = Math.sqrt(dx * dx + dy * dy);
        zoneTool_guideObj = vectron_screen.circle(
            zoneTool_centerRealX, zoneTool_centerRealY, screenRadius
        ).attr({
            "stroke": color, "stroke-dasharray": "--..",
            "fill": color, "fill-opacity": "0.2"
        });
    } else if ($("#zone-quick-placement-toggle").is(":checked")) {
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

    // Quick placement: place zone at cursor with preset radius in one click
    if ($("#zone-quick-placement-toggle").is(":checked")) {
        var quickR = parseFloat($("#zone-quick-size").val());
        if (isNaN(quickR) || quickR <= 0) quickR = 32;
        var cx = aamap_mapX(cursor_realX);
        var cy = aamap_mapY(cursor_realY);
        var quickDetails = zoneTool_buildDetails(cx, cy, quickR);
        if(!quickDetails) return;
        var newZone = new Zone(cx, cy, quickR, 0, zoneTool_type,
            zoneTool_getOption(), quickDetails);
        aamap_add(newZone);
        aamap_recordAction({
            label: "Add zone",
            undo: function() { _aamap_removeObj(newZone); vectron_render(); },
            redo: function() { aamap_objects.push(newZone); vectron_render(); }
        });
        zoneTool_removeGuide();
        vectron_render();
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
    var newZone = new Zone(newX, newY, radius, 0, zoneTool_type,
        zoneTool_getOption(), details);
    aamap_add(newZone);
    aamap_recordAction({
        label: "Add zone",
        undo: function() { _aamap_removeObj(newZone); vectron_render(); },
        redo: function() { aamap_objects.push(newZone); vectron_render(); }
    });
    zoneTool_removeGuide();
    zoneTool_placingSize = false;
    vectron_toolActive = false;
    vectron_render();
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
        details.polygonScale = size;
        details.polygonPoints = [];
        var tokens = $("#dPolygonPoints").val().trim().split(/\s+/);
        for(var i = 0; i < tokens.length; i++) {
            var pair = tokens[i].split(",");
            var px = Number(pair[0]), py = Number(pair[1]);
            if(pair.length !== 2 || !isFinite(px) || !isFinite(py)) {
                gui_writeLog("Invalid polygon point " + (i + 1) + ' ("' + tokens[i] +
                    '"); use space-separated x,y pairs.');
                return null;
            }
            details.polygonPoints.push({x:px, y:py});
        }
        if(details.polygonPoints.length < ZONE_TOOL_MIN_POLYGON_POINTS) {
            gui_writeLog("Polygon zones require at least three local points.");
            return null;
        }
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
