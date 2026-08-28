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

function zone_number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
}

function zone_round(value) {
    var rounded = Math.round(Number(value) * 1e6) / 1e6;
    return rounded === 0 ? 0 : rounded;
}

function zone_copyData(data) {
    var copy = {};
    if(data && typeof data === "object") {
        Object.keys(data).forEach(function(key) { copy[key] = data[key]; });
    }
    return copy;
}

function Zone(x, y, radius, growth, type, option) {
    if(isNaN(type) && !zone_warning)
    {
        if(typeof gui_toast === "function") {
            gui_toast("An unsupported zone was imported. Its special data cannot be edited safely.");
        } else {
            gui_writeLog("An unsupported zone was imported. Its special data cannot be edited safely.");
        }
        zone_warning = true;
    }

    this.objectID = vectron_objectID;
    vectron_objectID++;

    this.obj = vectron_screen.circle(0, 0, 0);
    this.obj.data("id", this.objectID);

    this.isSelected = false;
    this.glowObj = null;
    this.detailObj = null;

    this.x = x;
    this.y = y;
    this.radius = radius;
    this.growth = growth;

    this.type = type;
    
    var typeDefinition = zoneTool_typeArray[this.type] || zoneTool_typeArray[undefined];
    switch(typeDefinition[0])
    {
        case "rubber":
            this.option = ( option !== undefined )?option:parseFloat($("#dRubberVal").val());
            break;
        case "checkpoint":
            var checkpointData = option && typeof option === "object" ? option : {
                checkpointId:( option !== undefined ) ? option : $("#dCheckpointOrder").val()
            };
            this.zoneData = {
                checkpointId:zone_number(checkpointData.checkpointId, 1),
                legacyTime:checkpointData.legacyTime === undefined ? "0" : String(checkpointData.legacyTime)
            };
            this.option = this.zoneData.checkpointId;
            break;
        case "teleport":
            var teleportData = option && typeof option === "object" ? option : {};
            var mode = String(teleportData.mode || teleportData.modes || "abs").toLowerCase();
            if(["abs", "rel", "cycle"].indexOf(mode) < 0) mode = "abs";
            this.zoneData = {
                mode:mode,
                destX:zone_number(teleportData.destX, this.x),
                destY:zone_number(teleportData.destY, this.y),
                dirX:zone_number(teleportData.dirX, 0),
                dirY:zone_number(teleportData.dirY, 0),
                // Absolute destinations are exact coordinates; exit
                // compensation only has meaning for relative destinations.
                reloc:mode === "abs" ? 0 : zone_number(teleportData.reloc, 1)
            };
            this.option = this.zoneData;
            break;
        default:
            this.option = ( option !== undefined )?option:0;
            break;
    }

    this.xml = 'Zone';

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.glowObj != null) this.glowObj.remove();
        if(this.detailObj != null) this.detailObj.remove();
        
        this.obj = vectron_screen.circle(aamap_realX(this.x),
            aamap_realY(this.y),
            this.radius*vectron_zoom).attr(
                {"stroke": zoneTool_typeArray[this.type][1], "fill": zoneTool_typeArray[this.type][1], "fill-opacity": ".05"}
        );
        this.obj.data("id", this.objectID);

        this.detailObj = vectron_screen.set();
        var zoneKind = (zoneTool_typeArray[this.type] || zoneTool_typeArray[undefined])[0];
        if(zoneKind === "checkpoint") {
            var label = vectron_screen.text(
                aamap_realX(this.x), aamap_realY(this.y),
                "CP " + this.zoneData.checkpointId
            ).attr({"fill":zoneTool_typeArray[this.type][1], "font-size":11, "font-weight":"bold"});
            this.detailObj.push(label);
        } else if(zoneKind === "teleport") {
            var destination = this.teleportDestination();
            var fromX = aamap_realX(this.x), fromY = aamap_realY(this.y);
            var toX = aamap_realX(destination.x), toY = aamap_realY(destination.y);
            this.detailObj.push(vectron_screen.path([
                "M", fromX, fromY, "L", toX, toY
            ]).attr({"stroke":zoneTool_typeArray[this.type][1], "stroke-width":1.5,
                "stroke-dasharray":"--", "stroke-opacity":0.8, "arrow-end":"classic-wide-long"}));
            this.detailObj.push(vectron_screen.circle(toX, toY, 5).attr({
                "stroke":zoneTool_typeArray[this.type][1], "stroke-width":2,
                "fill":zoneTool_typeArray[this.type][1], "fill-opacity":0.2
            }));
            var dirX = Number(this.zoneData.dirX), dirY = Number(this.zoneData.dirY);
            var dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
            if(dirLength > 1e-9) {
                var directionScale = 18 / Math.max(vectron_zoom, 1e-9);
                var directionEndX = destination.x + dirX / dirLength * directionScale;
                var directionEndY = destination.y + dirY / dirLength * directionScale;
                this.detailObj.push(vectron_screen.path([
                    "M", toX, toY,
                    "L", aamap_realX(directionEndX), aamap_realY(directionEndY)
                ]).attr({"stroke":zoneTool_typeArray[this.type][1], "stroke-width":2,
                    "arrow-end":"classic-wide-long"}));
            }
            if(this.zoneData.mode === "cycle") {
                this.detailObj.push(vectron_screen.text(toX, toY - 12, "cycle-relative").attr({
                    "fill":zoneTool_typeArray[this.type][1], "font-size":9
                }));
            }
        }
        if(this.detailObj && this.detailObj.items) {
            this.detailObj.items.forEach(function(item) {
                if(item && item.node) item.node.style.pointerEvents = "none";
            });
        }


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
        if((zoneTool_typeArray[this.type] || [])[0] === "teleport") {
            this.zoneData.destX *= factor;
            this.zoneData.destY *= factor;
        }
    }

    this.rotate = function(rad)
    {
        var dist = Math.sqrt(Math.pow(this.x,2)+Math.pow(this.y,2));
        var newrad = Math.atan2(this.y,this.x)-rad;
        this.x = dist*Math.cos(newrad);
        this.y = dist*Math.sin(newrad);
        if((zoneTool_typeArray[this.type] || [])[0] === "teleport") {
            function rotatePair(x, y) {
                var pairDist = Math.sqrt(x*x+y*y);
                var pairRad = Math.atan2(y,x)-rad;
                return [pairDist*Math.cos(pairRad), pairDist*Math.sin(pairRad)];
            }
            if(this.zoneData.mode !== "cycle") {
                var destination = rotatePair(this.zoneData.destX, this.zoneData.destY);
                this.zoneData.destX = destination[0];
                this.zoneData.destY = destination[1];
            }
            if(this.zoneData.dirX !== 0 || this.zoneData.dirY !== 0) {
                var direction = rotatePair(this.zoneData.dirX, this.zoneData.dirY);
                this.zoneData.dirX = direction[0];
                this.zoneData.dirY = direction[1];
            }
        }
    }

    this.rotateSimple = function(dir)
    {
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
        if((zoneTool_typeArray[this.type] || [])[0] === "teleport") {
            function rotateSimplePair(xValue, yValue) {
                return dir > 0 ? [-yValue, xValue] : [yValue, -xValue];
            }
            if(this.zoneData.mode !== "cycle") {
                var destination = rotateSimplePair(this.zoneData.destX, this.zoneData.destY);
                this.zoneData.destX = destination[0];
                this.zoneData.destY = destination[1];
            }
            if(this.zoneData.dirX !== 0 || this.zoneData.dirY !== 0) {
                var direction = rotateSimplePair(this.zoneData.dirX, this.zoneData.dirY);
                this.zoneData.dirX = direction[0];
                this.zoneData.dirY = direction[1];
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
        if((zoneTool_typeArray[this.type] || [])[0] === "teleport" && this.zoneData.mode === "abs") {
            this.zoneData.destX = Math.round((this.zoneData.destX + dx) * 1e6) / 1e6;
            this.zoneData.destY = Math.round((this.zoneData.destY + dy) * 1e6) / 1e6;
        }
    }

    this.teleportDestination = function() {
        if(!this.zoneData) return {x:this.x, y:this.y};
        if(this.zoneData.mode === "abs") {
            return {x:this.zoneData.destX, y:this.zoneData.destY};
        }
        return {x:this.x + this.zoneData.destX, y:this.y + this.zoneData.destY};
    }

    this.copyZoneData = function() {
        if((zoneTool_typeArray[this.type] || [])[0] === "checkpoint") {
            return zone_copyData(this.zoneData);
        }
        if((zoneTool_typeArray[this.type] || [])[0] === "teleport") {
            return zone_copyData(this.zoneData);
        }
        return this.option;
    }

    this.getSpecial = function(x)
    {
        switch(zoneTool_typeArray[this.type][0])
        {
            case "rubber":
                if( x == 0 ) return " rubberVal=\""+this.option+"\"";
                break;
        }
        
        return "";
    }

    this.getShapeSpecial = function()
    {
        if(zoneTool_typeArray[this.type][0] === "checkpoint") {
            return '\n    <Checkpoint id="' + zone_round(this.zoneData.checkpointId) +
                '" time="' + this.zoneData.legacyTime + '"/>';
        }
        if(zoneTool_typeArray[this.type][0] === "teleport") {
            return '\n    <Teleport destX="' + zone_round(this.zoneData.destX) +
                '" destY="' + zone_round(this.zoneData.destY) +
                '" dirX="' + zone_round(this.zoneData.dirX) +
                '" dirY="' + zone_round(this.zoneData.dirY) +
                '" modes="' + this.zoneData.mode +
                '" reloc="' + zone_round(this.zoneData.mode === "abs" ? 0 : this.zoneData.reloc) + '"/>';
        }
        return "";
    }

    this.getXML = function() {
        return '<Zone effect="' + zoneTool_typeArray[this.type][0] +'"'+this.getSpecial(0)+'>\n' +
               '  <ShapeCircle radius=" '+ zone_round(this.radius) +' " growth="'+zone_round(this.growth)+'">\n' +
               '    <Point x="' + zone_round(this.x) + '" y="' + zone_round(this.y) + '"/>' + this.getShapeSpecial() + '\n' +
               '  </ShapeCircle>\n' +
               '</Zone>';
    }

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml(this.getXML()));
    }

} 
