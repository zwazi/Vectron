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

var aamap_active = true;
var aamap_xml = '';
var aamap_objects = [];

var aamap_grid = null;

function aamap_init() {
    //nthing here
    aamap_render();
}

function aamap_save(name, author, category, version, dtd, axes, settings) {
    var fileName = name + "-" + version + ".aamap.xml";

    function indentLines(str, prefix) {
        return str.split('\n').map(function(line) { return prefix + line; }).join('\n');
    }

    var xml = "";
    xml += '<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>'+"\n";
    xml += '<!DOCTYPE Resource SYSTEM "' + dtd + '">'+"\n";
    xml += '<Resource type="aamap" name="'+ name +'" version="'+ version +'" author="'+ author +'" category="'+ category +'">'+"\n";
    xml += '  <Map version="0.2.8">'+"\n";
    if(settings.length > 0)
    {
        xml += "    <Settings>\n";
        for(var i = 0, ii = settings.length; i < ii; i++)
        {
            var point = settings[i].indexOf(" ");
            var setting = settings[i].slice(0,point), value = settings[i].slice(point+1);
            xml += "      <Setting name=\""+setting+"\" value=\""+value+"\" />\n";
        }
        xml += "    </Settings>\n";
    }
    xml += '    <World>\n';
    xml += '      <Field>\n';
    if($("#map_axes_forced")[0].checked)
    {
        xml += '        <Axes number="'+axes+'"/>'+"\n";
    }
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        xml += indentLines(aamap_objects[i].getXML(), '        ');
        xml += "\n";
    }
    xml += '      </Field>\n';
    xml += '    </World>\n';
    xml += '  </Map>\n';
    xml += '</Resource>\n';
    xml += "<!-- Exported from Vectron 1.1 -->";

    vectron_saveTextAsFile(xml, fileName);
}

function aamap_render() {
    aamap_drawGrid();

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        aamap_objects[i].render();
    }

    if(vectron_currentTool == "wall")
    {
        wallTool_renderCurrent();
    }
    else if( vectron_currentTool == "select" && vectron_toolActive )
    {
        selectTool_progress();
    }
    else if( vectron_currentTool == "wallVertexMove" )
    {
        wallVertexMoveTool_dots = null; // cleared by screen.clear()
        wallVertexMoveTool_drawDots();
    }
}

function aamap_panCenter() {
    var ptsx = [];
    var ptsy = [];

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        var obj = aamap_objects[i];
        if(obj instanceof Zone || obj instanceof Spawn) {
            ptsx.push(obj.x);
            ptsy.push(obj.y);
        } else if(obj instanceof Wall) {
            for(var j = 0, jj = obj.points.length; j < jj; j++) {
                if(obj.points[i] != null) {
                    ptsx.push(obj.points[i].x);
                    ptsy.push(obj.points[i].y);
                }
            }
        }
    }

    if(ptsx.length == 0) ptsx.push(0);
    if(ptsy.length == 0) ptsy.push(0);

    var max_x = Math.max.apply(Math, ptsx);
    var min_x = Math.min.apply(Math, ptsx);
    var max_y = Math.max.apply(Math, ptsy);
    var min_y = Math.min.apply(Math, ptsy);

    vectron_panX = -1*(max_x + min_x)/2;
    vectron_panY = -1*(max_y + min_y)/2;
    vectron_render();
}

function aamap_fitToScreen() {
    var ptsx = [], ptsy = [];

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        var obj = aamap_objects[i];
        if(obj instanceof Zone || obj instanceof Spawn) {
            ptsx.push(obj.x);
            ptsy.push(obj.y);
        } else if(obj instanceof Wall) {
            for(var j = 0, jj = obj.points.length; j < jj; j++) {
                if(obj.points[j] != null) {
                    ptsx.push(obj.points[j].x);
                    ptsy.push(obj.points[j].y);
                }
            }
        }
    }

    if(ptsx.length == 0) {
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
        vectron_render();
        return;
    }

    var max_x = Math.max.apply(Math, ptsx);
    var min_x = Math.min.apply(Math, ptsx);
    var max_y = Math.max.apply(Math, ptsy);
    var min_y = Math.min.apply(Math, ptsy);

    vectron_panX = -1*(max_x + min_x)/2;
    vectron_panY = -1*(max_y + min_y)/2;

    var map_width = max_x - min_x;
    var map_height = max_y - min_y;

    if(map_width > 0 || map_height > 0) {
        var padding = 0.85; // use 85% of the canvas (15% margin around the map)
        vectron_zoom = Math.min(
            map_width > 0 ? (vectron_width * padding) / map_width : Infinity,
            map_height > 0 ? (vectron_height * padding) / map_height : Infinity
        );
    }

    vectron_render();
}

function aamap_scale(factor) {
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        aamap_objects[i].scale(factor);
    }
    vectron_render();
}

function aamap_rotate(rad)
{
    for(var i=aamap_objects.length-1;i>=0;--i)
    {
        aamap_objects[i].rotate(rad);
    }
    vectron_render();
}

function aamap_rotateSimple(dir)
{
    for(var i=aamap_objects.length-1;i>=0;--i)
    {
        aamap_objects[i].rotateSimple(dir);
    }
    vectron_render();
}

var aamap_undoStack = [];
var aamap_redoStack = [];

function aamap_recordAction(action) {
    aamap_undoStack.push(action);
    aamap_redoStack = [];
    actionHistory_update();
}

function aamap_clearHistory() {
    aamap_undoStack = [];
    aamap_redoStack = [];
    actionHistory_update();
}

function _aamap_removeObj(aamapObject) {
    var idx = aamap_objects.indexOf(aamapObject);
    if (idx >= 0) aamap_objects.splice(idx, 1);
    if (aamapObject.obj) aamapObject.obj.remove();
    if (aamapObject.glowObj) { aamapObject.glowObj.remove(); aamapObject.glowObj = null; }
}

function aamap_add(aamapObject) {
    aamap_objects.push(aamapObject);
    aamap_xml += aamapObject.xml;
}

function aamap_remove(aamapObject) {
    var index = aamap_objects.indexOf(aamapObject);
    if(index > -1) {
        gui_writeLog("Match!");
        _aamap_removeObj(aamapObject);
    }
}

function aamap_undo() {
    gui_writeLog("Undo.");
    if (aamap_undoStack.length === 0) { gui_toast("Nothing to undo."); return; }
    var action = aamap_undoStack.pop();
    action.undo();
    aamap_redoStack.push(action);
    actionHistory_update();
}

function aamap_redo() {
    if (aamap_redoStack.length === 0) { gui_toast("Nothing to redo."); return; }
    var action = aamap_redoStack.pop();
    action.redo();
    aamap_undoStack.push(action);
    actionHistory_update();
}

function aamap_activate() {
    aamap_active = true;
}

function aamap_deactivate() {
    aamap_active = false;
}

function aamap_mapX(realX) {
    return (realX - vectron_width/2) / vectron_zoom - vectron_panX;
}

function aamap_mapY(realY) {
    return -1*(realY - vectron_height/2) / vectron_zoom - vectron_panY;
}

function aamap_realX(mapX) {
    return vectron_width/2 + ((mapX + vectron_panX)*vectron_zoom);
}

function aamap_realY(mapY) {
    return vectron_height/2 + (-1*(mapY + vectron_panY)*vectron_zoom);
}

function aamap_drawGrid() {
    if(aamap_grid != null) {
        aamap_grid.remove();
    }

    if(vectron_grid_spacing <= 0) return;

    if(config_autoAdjustGridSpacing)
    {
        while((vectron_zoom*vectron_grid_spacing) > 30)
        {
            vectron_grid_spacing /= 2;
        }
        while((vectron_zoom*vectron_grid_spacing) < 15)
        {
            vectron_grid_spacing *= 2;
        }
    }

    var gridSpacing = vectron_zoom*vectron_grid_spacing;

    var regularArray = [];
    var tenthArray = [];
    var axisXArray = [];
    var axisYArray = [];

    var families = gridLayout_getLineAngles(config_gridLayout);
    var originX = vectron_width/2 + (vectron_zoom * vectron_panX);
    var originY = vectron_height/2 - (vectron_zoom * vectron_panY);
    var corners = [
        [-originX, -originY],
        [vectron_width - originX, -originY],
        [-originX, vectron_height - originY],
        [vectron_width - originX, vectron_height - originY]
    ];
    var drawLength = Math.sqrt(vectron_width * vectron_width + vectron_height * vectron_height) * GRID_LAYOUT_LINE_PADDING;

    function addLine(target, x1, y1, x2, y2) {
        target.push("M", x1, y1, "L", x2, y2);
    }

    function lineCategory(angle, idx) {
        var horizontal = Math.abs(Math.sin(angle)) < GRID_LAYOUT_EPSILON;
        var vertical = Math.abs(Math.cos(angle)) < GRID_LAYOUT_EPSILON;
        if(idx === 0) {
            if(horizontal) return "axisX";
            if(vertical) return "axisY";
        }
        if(idx % 10 === 0) return "tenth";
        return "regular";
    }

    families.forEach(function(angle) {
        var nx = -Math.sin(angle), ny = Math.cos(angle);
        var dx = Math.cos(angle), dy = Math.sin(angle);
        var minProj = Infinity, maxProj = -Infinity;

        for(var c = 0; c < corners.length; c++) {
            var proj = corners[c][0] * nx + corners[c][1] * ny;
            if(proj < minProj) minProj = proj;
            if(proj > maxProj) maxProj = proj;
        }

        var kMin = Math.floor(minProj / gridSpacing) - 1;
        var kMax = Math.ceil(maxProj / gridSpacing) + 1;
        for(var k = kMin; k <= kMax; k++) {
            var offset = k * gridSpacing;
            var centerX = originX + nx * offset;
            var centerY = originY + ny * offset;
            var x1 = centerX - dx * drawLength;
            var y1 = centerY - dy * drawLength;
            var x2 = centerX + dx * drawLength;
            var y2 = centerY + dy * drawLength;
            var category = lineCategory(angle, k);
            if(category === "axisX") addLine(axisXArray, x1, y1, x2, y2);
            else if(category === "axisY") addLine(axisYArray, x1, y1, x2, y2);
            else if(category === "tenth") addLine(tenthArray, x1, y1, x2, y2);
            else addLine(regularArray, x1, y1, x2, y2);
        }
    });

    // Draw regular grid lines — use configurable color/thickness
    var defaultNarrowColor = config_isDark ? '#1a1a1a' : '#d6d6ec';
    var defaultTenthColor  = config_isDark ? '#1a1a1a' : '#d6d6ec'; // default same as narrow
    var narrowColor  = config_gridNarrowColor  || defaultNarrowColor;
    var tenthColor   = config_gridTenthColor   || defaultTenthColor;
    var axisXColor   = config_gridAxisXColor   || '#2244cc';
    var axisYColor   = config_gridAxisYColor   || '#cc2222';

    var narrowStroke  = config_gridNarrowThickness  > 0 ? config_gridNarrowThickness  : 1;
    var tenthStroke   = config_gridTenthThickness   > 0 ? config_gridTenthThickness   : 0.5;
    var axisXStroke   = config_gridAxisXThickness   > 0 ? config_gridAxisXThickness   : 1;
    var axisYStroke   = config_gridAxisYThickness   > 0 ? config_gridAxisYThickness   : 1;

    aamap_grid = vectron_screen.set();

    if(regularArray.length > 0) {
        var reg = vectron_screen.path(regularArray)
            .attr({stroke: narrowColor, "stroke-width": narrowStroke});
        reg.node.style.shapeRendering = "crispedges";
        aamap_grid.push(reg);
    }

    if(tenthArray.length > 0) {
        var tenth = vectron_screen.path(tenthArray)
            .attr({stroke: tenthColor, "stroke-width": tenthStroke});
        tenth.node.style.shapeRendering = "crispedges";
        aamap_grid.push(tenth);
    }

    // Draw Y-axis (x=0) — vertical line
    if(axisYArray.length > 0) {
        var axY = vectron_screen.path(axisYArray)
            .attr({stroke: axisYColor, "stroke-width": axisYStroke});
        axY.node.style.shapeRendering = "crispedges";
        aamap_grid.push(axY);
    }

    // Draw X-axis (y=0) — horizontal line
    if(axisXArray.length > 0) {
        var axX = vectron_screen.path(axisXArray)
            .attr({stroke: axisXColor, "stroke-width": axisXStroke});
        axX.node.style.shapeRendering = "crispedges";
        aamap_grid.push(axX);
    }
}

var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;',
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}
