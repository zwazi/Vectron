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

var gui_active = false;

function gui_init() {
    gui_writeLog("Welcome to Vectron.")
    actionHistory_init();
}

function actionHistory_init() {
    // Make the action history window draggable and resizable via JS
    var win = document.getElementById("action-history-window");
    if(!win) return;
    var header = document.getElementById("action-history-header");
    var isDragging = false, dragOffX = 0, dragOffY = 0;
    header.addEventListener("mousedown", function(e) {
        isDragging = true;
        dragOffX = e.clientX - win.offsetLeft;
        dragOffY = e.clientY - win.offsetTop;
        e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
        if(isDragging) {
            win.style.left = (e.clientX - dragOffX) + "px";
            win.style.top  = (e.clientY - dragOffY) + "px";
        }
    });
    document.addEventListener("mouseup", function() { isDragging = false; });
}

function actionHistory_update() {
    var list = document.getElementById("action-history-list");
    if(!list || document.getElementById("action-history-window").style.display === "none") return;
    list.innerHTML = "";

    function makeItem(label, cls, clickFn) {
        var li = document.createElement("li");
        li.textContent = label || "(unnamed action)";
        li.className = cls;
        if(clickFn) {
            li.style.cursor = "pointer";
            li.addEventListener("click", clickFn);
        }
        return li;
    }

    for(var i = 0; i < aamap_undoStack.length; i++) {
        (function(idx) {
            // Undo enough steps so the current position marker ends up ABOVE this item.
            // stepsToUndo = length - idx means we undo all actions from index idx onward.
            var stepsToUndo = aamap_undoStack.length - idx;
            var li = makeItem(aamap_undoStack[idx].label, "ah-undo", function() {
                for(var s = 0; s < stepsToUndo; s++) aamap_undo();
                vectron_render();
            });
            list.appendChild(li);
        })(i);
    }
    var cur = document.createElement("li");
    cur.className = "ah-current";
    cur.textContent = "▶ current position";
    list.appendChild(cur);
    // redo items: redoStack[length-1] is first after current, redoStack[0] is last
    for(var j = aamap_redoStack.length - 1; j >= 0; j--) {
        (function(redoIdx, displayPos) {
            // Redo enough steps so the current position marker ends up AFTER this item.
            // displayPos + 1 steps includes the clicked item itself.
            var stepsToRedo = displayPos + 1;
            var li = makeItem(aamap_redoStack[redoIdx].label, "ah-redo", function() {
                for(var s = 0; s < stepsToRedo; s++) aamap_redo();
                vectron_render();
            });
            list.appendChild(li);
        })(j, aamap_redoStack.length - 1 - j);
    }
    // Scroll to current position marker
    cur.scrollIntoView({block: "nearest"});
}

function actionHistory_show() {
    var win = document.getElementById("action-history-window");
    win.style.display = "";
    actionHistory_update();
}

function actionHistory_hide() {
    document.getElementById("action-history-window").style.display = "none";
}

function gui_writeLog(message) {
    $('#debug_stream').append('<span>' + message + '</span');
    var element = document.getElementById("debug_stream");
    element.scrollTop = element.scrollHeight;
}

var _toast_timeout = null;
function gui_toast(message) {
    var toast = document.getElementById("vt-toast");
    if(!toast) {
        toast = document.createElement("div");
        toast.id = "vt-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "vt-toast-show";
    if(_toast_timeout) clearTimeout(_toast_timeout);
    _toast_timeout = setTimeout(function() {
        toast.className = "";
    }, 2200);
}

function gui_clearLog() {
    //$('#debug_stream').clear();
}

function gui_show() {
    map_active = false;
    gui_active = true;
    $('#control_box').show();
}

function gui_hide() {
    $('#control_box').hide();
    gui_active = false;
    map_active = true;
}

function gui_fillInput() {
    $("#map_name").val(xml_name);
    $("#map_author").val(xml_author)
    $("#map_category").val(xml_category);
    $("#map_version").val(xml_version)
    $("#map_dtd").val(xml_dtd);

    $("#map_axes").val(xml_axes);
    $("#map_settings").val(xml_settings.join("\n"));
}
