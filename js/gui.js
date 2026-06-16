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
var gui_floatingWindowRegistry = [];

var GUI_FLOATING_WINDOW_MARGIN = 8;

/** Clamp a window position so it stays fully within the viewport, does not overlap the 50px left toolbar, the 36px top settings bar, or the bottom info bar. */
function gui_clampToScreen(win, px, py) {
    var TOOLBAR_W = 50;
    var TOP_BAR_H = 36;
    var infoBar = document.getElementsByClassName("info")[0];
    var INFO_BAR_H = (infoBar && infoBar.style.display !== "none") ? 26 : 0;
    var w = win.offsetWidth || 0;
    var h = win.offsetHeight || 0;
    var maxX = Math.max(TOOLBAR_W + GUI_FLOATING_WINDOW_MARGIN, window.innerWidth - w - GUI_FLOATING_WINDOW_MARGIN);
    var maxY = Math.max(TOP_BAR_H + GUI_FLOATING_WINDOW_MARGIN, window.innerHeight - h - INFO_BAR_H - GUI_FLOATING_WINDOW_MARGIN);
    return [
        Math.max(TOOLBAR_W + GUI_FLOATING_WINDOW_MARGIN, Math.min(px, maxX)),
        Math.max(TOP_BAR_H + GUI_FLOATING_WINDOW_MARGIN, Math.min(py, maxY))
    ];
}

function gui_refreshFloatingWindowBounds(win) {
    if (!win) return;
    win.style.position = "fixed";
    win.style.maxWidth = "calc(100vw - 66px)";
    win.style.maxHeight = "calc(100vh - 82px)";
}

function gui_refreshFloatingWindows() {
    gui_floatingWindowRegistry.forEach(function(entry) {
        if (!entry || !entry.win || entry.win.style.display === "none") return;
        var rect = entry.win.getBoundingClientRect();
        gui_applyClampedPosition(entry.win, rect.left, rect.top);
        gui_refreshFloatingWindowBounds(entry.win);
    });
}

function gui_applyClampedPosition(win, left, top) {
    if (!win) return;
    var clamped = gui_clampToScreen(win, left, top);
    win.style.left = clamped[0] + "px";
    win.style.top = clamped[1] + "px";
}

function gui_applyWindowDefaultSize(win, entry) {
    if (!win || !entry) return;
    if (entry.defaultWidth) win.style.width = entry.defaultWidth + "px";
    if (entry.defaultHeight) win.style.height = entry.defaultHeight + "px";
}

function gui_resetFloatingWindowSize(win) {
    if (!win) return;
    var entry = gui_floatingWindowRegistry.find(function(item) { return item && item.win === win; });
    if (!entry) return;
    gui_applyWindowDefaultSize(win, entry);
    gui_refreshFloatingWindows();
}

function gui_setupFloatingWindow(opts) {
    var win = document.getElementById(opts.id);
    var header = document.getElementById(opts.headerId);
    var resetButton = opts.resetButtonId ? document.getElementById(opts.resetButtonId) : null;
    if (!win || !header) return;

    if (gui_floatingWindowRegistry.some(function(entry) { return entry.win === win; })) return;
    var entry = {
        win: win,
        order: opts.order || 0,
        defaultWidth: opts.defaultWidth || 0,
        defaultHeight: opts.defaultHeight || 0
    };
    gui_floatingWindowRegistry.push(entry);
    win.classList.add("vt-floating-window");
    gui_refreshFloatingWindowBounds(win);
    gui_applyWindowDefaultSize(win, entry);

    var dragging = false;
    var dragOffX = 0;
    var dragOffY = 0;

    function startDrag(e) {
        if (e.target && $(e.target).closest(".vt-window-action").length) return;
        if (e.which && e.which !== 1) return;
        var rect = win.getBoundingClientRect();
        dragging = true;
        dragOffX = e.clientX - rect.left;
        dragOffY = e.clientY - rect.top;
        win.style.right = "auto";
        win.style.bottom = "auto";
        e.preventDefault();
    }

    header.addEventListener("mousedown", startDrag);
    document.addEventListener("mousemove", function(e) {
        if (!dragging) return;
        var clamped = gui_clampToScreen(win, e.clientX - dragOffX, e.clientY - dragOffY);
        win.style.left = clamped[0] + "px";
        win.style.top = clamped[1] + "px";
    });
    document.addEventListener("mouseup", function() {
        if (!dragging) return;
        dragging = false;
        var rect = win.getBoundingClientRect();
        gui_applyClampedPosition(win, rect.left, rect.top);
    });

    if (resetButton) {
        resetButton.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            gui_resetFloatingWindowSize(win);
        });
    }
}

function gui_init() {
    gui_writeLog("Welcome to Vectron.")
    actionHistory_init();
    controlBox_initDrag();
    mapSettings_loadCSVs();
    gui_setupFloatingWindow({ id: "wall-tool-window", headerId: "wall-tool-header", resetButtonId: "wall-tool-reset-size", order: 1, defaultWidth: 340, defaultHeight: 420 });
    gui_setupFloatingWindow({ id: "zone-tool-window", headerId: "zone-tool-header", resetButtonId: "zone-tool-reset-size", order: 2, defaultWidth: 300, defaultHeight: 240 });
    gui_setupFloatingWindow({ id: "action-history-window", headerId: "action-history-header", resetButtonId: "action-history-reset-size", order: 3, defaultWidth: 220, defaultHeight: 240 });
    gui_refreshFloatingWindows();
    window.addEventListener("resize", gui_refreshFloatingWindows);
}

function controlBox_initDrag() {
    var box = document.getElementById('control_box');
    var handle = box ? box.querySelector('#control-box-header') : null;
    if (!box || !handle) return;
    var isDragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
    handle.addEventListener('mousedown', function(e) {
        if (e.target.id === 'control-box-close') return;
        // Switch from margin:auto centering to explicit positioning on first drag
        var rect = box.getBoundingClientRect();
        if (!box.style.left || box.style.left === '' || box.style.margin !== '0px') {
            box.style.left  = rect.left + 'px';
            box.style.top   = rect.top  + 'px';
            box.style.right  = 'auto';
            box.style.margin = '0';
        }
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = box.offsetLeft;
        origTop  = box.offsetTop;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        var clamped = gui_clampToScreen(box, origLeft + e.clientX - startX, origTop + e.clientY - startY);
        box.style.left = clamped[0] + 'px';
        box.style.top  = clamped[1] + 'px';
    });
    document.addEventListener('mouseup', function() { isDragging = false; });
}

function actionHistory_init() {
    gui_refreshFloatingWindows();
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
    gui_refreshFloatingWindows();
}

function actionHistory_hide() {
    document.getElementById("action-history-window").style.display = "none";
    gui_refreshFloatingWindows();
}

function gui_writeLog(message) {
    if (window.console && console.log) console.log(message);
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
    mapSettings_renderList();
}

// ---- Map Settings Search ----

var mapSettings_commands = []; // [{name, desc, defaultVal, versions:[]}]

function mapSettings_parseCSV(text) {
    var rows = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim()) continue;
        var fields = [];
        var cur = '', inQuote = false;
        for (var j = 0; j < line.length; j++) {
            var c = line[j];
            if (c === '"') {
                if (inQuote && line[j+1] === '"') { cur += '"'; j++; }
                else { inQuote = !inQuote; }
            } else if (c === ',' && !inQuote) {
                fields.push(cur); cur = '';
            } else {
                cur += c;
            }
        }
        fields.push(cur);
        rows.push(fields);
    }
    return rows;
}

function mapSettings_loadCSVs() {
    var files = [
        { url: vectron_assetUrl('js/0.2.8.3.1.csv'), version: '0.2.8.3.1' },
        { url: vectron_assetUrl('js/Trunk.csv'),      version: 'Trunk'      },
        { url: vectron_assetUrl('js/Sty+ct.csv'),     version: 'Sty+ct'     }
    ];
    var loaded = 0;
    var combined = {}; // name -> {desc, defaultVal, versions:[]}

    // Set up UI immediately; commands populate asynchronously
    mapSettings_initUI();

    files.forEach(function(f) {
        $.ajax({
            url: f.url,
            dataType: 'text',
            success: function(data) {
                var rows = mapSettings_parseCSV(data);
                // skip header row
                for (var i = 1; i < rows.length; i++) {
                    var row = rows[i];
                    if (!row[0] || !row[0].trim()) continue;
                    var name = row[0].trim().toUpperCase();
                    if (!combined[name]) {
                        combined[name] = { name: name, desc: (row[1] || '').trim(), defaultVal: (row[2] || '').trim(), versions: [] };
                    }
                    if (combined[name].versions.indexOf(f.version) < 0) {
                        combined[name].versions.push(f.version);
                    }
                }
            },
            complete: function() {
                loaded++;
                if (loaded === files.length) {
                    mapSettings_commands = Object.keys(combined).sort().map(function(k) { return combined[k]; });
                }
            }
        });
    });
}

function mapSettings_initUI() {
    var searchEl = document.getElementById('map-settings-search');
    var valueEl  = document.getElementById('map-settings-value');
    var dropdown = document.getElementById('map-settings-dropdown');
    var addBtn   = document.getElementById('map-settings-add');
    if (!searchEl) return;

    function showDropdown(results) {
        dropdown.innerHTML = '';
        if (!results.length) { dropdown.style.display = 'none'; return; }
        results.slice(0, 60).forEach(function(cmd) {
            var item = document.createElement('div');
            item.className = 'mss-item';
            item.style.cssText = 'padding:6px 8px;cursor:pointer;border-bottom:1px solid #eee;';

            var nameRow = document.createElement('div');
            nameRow.style.cssText = 'font-weight:bold;font-size:11px;font-family:monospace;color:#222;';
            nameRow.textContent = cmd.name;

            var descRow = document.createElement('div');
            descRow.style.cssText = 'font-size:10px;color:#555;font-family:sans-serif;white-space:normal;line-height:1.3;margin-top:1px;';
            descRow.textContent = cmd.desc || '(no description)';

            var metaRow = document.createElement('div');
            metaRow.style.cssText = 'margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;';

            cmd.versions.forEach(function(v) {
                var tag = document.createElement('span');
                tag.style.cssText = 'font-size:9px;background:#ddd;color:#444;border-radius:3px;padding:1px 4px;font-family:sans-serif;';
                tag.textContent = v;
                metaRow.appendChild(tag);
            });

            if (cmd.defaultVal !== '') {
                var defSpan = document.createElement('span');
                defSpan.style.cssText = 'font-size:9px;color:#888;font-family:sans-serif;margin-left:2px;';
                defSpan.textContent = 'default: ' + cmd.defaultVal;
                metaRow.appendChild(defSpan);
            }

            item.appendChild(nameRow);
            item.appendChild(descRow);
            item.appendChild(metaRow);

            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                searchEl.value = cmd.name;
                valueEl.value = cmd.defaultVal;
                dropdown.style.display = 'none';
                valueEl.focus();
            });
            item.addEventListener('mouseover', function() { item.style.background = '#f0f0ff'; });
            item.addEventListener('mouseout',  function() { item.style.background = ''; });

            dropdown.appendChild(item);
        });
        dropdown.style.display = 'block';
    }

    searchEl.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        if (!q) { dropdown.style.display = 'none'; return; }
        // If the query looks like "NAME VALUE" (has a space after an all-caps word) skip dropdown
        if (/^[A-Z_0-9]+\s/.test(this.value.trim())) { dropdown.style.display = 'none'; return; }
        var results = mapSettings_commands.filter(function(cmd) {
            return cmd.name.toLowerCase().indexOf(q) >= 0 ||
                   (cmd.desc && cmd.desc.toLowerCase().indexOf(q) >= 0);
        });
        showDropdown(results);
    });

    searchEl.addEventListener('blur', function() {
        setTimeout(function() { dropdown.style.display = 'none'; }, 150);
    });

    searchEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); mapSettings_addFromUI(); }
        if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    });

    valueEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); mapSettings_addFromUI(); }
    });

    addBtn.addEventListener('click', function() { mapSettings_addFromUI(); });

    mapSettings_renderList();
}

function mapSettings_addFromUI() {
    var searchEl = document.getElementById('map-settings-search');
    var valueEl  = document.getElementById('map-settings-value');
    if (!searchEl) return;

    function releaseInputFocus() {
       searchEl.blur();
       if (valueEl) valueEl.blur();
    }

    var raw = searchEl.value.trim();
    if (!raw) { releaseInputFocus(); return; }

    var entry;
    // If there's already a space, treat the whole thing as "NAME VALUE"
    if (raw.indexOf(' ') >= 0) {
        entry = raw;
    } else {
        // Use separate value field
        var val = valueEl ? valueEl.value.trim() : '';
        if (!val) { gui_toast('Please enter a value.'); releaseInputFocus(); return; }
        entry = raw + ' ' + val;
    }

    // Avoid duplicates by name
    var spaceIdx = entry.indexOf(' ');
    if (spaceIdx < 0) { gui_toast('Invalid setting format. Use: NAME VALUE'); releaseInputFocus(); return; }
    var namePart = entry.slice(0, spaceIdx).toUpperCase();
    for (var i = 0; i < xml_settings.length; i++) {
        var existingSpace = xml_settings[i].indexOf(' ');
        var existingName = existingSpace >= 0 ? xml_settings[i].slice(0, existingSpace).toUpperCase() : xml_settings[i].toUpperCase();
        if (existingName === namePart) {
            gui_toast('Setting "' + namePart + '" already exists. Remove it first.');
            releaseInputFocus();
            return;
        }
    }

    xml_settings.push(entry);
    mapSettings_syncTextarea();
    mapSettings_renderList();
    searchEl.value = '';
    if (valueEl) valueEl.value = '';
    document.getElementById('map-settings-dropdown').style.display = 'none';
    releaseInputFocus();
}

function mapSettings_removeEntry(idx) {
    xml_settings.splice(idx, 1);
    mapSettings_syncTextarea();
    mapSettings_renderList();
}

function mapSettings_syncTextarea() {
    var ta = document.getElementById('map_settings');
    if (ta) ta.value = xml_settings.join('\n');
}

function mapSettings_renderList() {
    var list = document.getElementById('map-settings-list');
    var empty = document.getElementById('map-settings-empty');
    if (!list) return;

    // Remove all entry rows (keep the empty placeholder)
    var existing = list.querySelectorAll('.mss-entry');
    existing.forEach(function(el) { el.parentNode.removeChild(el); });

    if (xml_settings.length === 0) {
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    for (var i = 0; i < xml_settings.length; i++) {
        (function(idx) {
            var row = document.createElement('div');
            row.className = 'mss-entry';
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 2px;border-bottom:1px solid rgba(0,0,0,0.07);';

            var text = document.createElement('span');
            text.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            text.textContent = xml_settings[idx];
            text.title = xml_settings[idx];

            var btn = document.createElement('button');
            btn.textContent = '×';
            btn.title = 'Remove';
            btn.style.cssText = 'border:none;background:transparent;color:#c00;font-size:14px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;';
            btn.addEventListener('click', function() { mapSettings_removeEntry(idx); });

            row.appendChild(text);
            row.appendChild(btn);
            list.appendChild(row);
        })(i);
    }
}
