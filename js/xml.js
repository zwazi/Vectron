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
var xml_settings = [];
var xml_latest_read_id = 0;
var xml_remixHistory = [];
var xml_playerPrivateZoneSetting = "PLAYER_PRIVATE_ZONES_V1";

function xml_parsePlayerPrivateZoneOrdinals(value) {
    var ordinals = {};
    String(value || "").split(/[\s,;]+/).forEach(function(part) {
        var ordinal = Number(part);
        if(isFinite(ordinal) && ordinal > 0 && Math.floor(ordinal) === ordinal) {
            ordinals[ordinal] = true;
        }
    });
    return ordinals;
}

function xml_normalizeRemixEntry(entry) {
    if(!entry || typeof entry != "object") return null;
    var path = String(entry.path || "");
    if(!path) return null;
    return {
        map: String(entry.map || "Untitled map"),
        author: String(entry.author || "Unknown"),
        version: String(entry.version || ""),
        path: path
    };
}

function xml_setRemixHistory(history) {
    xml_remixHistory = Array.isArray(history) ? history.map(xml_normalizeRemixEntry).filter(Boolean) : [];
    return xml_remixHistory.slice();
}

function xml_clearRemixHistory() {
    xml_remixHistory = [];
}

function xml_appendRemixSource(entry) {
    var normalized = xml_normalizeRemixEntry(entry);
    if(!normalized) throw new Error("A remix source path is required.");
    xml_remixHistory.push(normalized);
    return normalized;
}

function xml_readRemixHistory(xml) {
    var pattern = /<!--\s*Vectron remix provenance data:\s*([A-Za-z0-9+/=]+)\s*-->/gi;
    var encoded = "";
    var match;
    while((match = pattern.exec(String(xml || "")))) encoded = match[1];
    if(!encoded) return xml_setRemixHistory([]);
    try {
        return xml_setRemixHistory(JSON.parse(decodeURIComponent(atob(encoded))));
    } catch(error) {
        gui_writeLog("Ignored invalid Vectron remix provenance.");
        return xml_setRemixHistory([]);
    }
}

function xml_safeRemixCommentValue(value) {
    return String(value || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/--/g, "- -")
        .trim();
}

function xml_buildRemixComments(indent) {
    if(!xml_remixHistory.length) return "";
    var prefix = indent || "";
    var lines = [prefix + "<!-- Vectron remix provenance (oldest source first) -->"];
    xml_remixHistory.forEach(function(entry, index) {
        var map = xml_safeRemixCommentValue(entry.map);
        var author = xml_safeRemixCommentValue(entry.author);
        var path = xml_safeRemixCommentValue(entry.path);
        var version = entry.version ? "; Version: \"" + xml_safeRemixCommentValue(entry.version) + "\"" : "";
        lines.push(prefix + (index === 0
            ? "<!-- Original map: \"" + map + "\"; Original author: \"" + author + "\"" + version + "; Source file: \"" + path + "\" -->"
            : "<!-- Remix source " + (index + 1) + ": Map: \"" + map + "\"; Author: \"" + author + "\"" + version + "; Source file: \"" + path + "\" -->"));
    });
    lines.push(prefix + "<!-- Vectron remix provenance data: " +
        btoa(encodeURIComponent(JSON.stringify(xml_remixHistory))) + " -->");
    return lines.join("\n") + "\n";
}

window.xml_appendRemixSource = xml_appendRemixSource;
window.xml_buildRemixComments = xml_buildRemixComments;
window.xml_clearRemixHistory = xml_clearRemixHistory;

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

    var resource = $(xml).filter(":first");
    gui_writeLog(resource.attr("name"));
    xml_name = resource.attr("name");
    xml_author = resource.attr("author");
    xml_version = resource.attr("version");
    xml_category = resource.attr("category");
    xml_readRemixHistory(xml);

    try{xml_dtd = $.parseXML(xml).firstChild.systemId;}
    catch(e){xml_dtd = "sty.dtd"; gui_writeLog("Could not determine dtd!");}

    xml_settings.splice(0);
    var privateZoneOrdinals = {};
    $(xml).find("Setting").each(function() {
        var name = String($(this).attr("name") || "");
        var value = String($(this).attr("value") || "");
        if(name.toUpperCase() === xml_playerPrivateZoneSetting) {
            Object.keys(xml_parsePlayerPrivateZoneOrdinals(value)).forEach(function(ordinal) {
                privateZoneOrdinals[ordinal] = true;
            });
        } else {
            xml_settings.push(name+" "+value);
        }
    });

    xml_axes = 4;
    $(xml).find("Axes").each(function() {
        xml_axes = parseInt($(this).attr("number"));
    });

    gui_fillInput();

    var pt = xml_process_piece(xml, privateZoneOrdinals);
    var ptsx = pt[0], ptsy = pt[1];

    var checkpointZones = aamap_objects.filter(function(object) {
        return object instanceof Zone &&
            (zoneTool_typeArray[object.type] || [])[0] === "checkpoint";
    });
    var specialZones = aamap_objects.filter(function(object) {
        if(!(object instanceof Zone)) return false;
        var kind = (zoneTool_typeArray[object.type] || [])[0];
        return kind === "checkpoint" || kind === "teleport";
    });
    if(checkpointZones.length) {
        var checkpointSettingIndex = -1;
        var checkpointMode = "2";
        xml_settings.forEach(function(setting, index) {
            var text = String(setting || "").trim();
            if(text.toUpperCase().indexOf("RACE_CHECKPOINT_REQUIRE_HIT ") === 0) {
                checkpointSettingIndex = index;
                var value = text.slice(text.indexOf(" ") + 1).trim();
                if(value === "1" || value === "2") checkpointMode = value;
            }
        });
        if(checkpointSettingIndex < 0) {
            xml_settings.push("RACE_CHECKPOINT_REQUIRE_HIT 2");
            gui_writeLog("Checkpoint mode was missing; this map now defaults to ordered checkpoints.");
        }
        $("#dCheckpointMode").val(checkpointMode);
    }
    if(specialZones.length && /^(sty\.dtd|map-0\.2\.(8|9)(?:_beta3)?\.dtd|map-0\.3\.1-a\.dtd|Anonymous\/map-0\.2\.8\.dtd)$/i.test(String(xml_dtd || ""))) {
        xml_dtd = "map-0.2.9_styctap_v1.5.dtd";
        $("#map_dtd").val(xml_dtd);
        gui_writeLog("Switched this map to the teleport/checkpoint-compatible DTD.");
    }

    if(ptsx.length && ptsy.length) {
        var max_x = Math.max.apply(Math, ptsx);
        var min_x = Math.min.apply(Math, ptsx);
        var max_y = Math.max.apply(Math, ptsy);
        var min_y = Math.min.apply(Math, ptsy);

        vectron_panX = -1*(max_x + min_x)/2;
        vectron_panY = -1*(max_y + min_y)/2;
        var mapSpan = (max_x-min_x)+(max_y-min_y);
        vectron_zoom = mapSpan > 0 ? (((vectron_width+vectron_height)/2))/mapSpan : 1;
    } else {
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
    }
    vectron_render();
    if(!suppressHistoryClear) aamap_clearHistory();
}

function xml_process_piece(xml, privateZoneOrdinals)
{
    var x,y;
    var ptsx = [];
    var ptsy = [];
    var zoneOrdinal = 0;
    privateZoneOrdinals = privateZoneOrdinals || {};

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
        zoneOrdinal++;
        var zone = $(this);
        var effect = zone.attr("effect");
        var radius = zone.find("ShapeCircle").attr("radius");
        var growth = zone.find("ShapeCircle").attr("growth");
        var option;
        switch(effect)
        {
            case "rubber":
                option = zone.attr("rubberVal");
                break;
            case "checkpoint":
                var checkpointElement = zone.find("Checkpoint").first();
                var checkpointId = Number(checkpointElement.attr("id"));
                if(!isFinite(checkpointId) || checkpointId <= 0 || Math.floor(checkpointId) !== checkpointId) {
                    gui_writeLog("Skipped checkpoint zone with invalid order.");
                    return;
                }
                option = {
                    checkpointId:checkpointId,
                    legacyTime:checkpointElement.attr("time") === undefined ? "0" : checkpointElement.attr("time")
                };
                break;
            case "teleport":
                var teleportElement = zone.find("Teleport").first();
                if(!teleportElement.length) {
                    gui_writeLog("Skipped teleport zone without a Teleport destination.");
                    return;
                }
                option = {
                    destX:Number(teleportElement.attr("destX") || 0),
                    destY:Number(teleportElement.attr("destY") || 0),
                    dirX:Number(teleportElement.attr("dirX") || 0),
                    dirY:Number(teleportElement.attr("dirY") || 0),
                    mode:String(teleportElement.attr("modes") || "abs").toLowerCase(),
                    reloc:Number(teleportElement.attr("reloc") === undefined ? 1 : teleportElement.attr("reloc"))
                };
                if(!isFinite(option.destX) || !isFinite(option.destY) ||
                    !isFinite(option.dirX) || !isFinite(option.dirY) ||
                    !isFinite(option.reloc) || ["abs", "rel", "cycle"].indexOf(option.mode) < 0) {
                    gui_writeLog("Skipped teleport zone with invalid destination data.");
                    return;
                }
                break;
            default:
                option = undefined;
        }
        x = zone.find("Point").attr("x");
        y = zone.find("Point").attr("y");
        ptsx.push(parseFloat(x));
        ptsy.push(parseFloat(y));
        var importedZone = new Zone(
            parseFloat(x), parseFloat(y), parseFloat(radius),
            parseFloat(growth)||0, zoneTool_whatType[effect], option
        );
        importedZone.privatePerPlayer = !!privateZoneOrdinals[zoneOrdinal];
        aamap_add(importedZone);
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
       // File-picker and drag/drop imports both arrive here. Symmetry belongs
       // to the previous editing session, not to the imported map.
       aamap_disableSymmetry();
       if(typeof window.vectron_clearRepositoryEditState == "function") {
           window.vectron_clearRepositoryEditState();
       }
       xml_process(this.result);
    };
    reader.onerror = function() {
       if(thisReadId !== xml_latest_read_id) return;
       gui_writeLog("Could not read map file.");
    };
    reader.readAsText(file);
}
