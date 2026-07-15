/* Click-to-outline Floor polygon tool. */

var floorTool_points = [];
var floorTool_previewObj = null;
var FLOOR_TOOL_EPSILON = 1e-9;

function floorTool_clearPreview() {
    if(floorTool_previewObj) floorTool_previewObj.remove();
    floorTool_previewObj = null;
}

function floorTool_status(message) {
    var el = $("#floor-tool-status");
    if(el.length) el.text(message);
}

function floorTool_defaultStatus() {
    return aamap_activeLevel === 0 ?
        "Level 0 already has an implicit full floor. Select an upper level." :
        "Click at least three corners, then finish the floor.";
}

function floorTool_onActiveLevelChanged() {
    if(!floorTool_points.length) floorTool_status(floorTool_defaultStatus());
}

function floorTool_reset() {
    floorTool_clearPreview();
    floorTool_points = [];
    vectron_toolActive = false;
    floorTool_status(floorTool_defaultStatus());
    $("#floor-tool-finish,#floor-tool-cancel").toggle(false);
}

function floorTool_connect() {
    $(".toolbar-toolFloor").addClass("toolbar-tool-active");
    $("#floor-tool-window").show();
    floorTool_reset();
    if(typeof gui_refreshFloatingWindows === "function") gui_refreshFloatingWindows();
}

function floorTool_disconnect() {
    floorTool_reset();
    $(".toolbar-toolFloor").removeClass("toolbar-tool-active");
    $("#floor-tool-window").hide();
}

function floorTool_cancel() {
    floorTool_reset();
    vectron_render();
}

function floorTool_distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function floorTool_click() {
    if(aamap_activeLevel === 0) {
        floorTool_status(floorTool_defaultStatus());
        gui_toast("Level 0 already has a full floor. Select an upper level first.");
        return false;
    }
    var point = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
    if(floorTool_points.length &&
        floorTool_distance(floorTool_points[floorTool_points.length - 1], point) <= FLOOR_TOOL_EPSILON) return;
    floorTool_points.push(point);
    vectron_toolActive = true;
    floorTool_status(floorTool_points.length < 3 ?
        "Add " + (3 - floorTool_points.length) + " more corner(s)." :
        "Add more corners or finish the floor.");
    $("#floor-tool-finish").toggle(floorTool_points.length >= 3);
    $("#floor-tool-cancel").show();
    vectron_render();
}

function floorTool_area(points) {
    var area = 0;
    for(var i = 0; i < points.length; i++) {
        var next = points[(i + 1) % points.length];
        area += points[i].x * next.y - next.x * points[i].y;
    }
    return area / 2;
}

function floorTool_isSimplePolygon(points) {
    if(!points || points.length < 3) return false;
    function orientation(a, b, c) {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    function onSegment(a, b, p) {
        return Math.abs(orientation(a, b, p)) <= FLOOR_TOOL_EPSILON &&
            p.x >= Math.min(a.x, b.x) - FLOOR_TOOL_EPSILON &&
            p.x <= Math.max(a.x, b.x) + FLOOR_TOOL_EPSILON &&
            p.y >= Math.min(a.y, b.y) - FLOOR_TOOL_EPSILON &&
            p.y <= Math.max(a.y, b.y) + FLOOR_TOOL_EPSILON;
    }
    function intersects(a, b, c, d) {
        var o1 = orientation(a, b, c), o2 = orientation(a, b, d);
        var o3 = orientation(c, d, a), o4 = orientation(c, d, b);
        if(((o1 > FLOOR_TOOL_EPSILON && o2 < -FLOOR_TOOL_EPSILON) ||
            (o1 < -FLOOR_TOOL_EPSILON && o2 > FLOOR_TOOL_EPSILON)) &&
            ((o3 > FLOOR_TOOL_EPSILON && o4 < -FLOOR_TOOL_EPSILON) ||
            (o3 < -FLOOR_TOOL_EPSILON && o4 > FLOOR_TOOL_EPSILON))) return true;
        return onSegment(a, b, c) || onSegment(a, b, d) ||
            onSegment(c, d, a) || onSegment(c, d, b);
    }
    for(var i = 0; i < points.length; i++) {
        if(floorTool_distance(points[i], points[(i + 1) % points.length]) <= FLOOR_TOOL_EPSILON) return false;
        for(var j = i + 1; j < points.length; j++) {
            var adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
            if(adjacent) continue;
            if(intersects(points[i], points[(i + 1) % points.length],
                points[j], points[(j + 1) % points.length])) return false;
        }
    }
    return Math.abs(floorTool_area(points)) > FLOOR_TOOL_EPSILON;
}

function floorTool_finish() {
    if(aamap_activeLevel === 0) {
        floorTool_status(floorTool_defaultStatus());
        gui_toast("Level 0 already has a full floor. Select an upper level first.");
        return false;
    }
    if(!floorTool_isSimplePolygon(floorTool_points)) {
        gui_toast("A floor needs a non-self-intersecting outline with at least three corners.");
        return false;
    }
    var floor = new Floor(aamap_activeLevel);
    floor.points = floorTool_points.map(function(point) { return {x:point.x, y:point.y}; });
    var addedFloors = aamap_addWithSymmetry(floor);
    aamap_recordAction({
        label:"Add floor",
        undo:function() { aamap_removeObjectGroup(addedFloors); vectron_render(); },
        redo:function() { aamap_restoreObjectGroup(addedFloors); vectron_render(); }
    });
    floorTool_reset();
    vectron_render();
    if(typeof xmlEditor_onSelectionChange === "function") xmlEditor_onSelectionChange();
    return true;
}

function floorTool_renderCurrent() {
    floorTool_clearPreview();
    if(!floorTool_points.length || typeof cursor_realX === "undefined") return;
    var path = ["M", aamap_realX(floorTool_points[0].x), aamap_realY(floorTool_points[0].y)];
    for(var i = 1; i < floorTool_points.length; i++) {
        path.push("L", aamap_realX(floorTool_points[i].x), aamap_realY(floorTool_points[i].y));
    }
    path.push("L", cursor_realX, cursor_realY);
    if(floorTool_points.length >= 2) path.push("Z");
    var color = config_isDark ? FLOOR_COLOR_DARK : FLOOR_COLOR_LIGHT;
    floorTool_previewObj = vectron_screen.path(path).attr({
        stroke:color, "stroke-width":1.5, "stroke-dasharray":"- ",
        fill:FLOOR_INFILL_COLOR,
        "fill-opacity":aamap_activeLevel > 0 && floorTool_points.length >= 2 ?
            FLOOR_INFILL_OPACITY : 0
    });
}
