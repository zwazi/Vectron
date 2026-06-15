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


var config_isDark = false;
var config_scrollWheelZoom = true;
var config_snapToPosition = true;
var config_autoAdjustGridSpacing = true;
var config_zoomStep = 0.02; // scroll wheel zoom step (fraction): 0.02 = finest

// Grid line appearance (empty string = use theme default)
var config_gridNarrowColor     = '';
var config_gridTenthColor      = '';
var config_gridAxisXColor      = '';
var config_gridAxisYColor      = '';
var config_gridNarrowThickness = 0; // 0 = use default (1)
var config_gridTenthThickness  = 0; // 0 = use default (1)
var config_gridAxisXThickness  = 0; // 0 = use default (1)
var config_gridAxisYThickness  = 0; // 0 = use default (1)
// Default until config_load() replaces it with saved state or stored default.
var config_gridLayout          = 'square';
var GRID_LAYOUT_EPSILON        = 1e-6;
var GRID_LAYOUT_LINE_PADDING   = 1.2;

function gridLayout_getLineAngles(layout) {
    switch(layout) {
        case 'hex':
        case 'triangle':
            // Both layouts use the same 60° line families; only the visual
            // interpretation of the cells differs.
            return [0, Math.PI / 3, 2 * Math.PI / 3];
        case 'octagon':
            return [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
        case 'penta':
            return [0, Math.PI / 5, 2 * Math.PI / 5, 3 * Math.PI / 5, 4 * Math.PI / 5];
        case 'square':
        default:
            return [0, Math.PI / 2];
    }
}

/**
 * Snap a screen-space cursor position to the nearest intersection of the
 * active grid layout's line families.
 *
 * @param {number} x Screen-space x coordinate.
 * @param {number} y Screen-space y coordinate.
 * @param {number} spacing Distance between adjacent grid lines.
 * @param {number} originX Screen-space x position of the map origin.
 * @param {number} originY Screen-space y position of the map origin.
 * @returns {{x:number, y:number}} Screen-space snapped position.
 */
function gridLayout_snapPoint(x, y, spacing, originX, originY) {
    var families = gridLayout_getLineAngles(config_gridLayout);
    var relX = x - originX;
    var relY = y - originY;
    var bestX = relX;
    var bestY = relY;
    var bestDist = Infinity;
    var lineValues = [];

    for(var i = 0; i < families.length; i++) {
        var angle = families[i];
        // The normal vector is perpendicular to the line direction, so dotting
        // it with the point gives the signed distance from the origin-facing line.
        var nx = -Math.sin(angle);
        var ny = Math.cos(angle);
        lineValues[i] = Math.round((relX * nx + relY * ny) / spacing) * spacing;
    }

    for(var a = 0; a < families.length; a++) {
        for(var b = a + 1; b < families.length; b++) {
            var angleA = families[a], angleB = families[b];
            var ax = -Math.sin(angleA), ay = Math.cos(angleA);
            var bx = -Math.sin(angleB), by = Math.cos(angleB);
            var det = ax * by - ay * bx;
            if(Math.abs(det) < GRID_LAYOUT_EPSILON) continue;

            var px = (lineValues[a] * by - ay * lineValues[b]) / det;
            var py = (ax * lineValues[b] - lineValues[a] * bx) / det;
            var dist = (px - relX) * (px - relX) + (py - relY) * (py - relY);
            if(dist < bestDist) {
                bestDist = dist;
                bestX = px;
                bestY = py;
            }
        }
    }

    return {
        x: originX + bestX,
        y: originY + bestY
    };
}

// default values:
function _config_check_default(item)
{
    switch(item)
    {
        case "darkTheme": return "true";
        case "showInfoBar": return "true";
        case "showDebug": return "false";
        case "showActionHistory": return "true";
        case "zoomStep": return "0.02";
    }
}



function _config_get(item)
{
    if(window.localStorage)
    {
        return localStorage.getItem(item);
    }
    else if(window.sessionStorage)
    {
        return sessionStorage.getItem(item);
    }
    else
    {
        if(!window._localStorage) window._localStorage = {};
        if(window._localStorage[item] === undefined) return null;
        else return window._localStorage[item];
    }
}

function _config_set(item,value)
{
    if(window.localStorage)
    {
        return localStorage.setItem(item,value);
    }
    else if(window.sessionStorage)
    {
        return sessionStorage.setItem(item,value);
    }
    else
    {
        if(!window._localStorage) window._localStorage = {};
        window._localStorage[item] = value;
    }
}

function _config_check(item)
{
    var value = _config_get(item);
    if(value === null)
        value = _config_check_default(item);

    return (value=="true");
}

function _config_set_enable(item)
{
    return _config_set(item,"true");
}
function _config_set_disable(item)
{
    return _config_set(item,"false");
}



// ---- Keybinds ----
var vectron_defaultKeybinds = {
    select: '1',
    navigation: '2',
    wall: '3',
    zone: '4',
    spawn: '5',
    snap: '6',
    split: '7',
    join: '8',
    wallVertexMove: '0'
};
var vectron_keybinds = {};

function keybinds_load() {
    var saved = _config_get('keybinds');
    if (saved) {
        try { vectron_keybinds = JSON.parse(saved); } catch(e) {}
    }
    // fill in any missing defaults
    for (var k in vectron_defaultKeybinds) {
        if (!vectron_keybinds[k]) vectron_keybinds[k] = vectron_defaultKeybinds[k];
    }
}

function keybinds_save() {
    _config_set('keybinds', JSON.stringify(vectron_keybinds));
}

function keybinds_apply() {
    // unbind all previously managed keybinds then re-bind
    var allKeys = new Set();
    for (var k in vectron_defaultKeybinds) allKeys.add(vectron_defaultKeybinds[k]);
    for (var k in vectron_keybinds)        allKeys.add(vectron_keybinds[k]);
    // unbind all tool keys
    allKeys.forEach(function(key) {
        try { Mousetrap.unbind(key); } catch(e) {}
    });

    function bindKey(key, fn) {
        if (!key) return;
        Mousetrap.bind(key, function(e) {
            if (!aamap_active) return;
            fn();
        }, 'keydown');
    }

    bindKey(vectron_keybinds.select,     function(){ vectron_connectTool('select'); });
    bindKey(vectron_keybinds.navigation, function(){ vectron_connectTool('navigation'); });
    bindKey(vectron_keybinds.wall,       function(){ vectron_connectTool('wall'); });
    bindKey(vectron_keybinds.zone,       function(){ if(vectron_currentTool!='zone') vectron_connectTool('zone'); });
    bindKey(vectron_keybinds.spawn,      function(){ vectron_connectTool('spawn'); });
    bindKey(vectron_keybinds.snap,       function(){
        cursor_snap = !cursor_snap;
        if(cursor_snap){
            $('.toolbar-toolUnlock-list').hide();
            $('.toolbar-toolLock-list').show();
        } else {
            $('.toolbar-toolLock-list').hide();
            $('.toolbar-toolUnlock-list').show();
        }
    });
    bindKey(vectron_keybinds.split,           function(){ vectron_connectTool('split'); });
    bindKey(vectron_keybinds.join,            function(){ vectron_connectTool('join'); });
    bindKey(vectron_keybinds.wallVertexMove,  function(){ vectron_connectTool('wallVertexMove'); });

    keybinds_updateOverlays();
}

function keybinds_updateOverlays() {
    // update small key-label overlays on toolbar buttons
    var map = {
        select:         '.toolbar-toolSelect',
        navigation:     '.toolbar-toolNavigation',
        wall:           '.toolbar-toolWall',
        zone:           '.toolbar-toolZone',
        spawn:          '.toolbar-toolSpawn',
        snap:           '.toolbar-toolLock, .toolbar-toolUnlock',
        split:          '.toolbar-toolSplit',
        join:           '.toolbar-toolJoin',
        wallVertexMove: '.toolbar-toolWallVertexMove'
    };
    for (var action in map) {
        var key = vectron_keybinds[action] || '';
        $(map[action]).each(function() {
            $(this).find('.keybind-overlay').remove();
            if (key) {
                $(this).append('<span class="keybind-overlay">' + key + '</span>');
            }
        });
    }
}

function config_load()
{
    // load values without changing anything
    if(_config_check("darkTheme"))
        enable_dark_theme(true);
    
    if(_config_check("showInfoBar"))
        show_info_bar(true);
    
    if(_config_check("showDebug"))
        show_debug(true);
    else
        hide_debug(true);

    if(_config_check("showActionHistory"))
    {
        actionHistory_show();
        document.getElementById("show-action-history").checked = true;
    }

    var savedZoomStep = parseFloat(_config_get("zoomStep"));
    if(!isNaN(savedZoomStep) && savedZoomStep > 0) {
        config_zoomStep = savedZoomStep;
        var sel = document.getElementById("zoom-step-select");
        if(sel) sel.value = String(savedZoomStep);
    }

    // Load grid line appearance settings
    config_gridNarrowColor     = _config_get('gridNarrowColor')     || '';
    config_gridTenthColor      = _config_get('gridTenthColor')      || '';
    config_gridAxisXColor      = _config_get('gridAxisXColor')      || '';
    config_gridAxisYColor      = _config_get('gridAxisYColor')      || '';
    config_gridNarrowThickness = parseFloat(_config_get('gridNarrowThickness')) || 0;
    config_gridTenthThickness  = parseFloat(_config_get('gridTenthThickness'))  || 0;
    config_gridAxisXThickness  = parseFloat(_config_get('gridAxisXThickness'))  || 0;
    config_gridAxisYThickness  = parseFloat(_config_get('gridAxisYThickness'))  || 0;
    config_gridLayout          = _config_get('gridLayout') || 'square';
    var gridLayoutSelect = document.getElementById('grid-layout-select');
    if(gridLayoutSelect) gridLayoutSelect.value = config_gridLayout;

    keybinds_load();
    keybinds_apply();
    keybinds_buildUI();
    gridConfig_buildUI();
}


var __darktheme_has_loaded = false;
function enable_dark_theme(noset)
{
    var theme = document.getElementById("theme");
    if("onload" in theme && !__darktheme_has_loaded)
    {
        theme.onload = function()
        {
            config_isDark = true;
            __darktheme_has_loaded = true;
            vectron_render();
        };
    }
    else
    {
        config_isDark = true;
        vectron_render();
    }
    theme.href = "./css/vectron-dark.css";
    
    document.getElementById("dark-theme").checked = true;
    if(!noset) _config_set_enable("darkTheme");
}
function disable_dark_theme(noset)
{
    var theme = document.getElementById("theme");
    if(theme.onload) theme.onload = null;
    theme.href = "";
    
    config_isDark = false;
    vectron_render();
    
    document.getElementById("dark-theme").checked = false;
    if(!noset) _config_set_disable("darkTheme");
}

function show_info_bar(noset)
{
    document.getElementsByClassName("info")[0].style.display = "flex";
    document.getElementById("canvas_container").style.bottom = "26px";
    vectron_render();
    
    document.getElementById("show-info-bar").checked = true;
    if(!noset) _config_set_enable("showInfoBar");
}
function hide_info_bar(noset)
{
    document.getElementsByClassName("info")[0].style.display = "none";
    document.getElementById("canvas_container").style.bottom = "";
    vectron_render();
    
    document.getElementById("show-info-bar").checked = false;
    if(!noset) _config_set_disable("showInfoBar");
}

function show_debug(noset)
{
    document.getElementById("debug_box").style.display = "block";
    
    document.getElementById("show-debug-panel").checked = true;
    if(!noset) _config_set_enable("showDebug");
}
function hide_debug(noset)
{
    document.getElementById("debug_box").style.display = "none";
    
    document.getElementById("show-debug-panel").checked = false;
    if(!noset) _config_set_disable("showDebug");
}

function keybinds_buildUI() {
    var container = document.getElementById('keybinds-config');
    if (!container) return;
    container.innerHTML = '';

    var labels = {
        select: 'Select', navigation: 'Navigation', wall: 'Wall',
        zone: 'Zone', spawn: 'Spawn', snap: 'Snap',
        split: 'Split', join: 'Join', wallVertexMove: 'Vertex Move'
    };

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:8px;';

    Object.keys(labels).forEach(function(action) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;';

        var lbl = document.createElement('label');
        lbl.textContent = labels[action];
        lbl.style.cssText = 'width:82px;margin:0;font-size:12px;';

        var inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 3;
        inp.value = vectron_keybinds[action] || '';
        inp.className = 'form-control';
        inp.style.cssText = 'width:50px;font-family:monospace;display:inline-block;';
        inp.dataset.action = action;

        var btn = document.createElement('button');
        btn.textContent = '↺';
        btn.title = 'Reset';
        btn.setAttribute('aria-label', 'Reset keybind for ' + labels[action]);
        btn.className = 'btn btn-xs btn-default';
        btn.style.marginLeft = '4px';

        // Only show reset button if current value differs from default
        var defVal = vectron_defaultKeybinds[action] || '';
        btn.style.display = (inp.value !== defVal) ? '' : 'none';

        btn.onclick = (function(a, i, b) {
            return function() {
                i.value = vectron_defaultKeybinds[a] || '';
                b.style.display = 'none';
            };
        })(action, inp, btn);

        inp.addEventListener('input', (function(a, i, b) {
            return function() {
                var def = vectron_defaultKeybinds[a] || '';
                b.style.display = (i.value !== def) ? '' : 'none';
            };
        })(action, inp, btn));

        row.appendChild(lbl);
        row.appendChild(inp);
        row.appendChild(btn);
        grid.appendChild(row);
    });

    container.appendChild(grid);

    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply Keybinds';
    saveBtn.className = 'btn btn-sm btn-primary';
    saveBtn.onclick = function() {
        var inputs = container.querySelectorAll('input[data-action]');
        inputs.forEach(function(inp) {
            vectron_keybinds[inp.dataset.action] = inp.value.trim() || '';
        });
        keybinds_save();
        keybinds_apply();
        keybinds_buildUI(); // refresh to update reset button visibility
    };
    container.appendChild(saveBtn);
}

function gridConfig_buildUI() {
    var container = document.getElementById('grid-config');
    if(!container) return;
    container.innerHTML = '';

    // Default values for comparison
    var defaultNarrowLight = '#d6d6ec', defaultNarrowDark = '#1a1a1a';
    var defaultAxisX = '#2244cc', defaultAxisY = '#cc2222';
    var defaultThickNarrow = 1, defaultThickTenth = 1, defaultThickX = 1, defaultThickY = 1;

    function getDefaultNarrowColor() { return config_isDark ? defaultNarrowDark : defaultNarrowLight; }
    function getDefaultTenthColor()  { return getDefaultNarrowColor(); }

    var rows = [
        { label: 'Narrow lines', colorKey: 'gridNarrowColor', thickKey: 'gridNarrowThickness',
          defaultColor: getDefaultNarrowColor, defaultThick: defaultThickNarrow },
        { label: 'Every 10th line', colorKey: 'gridTenthColor', thickKey: 'gridTenthThickness',
          defaultColor: function(){ return '#7f7f7f'; }, defaultThick: defaultThickTenth },
        { label: 'X axis (y=0)', colorKey: 'gridAxisXColor', thickKey: 'gridAxisXThickness',
          defaultColor: function(){ return defaultAxisX; }, defaultThick: defaultThickX },
        { label: 'Y axis (x=0)', colorKey: 'gridAxisYColor', thickKey: 'gridAxisYThickness',
          defaultColor: function(){ return defaultAxisY; }, defaultThick: defaultThickY },
    ];

    // Header row
    var headerDiv = document.createElement('div');
    headerDiv.className = 'grid-cfg-header';
    ['Line Type','Color','Thickness (px)'].forEach(function(h) {
        var span = document.createElement('span');
        span.textContent = h;
        headerDiv.appendChild(span);
    });
    container.appendChild(headerDiv);

    rows.forEach(function(row) {
        var rowDiv = document.createElement('div');
        rowDiv.className = 'grid-cfg-row';

        // Label cell
        var labelSpan = document.createElement('span');
        labelSpan.textContent = row.label;
        labelSpan.className = 'grid-cfg-label';
        rowDiv.appendChild(labelSpan);

        // Color cell
        var colorCell = document.createElement('div');
        colorCell.className = 'grid-cfg-cell';

        var colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.id = 'cfg-' + row.colorKey;
        var savedColor = _config_get(row.colorKey);
        colorInp.value = savedColor || row.defaultColor();
        colorInp.style.cssText = 'width:50px;height:26px;padding:1px 2px;border:1px solid #aaa;border-radius:3px;cursor:pointer;background:transparent;';

        var colorResetBtn = document.createElement('button');
        colorResetBtn.textContent = '↺';
        colorResetBtn.title = 'Reset to default';
        colorResetBtn.className = 'btn btn-xs btn-default';

        function updateColorResetVisibility() {
            colorResetBtn.style.display = (colorInp.value !== row.defaultColor()) ? '' : 'none';
        }
        updateColorResetVisibility();

        colorInp.onchange = (function(key, inp, defFn, resetBtn) {
            return function() {
                var val = inp.value;
                window['config_' + key] = (val === defFn()) ? '' : val;
                _config_set(key, val);
                resetBtn.style.display = (val !== defFn()) ? '' : 'none';
                vectron_render();
            };
        })(row.colorKey, colorInp, row.defaultColor, colorResetBtn);

        colorResetBtn.onclick = (function(key, inp, defFn, resetBtn) {
            return function() {
                window['config_' + key] = '';
                _config_set(key, '');
                inp.value = defFn();
                resetBtn.style.display = 'none';
                vectron_render();
            };
        })(row.colorKey, colorInp, row.defaultColor, colorResetBtn);

        colorCell.appendChild(colorInp);
        colorCell.appendChild(colorResetBtn);
        rowDiv.appendChild(colorCell);

        // Thickness cell
        var thickCell = document.createElement('div');
        thickCell.className = 'grid-cfg-cell';

        var thickInp = document.createElement('input');
        thickInp.type = 'number';
        thickInp.id = 'cfg-' + row.thickKey;
        thickInp.min = '0.1'; thickInp.max = '10'; thickInp.step = '0.5';
        var savedThick = parseFloat(_config_get(row.thickKey));
        thickInp.value = (savedThick > 0) ? savedThick : row.defaultThick;
        thickInp.className = 'form-control';
        thickInp.style.cssText = 'width:72px;height:26px;padding:2px 6px;display:inline-block;';

        var thickResetBtn = document.createElement('button');
        thickResetBtn.textContent = '↺';
        thickResetBtn.title = 'Reset to default';
        thickResetBtn.className = 'btn btn-xs btn-default';

        function updateThickResetVisibility() {
            thickResetBtn.style.display = (parseFloat(thickInp.value) !== row.defaultThick) ? '' : 'none';
        }
        updateThickResetVisibility();

        thickInp.onchange = (function(key, inp, defThick, resetBtn) {
            return function() {
                var v = parseFloat(inp.value);
                if(isNaN(v) || v <= 0) { v = defThick; inp.value = defThick; }
                window['config_' + key] = (v === defThick) ? 0 : v;
                _config_set(key, String(v));
                resetBtn.style.display = (v !== defThick) ? '' : 'none';
                vectron_render();
            };
        })(row.thickKey, thickInp, row.defaultThick, thickResetBtn);

        thickResetBtn.onclick = (function(key, inp, defThick, resetBtn) {
            return function() {
                window['config_' + key] = 0;
                _config_set(key, String(defThick));
                inp.value = defThick;
                resetBtn.style.display = 'none';
                vectron_render();
            };
        })(row.thickKey, thickInp, row.defaultThick, thickResetBtn);

        thickCell.appendChild(thickInp);
        thickCell.appendChild(thickResetBtn);
        rowDiv.appendChild(thickCell);

        container.appendChild(rowDiv);
    });
}
