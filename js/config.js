/*
********************************************************************************
Vectron - map editor for Arma Racing.
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


// Vectron has one visual contract: the dark canvas/editor palette. Keeping the
// flag true preserves the older object render helpers without retaining a
// user-selectable light theme or any light-theme state transitions.
var config_isDark = true;
var config_scrollWheelZoom = true;
var config_snapToPosition = true;
var config_autoAdjustGridSpacing = true;
var config_zoomStep = 0.10; // scroll wheel zoom step (fraction): 0.10 = 10%

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
var GRID_LAYOUT_VALID_LAYOUTS  = ['square', 'triangle', 'diamond', 'crisscross'];

function gridLayout_getLineFamilies(layout, spacing) {
    switch(layout) {
        case 'triangle':
            return [
                { angle: 0, spacing: spacing },
                { angle: Math.PI / 3, spacing: spacing },
                { angle: 2 * Math.PI / 3, spacing: spacing }
            ];
        case 'diamond':
            return [
                { angle: Math.PI / 4, spacing: spacing },
                { angle: 3 * Math.PI / 4, spacing: spacing }
            ];
        case 'crisscross':
            return [
                { angle: 0, spacing: spacing },
                { angle: Math.PI / 2, spacing: spacing },
                { angle: Math.PI / 4, spacing: spacing / Math.SQRT2 },
                { angle: 3 * Math.PI / 4, spacing: spacing / Math.SQRT2 }
            ];
        case 'square':
        default:
            return [
                { angle: 0, spacing: spacing },
                { angle: Math.PI / 2, spacing: spacing }
            ];
    }
}

function gridLayout_getLineAngles(layout) {
    return gridLayout_getLineFamilies(layout, 1).map(function(family) {
        return family.angle;
    });
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
    var families = gridLayout_getLineFamilies(config_gridLayout, spacing);
    var relX = x - originX;
    var relY = y - originY;
    var bestX = relX;
    var bestY = relY;
    var bestDist = Infinity;
    var lineValues = [];

    for(var i = 0; i < families.length; i++) {
        var angle = families[i].angle;
        var familySpacing = families[i].spacing;
        // The normal vector is perpendicular to the line direction, so dotting
        // it with the point gives the signed distance from the origin-facing line.
        var nx = -Math.sin(angle);
        var ny = Math.cos(angle);
        lineValues[i] = Math.round((relX * nx + relY * ny) / familySpacing) * familySpacing;
    }

    for(var a = 0; a < families.length; a++) {
        for(var b = a + 1; b < families.length; b++) {
            var angleA = families[a].angle, angleB = families[b].angle;
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
        case "showInfoBar": return "true";
        case "showActionHistory": return "true";
        case "zoomStep": return "0.10";
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
    wall: '2',
    floor: '3',
    zone: '4',
    spawn: '5',
    ramp: '6',
    split: '7',
    join: '8',
    wallVertexMove: '9'
};
var vectron_keybinds = {};
var vectron_sShortcutCount = 0;
var vectron_sShortcutLastTime = 0;
var VECTRON_S_SHORTCUT_INTERVAL_MS = 450;

function keybinds_load() {
    // Tool shortcuts are deliberately fixed so maps can be edited with the
    // same muscle memory on every Vectron installation. Discard legacy saved
    // bindings from versions which exposed these keys as preferences.
    vectron_keybinds = {};
    for (var k in vectron_defaultKeybinds) {
        vectron_keybinds[k] = vectron_defaultKeybinds[k];
    }
    _config_set('keybinds', JSON.stringify(vectron_keybinds));
}

function keybinds_nextSAction(now) {
    now = Number(now);
    if(!isFinite(now)) now = Date.now();
    if(now - vectron_sShortcutLastTime > VECTRON_S_SHORTCUT_INTERVAL_MS ||
        now < vectron_sShortcutLastTime) {
        vectron_sShortcutCount = 0;
    }
    vectron_sShortcutLastTime = now;
    vectron_sShortcutCount = (vectron_sShortcutCount % 3) + 1;
    return ["select", "spawn", "split"][vectron_sShortcutCount - 1];
}

function keybinds_resetSSequence() {
    vectron_sShortcutCount = 0;
    vectron_sShortcutLastTime = 0;
}

function keybinds_apply() {
    // unbind all previously managed keybinds then re-bind
    var allKeys = new Set();
    for (var k in vectron_defaultKeybinds) allKeys.add(vectron_defaultKeybinds[k]);
    for (var k in vectron_keybinds)        allKeys.add(vectron_keybinds[k]);
    ["w", "f", "z", "r", "j", "v", "s"].forEach(function(key) {
        allKeys.add(key);
    });
    // unbind all tool keys
    allKeys.forEach(function(key) {
        try { Mousetrap.unbind(key); } catch(e) {}
    });

    function bindKey(key, fn, continuesSSequence) {
        if (!key) return;
        Mousetrap.bind(key, function(e) {
            if (!aamap_active) return;
            if(typeof preview3d_opened !== "undefined" && preview3d_opened) return;
            if(!continuesSSequence) keybinds_resetSSequence();
            fn(e);
            return false;
        }, 'keydown');
    }

    bindKey(vectron_keybinds.select,     function(){ vectron_connectTool('select'); });
    bindKey(vectron_keybinds.wall,       function(){ vectron_connectTool('wall'); });
    bindKey(vectron_keybinds.floor,      function(){ vectron_connectTool('floor'); });
    bindKey(vectron_keybinds.zone,       function(){ if(vectron_currentTool!='zone') vectron_connectTool('zone'); });
    bindKey(vectron_keybinds.spawn,      function(){ vectron_connectTool('spawn'); });
    bindKey(vectron_keybinds.split,           function(){ vectron_connectTool('split'); });
    bindKey(vectron_keybinds.join,            function(){ vectron_connectTool('join'); });
    bindKey(vectron_keybinds.ramp,            function(){ vectron_connectTool('ramp'); });
    bindKey(vectron_keybinds.wallVertexMove,  function(){ vectron_connectTool('wallVertexMove'); });

    // Letter aliases. S is intentionally a rapid-tap cycle: S selects,
    // S,S chooses Spawn, and S,S,S chooses Split Wall.
    bindKey('w', function(){ vectron_connectTool('wall'); });
    bindKey('f', function(){ vectron_connectTool('floor'); });
    bindKey('z', function(){ if(vectron_currentTool!='zone') vectron_connectTool('zone'); });
    bindKey('r', function(){ vectron_connectTool('ramp'); });
    bindKey('j', function(){ vectron_connectTool('join'); });
    bindKey('v', function(){ vectron_connectTool('wallVertexMove'); });
    bindKey('s', function(e){
        if(e && e.repeat) return;
        vectron_connectTool(keybinds_nextSAction(Date.now()));
    }, true);

    keybinds_updateOverlays();
}

function keybinds_updateOverlays() {
    // update small key-label overlays on toolbar buttons
    var map = {
        select:         '.toolbar-toolSelect',
        wall:           '.toolbar-toolWall',
        floor:          '.toolbar-toolFloor',
        zone:           '.toolbar-toolZone',
        spawn:          '.toolbar-toolSpawn',
        split:          '.toolbar-toolSplit',
        join:           '.toolbar-toolJoin',
        ramp:           '.toolbar-toolRamp',
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
    if(_config_check("showInfoBar"))
        show_info_bar(true);

    if(_config_check("showActionHistory"))
    {
        actionHistory_show();
        document.getElementById("show-action-history").checked = true;
    }

    var savedZoomStep = parseFloat(_config_get("zoomStep") ||
        _config_check_default("zoomStep"));
    if(!isNaN(savedZoomStep) && savedZoomStep > 0) {
        config_zoomStep = savedZoomStep;
        var sel = document.getElementById("zoom-step-select");
        if(sel) sel.value = savedZoomStep.toFixed(2);
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
    if(GRID_LAYOUT_VALID_LAYOUTS.indexOf(config_gridLayout) < 0) {
        config_gridLayout = 'square';
        _config_set('gridLayout', config_gridLayout);
    }
    var gridLayoutSelect = document.getElementById('grid-layout-select');
    if(gridLayoutSelect) gridLayoutSelect.value = config_gridLayout;

    keybinds_load();
    keybinds_apply();
    gridConfig_buildUI();
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

function gridConfig_buildUI() {
    var container = document.getElementById('grid-config');
    if(!container) return;
    container.innerHTML = '';

    // Default values for comparison
    var defaultNarrowDark = '#1a1a1a';
    var defaultAxisX = '#2244cc', defaultAxisY = '#cc2222';
    var defaultThickNarrow = 1, defaultThickTenth = 0.5, defaultThickX = 1, defaultThickY = 1;

    function getDefaultNarrowColor() { return defaultNarrowDark; }
    function getDefaultTenthColor()  { return getDefaultNarrowColor(); }

    var rows = [
        { label: 'Narrow lines', colorKey: 'gridNarrowColor', thickKey: 'gridNarrowThickness',
          defaultColor: getDefaultNarrowColor, defaultThick: defaultThickNarrow },
        { label: 'Every 10th line', colorKey: 'gridTenthColor', thickKey: 'gridTenthThickness',
          defaultColor: getDefaultTenthColor, defaultThick: defaultThickTenth },
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
