/* A floating image billboard authored as a world-space width segment. */

var BILLBOARD_COLOR = "#48e8ff";

function billboard_round(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
}

function billboard_escape(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function billboard_isExternalUrl(value) {
    var url = String(value || "");
    return url.length <= NEOMAP_MAX_BILLBOARD_URL_CHARACTERS &&
        url === url.trim() &&
        /^https?:\/\/(?![^/?#]*@)(?!:)[^\s/?#]+(?:[/?#][^\s]*)?$/.test(url);
}

function billboard_normalizeFacing(value) {
    return value === "left" ? "left" : "right";
}

function billboard_facingForPoint(start, end, point) {
    var cross = (Number(end.x) - Number(start.x)) *
        (Number(point.y) - (Number(start.y) + Number(end.y)) / 2) -
        (Number(end.y) - Number(start.y)) *
        (Number(point.x) - (Number(start.x) + Number(end.x)) / 2);
    if(!isFinite(cross) || Math.abs(cross) < 1e-9) return null;
    return cross > 0 ? "left" : "right";
}

function billboard_facingArrow(start, end, facing) {
    var dx = Number(end.x) - Number(start.x);
    var dy = Number(end.y) - Number(start.y);
    var width = Math.hypot(dx, dy);
    if(!isFinite(width) || width < 1e-9) return null;
    var side = billboard_normalizeFacing(facing) === "left" ? 1 : -1;
    var nx = -dy / width * side;
    var ny = dx / width * side;
    var alongX = dx / width;
    var alongY = dy / width;
    var length = Math.min(6, Math.max(1, width * 0.24));
    var head = Math.min(length * 0.42, Math.max(0.35, width * 0.08));
    var center = {
        x:(Number(start.x) + Number(end.x)) / 2,
        y:(Number(start.y) + Number(end.y)) / 2
    };
    var tip = {x:center.x + nx * length, y:center.y + ny * length};
    return {
        center:center,
        tip:tip,
        headLeft:{
            x:tip.x - nx * head + alongX * head * 0.72,
            y:tip.y - ny * head + alongY * head * 0.72
        },
        headRight:{
            x:tip.x - nx * head - alongX * head * 0.72,
            y:tip.y - ny * head - alongY * head * 0.72
        }
    };
}

function Billboard(start, end, height, url, level, facing, dualSided) {
    this.objectID = vectron_objectID++;
    this.obj = aamap_isBulkLoading() ? null : vectron_screen.path([]);
    if(this.obj) this.obj.data("id", this.objectID);
    this.glowObj = null;
    this.isSelected = false;
    this.level = aamap_normalizeLevel(level, 0);
    this.start = {x:Number(start && start.x), y:Number(start && start.y)};
    this.end = {x:Number(end && end.x), y:Number(end && end.y)};
    this.height = Number(height);
    this.url = String(url || "").trim();
    this.facing = billboard_normalizeFacing(facing);
    // Existing canonical maps had no facing metadata and behaved as
    // dual-sided panels. Callers that create a new sign pass false explicitly.
    this.dualSided = dualSided === undefined ? true : !!dualSided;

    this.render = function() {
        if(this.obj) this.obj.remove();
        var arrow = billboard_facingArrow(this.start, this.end, this.facing);
        var path = [
            "M", aamap_realX(this.start.x), aamap_realY(this.start.y),
            "L", aamap_realX(this.end.x), aamap_realY(this.end.y)
        ];
        if(arrow) path.push(
            "M", aamap_realX(arrow.center.x), aamap_realY(arrow.center.y),
            "L", aamap_realX(arrow.tip.x), aamap_realY(arrow.tip.y),
            "M", aamap_realX(arrow.headLeft.x), aamap_realY(arrow.headLeft.y),
            "L", aamap_realX(arrow.tip.x), aamap_realY(arrow.tip.y),
            "L", aamap_realX(arrow.headRight.x), aamap_realY(arrow.headRight.y)
        );
        this.obj = vectron_screen.path(path).attr({
            stroke:BILLBOARD_COLOR,
            "stroke-width":this.isSelected ? 4 : 3,
            "stroke-linecap":"round",
            "stroke-opacity":this.isSelected ? 1 : 0.88,
            "stroke-dasharray":"-.",
            fill:"none"
        });
        this.obj.data("id", this.objectID);
        if(this.isSelected) selectTool_addHoverSetSelected(this);
        else if(vectron_currentTool === "select") selectTool_addHoverSet(this);
    };

    this.getPosition = function() {
        return [(this.start.x + this.end.x) / 2, (this.start.y + this.end.y) / 2];
    };

    this.getFacingArrow = function() {
        return billboard_facingArrow(this.start, this.end, this.facing);
    };

    this.getBounds = function() {
        var arrow = billboard_facingArrow(this.start, this.end, this.facing);
        var points = [this.start, this.end];
        if(arrow) points.push(arrow.tip, arrow.headLeft, arrow.headRight);
        return {
            minx:Math.min.apply(null, points.map(function(point) { return point.x; })),
            miny:Math.min.apply(null, points.map(function(point) { return point.y; })),
            maxx:Math.max.apply(null, points.map(function(point) { return point.x; })),
            maxy:Math.max.apply(null, points.map(function(point) { return point.y; }))
        };
    };

    this.move = function(dx, dy) {
        this.start.x = billboard_round(this.start.x + dx);
        this.start.y = billboard_round(this.start.y + dy);
        this.end.x = billboard_round(this.end.x + dx);
        this.end.y = billboard_round(this.end.y + dy);
    };

    this.scale = function(factor) {
        this.start.x *= factor; this.start.y *= factor;
        this.end.x *= factor; this.end.y *= factor;
        this.height *= Math.abs(factor);
    };

    this.rotate = function(rad) {
        var cosine = Math.cos(-rad), sine = Math.sin(-rad);
        [this.start, this.end].forEach(function(point) {
            var x = point.x, y = point.y;
            point.x = x * cosine - y * sine;
            point.y = x * sine + y * cosine;
        });
    };

    this.rotateSimple = function(direction) {
        [this.start, this.end].forEach(function(point) {
            var x = point.x, y = point.y;
            point.x = direction > 0 ? -y : y;
            point.y = direction > 0 ? x : -x;
        });
    };

    this.getXML = function(includeLevel) {
        return '<Billboard' + (includeLevel === false ? '' :
            ' level="' + this.level + '"') +
            ' height="' + billboard_round(this.height) + '" url="' +
            billboard_escape(this.url) + '" facing="' + this.facing +
            '" dual_sided="' + this.dualSided + '">\n' +
            '  <Point x="' + billboard_round(this.start.x) + '" y="' +
            billboard_round(this.start.y) + '"/>\n' +
            '  <Point x="' + billboard_round(this.end.x) + '" y="' +
            billboard_round(this.end.y) + '"/>\n' +
            '</Billboard>';
    };

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml(this.getXML()));
    };
}
