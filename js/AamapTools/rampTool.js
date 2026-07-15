/* Four-click, cross-level ramp placement. */

var rampTool_fromEdge = [];
var rampTool_toEdge = [];
var rampTool_fromLevel = null;
var rampTool_toLevel = null;
var rampTool_guideObj = null;
var RAMP_TOOL_POINT_EPSILON = 1e-9;

function rampTool_setStatus(message) {
    var status = $("#ramp-tool-status");
    if(status.length) status.text(message);
}

function rampTool_removeGuide() {
    if(rampTool_guideObj) rampTool_guideObj.remove();
    rampTool_guideObj = null;
}

function rampTool_resetPlacement() {
    rampTool_removeGuide();
    rampTool_fromEdge = [];
    rampTool_toEdge = [];
    rampTool_fromLevel = null;
    rampTool_toLevel = null;
    vectron_toolActive = false;
}

function rampTool_capturePlacement() {
    function copyEdge(edge) {
        return edge.map(function(point) { return {x:Number(point.x), y:Number(point.y)}; });
    }
    return {
        fromEdge:copyEdge(rampTool_fromEdge),
        toEdge:copyEdge(rampTool_toEdge),
        fromLevel:rampTool_fromLevel,
        toLevel:rampTool_toLevel,
        toolActive:!!vectron_toolActive
    };
}

function rampTool_restorePlacement(state) {
    rampTool_removeGuide();
    if(!state) {
        rampTool_resetPlacement();
    } else {
        rampTool_fromEdge = state.fromEdge.map(function(point) {
            return {x:Number(point.x), y:Number(point.y)};
        });
        rampTool_toEdge = state.toEdge.map(function(point) {
            return {x:Number(point.x), y:Number(point.y)};
        });
        rampTool_fromLevel = state.fromLevel;
        rampTool_toLevel = state.toLevel;
        vectron_toolActive = !!state.toolActive;
    }
    rampTool_updateStatus();
    vectron_render();
}

function rampTool_updateStatus() {
    var message;
    if(!rampTool_fromEdge.length) message = "Click the first point of the first edge on Level " + aamap_activeLevel + ".";
    else if(rampTool_fromEdge.length === 1) message = "Click the second point of this edge.";
    else if(rampTool_toLevel === null) message = "Use the Levels menu below and select a different level.";
    else if(!rampTool_toEdge.length) message = "Click the first point of the edge on Level " + rampTool_toLevel + ".";
    else message = "Click the second point to finish the ramp.";
    rampTool_setStatus(message);
    $("#ramp-tool-cancel").toggle(rampTool_fromEdge.length > 0);
}

function rampTool_connect() {
    $(".toolbar-toolRamp").addClass("toolbar-tool-active");
    $("#ramp-tool-window").show();
    rampTool_resetPlacement();
    rampTool_updateStatus();
    if(typeof gui_refreshFloatingWindows === "function") gui_refreshFloatingWindows();
}

function rampTool_disconnect() {
    rampTool_resetPlacement();
    $(".toolbar-toolRamp").removeClass("toolbar-tool-active");
    $("#ramp-tool-window").hide();
    if(typeof gui_refreshFloatingWindows === "function") gui_refreshFloatingWindows();
}

function rampTool_cancelPlacement() {
    rampTool_resetPlacement();
    rampTool_updateStatus();
    vectron_render();
}

function rampTool_cancel() { rampTool_cancelPlacement(); }

function rampTool_allowsLevelChange(level) {
    return rampTool_fromEdge.length === 2 && rampTool_toEdge.length === 0 &&
        Number(level) !== rampTool_fromLevel;
}

function rampTool_allowsLevelAddition() {
    return rampTool_fromEdge.length === 2 && rampTool_toEdge.length === 0;
}

function rampTool_onActiveLevelChanged(level) {
    if(rampTool_allowsLevelChange(level)) rampTool_toLevel = Number(level);
    rampTool_updateStatus();
}

function rampTool_distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function rampTool_mapCursor() {
    return {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
}

function rampTool_screenPath(points, close) {
    if(!points.length) return [];
    var path = ["M", aamap_realX(points[0].x), aamap_realY(points[0].y)];
    for(var i = 1; i < points.length; i++) {
        path.push("L", aamap_realX(points[i].x), aamap_realY(points[i].y));
    }
    if(close) path.push("Z");
    return path;
}

function rampTool_guide() {
    rampTool_removeGuide();
    if(typeof cursor_realX === "undefined" || !isFinite(cursor_realX) || !isFinite(cursor_realY)) return;
    var color = config_isDark ? RAMP_COLOR_DARK : RAMP_COLOR_LIGHT;
    var cursor = rampTool_mapCursor();
    var guide = vectron_screen.set();
    var fromPreview = rampTool_fromEdge.slice();
    var toPreview = rampTool_toEdge.slice();
    if(fromPreview.length === 1) fromPreview.push(cursor);
    if(rampTool_toLevel !== null && toPreview.length === 1) toPreview.push(cursor);

    if(!rampTool_fromEdge.length ||
        (rampTool_fromEdge.length === 2 && rampTool_toLevel !== null && !rampTool_toEdge.length)) {
        guide.push(vectron_screen.circle(cursor_realX, cursor_realY, 5).attr({
            stroke:color, "stroke-width":2, fill:color, "fill-opacity":0.18
        }));
    }
    if(fromPreview.length === 2) guide.push(vectron_screen.path(rampTool_screenPath(fromPreview)).attr({
        stroke:color, "stroke-width":3, "stroke-dasharray":"- "
    }));
    if(toPreview.length === 2) guide.push(vectron_screen.path(rampTool_screenPath(toPreview)).attr({
        stroke:color, "stroke-width":3, "stroke-dasharray":"- "
    }));
    if(fromPreview.length === 2 && toPreview.length === 2) {
        var aligned = ramp_alignSecondEdge(fromPreview[0], fromPreview[1], toPreview[0], toPreview[1]);
        guide.push(vectron_screen.path(rampTool_screenPath([
            fromPreview[0], aligned[0], aligned[1], fromPreview[1]
        ], true)).attr({stroke:color, "stroke-width":1.5, fill:color, "fill-opacity":0.18}));
    }
    rampTool_guideObj = guide;
}

function rampTool_addRamp(ramp) {
    var beforePlacement = rampTool_capturePlacement();
    var addedRamps = aamap_addWithSymmetry(ramp);
    rampTool_resetPlacement();
    rampTool_updateStatus();
    var afterPlacement = rampTool_capturePlacement();
    aamap_recordAction({
        label:"Add ramp",
        undo:function() {
            aamap_removeObjectGroup(addedRamps);
            if(vectron_currentTool === "ramp") rampTool_restorePlacement(beforePlacement);
            else vectron_render();
        },
        redo:function() {
            aamap_restoreObjectGroup(addedRamps);
            if(vectron_currentTool === "ramp") rampTool_restorePlacement(afterPlacement);
            else vectron_render();
        }
    });
    vectron_render();
    if(typeof xmlEditor_onSelectionChange === "function") xmlEditor_onSelectionChange();
}

function rampTool_click() {
    var point = rampTool_mapCursor();
    if(!rampTool_fromEdge.length) {
        rampTool_fromLevel = aamap_activeLevel;
        rampTool_fromEdge.push(point);
        vectron_toolActive = true;
    } else if(rampTool_fromEdge.length === 1) {
        if(rampTool_distance(rampTool_fromEdge[0], point) <= RAMP_TOOL_POINT_EPSILON) {
            gui_toast("The two edge points must be different.");
            return;
        }
        rampTool_fromEdge.push(point);
    } else if(rampTool_toLevel === null) {
        gui_toast("Select a different level using the Levels menu below.");
        return;
    } else if(!rampTool_toEdge.length) {
        rampTool_toEdge.push(point);
    } else {
        if(rampTool_distance(rampTool_toEdge[0], point) <= RAMP_TOOL_POINT_EPSILON) {
            gui_toast("The two edge points must be different.");
            return;
        }
        var aligned = ramp_alignSecondEdge(
            rampTool_fromEdge[0], rampTool_fromEdge[1], rampTool_toEdge[0], point);
        var rampPoints = [rampTool_fromEdge[0], rampTool_fromEdge[1], aligned[0], aligned[1]];
        if(!ramp_geometryValid(rampPoints)) {
            gui_toast("The two ramp edges must form a non-degenerate ramp surface.");
            return;
        }
        rampTool_addRamp(new Ramp(
            rampPoints[0], rampPoints[1], rampPoints[2], rampPoints[3],
            rampTool_fromLevel, rampTool_toLevel));
        return;
    }
    rampTool_updateStatus();
    vectron_render();
}

function rampTool_complete() { rampTool_click(); }
function rampTool_handleClick() { rampTool_click(); }
