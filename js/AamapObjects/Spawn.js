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

var SPAWN_MARKER_SIZE = 16;

function spawnMarker_cursorPosition() {
    return {
        x:Math.round(100 * aamap_mapX(cursor_realX)) / 100,
        y:Math.round(100 * aamap_mapY(cursor_realY)) / 100
    };
}

function spawnMarker_directionFromCursor(x, y, fallbackX, fallbackY) {
    var targetX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
    var targetY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
    var diffX = aamap_mapX(targetX) - x;
    var diffY = aamap_mapY(targetY) - y;
    var dist = Math.sqrt(diffX * diffX + diffY * diffY);

    if(dist <= 1e-9) {
        return {x:fallbackX === undefined ? 1 : fallbackX,
            y:fallbackY === undefined ? 0 : fallbackY};
    }
    return {x:diffX / dist, y:diffY / dist};
}

function spawnMarker_toDegrees(xdir, ydir) {
    // Raphael rotates clockwise while atan2 uses counter-clockwise angles.
    var degrees = -Math.atan2(ydir, xdir) / Math.PI * 180;
    // Screen/map conversion can leave a cardinal direction a few floating-
    // point ulps away from an integer degree (for example -90.00000000000004).
    // Canonicalize only that numerical noise so spawn and teleport markers
    // receive deterministic Raphael transforms without quantizing real
    // authored angles.
    var nearestDegree = Math.round(degrees);
    return Math.abs(degrees - nearestDegree) <= 1e-9 ? nearestDegree : degrees;
}

function spawnMarker_path(x, y, scale) {
    return [
        "M", x, y,
        "L", x - scale / 2, y,
             x + scale / 2, y,
        "M", x + scale / 2, y,
        "L", x, y - scale / 3,
        "M", x + scale / 2, y,
        "L", x, y + scale / 3
    ];
}

function spawnMarker_create(x, y, xdir, ydir, stroke, fill) {
    return vectron_screen.path(spawnMarker_path(x, y, SPAWN_MARKER_SIZE))
        .attr({stroke:stroke, fill:fill === undefined ? stroke : fill})
        .transform("R" + spawnMarker_toDegrees(xdir, ydir));
}

function Spawn() {

    this.objectID = vectron_objectID;
    vectron_objectID++;

    this.obj = aamap_isBulkLoading() ? null : vectron_screen.path();
    if(this.obj) this.obj.data("id", this.objectID);

    this.guideObj = aamap_isBulkLoading() ? null : vectron_screen.path();

    this.isSelected = false;
    this.glowObj = null;
    this.level = typeof aamap_activeLevel === "number" ? aamap_activeLevel : 0;

    var cursorPosition = spawnMarker_cursorPosition();
    this.x = cursorPosition.x;
    this.y = cursorPosition.y;
    this.xDir = 1;
    this.yDir = 0;

    this.spawnPathArray = [];

    this.xml = 'Spawn';

    this.toDegrees = function() {
        return spawnMarker_toDegrees(this.xDir, this.yDir);
    }

    this.guideUpdate = function() {
        var direction = spawnMarker_directionFromCursor(
            this.x, this.y, this.xDir, this.yDir);
        this.xDir = direction.x;
        this.yDir = direction.y;
    }

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.guideObj != null) this.guideObj.remove();
        if(this.glowObj != null) this.glowObj.remove();

        var x = aamap_realX(this.x);
        var y = aamap_realY(this.y);
        this.obj = spawnMarker_create(
            x, y, this.xDir, this.yDir, "#FF8ABE", "#FF8ABE");

        // override translate function to adjust for rotation
        {
            var self = this;
            this.obj.__translate = this.obj.translate;
            this.obj.translate = function(x,y)
            {
                var dist = Math.hypot(y,x);
                var dir = Math.atan2(self.yDir,self.xDir)-Math.atan2(-y,x);
                this.__translate(dist*Math.cos(dir),dist*Math.sin(dir));
            };
        }

        if(this.isSelected) {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool == "select") {
            selectTool_addHoverSet(this);
        }
    }

    this.guide = function() {
        if(this.guideObj != null) this.guideObj.remove();
        this.guideUpdate();
        var x = aamap_realX(this.x);
        var y = aamap_realY(this.y);
        this.guideObj = spawnMarker_create(
            x, y, this.xDir, this.yDir, "#FF3333", "#FF8ABE");
    }

    if(!aamap_isBulkLoading()) this.guide();

    this.scale = function(factor) {
        this.x *= factor;
        this.y *= factor;
    }

    this.rotate = function(rad)
    {
        var dist = Math.sqrt(Math.pow(this.x,2)+Math.pow(this.y,2));
        var newrad = Math.atan2(this.y,this.x)-rad;
        this.x = dist*Math.cos(newrad);
        this.y = dist*Math.sin(newrad);

        newrad = Math.atan2(this.yDir,this.xDir)-rad;
        this.xDir = Math.cos(newrad);
        this.yDir = Math.sin(newrad);
    }

    this.rotateSimple = function(dir)
    {
        var x = this.x, y = this.y;
        var xdir = this.xDir, ydir = this.yDir;
        if(dir > 0)
        {
            this.x = -y; this.y = x;
            this.xDir = -ydir; this.yDir = xdir;
        }
        else
        {
            this.x = y; this.y = -x;
            this.xDir = ydir; this.yDir = -xdir;
        }
    }

    this.getPosition = function()
    {
        return [this.x,this.y];
    }

    this.getBounds = function() {
        return {minx:this.x, miny:this.y, maxx:this.x, maxy:this.y};
    }

    this.move = function(dx, dy) {
        this.x = Math.round((this.x + dx) * 1e6) / 1e6;
        this.y = Math.round((this.y + dy) * 1e6) / 1e6;
    }

    this.getXML = function(includeLevel) {
        var levelAttribute = includeLevel === false ? '' : ' level="' + this.level + '"';
        return '<Spawn' + levelAttribute + ' x="'+ (Math.round(this.x * 1e6)/1e6) +'" y="'+ (Math.round(this.y * 1e6)/1e6) +'" xdir="'+ (Math.round(this.xDir * 1e6)/1e6) +'" ydir="'+ (Math.round(this.yDir * 1e6)/1e6) +'"/>';
    }

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml('<Spawn x="'+ this.x +'" y="'+ this.y +'" xdir="'+ this.xDir +'" ydir="'+ this.yDir +'"/>'));
    }


}  
