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
var ZONE_DIRECTION_EPSILON = 1e-9;
var ZONE_DEFAULT_XDIR = 1;
var ZONE_DEFAULT_YDIR = 0;

function zone_round(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
}

function zone_xmlAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
        .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Return the authored footprint without extending it beyond either endpoint.
 * A zero-width ShapeLine is intentionally represented by its two endpoints;
 * positive widths produce the four corners of a closed rectangular box.
 */
function zone_lineFootprintPoints(lineStart, lineEnd, width) {
    var start = {x:Number(lineStart.x), y:Number(lineStart.y)};
    var end = {x:Number(lineEnd.x), y:Number(lineEnd.y)};
    var lineWidth = Number(width);
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    if(!(lineWidth > 0) || !(length > ZONE_DIRECTION_EPSILON)) {
        return [start, end];
    }
    var offsetX = -dy / length * lineWidth / 2;
    var offsetY = dx / length * lineWidth / 2;
    return [
        {x:start.x + offsetX, y:start.y + offsetY},
        {x:end.x + offsetX, y:end.y + offsetY},
        {x:end.x - offsetX, y:end.y - offsetY},
        {x:start.x - offsetX, y:start.y - offsetY}
    ];
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

    this.obj = aamap_isBulkLoading() ? null : vectron_screen.circle(0, 0, 0);
    if(this.obj) this.obj.data("id", this.objectID);

    this.isSelected = false;
    this.glowObj = null;
    this.destinationObj = null;
    this.destinationGlowObj = null;
    this.teleportLinkObj = null;
    this.movementPathObj = null;
    this.checkpointLabelOutlineObj = null;
    this.checkpointLabelObj = null;
    var requestedLevel = Number(details.level);
    this.level = isFinite(requestedLevel) && requestedLevel >= 0 &&
        Math.floor(requestedLevel) === requestedLevel ? requestedLevel :
        (typeof aamap_activeLevel === "number" ? aamap_activeLevel : 0);

    this.x = x;
    this.y = y;
    this.radius = radius;
    this.growth = growth;

    this.type = type;
    this.zoneName = details.zoneName || (zoneTool_typeArray[this.type] ? zoneTool_typeArray[this.type][0] : "unknown");
    this.shapeType = details.shapeType || "circle";
    this.trigger = details.trigger || "";
    this.activeStartTick = details.activeStartTick === undefined ||
        details.activeStartTick === null ? null : Number(details.activeStartTick);
    this.activeEndTick = details.activeEndTick === undefined ||
        details.activeEndTick === null ? null : Number(details.activeEndTick);
    this.options = details.options || {};
    var requestedMovementSpeed = Number(details.movementSpeed);
    var requestedRotationSpeed = Number(details.rotationSpeed);
    this.movementSpeed = isFinite(requestedMovementSpeed) ? requestedMovementSpeed : 20;
    // Rotation still affects a moving circle's path/orientation state even
    // though the circle silhouette itself is rotationally symmetric.  Keep
    // imported values so a load/export round trip cannot change the map ID.
    this.rotationSpeed = isFinite(requestedRotationSpeed) ? requestedRotationSpeed : 0;
    this.movementMode = ["circular", "ping_pong", "instant"].indexOf(details.movementMode) >= 0 ?
        details.movementMode : "circular";
    this.spawnAtVertices = details.spawnAtVertices === true ||
        details.spawnAtVertices === 1 || details.spawnAtVertices === "1" ||
        String(details.spawnAtVertices).toLowerCase() === "true";
    this.movementPath = (details.movementPath || []).map(function(point) {
        return {x:Number(point.x), y:Number(point.y)};
    });

    this.minx = details.minx;
    this.miny = details.miny;
    this.maxx = details.maxx;
    this.maxy = details.maxy;
    this.polygonScale = details.polygonScale === undefined ? 1 : Number(details.polygonScale);
    this.polygonPoints = details.polygonPoints || [];

    var linePoints = details.linePoints || [];
    var suppliedLineStart = details.lineStart || linePoints[0];
    var suppliedLineEnd = details.lineEnd || linePoints[1];
    var suppliedLineWidth = details.lineWidth;
    if(suppliedLineWidth === undefined) suppliedLineWidth = details.width;
    if(suppliedLineWidth === undefined) suppliedLineWidth = details.thickness;
    suppliedLineWidth = Number(suppliedLineWidth);
    this.lineWidth = isFinite(suppliedLineWidth) && suppliedLineWidth >= 0 ? suppliedLineWidth : 1;
    this.lineStart = suppliedLineStart ? {
        x:Number(suppliedLineStart.x), y:Number(suppliedLineStart.y)
    } : {x:Number(x), y:Number(y)};
    this.lineEnd = suppliedLineEnd ? {
        x:Number(suppliedLineEnd.x), y:Number(suppliedLineEnd.y)
    } : {x:Number(x) + 1, y:Number(y)};

    this.updateLineBounds = function() {
        this.x = (this.lineStart.x + this.lineEnd.x) / 2;
        this.y = (this.lineStart.y + this.lineEnd.y) / 2;
        var lineDx = this.lineEnd.x - this.lineStart.x;
        var lineDy = this.lineEnd.y - this.lineStart.y;
        // Retain a coarse bounding circle for editor code that has not yet
        // adopted shape-specific bounds and hit testing.
        this.radius = Math.sqrt(lineDx * lineDx + lineDy * lineDy +
            this.lineWidth * this.lineWidth) / 2;
    };

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
    } else if(this.shapeType === "line") {
        this.updateLineBounds();
    }

    switch(this.zoneName)
    {
        case "checkpoint":
            this.option = Number(( option !== undefined ) ? option :
                Number($("#dCheckpointOrder").val()));
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
        if(this.shapeType === "line") {
            return [
                {x:this.lineStart.x, y:this.lineStart.y},
                {x:this.lineEnd.x, y:this.lineEnd.y}
            ];
        }
        return [];
    }

    this.getLineFootprintPoints = function() {
        return zone_lineFootprintPoints(this.lineStart, this.lineEnd, this.lineWidth);
    };

    this.getShapeCenter = function() {
        if(this.shapeType === "rectangle") {
            return {x:(Number(this.minx) + Number(this.maxx)) / 2,
                y:(Number(this.miny) + Number(this.maxy)) / 2};
        }
        if(this.shapeType === "line") {
            return {x:(Number(this.lineStart.x) + Number(this.lineEnd.x)) / 2,
                y:(Number(this.lineStart.y) + Number(this.lineEnd.y)) / 2};
        }
        if(this.shapeType !== "polygon") return {x:Number(this.x), y:Number(this.y)};

        var points = this.getMapPoints();
        if(!points.length) return {x:Number(this.x), y:Number(this.y)};
        // Match the runtime's shared zone-icon/checkpoint center exactly:
        // polygon centers are the arithmetic mean of their world vertices.
        // An imported polygon's authored anchor need not equal that mean.
        var total = points.reduce(function(sum, point) {
            sum.x += point.x; sum.y += point.y; return sum;
        }, {x:0, y:0});
        return {x:total.x / points.length, y:total.y / points.length};
    }

    this.getTeleportDirection = function() {
        var xdir = Number(this.options.xdir);
        var ydir = Number(this.options.ydir);
        if(isFinite(xdir) && isFinite(ydir) && (xdir !== 0 || ydir !== 0)) {
            return {x:xdir, y:ydir};
        }
        var angle = Number(this.options.angle);
        if(isFinite(angle)) {
            var radians = angle * Math.PI / 180;
            return {x:Math.cos(radians), y:Math.sin(radians)};
        }
        var cardinalDirections = {
            north:{x:0, y:1}, n:{x:0, y:1}, east:{x:1, y:0}, e:{x:1, y:0},
            south:{x:0, y:-1}, s:{x:0, y:-1}, west:{x:-1, y:0}, w:{x:-1, y:0}
        };
        return cardinalDirections[String(this.options.direction).toLowerCase()] ||
            {x:ZONE_DEFAULT_XDIR, y:ZONE_DEFAULT_YDIR};
    }

    this.setTeleportDirection = function(xdir, ydir) {
        this.options.xdir = xdir;
        this.options.ydir = ydir;
        delete this.options.angle;
        delete this.options.direction;
    }

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.glowObj != null) this.glowObj.remove();
        if(this.destinationObj != null) this.destinationObj.remove();
        if(this.destinationGlowObj != null) this.destinationGlowObj.remove();
        if(this.teleportLinkObj != null) this.teleportLinkObj.remove();
        this.destinationObj = null;
        this.destinationGlowObj = null;
        this.teleportLinkObj = null;
        if(this.movementPathObj != null) this.movementPathObj.remove();
        if(this.checkpointLabelOutlineObj != null) this.checkpointLabelOutlineObj.remove();
        if(this.checkpointLabelObj != null) this.checkpointLabelObj.remove();
        this.checkpointLabelOutlineObj = null;
        this.checkpointLabelObj = null;

        var color = zoneTool_typeArray[this.type] ? zoneTool_typeArray[this.type][1] : "#888888";
        if(this.movementPath.length) {
            this.movementPathObj = vectron_screen.set();
            var movementSegments = [];
            for(var movementIndex = 1; movementIndex < this.movementPath.length; movementIndex++) {
                movementSegments.push([this.movementPath[movementIndex - 1],
                    this.movementPath[movementIndex]]);
            }
            if(this.movementMode === "circular" && this.movementPath.length >= 2) {
                movementSegments.push([this.movementPath[this.movementPath.length - 1],
                    this.movementPath[0]]);
            }
            for(var movementSegmentIndex = 0;
                movementSegmentIndex < movementSegments.length; movementSegmentIndex++) {
                var segment = movementSegments[movementSegmentIndex];
                var segmentStyle = {
                    "stroke":color, "stroke-width":2, "stroke-dasharray":"--..",
                    "stroke-opacity":0.72, "fill":"none", "arrow-end":"classic-wide-long"
                };
                if(this.movementMode === "ping_pong") {
                    segmentStyle["arrow-start"] = "classic-wide-long";
                }
                this.movementPathObj.push(vectron_screen.path([
                    "M", aamap_realX(segment[0].x), aamap_realY(segment[0].y),
                    "L", aamap_realX(segment[1].x), aamap_realY(segment[1].y)
                ]).attr(segmentStyle));
            }
        }
        if(this.shapeType === "circle") {
            this.obj = vectron_screen.circle(aamap_realX(this.x),
                aamap_realY(this.y), this.radius*vectron_zoom);
        } else if(this.shapeType === "line") {
            var lineRenderPoints = this.getLineFootprintPoints();
            var lineRenderPath = [];
            for(var linePointIndex = 0; linePointIndex < lineRenderPoints.length;
                linePointIndex++) {
                lineRenderPath.push(linePointIndex ? "L" : "M",
                    aamap_realX(lineRenderPoints[linePointIndex].x),
                    aamap_realY(lineRenderPoints[linePointIndex].y));
            }
            if(this.lineWidth > 0) lineRenderPath.push("Z");
            this.obj = vectron_screen.path(lineRenderPath);
        } else {
            var points = this.getMapPoints();
            var path = "";
            for(var p = 0; p < points.length; p++) {
                path += (p ? "L" : "M") + aamap_realX(points[p].x) + "," + aamap_realY(points[p].y);
            }
            if(points.length) path += "Z";
            this.obj = vectron_screen.path(path);
        }
        if(this.shapeType === "line") {
            this.obj.attr({
                "stroke":color,
                "stroke-width":1,
                "stroke-linecap":"butt",
                "stroke-linejoin":"miter",
                "stroke-opacity":0.3,
                "fill":this.lineWidth > 0 ? color : "none",
                "fill-opacity":this.lineWidth > 0 ? 0.05 : 0
            });
        } else {
            this.obj.attr({"stroke": color, "fill": color, "fill-opacity": ".05"});
        }
        this.obj.data("id", this.objectID);
        if(this.zoneName === "checkpoint") {
            var checkpointCenter = this.getShapeCenter();
            var checkpointTextX = aamap_realX(checkpointCenter.x);
            var checkpointTextY = aamap_realY(checkpointCenter.y);
            var checkpointText = Number(this.option) === 0 ? "ANY" : String(Number(this.option));
            // Raphael/SVG draws strokes through the glyph itself. A separate
            // outline behind an opaque foreground guarantees that the number
            // stays white and readable on the permanently dark canvas.
            this.checkpointLabelOutlineObj = vectron_screen.text(
                checkpointTextX, checkpointTextY, checkpointText
            ).attr({
                fill:"none", stroke:"#000000", "stroke-width":5,
                "font-size":20, "font-weight":"bold", "stroke-linejoin":"round"
            });
            this.checkpointLabelObj = vectron_screen.text(
                checkpointTextX, checkpointTextY, checkpointText
            ).attr({
                fill:"#ffffff", stroke:"none", "font-size":20, "font-weight":"bold"
            });
            if(this.checkpointLabelOutlineObj.node) {
                this.checkpointLabelOutlineObj.node.style.pointerEvents = "none";
            }
            if(this.checkpointLabelObj.node) {
                this.checkpointLabelObj.node.style.pointerEvents = "none";
            }
        }
        if(this.spawnAtVertices && this.movementPathObj && this.movementPath.length &&
            this.obj && typeof this.obj.clone === "function") {
            var movementAnchor = this.movementPath[0];
            // Show each additional moving copy at its reset-time phase. These
            // are authoring ghosts only; every copy advances along the path.
            for(var vertexIndex = 1; vertexIndex < this.movementPath.length; vertexIndex++) {
                var vertex = this.movementPath[vertexIndex];
                var vertexCopy = this.obj.clone().attr({
                    "stroke-opacity":0.48, "fill-opacity":0.025, "stroke-dasharray":"."
                });
                vertexCopy.transform("t" +
                    (aamap_realX(vertex.x) - aamap_realX(movementAnchor.x)) + "," +
                    (aamap_realY(vertex.y) - aamap_realY(movementAnchor.y)));
                this.movementPathObj.push(vertexCopy);
                if(this.checkpointLabelOutlineObj &&
                    typeof this.checkpointLabelOutlineObj.clone === "function") {
                    var checkpointOutlineCopy = this.checkpointLabelOutlineObj.clone()
                        .attr({opacity:0.72});
                    checkpointOutlineCopy.transform("t" +
                        (aamap_realX(vertex.x) - aamap_realX(movementAnchor.x)) + "," +
                        (aamap_realY(vertex.y) - aamap_realY(movementAnchor.y)));
                    if(checkpointOutlineCopy.node) {
                        checkpointOutlineCopy.node.style.pointerEvents = "none";
                    }
                    this.movementPathObj.push(checkpointOutlineCopy);
                }
                if(this.checkpointLabelObj &&
                    typeof this.checkpointLabelObj.clone === "function") {
                    var checkpointCopy = this.checkpointLabelObj.clone().attr({opacity:0.72});
                    checkpointCopy.transform("t" +
                        (aamap_realX(vertex.x) - aamap_realX(movementAnchor.x)) + "," +
                        (aamap_realY(vertex.y) - aamap_realY(movementAnchor.y)));
                    if(checkpointCopy.node) checkpointCopy.node.style.pointerEvents = "none";
                    this.movementPathObj.push(checkpointCopy);
                }
            }
        }

        if(this.zoneName === "teleport" && isFinite(Number(this.options.destination_x)) &&
            isFinite(Number(this.options.destination_y))) {
            var destinationX = aamap_realX(Number(this.options.destination_x));
            var destinationY = aamap_realY(Number(this.options.destination_y));
            var teleportDirection = this.getTeleportDirection();
            var xdir = teleportDirection.x;
            var ydir = teleportDirection.y;
            var directionLength = Math.sqrt(xdir * xdir + ydir * ydir);
            if(directionLength <= ZONE_DIRECTION_EPSILON || !isFinite(directionLength)) {
                xdir = ZONE_DEFAULT_XDIR; ydir = ZONE_DEFAULT_YDIR;
            } else {
                xdir /= directionLength; ydir /= directionLength;
            }
            if(this.isSelected) {
                var teleportSourceCenter = this.getShapeCenter();
                this.teleportLinkObj = vectron_screen.path([
                    "M", aamap_realX(teleportSourceCenter.x),
                    aamap_realY(teleportSourceCenter.y),
                    "L", destinationX, destinationY
                ]).attr({
                    stroke:color, "stroke-width":2, "stroke-dasharray":"--..",
                    "stroke-opacity":0.8, fill:"none", "arrow-end":"classic-wide-long"
                });
                if(this.teleportLinkObj.node) {
                    this.teleportLinkObj.node.style.pointerEvents = "none";
                }
                if(typeof this.teleportLinkObj.insertBefore === "function") {
                    this.teleportLinkObj.insertBefore(this.obj);
                }
            }
            this.destinationObj = spawnMarker_create(
                destinationX, destinationY, xdir, ydir, color, color);
        }


        if(this.isSelected) {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool == "select") {
            selectTool_addHoverSet(this);
        }
        if(vectron_currentTool == "select" &&
            typeof selectTool_addTeleportDestinationHoverSet === "function") {
            selectTool_addTeleportDestinationHoverSet(this);
        }
    }

    this.scale = function(factor) {
        this.x *= factor;
        this.y *= factor;
        this.radius *= factor;
        this.growth *= factor;
        for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
            this.movementPath[movementIndex].x *= factor;
            this.movementPath[movementIndex].y *= factor;
        }
        if(this.zoneName === "teleport") {
            this.options.destination_x = Number(this.options.destination_x) * factor;
            this.options.destination_y = Number(this.options.destination_y) * factor;
        }
        if(this.shapeType === "rectangle") {
            this.minx *= factor; this.miny *= factor;
            this.maxx *= factor; this.maxy *= factor;
        } else if(this.shapeType === "polygon") {
            this.polygonScale *= factor;
        } else if(this.shapeType === "line") {
            this.lineStart.x *= factor; this.lineStart.y *= factor;
            this.lineEnd.x *= factor; this.lineEnd.y *= factor;
            this.lineWidth *= Math.abs(factor);
            this.updateLineBounds();
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
        for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
            var movementX = this.movementPath[movementIndex].x;
            var movementY = this.movementPath[movementIndex].y;
            this.movementPath[movementIndex].x = movementX * Math.cos(-rad) - movementY * Math.sin(-rad);
            this.movementPath[movementIndex].y = movementX * Math.sin(-rad) + movementY * Math.cos(-rad);
        }
        if(this.zoneName === "teleport") {
            var destinationX = Number(this.options.destination_x);
            var destinationY = Number(this.options.destination_y);
            this.options.destination_x = destinationX * Math.cos(-rad) -
                destinationY * Math.sin(-rad);
            this.options.destination_y = destinationX * Math.sin(-rad) +
                destinationY * Math.cos(-rad);
            var teleportDirection = this.getTeleportDirection();
            this.setTeleportDirection(
                teleportDirection.x * Math.cos(-rad) - teleportDirection.y * Math.sin(-rad),
                teleportDirection.x * Math.sin(-rad) + teleportDirection.y * Math.cos(-rad)
            );
        }
        if(this.shapeType === "polygon") {
            for(var i = 0; i < this.polygonPoints.length; i++) {
                var point = this.polygonPoints[i];
                var px = point.x, py = point.y;
                point.x = px * Math.cos(-rad) - py * Math.sin(-rad);
                point.y = px * Math.sin(-rad) + py * Math.cos(-rad);
            }
        } else if(this.shapeType === "line") {
            var lineCos = Math.cos(-rad), lineSin = Math.sin(-rad);
            var startX = this.lineStart.x, startY = this.lineStart.y;
            var endX = this.lineEnd.x, endY = this.lineEnd.y;
            this.lineStart.x = startX * lineCos - startY * lineSin;
            this.lineStart.y = startX * lineSin + startY * lineCos;
            this.lineEnd.x = endX * lineCos - endY * lineSin;
            this.lineEnd.y = endX * lineSin + endY * lineCos;
            this.updateLineBounds();
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
        for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
            var movementX = this.movementPath[movementIndex].x;
            var movementY = this.movementPath[movementIndex].y;
            this.movementPath[movementIndex].x = dir > 0 ? -movementY : movementY;
            this.movementPath[movementIndex].y = dir > 0 ? movementX : -movementX;
        }
        if(this.zoneName === "teleport") {
            var destinationX = Number(this.options.destination_x);
            var destinationY = Number(this.options.destination_y);
            var teleportDirection = this.getTeleportDirection();
            this.options.destination_x = dir > 0 ? -destinationY : destinationY;
            this.options.destination_y = dir > 0 ? destinationX : -destinationX;
            this.setTeleportDirection(
                dir > 0 ? -teleportDirection.y : teleportDirection.y,
                dir > 0 ? teleportDirection.x : -teleportDirection.x
            );
        }
        if(this.shapeType === "polygon") {
            for(var i = 0; i < this.polygonPoints.length; i++) {
                var px = this.polygonPoints[i].x, py = this.polygonPoints[i].y;
                this.polygonPoints[i].x = dir > 0 ? -py : py;
                this.polygonPoints[i].y = dir > 0 ? px : -px;
            }
        } else if(this.shapeType === "line") {
            var startX = this.lineStart.x, startY = this.lineStart.y;
            var endX = this.lineEnd.x, endY = this.lineEnd.y;
            this.lineStart.x = dir > 0 ? -startY : startY;
            this.lineStart.y = dir > 0 ? startX : -startX;
            this.lineEnd.x = dir > 0 ? -endY : endY;
            this.lineEnd.y = dir > 0 ? endX : -endX;
            this.updateLineBounds();
        }
    }

    this.getPosition = function()
    {
        return [this.x,this.y];
    }

    this.getBounds = function(visibleLevels) {
        var shapeBounds;
        var rotationFootprint = [];
        if(this.shapeType === "circle") {
            var extent = Math.abs(this.radius) + Math.abs(this.growth);
            shapeBounds = {minx:this.x - extent, miny:this.y - extent,
                maxx:this.x + extent, maxy:this.y + extent};
        } else if(this.shapeType === "rectangle") {
            rotationFootprint = this.getMapPoints();
            shapeBounds = {minx:Math.min(this.minx, this.maxx), miny:Math.min(this.miny, this.maxy),
                maxx:Math.max(this.minx, this.maxx), maxy:Math.max(this.miny, this.maxy)};
        } else if(this.shapeType === "line") {
            rotationFootprint = this.getLineFootprintPoints();
            var lineBoundsX = rotationFootprint.map(function(point) { return point.x; });
            var lineBoundsY = rotationFootprint.map(function(point) { return point.y; });
            shapeBounds = {minx:Math.min.apply(Math, lineBoundsX),
                miny:Math.min.apply(Math, lineBoundsY),
                maxx:Math.max.apply(Math, lineBoundsX),
                maxy:Math.max.apply(Math, lineBoundsY)};
        } else {
            var points = this.getMapPoints();
            if(points.length) {
                rotationFootprint = points;
                var xs = points.map(function(point) { return point.x; });
                var ys = points.map(function(point) { return point.y; });
                shapeBounds = {minx:Math.min.apply(Math, xs),
                    miny:Math.min.apply(Math, ys),
                    maxx:Math.max.apply(Math, xs),
                    maxy:Math.max.apply(Math, ys)};
            }
        }

        var sourceLevel = aamap_normalizeLevel(this.level, 0);
        var sourceVisible = !visibleLevels || !!visibleLevels[sourceLevel];
        var bounds = sourceVisible && shapeBounds ? {
            minx:shapeBounds.minx, miny:shapeBounds.miny,
            maxx:shapeBounds.maxx, maxy:shapeBounds.maxy
        } : null;
        var includeBounds = function(candidate) {
            if(!candidate) return;
            if(!bounds) {
                bounds = {minx:candidate.minx, miny:candidate.miny,
                    maxx:candidate.maxx, maxy:candidate.maxy};
                return;
            }
            bounds.minx = Math.min(bounds.minx, candidate.minx);
            bounds.miny = Math.min(bounds.miny, candidate.miny);
            bounds.maxx = Math.max(bounds.maxx, candidate.maxx);
            bounds.maxy = Math.max(bounds.maxy, candidate.maxy);
        };

        if(bounds && this.movementPath.length && sourceVisible) {
            var movementAnchor = this.movementPath[0];
            var validMovementAnchor = movementAnchor && isFinite(movementAnchor.x) &&
                isFinite(movementAnchor.y);
            var rotates = validMovementAnchor && isFinite(Number(this.rotationSpeed)) &&
                Number(this.rotationSpeed) !== 0;
            var rotationRadius = 0;
            if(rotates && this.shapeType === "circle") {
                rotationRadius = Math.hypot(
                    this.x - movementAnchor.x, this.y - movementAnchor.y) + extent;
            } else if(rotates) {
                rotationFootprint.forEach(function(point) {
                    if(!isFinite(point.x) || !isFinite(point.y)) return;
                    rotationRadius = Math.max(rotationRadius, Math.hypot(
                        point.x - movementAnchor.x, point.y - movementAnchor.y));
                });
            }

            for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
                var movementPoint = this.movementPath[movementIndex];
                if(!isFinite(movementPoint.x) || !isFinite(movementPoint.y)) continue;
                // Retain the authored pivot itself even when a polygon's local
                // footprint does not happen to contain that pivot.
                includeBounds({minx:movementPoint.x, miny:movementPoint.y,
                    maxx:movementPoint.x, maxy:movementPoint.y});
                if(!validMovementAnchor) continue;
                if(rotates) {
                    // Rotation is continuous authoritative motion. A circle
                    // around the pivot is conservative for every angle and
                    // phase, although it can overestimate paths that visit only
                    // a subset of possible orientations.
                    includeBounds({minx:movementPoint.x - rotationRadius,
                        miny:movementPoint.y - rotationRadius,
                        maxx:movementPoint.x + rotationRadius,
                        maxy:movementPoint.y + rotationRadius});
                } else {
                    var movementDx = movementPoint.x - movementAnchor.x;
                    var movementDy = movementPoint.y - movementAnchor.y;
                    includeBounds({minx:shapeBounds.minx + movementDx,
                        miny:shapeBounds.miny + movementDy,
                        maxx:shapeBounds.maxx + movementDx,
                        maxy:shapeBounds.maxy + movementDy});
                }
            }
        }

        if(this.zoneName === "teleport") {
            var destinationLevel = aamap_normalizeLevel(
                this.options.destination_level, sourceLevel);
            var destinationX = Number(this.options.destination_x);
            var destinationY = Number(this.options.destination_y);
            if((!visibleLevels || visibleLevels[destinationLevel]) &&
                isFinite(destinationX) && isFinite(destinationY)) {
                // The destination is fixed in world space; source-zone motion
                // and rotation must never transform it as part of the footprint.
                includeBounds({minx:destinationX, miny:destinationY,
                    maxx:destinationX, maxy:destinationY});
            }
        }
        return bounds || null;
    }

    this.move = function(dx, dy) {
        this.x = Math.round((this.x + dx) * 1e6) / 1e6;
        this.y = Math.round((this.y + dy) * 1e6) / 1e6;
        for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
            this.movementPath[movementIndex].x = zone_round(this.movementPath[movementIndex].x + dx);
            this.movementPath[movementIndex].y = zone_round(this.movementPath[movementIndex].y + dy);
        }
        if(this.shapeType === "rectangle") {
            this.minx += dx; this.maxx += dx;
            this.miny += dy; this.maxy += dy;
        } else if(this.shapeType === "line") {
            this.lineStart.x = zone_round(this.lineStart.x + dx);
            this.lineStart.y = zone_round(this.lineStart.y + dy);
            this.lineEnd.x = zone_round(this.lineEnd.x + dx);
            this.lineEnd.y = zone_round(this.lineEnd.y + dy);
            this.updateLineBounds();
        }
        if(this.zoneName === "teleport") {
            var destinationX = Number(this.options.destination_x);
            var destinationY = Number(this.options.destination_y);
            if(isFinite(destinationX) && isFinite(destinationY)) {
                this.options.destination_x = zone_round(destinationX + dx);
                this.options.destination_y = zone_round(destinationY + dy);
            }
        }
    }

    this.getShapeXML = function() {
        if(this.shapeType === "line") {
            return '<ShapeLine width="' + zone_round(this.lineWidth) + '">\n' +
                '  <Point x="' + zone_round(this.lineStart.x) + '" y="' + zone_round(this.lineStart.y) + '"/>\n' +
                '  <Point x="' + zone_round(this.lineEnd.x) + '" y="' + zone_round(this.lineEnd.y) + '"/>\n' +
                '</ShapeLine>';
        }
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
        return '<ShapeCircle radius="' + zone_round(this.radius) + '">\n' +
            '  <Point x="' + zone_round(this.x) + '" y="' + zone_round(this.y) + '"/>' +
            '\n</ShapeCircle>';
    }

    this.getXML = function(includeLevel) {
        var attributes = (includeLevel === false ? '' : ' level="' + this.level + '"') +
            ' type="' + zone_xmlAttr(this.zoneName) + '"';
        if(this.zoneName === "checkpoint") attributes += ' order="' + zone_xmlAttr(this.option) + '"';
        if(this.zoneName === "speed") {
            attributes += ' delta_mps="' + zone_xmlAttr(this.options.delta_mps) +
                '" duration_ticks="' + zone_xmlAttr(this.options.duration_ticks) + '"';
        } else if(this.zoneName === "rubber") {
            attributes += ' delta="' + zone_xmlAttr(this.options.delta) +
                '" duration_ticks="' + zone_xmlAttr(this.options.duration_ticks) + '"';
        } else if(this.zoneName === "health") {
            attributes += ' delta="' + zone_xmlAttr(this.options.delta) + '"';
        } else if(this.zoneName === "setting") {
            attributes += ' setting="' + zone_xmlAttr(this.options.setting) +
                '" value="' + zone_xmlAttr(this.options.value) + '"';
        } else if(this.zoneName === "teleport") {
            attributes += ' destination_x="' + zone_xmlAttr(this.options.destination_x) +
                '" destination_y="' + zone_xmlAttr(this.options.destination_y) + '"';
            if(includeLevel !== false) {
                attributes += ' destination_level="' +
                    aamap_normalizeLevel(this.options.destination_level, this.level) + '"';
            }
            if(this.options.angle !== undefined) {
                attributes += ' angle="' + zone_xmlAttr(this.options.angle) + '"';
            } else if(this.options.direction !== undefined) {
                attributes += ' direction="' + zone_xmlAttr(this.options.direction) + '"';
            } else {
                attributes += ' xdir="' + zone_xmlAttr(this.options.xdir) +
                    '" ydir="' + zone_xmlAttr(this.options.ydir) + '"';
            }
        }
        if(this.trigger) attributes += ' trigger="' + zone_xmlAttr(this.trigger) + '"';
        if(this.activeStartTick !== null && this.activeEndTick !== null &&
            isFinite(this.activeStartTick) && isFinite(this.activeEndTick)) {
            attributes += ' start_tick="' + zone_xmlAttr(this.activeStartTick) +
                '" end_tick="' + zone_xmlAttr(this.activeEndTick) + '"';
        }
        if(this.movementPath.length) {
            attributes += ' movement_speed="' + zone_xmlAttr(zone_round(this.movementSpeed)) +
                '" rotation_speed="' + zone_xmlAttr(zone_round(this.rotationSpeed)) + '"';
        }
        var movementXml = "";
        if(this.movementPath.length) {
            movementXml = '\n  <MovementPath loop="true" mode="' +
                zone_xmlAttr(this.movementMode) + '" spawn_at_vertices="' +
                (this.spawnAtVertices ? 'true' : 'false') + '">';
            for(var movementIndex = 0; movementIndex < this.movementPath.length; movementIndex++) {
                movementXml += '\n    <Point x="' + zone_round(this.movementPath[movementIndex].x) +
                    '" y="' + zone_round(this.movementPath[movementIndex].y) + '"/>';
            }
            movementXml += '\n  </MovementPath>';
        }
        return '<Zone' + attributes + '>\n' +
            this.getShapeXML().split('\n').map(function(line) { return '  ' + line; }).join('\n') +
            movementXml + '\n</Zone>';
    }

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml(this.getXML()));
    }

}
