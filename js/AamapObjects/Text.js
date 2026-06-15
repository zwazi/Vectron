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

function Text(x, y, text, width, height, fontSize, fontWeight) {
    this.objectID = vectron_objectID;
    vectron_objectID++;

    this.obj = vectron_screen.rect(0, 0, 0, 0);
    this.obj.data("id", this.objectID);
    this.textObj = vectron_screen.text(0, 0, "");

    this.isSelected = false;
    this.glowObj = null;

    this.x = x;
    this.y = y;
    this.width = Math.max(0.01, width || 1);
    this.height = Math.max(0.01, height || 1);
    this.fontSize = Math.max(0.5, fontSize || Math.min(this.width, this.height) * 0.7);
    this.fontWeight = fontWeight || "bold";
    this.text = text || "";
    this.fill = config_isDark ? "#f4f4f4" : "#111111";
    this.stroke = config_isDark ? "#aaaaaa" : "#666666";
    this.xml = 'Text';

    this.setText = function(value) {
        this.text = value || "";
    };

    this.render = function() {
        if(this.obj != null) this.obj.remove();
        if(this.textObj != null) this.textObj.remove();
        if(this.glowObj != null) this.glowObj.remove();

        this.fill = config_isDark ? "#f4f4f4" : "#111111";
        this.stroke = config_isDark ? "#aaaaaa" : "#666666";
        var x = aamap_realX(this.x - this.width / 2);
        var y = aamap_realY(this.y + this.height / 2);
        var w = Math.max(1, this.width * vectron_zoom);
        var h = Math.max(1, this.height * vectron_zoom);
        var fontSize = Math.max(6, this.fontSize * vectron_zoom);

        this.obj = vectron_screen.rect(x, y, w, h).attr({
            stroke: this.stroke,
            "stroke-width": 1,
            "stroke-dasharray": "-",
            fill: config_isDark ? "#000000" : "#ffffff",
            "fill-opacity": 0.06
        });

        this.textObj = vectron_screen.text(aamap_realX(this.x), aamap_realY(this.y), this.text)
            .attr({
                fill: this.fill,
                "font-size": fontSize,
                "font-family": "Arial, Helvetica, sans-serif",
                "font-weight": this.fontWeight,
                "text-anchor": "middle"
            });
        if(this.textObj.node) {
            this.textObj.node.style.pointerEvents = "none";
        }

        var self = this;
        this.obj.__translate = this.obj.translate;
        this.obj.translate = function(dx, dy) {
            this.__translate(dx, dy);
            self.textObj.translate(dx, dy);
        };

        if(this.isSelected) {
            selectTool_addHoverSetSelected(this);
        } else if(vectron_currentTool == "select") {
            selectTool_addHoverSet(this);
        }
    };

    this.scale = function(factor) {
        this.x *= factor;
        this.y *= factor;
        this.width *= factor;
        this.height *= factor;
        this.fontSize *= factor;
    };

    this.rotate = function(rad) {
        var dist = Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
        var newrad = Math.atan2(this.y, this.x) - rad;
        this.x = dist * Math.cos(newrad);
        this.y = dist * Math.sin(newrad);
    };

    this.rotateSimple = function(dir) {
        var x = this.x, y = this.y;
        if(dir > 0) {
            this.x = -y;
            this.y = x;
        } else {
            this.x = y;
            this.y = -x;
        }
    };

    this.getPosition = function() {
        return [this.x, this.y];
    };

    this.move = function(dx, dy) {
        this.x = Math.round((this.x + dx) * 1e6) / 1e6;
        this.y = Math.round((this.y + dy) * 1e6) / 1e6;
    };

    this.getXML = function() {
        return '<Text x="' + (Math.round(this.x * 1e6) / 1e6) + '" y="' + (Math.round(this.y * 1e6) / 1e6) + '" width="' + (Math.round(this.width * 1e6) / 1e6) + '" height="' + (Math.round(this.height * 1e6) / 1e6) + '" size="' + (Math.round(this.fontSize * 1e6) / 1e6) + '" weight="' + escapeHtml(this.fontWeight) + '">' + escapeHtml(this.text) + '</Text>';
    };

    this.outputFriendlyXML = function() {
        gui_writeLog(escapeHtml(this.getXML()));
    };
}
