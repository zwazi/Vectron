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
var config_gridNarrowThickness = 0; // 0 = auto
var config_gridTenthThickness  = 0; // 0 = auto (2× narrow)
var config_gridOriginThickness = 0; // 0 = auto (same as narrow)

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
    wallVertexMove: '0',
    info: '9'
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
    bindKey(vectron_keybinds.info,       function(){
        if(!gui_active) { gui_show(); $('.toolbar-gui-open').hide(); $('.toolbar-gui-close').show(); }
        $('a[href="#gui-about"]').click();
    });

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
        wallVertexMove: '.toolbar-toolWallVertexMove',
        info:           '.toolbar-toolInfo'
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
    
    if(!_config_check("showDebug"))
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
    config_gridOriginThickness = parseFloat(_config_get('gridOriginThickness')) || 0;

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
    document.getElementById("debug_box").style.display = "";
    
    document.getElementById("show-debug-panel").checked = true;
    if(!noset) _config_set_enable("showDebug");
}
function hide_debug(noset)
{
    document.getElementById("debug_box").style.display = "none";
    
    document.getElementById("show-debug-panel").checked = false;
    if(!noset) _config_set_disable("showDebug");
}

function keybinds_buildUI() {    var container = document.getElementById('keybinds-config');
    if (!container) return;
    container.innerHTML = '';

    var labels = {
        select: 'Select', navigation: 'Navigation', wall: 'Wall',
        zone: 'Zone', spawn: 'Spawn', snap: 'Snap',
        split: 'Split', join: 'Join', wallVertexMove: 'Vertex Move', info: 'Info'
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
        inp.style.cssText = 'width:50px;padding:2px 4px;font-family:monospace;';
        inp.dataset.action = action;

        var btn = document.createElement('button');
        btn.textContent = '↺';
        btn.title = 'Reset';
        btn.setAttribute('aria-label', 'Reset keybind for ' + labels[action]);
        btn.className = 'btn btn-xs btn-default';
        btn.style.marginLeft = '4px';
        btn.onclick = (function(a, i) {
            return function() {
                i.value = vectron_defaultKeybinds[a] || '';
            };
        })(action, inp);

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
    };
    container.appendChild(saveBtn);
}

function gridConfig_buildUI() {
    var container = document.getElementById('grid-config');
    if(!container) return;
    container.innerHTML = '';

    var defaultNarrowLight = '#d6d6ec', defaultNarrowDark = '#1a1a1a';
    var defaultTenthLight  = '#fff',    defaultTenthDark  = '#444';
    var defaultAxisX = '#2244cc', defaultAxisY = '#cc2222';

    var rows = [
        { label: 'Narrow lines', colorKey: 'gridNarrowColor', thickKey: 'gridNarrowThickness',
          defaultColor: function(){ return config_isDark ? defaultNarrowDark : defaultNarrowLight; } },
        { label: 'Every 10th line', colorKey: 'gridTenthColor', thickKey: 'gridTenthThickness',
          defaultColor: function(){ return config_isDark ? defaultTenthDark : defaultTenthLight; } },
        { label: 'X axis (y=0)', colorKey: 'gridAxisXColor', thickKey: null,
          defaultColor: function(){ return defaultAxisX; } },
        { label: 'Y axis (x=0)', colorKey: 'gridAxisYColor', thickKey: null,
          defaultColor: function(){ return defaultAxisY; } },
        { label: 'Origin thickness', colorKey: null, thickKey: 'gridOriginThickness',
          defaultColor: null },
    ];

    var table = document.createElement('table');
    table.style.cssText = 'width:100%;font-size:12px;border-collapse:collapse;';
    var thead = document.createElement('tr');
    ['Line Type','Color','Thickness (px)'].forEach(function(h) {
        var th = document.createElement('th');
        th.textContent = h;
        th.style.cssText = 'text-align:left;padding:2px 4px;border-bottom:1px solid #ccc;';
        thead.appendChild(th);
    });
    table.appendChild(thead);

    rows.forEach(function(row) {
        var tr = document.createElement('tr');

        var tdLabel = document.createElement('td');
        tdLabel.textContent = row.label;
        tdLabel.style.cssText = 'padding:3px 4px;';
        tr.appendChild(tdLabel);

        var tdColor = document.createElement('td');
        tdColor.style.cssText = 'padding:3px 4px;';
        if(row.colorKey) {
            var colorInp = document.createElement('input');
            colorInp.type = 'color';
            colorInp.id = 'cfg-' + row.colorKey;
            var saved = _config_get(row.colorKey);
            colorInp.value = saved || row.defaultColor();
            colorInp.style.cssText = 'width:44px;height:22px;padding:0;border:none;cursor:pointer;';
            colorInp.onchange = (function(key, inp, defFn) {
                return function() {
                    var val = inp.value;
                    window['config_' + key] = (val === defFn()) ? '' : val;
                    _config_set(key, val);
                    vectron_render();
                };
            })(row.colorKey, colorInp, row.defaultColor);

            var resetBtn = document.createElement('button');
            resetBtn.textContent = '↺';
            resetBtn.title = 'Reset to default';
            resetBtn.className = 'btn btn-xs btn-default';
            resetBtn.style.marginLeft = '4px';
            resetBtn.onclick = (function(key, inp, defFn) {
                return function() {
                    window['config_' + key] = '';
                    _config_set(key, '');
                    inp.value = defFn();
                    vectron_render();
                };
            })(row.colorKey, colorInp, row.defaultColor);

            tdColor.appendChild(colorInp);
            tdColor.appendChild(resetBtn);
        }
        tr.appendChild(tdColor);

        var tdThick = document.createElement('td');
        tdThick.style.cssText = 'padding:3px 4px;';
        if(row.thickKey) {
            var thickInp = document.createElement('input');
            thickInp.type = 'number';
            thickInp.id = 'cfg-' + row.thickKey;
            thickInp.min = '0'; thickInp.max = '10'; thickInp.step = '0.5';
            thickInp.value = parseFloat(_config_get(row.thickKey)) || 0;
            thickInp.placeholder = 'auto';
            thickInp.style.cssText = 'width:64px;';
            thickInp.title = '0 = auto';
            thickInp.onchange = (function(key, inp) {
                return function() {
                    var v = parseFloat(inp.value) || 0;
                    window['config_' + key] = v;
                    _config_set(key, String(v));
                    vectron_render();
                };
            })(row.thickKey, thickInp);
            tdThick.appendChild(thickInp);
        }
        tr.appendChild(tdThick);

        table.appendChild(tr);
    });

    container.appendChild(table);
}
