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
    3: ["health", "#35d66f"],
    4: ["rubber", "#ffc12b"],
    5: ["checkpoint", "#ffffff"],
    6: ["speed", "#3498db"],
    7: ["teleport", "#e67e22"],
    8: ["setting", "#ff7a24"]
}

var zoneTool_whatType = {
    "death":0,
    "win":1,
    "health":3,
    "rubber":4,
    "checkpoint":5,
    "speed":6,
    "teleport":7,
    "setting":8
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
var ZONE_TOOL_DEFAULT_LINE_WIDTH = 2;
var ZONE_TOOL_DEFAULT_MOVEMENT_SPEED = 20;
var ZONE_TOOL_DEFAULT_ROTATION_SPEED = 0;
var ZONE_TOOL_MIN_MOVEMENT_PATH_POINTS = 2;
var ZONE_TOOL_CHECKPOINT_ORDER = 0;
var ZONE_TOOL_TYPES = [0, 1, 3, 5, 6, 7, 8];
var ZONE_TOOL_SETTING_INPUTS = {
    CYCLE_ACCEL:{value:20, min:0, step:0.1},
    CYCLE_BRAKE:{value:20, min:0, step:0.1},
    CYCLE_SPEED_MAX:{value:100, min:0, step:0.1},
    CYCLE_DELAY:{value:0, min:0, step:0.01},
    TURN_SPEED_LOSS:{value:5, min:0, max:100, step:0.1},
    JUMP_ENABLED:{value:1, min:0, max:1, step:1},
    JUMP_HEIGHT:{value:3.5, min:0.01, step:0.1},
    AIRBORNE_SPEED_LOSS:{value:2, min:0, step:0.1},
    WALL_TIME_DAMAGE:{value:25, step:0.1},
    WALL_SPEED_DAMAGE:{value:1, step:0.1},
    OFF_WALL_REGEN:{value:15, step:0.1}
};

function zoneTool_settingValidationError(setting, value) {
    var settingName = String(setting || "").toUpperCase();
    var settingValue = Number(value);
    if(!Object.prototype.hasOwnProperty.call(ZONE_TOOL_SETTING_INPUTS, settingName) ||
        !isFinite(settingValue)) {
        return "Setting zones need a supported game setting and numeric value.";
    }
    if(settingName === "TURN_SPEED_LOSS" &&
        (settingValue < 0 || settingValue > 100)) {
        return "Turn-speed-loss setting zones must use 0 through 100 percent.";
    }
    if(settingName === "JUMP_ENABLED" && settingValue !== 0 && settingValue !== 1) {
        return "Jump-enabled setting zones must use 0 or 1.";
    }
    return null;
}

function zoneTool_updateGameSettingValue(resetValue) {
    var setting = $("#dGameSetting").val() || "CYCLE_ACCEL";
    var config = ZONE_TOOL_SETTING_INPUTS[setting] || ZONE_TOOL_SETTING_INPUTS.CYCLE_ACCEL;
    var input = $("#dGameSettingValue");
    input.attr("min", config.min === undefined ? null : config.min)
        .attr("max", config.max === undefined ? null : config.max)
        .attr("step", config.step);
    if(resetValue) input.val(config.value);
}

/**
 * The setting rows use display:contents and therefore have no reliable box
 * for Bootstrap to anchor to. Move their standard tooltip attributes to the
 * visible setting labels instead. This deliberately uses the same
 * rel=tooltip/data-original-title convention as the rest of Vectron.
 */
function zoneTool_initSettingTooltips() {
    var $rows = $("#zone-tool-settings .vt-setting-row[data-original-title]");
    $rows.each(function() {
        var $row = $(this);
        var $label = $row.children(".vt-tool-name").first();
        if(!$label.length) return;

        var title = $label.text().trim() || "Zone setting";
        var description = $row.attr("data-original-title") || "";
        $label.attr({
            "aria-label":title + ". " + description,
            rel:"tooltip",
            tabindex:"0",
            "data-trigger":"hover focus",
            "data-placement":"auto left",
            "data-original-title":description
        });
        $row.removeAttr("rel").removeAttr("data-trigger")
            .removeAttr("data-placement").removeAttr("data-original-title");
    });
}

function zoneTool_validCheckpointOrder(value) {
    return isFinite(value) && value >= ZONE_TOOL_CHECKPOINT_ORDER && Math.floor(value) === value;
}

function zoneTool_validCheckpointNumber(value) {
    return isFinite(value) && value >= 1 && Math.floor(value) === value;
}

function zoneTool_parseLineWidth(value) {
    if(String(value).trim() === "") return null;
    var width = Number(value);
    if(!isFinite(width) || width < 0) return null;
    // Canonicalize negative zero as well as ordinary zero. Keeping this as a
    // numeric zero prevents truthiness/default-value code from silently
    // replacing the user's explicit wall-only ShapeLine with the default 2m
    // box during placement, import, or export.
    return width === 0 ? 0 : width;
}

function zoneTool_getLineWidth(requireValid) {
    var input = $("#dZoneLineWidth");
    if(!input.length) return ZONE_TOOL_DEFAULT_LINE_WIDTH;
    var width = zoneTool_parseLineWidth(input.val());
    if(width !== null) return width;
    if(requireValid) {
        gui_writeLog("Line zone width must be 0 or greater.");
        return null;
    }
    return ZONE_TOOL_DEFAULT_LINE_WIDTH;
}

/**
 * Match the freeform wall tool's diagonal feedback for the segment currently
 * under the cursor.  Committed zone edges keep their zone color; only the
 * active edge turns into the bright cyan wall-tool highlight.
 */
function zoneTool_getActiveSegmentStyle(a, b, color) {
    if(typeof wallTool_isGridDiagonalSegment === "function" &&
        wallTool_isGridDiagonalSegment(a, b)) {
        return typeof wallTool_getActiveSegmentStyle === "function" ?
            wallTool_getActiveSegmentStyle(a, b) :
            {stroke:"#00cfff", "stroke-width":3, "stroke-dasharray":"--"};
    }
    return {stroke:color, "stroke-width":1, "stroke-dasharray":"--.."};
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

function zoneTool_isMovementEnabled() {
    return $("#dZoneMoving").is(":checked");
}

function zoneTool_allowsLevelChange(level) {
    if(!zoneTool_pendingZone || !isFinite(Number(level))) return false;
    if(zoneTool_stage === "teleport-position") return true;
    return zoneTool_stage === "teleport-direction" && zoneTool_isMovementEnabled() &&
        Number(level) === Number(zoneTool_pendingZone.level);
}

function zoneTool_onActiveLevelChanged() {
    if(zoneTool_stage !== "teleport-position" || !zoneTool_pendingZone) return;
    zoneTool_updateStatus();
    zoneTool_renderCurrent();
}

function zoneTool_resetPlacement() {
    zoneTool_removeGuide();
    if(zoneTool_pendingZone && aamap_objects.indexOf(zoneTool_pendingZone) < 0) {
        _aamap_removeObj(zoneTool_pendingZone);
    }
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
    var shape = $("#dZoneShape").val();
    if(zoneTool_stage === "movement-path") {
        var modeLabels = {circular:"connect back to the first point",
            ping_pong:"reverse at the final point", instant:"restart at the first point"};
        zoneTool_setStatus("Place path vertices; finish to " +
            (modeLabels[$("#dZoneMovementMode").val()] || modeLabels.circular) + ".");
    } else if(zoneTool_stage === "teleport-position") {
        zoneTool_setStatus("Click the teleport destination on Level " + aamap_activeLevel + ".");
    } else if(zoneTool_stage === "teleport-direction") {
        zoneTool_setStatus("Click to set the destination direction.");
    } else if(shape === "polygon") {
        zoneTool_setStatus(zoneTool_points.length ?
            "Keep placing vertices; double-click or use Finish Polygon." :
            "Click to place polygon vertices.");
    } else if(shape === "rectangle") {
        zoneTool_setStatus(zoneTool_points.length ?
            "Click the opposite corner." : "Click the first corner.");
    } else if(shape === "line") {
        zoneTool_setStatus(zoneTool_points.length ?
            "Click the second line endpoint." : "Click the first line endpoint.");
    } else {
        zoneTool_setStatus(zoneTool_placingSize ?
            "Click the circle edge." : "Click the circle center.");
    }
    var canFinishPolygon = shape === "polygon" && zoneTool_stage === "shape" &&
        zoneTool_points.length >= ZONE_TOOL_MIN_POLYGON_POINTS;
    var canFinishMovement = zoneTool_stage === "movement-path" &&
        zoneTool_points.length >= ZONE_TOOL_MIN_MOVEMENT_PATH_POINTS;
    $("#zone-tool-finish").toggle(canFinishPolygon || canFinishMovement)
        .text(canFinishMovement ? "Finish Path" : "Finish Polygon");
    $("#zone-tool-cancel").toggle(vectron_toolActive);
}

function zoneTool_connect() {
    $(".toolbar-toolZone").addClass("toolbar-tool-active");
    zoneTool_radius = vectron_grid_spacing;
    zoneTool_updateSettings();
    $("#zone-tool-window").show();
    zoneTool_updateWindowActiveType();
    zoneTool_updateStatus();
    gui_refreshFloatingWindows();
}

function zoneTool_disconnect() {
    zoneTool_resetPlacement();
    $(".toolbar-toolZone").removeClass("toolbar-tool-active");
    $("#zone-tool-window").hide();
    gui_refreshFloatingWindows();
}

function zoneTool_updateSettings() {
    var shape = $("#dZoneShape").val();
    if(shape === "circle") $("#dZoneRotationSpeed").val("0");
    var isCheckpoint = zoneTool_type === 5;
    var orderedCheckpoint = isCheckpoint && $("#dCheckpointOrdered").is(":checked");
    $("#zone-checkpoint-ordered-setting").toggle(isCheckpoint);
    $("#zone-checkpoint-setting,#zone-checkpoint-auto-increment-setting")
        .toggle(orderedCheckpoint);
    $("#zone-speed-setting,#zone-speed-duration-setting").toggle(zoneTool_type === 6);
    $("#zone-health-setting").toggle(zoneTool_type === 3);
    $("#zone-game-setting,#zone-game-setting-value").toggle(zoneTool_type === 8);
    $("#zone-polygon-setting").toggle(shape === "polygon");
    $("#zone-line-setting").toggle(shape === "line");
    $("#zone-movement-speed-setting,#zone-movement-mode-setting," +
        "#zone-spawn-vertices-setting")
        .toggle(zoneTool_isMovementEnabled());
    $("#zone-rotation-speed-setting")
        .toggle(zoneTool_isMovementEnabled() && shape !== "circle");
    zoneTool_updateStatus();
    vectron_render();
}

function zoneTool_updateWindowActiveType() {
    $(".zone-type-btn").removeClass("active-zone-type");
    $(".zone-type-btn[data-type='" + zoneTool_type + "']").addClass("active-zone-type");
}

function zoneTool_renderPendingZone() {
    if(!zoneTool_pendingZone || aamap_objects.indexOf(zoneTool_pendingZone) >= 0) return;
    var isTeleportPlacement = zoneTool_stage === "teleport-position" ||
        zoneTool_stage === "teleport-direction";
    if(zoneTool_stage !== "movement-path" && !isTeleportPlacement) return;
    zoneTool_pendingZone.render();
    if(isTeleportPlacement) {
        // The source zone remains visible while its destination is authored.
        // The destination itself is the spawn-style guide drawn below.
        if(zoneTool_pendingZone.destinationObj) {
            zoneTool_pendingZone.destinationObj.remove();
            zoneTool_pendingZone.destinationObj = null;
        }
        return;
    }
    if(zoneTool_pendingZone.obj && typeof zoneTool_pendingZone.obj.attr === "function") {
        var ghostStyle = {
            "stroke-dasharray":"--", "stroke-opacity":0.95, "opacity":0.78
        };
        if(zoneTool_pendingZone.shapeType !== "line" ||
            Number(zoneTool_pendingZone.lineWidth) > 0) {
            ghostStyle["fill-opacity"] = 0.16;
        }
        zoneTool_pendingZone.obj.attr(ghostStyle);
        if(typeof zoneTool_pendingZone.obj.toFront === "function") zoneTool_pendingZone.obj.toFront();
    }
    if(zoneTool_pendingZone.destinationObj &&
        typeof zoneTool_pendingZone.destinationObj.attr === "function") {
        zoneTool_pendingZone.destinationObj.attr({"stroke-opacity":0.62});
    }
}

function zoneTool_renderCurrent() {
    zoneTool_renderPendingZone();
    zoneTool_guide();
}

function zoneTool_guide() {
    zoneTool_removeGuide();

    var color = zoneTool_typeArray[zoneTool_type][1];
    if(zoneTool_stage === "movement-path" && zoneTool_points.length) {
        zoneTool_guideObj = vectron_screen.set();
        var movementMode = $("#dZoneMovementMode").val() || "circular";
        var guidePoints = zoneTool_points.map(function(point) {
            return {x:aamap_realX(point.x), y:aamap_realY(point.y)};
        });
        guidePoints.push({x:cursor_realX, y:cursor_realY});
        var addGuideSegment = function(start, end) {
            var guideStyle = {"stroke":color, "stroke-width":2,
                "stroke-dasharray":"--..", "fill":"none",
                "arrow-end":"classic-wide-long"};
            if(movementMode === "ping_pong") {
                guideStyle["arrow-start"] = "classic-wide-long";
            }
            zoneTool_guideObj.push(vectron_screen.path([
                "M", start.x, start.y, "L", end.x, end.y
            ]).attr(guideStyle));
        };
        for(var movementIndex = 1; movementIndex < guidePoints.length; movementIndex++) {
            addGuideSegment(guidePoints[movementIndex - 1], guidePoints[movementIndex]);
        }
        if(movementMode === "circular" &&
            zoneTool_points.length >= ZONE_TOOL_MIN_MOVEMENT_PATH_POINTS) {
            addGuideSegment(guidePoints[guidePoints.length - 1], guidePoints[0]);
        }
        return;
    }
    if(zoneTool_stage === "teleport-position") {
        return;
    }
    if(zoneTool_stage === "teleport-direction") {
        var start = zoneTool_points[0];
        var direction = spawnMarker_directionFromCursor(
            start.x, start.y, ZONE_DEFAULT_XDIR, ZONE_DEFAULT_YDIR);
        zoneTool_guideObj = spawnMarker_create(
            aamap_realX(start.x), aamap_realY(start.y), direction.x, direction.y,
            color, color);
        return;
    }

    var shape = $("#dZoneShape").val();
    if(shape === "polygon" && zoneTool_points.length) {
        var polygonPath = ["M", aamap_realX(zoneTool_points[0].x), aamap_realY(zoneTool_points[0].y)];
        for(var p = 1; p < zoneTool_points.length; p++) {
            polygonPath.push("L", aamap_realX(zoneTool_points[p].x), aamap_realY(zoneTool_points[p].y));
        }
        var cursorPoint = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
        var activePolygonPath = [
            "M", aamap_realX(zoneTool_points[zoneTool_points.length - 1].x),
            aamap_realY(zoneTool_points[zoneTool_points.length - 1].y),
            "L", cursor_realX, cursor_realY
        ];
        var closingPolygonPath = null;
        if(zoneTool_points.length >= ZONE_TOOL_MIN_POLYGON_POINTS) {
            closingPolygonPath = [
                "M", cursor_realX, cursor_realY,
                "L", aamap_realX(zoneTool_points[0].x), aamap_realY(zoneTool_points[0].y)
            ];
        }
        var committedPolygonGuide = vectron_screen.path(polygonPath).attr({
            "stroke":color, "stroke-dasharray":"--..", "fill":"none"
        });
        var activePolygonGuide = vectron_screen.path(activePolygonPath).attr(
            zoneTool_getActiveSegmentStyle(
                zoneTool_points[zoneTool_points.length - 1], cursorPoint, color));
        zoneTool_guideObj = vectron_screen.set().push(committedPolygonGuide, activePolygonGuide);
        if(closingPolygonPath) {
            zoneTool_guideObj.push(vectron_screen.path(closingPolygonPath).attr({
                "stroke":color, "stroke-dasharray":"--..", "fill":"none"
            }));
        }
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
    if(shape === "line" && zoneTool_points.length) {
        var lineStart = zoneTool_points[0];
        var lineEnd = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
        var lineWidth = zoneTool_getLineWidth(false);
        var linePath = [
            "M", aamap_realX(lineStart.x), aamap_realY(lineStart.y),
            "L", cursor_realX, cursor_realY
        ];
        var footprintPoints = zone_lineFootprintPoints(lineStart, lineEnd, lineWidth);
        var footprintPath = [];
        for(var footprintIndex = 0; footprintIndex < footprintPoints.length;
            footprintIndex++) {
            footprintPath.push(footprintIndex ? "L" : "M",
                aamap_realX(footprintPoints[footprintIndex].x),
                aamap_realY(footprintPoints[footprintIndex].y));
        }
        if(lineWidth > 0) footprintPath.push("Z");
        var lineGuide = vectron_screen.path(footprintPath).attr({
            "stroke":color,
            "stroke-width":1,
            "stroke-linecap":"butt",
            "stroke-linejoin":"miter",
            "stroke-opacity":0.5,
            "fill":lineWidth > 0 ? color : "none",
            "fill-opacity":lineWidth > 0 ? 0.2 : 0
        });
        var lineCenterGuide = vectron_screen.path(linePath).attr(
            zoneTool_getActiveSegmentStyle(lineStart, lineEnd, color)).attr({
            "stroke-opacity":0.9
        });
        zoneTool_guideObj = vectron_screen.set().push(lineGuide, lineCenterGuide);
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
    } else {
        zoneTool_guideObj = vectron_screen.circle(
            cursor_realX, cursor_realY, ZONE_TOOL_CENTER_MARKER_RADIUS
        ).attr({"stroke": color, "fill": color, "fill-opacity": "0.5"});
    }
}

function zoneTool_addZone(newZone) {
    var addedZones = aamap_addWithSymmetry(newZone);
    aamap_recordAction({
        label: "Add zone",
        undo: function() { aamap_removeObjectGroup(addedZones); vectron_render(); },
        redo: function() { aamap_restoreObjectGroup(addedZones); vectron_render(); }
    });
    if(newZone.zoneName === "checkpoint" && Number(newZone.option) > 0 &&
        $("#dCheckpointAutoIncrement").is(":checked")) {
        $("#dCheckpointOrder").val(Number(newZone.option) + 1);
    }
    zoneTool_resetPlacement();
    zoneTool_updateStatus();
    vectron_render();
}

function zoneTool_beginMovementPath(newZone) {
    zoneTool_pendingZone = newZone;
    newZone.movementSpeed = zoneTool_numberValue("#dZoneMovementSpeed",
        ZONE_TOOL_DEFAULT_MOVEMENT_SPEED);
    newZone.rotationSpeed = zoneTool_rotationSpeedForShape(newZone.shapeType);
    newZone.movementMode = $("#dZoneMovementMode").val() || "circular";
    newZone.spawnAtVertices = $("#dZoneSpawnAtVertices").is(":checked");
    zoneTool_points = [{x:newZone.x, y:newZone.y}];
    zoneTool_stage = "movement-path";
    zoneTool_placingSize = true;
    vectron_toolActive = true;
    zoneTool_updateStatus();
    zoneTool_renderCurrent();
}

function zoneTool_finishConfiguredZone(newZone) {
    if(zoneTool_isMovementEnabled()) {
        zoneTool_beginMovementPath(newZone);
        return;
    }
    zoneTool_addZone(newZone);
}

function zoneTool_finishGeometry(newZone) {
    if(zoneTool_type === 7) {
        zoneTool_pendingZone = newZone;
        zoneTool_points = [];
        zoneTool_stage = "teleport-position";
        zoneTool_placingSize = true;
        vectron_toolActive = true;
        zoneTool_updateStatus();
        zoneTool_renderCurrent();
        return;
    }
    zoneTool_finishConfiguredZone(newZone);
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
    var details = zoneTool_buildDetails();
    if(!details) return false;
    details.polygonScale = 1;
    // ShapePolygon stores an absolute origin followed by vertices local to that origin.
    details.polygonPoints = points.map(function(point) {
        return {x:point.x - x, y:point.y - y};
    });
    zoneTool_finishGeometry(new Zone(x, y, 0, ZONE_DEFAULT_GROWTH, zoneTool_type,
        zoneTool_getOption(), details));
}

function zoneTool_finishMovementPath() {
    if(zoneTool_stage !== "movement-path" || !zoneTool_pendingZone ||
        zoneTool_points.length < ZONE_TOOL_MIN_MOVEMENT_PATH_POINTS) {
        gui_writeLog("Moving zones require at least one waypoint after the starting position.");
        return false;
    }
    var uniquePoints = zoneTool_points.filter(function(point, index, points) {
        return index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y;
    });
    if(uniquePoints.length < ZONE_TOOL_MIN_MOVEMENT_PATH_POINTS) {
        gui_writeLog("Moving-zone path points must not all be the same.");
        return false;
    }
    // These controls remain editable while the path is drawn, so commit their
    // final values instead of the snapshot taken when path placement began.
    zoneTool_pendingZone.movementSpeed = zoneTool_numberValue("#dZoneMovementSpeed",
        ZONE_TOOL_DEFAULT_MOVEMENT_SPEED);
    zoneTool_pendingZone.rotationSpeed =
        zoneTool_rotationSpeedForShape(zoneTool_pendingZone.shapeType);
    zoneTool_pendingZone.movementMode = $("#dZoneMovementMode").val() || "circular";
    zoneTool_pendingZone.spawnAtVertices = $("#dZoneSpawnAtVertices").is(":checked");
    zoneTool_pendingZone.movementPath = uniquePoints.map(function(point) {
        return {x:zone_round(point.x), y:zone_round(point.y)};
    });
    zoneTool_addZone(zoneTool_pendingZone);
    return true;
}

function zoneTool_finishCurrent() {
    if(zoneTool_stage === "movement-path") return zoneTool_finishMovementPath();
    if(zoneTool_stage === "shape" && $("#dZoneShape").val() === "polygon") {
        zoneTool_finishPolygon();
        return true;
    }
    return false;
}

function zoneTool_complete() {
    if(zoneTool_type === 5 && $("#dCheckpointOrdered").is(":checked")) {
        var checkpointNumber = Number($("#dCheckpointOrder").val());
        if(!zoneTool_validCheckpointNumber(checkpointNumber)) {
            gui_writeLog("Checkpoint number must be a whole number starting at 1.");
            return;
        }
    }

    if(zoneTool_stage === "movement-path") {
        var movementPoint = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
        var previousMovementPoint = zoneTool_points[zoneTool_points.length - 1];
        if(!previousMovementPoint || previousMovementPoint.x !== movementPoint.x ||
            previousMovementPoint.y !== movementPoint.y) {
            zoneTool_points.push(movementPoint);
        }
        vectron_toolActive = true;
        zoneTool_updateStatus();
        zoneTool_guide();
        return;
    }

    if(zoneTool_stage === "teleport-position") {
        var destination = spawnMarker_cursorPosition();
        zoneTool_pendingZone.options.destination_x = destination.x;
        zoneTool_pendingZone.options.destination_y = destination.y;
        zoneTool_pendingZone.options.destination_level = aamap_activeLevel;
        zoneTool_points = [{x:destination.x, y:destination.y}];
        zoneTool_stage = "teleport-direction";
        zoneTool_updateStatus();
        zoneTool_renderCurrent();
        return;
    }
    if(zoneTool_stage === "teleport-direction") {
        var destination = zoneTool_points[0];
        var direction = spawnMarker_directionFromCursor(
            destination.x, destination.y, ZONE_DEFAULT_XDIR, ZONE_DEFAULT_YDIR);
        zoneTool_pendingZone.setTeleportDirection(direction.x, direction.y);
        // A moving teleport's path belongs to its source floor. Destination
        // placement may have changed floors, so return to the visible source
        // before beginning the normal movement-path interaction.
        if(zoneTool_isMovementEnabled() && aamap_activeLevel !== zoneTool_pendingZone.level) {
            aamap_setActiveLevel(zoneTool_pendingZone.level);
        }
        zoneTool_finishConfiguredZone(zoneTool_pendingZone);
        return;
    }

    var shape = $("#dZoneShape").val();
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
        var rectangleDetails = zoneTool_buildDetails();
        if(!rectangleDetails) return;
        rectangleDetails.minx = Math.min(first.x, clickPoint.x);
        rectangleDetails.miny = Math.min(first.y, clickPoint.y);
        rectangleDetails.maxx = Math.max(first.x, clickPoint.x);
        rectangleDetails.maxy = Math.max(first.y, clickPoint.y);
        zoneTool_finishGeometry(new Zone(0, 0, 0, ZONE_DEFAULT_GROWTH, zoneTool_type,
            zoneTool_getOption(), rectangleDetails));
        return;
    }
    if(shape === "line") {
        if(!zoneTool_points.length) {
            zoneTool_points.push(clickPoint);
            zoneTool_placingSize = true;
            vectron_toolActive = true;
            zoneTool_updateStatus();
            zoneTool_guide();
            return;
        }
        var lineStart = zoneTool_points[0];
        if(lineStart.x === clickPoint.x && lineStart.y === clickPoint.y) {
            gui_writeLog("Line zone endpoints must be different.");
            return;
        }
        var lineWidth = zoneTool_getLineWidth(true);
        if(lineWidth === null) return;
        var lineDetails = zoneTool_buildDetails();
        if(!lineDetails) return;
        lineDetails.lineStart = {x:lineStart.x, y:lineStart.y};
        lineDetails.lineEnd = {x:clickPoint.x, y:clickPoint.y};
        lineDetails.lineWidth = lineWidth;
        zoneTool_finishGeometry(new Zone(
            (lineStart.x + clickPoint.x) / 2,
            (lineStart.y + clickPoint.y) / 2,
            0,
            ZONE_DEFAULT_GROWTH,
            zoneTool_type,
            zoneTool_getOption(),
            lineDetails
        ));
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

    var details = zoneTool_buildDetails();
    if(!details) return;
    var newZone = new Zone(newX, newY, radius, ZONE_DEFAULT_GROWTH, zoneTool_type,
        zoneTool_getOption(), details);
    zoneTool_finishGeometry(newZone);
}

function zoneTool_numberValue(selector, fallback) {
    var value = Number($(selector).val());
    return isFinite(value) ? value : fallback;
}

function zoneTool_rotationSpeedForShape(shape) {
    if(String(shape || $("#dZoneShape").val()).toLowerCase() === "circle") return 0;
    return zoneTool_numberValue("#dZoneRotationSpeed", ZONE_TOOL_DEFAULT_ROTATION_SPEED);
}

function zoneTool_getOption() {
    if(zoneTool_type === 5) {
        if(!$("#dCheckpointOrdered").is(":checked")) return 0;
        return zoneTool_numberValue("#dCheckpointOrder", ZONE_TOOL_CHECKPOINT_ORDER + 1);
    }
    return 0;
}

function zoneTool_buildDetails() {
    var details = {
        zoneName: zoneTool_typeArray[zoneTool_type][0],
        shapeType: $("#dZoneShape").val(),
        options: {},
        movementSpeed:zoneTool_numberValue("#dZoneMovementSpeed", ZONE_TOOL_DEFAULT_MOVEMENT_SPEED),
        rotationSpeed:zoneTool_rotationSpeedForShape($("#dZoneShape").val()),
        movementMode:$("#dZoneMovementMode").val() || "circular",
        spawnAtVertices:$("#dZoneSpawnAtVertices").is(":checked"),
        movementPath:[]
    };

    details.trigger = $("#dZoneTrigger").val();

    if(details.shapeType === "polygon") {
        details.polygonScale = 1;
        details.polygonPoints = [];
    } else if(details.shapeType === "line") {
        details.lineWidth = zoneTool_getLineWidth(false);
    }

    if(zoneTool_type === 6) {
        details.options.delta_mps = zoneTool_numberValue("#dSpeedDelta", 5);
        details.options.duration_ticks = zoneTool_numberValue("#dSpeedDuration", 90);
    } else if(zoneTool_type === 3) {
        details.options.delta = zoneTool_numberValue("#dHealthDelta", 25);
    } else if(zoneTool_type === 8) {
        details.options.setting = $("#dGameSetting").val() || "CYCLE_ACCEL";
        details.options.value = zoneTool_numberValue("#dGameSettingValue", 20);
        var settingError = zoneTool_settingValidationError(
            details.options.setting, details.options.value);
        if(settingError) {
            gui_writeLog(settingError);
            return null;
        }
    }
    return details;
}
