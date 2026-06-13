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
window.vtVersion = 1.110;

var vectron_width;
var vectron_height;

var vectron_screen;

var vectron_tools = ["select", "navigation", "wall", "zone", "spawn", "split", "join", "wallVertexMove"];
var vectron_currentTool = "";
var vectron_toolActive = false;

var vectron_grid_spacing = 16;
var vectron_zoom = 1;//15
var vectron_panX = 0;
var vectron_panY = 0;

var vectron_objectID = 0;


/**
 * Initializes everything here.
 */
function vectron_init() {

    vectron_width = $("#canvas_container").width();
    vectron_height = $("#canvas_container").height();

    vectron_screen = new Raphael(document.getElementById('canvas_container'), vectron_width, vectron_height);

    gui_init();

    cursor_init();

    aamap_init();

    eventHandler_init();
    
    config_load();

    vectron_render();

    xml_init();

    $.ajax({
        url: './js/startup.aamap.xml',
        dataType: 'text',
        success: function(data) {
            xml_process(data);
        },
        error: function() {
            gui_writeLog("Could not load startup map.");
        }
    });

    vectron_connectTool("select");
}

/**
 * Renders Vectron
 */
function vectron_render() {
    if(config_snapToPosition)
    {
        vectron_panX = Math.round(vectron_panX*10)/10;
        vectron_panY = Math.round(vectron_panY*10)/10;
    }

    vectron_screen.clear();
    aamap_grid = null;
    vectron_width = $("#canvas_container").width();
    vectron_height = $("#canvas_container").height();
    vectron_screen.setSize(vectron_width, vectron_height);
    vectron_screen.setViewBox(0, 0, vectron_width, vectron_height);
    aamap_render();

    vectron_write_info();
}

function vectron_format_coord(val) {
    if(vectron_zoom >= 10) return val.toFixed(2);
    if(vectron_zoom >= 3)  return val.toFixed(1);
    return Math.round(val).toString();
}

function vectron_format_zoom(z) {
    var pct = z * 100;
    if(pct < 10) return pct.toFixed(1);
    return Math.round(pct).toString();
}

function vectron_write_info()
{
    document.getElementById("zoom").innerText = vectron_format_zoom(vectron_zoom);
    document.getElementById("spacing").innerText = vectron_grid_spacing;
    
    document.getElementById("anchor-x").innerText = vectron_format_coord(-(vectron_panX));
    document.getElementById("anchor-y").innerText = vectron_format_coord(-(vectron_panY));
}

function vectron_zoom_adjustment()
{
    var len = (""+parseInt(vectron_zoom*100)).length;
    if(vectron_zoom > 0.5)
    {
        vectron_zoom = ((vectron_zoom*100).toPrecision(len-1))/100;
    }
    else
    {
        vectron_zoom = ((vectron_zoom*100).toPrecision(5-len))/100;
    }

    // just in case something goes wrong...
    if(vectron_zoom == 0) vectron_zoom = 1;
}

function vectron_disconnectTool() {
    if(vectron_toolActive) {
        gui_writeLog("Cannot disconnect active tool. Try canceling current Action.");
        return false;
    }

    if(vectron_tools.indexOf(vectron_currentTool) >= 0) {
        window[vectron_currentTool + "Tool_disconnect"]();
        vectron_currentTool = "";
    }

    return true;
}

function vectron_connectTool(toolName) {
    if(vectron_tools.indexOf(toolName) >= 0 && vectron_disconnectTool()) {
        if(vectron_currentTool === toolName) {
            // Already on this tool - clicking again deselects (switches to select)
            if(toolName !== "select") {
                window[toolName + "Tool_disconnect"]();
                vectron_currentTool = "";
                window["selectTool_connect"]();
                vectron_currentTool = "select";
                gui_writeLog("select connected.");
            }
            return true;
        }
        window[toolName + "Tool_connect"]();
        //connect tool and set currenttool
        vectron_currentTool = toolName;
        gui_writeLog(toolName + " connected.");
        return true;
    }
    return false;
}

window.onload = function() {
    vectron_init();
    console.log(vectron_width);
}

function vectron_saveTextAsFile(xml, filename)
{
    var textToWrite = xml;
    var textFileAsBlob;
    try
    {
        textFileAsBlob = new Blob([textToWrite], {type:"text/xml"});
    }
    catch(e)
    {
        var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
        var blob = new BlobBuilder(); blob.append(textToWrite);
        textFileAsBlob = blob.getBlob("text/xml");
        console.log(textFileAsBlob);
    }
    var fileNameToSaveAs = filename;

    var downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.target = "_blank";
    downloadLink.innerHTML = "Download File";
    if (window.webkitURL != null)
    {
        // Chrome allows the link to be clicked
        // without actually adding it to the DOM.
        downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
    }
    else
    {
        // Firefox requires the link to be added to the DOM
        // before it can be clicked.
        downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
        downloadLink.onclick = vectron_destroyClickedElement;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
    }

    downloadLink.click();
}

function vectron_destroyClickedElement(event) {
    document.body.removeChild(event.target);
}

