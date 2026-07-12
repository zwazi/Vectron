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


var xml_name;
var xml_author;
var xml_dtd;
var xml_version;
var xml_category;
var xml_wallheight = 4;
var xml_axes = 4;
var xml_axis_vectors = [];
var xml_game_mode = "armagetron";
var xml_settings = [];
var xml_latest_read_id = 0;

function xml_detectGameMode(parsed) {
    if(xml_axis_vectors.length > 0 ||
        $(parsed).find("Zone[type],Zone[kind],ShapeRectangle,ShapePolygon," +
            "Zone[priority],Zone[start_tick],Zone[end_tick],Zone[trigger]").length > 0) {
        return "armaracing";
    }
    for(var i = 0; i < xml_settings.length; i++) {
        if(/^(RACING_)?(PROGRAM|USER|ADMIN|ARCHITECT)_TIME |^(BRONZE|SILVER|GOLD|AUTHOR)_TIME /i.test(xml_settings[i])) {
            return "armaracing";
        }
    }
    return "armagetron";
}

function xml_init() {

    $('#files').change(function(e) {
        xml_handle(e);
    });

    window.addEventListener("dragover", function(e) {
        e.preventDefault();
    });
    window.addEventListener("drop", function(e) {
        e.preventDefault();
        var files = e.dataTransfer && e.dataTransfer.files;
        if(!files || !files.length) return;
        xml_handleFile(files[0]);
        if(files.length > 1) {
            gui_writeLog("Only the first dropped map will be loaded.");
        }
    });
}  

function xml_process(xml, suppressHistoryClear) {

    var parsed;
    try {
        parsed = typeof xml === "string" ? $.parseXML(xml) : xml;
    } catch(e) {
        gui_writeLog("Could not parse map XML: " + e.message);
        return;
    }
    var root = $(parsed.documentElement);
    var resource = root.is("Resource") ? root : root.find("Resource").first();
    gui_writeLog(resource.attr("name"));
    xml_name = resource.attr("name") || "";
    xml_author = resource.attr("author") || "";
    xml_version = resource.attr("version") || "";
    xml_category = resource.attr("category") || "";

    try{xml_dtd = parsed.doctype ? parsed.doctype.systemId : "sty.dtd";}
    catch(e){xml_dtd = "sty.dtd"; gui_writeLog("Could not determine dtd!");}

    xml_settings.splice(0);
    $(parsed).find("Setting").each(function() {
        xml_settings.push($(this).attr("name")+" "+$(this).attr("value"));
    });

    xml_axes = 4;
    xml_axis_vectors = [];
    $("#map_axes_forced")[0].checked = false;
    $(parsed).find("Axes").first().each(function() {
        var parsedAxes = parseInt($(this).attr("number"));
        if(isFinite(parsedAxes) && parsedAxes >= 1 && parsedAxes <= 65535 &&
            Math.floor(parsedAxes) === parsedAxes) {
            xml_axes = parsedAxes;
        } else if($(this).attr("number") !== undefined) {
            gui_writeLog("Ignored invalid Axes count.");
        }
        $(this).children("Axis").each(function() {
            var xdir = Number($(this).attr("xdir"));
            var ydir = Number($(this).attr("ydir"));
            if(isFinite(xdir) && isFinite(ydir)) xml_axis_vectors.push({xdir:xdir, ydir:ydir});
        });
        if(xml_axis_vectors.length && !isFinite(parsedAxes)) xml_axes = xml_axis_vectors.length;
        $("#map_axes_forced")[0].checked = true;
    });

    zoneTool_setGameMode(xml_detectGameMode(parsed));
    gui_fillInput();

    var pt = xml_process_piece(parsed);
    var ptsx = pt[0], ptsy = pt[1];

    var max_x = Math.max.apply(Math, ptsx);
    var min_x = Math.min.apply(Math, ptsx);
    var max_y = Math.max.apply(Math, ptsy);
    var min_y = Math.min.apply(Math, ptsy);

    vectron_panX = -1*(max_x + min_x)/2;
    vectron_panY = -1*(max_y + min_y)/2;
    vectron_zoom = (((vectron_width+vectron_height)/2))/((max_x-min_x)+(max_y-min_y));
    vectron_render();
    if(!suppressHistoryClear) aamap_clearHistory();
}

function xml_process_piece(xml)
{
    var x,y;
    var ptsx = [];
    var ptsy = [];

    $(xml).find("*").each(function(){switch(this.tagName.toLowerCase())
    {
    case "spawn": {
        var spawn = $(this);
        var x = spawn.attr("x");
        var y = spawn.attr("y");
        var angle = spawn.attr("angle");
        var xdir = spawn.attr("xdir");
        var ydir = spawn.attr("ydir");
        if(angle !== undefined && !xdir && !ydir)
        {
            var rad = angle*Math.PI/180;
            xdir = Math.cos(rad); ydir = Math.sin(rad);
        }

        var spawnOb = new Spawn();
        spawnOb.x = parseFloat(x);
        spawnOb.y = parseFloat(y);
        spawnOb.xDir = parseFloat(xdir);
        spawnOb.yDir = parseFloat(ydir);

        aamap_add(
            spawnOb
        );
    } break;
    
    case "zone": {
        var zone = $(this);
        var effect = zone.attr("effect") || zone.attr("type") || zone.attr("kind");
        var circle = zone.children("ShapeCircle").first();
        var rectangle = zone.children("ShapeRectangle").first();
        var polygon = zone.children("ShapePolygon").first();
        var shape = circle.length ? circle : (rectangle.length ? rectangle : polygon);
        if(!shape.length) {
            gui_writeLog("Skipped zone without a supported shape.");
            return;
        }
        var radius = circle.length ? Number(circle.attr("radius")) : 0;
        var growth = circle.attr("growth") === undefined ? 0 : Number(circle.attr("growth"));
        if(circle.length && (!isFinite(radius) || !isFinite(growth))) {
            gui_writeLog("Skipped zone with non-numeric circle geometry.");
            return;
        }
        var option;
        var details = {
            zoneName: effect,
            shapeType: circle.length ? "circle" : (rectangle.length ? "rectangle" : "polygon"),
            priority: zone.attr("priority"),
            startTick: zone.attr("start_tick"),
            endTick: zone.attr("end_tick"),
            trigger: zone.attr("trigger") || "",
            options: {}
        };
        switch(effect)
        {
            case "rubber":
                option = zone.attr("rubberVal");
                details.options.delta = zone.attr("delta");
                details.options.duration_ticks = zone.attr("duration_ticks");
                break;
            case "checkpoint":
                // Armaracing uses zero-based Zone order; legacy maps use positive Checkpoint id.
                option = zone.attr("order") !== undefined ? Number(zone.attr("order")) :
                    Number(circle.children("Checkpoint").attr("id"));
                if(!zoneTool_validCheckpointOrder(option, zone.attr("order") !== undefined)) {
                    gui_writeLog("Skipped checkpoint zone with invalid order.");
                    return;
                }
                break;
            case "speed":
                details.options.delta_mps = zone.attr("delta_mps");
                details.options.duration_ticks = zone.attr("duration_ticks");
                break;
            case "teleport":
                details.options.destination_x = zone.attr("destination_x");
                details.options.destination_y = zone.attr("destination_y");
                if(zone.attr("angle") !== undefined) details.options.angle = zone.attr("angle");
                else if(zone.attr("direction") !== undefined) details.options.direction = zone.attr("direction");
                else {
                    details.options.xdir = zone.attr("xdir");
                    details.options.ydir = zone.attr("ydir");
                }
                break;
            default:
                option = undefined;
        }
        if(circle.length) {
            var center = circle.children("Point").first();
            x = Number(center.attr("x"));
            y = Number(center.attr("y"));
            ptsx.push(x - radius, x + radius);
            ptsy.push(y - radius, y + radius);
        } else if(rectangle.length) {
            details.minx = Number(rectangle.attr("minx"));
            details.miny = Number(rectangle.attr("miny"));
            details.maxx = Number(rectangle.attr("maxx"));
            details.maxy = Number(rectangle.attr("maxy"));
            if(!isFinite(details.minx) || !isFinite(details.miny) ||
                !isFinite(details.maxx) || !isFinite(details.maxy)) {
                gui_writeLog("Skipped zone with non-numeric rectangle geometry.");
                return;
            }
            x = (details.minx + details.maxx) / 2;
            y = (details.miny + details.maxy) / 2;
            ptsx.push(details.minx, details.maxx);
            ptsy.push(details.miny, details.maxy);
        } else {
            details.polygonScale = Number(polygon.attr("scale"));
            if(!isFinite(details.polygonScale)) details.polygonScale = 1;
            var polygonPoints = polygon.children("Point");
            var origin = polygonPoints.first();
            x = Number(origin.attr("x"));
            y = Number(origin.attr("y"));
            details.polygonPoints = [];
            var invalidPolygon = !isFinite(x) || !isFinite(y);
            polygonPoints.slice(1).each(function() {
                var localX = Number($(this).attr("x"));
                var localY = Number($(this).attr("y"));
                if(!isFinite(localX) || !isFinite(localY)) invalidPolygon = true;
                details.polygonPoints.push({x:localX, y:localY});
                ptsx.push(x + localX * details.polygonScale);
                ptsy.push(y + localY * details.polygonScale);
            });
            if(invalidPolygon || details.polygonPoints.length < ZONE_TOOL_MIN_POLYGON_POINTS) {
                gui_writeLog("Skipped polygon zone with invalid static geometry.");
                return;
            }
        }
        if(!isFinite(x) || !isFinite(y)) {
            gui_writeLog("Skipped zone with invalid coordinates.");
            return;
        }
        aamap_add(new Zone(x, y, radius, growth, zoneTool_whatType[effect], option, details));
    } break;
    
    case "wall": {
        var wall = $(this);
        var points = [];
        wall.find("Point").each(function() {
            var x = $(this).attr("x");
            var y = $(this).attr("y");
            ptsx.push(parseFloat(x));
            ptsy.push(parseFloat(y));
            points.push(new WallPoint(parseFloat(x), parseFloat(y)));
        });
        var wallObj = new Wall();
        wallObj.points = points;
        if($(this).attr("height")) wallObj.height = $(this).attr("height");
        wallObj.render();
        aamap_add(wallObj);
    } break;
    
    }});


    return [ptsx, ptsy];
}

function xml_write() {

}

function xml_load() {

    if (window.File && window.FileReader && window.FileList && window.Blob) {
        gui_writeLog("File reading supported by your browser. Good. Clearing old map");
        vectron_render();
    } else {
        gui_writeLog("And you can't read files D:. Get chrome.");
    }
}

function xml_handle(evt) {
    if(!evt.target.files.length) return;
    xml_handleFile(evt.target.files[0]);
}

function xml_handleFile(file) {
    var reader = new FileReader();
    var thisReadId = ++xml_latest_read_id;
    aamap_objects = [];
    gui_writeLog("Loading.");
    reader.onload = function(evt) {
       if(thisReadId !== xml_latest_read_id) return;
       xml_process(this.result);
    };
    reader.onerror = function() {
       if(thisReadId !== xml_latest_read_id) return;
       gui_writeLog("Could not read map file.");
    };
    reader.readAsText(file);
}
