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

var zoneTool_typeArray = {
    undefined: ["null", "#888888"],
    0: ["death", "#ff0000"],
    1: ["win", "#00a800"],
    2: ["target", "#00ff00"],
    3: ["rubber", "#ffc12b"],
    4: ["fortress", "#62bef6"]
}

var zoneTool_whatType = {
    "death":0,
    "win":1,
    "target":2,
    "rubber":3,
    "fortress":4
}

var zoneTool_radius = 1;
var zoneTool_guideObj = null;
var zoneTool_type = 0;

var zoneTool_placingSize = false;
var zoneTool_centerRealX = 0;
var zoneTool_centerRealY = 0;
var zoneTool_centerMapX = 0;
var zoneTool_centerMapY = 0;

var ZONE_TOOL_CENTER_MARKER_RADIUS = 4;

function zoneTool_removeGuide() {
    if(zoneTool_guideObj != null) {
        zoneTool_guideObj.remove();
        zoneTool_guideObj = null;
    }
}

function zoneTool_connect() {
    $(".toolbar-toolZone").addClass("toolbar-tool-active");
    zoneTool_radius = vectron_grid_spacing;
    zoneTool_updateRubberBar();
}

function zoneTool_disconnect() {
    zoneTool_removeGuide();
    zoneTool_placingSize = false;
    vectron_toolActive = false;
    $(".toolbar-toolZone").removeClass("toolbar-tool-active");
    $("#rubber-zone-bar").hide();
    $("body").removeClass("rubber-zone-active");
}

function zoneTool_updateRubberBar() {
    if(zoneTool_type === 3) {
        $("#rubber-zone-bar").css("display", "flex");
        $("body").addClass("rubber-zone-active");
    } else {
        $("#rubber-zone-bar").hide();
        $("body").removeClass("rubber-zone-active");
    }
    vectron_render();
}

function zoneTool_guide() {
    zoneTool_removeGuide();

    var color = zoneTool_typeArray[zoneTool_type][1];

    if (zoneTool_placingSize) {
        var dx = cursor_realX - zoneTool_centerRealX;
        var dy = cursor_realY - zoneTool_centerRealY;
        var screenRadius = Math.sqrt(dx * dx + dy * dy);
        zoneTool_guideObj = vectron_screen.circle(
            zoneTool_centerRealX, zoneTool_centerRealY, screenRadius
        ).attr({
            "stroke": color, "stroke-dasharray": "--..",
            "fill": color, "fill-opacity": "0.2"
        });
    } else {
        zoneTool_guideObj = vectron_screen.circle(
            cursor_realX, cursor_realY, ZONE_TOOL_CENTER_MARKER_RADIUS
        ).attr({"stroke": color, "fill": color, "fill-opacity": "0.5"});
    }
}


function zoneTool_complete() {
    if (!zoneTool_placingSize) {
        zoneTool_centerRealX = cursor_realX;
        zoneTool_centerRealY = cursor_realY;
        zoneTool_centerMapX = aamap_mapX(cursor_realX);
        zoneTool_centerMapY = aamap_mapY(cursor_realY);
        zoneTool_placingSize = true;
        vectron_toolActive = true;
        zoneTool_guide();
        return;
    }

    var dx = cursor_realX - zoneTool_centerRealX;
    var dy = cursor_realY - zoneTool_centerRealY;
    var screenRadius = Math.sqrt(dx * dx + dy * dy);
    var radius = screenRadius / vectron_zoom;

    if (radius <= 0) {
        gui_writeLog("Zone radius must be greater than 0.");
        return;
    }

    var newX = zoneTool_centerMapX;
    var newY = zoneTool_centerMapY;

    var prevObjs = aamap_objects;
    for(var i = 0; i < prevObjs.length; i++) {
        if(prevObjs[i] instanceof Zone) {
            if(prevObjs[i].x == newX && prevObjs[i].y == newY &&
                prevObjs[i].radius == radius) {

                gui_writeLog("Prevented Duplicate Zone anytype.<br>" +
                    "Check settings to disable this feature.");
                return;
            }
        }
    }

    aamap_add(new Zone(newX, newY, radius, 0, zoneTool_type));
    zoneTool_removeGuide();
    zoneTool_placingSize = false;
    vectron_toolActive = false;
    vectron_render();
}
