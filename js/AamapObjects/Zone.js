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

var zone_warning;
var ZONE_DEFAULT_GROWTH = 0;

function zone_round(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
}

function zone_xmlAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
        .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function Zone(x, y, radius, growth, type, option, details) {
    details = details || {};
    if(isNaN(type) && !zone_warning)
    {
        alert("Warning\n\nZones I don't know how to deal with were detected.\nAny special data associated with these zones will be lost.\nAfter exporting, you must make sure to fix the zone type of the zone(s) shown in grey.\n\nThis message will not be seen again this session.");
        zone_warning = true;
    }

    this.objectID = vectron_objectID;
    vectron_objectID++;

    this.obj = vectron_screen.circle(0, 0, 0);
    this.obj.data("id", this.objectID);

    this.isSelected = false;
    this.glowObj = null;

    this.x = x;
    this.y = y;
    this.radius = radius;
    this.growth = growth;

    this.type = type;
    this.zoneName = details.zoneName || (zoneTool_typeArray[this.type] ? zoneTool_typeArray[this.type][0] : "unknown");
    this.shapeType = details.shapeType || "circle";
    this.priority = details.priority;
    this.startTick = details.startTick;
    this.endTick = details.endTick;
    this.trigger = details.trigger || "";
    this.options = details.options || {};

    this.minx = details.minx;
    this.miny = details.miny;
    this.maxx = details.maxx;
    this.maxy = details.maxy;
    this.polygonScale = details.polygonScale === undefined ? 1 : Number(details.polygonScale);
    this.polygonPoints = details.polygonPoints || [];

    if(this.shapeType === "rectangle") {
        this.x = (this.minx + this.maxx) / 2;
        this.y = (this.miny + this.maxy) / 2;
        // The selection system uses radius as a bounding circle for non-circular zones.
        this.radius = Math.sqrt(Math.pow(this.maxx - this.minx, 2) + Math.pow(this.maxy - this.miny, 2)) / 2;
    } else if(this.shapeType === "polygon") {
        var maxRadius = 0;
        for(var pi = 0; pi < this.polygonPoints.length; pi++) {
            maxRadius = Math.max(maxRadius, Math.sqrt(
                Math.pow(this.polygonPoints[pi].x * this.polygonScale, 2) +
                Math.pow(this.polygonPoints[pi].y * this.polygonScale, 2)
            ));
        }
        this.radius = maxRadius;
    }
    
    switch(this.zoneName)
    {
        case "rubber":
            this.option = ( option !== undefined )?option:parseFloat($("#dRubberVal").val());
            break;
        case "checkpoint":
            this.option = Number(( option !== undefined )?option:$("#dCheckpointOrder").val());
            break;
        default:
            this.option = ( option !== undefined )?option:0;
            break;
    }

    this.xml = 'Zone';

    this.getMapPoints = function() {
        if(this.shapeType === "rectangle") {
            return [
                {x:this.minx, y:this.miny}, {x:this.maxx, y:this.miny},
                {x:this.maxx, y:this.maxy}, {x:this.minx, y:this.maxy}
            ];
        }
        if(this.shapeType === "polygon") {
            return this.polygonPoints.map(function(point) {
                return {x:this.x + point.x * this.polygonScale, y:this.y + point.y * this.polygonScale};
            }, this);
        }
        return [];
    }

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.glowObj != null) this.glowObj.remove();
        
        var color = zoneTool_typeArray[this.type] ? zoneTool_typeArray[this.type][1] : "#888888";
        if(this.shapeType === "circle") {
            this.obj = vectron_screen.circle(aamap_realX(this.x),
                aamap_realY(this.y), this.radius*vectron_zoom);
        } else {
            var points = this.getMapPoints();
            var path = "";
            for(var p = 0; p < points.length; p++) {
                path += (p ? "L" : "M") + aamap_realX(points[p].x) + "," + aamap_realY(points[p].y);
            }
            if(points.length) path += "Z";
            this.obj = vectron_screen.path(path);
        }
        this.obj.attr({"stroke": color, "fill": color, "fill-opacity": ".05"});
        this.obj.data("id", this.objectID);


        if(this.isSelected) {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool == "select") {
            selectTool_addHoverSet(this);
        }
    }

    this.scale = function(factor) {
        this.x *= factor;
        this.y *= factor;
        this.radius *= factor;
        this.growth *= factor;
        if(this.shapeType === "rectangle") {
            this.minx *= factor; this.miny *= factor;
            this.maxx *= factor; this.maxy *= factor;
        } else if(this.shapeType === "polygon") {
            this.polygonScale *= factor;
        }
    }

    this.rotate = function(rad)
    {
        if(this.shapeType === "rectangle") {
            var rectPoints = this.getMapPoints();
            this.shapeType = "polygon";
            this.polygonScale = 1;
            this.polygonPoints = rectPoints.map(function(point) {
                return {x:point.x - this.x, y:point.y - this.y};
            }, this);
        }
        var dist = Math.sqrt(Math.pow(this.x,2)+Math.pow(this.y,2));
        var newrad = Math.atan2(this.y,this.x)-rad;
        this.x = dist*Math.cos(newrad);
        this.y = dist*Math.sin(newrad);
        if(this.shapeType === "polygon") {
            for(var i = 0; i < this.polygonPoints.length; i++) {
                var point = this.polygonPoints[i];
                var px = point.x, py = point.y;
                point.x = px * Math.cos(-rad) - py * Math.sin(-rad);
                point.y = px * Math.sin(-rad) + py * Math.cos(-rad);
            }
        }
    }

    this.rotateSimple = function(dir)
    {
        if(this.shapeType === "rectangle") {
            var oldMinx = this.minx, oldMiny = this.miny, oldMaxx = this.maxx, oldMaxy = this.maxy;
            if(dir > 0) {
                this.minx = -oldMaxy; this.maxx = -oldMiny; this.miny = oldMinx; this.maxy = oldMaxx;
            } else {
                this.minx = oldMiny; this.maxx = oldMaxy; this.miny = -oldMaxx; this.maxy = -oldMinx;
            }
        }
        var x = this.x, y = this.y;
        if(dir > 0)
        {
            this.x = -y;
            this.y = x;
        }
        else
        {
            this.x = y;
            this.y = -x;
        }
        if(this.shapeType === "polygon") {
            for(var i = 0; i < this.polygonPoints.length; i++) {
                var px = this.polygonPoints[i].x, py = this.polygonPoints[i].y;
                this.polygonPoints[i].x = dir > 0 ? -py : py;
                this.polygonPoints[i].y = dir > 0 ? px : -px;
            }
        }
    }

    this.getPosition = function()
    {
        return [this.x,this.y];
    }

    this.move = function(dx, dy) {
        this.x = Math.round((this.x + dx) * 1e6) / 1e6;
        this.y = Math.round((this.y + dy) * 1e6) / 1e6;
        if(this.shapeType === "rectangle") {
            this.minx += dx; this.maxx += dx;
            this.miny += dy; this.maxy += dy;
        }
    }

    this.getShapeXML = function(legacy) {
        if(this.shapeType === "rectangle") {
            return '<ShapeRectangle minx="' + zone_round(this.minx) + '" miny="' + zone_round(this.miny) +
                '" maxx="' + zone_round(this.maxx) + '" maxy="' + zone_round(this.maxy) + '"/>';
        }
        if(this.shapeType === "polygon") {
            var polygon = '<ShapePolygon scale="' + zone_round(this.polygonScale) + '">\n' +
                '  <Point x="' + zone_round(this.x) + '" y="' + zone_round(this.y) + '"/>';
            for(var i = 0; i < this.polygonPoints.length; i++) {
                polygon += '\n  <Point x="' + zone_round(this.polygonPoints[i].x) +
                    '" y="' + zone_round(this.polygonPoints[i].y) + '"/>';
            }
            return polygon + '\n</ShapePolygon>';
        }
        var checkpoint = legacy && this.zoneName === "checkpoint" ?
            '\n  <Checkpoint id="' + zone_round(this.option) + '" time="0"/>' : "";
        return '<ShapeCircle radius="' + zone_round(this.radius) + '" growth="' + zone_round(this.growth) + '">\n' +
            '  <Point x="' + zone_round(this.x) + '" y="' + zone_round(this.y) + '"/>' + checkpoint +
            '\n</ShapeCircle>';
    }

    this.getXML = function() {
        var legacy = xml_game_mode !== "armaracing";
        var attributes = legacy ? ' effect="' + zone_xmlAttr(this.zoneName) + '"' :
            ' type="' + zone_xmlAttr(this.zoneName) + '"';
        if(legacy && this.zoneName === "rubber") {
            attributes += ' rubberVal="' + zone_xmlAttr(this.option) + '"';
        }
        if(!legacy) {
            if(this.zoneName === "checkpoint") attributes += ' order="' + zone_xmlAttr(this.option) + '"';
            if(this.zoneName === "speed") {
                attributes += ' delta_mps="' + zone_xmlAttr(this.options.delta_mps) +
                    '" duration_ticks="' + zone_xmlAttr(this.options.duration_ticks) + '"';
            } else if(this.zoneName === "rubber") {
                attributes += ' delta="' + zone_xmlAttr(this.options.delta) +
                    '" duration_ticks="' + zone_xmlAttr(this.options.duration_ticks) + '"';
            } else if(this.zoneName === "teleport") {
                attributes += ' destination_x="' + zone_xmlAttr(this.options.destination_x) +
                    '" destination_y="' + zone_xmlAttr(this.options.destination_y) + '"';
                if(this.options.angle !== undefined) {
                    attributes += ' angle="' + zone_xmlAttr(this.options.angle) + '"';
                } else if(this.options.direction !== undefined) {
                    attributes += ' direction="' + zone_xmlAttr(this.options.direction) + '"';
                } else {
                    attributes += ' xdir="' + zone_xmlAttr(this.options.xdir) +
                        '" ydir="' + zone_xmlAttr(this.options.ydir) + '"';
                }
            }
            if(this.priority !== undefined && this.priority !== "") attributes += ' priority="' + zone_xmlAttr(this.priority) + '"';
            if(this.startTick !== undefined && this.startTick !== "") attributes += ' start_tick="' + zone_xmlAttr(this.startTick) + '"';
            if(this.endTick !== undefined && this.endTick !== "") attributes += ' end_tick="' + zone_xmlAttr(this.endTick) + '"';
            if(this.trigger) attributes += ' trigger="' + zone_xmlAttr(this.trigger) + '"';
        }
        return '<Zone' + attributes + '>\n' +
            this.getShapeXML(legacy).split('\n').map(function(line) { return '  ' + line; }).join('\n') +
            '\n</Zone>';
    }

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml(this.getXML()));
    }

} 
