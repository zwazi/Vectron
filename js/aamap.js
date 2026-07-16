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

var aamap_active = true;
var aamap_xml = '';
var aamap_objects = [];
var aamap_activeLevel = 0;
var aamap_levelVisible = [true];
// Level numbers may be sparse after deleting a lower floor without shifting
// the floors above it. Visibility and existence are separate so a missing
// numeric slot is never selectable, while its two adjacent height gaps remain
// available to preserve the absolute elevations of higher floors.
var aamap_levelExists = [true];
var xml_level_heights = [];
// Kept as a read/write compatibility alias for older integrations. New maps
// use xml_level_heights, one entry for every adjacent pair of floors.
var xml_level_height = 8;

var aamap_grid = null;
var aamap_floorInfills = null;
var aamap_symmetryGuides = null;
var aamap_symmetryCheckObjects = [];
// Map imports assign geometry after constructing each editor object. Creating
// Raphael placeholders during that phase is pure duplicate work: the final
// render clears them all and builds the real visuals. A depth counter keeps
// nested/import-adjacent processing exception-safe without affecting normal
// interactive tool construction.
var aamap_bulkLoadDepth = 0;
var AAMAP_SYMMETRY_CENTER_EPSILON = 1e-9;

function aamap_beginBulkLoad() {
    aamap_bulkLoadDepth++;
}

function aamap_endBulkLoad() {
    aamap_bulkLoadDepth = Math.max(0, aamap_bulkLoadDepth - 1);
}

function aamap_isBulkLoading() {
    return aamap_bulkLoadDepth > 0;
}

function aamap_symmetryState() {
    return {
        x:$("#symmetry-x-toggle").is(":checked"),
        y:$("#symmetry-y-toggle").is(":checked")
    };
}

function aamap_symmetryEnabled() {
    var state = aamap_symmetryState();
    return state.x || state.y;
}

function aamap_symmetryCheckEnabled() {
    return $("#symmetry-check-toggle").is(":checked") && aamap_symmetryEnabled();
}

function aamap_symmetryTransforms() {
    var state = aamap_symmetryState();
    var transforms = [];
    if(state.x) transforms.push({x:-1, y:1, line:"x=0"});
    if(state.y) transforms.push({x:1, y:-1, line:"y=0"});
    if(state.x && state.y) transforms.push({x:-1, y:-1, line:"x=0 + y=0"});
    return transforms;
}

function aamap_symmetryPoint(point, transform) {
    return {x:Number(point.x) * transform.x, y:Number(point.y) * transform.y};
}

function aamap_symmetryCopyValue(value) {
    if(value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

/**
 * Make an independent reflected editor object. Reflections include secondary
 * geometry such as spawn directions, teleport destinations, ramp edges, and
 * moving-zone paths rather than only changing the object's nominal centre.
 */
function aamap_symmetryClone(aamapObject, transform) {
    var copy = null;
    if(typeof Wall !== "undefined" && aamapObject instanceof Wall) {
        copy = new Wall();
        copy.points = aamapObject.points.map(function(point) {
            var reflected = aamap_symmetryPoint(point, transform);
            return new WallPoint(reflected.x, reflected.y, point.height);
        });
        copy.height = aamapObject.height;
        copy.heightAuthored = aamapObject.heightAuthored;
        copy.slopedHeight = !!aamapObject.slopedHeight;
        copy.level = aamapObject.level;
    } else if(typeof Spawn !== "undefined" && aamapObject instanceof Spawn) {
        copy = new Spawn();
        copy.x = Number(aamapObject.x) * transform.x;
        copy.y = Number(aamapObject.y) * transform.y;
        copy.xDir = Number(aamapObject.xDir) * transform.x;
        copy.yDir = Number(aamapObject.yDir) * transform.y;
        copy.level = aamapObject.level;
        if(copy.guideObj) copy.guideObj.remove();
        copy.guideObj = null;
    } else if(typeof Ramp !== "undefined" && aamapObject instanceof Ramp) {
        if(aamapObject.sourceTwoPoint) {
            copy = new Ramp(
                aamap_symmetryPoint(aamapObject.sourceTwoPoint.start, transform),
                aamap_symmetryPoint(aamapObject.sourceTwoPoint.end, transform),
                aamapObject.sourceTwoPoint.width,
                aamapObject.fromLevel, aamapObject.toLevel
            );
        } else {
            copy = new Ramp(
                aamap_symmetryPoint(aamapObject.from0, transform),
                aamap_symmetryPoint(aamapObject.from1, transform),
                aamap_symmetryPoint(aamapObject.to0, transform),
                aamap_symmetryPoint(aamapObject.to1, transform),
                aamapObject.fromLevel, aamapObject.toLevel
            );
        }
    } else if(typeof Floor !== "undefined" && aamapObject instanceof Floor) {
        copy = new Floor(aamapObject.level);
        copy.points = aamapObject.points.map(function(point) {
            return aamap_symmetryPoint(point, transform);
        });
        if(transform.x * transform.y < 0) copy.points.reverse();
    } else if(typeof Zone !== "undefined" && aamapObject instanceof Zone) {
        var details = {
            level:aamapObject.level,
            zoneName:aamapObject.zoneName,
            shapeType:aamapObject.shapeType,
            trigger:aamapObject.trigger,
            activeStartTick:aamapObject.activeStartTick,
            activeEndTick:aamapObject.activeEndTick,
            options:aamap_symmetryCopyValue(aamapObject.options) || {},
            movementSpeed:aamapObject.movementSpeed,
            rotationSpeed:aamapObject.rotationSpeed * transform.x * transform.y,
            movementMode:aamapObject.movementMode,
            spawnAtVertices:aamapObject.spawnAtVertices,
            movementPath:aamapObject.movementPath.map(function(point) {
                return aamap_symmetryPoint(point, transform);
            })
        };
        var reflectedX = Number(aamapObject.x) * transform.x;
        var reflectedY = Number(aamapObject.y) * transform.y;
        if(aamapObject.shapeType === "rectangle") {
            var firstCorner = aamap_symmetryPoint(
                {x:aamapObject.minx, y:aamapObject.miny}, transform);
            var secondCorner = aamap_symmetryPoint(
                {x:aamapObject.maxx, y:aamapObject.maxy}, transform);
            details.minx = Math.min(firstCorner.x, secondCorner.x);
            details.miny = Math.min(firstCorner.y, secondCorner.y);
            details.maxx = Math.max(firstCorner.x, secondCorner.x);
            details.maxy = Math.max(firstCorner.y, secondCorner.y);
        } else if(aamapObject.shapeType === "polygon") {
            details.polygonScale = aamapObject.polygonScale;
            details.polygonPoints = aamapObject.polygonPoints.map(function(point) {
                return aamap_symmetryPoint(point, transform);
            });
            if(transform.x * transform.y < 0) details.polygonPoints.reverse();
        } else if(aamapObject.shapeType === "line") {
            details.lineStart = aamap_symmetryPoint(aamapObject.lineStart, transform);
            details.lineEnd = aamap_symmetryPoint(aamapObject.lineEnd, transform);
            details.lineWidth = aamapObject.lineWidth;
        }
        if(aamapObject.zoneName === "teleport") {
            details.options.destination_x = Number(aamapObject.options.destination_x) * transform.x;
            details.options.destination_y = Number(aamapObject.options.destination_y) * transform.y;
        }
        copy = new Zone(reflectedX, reflectedY, aamapObject.radius,
            aamapObject.growth, aamapObject.type, aamapObject.option, details);
        copy.level = aamapObject.level;
        if(aamapObject.zoneName === "teleport") {
            var direction = aamapObject.getTeleportDirection();
            copy.setTeleportDirection(direction.x * transform.x, direction.y * transform.y);
        }
    }
    return copy;
}

function aamap_symmetryObjectKey(aamapObject) {
    if(!aamapObject || typeof aamapObject.getXML !== "function") return "";
    return aamapObject.getXML();
}

function aamap_symmetryObjectCenter(aamapObject) {
    if(!aamapObject) return null;
    var position = typeof aamapObject.getPosition === "function" ?
        aamapObject.getPosition() : null;
    if(position && position.length >= 2 && isFinite(Number(position[0])) &&
        isFinite(Number(position[1]))) {
        return {x:Number(position[0]), y:Number(position[1])};
    }
    if(isFinite(Number(aamapObject.x)) && isFinite(Number(aamapObject.y))) {
        return {x:Number(aamapObject.x), y:Number(aamapObject.y)};
    }
    var bounds = typeof aamapObject.getBounds === "function" ?
        aamapObject.getBounds() : null;
    if(!bounds) return null;
    var minx = Number(bounds.minx), miny = Number(bounds.miny);
    var maxx = Number(bounds.maxx), maxy = Number(bounds.maxy);
    if(!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) {
        return null;
    }
    return {x:(minx + maxx) / 2, y:(miny + maxy) / 2};
}

/**
 * A placement whose centre is on a selected symmetry line already owns that
 * line. Do not put an additional editor object on the opposite side; for a
 * two-axis reflection, crossing either centred axis makes that copy redundant.
 */
function aamap_symmetryShouldSkipClone(aamapObject, transform) {
    var center = aamap_symmetryObjectCenter(aamapObject);
    if(!center) return false;
    return (transform.x < 0 && Math.abs(center.x) <= AAMAP_SYMMETRY_CENTER_EPSILON) ||
        (transform.y < 0 && Math.abs(center.y) <= AAMAP_SYMMETRY_CENTER_EPSILON);
}

function aamap_addSymmetryCopiesForExisting(aamapObject) {
    if(!aamapObject) return [];
    var group = aamapObject._symmetryGroup ? aamapObject._symmetryGroup.filter(function(member) {
        return member === aamapObject || aamap_objects.indexOf(member) >= 0;
    }) : [aamapObject];
    if(group.indexOf(aamapObject) < 0) group.push(aamapObject);
    var primary = group.filter(function(member) {
        return member._symmetryTransform && member._symmetryTransform.x === 1 &&
            member._symmetryTransform.y === 1;
    })[0] || aamapObject;
    if(group.indexOf(primary) < 0) group.unshift(primary);
    var keys = {};
    group.forEach(function(member) { keys[aamap_symmetryObjectKey(member)] = true; });
    aamap_symmetryTransforms().forEach(function(transform) {
        if(aamap_symmetryShouldSkipClone(primary, transform)) return;
        var copy = aamap_symmetryClone(primary, transform);
        if(!copy) return;
        var key = aamap_symmetryObjectKey(copy);
        if(keys[key]) {
            aamap_removeObjectVisuals(copy);
            return;
        }
        keys[key] = true;
        copy._symmetryTransform = {x:transform.x, y:transform.y};
        group.push(copy);
        aamap_add(copy);
    });
    group.forEach(function(member) {
        member._symmetryGroup = group;
        if(!member._symmetryTransform) member._symmetryTransform = {x:1, y:1};
    });
    return group;
}

function aamap_addWithSymmetry(aamapObject) {
    aamap_add(aamapObject);
    return aamap_addSymmetryCopiesForExisting(aamapObject);
}

function aamap_removeObjectGroup(group) {
    (group || []).forEach(function(object) { _aamap_removeObj(object); });
}

function aamap_restoreObjectGroup(group) {
    (group || []).forEach(function(object) {
        object.isSelected = false;
        if(aamap_objects.indexOf(object) < 0) aamap_objects.push(object);
    });
}

function aamap_symmetryExpandObjectGroups(objects) {
    var expanded = [];
    (objects || []).forEach(function(object) {
        var group = aamap_symmetryEnabled() && object._symmetryGroup ?
            object._symmetryGroup : [object];
        group.forEach(function(member) {
            if(aamap_objects.indexOf(member) >= 0 && expanded.indexOf(member) < 0) {
                expanded.push(member);
            }
        });
    });
    return expanded;
}

function aamap_symmetryMovePlan(objects, dx, dy) {
    var plan = {entries:[], created:[]};
    if(!aamap_symmetryEnabled()) {
        (objects || []).forEach(function(object) {
            plan.entries.push({object:object, dx:dx, dy:dy});
        });
        return plan;
    }
    var handledMembers = [];
    (objects || []).forEach(function(object) {
        if(handledMembers.indexOf(object) >= 0) return;
        var before = object._symmetryGroup ? object._symmetryGroup.slice() : [object];
        var group = aamap_addSymmetryCopiesForExisting(object);
        group.forEach(function(member) {
            if(before.indexOf(member) < 0 && plan.created.indexOf(member) < 0) {
                plan.created.push(member);
            }
        });
        group.forEach(function(member) {
            if(handledMembers.indexOf(member) < 0) handledMembers.push(member);
        });
        var driver = object._symmetryTransform || {x:1, y:1};
        group.forEach(function(member) {
            if(aamap_objects.indexOf(member) < 0) return;
            var memberTransform = member._symmetryTransform || {x:1, y:1};
            plan.entries.push({
                object:member,
                dx:dx * memberTransform.x / driver.x,
                dy:dy * memberTransform.y / driver.y
            });
        });
    });
    return plan;
}

function aamap_drawSymmetryGuides() {
    if(aamap_symmetryGuides) aamap_symmetryGuides.remove();
    aamap_symmetryGuides = null;
    var state = aamap_symmetryState();
    if(!state.x && !state.y) return;
    aamap_symmetryGuides = vectron_screen.set();
    if(state.x) {
        aamap_symmetryGuides.push(vectron_screen.path([
            "M", aamap_realX(0), 0, "L", aamap_realX(0), vectron_height
        ]).attr({stroke:"#ff4fd8", "stroke-width":2, "stroke-dasharray":"- ",
            "stroke-opacity":0.8}));
    }
    if(state.y) {
        aamap_symmetryGuides.push(vectron_screen.path([
            "M", 0, aamap_realY(0), "L", vectron_width, aamap_realY(0)
        ]).attr({stroke:"#45e5ff", "stroke-width":2, "stroke-dasharray":"- ",
            "stroke-opacity":0.8}));
    }
}

/**
 * Return the screen-space clipping rectangle for one symmetry sector. Map Y
 * increases upward while SVG Y increases downward, so the +Y source sector is
 * above the horizontal guide. The check view always treats +X/+Y as its source
 * and never changes authored objects.
 */
function aamap_symmetryCheckClipRect(transform) {
    transform = transform || {x:1, y:1};
    var axisX = Math.max(0, Math.min(vectron_width, aamap_realX(0)));
    var axisY = Math.max(0, Math.min(vectron_height, aamap_realY(0)));
    var x = transform.x < 0 ? 0 : axisX;
    var y = transform.y < 0 ? axisY : 0;
    var width = transform.x < 0 ? axisX : vectron_width - axisX;
    var height = transform.y < 0 ? vectron_height - axisY : axisY;
    var state = aamap_symmetryState();
    if(!state.x) { x = 0; width = vectron_width; }
    if(!state.y) { y = 0; height = vectron_height; }
    return {x:x, y:y, width:Math.max(0, width), height:Math.max(0, height)};
}

function aamap_visitVisualElements(visual, callback) {
    if(!visual) return;
    if(visual.items && typeof visual.items.forEach === "function") {
        visual.items.forEach(function(item) {
            aamap_visitVisualElements(item, callback);
        });
        return;
    }
    callback(visual);
}

function aamap_applySymmetryCheckClip(aamapObject, transform, disablePointerEvents) {
    var rect = aamap_symmetryCheckClipRect(transform);
    var visuals = aamap_objectVisuals(aamapObject);
    if(aamapObject && aamapObject.detailObj) visuals.push(aamapObject.detailObj);
    visuals.forEach(function(visual) {
        aamap_visitVisualElements(visual, function(element) {
            if(element && typeof element.attr === "function") {
                element.attr({"clip-rect":[rect.x, rect.y, rect.width, rect.height].join(" ")});
            }
            if(disablePointerEvents && element && element.node) {
                element.node.style.pointerEvents = "none";
            }
        });
    });
}

function aamap_renderSymmetryCheckCopies() {
    aamap_symmetryCheckObjects = [];
    if(!aamap_symmetryCheckEnabled()) return;
    var savedTool = vectron_currentTool;
    // Check-view copies are presentation-only and must never gain editor hover
    // or selection handlers.
    vectron_currentTool = "";
    try {
        aamap_objects.forEach(function(original) {
            if(!aamap_isObjectVisible(original)) return;
            aamap_symmetryTransforms().forEach(function(transform) {
                var copy = aamap_symmetryClone(original, transform);
                if(!copy || typeof copy.render !== "function") return;
                copy.render();
                aamap_applyLayerAppearance(copy);
                aamap_applySymmetryCheckClip(copy, transform, true);
                aamap_symmetryCheckObjects.push(copy);
            });
        });
    } finally {
        vectron_currentTool = savedTool;
    }
}

function aamap_init() {
    aamap_updateLayerControls();
    aamap_render();
}

function aamap_normalizeLevel(value, fallback) {
    var level = Number(value);
    if(!isFinite(level) || level < 0 || Math.floor(level) !== level) {
        level = Number(fallback);
        return isFinite(level) && level >= 0 && Math.floor(level) === level ? level : 0;
    }
    return level;
}

function aamap_levelCount() {
    return Math.max(1, aamap_levelExists.length, aamap_levelVisible.length);
}

function aamap_levelExistsAt(level) {
    level = aamap_normalizeLevel(level, 0);
    return level < aamap_levelCount() && !!aamap_levelExists[level];
}

function aamap_existingLevels() {
    var levels = [];
    for(var level = 0; level < aamap_levelCount(); level++) {
        if(aamap_levelExistsAt(level)) levels.push(level);
    }
    return levels;
}

function aamap_adjacentExistingLevel(level, direction) {
    direction = direction < 0 ? -1 : 1;
    for(var next = level + direction; next >= 0 && next < aamap_levelCount(); next += direction) {
        if(aamap_levelExistsAt(next)) return next;
    }
    return null;
}

function aamap_cycleExistingLevel(level, direction) {
    var levels = aamap_existingLevels();
    if(!levels.length) return 0;
    var index = levels.indexOf(aamap_normalizeLevel(level, levels[0]));
    if(index < 0) index = 0;
    direction = direction < 0 ? -1 : 1;
    return levels[(index + direction + levels.length) % levels.length];
}

function aamap_ensureLevel(level, gapHeight) {
    level = aamap_normalizeLevel(level, 0);
    while(aamap_levelExists.length <= level) {
        aamap_levelExists.push(false);
        aamap_levelVisible.push(false);
        var height = Number(gapHeight);
        if(!isFinite(height) || height <= 0) height = xml_level_heights.length ?
            Number(xml_level_heights[xml_level_heights.length - 1]) : Number(xml_level_height);
        if(!isFinite(height) || height <= 0) height = 8;
        xml_level_heights.push(height);
    }
    aamap_levelExists[level] = true;
    aamap_levelVisible[level] = true;
    xml_level_height = xml_level_heights.length ? xml_level_heights[0] : 8;
    return level;
}

function aamap_resetLevels(count, heights, existingLevels) {
    count = Math.max(1, aamap_normalizeLevel(count, 1));
    aamap_levelVisible = [];
    aamap_levelExists = [];
    for(var i = 0; i < count; i++) {
        var exists = existingLevels === undefined ? true :
            (Array.isArray(existingLevels) ? !!existingLevels[i] : !!existingLevels[i]);
        aamap_levelExists.push(exists);
        aamap_levelVisible.push(exists);
    }
    // Runtime Level 0 is the permanent implicit legacy base plane. Keep it
    // present even when importing an older sparse editor export.
    aamap_levelExists[0] = true;
    aamap_levelVisible[0] = true;
    xml_level_heights = [];
    for(var gap = 0; gap < count - 1; gap++) {
        var height = heights && Number(heights[gap]);
        if(!isFinite(height) || height <= 0) height = 8;
        xml_level_heights.push(height);
    }
    xml_level_height = xml_level_heights.length ? xml_level_heights[0] : 8;
    aamap_activeLevel = Math.min(aamap_activeLevel, count - 1);
    if(!aamap_levelExistsAt(aamap_activeLevel)) {
        aamap_activeLevel = aamap_adjacentExistingLevel(aamap_activeLevel, -1);
        if(aamap_activeLevel === null) aamap_activeLevel = aamap_existingLevels()[0] || 0;
    }
}

function aamap_isRamp(aamapObject) {
    return typeof Ramp !== "undefined" && aamapObject instanceof Ramp;
}

function aamap_isTeleport(aamapObject) {
    return typeof Zone !== "undefined" && aamapObject instanceof Zone &&
        aamapObject.zoneName === "teleport";
}

function aamap_isObjectVisible(aamapObject) {
    if(!aamapObject) return false;
    if(typeof Floor !== "undefined" && aamapObject instanceof Floor &&
        aamap_normalizeLevel(aamapObject.level, 0) === 0) return false;
    if(aamap_isRamp(aamapObject)) {
        return !!aamap_levelVisible[aamap_normalizeLevel(aamapObject.fromLevel, 0)] ||
            !!aamap_levelVisible[aamap_normalizeLevel(aamapObject.toLevel, 0)];
    }
    if(aamap_isTeleport(aamapObject)) {
        return !!aamap_levelVisible[aamap_normalizeLevel(aamapObject.level, 0)] ||
            !!aamap_levelVisible[aamap_normalizeLevel(
                aamapObject.options.destination_level, aamapObject.level)];
    }
    return !!aamap_levelVisible[aamap_normalizeLevel(aamapObject.level, 0)];
}

function aamap_isObjectEditable(aamapObject) {
    if(!aamap_isObjectVisible(aamapObject)) return false;
    if(aamap_isRamp(aamapObject)) {
        return aamapObject.fromLevel === aamap_activeLevel || aamapObject.toLevel === aamap_activeLevel;
    }
    return aamap_normalizeLevel(aamapObject.level, 0) === aamap_activeLevel;
}

function aamap_objectVisuals(aamapObject) {
    var visuals = [];
    ["obj", "glowObj", "destinationObj", "destinationGlowObj", "teleportLinkObj",
        "movementPathObj", "checkpointLabelOutlineObj", "checkpointLabelObj",
        "arrowObj", "guideObj",
        "fromLabelObj", "toLabelObj"].forEach(function(name) {
        if(aamapObject && aamapObject[name] && visuals.indexOf(aamapObject[name]) < 0) visuals.push(aamapObject[name]);
    });
    if(aamapObject && aamapObject.labelObjs && typeof aamapObject.labelObjs.forEach === "function") {
        aamapObject.labelObjs.forEach(function(visual) {
            if(visual && visuals.indexOf(visual) < 0) visuals.push(visual);
        });
    }
    return visuals;
}

function aamap_removeObjectVisuals(aamapObject) {
    aamap_objectVisuals(aamapObject).forEach(function(visual) {
        if(visual && typeof visual.remove === "function") visual.remove();
    });
    if(aamapObject) {
        aamapObject.glowObj = null;
        aamapObject.destinationObj = null;
        aamapObject.destinationGlowObj = null;
        aamapObject.teleportLinkObj = null;
        aamapObject.movementPathObj = null;
        aamapObject.checkpointLabelOutlineObj = null;
        aamapObject.checkpointLabelObj = null;
    }
}

function aamap_applyLayerAppearance(aamapObject) {
    var active = aamap_isObjectEditable(aamapObject);
    var opacity = active ? 1 : 0.32;
    aamap_objectVisuals(aamapObject).forEach(function(visual) {
        if(visual && typeof visual.attr === "function") visual.attr({opacity:opacity});
    });
    if(aamapObject && aamapObject.detailObj && typeof aamapObject.detailObj.attr === "function") {
        aamapObject.detailObj.attr({opacity:opacity});
    }
    if(aamap_isTeleport(aamapObject)) {
        var sourceLevel = aamap_normalizeLevel(aamapObject.level, 0);
        var destinationLevel = aamap_normalizeLevel(
            aamapObject.options.destination_level, sourceLevel);
        var sourceOpacity = aamap_levelVisible[sourceLevel] ?
            (sourceLevel === aamap_activeLevel ? 1 : 0.32) : 0;
        var destinationOpacity = aamap_levelVisible[destinationLevel] ?
            (destinationLevel === aamap_activeLevel ? 1 : 0.32) : 0;
        if(aamapObject.obj && typeof aamapObject.obj.attr === "function") {
            aamapObject.obj.attr({opacity:sourceOpacity});
        }
        if(aamapObject.glowObj && typeof aamapObject.glowObj.attr === "function") {
            aamapObject.glowObj.attr({opacity:sourceOpacity});
        }
        if(aamapObject.destinationObj && typeof aamapObject.destinationObj.attr === "function") {
            aamapObject.destinationObj.attr({opacity:destinationOpacity});
        }
        if(aamapObject.destinationGlowObj &&
            typeof aamapObject.destinationGlowObj.attr === "function") {
            aamapObject.destinationGlowObj.attr({opacity:destinationOpacity});
        }
        if(aamapObject.teleportLinkObj &&
            typeof aamapObject.teleportLinkObj.attr === "function") {
            aamapObject.teleportLinkObj.attr({
                opacity:Math.max(sourceOpacity, destinationOpacity) * 0.72
            });
        }
    }
}

function aamap_updateLayerControls() {
    var html = "";
    var canDeleteLevel = aamap_existingLevels().length > 1;
    for(var level = 0; level < aamap_levelCount(); level++) {
        if(aamap_levelExistsAt(level)) {
            html += '<div class="level-menu-row">' +
                '<button class="level-select-btn' + (level === aamap_activeLevel ? ' active' : '') +
                '" data-level="' + level + '">Level ' + level + '</button>' +
                '<button class="level-eye-btn' + (!aamap_levelVisible[level] ? ' layer-hidden' : '') +
                '" data-level="' + level + '" aria-label="' +
                (aamap_levelVisible[level] ? 'Hide' : 'Show') + ' level ' + level + '">' +
                '<i class="fa-solid fa-eye' + (aamap_levelVisible[level] ? '' : '-slash') + '"></i></button>' +
                '<button class="level-delete-btn" data-level="' + level + '" aria-label="Delete level ' +
                level + '"' + (!canDeleteLevel ? ' disabled title="The last level cannot be deleted"' : '') +
                '><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>';
        } else {
            html += '<div class="level-missing-row">Level ' + level + ' deleted; height gaps retained</div>';
        }
        if(level < aamap_levelCount() - 1) {
            html += '<label class="level-height-row">Height ' + level + ' → ' + (level + 1) +
                '<input class="level-height-input" data-gap="' + level + '" type="number" min="0.01" step="0.1" value="' +
                zone_round(xml_level_heights[level] || 8) + '"></label>';
        }
    }
    $("#level-menu-list").html(html);
    $("#active-floor-label").text(aamap_activeLevel);
    var previous = aamap_adjacentExistingLevel(aamap_activeLevel, -1);
    var next = aamap_adjacentExistingLevel(aamap_activeLevel, 1);
    $("#level-previous").prop("disabled", previous === null).attr("data-level", previous === null ? "" : previous);
    $("#level-next").prop("disabled", next === null).attr("data-level", next === null ? "" : next);
}

function aamap_setActiveLevel(level) {
    level = aamap_normalizeLevel(level, aamap_activeLevel);
    if(level >= aamap_levelCount() || !aamap_levelExistsAt(level)) return false;
    if(level === aamap_activeLevel) return true;
    if(vectron_toolActive) {
        var rampAllowsChange = vectron_currentTool === "ramp" &&
            typeof rampTool_allowsLevelChange === "function" && rampTool_allowsLevelChange(level);
        var teleportAllowsChange = vectron_currentTool === "zone" &&
            typeof zoneTool_allowsLevelChange === "function" && zoneTool_allowsLevelChange(level);
        if(!rampAllowsChange && !teleportAllowsChange) {
            gui_toast("Finish or cancel the current action before changing floors.");
            return false;
        }
    }
    aamap_activeLevel = level;
    aamap_levelVisible[level] = true;
    if(typeof selectTool_deselectAll === "function") selectTool_deselectAll();
    aamap_updateLayerControls();
    if(vectron_currentTool === "ramp" && typeof rampTool_onActiveLevelChanged === "function") {
        rampTool_onActiveLevelChanged(level);
    } else if(vectron_currentTool === "floor" &&
        typeof floorTool_onActiveLevelChanged === "function") {
        floorTool_onActiveLevelChanged(level);
    }
    vectron_render();
    if(vectron_currentTool === "zone" &&
        typeof zoneTool_onActiveLevelChanged === "function") {
        zoneTool_onActiveLevelChanged(level);
    }
    gui_writeLog("Editing floor " + level + ".");
    return true;
}

function aamap_toggleLevelVisibility(level) {
    level = aamap_normalizeLevel(level, 0);
    if(level >= aamap_levelCount() || !aamap_levelExistsAt(level)) return false;
    if(vectron_toolActive) {
        gui_toast("Finish or cancel the current action before hiding a floor.");
        return false;
    }
    var nextVisible = !aamap_levelVisible[level];
    var visibleCount = aamap_levelVisible.filter(function(visible) { return !!visible; }).length;
    if(!nextVisible && visibleCount <= 1) {
        gui_toast("At least one floor must remain visible.");
        return false;
    }
    if(!nextVisible && level === aamap_activeLevel) {
        for(var next = 0; next < aamap_levelCount(); next++) {
            if(next !== level && aamap_levelExistsAt(next) && aamap_levelVisible[next]) {
                aamap_activeLevel = next;
                break;
            }
        }
    }
    aamap_levelVisible[level] = nextVisible;
    if(typeof selectTool_deselectAll === "function") selectTool_deselectAll();
    aamap_updateLayerControls();
    vectron_render();
    return true;
}

function aamap_addLevel() {
    var rampCanAddLevel = vectron_toolActive && vectron_currentTool === "ramp" &&
        typeof rampTool_allowsLevelAddition === "function" && rampTool_allowsLevelAddition();
    if(vectron_toolActive && !rampCanAddLevel) {
        gui_toast("Finish or cancel the current action before adding a level.");
        return false;
    }
    var before = aamap_captureLevelState();
    var rampBefore = rampCanAddLevel && typeof rampTool_capturePlacement === "function" ?
        rampTool_capturePlacement() : null;
    var level = null;
    for(var candidate = 0; candidate < aamap_levelCount(); candidate++) {
        if(!aamap_levelExistsAt(candidate)) { level = candidate; break; }
    }
    if(level === null) level = aamap_levelCount();
    var height = xml_level_heights.length ? xml_level_heights[xml_level_heights.length - 1] : 8;
    if(level === aamap_levelCount()) {
        aamap_levelExists.push(true);
        aamap_levelVisible.push(true);
        xml_level_heights.push(height);
    } else {
        aamap_levelExists[level] = true;
        aamap_levelVisible[level] = true;
    }
    xml_level_height = xml_level_heights[0];
    aamap_activeLevel = level;
    aamap_updateLayerControls();
    if(rampCanAddLevel && typeof rampTool_onActiveLevelChanged === "function") {
        rampTool_onActiveLevelChanged(level);
    } else if(vectron_currentTool === "floor" &&
        typeof floorTool_onActiveLevelChanged === "function") {
        floorTool_onActiveLevelChanged(level);
    }
    vectron_render();
    var after = aamap_captureLevelState();
    var rampAfter = rampCanAddLevel && typeof rampTool_capturePlacement === "function" ?
        rampTool_capturePlacement() : null;
    aamap_recordAction({
        label:"Add level",
        undo:function() {
            aamap_restoreLevelState(before);
            if(rampBefore && vectron_currentTool === "ramp" && vectron_toolActive &&
                typeof rampTool_restorePlacement === "function") {
                rampTool_restorePlacement(rampBefore);
            } else if(vectron_currentTool === "floor" &&
                typeof floorTool_onActiveLevelChanged === "function") {
                floorTool_onActiveLevelChanged(aamap_activeLevel);
            }
        },
        redo:function() {
            aamap_restoreLevelState(after);
            if(rampAfter && vectron_currentTool === "ramp" && vectron_toolActive &&
                typeof rampTool_restorePlacement === "function") {
                rampTool_restorePlacement(rampAfter);
            } else if(vectron_currentTool === "floor" &&
                typeof floorTool_onActiveLevelChanged === "function") {
                floorTool_onActiveLevelChanged(aamap_activeLevel);
            }
        }
    });
    return true;
}

function aamap_captureLevelState() {
    return {
        objects:aamap_objects.slice(),
        objectLevels:aamap_objects.map(function(object) {
            return {
                object:object,
                level:object.level,
                fromLevel:object.fromLevel,
                toLevel:object.toLevel,
                destinationLevel:aamap_isTeleport(object) ? object.options.destination_level : undefined
            };
        }),
        activeLevel:aamap_activeLevel,
        levelVisible:aamap_levelVisible.slice(),
        levelExists:aamap_levelExists.slice(),
        levelHeights:xml_level_heights.slice(),
        checkpointEditorState:typeof zoneTool_captureCheckpointEditorState === "function" ?
            zoneTool_captureCheckpointEditorState(aamap_objects) : null
    };
}

function aamap_restoreLevelState(state) {
    aamap_objects.forEach(aamap_removeObjectVisuals);
    aamap_objects = state.objects.slice();
    state.objectLevels.forEach(function(saved) {
        saved.object.level = saved.level;
        if(saved.fromLevel !== undefined) saved.object.fromLevel = saved.fromLevel;
        if(saved.toLevel !== undefined) saved.object.toLevel = saved.toLevel;
        if(aamap_isTeleport(saved.object) && saved.destinationLevel !== undefined) {
            saved.object.options.destination_level = saved.destinationLevel;
        }
    });
    aamap_activeLevel = state.activeLevel;
    aamap_levelVisible = state.levelVisible.slice();
    aamap_levelExists = state.levelExists.slice();
    xml_level_heights = state.levelHeights.slice();
    xml_level_height = xml_level_heights[0] || 8;
    if(state.checkpointEditorState &&
        typeof zoneTool_restoreCheckpointEditorState === "function") {
        zoneTool_restoreCheckpointEditorState(
            state.checkpointEditorState, aamap_objects, false);
    } else if(typeof zoneTool_syncCheckpointNumberForAvailability === "function") {
        zoneTool_syncCheckpointNumberForAvailability(aamap_objects);
    }
    if(typeof selectTool_deselectAll === "function") selectTool_deselectAll();
    aamap_updateLayerControls();
    vectron_render();
}

function aamap_deleteLevel(level, shiftAboveDown) {
    level = Number(level);
    if(!isFinite(level) || level < 0 || Math.floor(level) !== level ||
        !aamap_levelExistsAt(level) || aamap_existingLevels().length <= 1 ||
        (level === 0 && !shiftAboveDown)) return false;
    if(vectron_toolActive) {
        gui_toast("Finish or cancel the current action before deleting a level.");
        return false;
    }

    var before = aamap_captureLevelState();
    aamap_objects = aamap_objects.filter(function(object) {
        var remove = aamap_isRamp(object) ?
            (object.fromLevel === level || object.toLevel === level) :
            aamap_normalizeLevel(object.level, 0) === level;
        if(aamap_isTeleport(object) &&
            aamap_normalizeLevel(object.options.destination_level, object.level) === level) remove = true;
        if(remove) aamap_removeObjectVisuals(object);
        return !remove;
    });

    if(shiftAboveDown) {
        aamap_objects.forEach(function(object) {
            if(aamap_isRamp(object)) {
                if(object.fromLevel > level) object.fromLevel--;
                if(object.toLevel > level) object.toLevel--;
            } else if(aamap_normalizeLevel(object.level, 0) > level) {
                object.level--;
            }
            if(aamap_isTeleport(object) && object.options.destination_level > level) {
                object.options.destination_level--;
            }
        });
        aamap_levelExists.splice(level, 1);
        aamap_levelVisible.splice(level, 1);
        if(level === 0) {
            aamap_levelExists[0] = true;
            aamap_levelVisible[0] = true;
        }
        xml_level_heights.splice(Math.max(0, level - 1), 1);
        if(aamap_activeLevel > level) aamap_activeLevel--;
        else if(aamap_activeLevel === level) {
            aamap_activeLevel = Math.min(level, aamap_levelCount() - 1);
        }
    } else {
        aamap_levelExists[level] = false;
        aamap_levelVisible[level] = false;
        if(aamap_activeLevel === level) {
            aamap_activeLevel = aamap_adjacentExistingLevel(level, -1);
            if(aamap_activeLevel === null) aamap_activeLevel = aamap_adjacentExistingLevel(level, 1);
        }
    }
    if(!aamap_levelExistsAt(aamap_activeLevel)) aamap_activeLevel = aamap_existingLevels()[0] || 0;
    xml_level_height = xml_level_heights[0] || 8;
    if(typeof zoneTool_syncCheckpointNumberForAvailability === "function") {
        zoneTool_syncCheckpointNumberForAvailability(aamap_objects);
    }
    if(typeof selectTool_deselectAll === "function") selectTool_deselectAll();
    aamap_updateLayerControls();
    vectron_render();

    var after = aamap_captureLevelState();
    aamap_recordAction({
        label:shiftAboveDown ? "Delete level and shift" : "Delete level",
        undo:function() { aamap_restoreLevelState(before); },
        redo:function() { aamap_restoreLevelState(after); }
    });
    return true;
}

function aamap_getAxesXML(axes, indent) {
    indent = indent || "";
    if(!$("#map_axes_forced")[0].checked) return "";
    if(Array.isArray(xml_axis_vectors) && xml_axis_vectors.length) {
        return indent + '<Axes number="' + xml_axis_vectors.length + '" normalize="false">\n' +
            xml_axis_vectors.map(function(vector) {
                return indent + '  <Axis xdir="' + vector[0] + '" ydir="' + vector[1] + '"/>\n';
            }).join("") + indent + '</Axes>\n';
    }
    return indent + '<Axes number="' + axes + '"/>\n';
}

function aamap_usesMultipleLevels() {
    if(aamap_levelCount() > 1) return true;
    for(var i = 0; i < aamap_objects.length; i++) {
        var object = aamap_objects[i];
        if(aamap_isRamp(object)) return true;
        if(aamap_normalizeLevel(object.level, 0) > 0) return true;
        if(object instanceof Zone && object.zoneName === "teleport" &&
            aamap_normalizeLevel(object.options.destination_level, object.level) > 0) {
            return true;
        }
    }
    return false;
}

function aamap_validateForExport(axes) {
    var errors = [];
    var hasSpawn = aamap_objects.some(function(object) {
        return object instanceof Spawn;
    });
    if(!hasSpawn) errors.push("Add at least one spawn point before exporting.");

    if($("#map_axes_forced").is(":checked") &&
        (!isFinite(Number(axes)) || Math.floor(Number(axes)) !== Number(axes) ||
            Number(axes) < 1 || Number(axes) > 65535)) {
        errors.push("Axes must be a whole number from 1 to 65535.");
    }

    function isWholeNonNegative(value) {
        value = Number(value);
        return isFinite(value) && value >= 0 && Math.floor(value) === value;
    }

    aamap_objects.forEach(function(object) {
        var objectLevel = aamap_normalizeLevel(object.level, 0);
        if(object instanceof Spawn &&
            (!isFinite(Number(object.xDir)) || !isFinite(Number(object.yDir)) ||
                (Number(object.xDir) === 0 && Number(object.yDir) === 0))) {
            errors.push("Spawn direction must be a finite nonzero vector.");
        }
        if(!aamap_isRamp(object) &&
            (objectLevel >= aamap_levelCount() || !aamap_levelExistsAt(objectLevel))) {
            errors.push("Every object must use an existing level.");
        }
        if(aamap_isRamp(object)) {
            if(aamap_normalizeLevel(object.fromLevel, 0) >= aamap_levelCount() ||
                aamap_normalizeLevel(object.toLevel, 0) >= aamap_levelCount() ||
                !aamap_levelExistsAt(object.fromLevel) ||
                !aamap_levelExistsAt(object.toLevel) ||
                object.fromLevel === object.toLevel) {
                errors.push("Ramp endpoints must use two different existing levels.");
            }
            if(typeof ramp_geometryValid !== "function" || !ramp_geometryValid(object.points)) {
                errors.push("Ramp edges must form a non-degenerate ramp surface.");
            }
            return;
        }
        if(typeof Floor !== "undefined" && object instanceof Floor) {
            if(objectLevel === 0) return;
            if(typeof floorTool_isSimplePolygon !== "function" ||
                !floorTool_isSimplePolygon(object.points)) {
                errors.push("Floor outlines must have at least three corners and may not self-intersect.");
            }
            return;
        }
        if(!(object instanceof Zone)) return;
        if(["", "on_enter", "while_inside", "on_exit"].indexOf(object.trigger || "") < 0) {
            errors.push("Zone trigger must be on entry, while inside, or on exit.");
        }
        if(object.zoneName === "checkpoint" &&
            (typeof zoneTool_validCheckpointOrder === "function" ?
                !zoneTool_validCheckpointOrder(Number(object.option)) :
                !isWholeNonNegative(object.option))) {
            errors.push("Checkpoint order must be a whole number from 0 through 4294967295.");
        }
        if(object.shapeType === "line") {
            var lineWidth = Number(object.lineWidth);
            var lineStart = object.lineStart || {};
            var lineEnd = object.lineEnd || {};
            if(!isFinite(lineWidth) || lineWidth < 0) {
                errors.push("Line-zone width must be 0 or greater.");
            }
            if(!isFinite(Number(lineStart.x)) || !isFinite(Number(lineStart.y)) ||
                !isFinite(Number(lineEnd.x)) || !isFinite(Number(lineEnd.y)) ||
                (Number(lineStart.x) === Number(lineEnd.x) &&
                    Number(lineStart.y) === Number(lineEnd.y))) {
                errors.push("Line-zone endpoints must be two distinct finite points.");
            }
        }
        if((object.zoneName === "speed" || object.zoneName === "rubber") &&
            !isWholeNonNegative(object.options.duration_ticks)) {
            errors.push("Zone duration must be a whole non-negative tick count.");
        }
        if(object.zoneName === "health" && !isFinite(Number(object.options.delta))) {
            errors.push("Health-zone delta must be a number.");
        }
        if(object.zoneName === "setting") {
            var settingError = zoneTool_settingValidationError(
                object.options.setting, object.options.value);
            if(settingError) errors.push(settingError);
        }
        if(object.movementPath && object.movementPath.length) {
            var validMovementPoints = object.movementPath.length >= 2 &&
                object.movementPath.every(function(point) {
                    return point && isFinite(Number(point.x)) && isFinite(Number(point.y));
                });
            var hasMovementDistance = validMovementPoints &&
                object.movementPath.some(function(point) {
                    return Number(point.x) !== Number(object.movementPath[0].x) ||
                        Number(point.y) !== Number(object.movementPath[0].y);
                });
            if(!validMovementPoints || !hasMovementDistance) {
                errors.push("Moving zones need at least two distinct finite path points.");
            }
            if(!isFinite(Number(object.movementSpeed)) || Number(object.movementSpeed) <= 0) {
                errors.push("Moving-zone speed must be greater than zero.");
            }
            if(!isFinite(Number(object.rotationSpeed))) {
                errors.push("Moving-zone rotation speed must be finite.");
            }
            if(["circular", "ping_pong", "instant"].indexOf(object.movementMode) < 0) {
                errors.push("Moving-zone loop mode must be Circular, Ping-pong, or Instant.");
            }
            if(typeof object.spawnAtVertices !== "boolean") {
                errors.push("Moving-zone vertex copies must be enabled or disabled.");
            }
        }
        if(object.zoneName === "rubber" &&
            (!isFinite(Number(object.options.delta)) ||
                Math.floor(Number(object.options.delta)) !== Number(object.options.delta))) {
            errors.push("Rubber-zone delta must be a whole number.");
        }
        if(object.zoneName === "teleport") {
            var destinationLevel = Number(object.options.destination_level);
            if(!isFinite(Number(object.options.destination_x)) ||
                !isFinite(Number(object.options.destination_y))) {
                errors.push("Teleport destinations must use finite X and Y coordinates.");
            }
            if(!isWholeNonNegative(destinationLevel) || destinationLevel >= aamap_levelCount() ||
                !aamap_levelExistsAt(destinationLevel)) {
                errors.push("Teleport destination floor must be an existing level.");
            }
            if(object.options.angle !== undefined) {
                var angle = Number(object.options.angle);
                var supportedAngles = [0, 30, 45, 60, 90, 120, 135, 150,
                    180, 210, 225, 240, 270, 300, 315, 330];
                var normalizedAngle = ((angle % 360) + 360) % 360;
                if(!isFinite(angle) || Math.floor(angle) !== angle ||
                    supportedAngles.indexOf(normalizedAngle) < 0) {
                    errors.push("Teleport angle must use an Arma Racing deterministic angle.");
                }
            } else if(object.options.direction !== undefined) {
                if(["north", "n", "east", "e", "south", "s", "west", "w"]
                    .indexOf(String(object.options.direction).toLowerCase()) < 0) {
                    errors.push("Teleport direction must be north, east, south, or west.");
                }
            } else if(!isFinite(Number(object.options.xdir)) ||
                !isFinite(Number(object.options.ydir))) {
                errors.push("Teleport direction must use finite X and Y values.");
            }
        }
    });

    return errors.filter(function(message, index) {
        return errors.indexOf(message) === index;
    });
}

function aamap_warningsForExport() {
    var hasUpperLevel = aamap_existingLevels().some(function(level) {
        return level > 0;
    });
    if(!hasUpperLevel) return [];

    var hasUpperFloor = typeof Floor !== "undefined" && aamap_objects.some(function(object) {
        if(!(object instanceof Floor)) return false;
        var level = aamap_normalizeLevel(object.level, 0);
        return level > 0 && aamap_levelExistsAt(level);
    });
    if(hasUpperFloor) return [];

    return ["This map has upper levels but no upper-level floors. " +
        "Cycles will fall through those levels. Export anyway?"];
}

function aamap_buildXml(name, author, category, version, axes, settings, authorPasswordHash) {
    var fileName = name + "-" + version + ".aamap.xml";
    var usesMultipleLevels = aamap_usesMultipleLevels();

    function indentLines(str, prefix) {
        return str.split('\n').map(function(line) { return prefix + line; }).join('\n');
    }

    function escapeAttr(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
            .replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    var xml = "";
    xml += '<?xml version="1.0" encoding="UTF-8"?>'+"\n";
    xml += '<Resource type="aamap" name="'+ escapeAttr(name) +'" version="'+ escapeAttr(version) +'" author="'+ escapeAttr(author) +'" category="'+ escapeAttr(category) +'">'+"\n";
    var passwordAttribute = xml_isValidAuthorPasswordHash(authorPasswordHash) ?
        ' author_password_hash="' + escapeAttr(authorPasswordHash) + '"' : '';
    xml += '  <Map version="2"' + passwordAttribute + '>'+"\n";
    var mapSettings = [];
    for(var i = 0, ii = settings.length; i < ii; i++)
    {
        var trimmedSetting = settings[i].trim();
        var settingName = trimmedSetting.split(/\s+/, 1)[0].toUpperCase();
        if(trimmedSetting != "" && settingName !== "LANDSCAPE")
        {
            mapSettings.push(trimmedSetting);
        }
    }

    if(mapSettings.length > 0)
    {
        xml += "    <Settings>\n";
        for(var i = 0, ii = mapSettings.length; i < ii; i++)
        {
            var point = mapSettings[i].indexOf(" ");
            var setting = point == -1 ? mapSettings[i] : mapSettings[i].slice(0, point);
            var value = point == -1 ? "" : mapSettings[i].slice(point + 1);
            xml += "      <Setting name=\""+escapeAttr(setting)+"\" value=\""+escapeAttr(value)+"\"/>\n";
        }
        xml += "    </Settings>\n";
    }
    xml += '    <World>\n';
    var levelHeightAttribute = "";
    if(usesMultipleLevels) {
        var heights = [];
        for(var gap = 0; gap < aamap_levelCount() - 1; gap++) {
            var height = Number(xml_level_heights[gap]);
            if(!isFinite(height) || height <= 0) height = 8;
            heights.push(zone_round(height));
        }
        levelHeightAttribute = ' level_heights="' + escapeAttr(heights.join(",")) + '"';
    }
    xml += '      <Field' + levelHeightAttribute + '>\n';
    xml += aamap_getAxesXML(axes, "        ");
    aamap_existingLevels().forEach(function(level) {
        xml += '        <Level index="' + level + '"/>\n';
    });
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        if(typeof Floor !== "undefined" && aamap_objects[i] instanceof Floor &&
            aamap_normalizeLevel(aamap_objects[i].level, 0) === 0) continue;
        xml += indentLines(aamap_objects[i].getXML(usesMultipleLevels), '        ');
        xml += "\n";
    }
    xml += '      </Field>\n';
    xml += '    </World>\n';
    xml += '  </Map>\n';
    xml += '</Resource>\n';
    xml += "<!-- Exported from Vectron for Arma Racing -->";

    return {
        fileName: fileName,
        xml: xml,
        validationErrors: aamap_validateForExport(axes),
        validationWarnings: aamap_warningsForExport()
    };
}

function aamap_save(name, author, category, version, axes, settings, authorPasswordHash) {
    var map = aamap_buildXml(name, author, category, version, axes, settings,
        authorPasswordHash);
    vectron_saveTextAsFile(map.xml, map.fileName);
}

function aamap_render() {
    aamap_drawGrid();
    aamap_drawSymmetryGuides();
    aamap_drawFloorInfills();

    if(vectron_currentTool == "select" && typeof selectTool_beginRenderCycle == "function") {
        selectTool_beginRenderCycle();
    }

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        if(!aamap_isObjectVisible(aamap_objects[i])) {
            aamap_removeObjectVisuals(aamap_objects[i]);
            continue;
        }
        aamap_objects[i].render();
        aamap_applyLayerAppearance(aamap_objects[i]);
        if(aamap_symmetryCheckEnabled()) {
            aamap_applySymmetryCheckClip(aamap_objects[i], {x:1, y:1}, false);
        }
    }

    aamap_renderSymmetryCheckCopies();

    if(vectron_currentTool == "wall")
    {
        wallTool_renderCurrent();
    }
    else if( vectron_currentTool == "select" && vectron_toolActive )
    {
        selectTool_progress();
    }
    else if( vectron_currentTool == "wallVertexMove" )
    {
        wallVertexMoveTool_dots = null; // cleared by screen.clear()
        wallVertexMoveTool_angleGuides = null;
        wallVertexMoveTool_drawDots();
    }
    else if(vectron_currentTool == "ramp")
    {
        rampTool_guide();
    }
    else if(vectron_currentTool == "floor")
    {
        floorTool_renderCurrent();
    }
    else if(vectron_currentTool == "zone" && typeof zoneTool_renderCurrent == "function")
    {
        zoneTool_renderCurrent();
    }
}

/**
 * Return the combined world-space bounds for a set of map objects. Zone
 * bounds include their movement paths and teleport destinations, so callers
 * can treat every stored position as one rigid piece of map geometry.
 */
function aamap_getObjectsBounds(objects, visibleLevels) {
    var bounds = null;
    objects = objects || [];
    for(var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        var current = typeof obj.getBounds === "function" ?
            obj.getBounds(visibleLevels) : null;
        if(!current && isFinite(obj.x) && isFinite(obj.y)) {
            current = {minx:obj.x, miny:obj.y, maxx:obj.x, maxy:obj.y};
        }
        if(!current || !isFinite(current.minx) || !isFinite(current.miny) ||
            !isFinite(current.maxx) || !isFinite(current.maxy)) continue;
        if(!bounds) {
            bounds = {minx:current.minx, miny:current.miny,
                maxx:current.maxx, maxy:current.maxy};
        }
        else {
            bounds.minx = Math.min(bounds.minx, current.minx);
            bounds.miny = Math.min(bounds.miny, current.miny);
            bounds.maxx = Math.max(bounds.maxx, current.maxx);
            bounds.maxy = Math.max(bounds.maxy, current.maxy);
        }
    }
    return bounds;
}

/**
 * Rigidly translate map objects until the center of their combined bounds is
 * world 0,0. Dimensions, direction vectors, levels, heights, and all relative
 * positions remain unchanged because every object receives the same offset.
 */
function aamap_centerObjectsOnOrigin(objects) {
    var movableObjects = (objects || []).filter(function(object) {
        return object && typeof object.move === "function";
    });
    var bounds = aamap_getObjectsBounds(movableObjects);
    if(!bounds) return null;
    var dx = -(bounds.minx + bounds.maxx) / 2;
    var dy = -(bounds.miny + bounds.maxy) / 2;
    // Do not leak negative zero into serialized coordinates or tests.
    if(dx === 0) dx = 0;
    if(dy === 0) dy = 0;
    if(dx !== 0 || dy !== 0) {
        movableObjects.forEach(function(object) { object.move(dx, dy); });
    }
    return {dx:dx, dy:dy, bounds:aamap_getObjectsBounds(movableObjects)};
}

function aamap_getVisibleBounds() {
    var visibleObjects = aamap_objects.filter(function(object) {
        return aamap_isObjectVisible(object);
    });
    return aamap_getObjectsBounds(visibleObjects, aamap_levelVisible);
}

function aamap_panCenter() {
    var bounds = aamap_getVisibleBounds();
    var ptsx = bounds ? [bounds.minx, bounds.maxx] : [];
    var ptsy = bounds ? [bounds.miny, bounds.maxy] : [];

    if(ptsx.length == 0) ptsx.push(0);
    if(ptsy.length == 0) ptsy.push(0);

    var max_x = Math.max.apply(Math, ptsx);
    var min_x = Math.min.apply(Math, ptsx);
    var max_y = Math.max.apply(Math, ptsy);
    var min_y = Math.min.apply(Math, ptsy);

    vectron_panX = -1*(max_x + min_x)/2;
    vectron_panY = -1*(max_y + min_y)/2;
    vectron_render();
}

function aamap_fitToScreen() {
    var bounds = aamap_getVisibleBounds();
    var ptsx = bounds ? [bounds.minx, bounds.maxx] : [];
    var ptsy = bounds ? [bounds.miny, bounds.maxy] : [];

    if(ptsx.length == 0) {
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
        vectron_render();
        return;
    }

    var max_x = Math.max.apply(Math, ptsx);
    var min_x = Math.min.apply(Math, ptsx);
    var max_y = Math.max.apply(Math, ptsy);
    var min_y = Math.min.apply(Math, ptsy);

    vectron_panX = -1*(max_x + min_x)/2;
    vectron_panY = -1*(max_y + min_y)/2;

    var map_width = max_x - min_x;
    var map_height = max_y - min_y;

    if(map_width > 0 || map_height > 0) {
        var padding = 0.85; // use 85% of the canvas (15% margin around the map)
        vectron_zoom = Math.min(
            map_width > 0 ? (vectron_width * padding) / map_width : Infinity,
            map_height > 0 ? (vectron_height * padding) / map_height : Infinity
        );
    }

    vectron_render();
}

function aamap_scale(factor) {
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        aamap_objects[i].scale(factor);
    }
    vectron_render();
}

function aamap_rotate(rad)
{
    for(var i=aamap_objects.length-1;i>=0;--i)
    {
        aamap_objects[i].rotate(rad);
    }
    vectron_render();
}

function aamap_rotateSimple(dir)
{
    for(var i=aamap_objects.length-1;i>=0;--i)
    {
        aamap_objects[i].rotateSimple(dir);
    }
    vectron_render();
}

var aamap_undoStack = [];
var aamap_redoStack = [];

function aamap_recordAction(action) {
    if(typeof xml_invalidateAuthorTime === "function") xml_invalidateAuthorTime();
    aamap_undoStack.push(action);
    aamap_redoStack = [];
    actionHistory_update();
}

function aamap_clearHistory() {
    aamap_undoStack = [];
    aamap_redoStack = [];
    actionHistory_update();
}

function _aamap_removeObj(aamapObject) {
    var idx = aamap_objects.indexOf(aamapObject);
    if (idx >= 0) aamap_objects.splice(idx, 1);
    aamap_removeObjectVisuals(aamapObject);
}

function aamap_add(aamapObject) {
    aamap_objects.push(aamapObject);
    aamap_xml += aamapObject.xml;
}

function aamap_remove(aamapObject) {
    var index = aamap_objects.indexOf(aamapObject);
    if(index > -1) {
        gui_writeLog("Match!");
        _aamap_removeObj(aamapObject);
    }
}

function aamap_undo() {
    gui_writeLog("Undo.");
    if (aamap_undoStack.length === 0) { gui_toast("Nothing to undo."); return; }
    var action = aamap_undoStack.pop();
    action.undo();
    aamap_redoStack.push(action);
    actionHistory_update();
}

function aamap_redo() {
    if (aamap_redoStack.length === 0) { gui_toast("Nothing to redo."); return; }
    var action = aamap_redoStack.pop();
    action.redo();
    aamap_undoStack.push(action);
    actionHistory_update();
}

function aamap_activate() {
    aamap_active = true;
}

function aamap_deactivate() {
    aamap_active = false;
}

function aamap_mapX(realX) {
    return (realX - vectron_width/2) / vectron_zoom - vectron_panX;
}

function aamap_mapY(realY) {
    return -1*(realY - vectron_height/2) / vectron_zoom - vectron_panY;
}

function aamap_realX(mapX) {
    return vectron_width/2 + ((mapX + vectron_panX)*vectron_zoom);
}

function aamap_realY(mapY) {
    return vectron_height/2 + (-1*(mapY + vectron_panY)*vectron_zoom);
}

function aamap_drawGrid() {
    if(aamap_grid != null) {
        aamap_grid.remove();
    }

    if(!vectron_grid_visible) return;
    if(vectron_grid_spacing <= 0) return;

    if(config_autoAdjustGridSpacing && !vectron_grid_render_locked)
    {
        vectron_grid_spacing = vectron_getAutoGridSpacing(vectron_grid_spacing);
        vectron_grid_render_spacing = vectron_grid_spacing;
    }

    var renderSpacing = vectron_grid_render_locked ? vectron_grid_render_spacing : vectron_grid_spacing;
    var gridSpacing = vectron_zoom * renderSpacing;
    var originX = vectron_width/2 + (vectron_zoom * vectron_panX);
    var originY = vectron_height/2 - (vectron_zoom * vectron_panY);

    var regularArray = [];
    var tenthArray = [];
    var axisXArray = [];
    var axisYArray = [];

    var families = gridLayout_getLineFamilies(config_gridLayout, gridSpacing);
    var expandedLeft = -vectron_width;
    var expandedRight = vectron_width * 2;
    var expandedTop = -vectron_height;
    var expandedBottom = vectron_height * 2;
    var corners = [
        [expandedLeft - originX, expandedTop - originY],
        [expandedRight - originX, expandedTop - originY],
        [expandedLeft - originX, expandedBottom - originY],
        [expandedRight - originX, expandedBottom - originY]
    ];
    function addLine(target, x1, y1, x2, y2) {
        target.push("M", x1, y1, "L", x2, y2);
    }

    function addVisibleGridLine(target, x1, y1, x2, y2) {
        addLine(target, x1, y1, x2, y2);
    }

    function lineIntersectionsWithExpandedViewport(px, py, dx, dy) {
        var hits = [];

        function addHit(t) {
            var x = px + dx * t;
            var y = py + dy * t;
            if(x < expandedLeft - GRID_LAYOUT_EPSILON || x > expandedRight + GRID_LAYOUT_EPSILON) return;
            if(y < expandedTop - GRID_LAYOUT_EPSILON || y > expandedBottom + GRID_LAYOUT_EPSILON) return;
            for(var i = 0; i < hits.length; i++) {
                if(Math.abs(hits[i].x - x) < GRID_LAYOUT_EPSILON && Math.abs(hits[i].y - y) < GRID_LAYOUT_EPSILON) return;
            }
            hits.push({ x: x, y: y, t: t });
        }

        if(Math.abs(dx) > GRID_LAYOUT_EPSILON) {
            addHit((expandedLeft - px) / dx);
            addHit((expandedRight - px) / dx);
        }
        if(Math.abs(dy) > GRID_LAYOUT_EPSILON) {
            addHit((expandedTop - py) / dy);
            addHit((expandedBottom - py) / dy);
        }

        if(hits.length < 2) return null;
        hits.sort(function(a, b) { return a.t - b.t; });
        return {
            x1: hits[0].x,
            y1: hits[0].y,
            x2: hits[hits.length - 1].x,
            y2: hits[hits.length - 1].y
        };
    }

    function lineCategory(angle, idx) {
        var horizontal = Math.abs(Math.sin(angle)) < GRID_LAYOUT_EPSILON;
        var vertical = Math.abs(Math.cos(angle)) < GRID_LAYOUT_EPSILON;
        if(idx === 0) {
            if(horizontal) return "axisX";
            if(vertical) return "axisY";
        }
        if(idx % 10 === 0) return "tenth";
        return "regular";
    }

    var hasOriginXAxis = false;
    var hasOriginYAxis = false;

    families.forEach(function(family) {
        var angle = family.angle;
        var familySpacing = family.spacing;
        var nx = -Math.sin(angle), ny = Math.cos(angle);
        var dx = Math.cos(angle), dy = Math.sin(angle);
        var minProj = Infinity, maxProj = -Infinity;

        for(var c = 0; c < corners.length; c++) {
            var proj = corners[c][0] * nx + corners[c][1] * ny;
            if(proj < minProj) minProj = proj;
            if(proj > maxProj) maxProj = proj;
        }

        var kMin = Math.floor(minProj / familySpacing) - 1;
        var kMax = Math.ceil(maxProj / familySpacing) + 1;
        for(var k = kMin; k <= kMax; k++) {
            var offset = k * familySpacing;
            var centerX = originX + nx * offset;
            var centerY = originY + ny * offset;
            var clipped = lineIntersectionsWithExpandedViewport(centerX, centerY, dx, dy);
            if(!clipped) continue;
            var category = lineCategory(angle, k);
            if(category === "axisX") {
                hasOriginXAxis = true;
                addVisibleGridLine(axisXArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            }
            else if(category === "axisY") {
                hasOriginYAxis = true;
                addVisibleGridLine(axisYArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            }
            else if(category === "tenth") addVisibleGridLine(tenthArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            else addVisibleGridLine(regularArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
        }
    });

    if(!hasOriginYAxis && originX >= expandedLeft && originX <= expandedRight) {
        addVisibleGridLine(axisYArray, originX, expandedTop, originX, expandedBottom);
    }
    if(!hasOriginXAxis && originY >= expandedTop && originY <= expandedBottom) {
        addVisibleGridLine(axisXArray, expandedLeft, originY, expandedRight, originY);
    }

    var gridStyle = aamap_getGridStyle();

    aamap_grid = vectron_screen.set();

    if(regularArray.length > 0) {
        var reg = vectron_screen.path(regularArray.join(" "))
            .attr({stroke: gridStyle.narrowColor, "stroke-width": gridStyle.narrowStroke});
        reg.node.style.shapeRendering = "crispedges";
        aamap_grid.push(reg);
    }

    if(tenthArray.length > 0) {
        var tenth = vectron_screen.path(tenthArray.join(" "))
            .attr({stroke: gridStyle.tenthColor, "stroke-width": gridStyle.tenthStroke});
        tenth.node.style.shapeRendering = "crispedges";
        aamap_grid.push(tenth);
    }

    // Draw Y-axis (x=0) — vertical line
    if(axisYArray.length > 0) {
        var axY = vectron_screen.path(axisYArray.join(" "))
            .attr({stroke: gridStyle.axisYColor, "stroke-width": gridStyle.axisYStroke});
        axY.node.style.shapeRendering = "crispedges";
        aamap_grid.push(axY);
    }

    // Draw X-axis (y=0) — horizontal line
    if(axisXArray.length > 0) {
        var axX = vectron_screen.path(axisXArray.join(" "))
            .attr({stroke: gridStyle.axisXColor, "stroke-width": gridStyle.axisXStroke});
        axX.node.style.shapeRendering = "crispedges";
        aamap_grid.push(axX);
    }

}

/** Explicit Floor objects render their own translucent fill. Never infer an
 * upper surface from walls: level 0 is implicit, and every upper floor must be
 * deliberately placed by the mapper. */
function aamap_drawFloorInfills() {
    if(aamap_floorInfills != null) aamap_floorInfills.remove();
    aamap_floorInfills = vectron_screen.set();
}

function aamap_getGridStyle() {
    var defaultNarrowColor = '#1a1a1a';
    var defaultTenthColor = '#7f7f7f';

    return {
        narrowColor: config_gridNarrowColor || defaultNarrowColor,
        tenthColor: config_gridTenthColor || defaultTenthColor,
        axisXColor: config_gridAxisXColor || '#2244cc',
        axisYColor: config_gridAxisYColor || '#cc2222',
        narrowStroke: config_gridNarrowThickness > 0 ? config_gridNarrowThickness : 1,
        tenthStroke: config_gridTenthThickness > 0 ? config_gridTenthThickness : 1,
        axisXStroke: config_gridAxisXThickness > 0 ? config_gridAxisXThickness : 1,
        axisYStroke: config_gridAxisYThickness > 0 ? config_gridAxisYThickness : 1
    };
}


var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;',
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}
