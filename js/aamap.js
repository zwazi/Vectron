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

var aamap_grid = null;

var aamap_symmetryGuides = null;
var aamap_symmetryCheckObjects = [];

function aamap_objectVisuals(aamapObject) {
    var visuals = [];
    ["obj", "glowObj", "guideObj"].forEach(function(name) {
        if(aamapObject && aamapObject[name] && visuals.indexOf(aamapObject[name]) < 0) {
            visuals.push(aamapObject[name]);
        }
    });
    return visuals;
}

function aamap_removeObjectVisuals(aamapObject) {
    aamap_objectVisuals(aamapObject).forEach(function(visual) {
        if(visual && typeof visual.remove === "function") visual.remove();
    });
    if(aamapObject) aamapObject.glowObj = null;
}

function aamap_symmetryState() {
    function value(selector) {
        var number = Number($(selector).val());
        return isFinite(number) ? number : 0;
    }
    return {
        x:$("#symmetry-x-toggle").is(":checked"),
        y:$("#symmetry-y-toggle").is(":checked"),
        origin:$("#symmetry-origin-toggle").is(":checked"),
        customX:$("#symmetry-custom-x-toggle").is(":checked"),
        customY:$("#symmetry-custom-y-toggle").is(":checked"),
        customPoint:$("#symmetry-custom-point-toggle").is(":checked"),
        customXValue:value("#symmetry-custom-x-value"),
        customYValue:value("#symmetry-custom-y-value"),
        customPointX:value("#symmetry-custom-point-x"),
        customPointY:value("#symmetry-custom-point-y")
    };
}

function aamap_symmetryEnabled() {
    return aamap_symmetryTransforms().length > 0;
}

function aamap_symmetryCheckEnabled() {
    return $("#symmetry-check-toggle").is(":checked") && aamap_symmetryEnabled();
}

/**
 * Symmetry is an editor aid rather than authored map data. A newly imported
 * map must therefore never inherit the previous map's placement/check modes.
 */
function aamap_disableSymmetry() {
    [
        "#symmetry-x-toggle",
        "#symmetry-y-toggle",
        "#symmetry-origin-toggle",
        "#symmetry-custom-x-toggle",
        "#symmetry-custom-y-toggle",
        "#symmetry-custom-point-toggle",
        "#symmetry-check-toggle"
    ].forEach(function(selector) {
        $(selector).prop("checked", false);
    });
    $("#symmetry-summary").text("Off");
    $("#symmetry-menu").hide();
    $("#symmetry-menu-toggle").attr("aria-expanded", "false");
}

function aamap_symmetryTransform(scaleX, scaleY, centerX, centerY, label, kind, derived) {
    centerX = Number(centerX) || 0;
    centerY = Number(centerY) || 0;
    return {
        x:scaleX,
        y:scaleY,
        tx:(1 - scaleX) * centerX,
        ty:(1 - scaleY) * centerY,
        centerX:centerX,
        centerY:centerY,
        line:label,
        kind:kind,
        derived:!!derived
    };
}

function aamap_symmetryTransforms() {
    var state = aamap_symmetryState();
    var transforms = [];
    function add(transform) {
        var key = [transform.x, transform.y, transform.tx, transform.ty].join(":");
        var existing = transforms.filter(function(candidate) { return candidate._key === key; })[0];
        if(existing) {
            if(existing.derived && !transform.derived) existing.derived = false;
        } else {
            transform._key = key;
            transforms.push(transform);
        }
    }
    if(state.x) add(aamap_symmetryTransform(-1, 1, 0, 0, "x=0", "x"));
    if(state.y) add(aamap_symmetryTransform(1, -1, 0, 0, "y=0", "y"));
    if(state.x && state.y) {
        add(aamap_symmetryTransform(-1, -1, 0, 0, "origin", "point", true));
    }
    if(state.origin) add(aamap_symmetryTransform(-1, -1, 0, 0, "origin", "point"));
    if(state.customX) {
        add(aamap_symmetryTransform(-1, 1, state.customXValue, 0,
            "x=" + state.customXValue, "x"));
    }
    if(state.customY) {
        add(aamap_symmetryTransform(1, -1, 0, state.customYValue,
            "y=" + state.customYValue, "y"));
    }
    if(state.customX && state.customY) {
        add(aamap_symmetryTransform(-1, -1, state.customXValue, state.customYValue,
            "point (" + state.customXValue + ", " + state.customYValue + ")",
            "point", true));
    }
    if(state.customPoint) {
        add(aamap_symmetryTransform(-1, -1, state.customPointX, state.customPointY,
            "point (" + state.customPointX + ", " + state.customPointY + ")", "point"));
    }
    transforms.forEach(function(transform) { delete transform._key; });
    return transforms;
}

function aamap_symmetryPoint(point, transform) {
    return {
        x:Number(point.x) * transform.x + (Number(transform.tx) || 0),
        y:Number(point.y) * transform.y + (Number(transform.ty) || 0)
    };
}

/**
 * Make an independent reflected editor object. Reflections include secondary
 * geometry such as spawn directions rather than only changing the object's
 * nominal centre.
 */
function aamap_symmetryClone(aamapObject, transform) {
    var copy = null;
    if(typeof Wall !== "undefined" && aamapObject instanceof Wall) {
        copy = new Wall();
        copy.points = aamapObject.points.map(function(point) {
            var reflected = aamap_symmetryPoint(point, transform);
            return new WallPoint(reflected.x, reflected.y);
        });
        copy.height = aamapObject.height;
    } else if(typeof Spawn !== "undefined" && aamapObject instanceof Spawn) {
        copy = new Spawn();
        var reflectedSpawn = aamap_symmetryPoint(aamapObject, transform);
        copy.x = reflectedSpawn.x;
        copy.y = reflectedSpawn.y;
        copy.xDir = Number(aamapObject.xDir) * transform.x;
        copy.yDir = Number(aamapObject.yDir) * transform.y;
        if(copy.guideObj) copy.guideObj.remove();
        copy.guideObj = null;
    } else if(typeof Zone !== "undefined" && aamapObject instanceof Zone) {
        var reflectedCenter = aamap_symmetryPoint(aamapObject, transform);
        copy = new Zone(reflectedCenter.x, reflectedCenter.y, aamapObject.radius,
            aamapObject.growth, aamapObject.type, aamapObject.option);
    }
    return copy;
}

function aamap_symmetryNumberKey(value) {
    var number = Math.round(Number(value) * 1e6) / 1e6;
    if(number === 0) number = 0;
    return String(number);
}

function aamap_symmetryPointKey(point) {
    return JSON.stringify([aamap_symmetryNumberKey(point.x),
        aamap_symmetryNumberKey(point.y)]);
}

/**
 * Canonicalize an undirected path or polygon without losing any coordinates.
 * Open paths may only reverse; closed polygons may also choose another start
 * vertex. This keeps truly equivalent reflections from stacking while an
 * asymmetric object that merely shares the symmetry centre remains distinct.
 */
function aamap_symmetryPointSequenceKey(points, cyclic) {
    var tokens = (points || []).map(function(point) {
        return aamap_symmetryPointKey(point);
    });
    if(cyclic && tokens.length > 1 && tokens[0] === tokens[tokens.length - 1]) {
        tokens.pop();
    }
    if(!tokens.length) return "[]";
    var candidates = [];
    var orientations = [tokens, tokens.slice().reverse()];
    orientations.forEach(function(sequence) {
        var rotations = cyclic ? sequence.length : 1;
        for(var index = 0; index < rotations; index++) {
            candidates.push(JSON.stringify(sequence.slice(index).concat(sequence.slice(0, index))));
        }
    });
    candidates.sort();
    return candidates[0];
}

function aamap_symmetryObjectKey(aamapObject) {
    if(!aamapObject || typeof aamapObject.getXML !== "function") return "";
    if(typeof Wall !== "undefined" && aamapObject instanceof Wall) {
        var wallXml = aamapObject.getXML();
        var wallHeaderEnd = wallXml.indexOf(">");
        var wallClosed = aamapObject.points.length > 2 &&
            aamap_symmetryPointKey(aamapObject.points[0]) ===
            aamap_symmetryPointKey(aamapObject.points[aamapObject.points.length - 1]);
        return wallXml.slice(0, wallHeaderEnd + 1) + "|points=" +
            aamap_symmetryPointSequenceKey(aamapObject.points, wallClosed);
    }
    return aamapObject.getXML();
}

function aamap_addSymmetryCopiesForExisting(aamapObject, sharedKeys) {
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
    var keys = sharedKeys || {};
    group.forEach(function(member) { keys[aamap_symmetryObjectKey(member)] = true; });
    aamap_symmetryTransforms().forEach(function(transform) {
        var copy = aamap_symmetryClone(primary, transform);
        if(!copy) return;
        var key = aamap_symmetryObjectKey(copy);
        if(keys[key]) {
            aamap_removeObjectVisuals(copy);
            return;
        }
        keys[key] = true;
        copy._symmetryTransform = {
            x:transform.x, y:transform.y,
            tx:Number(transform.tx) || 0, ty:Number(transform.ty) || 0
        };
        group.push(copy);
        aamap_add(copy);
    });
    group.forEach(function(member) {
        member._symmetryGroup = group;
        if(!member._symmetryTransform) member._symmetryTransform = {x:1, y:1, tx:0, ty:0};
    });
    return group;
}

function aamap_addSymmetryCopiesForExistingBatch(objects) {
    var primaries = (objects || []).filter(function(object, index, values) {
        return object && values.indexOf(object) === index;
    });
    var objectsBeforeCopies = aamap_objects.slice();
    var unassigned = primaries.slice();
    while(unassigned.length) {
        var primary = unassigned.shift();
        var primaryKey = aamap_symmetryObjectKey(primary);
        var group = [primary];
        primary._symmetryTransform = {x:1, y:1, tx:0, ty:0};
        aamap_symmetryTransforms().forEach(function(transform) {
            var copy = aamap_symmetryClone(primary, transform);
            if(!copy) return;
            var key = aamap_symmetryObjectKey(copy);
            if(key === primaryKey || group.some(function(member) {
                return aamap_symmetryObjectKey(member) === key;
            })) {
                aamap_removeObjectVisuals(copy);
                return;
            }
            var matchingIndex = unassigned.findIndex(function(candidate) {
                return aamap_symmetryObjectKey(candidate) === key;
            });
            var matchingPrimary = matchingIndex < 0 ? null :
                unassigned.splice(matchingIndex, 1)[0];
            var member = matchingPrimary || copy;
            if(matchingPrimary) {
                aamap_removeObjectVisuals(copy);
            } else {
                aamap_add(copy);
            }
            member._symmetryTransform = {
                x:transform.x, y:transform.y,
                tx:Number(transform.tx) || 0, ty:Number(transform.ty) || 0
            };
            group.push(member);
        });
        group.forEach(function(member) { member._symmetryGroup = group; });
    }
    return primaries.concat(aamap_objects.filter(function(object) {
        return objectsBeforeCopies.indexOf(object) < 0 && primaries.indexOf(object) < 0;
    }));
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

function aamap_restoreObjectsAtPositions(entries) {
    (entries || []).slice().sort(function(first, second) {
        return Number(first.index) - Number(second.index);
    }).forEach(function(saved) {
        if(!saved || !saved.object || aamap_objects.indexOf(saved.object) >= 0) return;
        saved.object.isSelected = false;
        var index = Math.max(0, Math.min(Number(saved.index) || 0, aamap_objects.length));
        aamap_objects.splice(index, 0, saved.object);
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

function aamap_restoreSymmetryMetadata(entries) {
    (entries || []).forEach(function(saved) {
        if(saved.group === undefined) delete saved.object._symmetryGroup;
        else saved.object._symmetryGroup = saved.group;
        if(saved.transform === undefined) delete saved.object._symmetryTransform;
        else saved.object._symmetryTransform = saved.transform;
    });
}

function aamap_restoreSymmetryMovePlanBefore(plan) {
    if(!plan) return;
    aamap_removeObjectGroup(plan.created || []);
    aamap_restoreObjectsAtPositions(plan.compacted || []);
    aamap_restoreSymmetryMetadata(plan.beforeMetadata);
}

function aamap_restoreSymmetryMovePlanAfter(plan) {
    if(!plan) return;
    aamap_removeObjectGroup((plan.compacted || []).map(function(saved) { return saved.object; }));
    aamap_restoreObjectGroup(plan.created || []);
    aamap_restoreSymmetryMetadata(plan.afterMetadata);
}

/**
 * A move can drive two members of a symmetry group onto identical geometry.
 * Drop the redundant copies once the move has been applied, remembering where
 * they sat so undo can put them back in their original slots.
 */
function aamap_compactSymmetryMovePlan(plan) {
    if(!plan || !(plan.beforeMetadata || []).length) return [];
    plan.compacted = [];
    var positions = [];
    aamap_objects.forEach(function(object, index) { positions.push({object:object, index:index}); });
    var groups = [];
    (plan.entries || []).forEach(function(entry) {
        var object = entry.object, group = object && object._symmetryGroup;
        if(!group || groups.indexOf(group) >= 0) return;
        groups.push(group);
    });
    groups.forEach(function(group) {
        var live = group.filter(function(member, index, members) {
            return member && aamap_objects.indexOf(member) >= 0 && members.indexOf(member) === index;
        });
        // Keep the objects the user actually asked to move, and prefer
        // pre-existing objects over copies this move just created.
        live.sort(function(first, second) {
            var firstRank = (plan.created.indexOf(first) >= 0 ? 2 : 0) +
                ((plan.requested || []).indexOf(first) >= 0 ? 0 : 1);
            var secondRank = (plan.created.indexOf(second) >= 0 ? 2 : 0) +
                ((plan.requested || []).indexOf(second) >= 0 ? 0 : 1);
            return firstRank - secondRank;
        });
        var seen = {}, removed = [];
        live.forEach(function(member) {
            var key = aamap_symmetryObjectKey(member);
            if(!Object.prototype.hasOwnProperty.call(seen, key)) { seen[key] = member; return; }
            removed.push(member);
        });
        removed.forEach(function(member) {
            var createdIndex = plan.created.indexOf(member);
            if(createdIndex >= 0) plan.created.splice(createdIndex, 1);
            else {
                var position = positions.filter(function(saved) { return saved.object === member; })[0];
                plan.compacted.push(position || {object:member, index:aamap_objects.indexOf(member)});
            }
            _aamap_removeObj(member);
        });
        var finalGroup = live.filter(function(member) {
            return removed.indexOf(member) < 0 && aamap_objects.indexOf(member) >= 0;
        });
        finalGroup.forEach(function(member) { member._symmetryGroup = finalGroup; });
    });
    var afterObjects = [];
    (plan.entries || []).concat((plan.created || []).map(function(object) { return {object:object}; }))
        .forEach(function(entry) {
            if(entry.object && aamap_objects.indexOf(entry.object) >= 0 &&
                afterObjects.indexOf(entry.object) < 0) afterObjects.push(entry.object);
        });
    plan.afterMetadata = afterObjects.map(function(object) {
        return {object:object, group:object._symmetryGroup, transform:object._symmetryTransform};
    });
    return plan.compacted;
}

function aamap_symmetryMovePlan(objects, dx, dy) {
    var plan = {entries:[], requested:[], created:[], compacted:[], beforeMetadata:[],
        afterMetadata:[]};
    if(!aamap_symmetryEnabled()) {
        (objects || []).forEach(function(object) {
            plan.entries.push({object:object, dx:dx, dy:dy});
        });
        return plan;
    }
    var requested = (objects || []).filter(function(object, index, values) {
        return object && aamap_objects.indexOf(object) >= 0 && values.indexOf(object) === index;
    });
    plan.requested = requested.slice();
    var candidates = [];
    requested.forEach(function(object) {
        var group = object._symmetryGroup || [object];
        group.forEach(function(member) {
            if(aamap_objects.indexOf(member) >= 0 && candidates.indexOf(member) < 0) {
                candidates.push(member);
            }
        });
    });
    plan.beforeMetadata = candidates.map(function(object) {
        return {object:object, group:object._symmetryGroup, transform:object._symmetryTransform};
    });
    var beforeBatch = aamap_objects.slice();
    if(candidates.length) aamap_addSymmetryCopiesForExistingBatch(candidates);
    aamap_objects.forEach(function(object) {
        if(beforeBatch.indexOf(object) < 0 && plan.created.indexOf(object) < 0) {
            plan.created.push(object);
        }
    });
    var handledMembers = [];
    requested.forEach(function(object) {
        if(handledMembers.indexOf(object) >= 0) return;
        var before = object._symmetryGroup ? object._symmetryGroup.slice() : [object];
        var group = aamap_addSymmetryCopiesForExisting(object);
        group.forEach(function(member) {
            if(before.indexOf(member) < 0 && plan.created.indexOf(member) < 0) {
                plan.created.push(member);
            }
        });
        var primary = group.filter(function(member) {
            var transform = member._symmetryTransform;
            return transform && transform.x === 1 && transform.y === 1 &&
                (Number(transform.tx) || 0) === 0 && (Number(transform.ty) || 0) === 0;
        })[0] || object;
        var driver = object._symmetryTransform || {x:1, y:1};
        // An object can currently sit on a symmetry locus, so its reflected
        // copy has identical geometry and is intentionally hidden. If this
        // move makes those transform slots diverge, materialize the missing
        // copy now. Undo moves it back onto the source before removing it.
        aamap_symmetryTransforms().forEach(function(transform) {
            var candidate = aamap_symmetryClone(primary, transform);
            if(!candidate) return;
            var key = aamap_symmetryObjectKey(candidate);
            var candidateDx = dx * transform.x / driver.x;
            var candidateDy = dy * transform.y / driver.y;
            var represented = group.some(function(member) {
                var memberTransform = member._symmetryTransform || {x:1, y:1};
                return aamap_symmetryObjectKey(member) === key &&
                    dx * memberTransform.x / driver.x === candidateDx &&
                    dy * memberTransform.y / driver.y === candidateDy;
            });
            if(represented) {
                aamap_removeObjectVisuals(candidate);
                return;
            }
            candidate._symmetryTransform = {
                x:transform.x, y:transform.y,
                tx:Number(transform.tx) || 0, ty:Number(transform.ty) || 0
            };
            candidate._symmetryGroup = group;
            group.push(candidate);
            aamap_add(candidate);
            plan.created.push(candidate);
        });
        group.forEach(function(member) { member._symmetryGroup = group; });
        group.forEach(function(member) {
            if(handledMembers.indexOf(member) < 0) handledMembers.push(member);
        });
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
    var afterObjects = [];
    plan.entries.forEach(function(entry) {
        if(afterObjects.indexOf(entry.object) < 0) afterObjects.push(entry.object);
    });
    plan.created.forEach(function(object) {
        if(afterObjects.indexOf(object) < 0) afterObjects.push(object);
    });
    plan.afterMetadata = afterObjects.map(function(object) {
        return {object:object, group:object._symmetryGroup, transform:object._symmetryTransform};
    });
    return plan;
}

function aamap_drawSymmetryGuides() {
    if(aamap_symmetryGuides) aamap_symmetryGuides.remove();
    aamap_symmetryGuides = null;
    var transforms = aamap_symmetryTransforms();
    if(!transforms.length) return;
    aamap_symmetryGuides = vectron_screen.set();
    var seen = {};
    transforms.forEach(function(transform) {
        var key = transform.kind + ":" + transform.centerX + ":" + transform.centerY;
        if(seen[key] || (transform.kind === "point" && transform.derived)) return;
        seen[key] = true;
        if(transform.kind === "x") {
            aamap_symmetryGuides.push(vectron_screen.path([
                "M", aamap_realX(transform.centerX), 0,
                "L", aamap_realX(transform.centerX), vectron_height
            ]).attr({stroke:"#ff4fd8", "stroke-width":2, "stroke-dasharray":"- ",
                "stroke-opacity":0.8}));
        } else if(transform.kind === "y") {
            aamap_symmetryGuides.push(vectron_screen.path([
                "M", 0, aamap_realY(transform.centerY),
                "L", vectron_width, aamap_realY(transform.centerY)
            ]).attr({stroke:"#45e5ff", "stroke-width":2, "stroke-dasharray":"- ",
                "stroke-opacity":0.8}));
        } else if(transform.kind === "point") {
            var pointX = aamap_realX(transform.centerX);
            var pointY = aamap_realY(transform.centerY);
            aamap_symmetryGuides.push(vectron_screen.path([
                "M", pointX - 8, pointY, "L", pointX + 8, pointY,
                "M", pointX, pointY - 8, "L", pointX, pointY + 8
            ]).attr({stroke:"#ffcc45", "stroke-width":2, "stroke-dasharray":"- ",
                "stroke-opacity":0.9}));
        }
    });
}

function aamap_symmetryCheckAxes() {
    var axes = {x:null, y:null};
    var transforms = aamap_symmetryTransforms();
    transforms.forEach(function(transform) {
        if(axes.x === null && transform.kind === "x") axes.x = transform.centerX;
        if(axes.y === null && transform.kind === "y") axes.y = transform.centerY;
    });
    // A point reflection needs only one source half-plane: the opposite half
    // is rotated 180 degrees. Clipping it to a quadrant would hide two valid
    // quadrants from the non-destructive symmetry check.
    if(axes.x === null && axes.y === null) {
        var point = transforms.filter(function(transform) {
            return transform.kind === "point";
        })[0];
        if(point) axes.x = point.centerX;
    }
    return axes;
}

/**
 * Return the screen-space clipping rectangle for one symmetry sector. Map Y
 * increases upward while SVG Y increases downward, so the +Y source sector is
 * above the horizontal guide. The check view always treats +X/+Y as its source
 * and never changes authored objects.
 */
function aamap_symmetryCheckClipRect(transform) {
    transform = transform || {x:1, y:1};
    var axes = aamap_symmetryCheckAxes();
    var axisX = axes.x === null ? 0 :
        Math.max(0, Math.min(vectron_width, aamap_realX(axes.x)));
    var axisY = axes.y === null ? 0 :
        Math.max(0, Math.min(vectron_height, aamap_realY(axes.y)));
    var x = transform.x < 0 ? 0 : axisX;
    var y = transform.y < 0 ? axisY : 0;
    var width = transform.x < 0 ? axisX : vectron_width - axisX;
    var height = transform.y < 0 ? vectron_height - axisY : axisY;
    if(axes.x === null) { x = 0; width = vectron_width; }
    if(axes.y === null) { y = 0; height = vectron_height; }
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
    aamap_objectVisuals(aamapObject).forEach(function(visual) {
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
            aamap_symmetryTransforms().forEach(function(transform) {
                var copy = aamap_symmetryClone(original, transform);
                if(!copy || typeof copy.render !== "function") return;
                copy.render();
                aamap_applySymmetryCheckClip(copy, transform, true);
                aamap_symmetryCheckObjects.push(copy);
            });
        });
    } finally {
        vectron_currentTool = savedTool;
    }
}

function aamap_init() {
    //nthing here
    aamap_render();
}

function aamap_buildXml(name, author, category, version, dtd, axes, settings) {
    var fileName = name + "-" + version + ".aamap.xml";

    function indentLines(str, prefix) {
        return str.split('\n').map(function(line) { return prefix + line; }).join('\n');
    }

    var xml = "";
    xml += '<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>'+"\n";
    xml += '<!DOCTYPE Resource SYSTEM "' + dtd + '">'+"\n";
    xml += '<Resource type="aamap" name="'+ name +'" version="'+ version +'" author="'+ author +'" category="'+ category +'">'+"\n";
    xml += '  <Map version="0.2.8">'+"\n";
    var mapSettings = [];
    for(var i = 0, ii = settings.length; i < ii; i++)
    {
        if(settings[i].trim() != "")
        {
            mapSettings.push(settings[i]);
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
            xml += "      <Setting name=\""+setting+"\" value=\""+value+"\" />\n";
        }
        xml += "    </Settings>\n";
    }
    xml += '    <World>\n';
    xml += '      <Field>\n';
    if($("#map_axes_forced")[0].checked)
    {
        xml += '        <Axes number="'+axes+'"/>'+"\n";
    }
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        xml += indentLines(aamap_objects[i].getXML(), '        ');
        xml += "\n";
    }
    xml += '      </Field>\n';
    xml += '    </World>\n';
    xml += '  </Map>\n';
    xml += '</Resource>\n';
    xml += "<!-- Exported from Vectron 1.1 -->\n";
    xml += "<!-- Use at: zwazi.github.io/Vectron -->\n";
    xml += "<!-- Source Code: github.com/zwazi/Vectron -->\n";
    xml += "\n";
    xml += "<!-- Alternate Version: https://vectron.armanelgtron.tk/ -->\n";
    xml += "<!-- Source Code: https://gitlab.com/Armanelgtron/Vectron/ -->";

    return {
        fileName: fileName,
        xml: xml
    };
}

function aamap_save(name, author, category, version, dtd, axes, settings) {
    var map = aamap_buildXml(name, author, category, version, dtd, axes, settings);
    vectron_saveTextAsFile(map.xml, map.fileName);
}

function aamap_render() {
    aamap_drawGrid();
    aamap_drawSymmetryGuides();

    if(vectron_currentTool == "select" && typeof selectTool_beginRenderCycle == "function") {
        selectTool_beginRenderCycle();
    }

    var symmetryChecking = aamap_symmetryCheckEnabled();
    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        aamap_objects[i].render();
        if(symmetryChecking) {
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
        wallVertexMoveTool_drawDots();
    }
}

function aamap_panCenter() {
    var ptsx = [];
    var ptsy = [];

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        var obj = aamap_objects[i];
        if(obj instanceof Zone || obj instanceof Spawn) {
            ptsx.push(obj.x);
            ptsy.push(obj.y);
        } else if(obj instanceof Wall) {
            for(var j = 0, jj = obj.points.length; j < jj; j++) {
                if(obj.points[i] != null) {
                    ptsx.push(obj.points[i].x);
                    ptsy.push(obj.points[i].y);
                }
            }
        }
    }

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
    var ptsx = [], ptsy = [];

    for(var i = 0, ii = aamap_objects.length; i < ii; i++) {
        var obj = aamap_objects[i];
        if(obj instanceof Zone || obj instanceof Spawn) {
            ptsx.push(obj.x);
            ptsy.push(obj.y);
        } else if(obj instanceof Wall) {
            for(var j = 0, jj = obj.points.length; j < jj; j++) {
                if(obj.points[j] != null) {
                    ptsx.push(obj.points[j].x);
                    ptsy.push(obj.points[j].y);
                }
            }
        }
    }

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
    if (aamapObject.obj) aamapObject.obj.remove();
    if (aamapObject.glowObj) { aamapObject.glowObj.remove(); aamapObject.glowObj = null; }
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
                addLine(axisXArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            }
            else if(category === "axisY") {
                hasOriginYAxis = true;
                addLine(axisYArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            }
            else if(category === "tenth") addLine(tenthArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            else addLine(regularArray, clipped.x1, clipped.y1, clipped.x2, clipped.y2);
        }
    });

    if(!hasOriginYAxis && originX >= expandedLeft && originX <= expandedRight) {
        addLine(axisYArray, originX, expandedTop, originX, expandedBottom);
    }
    if(!hasOriginXAxis && originY >= expandedTop && originY <= expandedBottom) {
        addLine(axisXArray, expandedLeft, originY, expandedRight, originY);
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

function aamap_getGridStyle() {
    var defaultNarrowColor = config_isDark ? '#1a1a1a' : '#d6d6ec';
    var defaultTenthColor  = config_isDark ? '#7f7f7f' : '#7f7f7f';

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
