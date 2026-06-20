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

Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

var selectTool_mapX = null;
var selectTool_mapY = null;

var selectTool_realX = null;
var selectTool_realY = null;

var selectTool_endX = null;
var selectTool_endY = null;

var selectTool_moveStartX = null;
var selectTool_moveStartY = null;

var selectTool_moveStartRealX = null;
var selectTool_moveStartRealY = null;

var selectTool_moveLastRealX = null;
var selectTool_moveLastRealY = null;

var shouldAddToSelected = false;


var selectTool_clickedAlreadySelected = false;
var selectTool_guideObj = null;
var selectTool_selectedObjs = [];

var selectTool_sets = [];

var selectTool_hoveredSet = null;
var selectTool_hoveredAamapObj = null;
var SELECT_TOOL_HIGHLIGHT_OFFSET = 5;
var SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH = SELECT_TOOL_HIGHLIGHT_OFFSET * 2;
var SELECT_TOOL_HIT_TOLERANCE = SELECT_TOOL_HIGHLIGHT_OFFSET;
var SELECT_TOOL_HIT_WIDTH = SELECT_TOOL_HIT_TOLERANCE * 2;

function selectTool_setGlowAttrs(aamapObject, attrs) {
    if(aamapObject && aamapObject.glowObj) aamapObject.glowObj.attr(attrs);
}

function selectTool_defaultGlowAttrs(aamapObject) {
    var attrs = {
        "stroke-opacity": 0,
        "fill-opacity": 0,
        cursor: "default"
    };
    if(aamapObject && aamapObject.isSelected) {
        attrs["stroke-opacity"] = 0.75;
        attrs["fill-opacity"] = aamapObject instanceof Zone ? 0.18 : 0;
        attrs.cursor = "pointer";
    }
    return attrs;
}

function selectTool_hoverGlowAttrs(aamapObject) {
    var attrs = {
        "stroke-opacity": 0.45,
        "fill-opacity": aamapObject instanceof Zone ? 0.12 : 0,
        cursor: "pointer"
    };
    if(aamapObject && aamapObject.isSelected) {
        attrs["stroke-opacity"] = 0.95;
        attrs["fill-opacity"] = aamapObject instanceof Zone ? 0.25 : 0;
    }
    return attrs;
}

function selectTool_beginRenderCycle() {
    selectTool_sets = [];
    if(!vectron_toolActive) {
        selectTool_hoveredSet = null;
        selectTool_hoveredAamapObj = null;
    }
}

function selectTool_pointInGlow(aamapObject, x, y) {
    if(!aamapObject) return false;
    if(aamapObject instanceof Wall) return selectTool_pointNearWall(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    if(aamapObject instanceof Zone) return selectTool_pointInZoneHitArea(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    if(aamapObject instanceof Spawn) return selectTool_pointNearSpawn(aamapObject, x, y, SELECT_TOOL_HIT_TOLERANCE);
    return false;
}

function selectTool_glowArea(aamapObject) {
    if(!aamapObject || !aamapObject.glowObj) return Infinity;
    if(aamapObject instanceof Wall) return Math.max(1, selectTool_wallScreenLength(aamapObject)) * SELECT_TOOL_HIT_WIDTH;
    if(aamapObject instanceof Zone) {
        var r = Math.max(1, aamapObject.radius * vectron_zoom);
        return 2 * Math.PI * r * SELECT_TOOL_HIT_WIDTH;
    }
    var bbox = aamapObject.glowObj.getBBox();
    if(!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) return Infinity;
    return bbox.width * bbox.height;
}

function selectTool_findSetForObject(aamapObject) {
    if(!aamapObject) return null;
    for(var i = selectTool_sets.length - 1; i >= 0; i--) {
        if(selectTool_sets[i] && selectTool_sets[i][0] == aamapObject.obj) return selectTool_sets[i];
    }
    return null;
}

function selectTool_resolveHoveredSetFromCursor() {
    var x = cursor_neverSnappedX;
    var y = cursor_neverSnappedY;
    if(x === undefined || y === undefined) {
        x = cursor_realX;
        y = cursor_realY;
    }
    var bestObj = null;
    var bestArea = Infinity;

    for(var i = aamap_objects.length - 1; i >= 0; i--) {
        if(selectTool_pointInGlow(aamap_objects[i], x, y)) {
            var area = selectTool_glowArea(aamap_objects[i]);
            if(area < bestArea) {
                bestArea = area;
                bestObj = aamap_objects[i];
            }
        }
    }

    for(var j = 0; j < aamap_objects.length; j++) {
        selectTool_setGlowAttrs(aamap_objects[j], selectTool_defaultGlowAttrs(aamap_objects[j]));
        if(aamap_objects[j].obj) aamap_objects[j].obj.attr("cursor", "default");
    }

    selectTool_hoveredAamapObj = bestObj;
    selectTool_hoveredSet = selectTool_findSetForObject(bestObj);
    shouldAddToSelected = bestObj ? !bestObj.isSelected : false;

    if(bestObj) {
        selectTool_setGlowAttrs(bestObj, selectTool_hoverGlowAttrs(bestObj));
        if(bestObj.obj) bestObj.obj.attr("cursor", "pointer");
    }

    return selectTool_hoveredSet != null;
}

function selectTool_updateHoverFromCursor() {
    if(vectron_currentTool !== "select" || vectron_toolActive) return;
    selectTool_resolveHoveredSetFromCursor();
}

function selectTool_addToSelection(aamapObject) {
    if(!aamapObject) return;
    aamapObject.isSelected = true;
    if(selectTool_selectedObjs.indexOf(aamapObject) === -1) {
        selectTool_selectedObjs.push(aamapObject);
    }
}

function selectTool_removeSelectionBox(aamapObject) {
    if(aamapObject && aamapObject.glowObj) {
        aamapObject.glowObj.remove();
        aamapObject.glowObj = null;
    }
}

function selectTool_screenPointFromMapPoint(point) {
    return {
        x: aamap_realX(point.x),
        y: aamap_realY(point.y)
    };
}

function selectTool_distanceToScreenSegment(px, py, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    var t = 0;
    if(len2 > 1e-12) {
        t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
    }
    var nx = a.x + t * dx;
    var ny = a.y + t * dy;
    var ddx = px - nx;
    var ddy = py - ny;
    return Math.sqrt(ddx * ddx + ddy * ddy);
}

function selectTool_screenPixelsToMapUnits(pixels) {
    return pixels / Math.max(vectron_zoom, 1e-9);
}

function selectTool_expandMapRect(params, pixels) {
    var pad = selectTool_screenPixelsToMapUnits(pixels);
    return [
        params[0] - pad,
        params[1] + pad,
        params[2] + pad,
        params[3] - pad
    ];
}

function selectTool_pointNearWall(wall, screenX, screenY, tolerance) {
    if(!wall || !wall.points || wall.points.length < 2) return false;
    for(var i = 0; i < wall.points.length - 1; i++) {
        if(selectTool_distanceToScreenSegment(
            screenX,
            screenY,
            selectTool_screenPointFromMapPoint(wall.points[i]),
            selectTool_screenPointFromMapPoint(wall.points[i + 1])
        ) <= tolerance) return true;
    }
    return false;
}

function selectTool_wallScreenLength(wall) {
    var length = 0;
    if(!wall || !wall.points) return length;
    for(var i = 0; i < wall.points.length - 1; i++) {
        var a = selectTool_screenPointFromMapPoint(wall.points[i]);
        var b = selectTool_screenPointFromMapPoint(wall.points[i + 1]);
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

function selectTool_pointInZoneHitArea(zone, screenX, screenY, tolerance) {
    if(!zone) return false;
    var cx = aamap_realX(zone.x);
    var cy = aamap_realY(zone.y);
    var radius = zone.radius * vectron_zoom;
    var dx = screenX - cx;
    var dy = screenY - cy;
    return Math.sqrt(dx * dx + dy * dy) <= radius + tolerance;
}

function selectTool_spawnScreenPoints(spawn) {
    var x = aamap_realX(spawn.x);
    var y = aamap_realY(spawn.y);
    var scale = 16;
    var angle = -Math.atan2(spawn.yDir, spawn.xDir);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);

    function rotate(localX, localY) {
        return {
            x: x + localX * cos - localY * sin,
            y: y + localX * sin + localY * cos
        };
    }

    return [
        [rotate(0, 0), rotate(-scale / 2, 0)],
        [rotate(-scale / 2, 0), rotate(scale / 2, 0)],
        [rotate(scale / 2, 0), rotate(0, -scale / 3)],
        [rotate(scale / 2, 0), rotate(0, scale / 3)]
    ];
}

function selectTool_pointNearSpawn(spawn, screenX, screenY, tolerance) {
    if(!spawn) return false;
    var segments = selectTool_spawnScreenPoints(spawn);
    for(var i = 0; i < segments.length; i++) {
        if(selectTool_distanceToScreenSegment(screenX, screenY, segments[i][0], segments[i][1]) <= tolerance) return true;
    }
    return false;
}

function selectTool_wallGlowPath(wall) {
    var arr = [];
    if(!wall || !wall.points || wall.points.length < 2) return arr;
    for(var i = 0; i < wall.points.length; i++) {
        arr.push(i === 0 ? "M" : "L");
        arr.push(aamap_realX(wall.points[i].x));
        arr.push(aamap_realY(wall.points[i].y));
    }
    return arr;
}

function selectTool_spawnGlowPath(spawn) {
    var x = aamap_realX(spawn.x);
    var y = aamap_realY(spawn.y);
    var scale = 16;
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

function selectTool_removeSelectedGlowRects() {
    for(var i = 0; i < selectTool_selectedObjs.length; i++) {
        selectTool_removeSelectionBox(selectTool_selectedObjs[i]);
    }
}

function selectTool_renderSelectedGlowRects() {
    if(vectron_currentTool !== "select") return;
    for(var i = 0; i < selectTool_selectedObjs.length; i++) {
        if(selectTool_selectedObjs[i].glowObj) {
            selectTool_selectedObjs[i].glowObj.toFront();
            selectTool_selectedObjs[i].obj.toFront();
        }
    }
}

function selectTool_connect() {
    $(".toolbar-toolSelect").addClass("toolbar-tool-active");
    cursor_active = false;
    // add drag to all objects
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        selectTool_addHoverSet(aamap_objects[i]);
    }
}

function selectTool_disconnect() {
    if(selectTool_guideObj != null) {
        selectTool_guideObj.remove();
    }
    selectTool_deselectAll();
    selectTool_clickedAlreadySelected = false;

    cursor_active = true;

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        if(selectTool_sets[i]) selectTool_sets[i].unhover();
        selectTool_removeInvisibleGlow(aamap_objects[i]);
    }
    $(".toolbar-toolSelect").removeClass("toolbar-tool-active");
    vectron_toolActive = false;
}

function selectTool_start() {
    if(selectTool_guideObj != null) selectTool_guideObj.remove();

    selectTool_resolveHoveredSetFromCursor();

    if(selectTool_hoveredSet != null) {
        // we have a move!
        // find the hovered aaobject and add it to the selected list
        for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
            if(aamap_objects[i].obj == selectTool_hoveredSet[0]) {
                gui_writeLog("match");
                selectTool_hoveredAamapObj = aamap_objects[i];
                selectTool_clickedAlreadySelected = selectTool_hoveredAamapObj.isSelected;
                if(shouldAddToSelected) {
                    selectTool_addToSelection(selectTool_hoveredAamapObj);
                }
            }
        }

        if(selectTool_hoveredAamapObj == null) {
            gui_writeLog("Could not find hovered object to move??");
            return;
        }

        vectron_toolActive = true;

        selectTool_moveStartX = aamap_mapX(cursor_realX);
        selectTool_moveStartY = aamap_mapY(cursor_realY); 

        var startSnapX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
        var startSnapY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
        selectTool_moveStartRealX = startSnapX;
        selectTool_moveStartRealY = startSnapY;
        selectTool_moveLastRealX = startSnapX;
        selectTool_moveLastRealY = startSnapY;
        return;
    }

    selectTool_realX = cursor_neverSnappedX;
    selectTool_realY = cursor_neverSnappedY;
    
    selectTool_mapX = aamap_mapX(cursor_neverSnappedX);
    selectTool_mapY = aamap_mapY(cursor_neverSnappedY);

    if(!eventHandler_shift)
        selectTool_deselectAll();

    selectTool_guideObj = vectron_screen.rect(cursor_realX, cursor_realY, 0, 0)
    .attr({"stroke": "#51a0ff", "stroke-opacity": "0.5", "fill": "#51a0ff", "fill-opacity": "0.3"});
    vectron_toolActive = true;
}

function selectTool_progress() {
    if(selectTool_hoveredSet != null) {
        gui_writeLog("in progress of moving, dont select!");
        var curX = cursor_snap ? cursor_realX : cursor_neverSnappedX;
        var curY = cursor_snap ? cursor_realY : cursor_neverSnappedY;
        var dx = selectTool_moveLastRealX - curX;
        var dy = selectTool_moveLastRealY - curY;

        selectTool_moveLastRealX = curX;
        selectTool_moveLastRealY = curY;

        selectTool_selectedObjs.forEach(function(e) {
            e.obj.translate(-dx, -dy);
            if(e.glowObj) e.glowObj.translate(-dx, -dy);
        });

        return;
    }


    if(selectTool_guideObj != null) selectTool_guideObj.remove();
    else {
        gui_writeLog("unknown error occured.");
        selectTool_complete();
    }

    var realX = selectTool_realX;
    var realY = selectTool_realY;
    var endRealX = cursor_neverSnappedX;
    var endRealY = cursor_neverSnappedY;

    var width = cursor_neverSnappedX - selectTool_realX;
    var height = cursor_neverSnappedY - selectTool_realY;

    if(width < 0) {
        realX = endRealX;
        width *= -1;
    }

    if(height < 0) {
        realY = endRealY;
        height *= -1;
    }
    
    //
    selectTool_selectArea(selectTool_mapX, selectTool_mapY, aamap_mapX(endRealX), aamap_mapY(endRealY), false);

    // draw selecting box
    selectTool_guideObj = vectron_screen.rect(realX, realY, width, height)
    .attr({"stroke": "#51a0ff", "stroke-opacity": "0.5", "fill": "#51a0ff", "fill-opacity": "0.3"});
}

function selectTool_complete() {
    if(selectTool_hoveredSet != null) {

        var endX = aamap_mapX(cursor_realX);
        var endY = aamap_mapY(cursor_realY);

        var dx = selectTool_moveStartX - endX;
        var dy = selectTool_moveStartY - endY;

        var movedObjs = selectTool_selectedObjs.slice();
        var finalDx = -dx, finalDy = -dy;

        selectTool_clickedAlreadySelected = false;

        selectTool_hoveredSet[0].remove();
        selectTool_hoveredSet[1].remove();

        selectTool_sets = [];

        selectTool_selectedObjs.forEach(function(e) {
            e.move(-dx, -dy);
            e.render();
        });

        // Record move action for undo/redo
        if (finalDx !== 0 || finalDy !== 0) {
            aamap_recordAction({
                label: "Move object(s)",
                undo: function() {
                    movedObjs.forEach(function(e) { e.move(-finalDx, -finalDy); e.render(); });
                    vectron_render();
                },
                redo: function() {
                    movedObjs.forEach(function(e) { e.move(finalDx, finalDy); e.render(); });
                    vectron_render();
                }
            });
        }

        // render adds to sets
        for(var i = 0, ii = selectTool_sets.length; i < ii; i++) {
        	if(selectTool_hoveredAamapObj.obj == selectTool_sets[i][0]) {
        		gui_writeLog("FOUND");
        		selectTool_hoveredSet = selectTool_sets[i];
        	}
        }

        shouldAddToSelected = false;

        vectron_toolActive = false;
        if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
        return;
    }

    if(selectTool_guideObj != null) selectTool_guideObj.animate({ opacity : 0 }, 150);
    else {
        gui_writeLog("unknown error occured.");
    }
    selectTool_endX = aamap_mapX(cursor_neverSnappedX);
    selectTool_endY = aamap_mapY(cursor_neverSnappedY);

    selectTool_selectArea(selectTool_mapX, selectTool_mapY, selectTool_endX, selectTool_endY);
    vectron_toolActive = false;
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
}

function selectTool_delete() {
    var deletedObjs = selectTool_selectedObjs.slice();
    // Mark as deselected and remove Raphael elements directly
    deletedObjs.forEach(function(e) {
        e.isSelected = false;
        if (e.obj) e.obj.remove();
        if (e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
    });
    aamap_objects = aamap_objects.diff(deletedObjs);
    selectTool_selectedObjs = [];

    // Build a count label: z(zones) w(walls) v(vertices) s(spawns)
    var zCount = 0, wCount = 0, vCount = 0, sCount = 0;
    deletedObjs.forEach(function(e) {
        if (e instanceof Zone) { zCount++; }
        else if (e instanceof Wall) { wCount++; vCount += e.points.length; }
        else if (e instanceof Spawn) { sCount++; }
    });
    var parts = [];
    if (zCount > 0) parts.push('z(' + zCount + ')');
    if (wCount > 0) parts.push('w(' + wCount + ')');
    if (vCount > 0) parts.push('v(' + vCount + ')');
    if (sCount > 0) parts.push('s(' + sCount + ')');
    var countLabel = parts.length > 0 ? ' ' + parts.join(' ') : '';

    aamap_recordAction({
        label: "Delete" + countLabel,
        undo: function() {
            deletedObjs.forEach(function(e) { aamap_objects.push(e); });
            vectron_render();
        },
        redo: function() {
            aamap_objects = aamap_objects.diff(deletedObjs);
            deletedObjs.forEach(function(e) {
                if (e.obj) e.obj.remove();
                if (e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
            });
            vectron_render();
        }
    });
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
    vectron_render();
}

function selectTool_selectArea(xStart, yStart, xEnd, yEnd, select)
{
    if( select === undefined ) select = true;
    
    var selectFunc = select ? (function()
        {
            selectTool_select(curObj);
            if(selectTool_selectedObjs.indexOf(curObj) === -1) {
                selectTool_selectedObjs.push( curObj );
            }
        }
    ) : (function()
        {
            // give to-be-selected items a green glow
            if(curObj.glowObj) {
                curObj.glowObj.attr({"stroke": "#44ff44", "stroke-opacity": 0.45, "fill-opacity": 0.08});
            }
        }
    );
    
    selectedObjs = [];
    var params = selectTool_orderCorners( xStart, yStart, xEnd, yEnd );
    var hitParams = selectTool_expandMapRect(params, SELECT_TOOL_HIT_TOLERANCE);

    //params = [left, top, right, bottom]
    for( var i = 0; i < aamap_objects.length; i++ ) {
        var curObj = aamap_objects[i];
        
        // reset glow before and during selecting
        selectTool_setGlowAttrs(curObj, selectTool_defaultGlowAttrs(curObj));
        
        if( curObj instanceof Wall ) {
            for(var j = 0; j < curObj.points.length - 1; j++) {
                var p1 = curObj.points[j];
                var p2 = curObj.points[j+1];
                if(selectTool_lineIntersectsRect(p1, p2, hitParams[0], hitParams[1], hitParams[2], hitParams[3])) {
                    selectFunc();
                    break;
                }
            }
        } 
        
        else if(curObj instanceof Zone) {

            if(selectTool_circIntersectsRect(new WallPoint(curObj.x, curObj.y), curObj.radius,
                hitParams[0], hitParams[1], hitParams[2], hitParams[3])) {
                selectFunc();
            }
        }

        else {
            if( hitParams[0] <= curObj.x && curObj.x <= hitParams[2] &&
                hitParams[1] >= curObj.y && curObj.y >= hitParams[3] ) {
                selectFunc();
            }
        }
    }
    if( select )
    gui_writeLog(selectTool_selectedObjs.length);
}

function selectTool_select(aamapObject) {
    aamapObject.isSelected = true;
    aamapObject.render();
}

function selectTool_deselect(aamapObject) {
    aamapObject.isSelected = false;
    aamapObject.render();
}

function selectTool_deselectAll() {
    for(var i = 0, ii = selectTool_selectedObjs.length; i < ii; i++) {
        selectTool_deselect(selectTool_selectedObjs[i]);
    }
    selectTool_selectedObjs = [];
    if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
}

var selectTool_clipboard = "";
function selectTool_copy()
{
    var len = selectTool_selectedObjs.length;
    if(len == 0)
    {
        setTimeout(function(){alert("Nothing to copy!");},0);
    }
    else
    {
        selectTool_clipboard = "<Field>";
        for(var i=0;i<len;++i)
        {
            selectTool_clipboard += selectTool_selectedObjs[i].getXML()+"\n";
        }
        selectTool_clipboard += "</Field>";
    }
}

function selectTool_paste()
{
    if(selectTool_clipboard)
    {
        var objsBeforePaste = aamap_objects.length;

        // Load copied objects
        xml_process_piece(selectTool_clipboard);

        if(aamap_objects.length == objsBeforePaste)
        {
            // Huh.
            setTimeout(function(){alert("Pasting failed, no objects were pasted.");},0);
            return;
        }

        /*
        // If these are objects that already existed on this map
        // determine that we need to move them to the cursor position
        var moveToCursor = false;
        for(var i=objsBeforePaste-1;i>=0;--i) // objects before paste
        {
            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                if(aamap_objects[i].getXML() == aamap_objects[z].getXML())
                {
                    moveToCursor = true;
                    break;
                }
            }
        }

        if(moveToCursor)
        */
        {
            var objsPasted = aamap_objects.length-objsBeforePaste;
            var x = 0, y = 0;
            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                var pos = aamap_objects[z].getPosition();
                x += pos[0]; y += pos[1];
            }
            x /= objsPasted; y /= objsPasted;

            for(var z=objsBeforePaste;z<aamap_objects.length;++z) // objects pasted
            {
                aamap_objects[z].move(aamap_mapX(cursor_realX)-x,aamap_mapY(cursor_realY)-y);
            }
        }

        // select pasted elements
        selectTool_deselectAll();
        var pastedObjs = [];
        for(var i=objsBeforePaste;i<aamap_objects.length;++i) // objects pasted
        {
            selectTool_select(aamap_objects[i]);
            selectTool_selectedObjs.push(aamap_objects[i]);
            pastedObjs.push(aamap_objects[i]);
        }

        // Record paste for undo/redo
        aamap_recordAction({
            label: "Paste object(s)",
            undo: function() {
                aamap_objects = aamap_objects.diff(pastedObjs);
                pastedObjs.forEach(function(e) {
                    if (e.obj) e.obj.remove();
                    if (e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
                });
                vectron_render();
            },
            redo: function() {
                pastedObjs.forEach(function(e) { aamap_objects.push(e); });
                vectron_render();
            }
        });
        if (window.xmlEditor_onSelectionChange) xmlEditor_onSelectionChange();
    }
    else
    {
        setTimeout(function(){alert("Nothing to paste!");},0);
    }
}

function selectTool_orderCorners( xStart, yStart, xEnd, yEnd ) {
    var ordered = [];
    if( xStart < xEnd ) {
        if( yStart < yEnd ) {
            ordered = [xStart, yEnd, xEnd, yStart];
        } else {
            ordered = [xStart, yStart, xEnd, yEnd];
        } 
    } else {
        if( yStart < yEnd ) {
            ordered = [xEnd, yEnd, xStart, yStart];
        } else {
            ordered = [xEnd, yStart, xStart, yEnd];
        }
    }
    return ordered;
}

function selectTool_lineIntersectsLine(l1p1, l1p2, l2p1, l2p2) {
    var q = (l1p1.y - l2p1.y) * (l2p2.x - l2p1.x) - (l1p1.x - l2p1.x) * (l2p2.y - l2p1.y);
    var d = (l1p2.x - l1p1.x) * (l2p2.y - l2p1.y) - (l1p2.y - l1p1.y) * (l2p2.x - l2p1.x);

    if( d == 0 )
    {
        return false;
    }

    var r = q / d;

    q = (l1p1.y - l2p1.y) * (l1p2.x - l1p1.x) - (l1p1.x - l2p1.x) * (l1p2.y - l1p1.y);
    var s = q / d;

    if( r < 0 || r > 1 || s < 0 || s > 1 )
    {
        return false;
    }

    return true;
}

function selectTool_lineIntersectsRect(p1, p2, x0, y0, x1, y1) {
    return selectTool_lineIntersectsLine(p1, p2, new WallPoint(x0, y0), new WallPoint(x1, y0)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x1, y0), new WallPoint(x1, y1)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x1, y1), new WallPoint(x0, y1)) ||
           selectTool_lineIntersectsLine(p1, p2, new WallPoint(x0, y1), new WallPoint(x0, y0)) ||
           ( x0 <= p1.x && p1.x <= x1 &&
                y0 >= p1.y && p1.y >= y1 );
}

function selectTool_circIntersectsRect(p1, r, x0, y0, x1, y1) {
    if( x0 <= p1.x && p1.x <= x1 &&
        y0 >= p1.y && p1.y >= y1) {

        return true;
    }

    if(y0 >= p1.y && p1.y >= y1) {
        if(Math.abs(x1 - p1.x) <= r)
            return true;
    }

    if(y0 >= p1.y && p1.y >= y1) {
        if(Math.abs(x0 - p1.x) <= r)
            return true;
    }

    if(x0 <= p1.x && x1 >= p1.x) {
        if(Math.abs(y0 - p1.y) <= r)
            return true;
    }

    if(x0 <= p1.x && x1 >= p1.x) {
        if(Math.abs(y1 - p1.y) <= r)
            return true;
    }

    var point1 = new WallPoint(x0, y0);
    var point2 = new WallPoint(x1, y0);
    var point3 = new WallPoint(x1, y1);
    var point4 = new WallPoint(x0, y1);

    var dist1x = Math.abs(p1.x - point1.x);
    var dist1y = Math.abs(p1.y - point1.y);
    if(dist1x <= r && dist1y <= r)
        return true;

    var dist2x = Math.abs(p1.x - point2.x);
    var dist2y = Math.abs(p1.y - point2.y);
    if(dist2x <= r && dist2y <= r)
        return true;

    var dist3x = Math.abs(p1.x - point3.x);
    var dist3y = Math.abs(p1.y - point3.y);
    if(dist3x <= r && dist3y <= r)
        return true;

    var dist4x = Math.abs(p1.x - point4.x);
    var dist4y = Math.abs(p1.y - point4.y);
    if(dist4x <= r && dist4y <= r)
        return true;

    return false;
}

function selectTool_addInvisibleGlow(aamapObject) {
    var color = config_isDark ? "#77bbff" : "#375ffc";
    if(aamapObject instanceof Wall) {
        aamapObject.glowObj = vectron_screen.path(selectTool_wallGlowPath(aamapObject));
    } else if(aamapObject instanceof Zone) {
        aamapObject.glowObj = vectron_screen.circle(
            aamap_realX(aamapObject.x),
            aamap_realY(aamapObject.y),
            Math.max(0, aamapObject.radius * vectron_zoom)
        );
    } else if(aamapObject instanceof Spawn) {
        aamapObject.glowObj = vectron_screen.path(selectTool_spawnGlowPath(aamapObject))
            .transform("R" + aamapObject.toDegrees());
    }
    if(!aamapObject.glowObj) return;
    aamapObject.glowObj.attr({
        stroke: color,
        "stroke-width": SELECT_TOOL_HIGHLIGHT_STROKE_WIDTH,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-opacity": 0,
        fill: aamapObject instanceof Zone ? color : "none",
        "fill-opacity": 0,
        cursor: "default"
    });
    selectTool_setGlowAttrs(aamapObject, selectTool_defaultGlowAttrs(aamapObject));
    aamapObject.glowObj.insertBefore(aamapObject.obj);
    aamapObject.obj.toFront();
}

function selectTool_removeInvisibleGlow(aamapObject) {
    if(!aamapObject.glowObj) return;
    aamapObject.glowObj.remove();
    aamapObject.glowObj = null;
}

function selectTool_addHoverSet(aamapObject) {
    selectTool_addInvisibleGlow(aamapObject);
    if(!aamapObject.glowObj) return;
    var set = vectron_screen.set().push(aamapObject.obj, aamapObject.glowObj);
    selectTool_sets.push(set);
    set.hoverset(vectron_screen, selectTool_hoverIn, selectTool_hoverOut);
}

function selectTool_addHoverSetSelected(aamapObject) {
    selectTool_addInvisibleGlow(aamapObject);
    if(!aamapObject.glowObj) return;
    var set = vectron_screen.set().push(aamapObject.obj, aamapObject.glowObj);
    selectTool_sets.push(set);
    set.hoverset(vectron_screen, selectTool_hoverInSelected, selectTool_hoverOutSelected);
}

var selectTool_hoverIn = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
}

var selectTool_hoverOut = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
    gui_writeLog("Null Now");
}

var selectTool_hoverInSelected = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
}

var selectTool_hoverOutSelected = function(evt) {
    if(vectron_toolActive) return;

    selectTool_resolveHoveredSetFromCursor();
    gui_writeLog("NUll now");
}



