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

function Wall() {

    this.objectID = vectron_objectID;
    vectron_objectID++;

    this.obj = aamap_isBulkLoading() ? null : vectron_screen.path();
    if(this.obj) this.obj.data("id", this.objectID);

    this.guideObj = aamap_isBulkLoading() ? null : vectron_screen.path();

    this.isSelected = false;
    this.glowObj = null;
    this.level = typeof aamap_activeLevel === "number" ? aamap_activeLevel : 0;

    this.points = [];
    this.pathArray = [];

    this.height = 4;
    // null is the editor default: flat walls write a height, while sloped
    // walls keep the established point-height-only representation. Imported
    // walls use true/false to preserve exact attribute authorship.
    this.heightAuthored = null;
    // Flat walls store one height on <Wall>. Sloped walls store an explicit
    // height on every <Point>, allowing the top edge to interpolate naturally
    // along each segment.
    this.slopedHeight = false;

    this.xml = 'Wall';

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.glowObj != null) this.glowObj.remove();
        
        this.pathArray = [];
        for(var i = 0; i < this.points.length; i++) {
            if(i == 0) {
                this.pathArray = this.pathArray.concat(
                    [
                     'M',
                     aamap_realX(this.points[0].x),
                     aamap_realY(this.points[0].y)
                    ]
                );
            } else {
                this.pathArray = this.pathArray.concat(
                    [
                     'L',
                     aamap_realX(this.points[i].x),
                     aamap_realY(this.points[i].y)
                    ]
                );
            }
        } 
        this.obj = vectron_screen.path(this.pathArray).attr({stroke: "#333"});
        if(config_isDark) this.obj.attr({stroke: "#fff"});

        if(this.isSelected) {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool == "select") {
            selectTool_addHoverSet(this);
        }
    }

    this.guide = function() {
        this.guideObj.remove();
        if(!this.points.length) return;
        var guideArray = []
        guideArray = guideArray.concat(
            [
             'M',
             aamap_realX(this.points[this.points.length-1].x),
             aamap_realY(this.points[this.points.length-1].y)
            ]
        );
        guideArray = guideArray.concat(
            [
             'L',
             cursor_realX,
             cursor_realY
            ]
        );
        var cursorPoint = {
            x:aamap_mapX(cursor_realX),
            y:aamap_mapY(cursor_realY)
        };
        var style = typeof wallTool_getActiveSegmentStyle === "function" ?
            wallTool_getActiveSegmentStyle(this.points[this.points.length - 1], cursorPoint) :
            {stroke:"#aaa"};
        this.guideObj = vectron_screen.path(guideArray).attr(style);
    }

    this.scale = function(factor) {
        for(var i = 0, ii = this.points.length; i < ii; i++) {
            this.points[i].x *= factor;
            this.points[i].y *= factor;
        }
    }

    this.rotate = function(rad)
    {
        for(var i = 0, ii = this.points.length; i < ii; i++)
        {
            var dist = Math.sqrt(Math.pow((this.points[i].x),2)+Math.pow((this.points[i].y),2));
            var newrad = Math.atan2(this.points[i].y,this.points[i].x)-rad;
            this.points[i].x = dist*Math.cos(newrad);
            this.points[i].y = dist*Math.sin(newrad);
        }
    }

    this.rotateSimple = function(dir)
    {
        for(var i = 0, ii = this.points.length; i < ii; i++)
        {
            var x = this.points[i].x, y = this.points[i].y;
            if(dir > 0)
            {
                this.points[i].x = -y;
                this.points[i].y = x;
            }
            else
            {
                this.points[i].x = y;
                this.points[i].y = -x;
            }
        }
    }

    this.getPosition = function()
    {
        var x=0,y=0;
        for(var i=this.points.length-1;i>=0;--i) {
            x += this.points[i].x;
            y += this.points[i].y;
        }
        return [(x/this.points.length),(y/this.points.length)];
    }

    this.getBounds = function() {
        if(!this.points.length) return null;
        var xs = this.points.map(function(point) { return point.x; });
        var ys = this.points.map(function(point) { return point.y; });
        return {
            minx:Math.min.apply(Math, xs), miny:Math.min.apply(Math, ys),
            maxx:Math.max.apply(Math, xs), maxy:Math.max.apply(Math, ys)
        };
    }

    this.move = function(dx, dy) {
        for(var i = 0, ii = this.points.length; i < ii; i++) {
            this.points[i].x = Math.round((this.points[i].x + dx) * 1e6) / 1e6;
            this.points[i].y = Math.round((this.points[i].y + dy) * 1e6) / 1e6;
        }
    }

    this.getXML = function(includeLevel) {
        var levelAttribute = includeLevel === false ? '' : ' level="' + this.level + '"';
        var wallHeight = wall_normalizeHeight(this.height, 4);
        var writeWallHeight = this.heightAuthored === true ||
            (this.heightAuthored === null && !this.slopedHeight);
        var xml = '<Wall' + levelAttribute +
            (writeWallHeight ? ' height="' + wallHeight + '"' : '') + '>\n';
        for(var i = 0, ii = this.points.length; i < ii; i++) {
            var explicitPointHeight = Number(this.points[i].height);
            var pointHeight = this.slopedHeight && isFinite(explicitPointHeight) &&
                explicitPointHeight >= 0 ?
                ' height="' + wall_normalizeHeight(explicitPointHeight, wallHeight) + '"' : '';
            xml += '  <Point x="' + (Math.round(this.points[i].x * 1e6) / 1e6) + '" y="'+ (Math.round(this.points[i].y * 1e6) / 1e6) + '"' + pointHeight + '/>\n';
        }
        xml += '</Wall>';
        return xml;
    }

    this.outputFriendlyXML = function() {
        var writeWallHeight = this.heightAuthored === true ||
            (this.heightAuthored === null && !this.slopedHeight);
        gui_writeLog(escapeHtml('<Wall' + (writeWallHeight ?
            ' height="'+this.height+'"' : '') + '>'));
        for(var i = 0, ii = this.points.length; i < ii; i++) {
            var explicitPointHeight = Number(this.points[i].height);
            var pointHeight = this.slopedHeight && isFinite(explicitPointHeight) &&
                explicitPointHeight >= 0 ?
                ' height="' + wall_normalizeHeight(explicitPointHeight, this.height) + '"' : '';
            gui_writeLog('&nbsp;&nbsp;' + escapeHtml('<Point x="' + this.points[i].x + '" y="'+ this.points[i].y + '"' + pointHeight + '/>'));
        }
        gui_writeLog(escapeHtml('</Wall>'));
    }

}

function wall_normalizeHeight(value, fallback) {
    value = Number(value);
    fallback = Number(fallback);
    if(!isFinite(fallback) || fallback < 0) fallback = 4;
    return isFinite(value) && value >= 0 ? Math.round(value * 1e6) / 1e6 : fallback;
}

