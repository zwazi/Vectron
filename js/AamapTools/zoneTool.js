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
    6: ["teleport", "#00d9e8"]
}

var zoneTool_whatType = {
    "death":0,
    "win":1,
    "target":2,
    "rubber":3,
    "fortress":4,
    "checkpoint":5,
    "teleport":6
}

var zoneTool_radius = 1;
var zoneTool_guideObj = null;
var zoneTool_type = 0;

var zoneTool_placingSize = false;
var zoneTool_stage = "center";
var zoneTool_pendingRadius = 0;
var zoneTool_pendingTeleport = null;
var zoneTool_selectedZone = null;
var zoneTool_centerRealX = 0;
var zoneTool_centerRealY = 0;
var zoneTool_centerMapX = 0;
var zoneTool_centerMapY = 0;

var ZONE_TOOL_CENTER_MARKER_RADIUS = 4;

function zoneTool_removeGuide() {
    if(zoneTool_guideObj != null) {
        zoneTool_guideObj.remove();
        zoneTool_guideObj = null;
    }
}

function zoneTool_setStatus(message) {
    $("#zone-tool-status").text(message || "");
}

function zoneTool_resetPlacement() {
    zoneTool_removeGuide();
    zoneTool_placingSize = false;
    zoneTool_stage = "center";
    zoneTool_pendingRadius = 0;
    zoneTool_pendingTeleport = null;
    vectron_toolActive = false;
    zoneTool_setStatus("Click a zone center.");
}

function zoneTool_cursorMapPoint() {
    var realX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
    var realY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
    return {x:aamap_mapX(realX), y:aamap_mapY(realY), realX:realX, realY:realY};
}

function zoneTool_ensureSpecialDtd() {
    var current = String($("#map_dtd").val() || xml_dtd || "sty.dtd").trim();
    var incompatible = /^(sty\.dtd|map-0\.2\.(8|9)(?:_beta3)?\.dtd|map-0\.3\.1-a\.dtd|Anonymous\/map-0\.2\.8\.dtd)$/i;
    if(incompatible.test(current)) {
        xml_dtd = "map-0.2.9_styctap_v1.5.dtd";
        $("#map_dtd").val(xml_dtd);
        if(typeof gui_toast === "function") gui_toast("Switched to the teleport/checkpoint-compatible DTD.");
    } else if(!/styctap.*v1\.5/i.test(current) && typeof gui_toast === "function") {
        gui_toast("Verify that the selected custom DTD supports teleport and checkpoint zones.");
    }
}

function zoneTool_setCheckpointMode(value) {
    var mode = String(value) === "1" ? "1" : "2";
    $("#dCheckpointMode").val(mode);
    if(typeof xml_settings === "undefined") return mode;
    for(var index = xml_settings.length - 1; index >= 0; index--) {
        if(String(xml_settings[index]).trim().toUpperCase().indexOf("RACE_CHECKPOINT_REQUIRE_HIT ") === 0) {
            xml_settings.splice(index, 1);
        }
    }
    xml_settings.push("RACE_CHECKPOINT_REQUIRE_HIT " + mode);
    return mode;
}

function zoneTool_connect() {
    $(".toolbar-toolZone").addClass("toolbar-tool-active");
    zoneTool_radius = vectron_grid_spacing;
    zoneTool_updateRubberBar();
    $("#zone-tool-window").show();
    zoneTool_updateWindowActiveType();
    zoneTool_setStatus(zoneTool_stage === "center" ? "Click a zone center." : $("#zone-tool-status").text());
    gui_refreshFloatingWindows();
}

function zoneTool_disconnect() {
    zoneTool_resetPlacement();
    $(".toolbar-toolZone").removeClass("toolbar-tool-active");
    $("#rubber-zone-bar").hide();
    $("#zone-tool-window").hide();
    gui_refreshFloatingWindows();
}

function zoneTool_updateRubberBar() {
    if(zoneTool_type === 3) {
        $("#zone-rubber-setting").show();
    } else {
        $("#zone-rubber-setting").hide();
    }
    if(zoneTool_type === 5) {
        $("#zone-checkpoint-setting").show();
        $("#zone-checkpoint-mode-setting").show();
    } else {
        $("#zone-checkpoint-setting").hide();
        $("#zone-checkpoint-mode-setting").hide();
    }
    if(zoneTool_type === 6) {
        $("#zone-teleport-setting").show();
        $("#zone-quick-placement").hide();
        $("#zone-quick-size-row").hide();
    } else {
        $("#zone-teleport-setting").hide();
        $("#zone-quick-placement").show();
        if($("#zone-quick-placement-toggle").is(":checked")) $("#zone-quick-size-row").show();
    }
    vectron_render();
}

function zoneTool_updateWindowActiveType() {
    $(".zone-type-btn").removeClass("active-zone-type");
    $(".zone-type-btn[data-type='" + zoneTool_type + "']").addClass("active-zone-type");
}

function zoneTool_guide() {
    zoneTool_removeGuide();

    var color = zoneTool_typeArray[zoneTool_type][1];

    if (zoneTool_stage === "size") {
        var dx = cursor_realX - zoneTool_centerRealX;
        var dy = cursor_realY - zoneTool_centerRealY;
        var screenRadius = Math.sqrt(dx * dx + dy * dy);
        zoneTool_guideObj = vectron_screen.circle(
            zoneTool_centerRealX, zoneTool_centerRealY, screenRadius
        ).attr({
            "stroke": color, "stroke-dasharray": "--..",
            "fill": color, "fill-opacity": "0.2"
        });
    } else if(zoneTool_stage === "destination" || zoneTool_stage === "direction") {
        zoneTool_guideObj = vectron_screen.set();
        zoneTool_guideObj.push(vectron_screen.circle(
            zoneTool_centerRealX, zoneTool_centerRealY,
            zoneTool_pendingRadius * vectron_zoom
        ).attr({"stroke":color, "stroke-dasharray":"--..", "fill":color, "fill-opacity":"0.12"}));
        var target = zoneTool_cursorMapPoint();
        var destination = zoneTool_stage === "destination" ? target : zoneTool_pendingTeleport.destinationMap;
        var destinationRealX = aamap_realX(destination.x);
        var destinationRealY = aamap_realY(destination.y);
        zoneTool_guideObj.push(vectron_screen.path([
            "M", zoneTool_centerRealX, zoneTool_centerRealY,
            "L", destinationRealX, destinationRealY
        ]).attr({"stroke":color, "stroke-width":1.5, "stroke-dasharray":"--", "arrow-end":"classic-wide-long"}));
        zoneTool_guideObj.push(vectron_screen.circle(destinationRealX, destinationRealY, 5).attr({
            "stroke":color, "stroke-width":2, "fill":color, "fill-opacity":0.2
        }));
        if(zoneTool_stage === "direction") {
            var dxDirection = target.x - destination.x;
            var dyDirection = target.y - destination.y;
            if(Math.sqrt(dxDirection*dxDirection + dyDirection*dyDirection) > 1e-9) {
                zoneTool_guideObj.push(vectron_screen.path([
                    "M", destinationRealX, destinationRealY,
                    "L", target.realX, target.realY
                ]).attr({"stroke":color, "stroke-width":2, "arrow-end":"classic-wide-long"}));
            }
        }
    } else if (zoneTool_type !== 6 && $("#zone-quick-placement-toggle").is(":checked")) {
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

function zoneTool_hasDuplicate(x, y, radius) {
    for(var i = 0; i < aamap_objects.length; i++) {
        var object = aamap_objects[i];
        if(object instanceof Zone && object.x == x && object.y == y && object.radius == radius) {
            gui_writeLog("Prevented duplicate zone. Check settings to disable this feature.");
            return true;
        }
    }
    return false;
}

function zoneTool_addCompletedZone(zone) {
    if(zoneTool_hasDuplicate(zone.x, zone.y, zone.radius)) return false;
    if(zone.type === 5) {
        zoneTool_setCheckpointMode($("#dCheckpointMode").val());
        zoneTool_ensureSpecialDtd();
    } else if(zone.type === 6) {
        zoneTool_ensureSpecialDtd();
    }
    var addedZones = aamap_addWithSymmetry(zone);
    aamap_recordAction({
        label:"Add zone",
        undo:function() { aamap_removeObjectGroup(addedZones); vectron_render(); },
        redo:function() { aamap_restoreObjectGroup(addedZones); vectron_render(); }
    });
    zoneTool_resetPlacement();
    vectron_render();
    return true;
}


function zoneTool_complete() {
    if(zoneTool_type === 5) {
        var checkpointOrder = Number($("#dCheckpointOrder").val());
        if(!isFinite(checkpointOrder) || checkpointOrder <= 0 ||
            Math.floor(checkpointOrder) !== checkpointOrder) {
            gui_writeLog("Checkpoint order must be a positive whole number.");
            return;
        }
    }

    // Quick placement: place zone at cursor with preset radius in one click
    if (zoneTool_type !== 6 && $("#zone-quick-placement-toggle").is(":checked")) {
        var quickR = parseFloat($("#zone-quick-size").val());
        if (isNaN(quickR) || quickR <= 0) quickR = 32;
        var cx = aamap_mapX(cursor_realX);
        var cy = aamap_mapY(cursor_realY);
        var newZone = new Zone(cx, cy, quickR, 0, zoneTool_type);
        zoneTool_addCompletedZone(newZone);
        return;
    }

    if (zoneTool_stage === "center") {
        zoneTool_centerRealX = cursor_realX;
        zoneTool_centerRealY = cursor_realY;
        zoneTool_centerMapX = aamap_mapX(cursor_realX);
        zoneTool_centerMapY = aamap_mapY(cursor_realY);
        zoneTool_placingSize = true;
        zoneTool_stage = "size";
        vectron_toolActive = true;
        zoneTool_setStatus("Click the zone edge to set its radius.");
        zoneTool_guide();
        return;
    }

    if(zoneTool_stage === "size") {
        var dx = cursor_realX - zoneTool_centerRealX;
        var dy = cursor_realY - zoneTool_centerRealY;
        zoneTool_pendingRadius = Math.sqrt(dx * dx + dy * dy) / vectron_zoom;
        if(zoneTool_pendingRadius <= 0) {
            gui_writeLog("Zone radius must be greater than 0.");
            return;
        }
        if(zoneTool_type !== 6) {
            zoneTool_addCompletedZone(new Zone(
                zoneTool_centerMapX, zoneTool_centerMapY,
                zoneTool_pendingRadius, 0, zoneTool_type
            ));
            return;
        }
        zoneTool_stage = "destination";
        zoneTool_placingSize = false;
        zoneTool_setStatus("Click the teleport destination point.");
        zoneTool_guide();
        return;
    }

    if(zoneTool_stage === "destination") {
        var destination = zoneTool_cursorMapPoint();
        var mode = String($("#dTeleportMode").val() || "abs");
        zoneTool_pendingTeleport = {
            mode:mode,
            destinationMap:{x:destination.x, y:destination.y},
            destX:mode === "abs" ? destination.x : destination.x - zoneTool_centerMapX,
            destY:mode === "abs" ? destination.y : destination.y - zoneTool_centerMapY,
            dirX:0,
            dirY:0,
            reloc:1
        };
        zoneTool_stage = "direction";
        zoneTool_setStatus("Click from the destination toward its exit direction; click the destination again to preserve incoming direction.");
        zoneTool_guide();
        return;
    }

    if(zoneTool_stage === "direction") {
        var directionPoint = zoneTool_cursorMapPoint();
        var directionX = directionPoint.x - zoneTool_pendingTeleport.destinationMap.x;
        var directionY = directionPoint.y - zoneTool_pendingTeleport.destinationMap.y;
        var length = Math.sqrt(directionX * directionX + directionY * directionY);
        if(length > 1e-9) {
            zoneTool_pendingTeleport.dirX = directionX / length;
            zoneTool_pendingTeleport.dirY = directionY / length;
        }
        delete zoneTool_pendingTeleport.destinationMap;
        zoneTool_addCompletedZone(new Zone(
            zoneTool_centerMapX, zoneTool_centerMapY,
            zoneTool_pendingRadius, 0, zoneTool_type, zoneTool_pendingTeleport
        ));
    }
}

function zoneTool_syncSelectedProperties() {
    var zones = (typeof selectTool_selectedObjs === "undefined" ? [] : selectTool_selectedObjs)
        .filter(function(object) { return object instanceof Zone; });
    zoneTool_selectedZone = zones.length === 1 ? zones[0] : null;
    var kind = zoneTool_selectedZone ?
        (zoneTool_typeArray[zoneTool_selectedZone.type] || [])[0] : "";
    if(kind !== "checkpoint" && kind !== "teleport") {
        $("#zone-selected-properties").hide();
        return;
    }
    $("#zone-selected-properties").show();
    $("#zone-selected-title").text(kind === "checkpoint" ? "Selected checkpoint" : "Selected teleport");
    $("#zone-selected-checkpoint-row").toggle(kind === "checkpoint");
    $("#zone-selected-teleport-mode-row,#zone-selected-dest-x-row,#zone-selected-dest-y-row," +
        "#zone-selected-dir-x-row,#zone-selected-dir-y-row,#zone-selected-reloc-row," +
        "#zone-selected-direction-help").toggle(kind === "teleport");
    if(kind === "checkpoint") {
        $("#zone-selected-checkpoint-id").val(zoneTool_selectedZone.zoneData.checkpointId);
    } else {
        $("#zone-selected-teleport-mode").val(zoneTool_selectedZone.zoneData.mode);
        $("#zone-selected-dest-x").val(zoneTool_selectedZone.zoneData.destX);
        $("#zone-selected-dest-y").val(zoneTool_selectedZone.zoneData.destY);
        $("#zone-selected-dir-x").val(zoneTool_selectedZone.zoneData.dirX);
        $("#zone-selected-dir-y").val(zoneTool_selectedZone.zoneData.dirY);
        $("#zone-selected-reloc").val(zoneTool_selectedZone.zoneData.reloc);
    }
    $("#zone-tool-window").show();
    if(typeof gui_refreshFloatingWindows === "function") gui_refreshFloatingWindows();
}

function zoneTool_applySelectedProperties() {
    var zone = zoneTool_selectedZone;
    if(!zone || aamap_objects.indexOf(zone) < 0) return;
    var kind = (zoneTool_typeArray[zone.type] || [])[0];
    var before = zone.copyZoneData();
    var after;
    if(kind === "checkpoint") {
        var checkpointId = Number($("#zone-selected-checkpoint-id").val());
        if(!isFinite(checkpointId) || checkpointId <= 0 || Math.floor(checkpointId) !== checkpointId) {
            gui_toast("Checkpoint ID must be a positive whole number.");
            return;
        }
        after = {checkpointId:checkpointId, legacyTime:before.legacyTime};
        zoneTool_setCheckpointMode($("#dCheckpointMode").val());
    } else if(kind === "teleport") {
        after = {
            mode:String($("#zone-selected-teleport-mode").val() || "abs"),
            destX:Number($("#zone-selected-dest-x").val()),
            destY:Number($("#zone-selected-dest-y").val()),
            dirX:Number($("#zone-selected-dir-x").val()),
            dirY:Number($("#zone-selected-dir-y").val()),
            reloc:Number($("#zone-selected-reloc").val())
        };
        if(Object.keys(after).some(function(key) { return key !== "mode" && !isFinite(after[key]); })) {
            gui_toast("Teleport coordinates, direction, and compensation must be numbers.");
            return;
        }
    } else return;
    function apply(data) {
        zone.zoneData = zone_copyData(data);
        zone.option = kind === "checkpoint" ? zone.zoneData.checkpointId : zone.zoneData;
    }
    apply(after);
    zoneTool_ensureSpecialDtd();
    aamap_recordAction({
        label:"Edit " + kind + " zone",
        undo:function() { apply(before); vectron_render(); zoneTool_syncSelectedProperties(); },
        redo:function() { apply(after); vectron_render(); zoneTool_syncSelectedProperties(); }
    });
    vectron_render();
    zoneTool_syncSelectedProperties();
}
