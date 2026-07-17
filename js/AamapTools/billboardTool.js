/* Three-click billboard width and facing tool. */

var billboardTool_start = null;
var billboardTool_end = null;
var billboardTool_guideObj = null;

function billboardTool_setStatus(message) {
    $("#billboard-tool-status").text(message);
}

function billboardTool_removeGuide() {
    if(billboardTool_guideObj) billboardTool_guideObj.remove();
    billboardTool_guideObj = null;
}

function billboardTool_reset() {
    billboardTool_removeGuide();
    billboardTool_start = null;
    billboardTool_end = null;
    vectron_toolActive = false;
    billboardTool_setStatus("Click the first edge of the billboard.");
}

function billboardTool_connect() {
    $(".toolbar-toolBillboard").addClass("toolbar-tool-active");
    $("#billboard-tool-window").show();
    billboardTool_reset();
    gui_refreshFloatingWindows();
}

function billboardTool_disconnect() {
    billboardTool_reset();
    $(".toolbar-toolBillboard").removeClass("toolbar-tool-active");
    $("#billboard-tool-window").hide();
    gui_refreshFloatingWindows();
}

function billboardTool_url() {
    return String($("#dBillboardUrl").val() || "").trim();
}

function billboardTool_height() {
    var value = Number($("#dBillboardHeight").val());
    return isFinite(value) && value >= 0 ? value : null;
}

function billboardTool_dualSided() {
    return $("#dBillboardDualSided").is(":checked");
}

function billboardTool_validate() {
    if(!billboard_isExternalUrl(billboardTool_url())) {
        gui_writeLog("Billboard URL must be an external http:// or https:// URL no longer than " +
            NEOMAP_MAX_BILLBOARD_URL_CHARACTERS + " characters.");
        return false;
    }
    if(billboardTool_height() === null) {
        gui_writeLog("Billboard height must be 0 or greater.");
        return false;
    }
    return true;
}

function billboardTool_guide() {
    billboardTool_removeGuide();
    if(!billboardTool_start) return;
    var path = [
        "M", aamap_realX(billboardTool_start.x), aamap_realY(billboardTool_start.y),
        "L", billboardTool_end ? aamap_realX(billboardTool_end.x) : cursor_realX,
        billboardTool_end ? aamap_realY(billboardTool_end.y) : cursor_realY
    ];
    if(billboardTool_end) {
        var cursorPoint = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
        var facing = billboard_facingForPoint(
            billboardTool_start, billboardTool_end, cursorPoint);
        var arrow = facing && billboard_facingArrow(
            billboardTool_start, billboardTool_end, facing);
        if(arrow) path.push(
            "M", aamap_realX(arrow.center.x), aamap_realY(arrow.center.y),
            "L", aamap_realX(arrow.tip.x), aamap_realY(arrow.tip.y),
            "M", aamap_realX(arrow.headLeft.x), aamap_realY(arrow.headLeft.y),
            "L", aamap_realX(arrow.tip.x), aamap_realY(arrow.tip.y),
            "L", aamap_realX(arrow.headRight.x), aamap_realY(arrow.headRight.y)
        );
    }
    billboardTool_guideObj = vectron_screen.path(path).attr({stroke:BILLBOARD_COLOR, "stroke-width":3,
        "stroke-dasharray":"-.", "stroke-opacity":0.88});
}

function billboardTool_click() {
    if(!billboardTool_validate()) return false;
    var point = {x:aamap_mapX(cursor_realX), y:aamap_mapY(cursor_realY)};
    if(!billboardTool_start) {
        billboardTool_start = point;
        vectron_toolActive = true;
        billboardTool_setStatus("Click the opposite edge to set its world width.");
        billboardTool_guide();
        return true;
    }
    if(!billboardTool_end) {
        if(point.x === billboardTool_start.x && point.y === billboardTool_start.y) {
            gui_writeLog("Billboard width must be greater than 0.");
            return false;
        }
        billboardTool_end = point;
        billboardTool_setStatus("Click either side of the line to set the front-facing direction.");
        billboardTool_guide();
        return true;
    }
    var facing = billboard_facingForPoint(billboardTool_start, billboardTool_end, point);
    if(!facing) {
        gui_writeLog("Click away from the billboard line to choose its facing direction.");
        return false;
    }
    var billboard = new Billboard(billboardTool_start, billboardTool_end,
        billboardTool_height(), billboardTool_url(), aamap_activeLevel,
        facing, billboardTool_dualSided());
    var added = aamap_addWithSymmetry(billboard);
    aamap_recordAction({
        label:"Add billboard",
        undo:function() { aamap_removeObjectGroup(added); vectron_render(); },
        redo:function() { aamap_restoreObjectGroup(added); vectron_render(); }
    });
    billboardTool_reset();
    vectron_render();
    return true;
}
