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
var vectron_grid_render_locked = false;
var vectron_grid_render_spacing = 16;
var vectron_zoom = 1;//15
var vectron_panX = 0;
var vectron_panY = 0;

var vectron_objectID = 0;

function vectron_assetUrl(path) {
    var scripts = document.getElementsByTagName("script");
    for(var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute("src") || "";
        var match = src.match(/^(.*\/)js\/vectron\.js(?:[?#].*)?$/);
        if(match) return match[1] + path.replace(/^\.\//, "");
    }
    return "./" + path.replace(/^\.\//, "");
}


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
    zoomControls_init();
    gridSizeControls_init();

    vectron_render();

    xml_init();

    $.ajax({
        url: vectron_assetUrl('js/startup.aamap.xml'),
        dataType: 'text',
        success: function(data) {
            xml_process(data);
        },
        error: function(xhr, status, err) {
            gui_writeLog("Could not load startup map. (" + (xhr.status || status) + ")");
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
    var zoomText = document.getElementById("zoom");
    if(zoomText) zoomText.innerText = vectron_format_zoom(vectron_zoom);
    if(document.getElementById("zoom-percent-select")) {
        zoomControls_sync();
    }
    if(document.getElementById("grid-spacing-select")) {
        gridSizeControls_sync();
    }
    
    document.getElementById("anchor-x").innerText = vectron_format_coord(-(vectron_panX));
    document.getElementById("anchor-y").innerText = vectron_format_coord(-(vectron_panY));
}

function vectron_getAutoGridSpacing(baseSpacing) {
    var spacing = baseSpacing || vectron_grid_spacing;
    if(spacing <= 0) return spacing;
    while((vectron_zoom * spacing) > 30) spacing /= 2;
    while((vectron_zoom * spacing) < 15) spacing *= 2;
    return spacing;
}

function gridSizeControls_sync() {
    var select = document.getElementById("grid-spacing-select");
    var lockBtn = document.getElementById("grid-size-lock");
    if(!select) return;
    var value = vectron_grid_render_locked ? vectron_grid_render_spacing : vectron_grid_spacing;
    var valueText = String(value);
    if(select.value !== valueText) {
        var found = false;
        for(var i = 0; i < select.options.length; i++) {
            if(select.options[i].value === valueText) found = true;
        }
        if(!found && value > 0) {
            var option = document.createElement("option");
            option.value = valueText;
            option.textContent = valueText;
            select.appendChild(option);
        }
        select.value = valueText;
    }
    if(lockBtn) {
        var lockIcon = lockBtn.querySelector(".grid-size-lock-icon");
        lockBtn.className = "info-icon-btn" + (vectron_grid_render_locked ? " active" : "");
        lockBtn.title = vectron_grid_render_locked ? "Unlock grid rendering size" : "Lock grid rendering size";
        lockBtn.setAttribute("aria-label", lockBtn.title);
        if(lockIcon) {
            lockIcon.className = "grid-size-lock-icon " + (vectron_grid_render_locked ? "grid-size-lock-icon-locked" : "grid-size-lock-icon-unlocked");
        }
    }
}

function gridSizeControls_init() {
    var select = document.getElementById("grid-spacing-select");
    if(!select) return;
    var values = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
    select.innerHTML = "";
    for(var i = 0; i < values.length; i++) {
        var option = document.createElement("option");
        option.value = String(values[i]);
        option.textContent = String(values[i]);
        select.appendChild(option);
    }
    gridSizeControls_sync();
}

function gridSizeControls_setLocked(locked) {
    vectron_grid_render_locked = locked;
    if(locked) {
        vectron_grid_render_spacing = vectron_grid_spacing;
    } else {
        vectron_grid_spacing = vectron_getAutoGridSpacing(vectron_grid_spacing);
        vectron_grid_render_spacing = vectron_grid_spacing;
    }
    vectron_render();
}

function zoomControls_sync() {
    var select = document.getElementById("zoom-percent-select");
    if(!select) return;
    var value = vectron_format_zoom(vectron_zoom);
    if(select.value !== value) {
        var found = false;
        for(var i = 0; i < select.options.length; i++) {
            if(select.options[i].value === value) found = true;
        }
        if(!found) {
            var option = document.createElement("option");
            option.value = value;
            option.textContent = value + "%";
            select.appendChild(option);
        }
        select.value = value;
    }
}

function zoomControls_init() {
    var select = document.getElementById("zoom-percent-select");
    if(!select) return;
    var values = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 800, 1600];
    select.innerHTML = "";
    for(var i = 0; i < values.length; i++) {
        var option = document.createElement("option");
        option.value = String(values[i]);
        option.textContent = String(values[i]) + "%";
        select.appendChild(option);
    }
    zoomControls_sync();
}

function zoomControls_setPercent(percent) {
    if(isNaN(percent) || percent <= 0) return;
    vectron_zoom = percent / 100;
    vectron_render();
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

