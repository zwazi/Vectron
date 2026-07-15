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
var eventHandler_ctrl = false;
var eventHandler_contextMenu = false;
var eventHandler_middlePanning = false;
var eventHandler_middleClickX = 0, eventHandler_middleClickY = 0;
var eventHandler_middlePanStartX = 0, eventHandler_middlePanStartY = 0;
var eventHandler_tooltipsPinned = false;
var eventHandler_pinnedTooltipGap = 6;
var eventHandler_pinnedTooltipArrowMargin = 8;
var eventHandler_pinnedTooltipArrowOffset = -5;
var eventHandler_pinnedTooltipMaxCollisionSteps = 20;
var eventHandler_pinnedTooltipConnectorClass = "tooltip-connector";
var eventHandler_pinnedTooltipHelpToggleSelector = ".toolbar-help-toggle";
var eventHandler_tooltipPlacementTop = "top";
var eventHandler_tooltipPlacementBottom = "bottom";
var eventHandler_tooltipPlacementLeft = "left";
var eventHandler_tooltipPlacementRight = "right";
var eventHandler_levelDeleteTarget = null;
var eventHandler_pendingExportMap = null;
var codeViewer_sourceFormat = "armamap";

function codeViewer_setSourceFormat(format) {
    codeViewer_sourceFormat = format === "legacy-xml" ? "legacy-xml" : "armamap";
}

function codeViewer_formatJsonText(source) {
    var document = typeof source === "string" ? JSON.parse(source) : source;
    return JSON.stringify(document, null, 2) + "\n";
}

function codeViewer_formatXmlText(source) {
    var compact = String(source === undefined || source === null ? "" : source)
        .trim().replace(/>\s*</g, "><");
    if(!compact) return "";
    var lines = compact.replace(/></g, ">\n<").split("\n");
    var depth = 0;
    return lines.map(function(rawLine) {
        var line = rawLine.trim();
        if(/^<\//.test(line)) depth = Math.max(0, depth - 1);
        var formatted = new Array(depth + 1).join("  ") + line;
        var opensElement = /^<[^!?/][^>]*>/.test(line) && !/\/>$/.test(line);
        var closesOnSameLine = /<\/[^>]+>$/.test(line);
        if(opensElement && !closesOnSameLine) depth++;
        return formatted;
    }).join("\n") + "\n";
}

function eventHandler_getExportMap() {
    var mapName = $("#map_name").val().trim() || "map";
    var mapAuthor = $("#map_author").val().trim();
    var mapTags = $("#map_category").val().trim();
    var axesText = $("#map_axes").val().trim();
    var mapAxes = axesText === "" ? 4 : Number(axesText);
    var mapSets = $("#map_settings").val().split("\n");
    var map = armamap_build(mapName, mapAuthor, mapTags, "", mapAxes,
        mapSets, xml_author_password_hash);
    xml_version = map.document.metadata.revision;
    $("#map_version").val(xml_version);
    return map;
}

function eventHandler_hasAuthorPasswordForExport() {
    return xml_isValidAuthorPasswordHash(xml_author_password_hash);
}

function eventHandler_scaleMap(factor, label) {
    factor = Number(factor);
    if(!isFinite(factor) || factor === 0) return false;
    var affectedObjs = aamap_objects.slice();
    aamap_scale(factor);
    aamap_panCenter();
    aamap_recordAction({
        label:label || "Scale map",
        undo:function() {
            affectedObjs.forEach(function(object) { object.scale(1 / factor); });
            aamap_panCenter();
        },
        redo:function() {
            affectedObjs.forEach(function(object) { object.scale(factor); });
            aamap_panCenter();
        }
    });
    return true;
}

function eventHandler_downloadExportMapReady() {
    if($("#map_author_password").val().length && !xml_author_password_hash) {
        gui_toast("The author password could not be secured. Export canceled.");
        return false;
    }
    if(!eventHandler_hasAuthorPasswordForExport()) {
        gui_toast("Set an author-time password in Map Settings before exporting.");
        gui_writeLog("Export canceled: an author-time password is required.");
        $("#map_author_password").focus();
        return false;
    }
    var map = eventHandler_getExportMap();
    if(map.validationErrors && map.validationErrors.length) {
        gui_toast(map.validationErrors[0]);
        gui_writeLog(map.validationErrors.join(" "));
        return false;
    }
    if(map.validationWarnings && map.validationWarnings.length) {
        var warning = map.validationWarnings.join("\n\n");
        gui_writeLog(map.validationWarnings.join(" "));
        if(!window.confirm("Export warning\n\n" + warning)) {
            gui_toast("Export canceled.");
            return false;
        }
    }
    eventHandler_pendingExportMap = map;
    $("#export-password-confirm").val("");
    $("#export-password-error").hide();
    $("#export-password-popover").css("display", "flex");
    window.setTimeout(function() { $("#export-password-confirm").focus(); }, 0);
    return false;
}

function eventHandler_closeExportPassword() {
    eventHandler_pendingExportMap = null;
    $("#export-password-confirm").val("");
    $("#export-password-error").hide();
    $("#export-password-popover").hide();
}

function eventHandler_confirmExportPassword() {
    var map = eventHandler_pendingExportMap;
    if(!map) return Promise.resolve(false);
    var input = document.getElementById("export-password-confirm");
    var password = input.value;
    input.value = "";
    return xml_verifyAuthorPassword(password).then(function(valid) {
        password = "";
        if(!valid) {
            $("#export-password-error").show();
            input.focus();
            return false;
        }
        vectron_saveTextAsFile(map.text, map.fileName);
        eventHandler_closeExportPassword();
        gui_toast("Map exported as " + map.fileName + ".");
        return true;
    });
}

function eventHandler_downloadExportMap() {
    if(xml_author_password_pending) {
        gui_toast("Securing author password…");
        return xml_waitForAuthorPasswordHash().then(function() {
            return eventHandler_downloadExportMapReady();
        });
    }
    return eventHandler_downloadExportMapReady();
}

function eventHandler_setTooltipText(element, text) {
    var $element = $(element);
    $element.attr("data-original-title", text);
    $element.attr("aria-label", text);
    if($element.data("bs.tooltip")) {
        $element.tooltip("fixTitle");
    }
}

function eventHandler_getTooltipElements() {
    return $('[rel=tooltip]');
}

function eventHandler_initTooltips(trigger) {
    var defaultTrigger = trigger || "hover";
    eventHandler_getTooltipElements().each(function() {
        var $element = $(this);
        $element.tooltip({
            container: "body",
            trigger: defaultTrigger === "manual" ? "manual" :
                ($element.attr("data-trigger") || defaultTrigger),
            viewport: {
                selector: "body",
                padding: 4
            }
        });
        $element.off(".vectronTooltipViewport")
            .on("shown.bs.tooltip.vectronTooltipViewport", function() {
                eventHandler_keepTooltipInViewport($(this));
            });
    });
}

function eventHandler_resetTooltips(trigger) {
    $('[rel=tooltip]').tooltip("destroy");
    $(".tooltip").remove();
    eventHandler_removePinnedTooltipConnectors();
    eventHandler_initTooltips(trigger);
}

function eventHandler_getBootstrapTooltip($element) {
    var tooltip = $element.data("bs.tooltip");
    if(!tooltip) return null;
    if(tooltip.$tip) return tooltip.$tip;
    if(typeof tooltip.tip == "function") return tooltip.tip();
    return null;
}

function eventHandler_getRenderedTooltipPlacement($tip) {
    var placements = [eventHandler_tooltipPlacementTop, eventHandler_tooltipPlacementBottom,
        eventHandler_tooltipPlacementLeft, eventHandler_tooltipPlacementRight];
    for(var index = 0; index < placements.length; index++) {
        if($tip.hasClass(placements[index])) return placements[index];
    }
    return eventHandler_tooltipPlacementTop;
}

function eventHandler_keepTooltipInViewport($element) {
    var $tip = eventHandler_getBootstrapTooltip($element);
    if(!$tip || !$tip.length || !$tip.is(":visible")) return;
    eventHandler_repositionPinnedTooltip($tip, $element[0], [],
        eventHandler_getRenderedTooltipPlacement($tip));
}

function eventHandler_rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function eventHandler_getPaddedRect(element, padding) {
    var rect = element.getBoundingClientRect();
    padding = padding || 0;
    return {
        left: rect.left - padding,
        right: rect.right + padding,
        top: rect.top - padding,
        bottom: rect.bottom + padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2
    };
}

function eventHandler_isVerticalTooltipPlacement(placement) {
    if(placement === eventHandler_tooltipPlacementTop || placement === eventHandler_tooltipPlacementBottom) {
        return true;
    }
    return false;
}

function eventHandler_getTooltipPointer(element, placement) {
    var rect = element.getBoundingClientRect();
    if(eventHandler_isVerticalTooltipPlacement(placement)) {
        return rect.left + rect.width / 2;
    }
    return rect.top + rect.height / 2;
}

function eventHandler_clampTooltipArrow(pointerOffset, dimension) {
    return Math.max(eventHandler_pinnedTooltipArrowMargin, Math.min(pointerOffset, dimension - eventHandler_pinnedTooltipArrowMargin));
}

function eventHandler_alignPinnedTooltipArrow($tip, element, placement) {
    var $arrow = $tip.find(".tooltip-arrow");
    if(!$arrow.length) return undefined;

    var tipRect = $tip[0].getBoundingClientRect();
    var pointer = eventHandler_getTooltipPointer(element, placement);
    if(eventHandler_isVerticalTooltipPlacement(placement)) {
        var arrowLeft = eventHandler_clampTooltipArrow(pointer - tipRect.left, tipRect.width);
        $arrow.css({
            left: arrowLeft + "px",
            marginLeft: eventHandler_pinnedTooltipArrowOffset + "px"
        });
    } else {
        var arrowTop = eventHandler_clampTooltipArrow(pointer - tipRect.top, tipRect.height);
        $arrow.css({
            top: arrowTop + "px",
            marginTop: eventHandler_pinnedTooltipArrowOffset + "px"
        });
    }
}

function eventHandler_nudgePinnedTooltipAwayFromTarget(rect, used, placement) {
    if(placement === eventHandler_tooltipPlacementTop) {
        return { left: rect.left, top: used.top - rect.height - eventHandler_pinnedTooltipGap };
    }
    if(placement === eventHandler_tooltipPlacementBottom) {
        return { left: rect.left, top: used.bottom + eventHandler_pinnedTooltipGap };
    }
    if(placement === eventHandler_tooltipPlacementLeft) {
        return { left: used.left - rect.width - eventHandler_pinnedTooltipGap, top: rect.top };
    }
    return { left: used.right + eventHandler_pinnedTooltipGap, top: rect.top };
}

function eventHandler_repositionPinnedTooltip($tip, element, usedRects, placement) {
    var tip = $tip[0];
    var rect = eventHandler_getPaddedRect(tip, 4);
    var left = parseFloat($tip.css("left")) || rect.left;
    var top = parseFloat($tip.css("top")) || rect.top;

    var changed = true;
    var guard = 0;
    while(changed && guard++ < eventHandler_pinnedTooltipMaxCollisionSteps) {
        changed = false;
        var processedRects = new Set();
        for(var i = 0, ii = usedRects.length; i < ii; i++) {
            var used = usedRects[i];
            if(processedRects.has(used)) {
                continue;
            }
            processedRects.add(used);
            if(!eventHandler_rectsOverlap(rect, used)) {
                continue;
            }

            var next = eventHandler_nudgePinnedTooltipAwayFromTarget(rect, used, placement);
            left = next.left;
            top = next.top;
            $tip.css({
                left: left,
                top: top
            });
            rect = eventHandler_getPaddedRect(tip, 4);
            changed = true;
        }
    }

    var maxLeft = window.innerWidth - rect.width - 4;
    var maxTop = window.innerHeight - rect.height - 4;
    left = Math.max(4, Math.min(left, maxLeft));
    top = Math.max(4, Math.min(top, maxTop));
    $tip.css({
        left: left,
        top: top
    });
    eventHandler_alignPinnedTooltipArrow($tip, element, placement);

    return eventHandler_getPaddedRect(tip, 4);
}

function eventHandler_clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function eventHandler_removePinnedTooltipConnectors() {
    $("." + eventHandler_pinnedTooltipConnectorClass).remove();
}

function eventHandler_getPinnedTooltipConnectorThickness() {
    var fallbackThickness = 2;
    if(typeof window.getComputedStyle !== "function") {
        return fallbackThickness;
    }

    var configuredThickness = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--tooltip-connector-thickness"));
    if(isNaN(configuredThickness) || configuredThickness <= 0) {
        return fallbackThickness;
    }

    return configuredThickness;
}

function eventHandler_getRectCenter(rect) {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function eventHandler_getRectPerimeterPoint(rect, target) {
    var center = eventHandler_getRectCenter(rect);
    var dx = target.x - center.x;
    var dy = target.y - center.y;
    var halfWidth = rect.width / 2;
    var halfHeight = rect.height / 2;

    if(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
        return {
            x: center.x,
            y: center.y
        };
    }

    var scaleX = Math.abs(dx) > 1e-6 ? halfWidth / Math.abs(dx) : Infinity;
    var scaleY = Math.abs(dy) > 1e-6 ? halfHeight / Math.abs(dy) : Infinity;
    var scale = Math.min(scaleX, scaleY);

    return {
        x: center.x + dx * scale,
        y: center.y + dy * scale
    };
}

/**
 * Calculates the connector endpoint at the visible tooltip arrow for a pinned tooltip.
 *
 * @param {jQuery} $tip Bootstrap tooltip element.
 * @param {string} placement Bootstrap tooltip placement.
 * @returns {{x:number, y:number}} Viewport-space point where the connector should meet the arrow.
 */
function eventHandler_getTooltipArrowPoint($tip, placement) {
    var tipRect = $tip[0].getBoundingClientRect();
    var $arrow = $tip.find(".tooltip-arrow");
    var arrowRect = $arrow.length ? $arrow[0].getBoundingClientRect() : null;
    var arrowCenterX = arrowRect ? arrowRect.left + arrowRect.width / 2 : tipRect.left + tipRect.width / 2;
    var arrowCenterY = arrowRect ? arrowRect.top + arrowRect.height / 2 : tipRect.top + tipRect.height / 2;

    if(placement === eventHandler_tooltipPlacementTop) {
        return { x: arrowCenterX, y: tipRect.bottom };
    }
    if(placement === eventHandler_tooltipPlacementBottom) {
        return { x: arrowCenterX, y: tipRect.top };
    }
    if(placement === eventHandler_tooltipPlacementLeft) {
        return { x: tipRect.right, y: arrowCenterY };
    }
    return { x: tipRect.left, y: arrowCenterY };
}

function eventHandler_drawPinnedTooltipConnector($tip, element, placement) {
    var targetRect = element.getBoundingClientRect();
    var end = eventHandler_getTooltipArrowPoint($tip, placement);
    var start = eventHandler_getRectPerimeterPoint(targetRect, end);
    var deltaX = end.x - start.x;
    var deltaY = end.y - start.y;
    var length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    var connectorThickness = eventHandler_getPinnedTooltipConnectorThickness();
    if(length <= connectorThickness) {
        return;
    }

    $("<div></div>").addClass(eventHandler_pinnedTooltipConnectorClass).css({
        left: start.x + "px",
        top: (start.y - connectorThickness / 2) + "px",
        width: length + "px",
        transform: "rotate(" + Math.atan2(deltaY, deltaX) + "rad)"
    }).appendTo("body");
}

function eventHandler_showPinnedTooltips() {
    var $tooltips = eventHandler_getPinnedTooltipElements();
    var usedRects = [];

    eventHandler_removePinnedTooltipConnectors();
    $tooltips.tooltip("show");
    setTimeout(function() {
        $tooltips.each(function() {
            var $tip = eventHandler_getBootstrapTooltip($(this));
            if(!$tip || !$tip.length || !$tip.is(":visible")) return;

            var placement = ($(this).attr("data-placement") || eventHandler_tooltipPlacementRight).split(" ")[0];
            usedRects.push(eventHandler_repositionPinnedTooltip($tip, this, usedRects, placement));
        });
        $tooltips.each(function() {
            var $tip = eventHandler_getBootstrapTooltip($(this));
            if(!$tip || !$tip.length || !$tip.is(":visible")) return;

            var placement = ($(this).attr("data-placement") || eventHandler_tooltipPlacementRight).split(" ")[0];
            eventHandler_drawPinnedTooltipConnector($tip, this, placement);
        });
    }, 0);
}

function eventHandler_getPinnedTooltipElements() {
    var $sidebar = $("#tool_bar [rel=tooltip]").filter(function() {
        return $(this).is(":visible") && $(this).closest(":hidden").length == 0;
    });
    var $topBar = $("#top-settings-bar [rel=tooltip]").filter(function() {
        return $(this).is(":visible") && $(this).closest(":hidden").length == 0;
    });
    var $bottomBar = $(".info [rel=tooltip]").filter(function() {
        return $(this).is(":visible") && $(this).closest(":hidden").length == 0;
    });
    return $sidebar.add($topBar).add($bottomBar);
}

function eventHandler_togglePinnedTooltips() {
    eventHandler_tooltipsPinned = !eventHandler_tooltipsPinned;
    if(eventHandler_tooltipsPinned) {
        $(eventHandler_pinnedTooltipHelpToggleSelector).addClass("toolbar-tool-active");
        eventHandler_setTooltipText($(eventHandler_pinnedTooltipHelpToggleSelector)[0], "Hide Tooltips");
        eventHandler_resetTooltips("manual");
        eventHandler_showPinnedTooltips();
    } else {
        $(eventHandler_pinnedTooltipHelpToggleSelector).removeClass("toolbar-tool-active");
        eventHandler_setTooltipText($(eventHandler_pinnedTooltipHelpToggleSelector)[0], "Show Tooltips");
        eventHandler_removePinnedTooltipConnectors();
        eventHandler_resetTooltips("hover");
    }
}

function eventHandler_init() {

    var $contextMenu = $("#contextMenu");
    if(typeof zoneTool_initSettingTooltips === "function") zoneTool_initSettingTooltips();
    eventHandler_initTooltips("hover");

    function eventHandler_setSettingsOpen(open) {
        open = !!open;
        if(open && !gui_active) gui_show();
        if(!open && gui_active) gui_hide();
        $(".toolbar-gui-open").toggle(!open);
        $(".toolbar-gui-close").toggle(open);
        $("#zones-menu").hide();
        gui_writeLog("Settings " + (open ? "opened." : "closed."));
    }

    function eventHandler_toggleSettings() {
        eventHandler_setSettingsOpen(!gui_active);
    }

    $(document).on("mousedown", function(e) {
        var active = document.activeElement;
        if(!active || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        if(active === e.target || $.contains(active, e.target)) return;
        active.blur();
    });

    $(document).on("click.pinnedTooltips", function(e) {
        if(eventHandler_tooltipsPinned &&
           !$(e.target).closest(eventHandler_pinnedTooltipHelpToggleSelector).length &&
           !$(e.target).closest(".tooltip").length) {
            eventHandler_togglePinnedTooltips();
        }
    });

    $(document).on("keydown", "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='hidden'])", function(e) {
        if (e.key !== "Enter" || e.isDefaultPrevented()) return;
        if ($(this).closest("#wall-tool-window").length && vectron_currentTool === "wall") {
            e.preventDefault();
            this.blur();
            $(this).trigger("change");
            wallTool_finishWall();
            return;
        }
        e.preventDefault();
        this.blur();
        $(this).trigger("change");
    });

    $("#canvas_container").on("contextmenu", function(e) {
        e.preventDefault();
        e.stopPropagation();
        aamap_active = false;
        eventHandler_contextMenu = true;
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
        // A right-button mouseup can arrive after contextmenu. Showing the menu
        // synchronously prevents that same gesture from racing a fade animation.
        $contextMenu.stop(true, true).show();
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
            $contextMenu.stop(true, true).hide();
            aamap_active = true;
            eventHandler_contextMenu = false;
            return;
        }
    });

    $contextMenu.on("contextmenu", function(e) {
        aamap_active = true;
        eventHandler_contextMenu = false;
        $contextMenu.stop(true, true).hide();
        return false;
    });

    // Submenu toggles and menu actions must not be mistaken for outside body
    // clicks. Target handlers still run normally before propagation stops.
    $contextMenu.on("click", function(e) {
        e.stopPropagation();
    });


    $('body').on("click", function(e) {
        if($(e.target).closest("#contextMenu").length) return;
        if( !aamap_active )
        {
            $contextMenu.hide();
            aamap_active = true;
            eventHandler_contextMenu = false;
        }
    });



    $(".toolbar-gui-open").mouseup(function(e) {
        eventHandler_setSettingsOpen(true);
    });

    $(".toolbar-gui-close").mouseup(function(e) {
        eventHandler_setSettingsOpen(false);
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
        eventHandler_downloadExportMap();
    });

    $(document).on("click", "#control-box-close", function(e) {
        eventHandler_setSettingsOpen(false);
    });

    $(document).on("click", "#wall-tool-close", function() {
        if(vectron_currentTool === "wall" && vectron_toolActive) wallTool_cancelCurrent();
        vectron_connectTool("select");
    });

    $(document).on("click", "#zone-tool-close", function() {
        if(vectron_currentTool === "zone" && vectron_toolActive) zoneTool_cancelPlacement();
        vectron_connectTool("select");
    });

    $(document).on("click", "#ramp-tool-close", function() {
        if(vectron_currentTool === "ramp" && vectron_toolActive) rampTool_cancelPlacement();
        vectron_connectTool("select");
    });
    $(document).on("click", "#floor-tool-close", function() {
        if(vectron_currentTool === "floor" && vectron_toolActive) floorTool_cancel();
        vectron_connectTool("select");
    });


    // Sync top bar fields → xml_ variables so the Code Viewer always shows current values
    $('#map_name').on('input change', function() { xml_name = this.value; });
    $('#map_author').on('input change', function() { xml_author = this.value; });
    $('#map_author_password').on('input change', function() {
        xml_scheduleAuthorPasswordHash(this.value);
    });
    $('#map-author-password-toggle').on('click', function() {
        var input = document.getElementById('map_author_password');
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        $(this).attr('aria-label', visible ? 'Show author password' : 'Hide author password')
            .attr('title', visible ? 'Show author password' : 'Hide author password')
            .find('i').toggleClass('fa-eye', visible).toggleClass('fa-eye-slash', !visible);
    });
    $('#export-password-visibility').on('click', function() {
        var input = document.getElementById('export-password-confirm');
        input.type = input.type === 'password' ? 'text' : 'password';
    });
    $('#export-password-cancel').on('click', eventHandler_closeExportPassword);
    $('#export-password-accept').on('click', eventHandler_confirmExportPassword);
    $('#export-password-confirm').on('keydown', function(event) {
        if(event.key === 'Enter') { event.preventDefault(); eventHandler_confirmExportPassword(); }
        if(event.key === 'Escape') { event.preventDefault(); eventHandler_closeExportPassword(); }
    });
    $('#map_category').on('input change', function() { xml_category = this.value; });
    $('#map_axes').on('input change', function() {
        xml_invalidateAuthorTime();
        xml_axis_vectors = null;
        xml_axes = parseInt(this.value) || 4;
    });
    $('#map_axes_forced').on('change', function() {
        xml_invalidateAuthorTime();
        xml_axis_vectors = null;
    });
    $('#dZoneShape').on('change', function() {
        if(this.value === "circle") $("#dZoneRotationSpeed").val("0");
        zoneTool_resetPlacement();
        zoneTool_updateSettings();
        zoneTool_guide();
    });
    $('#dCheckpointOrdered').on('change', function() {
        zoneTool_updateSettings();
        zoneTool_guide();
    });
    $(document).on("click", "#zone-tool-finish", zoneTool_finishCurrent);
    $(document).on("click", "#zone-tool-cancel", zoneTool_cancelPlacement);
    $('#dZoneLineWidth').on('input change', zoneTool_guide);
    function eventHandler_applySelectedLineWidth() {
        var input = document.getElementById('selection-line-zone-width');
        if(!input) return;
        if(selectTool_applySelectedLineWidth(input.value)) {
            input.setCustomValidity('');
        } else {
            input.setCustomValidity('Line zone width must be 0 or greater.');
            input.reportValidity();
        }
    }
    $('#selection-line-zone-width-apply').on('click', eventHandler_applySelectedLineWidth);
    $('#selection-line-zone-width').on('change', eventHandler_applySelectedLineWidth);
    $('#selection-line-zone-width').on('keydown', function(event) {
        if(event.key === 'Enter') {
            event.preventDefault();
            eventHandler_applySelectedLineWidth();
        }
    });
    $('#dZoneMoving').on('change', function() {
        zoneTool_updateSettings();
        zoneTool_guide();
    });
    $('#dZoneMovementMode, #dZoneMovementSpeed, #dZoneRotationSpeed, #dZoneSpawnAtVertices')
        .on('input change', function() {
            zoneTool_updateStatus();
            zoneTool_guide();
        });
    $('#dGameSetting').on('change', function() {
        zoneTool_updateGameSettingValue(true);
    });
    $('#symmetry-x-toggle,#symmetry-y-toggle,#symmetry-check-toggle').on('change', function() {
        var state = aamap_symmetryState();
        if($("#symmetry-check-toggle").is(":checked") && !state.x && !state.y) {
            $("#symmetry-check-toggle").prop("checked", false);
            gui_toast("Choose x=0 or y=0 before enabling symmetry check.");
        }
        var lines = [];
        if(state.x) lines.push("x=0");
        if(state.y) lines.push("y=0");
        var checking = aamap_symmetryCheckEnabled();
        gui_writeLog(lines.length ? (checking ? "Symmetry check mirroring the +X/+Y source across " :
            "Symmetry enabled across ") + lines.join(" and ") + "." : "Symmetry disabled.");
        vectron_render();
    });
    $('#map_settings').on('input change', function() {
        xml_settings = this.value.split('\n').filter(function(s) {
            var trimmed = s.trim();
            return trimmed && trimmed.split(/\s+/, 1)[0].toUpperCase() !== 'LANDSCAPE';
        });
        xml_invalidateAuthorTime();
    });

    // Handle settings changes
    $("#show-info-bar").change(function(box)
    {
        if($("#show-info-bar").is(':checked'))
            show_info_bar();
        else
            hide_info_bar();
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
        eventHandler_scaleMap(factor, "Scale map");
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
        var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
            var obj = aamap_objects[i];
            var bounds = typeof obj.getBounds === "function" ? obj.getBounds() : null;
            if(!bounds) continue;
            minx = Math.min(minx, bounds.minx);
            miny = Math.min(miny, bounds.miny);
            maxx = Math.max(maxx, bounds.maxx);
            maxy = Math.max(maxy, bounds.maxy);
        }
        if(!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return;
        var cx = (maxx + minx) / 2;
        var cy = (maxy + miny) / 2;
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
        zoneTool_updateSettings();
        zoneTool_updateWindowActiveType();
        gui_writeLog('DeathZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-win").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 1;
        zoneTool_guide();
        zoneTool_updateSettings();
        zoneTool_updateWindowActiveType();
        gui_writeLog('WinZone selected.');
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZone-health").mouseup(function(e) {
        vectron_connectTool("zone");
        zoneTool_type = 3;
        zoneTool_guide();
        zoneTool_updateSettings();
        zoneTool_updateWindowActiveType();
        gui_writeLog('HealthZone selected.');
        $("#zones-menu").hide();
    });

    // Zone type buttons inside zone-tool-window
    $(document).on("click", ".zone-type-btn", function(e) {
        e.stopPropagation();
        var type = parseInt($(this).data("type"));
        vectron_connectTool("zone");
        zoneTool_type = type;
        zoneTool_guide();
        zoneTool_updateSettings();
        zoneTool_updateWindowActiveType();
        gui_writeLog(zoneTool_typeArray[type][0] + ' zone selected.');
    });

    // Finish wall button
    $("#wall-tool-finish").on("click", function() {
        if (vectron_currentTool === "wall" && vectron_toolActive) {
            wallTool_finishWall();
        }
    });

    $("#wall-tool-cancel").on("click", function() {
        if (vectron_currentTool === "wall" && vectron_toolActive) {
            wallTool_cancelCurrent();
        }
    });

    $(document).on("click", ".wall-tool-mode-btn", function(e) {
        e.preventDefault();
        if(vectron_currentTool !== "wall") {
            vectron_connectTool("wall");
        }
        wallTool_setMode($(this).data("mode"));
    });

    (function initWallModeTooltips() {
        var descTimer = null;
        var $buttons = $(".wall-tool-mode-btn");
        $buttons.tooltip({
            html: true,
            container: "body",
            placement: "auto right",
            trigger: "manual",
            title: function() {
                return '<div class="vt-tooltip-title">' + ($(this).data("tooltip-title") || "") + '</div>';
            }
        });
        $buttons.on("mouseenter focus", function() {
            var btn = this;
            clearTimeout(descTimer);
            $(btn).tooltip("show");
            descTimer = setTimeout(function() {
                var title = $(btn).data("tooltip-title") || "";
                var desc = $(btn).data("tooltip-desc") || "";
                var instance = $(btn).data("bs.tooltip") || $(btn).data("tooltip");
                var $tip = instance ? (instance.$tip || (instance.tip ? instance.tip() : null)) : null;
                if($tip && $tip.length) {
                    $tip.find(".tooltip-inner").html('<div class="vt-tooltip-title">' + title + '</div><div class="vt-tooltip-desc">' + desc + '</div>');
                }
            }, 1800);
        }).on("mouseleave blur", function() {
            clearTimeout(descTimer);
            $(this).tooltip("hide");
        });
    })();

    (function initZoneModeTooltips() {
        var $buttons = $(".zone-type-btn");
        $buttons.tooltip({
            html: true,
            container: "body",
            placement: "auto right",
            trigger: "manual",
            title: function() {
                return '<div class="vt-tooltip-title">' + ($(this).data("tooltip-title") || "") +
                    '</div><div class="vt-tooltip-desc">' + ($(this).data("tooltip-desc") || "") + '</div>';
            }
        });
        $buttons.off(".vectronZoneTooltipViewport")
            .on("shown.bs.tooltip.vectronZoneTooltipViewport", function() {
                eventHandler_keepTooltipInViewport($(this));
            });
        $buttons.on("mouseenter focus", function() {
            $(this).tooltip("show");
        }).on("mouseleave blur", function() {
            $(this).tooltip("hide");
        });
    })();

    $("#dWallSegments").on("change input", function() {
        wallTool_refreshCountInput(true);
        wallTool_renderCurrent();
    });

    $("#dWallText").on("input change", function() {
        if(vectron_currentTool === "wall") {
            wallTool_renderCurrent();
        }
    });

    $("#grid-spacing-select").on("change", function() {
        var spacing = parseFloat(this.value);
        if(isNaN(spacing) || spacing <= 0) return;
        vectron_grid_spacing = spacing;
        vectron_grid_render_spacing = spacing;
        vectron_grid_render_locked = true;
        vectron_render();
    });

    $("#grid-size-lock").on("click", function() {
        gridSizeControls_setLocked(!vectron_grid_render_locked);
    });

    $("#grid-size-decrease").on("click", function() {
        gridSizeControls_step(-1);
    });

    $("#grid-size-increase").on("click", function() {
        gridSizeControls_step(1);
    });

    $("#snap-to-grid-toggle").on("click", function() {
        snapControls_toggle();
    });

    $("#grid-visibility-toggle").on("click", function() {
        gridVisibilityControls_toggle();
    });

    $("#zoom-percent-select").on("change", function() {
        zoomControls_setPercent(parseFloat(this.value));
    });

    $("#zoom-percent-decrease").on("click", function() {
        clearZoomPreview();
        zoomControls_step(-1);
    });

    $("#zoom-percent-increase").on("click", function() {
        clearZoomPreview();
        zoomControls_step(1);
    });

    $("#zoom-reset-100").on("click", function() {
        clearZoomPreview();
        zoomControls_setPercent(100);
    });

    $("#anchor-reset-origin").on("click", function() {
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_render();
    });

    $(eventHandler_pinnedTooltipHelpToggleSelector).mouseup(function(e) {
        e.preventDefault();
        eventHandler_togglePinnedTooltips();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolSpawn").mouseup(function(e) {
        vectron_connectTool("spawn");
        $("#zones-menu").hide();
    });

    $(".toolbar-toolRamp").mouseup(function(e) {
        vectron_connectTool("ramp");
        gui_writeLog('Ramp Tool Connected.');
        $("#zones-menu").hide();
    });
    $(".toolbar-toolFloor").mouseup(function(e) {
        e.preventDefault();
        vectron_connectTool("floor");
        gui_writeLog('Floor Tool Connected.');
        $("#zones-menu").hide();
    });

    $(document).on("click", "#ramp-tool-cancel", rampTool_cancelPlacement);
    $(document).on("click", "#floor-tool-finish", floorTool_finish);
    $(document).on("click", "#floor-tool-cancel", floorTool_cancel);

    $(document).on("click", "#level-menu-toggle", function(e) {
        e.stopPropagation();
        var menu = $("#level-menu");
        var open = !menu.is(":visible");
        menu.toggle(open);
        $(this).attr("aria-expanded", open ? "true" : "false");
    });
    $(document).on("click", "#level-previous, #level-next", function(e) {
        e.stopPropagation();
        var level = Number($(this).attr("data-level"));
        if(isFinite(level)) aamap_setActiveLevel(level);
    });
    $(document).on("click", ".level-select-btn", function(e) {
        e.stopPropagation();
        if(aamap_setActiveLevel(Number($(this).attr("data-level")))) {
            $("#level-menu").hide();
            $("#level-menu-toggle").attr("aria-expanded", "false");
        }
    });
    $(document).on("click", ".level-eye-btn", function(e) {
        e.stopPropagation();
        aamap_toggleLevelVisibility(Number($(this).attr("data-level")));
    });
    $(document).on("click", ".level-delete-btn", function(e) {
        e.stopPropagation();
        if(this.disabled) return;
        var level = Number($(this).attr("data-level"));
        if(!aamap_levelExistsAt(level) || aamap_existingLevels().length <= 1) return;
        eventHandler_levelDeleteTarget = level;
        var existing = aamap_existingLevels();
        var highest = existing[existing.length - 1];
        var lower = level < highest;
        var canKeepSparse = lower && level > 0;
        $("#level-delete-title").text("Delete Level " + level + "?");
        $("#level-delete-message").text(level === 0 ?
            "Level 0 is the permanent base. Its objects will be deleted and every higher level will shift down." : lower ?
            "Every object on this level will be deleted. Choose whether higher numeric levels move down or keep their current IDs and elevations." :
            "Every object on this level will be deleted. This is the highest level, so its final height gap will also be removed.");
        $("#level-delete-keep").toggle(canKeepSparse);
        $("#level-delete-shift").text(lower ? "Delete + shift above down" : "Delete level");
        var popover = document.getElementById("level-delete-popover");
        var rect = this.getBoundingClientRect();
        popover.style.display = "block";
        var width = popover.offsetWidth || 390;
        var height = popover.offsetHeight || 150;
        popover.style.left = Math.max(8, Math.min(window.innerWidth - width - 8,
            rect.right - width)) + "px";
        popover.style.top = Math.max(8, rect.top - height - 8) + "px";
    });
    $(document).on("click", "#level-delete-shift", function(e) {
        e.stopPropagation();
        if(eventHandler_levelDeleteTarget !== null) {
            aamap_deleteLevel(eventHandler_levelDeleteTarget, true);
        }
        eventHandler_levelDeleteTarget = null;
        $("#level-delete-popover,#level-menu").hide();
        $("#level-menu-toggle").attr("aria-expanded", "false");
    });
    $(document).on("click", "#level-delete-keep", function(e) {
        e.stopPropagation();
        if(eventHandler_levelDeleteTarget !== null) {
            aamap_deleteLevel(eventHandler_levelDeleteTarget, false);
        }
        eventHandler_levelDeleteTarget = null;
        $("#level-delete-popover,#level-menu").hide();
        $("#level-menu-toggle").attr("aria-expanded", "false");
    });
    $(document).on("click", "#level-delete-cancel", function(e) {
        e.stopPropagation();
        eventHandler_levelDeleteTarget = null;
        $("#level-delete-popover").hide();
    });
    $(document).on("click", "#level-new, #level-new-quick", function(e) {
        e.stopPropagation();
        if(aamap_addLevel()) {
            $("#level-menu").hide();
            $("#level-menu-toggle").attr("aria-expanded", "false");
        }
    });
    $(document).on("focusin", ".level-height-input", function() {
        $(this).data("previous-height", xml_level_heights[Number($(this).attr("data-gap"))]);
    });
    $(document).on("change", ".level-height-input", function() {
        var gap = Number($(this).attr("data-gap"));
        var height = Number(this.value);
        if(!isFinite(height) || height <= 0) {
            gui_toast("Floor height must be greater than 0.");
            this.value = xml_level_heights[gap] || 8;
            return;
        }
        var previous = Number($(this).data("previous-height"));
        if(!isFinite(previous) || previous <= 0) previous = xml_level_heights[gap] || 8;
        if(previous === height) return;
        xml_level_heights[gap] = height;
        xml_level_height = xml_level_heights[0] || 8;
        aamap_recordAction({
            label:"Change level height",
            undo:function() { xml_level_heights[gap] = previous; xml_level_height = xml_level_heights[0] || 8; aamap_updateLayerControls(); },
            redo:function() { xml_level_heights[gap] = height; xml_level_height = xml_level_heights[0] || 8; aamap_updateLayerControls(); }
        });
        aamap_updateLayerControls();
    });
    $(document).on("mousedown", function(e) {
        if(!$(e.target).closest("#level-dropdown").length) {
            $("#level-menu").hide();
            $("#level-menu-toggle").attr("aria-expanded", "false");
        }
        if(!$(e.target).closest("#level-delete-popover,.level-delete-btn").length) {
            eventHandler_levelDeleteTarget = null;
            $("#level-delete-popover").hide();
        }
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

    // Code Viewer. The full-map tab follows the format that was opened: native
    // maps are editable JSON, while an explicitly imported legacy map remains
    // editable XML for that active editing session. Selection replacement is
    // intentionally an XML fragment because the object importer supports
    // lossless, undoable fragment replacement.
    function xmlEditor_indentLines(str, prefix) {
        return str.split('\n').map(function(line) { return prefix + line; }).join('\n');
    }

    function xmlEditor_getFullSource() {
        var map = eventHandler_getExportMap();
        if(codeViewer_sourceFormat === "legacy-xml") {
            return codeViewer_formatXmlText(armamap_toCompatibilityXml(map.document));
        }
        return codeViewer_formatJsonText(map.text);
    }

    function xmlEditor_getSelectedXML() {
        var objs = selectTool_selectedObjs;
        var xml = '<Field>\n';
        for (var i = 0; i < objs.length; i++) {
            xml += xmlEditor_indentLines(objs[i].getXML(), '  ') + '\n';
        }
        xml += '</Field>';
        return codeViewer_formatXmlText(xml);
    }

    function xmlEditor_updateFormatLabel() {
        var label;
        if(xmlEditor_mode === "selected") label = "Selection XML";
        else label = codeViewer_sourceFormat === "legacy-xml" ? "Legacy XML" : ".armamap JSON";
        $("#code-viewer-format").text(label);
    }

    function xmlEditor_captureMapState() {
        return {
            objects:aamap_objects.slice(),
            name:xml_name,
            author:xml_author,
            version:xml_version,
            category:xml_category,
            authorPasswordHash:xml_author_password_hash,
            authorPasswordDirty:xml_author_password_dirty,
            mapValidation:xml_map_validation ?
                JSON.parse(JSON.stringify(xml_map_validation)) : null,
            settings:xml_settings.slice(),
            axes:xml_axes,
            axisVectors:Array.isArray(xml_axis_vectors) ?
                xml_axis_vectors.map(function(vector) { return vector.slice(); }) : null,
            axesForced:$("#map_axes_forced").is(":checked"),
            levelHeights:xml_level_heights.slice(),
            activeLevel:aamap_activeLevel,
            levelVisible:aamap_levelVisible.slice(),
            levelExists:aamap_levelExists.slice(),
            panX:vectron_panX,
            panY:vectron_panY,
            zoom:vectron_zoom,
            sourceFormat:codeViewer_sourceFormat
        };
    }

    function xmlEditor_restoreMapState(state) {
        aamap_objects.forEach(aamap_removeObjectVisuals);
        selectTool_selectedObjs = [];
        aamap_objects = state.objects;
        aamap_objects.forEach(function(object) { object.isSelected = false; });
        xml_name = state.name;
        xml_author = state.author;
        xml_version = state.version;
        xml_category = state.category;
        xml_author_password_revision++;
        xml_author_password_pending = null;
        xml_author_password_hash = state.authorPasswordHash || "";
        xml_author_password_dirty = !!state.authorPasswordDirty;
        xml_map_validation = state.mapValidation ?
            JSON.parse(JSON.stringify(state.mapValidation)) : null;
        xml_settings = state.settings.slice();
        xml_axes = state.axes;
        xml_axis_vectors = state.axisVectors ?
            state.axisVectors.map(function(vector) { return vector.slice(); }) : null;
        xml_level_heights = state.levelHeights.slice();
        xml_level_height = xml_level_heights[0] || 8;
        aamap_activeLevel = state.activeLevel;
        aamap_levelVisible = state.levelVisible.slice();
        aamap_levelExists = state.levelExists ? state.levelExists.slice() :
            state.levelVisible.map(function() { return true; });
        vectron_panX = state.panX;
        vectron_panY = state.panY;
        vectron_zoom = state.zoom;
        codeViewer_setSourceFormat(state.sourceFormat);
        gui_fillInput();
        $("#map_axes_forced").prop("checked", state.axesForced);
        aamap_updateLayerControls();
        vectron_render();
        actionHistory_update();
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
            $('#xml-editor-content').val(xmlEditor_getFullSource());
        }
        $('#xml-editor-tabs li').removeClass('active');
        $('#xml-tab-' + xmlEditor_mode).addClass('active');
        // Disable selection tab if nothing selected
        if (selectTool_selectedObjs.length === 0) {
            $('#xml-tab-selected').addClass('disabled');
        } else {
            $('#xml-tab-selected').removeClass('disabled');
        }
        xmlEditor_updateFormatLabel();
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

    window.codeViewer_onMapLoaded = function() {
        if($('#xml-editor-overlay').hasClass('visible')) xmlEditor_switchTab('full');
    };

    // Called whenever the selection changes while the Code Viewer is open
    window.xmlEditor_onSelectionChange = function() {
        if(typeof selectTool_updateSelectionProperties === 'function') {
            selectTool_updateSelectionProperties();
        }
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

    function xmlEditor_parseFullSource(content) {
        if(codeViewer_sourceFormat === "armamap") {
            var nativeDocument = JSON.parse(content);
            // Applying code is an intentional edit. Generate its new revision
            // before running the normal import verifier; dropped/imported files
            // still arrive through armamap_process and must match as authored.
            armamap_applyRevision(nativeDocument);
            // Conversion performs the same canonical field validation used by
            // import before any current map state is replaced.
            return {
                document:nativeDocument,
                compatibilityXml:armamap_toCompatibilityXml(nativeDocument)
            };
        }
        $.parseXML(content);
        return content;
    }

    function xmlEditor_apply() {
        var content = $('#xml-editor-content').val();
        var errDiv = document.getElementById('xml-editor-error');

        var isFragment = (xmlEditor_mode === 'selected');
        var parsedFullSource = null;
        if(isFragment) {
            if(!xmlEditor_selectedSnapshot.length) {
                errDiv.textContent = "Select at least one map object before applying selection code.";
                errDiv.style.display = '';
                return;
            }
            if(xmlEditor_validateXML(content, true)) {
                errDiv.textContent = "Invalid selection XML: please check your syntax and try again.";
                errDiv.style.display = '';
                return;
            }
        } else {
            try {
                parsedFullSource = xmlEditor_parseFullSource(content);
            } catch(error) {
                errDiv.textContent = codeViewer_sourceFormat === "armamap" ?
                    "Invalid .armamap JSON: check the syntax and map values." :
                    "Invalid legacy XML: please check your syntax and try again.";
                errDiv.style.display = '';
                return;
            }
        }
        errDiv.style.display = 'none';

        // Save the whole authored map state; importing source changes metadata,
        // floor configuration, axes, and the viewport as well as geometry.
        var oldState = xmlEditor_captureMapState();

        try {
            if (xmlEditor_mode === 'selected' && xmlEditor_selectedSnapshot.length > 0) {
                aamap_objects = aamap_objects.diff(xmlEditor_selectedSnapshot);
                xmlEditor_selectedSnapshot.forEach(function(e) {
                    e.isSelected = false;
                    aamap_removeObjectVisuals(e);
                });
                selectTool_selectedObjs = [];
                var replacementStart = aamap_objects.length;
                xml_process_piece(content);
                var replacements = aamap_objects.slice(replacementStart);
                replacements.forEach(function(object) { object.isSelected = true; });
                selectTool_selectedObjs = replacements.slice();
                xmlEditor_selectedSnapshot = replacements.slice();
                vectron_render();
            } else {
                vectron_forceSelectTool();
                aamap_objects = [];
                if(codeViewer_sourceFormat === "armamap") {
                    armamap_process(parsedFullSource.document, true,
                        parsedFullSource.compatibilityXml);
                } else {
                    xml_process(parsedFullSource, true);
                }
                vectron_render();
            }
        } catch(error) {
            xmlEditor_restoreMapState(oldState);
            errDiv.textContent = "The code could not be applied because it contains invalid map data.";
            errDiv.style.display = '';
            return;
        }

        var newState = xmlEditor_captureMapState();

        // Record the code edit as an undoable action.
        aamap_redoStack = [];
        aamap_recordAction({
            label: "Edit code",
            undo: function() {
                xmlEditor_restoreMapState(oldState);
            },
            redo: function() {
                xmlEditor_restoreMapState(newState);
            }
        });
        // Keep the editor open so authors can apply and continue iterating.
        // Refresh from the applied model so normalization performed by the
        // importer is immediately visible in the same tab.
        if(xmlEditor_mode === "selected" && selectTool_selectedObjs.length) {
            xmlEditor_selectedSnapshot = selectTool_selectedObjs.slice();
            $("#xml-editor-content").val(xmlEditor_getSelectedXML());
            $("#xml-tab-sel-count").text("(" + selectTool_selectedObjs.length + ")");
        } else {
            xmlEditor_mode = "full";
            $("#xml-editor-content").val(xmlEditor_getFullSource());
            $("#xml-editor-tabs li").removeClass("active");
            $("#xml-tab-full").addClass("active");
        }
        xmlEditor_updateFormatLabel();
        $("#xml-editor-overlay").addClass("visible");
    }

    $(".toolbar-toolXml").mouseup(function(e) {
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        xmlEditor_open(hasSelected);
        $("#zones-menu").hide();
    });

    document.addEventListener("keydown", function(e) {
        var isBackquote = e.key === "`" || e.key === "~" || e.code === "Backquote";
        var isPreviewShortcut = (e.key === "i" || e.key === "I" || e.code === "KeyI") &&
            !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
        if((!isBackquote && !isPreviewShortcut) || e.ctrlKey || e.altKey || e.metaKey) return;
        var target = e.target;
        if(target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
            target.isContentEditable)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if(isPreviewShortcut) {
            if(aamap_active && typeof preview3d_open === "function" &&
                (typeof preview3d_opened === "undefined" || !preview3d_opened)) {
                preview3d_open();
            }
            return;
        }
        if(e.shiftKey || e.key === "~") {
            eventHandler_toggleSettings();
            return;
        }
        if($("#xml-editor-overlay").hasClass("visible")) {
            xmlEditor_close();
            return;
        }
        var hasSelected = selectTool_selectedObjs && selectTool_selectedObjs.length > 0;
        xmlEditor_open(hasSelected);
        $("#zones-menu").hide();
    }, true);

    $("#xml-editor-close").mouseup(function(e) {
        xmlEditor_close();
    });

    $(document).on("click", "#xml-editor-close-x", function() {
        xmlEditor_close();
    });

    $("#xml-editor-apply").mouseup(function(e) {
        xmlEditor_apply();
    });

    // Make the Code Viewer draggable via its header
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
        clearZoomPreview();
        vectron_zoom *= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
    });
    $("#cm-zoom-out").mouseup(function(e) {
        clearZoomPreview();
        vectron_zoom /= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
    });
    $("#cm-zoom-100").mouseup(function(e) {
        clearZoomPreview();
        vectron_zoom = 1;
        vectron_render();
    });
    $("#cm-fit-screen").mouseup(function(e) {
        clearZoomPreview();
        aamap_fitToScreen();
    });

    $("#contextMenu .toolbar-toolLock").mouseup(function(e) {
        snapControls_toggle();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoomIn").mouseup(function(e) {
        clearZoomPreview();
        vectron_zoom *= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoomOut").mouseup(function(e) {
        clearZoomPreview();
        vectron_zoom /= 1.1;
        vectron_zoom_adjustment();
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolZoom100").mouseup(function(e) {
        clearZoomPreview();
        vectron_zoom = 1;
        vectron_render();
        $("#zones-menu").hide();
    });

    $(".toolbar-toolFitScreen").mouseup(function(e) {
        clearZoomPreview();
        aamap_fitToScreen();
        $("#zones-menu").hide();
    });

    //Scaling//

    // Need better icons for these.

    $(".toolbar-toolScaleUp").mouseup(function(e) {
        eventHandler_scaleMap(2, "Scale map up");
        $("#zones-menu").hide();
    });

    $(".toolbar-toolScaleDown").mouseup(function(e) {
        eventHandler_scaleMap(0.5, "Scale map down");
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
            // Do not treat the right-button release that opened the menu as an
            // outside click. This was the source of the immediate-close bug.
            if(e.which === 3 && eventHandler_contextMenu) return;
            $contextMenu.stop(true, true).hide();
            aamap_active = true;
            eventHandler_contextMenu = false;
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
                } else if(vectron_currentTool == "ramp") {
                    rampTool_click();
                } else if(vectron_currentTool == "floor") {
                    floorTool_click();
                } else if(vectron_currentTool == "select" && vectron_toolActive) {
                    selectTool_complete();
                } else if(vectron_currentTool == "navigation" && vectron_toolActive) {
                    navigationTool_complete();
                } else if(vectron_currentTool == "split") {
                    splitTool_click();
                } else if(vectron_currentTool == "join") {
                    if(!joinTool_completeSelection()) {
                        joinTool_click();
                    }
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
        } else if(aamap_active && vectron_currentTool == "zone" &&
            ((zoneTool_stage === "shape" && $("#dZoneShape").val() === "polygon") ||
                zoneTool_stage === "movement-path")) {
            zoneTool_finishCurrent();
        } else if(aamap_active && vectron_currentTool == "floor" && vectron_toolActive) {
            floorTool_finish();
        }
    });

    $("#canvas_container").mousedown(function(e) {
        e.preventDefault();
        if(!aamap_active) {
            return;
        }
        eventHandler_ctrl = e.ctrlKey || e.metaKey;
        switch (e.which) {
            case 1:
                if(vectron_currentTool == "select" && !vectron_toolActive) {
                    selectTool_start();
                } else if(vectron_currentTool == "navigation" && !vectron_toolActive) {
                    navigationTool_start();
                } else if(vectron_currentTool == "wallVertexMove" && !vectron_toolActive) {
                    wallVertexMoveTool_start();
                } else if(vectron_currentTool == "join" && !vectron_toolActive) {
                    joinTool_start();
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
        } else if(vectron_currentTool == "zone") {
            zoneTool_guide();
        } else if(vectron_currentTool == "ramp") {
            rampTool_guide();
        } else if(vectron_currentTool == "floor") {
            floorTool_renderCurrent();
        } else if(vectron_currentTool == "spawn") {
            if(spawnTool_currentObj != null)
                spawnTool_currentObj.guide();
        } else if(vectron_currentTool == "select" && vectron_toolActive) {
            selectTool_progress();
        } else if(vectron_currentTool == "select") {
            selectTool_updateHoverFromCursor();
        } else if(vectron_currentTool == "navigation" && vectron_toolActive) {
            navigationTool_progress();
        } else if(vectron_currentTool == "split") {
            splitTool_guide();
        } else if(vectron_currentTool == "join") {
            if(vectron_toolActive) {
                joinTool_progress();
            } else {
                joinTool_guide();
            }
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
    var __zoom_render_timeout;
    var __zoom_last_rendered_zoom = 1;
    var __zoom_canvas = document.getElementById('canvas_container');
    function clearZoomPreview()
    {
        clearTimeout(__zoom_render_timeout);
        __zoom_render_timeout = null;
        __zoom_canvas.style.transform = '';
        __zoom_canvas.style.transformOrigin = '';
    }
    function renderZoomFinal()
    {
        clearZoomPreview();
        __zoom_last_rendered_zoom = vectron_zoom;
        vectron_render();
    }
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

            // Apply instant CSS scale transform for immediate visual feedback before the redraw
            var cssScale = vectron_zoom / __zoom_last_rendered_zoom;
            __zoom_canvas.style.transformOrigin = zoom_mouse_x + 'px ' + zoom_mouse_y + 'px';
            __zoom_canvas.style.transform = 'scale(' + cssScale + ')';
            vectron_write_info();

            // Redraw once the wheel interaction settles instead of on every wheel tick.
            clearTimeout(__zoom_render_timeout);
            // Debounce the full redraw so wheel scrolling stays smooth while the
            // preview transform provides immediate feedback.
            __zoom_render_timeout = setTimeout(function()
            {
                renderZoomFinal();
            }, 80);

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
            if ((evt.keyCode == 17 || evt.keyCode == 91 || evt.keyCode == 93) && eventHandler_ctrl) {
                eventHandler_ctrl = false;
            }
        }).keydown(function(evt) {
            if (evt.keyCode == 16 && !eventHandler_shift) {
                gui_writeLog("shift down.");
                eventHandler_shift = true;
            }
            if ((evt.ctrlKey || evt.metaKey || evt.keyCode == 17 || evt.keyCode == 91 || evt.keyCode == 93) && !eventHandler_ctrl) {
                eventHandler_ctrl = true;
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

    Mousetrap.bind('shift+f', function(e) {
        if(aamap_active && vectron_currentTool == "floor" && vectron_toolActive) {
            floorTool_finish();
            return false;
        }
    });

     Mousetrap.bind('shift+z', function(e) {
        if(!aamap_active) return;

        if(vectron_currentTool == "zone") {
            var availableTypes = ZONE_TOOL_TYPES;
            var currentIndex = availableTypes.indexOf(zoneTool_type);
            zoneTool_type = availableTypes[(currentIndex + 1) % availableTypes.length];
           gui_writeLog('Zone Tool Toggled: '
                + zoneTool_typeArray[zoneTool_type][0]);
            zoneTool_guide();
        zoneTool_updateSettings();
            zoneTool_updateWindowActiveType();
        }
    });

    Mousetrap.bind('l', function(e) {
        if(!aamap_active) return;
        aamap_setActiveLevel(aamap_cycleExistingLevel(aamap_activeLevel, 1));
        return false;
    });

    function eventHandler_increaseSizeShortcut(e) {
        if(!aamap_active) return;
        gridSizeControls_step(1);
        return false;
    }

    function eventHandler_decreaseSizeShortcut(e) {
        if(!aamap_active) return;
        gridSizeControls_step(-1);
        return false;
    }

    $(document).on("keydown.sizeShortcuts", function(e) {
        if(e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

        if(e.key === "=" || e.code === "NumpadAdd" || e.code === "NumpadEqual") {
            if(eventHandler_increaseSizeShortcut(e) === false) e.preventDefault();
        } else if(e.key === "-" || e.code === "NumpadSubtract") {
            if(eventHandler_decreaseSizeShortcut(e) === false) e.preventDefault();
        }
    });

    Mousetrap.bind('escape', function(e) {
        // Priority: cancel active tool / switch to select → deselect
        // NOTE: Escape does NOT close the settings menu or the Code Viewer.
        if(vectron_currentTool == "zone" && vectron_toolActive) {
            zoneTool_cancelPlacement();
            return false;
        }
        if(vectron_currentTool == "wall" && vectron_toolActive) {
            wallTool_cancelCurrent();
            return false;
        }
        if(vectron_currentTool == "ramp" && vectron_toolActive) {
            rampTool_cancelPlacement();
            return false;
        }
        if(vectron_currentTool == "floor" && vectron_toolActive) {
            floorTool_cancel();
            return false;
        }
        if(vectron_toolActive) {
            if(vectron_currentTool == "spawn") {
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
        if(!wallTool_isSlopedHeightEnabled()) $("#dWallPointHeight").val($(this).val());
    });

    $("#dWallSlopedHeight").on("change", function() {
        var enabled = wallTool_isSlopedHeightEnabled();
        if(enabled && !Number($("#dWallPointHeight").val())) {
            $("#dWallPointHeight").val(wallTool_getHeight());
        }
        if(wallTool_currentObj) {
            wallTool_currentObj.slopedHeight = enabled;
            wallTool_currentObj.height = wallTool_getHeight();
            if(enabled) {
                var fallback = wallTool_getPointHeight();
                wallTool_currentObj.points.forEach(function(point) {
                    point.height = wall_normalizeHeight(point.height, fallback);
                });
            }
        }
        wallTool_updateWindow();
        wallTool_updatePointsList();
        wallTool_renderCurrent();
    });
    $("#dWallPointHeight").on("change input", function() {
        $(this).val(wallTool_getPointHeight());
    });

    function eventHandler_createBlankMap() {
        var previousMap = xmlEditor_captureMapState();
        eventHandler_setSettingsOpen(false);
        xmlEditor_close();
        vectron_forceSelectTool();
        aamap_objects.forEach(function(obj) {
            aamap_removeObjectVisuals(obj);
        });
        selectTool_selectedObjs = [];
        aamap_objects = [];
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
        $("#map_name,#map_author,#map_author_password,#map_category,#map_version,#map_settings").val("");
        $("#map_axes").val("");
        $("#map_axes_forced").prop("checked", false);
        xml_name = "";
        xml_author = "";
        xml_author_password_revision++;
        xml_author_password_pending = null;
        xml_author_password_hash = "";
        xml_author_password_dirty = false;
        xml_map_validation = null;
        xml_category = "";
        xml_version = "";
        xml_axes = 4;
        xml_axis_vectors = null;
        xml_settings = [];
        xml_level_height = 8;
        aamap_activeLevel = 0;
        aamap_levelVisible = [true];
        aamap_levelExists = [true];
        xml_level_heights = [];
        codeViewer_setSourceFormat("armamap");
        gui_fillInput();
        $("#map_axes_forced").prop("checked", false);
        aamap_updateLayerControls();
        vectron_render();
        var blankMap = xmlEditor_captureMapState();
        aamap_recordAction({
            label:"New map",
            undo:function() { xmlEditor_restoreMapState(previousMap); },
            redo:function() { xmlEditor_restoreMapState(blankMap); }
        });
        gui_writeLog("New map created.");
    }

    // New maps are immediate and fully undoable; there is no destructive
    // confirmation dialog.
    $(".toolbar-newMap").mouseup(function(e) {
        eventHandler_createBlankMap();
    });

    function eventHandler_openImport() {
        $("#toolbar-files").val("");
        $("#toolbar-files").click();
        $("#zones-menu").hide();
    }

    // Import button (toolbar)
    $(".toolbar-import").mouseup(function(e) {
        eventHandler_openImport();
    });
    $("#toolbar-files").change(function(e) {
        xml_handle(e);
    });

    // Export button (toolbar)
    $(".toolbar-export").mouseup(function(e) {
        eventHandler_downloadExportMap();
        $("#zones-menu").hide();
    });

    Mousetrap.bind('mod+n', function() {
        if(!aamap_active) return;
        eventHandler_createBlankMap();
        return false;
    });
    Mousetrap.bind('mod+o', function() {
        if(!aamap_active) return;
        eventHandler_openImport();
        return false;
    });
    Mousetrap.bind('mod+s', function() {
        if(!aamap_active) return;
        eventHandler_downloadExportMap();
        $("#zones-menu").hide();
        return false;
    });
}

var __resize_timeout;
window.onresize = function() {
    if(!vectron_screen) return;
    var width = $("#canvas_container").width();
    var height = $("#canvas_container").height();
    vectron_screen.setSize(width, height);
    vectron_screen.setViewBox((vectron_width-width)/2, (vectron_height-height)/2, width, height);

    clearTimeout(__resize_timeout);
    __resize_timeout = setTimeout(function(){vectron_render()},150);
}
