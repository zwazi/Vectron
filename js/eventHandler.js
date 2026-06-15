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

var eventHandler_space = false;
var eventHandler_shift = false;
var eventHandler_contextMenu = false;
var eventHandler_middlePanning = false;
var eventHandler_middleClickX = 0, eventHandler_middleClickY = 0;
var eventHandler_middlePanStartX = 0, eventHandler_middlePanStartY = 0;


function eventHandler_init() {

    var $contextMenu = $("#contextMenu");

    $(document).on("keydown", "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='hidden']), textarea", function(e) {
        if (this.tagName === "TEXTAREA") return;
        if (e.key !== "Enter" || (e.isDefaultPrevented && e.isDefaultPrevented())) return;
        e.preventDefault();
        this.blur();
        $(this).trigger("change");
    });

    $("#canvas_container").on("contextmenu", function(e) {
        aamap_active = false;
        // Show/hide vertex delete based on current tool and selection
        var showVertexDelete = (vectron_currentTool === "wallVertexMove" &&
            !vectron_toolActive &&
            wallVertexMoveTool_selectedWall !== null &&
            wallVertexMoveTool_selectedPtIdx >= 0);
        $("#contextMenu-delete-vertex").parent().toggle(showVertexDelete);
        $contextMenu.css({
            left: ( $contextMenu.width()+e.pageX > $("body").width() ) ?
                    (e.pageX - $contextMenu.width() + 4) :
                e.pageX,
            top: ( $contextMenu.height()+e.pageY > $("body").height() ) ? (
                    ( $contextMenu.height() >= ( $("body").height() - 4 ) || e.pageY < $contextMenu.height() ) ?
                        0 : (e.pageY - $contextMenu.height() + 4)
                    ) :
                e.pageY,
        });
        $contextMenu.fadeIn(150);
        // Flip submenu to the left if not enough space to the right.
        // Use the actual submenu element width if available, otherwise fall back to min-width (180px) + padding.
        var $submenu = $contextMenu.find('.cm-submenu').first();
        var submenuWidth = ($submenu.length && $submenu.is(':visible')) ? $submenu.outerWidth() : ($submenu.css('min-width') ? parseInt($submenu.css('min-width')) : 180);
        var cmLeft = parseFloat($contextMenu.css('left')) || e.pageX;
        if (cmLeft + $contextMenu.outerWidth() + submenuWidth > $("body").width()) {
            $contextMenu.addClass('submenu-left');
        } else {
            $contextMenu.removeClass('submenu-left');
        }
        return false;
    });

    $contextMenu.on("mouseup", "a", function(evt) {
        // Don't close the menu when clicking a submenu toggle
        if($(this).closest('li.dropdown-submenu').length && !$(this).closest('.cm-submenu').length) {
            return;
        }
        if(!aamap_active) {
            $contextMenu.hide();
            aamap_active = true;
            return;
        }
    });

    $contextMenu.on("contextmenu", function(e) {
        aamap_active = true;
        $contextMenu.fadeOut(150);
        return false;
    });


    $('body').on("click", function() {
        if( !aamap_active )
        {
            $contextMenu.hide();
            aamap_active = true;
        }
    });



    $(".toolbar-gui-open").mouseup(function(e) {
        if(!gui_active) {
            gui_show(); // sets active state
            $(".toolbar-gui-open").hide();
            $(".toolbar-gui-close").show();
        }
        gui_writeLog('GUI TOGGLE');
        $("#zones-menu").hide();
    });

    $(".toolbar-gui-close").mouseup(function(e) {
        if(gui_active) {
            gui_hide();
            $(".toolbar-gui-close").hide();
            $(".toolbar-gui-open").show();
        }
        gui_writeLog('GUI TOGGLE');
        $("#zones-menu").hide();
    });

    $(".toolbar-actionHistory").mouseup(function(e) {
        var win = document.getElementById("action-history-window");
        if(win.style.display === "none") {
            actionHistory_show();
            _config_set_enable("showActionHistory");
            $("#show-action-history").prop("checked", true);
        } else {
            actionHistory_hide();
            _config_set_disable("showActionHistory");
            $("#show-action-history").prop("checked", false);
        }
        $("#zones-menu").hide();
    });

    $("#gui-export").mouseup(function(e) {
        var mapName = $("#map_name").val().trim();
        var mapAuthor = $("#map_author").val().trim();
        var mapCategory = $("#map_category").val().trim();
        var mapVersion = $("#map_version").val().trim();
        var mapDtd = $("#map_dtd").val().trim();
        var mapAxes = parseInt($("#map_axes").val().trim());
        var mapSets = $("#map_settings").val().split("\n");

        aamap_save(mapName, mapAuthor, mapCategory, mapVersion, mapDtd, mapAxes, mapSets);
    });

    $(document).on("click", "#control-box-close", function(e) {
        if(gui_active) {
            gui_hide();
            $(".toolbar-gui-close").hide();
            $(".toolbar-gui-open").show();
        }
        gui_writeLog('GUI TOGGLE');
        $("#zones-menu").hide();
    });

    $(document).on("click", "#wall-tool-close", function() {
        wallTool_disconnect();
    });

    $(document).on("click", "#zone-tool-close", function() {
        zoneTool_disconnect();
    });


    // Sync top bar fields → xml_ variables so the XML editor always shows current values
    $('#map_name').on('input change', function() { xml_name = this.value; });
    $('#map_author').on('input change', function() { xml_author = this.value; });
    $('#map_category').on('input change', function() { xml_category = this.value; });
    $('#map_version').on('input change', function() { xml_version = this.value; });
    $('#map_dtd').on('input change', function() { xml_dtd = this.value; });
    $('#map_axes').on('input change', function() { xml_axes = parseInt(this.value) || 4; });
    $('#map_settings').on('input change', function() {
        xml_settings = this.value.split('\n').filter(function(s) { return s.trim(); });
    });

    // Handle settings changes
    $("#dark-theme").change(function(box)
    {
        if($("#dark-theme").is(':checked'))
            enable_dark_theme();
        else
            disable_dark_theme();
    });

    $("#show-info-bar").change(function(box)
    {
        if($("#show-info-bar").is(':checked'))
            show_info_bar();
        else
            hide_info_bar();
    });

    $("#show-debug-panel").change(function(box)
    {
        if($("#show-debug-panel").is(':checked'))
            show_debug();
        else
            hide_debug();
    });

    $("#show-action-history").change(function(box)
    {
        if($("#show-action-history").is(':checked'))
        {
            actionHistory_show();
            _config_set_enable("showActionHistory");
        }
        else
        {
            actionHistory_hide();
            _config_set_disable("showActionHistory");
        }
    });

    $(document).on("click", "#action-history-close", function() {
        actionHistory_hide();
        $("#show-action-history").prop("checked", false);
        _config_set_disable("showActionHistory");
    });

    // Map Adjustments
    $("#scale_map").mouseup(function(e)
    {
        var factor = parseFloat($("#map_scale").val());
        if(isNaN(factor) || factor === 0) return;
        var affectedObjs = aamap_objects.slice();
        aamap_scale(factor);
        aamap_panCenter();
        aamap_recordAction({
            label: "Scale map",
            undo: function() { affectedObjs.forEach(function(o){ o.scale(1/factor); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.scale(factor); }); aamap_panCenter(); }
        });
    });

    $("#map_rotate_left").mouseup(function(e)
    {
        var affectedObjs = aamap_objects.slice();
        aamap_rotateSimple(-1);
        aamap_panCenter();
        aamap_recordAction({
            label: "Rotate map left",
            undo: function() { affectedObjs.forEach(function(o){ o.rotateSimple(1); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.rotateSimple(-1); }); aamap_panCenter(); }
        });
    });
    $("#map_rotate_right").mouseup(function(e)
    {
        var affectedObjs = aamap_objects.slice();
        aamap_rotateSimple(1);
        aamap_panCenter();
        aamap_recordAction({
            label: "Rotate map right",
            undo: function() { affectedObjs.forEach(function(o){ o.rotateSimple(-1); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.rotateSimple(1); }); aamap_panCenter(); }
        });
    });

    $("#rotate_map").mouseup(function(e)
    {
        var ang = parseFloat($("#map_rot_angle").val());
        if(isNaN(ang)) { alert("invalid value!"); return; }
        var rad = ang * Math.PI / 180;
        var affectedObjs = aamap_objects.slice();
        aamap_rotate(rad);
        aamap_panCenter();
        aamap_recordAction({
            label: "Rotate map " + ang + "°",
            undo: function() { affectedObjs.forEach(function(o){ o.rotate(-rad); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.rotate(rad); }); aamap_panCenter(); }
        });
    });

    $("#move_map").mouseup(function(e)
    {
        var x = parseFloat($("#map_move_x").val());
        var y = parseFloat($("#map_move_y").val());
        if(isNaN(x) || isNaN(y)) return;
        var affectedObjs = aamap_objects.slice();
        affectedObjs.forEach(function(o){ o.move(x, y); });
        aamap_panCenter();
        aamap_recordAction({
            label: "Move map",
            undo: function() { affectedObjs.forEach(function(o){ o.move(-x, -y); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.move(x, y); }); aamap_panCenter(); }
        });
    });

    $("#center_map_origin").mouseup(function(e)
    {
        var ptsx = [], ptsy = [];
        for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
            var obj = aamap_objects[i];
            if(obj instanceof Zone || obj instanceof Spawn) {
                ptsx.push(obj.x); ptsy.push(obj.y);
            } else if(obj instanceof Wall) {
                for(var j = 0, jj = obj.points.length; j < jj; j++) {
                    if(obj.points[j] != null) {
                        ptsx.push(obj.points[j].x);
                        ptsy.push(obj.points[j].y);
                    }
                }
            }
        }
        if(ptsx.length === 0) return;
        var cx = (Math.max.apply(Math, ptsx) + Math.min.apply(Math, ptsx)) / 2;
        var cy = (Math.max.apply(Math, ptsy) + Math.min.apply(Math, ptsy)) / 2;
        if(cx === 0 && cy === 0) return;
        var dx = -cx, dy = -cy;
        var affectedObjs = aamap_objects.slice();
        affectedObjs.forEach(function(o){ o.move(dx, dy); });
        aamap_panCenter();
        aamap_recordAction({
            label: "Center objects on 0,0",
            undo: function() { affectedObjs.forEach(function(o){ o.move(-dx, -dy); }); aamap_panCenter(); },
            redo: function() { affectedObjs.forEach(function(o){ o.move(dx, dy); }); aamap_panCenter(); }
        });
    });


    $(".toolbar-copy").mouseup(function(e) {
        selectTool_copy();
    });

    $(".toolbar-paste").mouseup(function(e) {
        selectTool_paste();
    });

    $(".toolbar-toolSelect").mouseup(function(e) {
        vectron_connectTool("select");
        gui_writeLog('Select Tool Connected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolNavigation").mouseup(function(e) {
        vectron_connectTool("navigation");
        gui_writeLog('Navigation Tool Connected.');
        $("#zones-menu").hide();
    });

    /*
     * WALL TOOL
     */
    $(".toolbar-toolWall").mouseup(function(e) {
        vectron_connectTool("wall");
        gui_writeLog('WallTool Connected.');
        $("#zones-menu").hide();
    });

    /*
     * Zone tool
     */

    $("#contextMenu .toolbar-toolZone").mouseup(function(e) {
        vectron_connectTool("zone");
    });

    $("#zone-base .toolbar-toolZone").mouseup(function(e) {
        vectron_connectTool("zone");
        gui_writeLog('ZoneTool Connected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-death").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 0;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog('DeathZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-win").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 1;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog('WinZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-target").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 2;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog('TargetZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-fortress").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 4;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog('FortressZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-rubber").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 3;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog('RubberZone selected.');
        $("#zones-menu").hide();
    });

    // Zone type buttons inside zone-tool-window
    $(document).on("click", ".zone-type-btn", function(e) {
        e.stopPropagation();
        var type = parseInt($(this).data("type"));
        var typeNames = ["Death", "Win", "Target", "Rubber", "Fortress"];
        vectron_connectTool("zone");
        zoneTool_type = type;
        zoneTool_guide();
        zoneTool_updateRubberBar();
        zoneTool_updateWindowActiveType();
        gui_writeLog(typeNames[type] + 'Zone selected.');
    });

    // Quick placement toggle
    $("#zone-quick-placement-toggle").on("change", function() {
        if ($(this).is(":checked")) {
            $("#zone-quick-size-row").show();
        } else {
            $("#zone-quick-size-row").hide();
        }
    });

    // Finish wall button
    $("#wall-tool-finish").on("click", function() {
        if (vectron_currentTool === "wall" && vectron_toolActive) {
            wallTool_finishWall();
        }
    });

    $(document).on("click", ".wall-tool-mode-btn", function(e) {
        e.preventDefault();
        if(vectron_currentTool !== "wall") {
            vectron_connectTool("wall");
        }
        wallTool_setMode($(this).data("mode"));
    });

    $("#dWallSegments").on("change input", function() {
        wallTool_refreshCountInput(true);
        wallTool_renderCurrent();
    });

    $(".toolbar-toolSpawn").mouseup(function(e) {
        vectron_connectTool("spawn");
        $("#zones-menu").hide();
    });

    $(".toolbar-toolWallVertexMove").mouseup(function(e) {
        vectron_connectTool("wallVertexMove");
        gui_writeLog('Wall Vertex Move Tool Connected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolSplit").mouseup(function(e) {
        vectron_connectTool("split");
        gui_writeLog('Split Tool Connected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolJoin").mouseup(function(e) {
        vectron_connectTool("join");
        gui_writeLog('Join Tool Connected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolInfo").mouseup(function(e) {
        if(!gui_active) { gui_show(); $(".toolbar-gui-open").hide(); $(".toolbar-gui-close").show(); }
        $('a[href="#gui-about"]').click();
        $("#zones-menu").hide();
    });

    // XML Editor
    function xmlEditor_indentLines(str, prefix) {
        return str.split('\n').map(function(line) { return prefix + line; }).join('\n');
    }

    function xmlEditor_getFullXML() {
        var xml = '<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>\n';
        xml += '<!DOCTYPE Resource SYSTEM "' + (xml_dtd || 'sty.dtd') + '">\n';
        xml += '<Resource type="aamap" name="' + (xml_name || '') + '" version="' + (xml_version || '') + '" author="' + (xml_author || '') + '" category="' + (xml_category || '') + '">\n';
        xml += '  <Map version="0.2.8">\n';
        var settings = xml_settings.filter(function(s) { return s.trim(); });
        if (settings.length > 0) {
            xml += '    <Settings>\n';
            for (var si = 0; si < settings.length; si++) {
                var point = settings[si].indexOf(' ');
                if (point < 0) continue; // skip malformed entries without a value
                var sname = settings[si].slice(0, point), svalue = settings[si].slice(point + 1);
                xml += '      <Setting name="' + sname + '" value="' + svalue + '" />\n';
            }
            xml += '    </Settings>\n';
        }
        xml += '    <World>\n      <Field>\n';
        if (document.getElementById('map_axes_forced').checked) {
            var axes = parseInt(document.getElementById('map_axes').value) || 4;
            xml += '        <Axes number="' + axes + '"/>\n';
        }
        for (var i = 0; i < aamap_objects.length; i++) {
            xml += xmlEditor_indentLines(aamap_objects[i].getXML(), '        ') + '\n';
        }
        xml += '      </Field>\n    </World>\n  </Map>\n</Resource>\n';
        return xml;
    }

    function xmlEditor_getSelectedXML() {
        var objs = selectTool_selectedObjs;
        var xml = '<Field>\n';
        for (var i = 0; i < objs.length; i++) {
            xml += xmlEditor_indentLines(objs[i].getXML(), '  ') + '\n';
        }
        xml += '</Field>';
        return xml;
    }

    var xmlEditor_mode = 'full'; // 'full' or 'selected'
    var xmlEditor_selectedSnapshot = [];

    function xmlEditor_switchTab(mode) {
        xmlEditor_mode = mode;
        xmlEditor_selectedSnapshot = selectTool_selectedObjs.slice();
        if (mode === 'selected' && selectTool_selectedObjs.length > 0) {
            $('#xml-editor-content').val(xmlEditor_getSelectedXML());
            $('#xml-tab-sel-count').text('(' + selectTool_selectedObjs.length + ')');
        } else {
            xmlEditor_mode = 'full';
            $('#xml-editor-content').val(xmlEditor_getFullXML());
        }
        $('#xml-editor-tabs li').removeClass('active');
        $('#xml-tab-' + xmlEditor_mode).addClass('active');
        // Disable selection tab if nothing selected
        if (selectTool_selectedObjs.length === 0) {
            $('#xml-tab-selected').addClass('disabled');
        } else {
            $('#xml-tab-selected').removeClass('disabled');
        }
    }

    function xmlEditor_open(preferSelected) {
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        $('#xml-tab-sel-count').text(hasSelected ? '(' + selectTool_selectedObjs.length + ')' : '');
        if (hasSelected) {
            $('#xml-tab-selected').removeClass('disabled');
        } else {
            $('#xml-tab-selected').addClass('disabled');
        }
        xmlEditor_switchTab((preferSelected && hasSelected) ? 'selected' : 'full');
        $('#xml-editor-overlay').addClass('visible');
        // Do NOT set aamap_active=false — allow canvas interaction while window is open
    }

    function xmlEditor_close() {
        $('#xml-editor-overlay').removeClass('visible');
        // Do NOT touch aamap_active — let the canvas remain in its current state
    }

    // Called whenever the selection changes while the XML editor is open
    window.xmlEditor_onSelectionChange = function() {
        if (!$('#xml-editor-overlay').hasClass('visible')) return;
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        if (xmlEditor_mode === 'selected') {
            // On selection tab: always stay on it, just update content
            if (hasSelected) {
                xmlEditor_selectedSnapshot = selectTool_selectedObjs.slice();
                $('#xml-editor-content').val(xmlEditor_getSelectedXML());
                $('#xml-tab-sel-count').text('(' + selectTool_selectedObjs.length + ')');
                $('#xml-tab-selected').removeClass('disabled');
            } else {
                // Selection cleared while on selection tab — keep tab, show empty placeholder
                xmlEditor_selectedSnapshot = [];
                $('#xml-editor-content').val('<!-- No objects selected -->');
                $('#xml-tab-sel-count').text('');
                $('#xml-tab-selected').addClass('disabled');
            }
        } else {
            // Not on selection tab: if selection exists, auto-switch to it
            if (hasSelected) {
                xmlEditor_switchTab('selected');
            } else {
                $('#xml-tab-selected').addClass('disabled');
                $('#xml-tab-sel-count').text('');
            }
        }
    };

    function xmlEditor_validateXML(content, isFragment) {
        // Use jQuery's parseXML which throws on invalid XML.
        // For fragments, wrap in a neutral root so multiple top-level elements are accepted.
        try {
            if(isFragment) {
                $.parseXML('<VectronRoot>' + content + '</VectronRoot>');
            } else {
                $.parseXML(content);
            }
            return false; // valid
        } catch(e) {
            return true; // invalid
        }
    }

    function xmlEditor_apply() {
        var content = $('#xml-editor-content').val();
        var errDiv = document.getElementById('xml-editor-error');

        // Validate XML (display fixed message, not user content)
        var isFragment = (xmlEditor_mode === 'selected');
        if(xmlEditor_validateXML(content, isFragment)) {
            errDiv.textContent = "Invalid XML: please check your syntax and try again.";
            errDiv.style.display = '';
            return;
        }
        errDiv.style.display = 'none';

        // Save old state for undo
        var oldObjects = aamap_objects.slice();

        if (xmlEditor_mode === 'selected' && xmlEditor_selectedSnapshot.length > 0) {
            aamap_objects = aamap_objects.diff(xmlEditor_selectedSnapshot);
            xmlEditor_selectedSnapshot.forEach(function(e) {
                if (e.obj) e.obj.remove();
                if (e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
            });
            xml_process_piece(content);
            vectron_render();
        } else {
            aamap_objects = [];
            xml_process(content, true); // suppress history clear
            vectron_render();
        }

        var newObjects = aamap_objects.slice();

        // Record XML edit as an undoable action
        aamap_redoStack = [];
        aamap_recordAction({
            label: "Edit XML",
            undo: function() {
                aamap_objects.forEach(function(e) {
                    if(e.obj) e.obj.remove();
                    if(e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
                });
                aamap_objects = oldObjects;
                vectron_render();
                actionHistory_update();
            },
            redo: function() {
                aamap_objects.forEach(function(e) {
                    if(e.obj) e.obj.remove();
                    if(e.glowObj) { e.glowObj.remove(); e.glowObj = null; }
                });
                aamap_objects = newObjects;
                vectron_render();
            }
        });

        xmlEditor_close();
    }

    $(".toolbar-toolXml").mouseup(function(e) {
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        xmlEditor_open(hasSelected);
        $("#zones-menu").hide();
    });

    $("#xml-editor-close").mouseup(function(e) {
        xmlEditor_close();
    });

    $(document).on("click", "#xml-editor-close-x", function() {
        xmlEditor_close();
    });

    $("#xml-editor-apply").mouseup(function(e) {
        xmlEditor_apply();
    });

    // Make XML editor draggable via its header
    (function() {
        var box = document.getElementById('xml-editor-box');
        var header = document.getElementById('xml-editor-header');
        if(!box || !header) return;
        var isDragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
        header.addEventListener('mousedown', function(e) {
            if($(e.target).is('#xml-editor-close-x')) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            origLeft = box.offsetLeft; origTop = box.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if(!isDragging) return;
            var clamped = gui_clampToScreen(box, origLeft + e.clientX - startX, origTop + e.clientY - startY);
            box.style.left = clamped[0] + 'px';
            box.style.top  = clamped[1] + 'px';
        });
        document.addEventListener('mouseup', function() { isDragging = false; });
    })();

    $(document).on('click', '#xml-editor-tabs a', function(e) {
        e.preventDefault();
        var tab = $(this).data('tab');
        if ($(this).closest('li').hasClass('disabled')) return;
        xmlEditor_switchTab(tab);
    });

    $("#contextMenu-view-xml").mouseup(function(e) {
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        xmlEditor_open(hasSelected);
    });

    $("#contextMenu-delete-vertex").mouseup(function(e) {
        wallVertexMoveTool_deleteSelected();
    });

    // Pan/Zoom context menu submenu
    $("#cm-navigation").mouseup(function(e) {
        vectron_connectTool("navigation");
        gui_writeLog('Navigation Tool Connected.');
        $("#zones-menu").hide();
    });
    $("#cm-zoom-in").mouseup(function(e) {
        vectron_zoom *= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
    });
    $("#cm-zoom-out").mouseup(function(e) {
        vectron_zoom /= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
    });
    $("#cm-zoom-100").mouseup(function(e) {
        vectron_zoom = 1;
        vectron_render();
    });
    $("#cm-fit-screen").mouseup(function(e) {
        aamap_fitToScreen();
    });

    $(".toolbar-toolUnlock-list .toolbar-toolUnlock").mouseup(function(e) {
        cursor_snap = true;
        $('.toolbar-toolUnlock-list').css('display','none');
        $('.toolbar-toolLock-list').css('display','block');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolLock-list .toolbar-toolLock").mouseup(function(e) {
        cursor_snap = false;
        $('.toolbar-toolLock-list').css('display','none');
        $('.toolbar-toolUnlock-list').css('display','block');
        $("#zones-menu").hide();
    });

    $("#contextMenu .toolbar-toolLock").mouseup(function(e) {
        if(!cursor_snap) {
            $('.toolbar-toolUnlock-list').css('display','none');
            $('.toolbar-toolLock-list').css('display','block');

        } else {
            $('.toolbar-toolLock-list').css('display','none');
            $('.toolbar-toolUnlock-list').css('display','block');
        }
        cursor_snap = !cursor_snap;
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoomIn").mouseup(function(e) {
        vectron_zoom *= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoomOut").mouseup(function(e) {
        vectron_zoom /= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoom100").mouseup(function(e) {
        vectron_zoom = 1;
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolFitScreen").mouseup(function(e) {
        aamap_fitToScreen();
        $("#zones-menu").hide();
    });

    //Scaling//

    // Need better icons for these.

    $(".toolbar-toolScaleUp").mouseup(function(e) {
        aamap_scale(2);
        aamap_panCenter();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolScaleDown").mouseup(function(e) {
        aamap_scale(0.5);
        aamap_panCenter();
        $("#zones-menu").hide();
    });



    $(".toolbar-delete").mouseup(function(e) {
        if(vectron_currentTool == "select" && !vectron_toolActive) {
            selectTool_delete();
        } else if(vectron_currentTool == "wall" && vectron_toolActive) {
            if(wallTool_mode === "freeform" && wallTool_currentObj && wallTool_currentObj.points.length > 1)
            {
                wallTool_currentObj.points.pop();
                vectron_render();
                wallTool_currentObj.guide();
            }
            else if(wallTool_mode !== "freeform" && wallTool_stagePoints.length > 0)
            {
                wallTool_stagePoints.pop();
                wallTool_step = wallTool_stagePoints.length;
                wallTool_updateWindow();
                wallTool_renderCurrent();
            }
            else
            {
                gui_writeLog("Wall canceled, < 2 points");
                wallTool_disconnect();
                vectron_currentTool = "";
                vectron_connectTool("wall");
            }
        } else if(vectron_currentTool == "spawn" && vectron_toolActive) {
            spawnTool_disconnect();
            vectron_currentTool = "";
            vectron_connectTool("spawn");
        }
        $("#zones-menu").hide();
    });

    $(".toolbar-undo").mouseup(function(e) {
        aamap_undo();
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-redo").mouseup(function(e) {
        aamap_redo();
        vectron_render();
    });

    $(".toolbar-split-walls").mouseup(function(e) {
        // Removed: Split Walls at Grid Lines is no longer available
        $("#zones-menu").hide();
    });

    // Settings menu is only closed via the ✕ button or the settings toolbar button.
    // Clicking outside or pressing Esc does NOT close it.

    $("#canvas_container").mouseleave(function(e) {
        e.preventDefault();
        if(!aamap_active) return;

        if(eventHandler_middlePanning) {
            vectron_panX = eventHandler_middlePanStartX + (cursor_pageX - eventHandler_middleClickX) / vectron_zoom;
            vectron_panY = eventHandler_middlePanStartY + (eventHandler_middleClickY - cursor_pageY) / vectron_zoom;
            eventHandler_middlePanning = false;
            vectron_render();
            return;
        }

        if(vectron_currentTool == "select") {
            if(vectron_toolActive){
                selectTool_complete();
            }
        }

    });

    $("#canvas_container").mouseup(function(e) {
        e.preventDefault();
        if(!aamap_active) {
            $contextMenu.fadeOut(150);
            aamap_active = true;
            return;
        }
        switch (e.which) {
            case 1:
                if(vectron_currentTool == "wall") {
                    wallTool_handleClick();
                } else if(vectron_currentTool == "zone") {
                    zoneTool_complete();
                } else if(vectron_currentTool == "spawn") {
                    if(!vectron_toolActive)
                        spawnTool_start();
                    else spawnTool_complete();
                } else if(vectron_currentTool == "select" && vectron_toolActive) {
                    selectTool_complete();
                } else if(vectron_currentTool == "navigation" && vectron_toolActive) {
                    navigationTool_complete();
                } else if(vectron_currentTool == "split") {
                    splitTool_click();
                } else if(vectron_currentTool == "join") {
                    joinTool_click();
                } else if(vectron_currentTool == "wallVertexMove" && vectron_toolActive) {
                    wallVertexMoveTool_complete();
                }
                break;
            case 2:
                if(eventHandler_middlePanning) {
                    vectron_panX = eventHandler_middlePanStartX + (cursor_pageX - eventHandler_middleClickX) / vectron_zoom;
                    vectron_panY = eventHandler_middlePanStartY + (eventHandler_middleClickY - cursor_pageY) / vectron_zoom;
                    eventHandler_middlePanning = false;
                    vectron_render();
                }
                break;
            case 3:
                break;
            default:
                alert('You have a strange Mouse!');
        }
    });

    $("#canvas_container").dblclick(function(e) {
        e.preventDefault();
        if(aamap_active && vectron_currentTool == "wall" && vectron_toolActive) {
            wallTool_complete();
        }
    });

    $("#canvas_container").mousedown(function(e) {
        e.preventDefault();
        if(!aamap_active) {
            return;
        }
        switch (e.which) {
            case 1:
                if(vectron_currentTool == "select" && !vectron_toolActive) {
                    selectTool_start();
                } else if(vectron_currentTool == "navigation" && !vectron_toolActive) {
                    navigationTool_start();
                } else if(vectron_currentTool == "wallVertexMove" && !vectron_toolActive) {
                    wallVertexMoveTool_start();
                }
                break;
            case 2:
                eventHandler_middlePanning = true;
                eventHandler_middleClickX = cursor_pageX;
                eventHandler_middleClickY = cursor_pageY;
                eventHandler_middlePanStartX = vectron_panX;
                eventHandler_middlePanStartY = vectron_panY;
                break;
            case 3:
                //alert('Right Mouse button pressed.');
                break;
            default:
                alert('You have a strange Mouse!');
        }
    });


    $("#canvas_container").mousemove(function(event) {
        if(!aamap_active) return;

        cursor_pageX = event.pageX - 50;
        cursor_pageY = event.pageY - 36;

        if(eventHandler_middlePanning) {
            var xdir = eventHandler_middleClickX - cursor_pageX;
            var ydir = eventHandler_middleClickY - cursor_pageY;
            vectron_screen.setViewBox(xdir, ydir, vectron_width, vectron_height);
            return;
        }

        if(eventHandler_space) {
            navigationTool_progress();
            return;
        }

        cursor_render(cursor_pageX, cursor_pageY, vectron_zoom*vectron_grid_spacing);

        if(vectron_currentTool == "wall") {
            wallTool_renderCurrent();
            if(vectron_toolActive) {
                navigationTool_autopan(function(){
                    wallTool_renderCurrent();
                });
            }
        } else if(vectron_currentTool == "zone") {
            zoneTool_guide();
        } else if(vectron_currentTool == "spawn") {
            if(spawnTool_currentObj != null)
                spawnTool_currentObj.guide();
        } else if(vectron_currentTool == "select" && vectron_toolActive) {
            selectTool_progress();
        } else if(vectron_currentTool == "navigation" && vectron_toolActive) {
            navigationTool_progress();
        } else if(vectron_currentTool == "split") {
            splitTool_guide();
        } else if(vectron_currentTool == "join") {
            joinTool_guide();
        } else if(vectron_currentTool == "wallVertexMove") {
            if(vectron_toolActive) {
                wallVertexMoveTool_progress();
            }
        }

    });

    var prev_vectron_zoom = 0;
    var prev_vectron_panX = 0, prev_vectron_panY = 0;
    var zoom_mouse_x = 0, zoom_mouse_y = 0;
    var __zoom_timeout;
    var __zoom_raf;
    var __zoom_last_rendered_zoom = 1;
    var __zoom_canvas = document.getElementById('canvas_container');
    if(!("onwheel" in $("#canvas_container")[0]))
    {
        $("#canvas_container")[0].addEventListener("mousewheel",function(event)
        {
            if(event.wheelDeltaX != 0) return;
            event.deltaY = -event.wheelDeltaY;
            this.onwheel(event);
        },false);
        $("#canvas_container")[0].addEventListener("DOMMouseScroll",function(event)
        {
            event.deltaY = event.detail;
            this.onwheel(event);
        },false);
    }
    $("#canvas_container")[0].onwheel=(function(event)
    {
        if(config_scrollWheelZoom)
        {
            if(prev_vectron_zoom == 0)
            {
                prev_vectron_zoom = vectron_zoom;
                __zoom_last_rendered_zoom = vectron_zoom;
                prev_vectron_panX = vectron_panX;
                prev_vectron_panY = vectron_panY;
                zoom_mouse_x = cursor_pageX;
                zoom_mouse_y = cursor_pageY;
            }
            var zoomFactor = 1 + config_zoomStep;
            if(event.deltaY > 0)
            {
                if(vectron_zoom > 0.01)
                    vectron_zoom /= zoomFactor;
            }
            else
            {
                vectron_zoom *= zoomFactor;
            }

            // Keep the point under the mouse cursor fixed while zooming
            vectron_panX = prev_vectron_panX + (zoom_mouse_x - vectron_width/2) * (1/vectron_zoom - 1/prev_vectron_zoom);
            vectron_panY = prev_vectron_panY - (zoom_mouse_y - vectron_height/2) * (1/vectron_zoom - 1/prev_vectron_zoom);

            // Apply instant CSS scale transform for immediate visual feedback before the RAF renders
            var cssScale = vectron_zoom / __zoom_last_rendered_zoom;
            __zoom_canvas.style.transformOrigin = zoom_mouse_x + 'px ' + zoom_mouse_y + 'px';
            __zoom_canvas.style.transform = 'scale(' + cssScale + ')';

            // Proper render using requestAnimationFrame (removes CSS transform and redraws correctly)
            if(__zoom_raf) cancelAnimationFrame(__zoom_raf);
            __zoom_raf = requestAnimationFrame(function()
            {
                __zoom_canvas.style.transform = '';
                __zoom_last_rendered_zoom = vectron_zoom;
                vectron_render();
                __zoom_raf = null;
            });

            clearTimeout(__zoom_timeout);
            __zoom_timeout = setTimeout(function()
            {
                prev_vectron_zoom = 0;
            }, 150);
        }
    });

    $(function() {
        $(document).keyup(function(evt) {
            if (evt.keyCode == 32 && eventHandler_space) {
                eventHandler_space = false;
                var tool = vectron_toolActive;
                navigationTool_complete();
                vectron_toolActive = tool;
            }
        }).keydown(function(evt) {
            if (evt.keyCode == 32 && !eventHandler_space) {
                eventHandler_space = true;
                navigationTool_clickX = cursor_realX;
                navigationTool_clickY = cursor_realY;

                if(navigationTool_startPanX == null) {
                    navigationTool_startPanX = vectron_panX;
                }
                if(navigationTool_startPanY == null) {
                    navigationTool_startPanY = vectron_panY;
                }
            }
        });
    });

    $(function() {
        $(document).keyup(function(evt) {
            if (evt.keyCode == 16 && eventHandler_shift) {
                gui_writeLog("Shift up.");
                eventHandler_shift = false;
            }
        }).keydown(function(evt) {
            if (evt.keyCode == 16 && !eventHandler_shift) {
                gui_writeLog("shift down.");
                eventHandler_shift = true;
            }
        });
    });

    Mousetrap.bind('del', function(e) {
        if(!aamap_active) return;
        if(vectron_currentTool == "select" && !vectron_toolActive) {
            selectTool_delete();
        } else if(vectron_currentTool == "wallVertexMove" && !vectron_toolActive) {
            wallVertexMoveTool_deleteSelected();
        }

    });

    Mousetrap.bind('shift+w', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "wall" && vectron_toolActive) {
            wallTool_complete();
        }

    });

     Mousetrap.bind('shift+z', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            zoneTool_type += 1;
            if(zoneTool_type > 4) {
                zoneTool_type = 0;
            }
           gui_writeLog('Zone Tool Toggled: '
                + zoneTool_typeArray[zoneTool_type][0]);
            zoneTool_guide();
            zoneTool_updateRubberBar();
            zoneTool_updateWindowActiveType();
        }
    });

    Mousetrap.bind('=', function(e) {
       if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            zoneTool_radius = Math.floor(zoneTool_radius) + vectron_grid_spacing;
            zoneTool_guide();
        }
    }, 'keydown');

    Mousetrap.bind('+', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            zoneTool_radius += 0.1*vectron_grid_spacing;
            zoneTool_guide();
        }
    }, 'keydown');

    Mousetrap.bind('-', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            if(zoneTool_radius > 0) {
                zoneTool_radius = Math.floor(zoneTool_radius) - vectron_grid_spacing;
                zoneTool_guide();
            }
        }
    });

    Mousetrap.bind('_', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            if(zoneTool_radius > 0) {
                zoneTool_radius -= 0.1*vectron_grid_spacing;
                zoneTool_guide();
            }
        }
    });

    Mousetrap.bind('escape', function(e) {
        // Priority: cancel active tool / switch to select → deselect
        // NOTE: Escape does NOT close the settings menu or the XML editor.
        if(vectron_currentTool == "zone" && zoneTool_placingSize) {
            zoneTool_placingSize = false;
            vectron_toolActive = false;
            if(zoneTool_guideObj != null) { zoneTool_guideObj.remove(); zoneTool_guideObj = null; }
            zoneTool_guide();
            return false;
        }
        if(vectron_toolActive) {
            if(vectron_currentTool == "wall") {
                wallTool_disconnect();
                vectron_currentTool = "";
                vectron_connectTool("wall");
            } else if(vectron_currentTool == "spawn") {
                spawnTool_disconnect();
                vectron_currentTool = "";
                vectron_connectTool("spawn");
            } else if(vectron_currentTool == "split") {
                // Cancel selected wall, stay on split tool
                splitTool_selectedWall = null;
                splitTool_hoveredWall = null;
                vectron_toolActive = false;
                splitTool_clearHighlight();
                splitTool_clearGuide();
                vectron_render();
                gui_writeLog("Split Tool: selection cancelled.");
            } else if(vectron_currentTool == "join") {
                // Cancel selected wall, stay on join tool
                joinTool_firstWall = null;
                vectron_toolActive = false;
                joinTool_clearHighlightA();
                joinTool_clearHighlightB();
                vectron_render();
                gui_writeLog("Join Tool: selection cancelled.");
            }
            return false;
        }
        if(vectron_currentTool !== "select") {
            vectron_connectTool("select");
            return false;
        }
        // Already on select tool with no active action
        if(selectTool_selectedObjs.length > 0) {
            selectTool_deselectAll();
            vectron_render();
        }
        return false;
    });

    Mousetrap.bind('right', function(e) {
        if(!aamap_active) return;

        navigationTool_manualPan(-1.6*vectron_zoom,0);
    });
    Mousetrap.bind('left', function(e) {
        if(!aamap_active) return;

        navigationTool_manualPan(1.6*vectron_zoom,0);
    });
    Mousetrap.bind('up', function(e) {
        if(!aamap_active) return;

        navigationTool_manualPan(0,-1.6*vectron_zoom);
    });
    Mousetrap.bind('down', function(e) {
        if(!aamap_active) return;

        navigationTool_manualPan(0,1.6*vectron_zoom);
    });
    Mousetrap.bind('shift+space', function(e) {
        if(!aamap_active) return;

        aamap_panCenter();
    });

    Mousetrap.bind('mod+c', function(e) {
        if(!aamap_active) return;
        selectTool_copy();
        return false;
    });

    Mousetrap.bind('mod+v', function(e) {
        if(!aamap_active) return;
        selectTool_paste();
        return false;
    });

    Mousetrap.bind('mod+z', function(e) {
        if(!aamap_active) return;
        aamap_undo();
        vectron_render();
        return false;
    });

    Mousetrap.bind('mod+shift+z', function(e) {
        if(!aamap_active) return;
        aamap_redo();
        vectron_render();
        return false;
    });

    Mousetrap.bind('mod+1', function(e) {
        if(!aamap_active) return;
        vectron_zoom = 1;
        vectron_render();
        return false;
    });

    Mousetrap.bind('mod+0', function(e) {
        if(!aamap_active) return;
        aamap_fitToScreen();
        return false;
    });

    // Wall height bar: update wall height input on change
    $("#dWallHeight").on("change input", function() {
        $(this).val(wallTool_getHeight());
    });

    // New map button (toolbar) — show popover instead of native confirm
    $(".toolbar-newMap").mouseup(function(e) {
        if(gui_active) { gui_hide(); $(".toolbar-gui-close").hide(); $(".toolbar-gui-open").show(); }
        var btn = this;
        var popover = document.getElementById("new-map-popover");
        var rect = btn.getBoundingClientRect();
        popover.style.left = (rect.right + 8) + 'px';
        popover.style.top  = rect.top + 'px';
        popover.style.display = 'block';
        $("#zones-menu").hide();
    });

    $("#new-map-confirm").mouseup(function(e) {
        document.getElementById("new-map-popover").style.display = 'none';
        aamap_objects.forEach(function(obj) {
            if(obj.obj) obj.obj.remove();
            if(obj.glowObj) { obj.glowObj.remove(); obj.glowObj = null; }
        });
        aamap_objects = [];
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
        aamap_clearHistory();
        vectron_render();
        gui_writeLog("New map created.");
    });

    $("#new-map-cancel").mouseup(function(e) {
        document.getElementById("new-map-popover").style.display = 'none';
    });

    // Close new-map popover when clicking elsewhere
    $(document).on("mousedown.newmappopover", function(e) {
        var pop = document.getElementById("new-map-popover");
        if(pop && pop.style.display !== 'none' &&
           !$(e.target).closest("#new-map-popover").length &&
           !$(e.target).closest(".toolbar-newMap").length) {
            pop.style.display = 'none';
        }
    });

    // Import button (toolbar)
    $(".toolbar-import").mouseup(function(e) {
        $("#toolbar-files").val("");
        $("#toolbar-files").click();
        $("#zones-menu").hide();
    });
    $("#toolbar-files").change(function(e) {
        aamap_objects = [];
        xml_handle(e);
        gui_writeLog("Loading.");
    });

    // Export button (toolbar)
    $(".toolbar-export").mouseup(function(e) {
        var mapName = $("#map_name").val().trim() || "map";
        var mapAuthor = $("#map_author").val().trim();
        var mapCategory = $("#map_category").val().trim();
        var mapVersion = $("#map_version").val().trim() || "1";
        var mapDtd = $("#map_dtd").val().trim() || "sty.dtd";
        var mapAxes = parseInt($("#map_axes").val().trim()) || 4;
        var mapSets = $("#map_settings").val().split("\n");
        aamap_save(mapName, mapAuthor, mapCategory, mapVersion, mapDtd, mapAxes, mapSets);
        $("#zones-menu").hide();
    });

}

var __resize_timeout;
window.onresize = function() {
    var width = $("#canvas_container").width();
    var height = $("#canvas_container").height();
    vectron_screen.setSize(width, height);
    vectron_screen.setViewBox((vectron_width-width)/2, (vectron_height-height)/2, width, height);

    clearTimeout(__resize_timeout);
    __resize_timeout = setTimeout(function(){vectron_render()},150);
}
