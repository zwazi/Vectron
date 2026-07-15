/* Free-form floor polygon for upper-level walkable surfaces. */

var FLOOR_COLOR_LIGHT = "#6879b8";
var FLOOR_COLOR_DARK = "#a6b4ef";
var FLOOR_INFILL_COLOR = "#6ec5ff";
var FLOOR_INFILL_OPACITY = 0.18;

function Floor(level) {
    this.objectID = vectron_objectID++;
    this.level = typeof level === "number" ? level :
        (typeof aamap_activeLevel === "number" ? aamap_activeLevel : 0);
    this.points = [];
    this.obj = vectron_screen.path();
    this.obj.data("id", this.objectID);
    this.glowObj = null;
    this.isSelected = false;
    this.xml = "Floor";

    this.screenPath = function() {
        if(!this.points.length) return [];
        var path = ["M", aamap_realX(this.points[0].x), aamap_realY(this.points[0].y)];
        for(var i = 1; i < this.points.length; i++) {
            path.push("L", aamap_realX(this.points[i].x), aamap_realY(this.points[i].y));
        }
        path.push("Z");
        return path;
    };

    this.render = function() {
        if(this.obj) this.obj.remove();
        if(this.glowObj) this.glowObj.remove();
        this.glowObj = null;
        if(this.level <= 0) {
            this.obj = vectron_screen.path();
            this.obj.data("id", this.objectID);
            return;
        }
        var color = config_isDark ? FLOOR_COLOR_DARK : FLOOR_COLOR_LIGHT;
        this.obj = vectron_screen.path(this.screenPath()).attr({
            stroke:color, "stroke-width":1.5, "stroke-opacity":0.85,
            fill:FLOOR_INFILL_COLOR,
            "fill-opacity":FLOOR_INFILL_OPACITY,
            "stroke-linejoin":"round"
        });
        this.obj.data("id", this.objectID);
        if(this.isSelected && typeof selectTool_addHoverSetSelected === "function") {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool === "select" && typeof selectTool_addHoverSet === "function") {
            selectTool_addHoverSet(this);
        }
    };

    this.scale = function(factor) {
        factor = Number(factor);
        if(!isFinite(factor)) return;
        this.points.forEach(function(point) { point.x *= factor; point.y *= factor; });
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
    };

    this.rotateSimple = function(dir) {
        this.points.forEach(function(point) {
            var x = point.x, y = point.y;
            point.x = dir > 0 ? -y : y;
            point.y = dir > 0 ? x : -x;
        });
    };

    this.move = function(dx, dy) {
        dx = Number(dx); dy = Number(dy);
        if(!isFinite(dx) || !isFinite(dy)) return;
        this.points.forEach(function(point) {
            point.x = Math.round((point.x + dx) * 1e6) / 1e6;
            point.y = Math.round((point.y + dy) * 1e6) / 1e6;
        });
    };

    this.getPosition = function() {
        if(!this.points.length) return [0, 0];
        var sum = this.points.reduce(function(total, point) {
            total[0] += point.x; total[1] += point.y; return total;
        }, [0, 0]);
        return [sum[0] / this.points.length, sum[1] / this.points.length];
    };

    this.getBounds = function() {
        if(this.level <= 0 || !this.points.length) return null;
        var xs = this.points.map(function(point) { return point.x; });
        var ys = this.points.map(function(point) { return point.y; });
        return {minx:Math.min.apply(Math, xs), miny:Math.min.apply(Math, ys),
            maxx:Math.max.apply(Math, xs), maxy:Math.max.apply(Math, ys)};
    };

    this.getXML = function() {
        if(this.level <= 0) return "";
        var xml = '<Floor level="' + this.level + '">\n';
        this.points.forEach(function(point) {
            xml += '  <Point x="' + (Math.round(point.x * 1e6) / 1e6) +
                '" y="' + (Math.round(point.y * 1e6) / 1e6) + '"/>\n';
        });
        return xml + '</Floor>';
    };

    this.outputFriendlyXML = function() {
        this.getXML().split("\n").forEach(function(line) { gui_writeLog(escapeHtml(line)); });
    };
}
