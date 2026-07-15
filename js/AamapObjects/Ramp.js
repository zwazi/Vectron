/*
 * Vectron ramp object for Arma Racing.
 *
 * Native ramps are authored as two edges on different floors.  Point order in
 * XML is always [from0, from1, to0, to1].  The previous centre-line + width
 * constructor is retained only so older map files can be upgraded on import.
 */

var RAMP_DEFAULT_WIDTH = 8;
var RAMP_COLOR_LIGHT = "#167bb5";
var RAMP_COLOR_DARK = "#54c7ff";
var RAMP_COORD_PRECISION = 1e6;
var RAMP_DIRECTION_EPSILON = 1e-9;

function ramp_round(value) {
    return Math.round(Number(value) * RAMP_COORD_PRECISION) / RAMP_COORD_PRECISION;
}

function ramp_point(value, fallback) {
    fallback = fallback || {x:0, y:0};
    if(value && isFinite(Number(value.x)) && isFinite(Number(value.y))) {
        return {x:Number(value.x), y:Number(value.y)};
    }
    return {x:Number(fallback.x) || 0, y:Number(fallback.y) || 0};
}

function ramp_level(value, fallback) {
    value = Number(value);
    if(isFinite(value) && value >= 0 && Math.floor(value) === value) return value;
    return Number(fallback) >= 0 ? Number(fallback) : 0;
}

function ramp_midpoint(a, b) {
    return {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2};
}

function ramp_legacyCorners(start, end, width) {
    start = ramp_point(start);
    end = ramp_point(end, start);
    width = Number(width);
    if(!isFinite(width) || width <= 0) width = RAMP_DEFAULT_WIDTH;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    var nx = length > RAMP_DIRECTION_EPSILON ? -dy / length * width / 2 : width / 2;
    var ny = length > RAMP_DIRECTION_EPSILON ? dx / length * width / 2 : 0;
    return [
        {x:start.x + nx, y:start.y + ny},
        {x:start.x - nx, y:start.y - ny},
        {x:end.x + nx, y:end.y + ny},
        {x:end.x - nx, y:end.y - ny}
    ];
}

function ramp_alignSecondEdge(from0, from1, to0, to1) {
    function d2(a, b) {
        var dx = a.x - b.x, dy = a.y - b.y;
        return dx * dx + dy * dy;
    }
    if(d2(from0, to0) + d2(from1, to1) <= d2(from0, to1) + d2(from1, to0)) {
        return [to0, to1];
    }
    return [to1, to0];
}

function ramp_geometryValid(points) {
    if(!points || points.length !== 4) return false;
    function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
    if(d2(points[0], points[1]) <= RAMP_DIRECTION_EPSILON ||
        d2(points[2], points[3]) <= RAMP_DIRECTION_EPSILON) return false;
    var fromCenter = ramp_midpoint(points[0], points[1]);
    var toCenter = ramp_midpoint(points[2], points[3]);
    if(d2(fromCenter, toCenter) <= RAMP_DIRECTION_EPSILON) return false;
    function orientation(a, b, c) {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    var o1 = orientation(points[0], points[2], points[3]);
    var o2 = orientation(points[0], points[2], points[1]);
    var o3 = orientation(points[3], points[1], points[0]);
    var o4 = orientation(points[3], points[1], points[2]);
    if(((o1 > RAMP_DIRECTION_EPSILON && o2 < -RAMP_DIRECTION_EPSILON) ||
        (o1 < -RAMP_DIRECTION_EPSILON && o2 > RAMP_DIRECTION_EPSILON)) &&
        ((o3 > RAMP_DIRECTION_EPSILON && o4 < -RAMP_DIRECTION_EPSILON) ||
        (o3 < -RAMP_DIRECTION_EPSILON && o4 > RAMP_DIRECTION_EPSILON))) return false;
    var polygon = [points[0], points[2], points[3], points[1]];
    var area = 0;
    for(var i = 0; i < polygon.length; i++) {
        var next = polygon[(i + 1) % polygon.length];
        area += polygon[i].x * next.y - next.x * polygon[i].y;
    }
    return Math.abs(area) > RAMP_DIRECTION_EPSILON;
}

/**
 * Ramp(from0, from1, to0, to1, fromLevel, toLevel)
 *
 * Compatibility forms:
 *   Ramp(start, end, width, fromLevel, toLevel)
 *   Ramp(x1, y1, x2, y2, width, fromLevel, toLevel)
 */
function Ramp(from0, from1, to0, to1, fromLevel, toLevel) {
    var points;
    var sourceTwoPoint = null;
    var activeLevel = typeof aamap_activeLevel === "number" ? aamap_activeLevel : 0;

    if(arguments.length >= 7 && typeof from0 === "number" && typeof from1 === "number") {
        var numericStart = {x:arguments[0], y:arguments[1]};
        var numericEnd = {x:arguments[2], y:arguments[3]};
        var numericWidth = Number(arguments[4]);
        points = ramp_legacyCorners(numericStart, numericEnd, numericWidth);
        sourceTwoPoint = {start:ramp_point(numericStart),end:ramp_point(numericEnd),
            width:numericWidth};
        fromLevel = arguments[5];
        toLevel = arguments[6];
    } else if(arguments.length === 5 ||
        (arguments.length >= 3 && typeof to0 === "number")) {
        var legacyStart = ramp_point(from0);
        var legacyEnd = ramp_point(from1, legacyStart);
        var legacyWidth = Number(to0);
        points = ramp_legacyCorners(legacyStart, legacyEnd, legacyWidth);
        sourceTwoPoint = {start:legacyStart,end:legacyEnd,width:legacyWidth};
        fromLevel = to1;
        toLevel = arguments[4];
    } else {
        points = [ramp_point(from0), ramp_point(from1, from0),
            ramp_point(to0, from0), ramp_point(to1, to0)];
    }

    this.from0 = points[0];
    this.from1 = points[1];
    this.to0 = points[2];
    this.to1 = points[3];
    this.points = [this.from0, this.from1, this.to0, this.to1];
    this.sourceTwoPoint = sourceTwoPoint;
    this.fromLevel = ramp_level(fromLevel, activeLevel);
    this.toLevel = ramp_level(toLevel, this.fromLevel === 0 ? 1 : 0);
    if(this.toLevel === this.fromLevel) this.toLevel = this.fromLevel + 1;

    this.objectID = vectron_objectID++;
    this.obj = vectron_screen.path();
    this.obj.data("id", this.objectID);
    this.detailObj = null;
    this.glowObj = null;
    this.isSelected = false;
    this.xml = "Ramp";

    this.syncPosition = function() {
        this.start = ramp_midpoint(this.from0, this.from1);
        this.end = ramp_midpoint(this.to0, this.to1);
        this.x = (this.start.x + this.end.x) / 2;
        this.y = (this.start.y + this.end.y) / 2;
        var fromWidth = Math.hypot(this.from1.x - this.from0.x, this.from1.y - this.from0.y);
        var toWidth = Math.hypot(this.to1.x - this.to0.x, this.to1.y - this.to0.y);
        this.width = (fromWidth + toWidth) / 2;
    };

    this.getCorridorPoints = function() {
        return [this.from0, this.to0, this.to1, this.from1];
    };

    this.removeDetails = function() {
        if(this.detailObj) this.detailObj.remove();
        this.detailObj = null;
    };

    this.render = function() {
        if(this.obj) this.obj.remove();
        this.removeDetails();
        if(this.glowObj) this.glowObj.remove();
        this.glowObj = null;
        this.syncPosition();

        var polygon = this.getCorridorPoints();
        var path = ["M", aamap_realX(polygon[0].x), aamap_realY(polygon[0].y)];
        for(var i = 1; i < polygon.length; i++) {
            path.push("L", aamap_realX(polygon[i].x), aamap_realY(polygon[i].y));
        }
        path.push("Z");
        var color = config_isDark ? RAMP_COLOR_DARK : RAMP_COLOR_LIGHT;
        this.obj = vectron_screen.path(path).attr({
            stroke:color, "stroke-width":2, "stroke-opacity":0.9,
            fill:color, "fill-opacity":0.22, "stroke-linejoin":"round"
        });
        this.obj.data("id", this.objectID);

        var sx = aamap_realX(this.start.x), sy = aamap_realY(this.start.y);
        var ex = aamap_realX(this.end.x), ey = aamap_realY(this.end.y);
        var details = vectron_screen.set();
        details.push(vectron_screen.path(["M", sx, sy, "L", ex, ey]).attr({
            stroke:color, "stroke-width":1.5, "stroke-dasharray":"- ",
            "stroke-opacity":0.9
        }));
        var dx = ex - sx, dy = ey - sy;
        var length = Math.sqrt(dx * dx + dy * dy);
        if(length > RAMP_DIRECTION_EPSILON) {
            var ux = dx / length, uy = dy / length;
            var ax = sx + dx * 0.62, ay = sy + dy * 0.62, size = 9;
            details.push(vectron_screen.path([
                "M", sx + dx * 0.38, sy + dy * 0.38, "L", ax, ay,
                "M", ax, ay, "L", ax - ux * size - uy * size * 0.55,
                ay - uy * size + ux * size * 0.55,
                "M", ax, ay, "L", ax - ux * size + uy * size * 0.55,
                ay - uy * size - ux * size * 0.55
            ]).attr({stroke:color, "stroke-width":2, "stroke-linecap":"round"}));
        }
        details.push(vectron_screen.text(sx, sy - 13, "L" + this.fromLevel)
            .attr({fill:color, "font-size":11, "font-weight":"bold"}));
        details.push(vectron_screen.text(ex, ey - 13, "L" + this.toLevel)
            .attr({fill:color, "font-size":11, "font-weight":"bold"}));
        this.detailObj = details;

        var owner = this;
        var baseRemove = this.obj.remove;
        var baseTranslate = this.obj.translate;
        this.obj.remove = function() { owner.removeDetails(); return baseRemove.call(this); };
        this.obj.translate = function(x, y) {
            if(owner.detailObj) owner.detailObj.translate(x, y);
            return baseTranslate.call(this, x, y);
        };
        if(this.isSelected && typeof selectTool_addHoverSetSelected === "function") {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool === "select" && typeof selectTool_addHoverSet === "function") {
            selectTool_addHoverSet(this);
        }
        if(this.detailObj) this.detailObj.toFront();
    };

    this.syncPosition();

    this.scale = function(factor) {
        factor = Number(factor);
        if(!isFinite(factor)) return;
        this.points.forEach(function(point) { point.x *= factor; point.y *= factor; });
        if(this.sourceTwoPoint) {
            this.sourceTwoPoint.start.x *= factor;
            this.sourceTwoPoint.start.y *= factor;
            this.sourceTwoPoint.end.x *= factor;
            this.sourceTwoPoint.end.y *= factor;
            this.sourceTwoPoint.width *= Math.abs(factor);
        }
        this.syncPosition();
    };

    this.rotate = function(rad) {
        rad = Number(rad);
        if(!isFinite(rad)) return;
        var cosine = Math.cos(-rad), sine = Math.sin(-rad);
        this.points.forEach(function(point) {
            var x = point.x, y = point.y;
            point.x = x * cosine - y * sine;
            point.y = x * sine + y * cosine;
        });
        if(this.sourceTwoPoint) {
            [this.sourceTwoPoint.start,this.sourceTwoPoint.end].forEach(function(point) {
                var x = point.x, y = point.y;
                point.x = x * cosine - y * sine;
                point.y = x * sine + y * cosine;
            });
        }
        this.syncPosition();
    };

    this.rotateSimple = function(dir) {
        this.points.forEach(function(point) {
            var x = point.x, y = point.y;
            point.x = dir > 0 ? -y : y;
            point.y = dir > 0 ? x : -x;
        });
        if(this.sourceTwoPoint) {
            [this.sourceTwoPoint.start,this.sourceTwoPoint.end].forEach(function(point) {
                var x = point.x, y = point.y;
                point.x = dir > 0 ? -y : y;
                point.y = dir > 0 ? x : -x;
            });
        }
        this.syncPosition();
    };

    this.getPosition = function() { return [this.x, this.y]; };

    this.move = function(dx, dy) {
        dx = Number(dx); dy = Number(dy);
        if(!isFinite(dx) || !isFinite(dy)) return;
        this.points.forEach(function(point) {
            point.x = ramp_round(point.x + dx);
            point.y = ramp_round(point.y + dy);
        });
        if(this.sourceTwoPoint) {
            this.sourceTwoPoint.start.x = ramp_round(this.sourceTwoPoint.start.x + dx);
            this.sourceTwoPoint.start.y = ramp_round(this.sourceTwoPoint.start.y + dy);
            this.sourceTwoPoint.end.x = ramp_round(this.sourceTwoPoint.end.x + dx);
            this.sourceTwoPoint.end.y = ramp_round(this.sourceTwoPoint.end.y + dy);
        }
        this.syncPosition();
    };

    this.getBounds = function() {
        var xs = this.points.map(function(point) { return point.x; });
        var ys = this.points.map(function(point) { return point.y; });
        var minX = Math.min.apply(Math, xs), minY = Math.min.apply(Math, ys);
        var maxX = Math.max.apply(Math, xs), maxY = Math.max.apply(Math, ys);
        var bounds = [minX, minY, maxX, maxY];
        bounds.minX = bounds.left = bounds.minx = minX;
        bounds.minY = bounds.bottom = bounds.miny = minY;
        bounds.maxX = bounds.right = bounds.maxx = maxX;
        bounds.maxY = bounds.top = bounds.maxy = maxY;
        return bounds;
    };

    this.getXML = function() {
        var source = this.sourceTwoPoint;
        var xml = '<Ramp from_level="' + this.fromLevel + '" to_level="' + this.toLevel + '"' +
            (source ? ' width="' + ramp_round(source.width) + '"' : '') + '>\n';
        var outputPoints = source ? [source.start,source.end] : this.points;
        outputPoints.forEach(function(point) {
            xml += '  <Point x="' + ramp_round(point.x) + '" y="' + ramp_round(point.y) + '"/>\n';
        });
        return xml + '</Ramp>';
    };

    this.outputFriendlyXML = function() {
        this.getXML().split("\n").forEach(function(line, index, lines) {
            gui_writeLog((index > 0 && index < lines.length - 1 ? "&nbsp;&nbsp;" : "") + escapeHtml(line));
        });
    };
}
