/*
 * Batch property editor for Vectron's current selection.
 * Each supported object type gets an independent section so mixed selections
 * stay useful instead of collapsing to their lowest common denominator.
 */

var editSelected_lastSignature = "";
var editSelected_userClosed = false;

function editSelected_liveSelection() {
    if(typeof selectTool_selectedObjs === "undefined") return [];
    return selectTool_selectedObjs.filter(function(object, index, objects) {
        return object && aamap_objects.indexOf(object) >= 0 && objects.indexOf(object) === index;
    });
}

function editSelected_groups() {
    var groups = {walls:[], zones:[], spawns:[]};
    editSelected_liveSelection().forEach(function(object) {
        if(object instanceof Wall) groups.walls.push(object);
        else if(object instanceof Zone) groups.zones.push(object);
        else if(object instanceof Spawn) groups.spawns.push(object);
    });
    return groups;
}

function editSelected_commonValue(objects, read) {
    if(!objects.length) return null;
    var first = read(objects[0]);
    for(var index = 1; index < objects.length; index++) {
        var value = read(objects[index]);
        if(typeof first === "number" && typeof value === "number") {
            if(Math.abs(first - value) > 1e-9) return null;
        } else if(first !== value) {
            return null;
        }
    }
    return first;
}

function editSelected_numberText(value) {
    if(value === null || value === undefined || !isFinite(Number(value))) return "";
    var rounded = Math.round(Number(value) * 1e6) / 1e6;
    return String(rounded === 0 ? 0 : rounded);
}

function editSelected_angle(object) {
    var x = Number(object.xDir !== undefined ? object.xDir : object.zoneData.dirX);
    var y = Number(object.yDir !== undefined ? object.yDir : object.zoneData.dirY);
    if(!isFinite(x) || !isFinite(y) || Math.sqrt(x*x + y*y) <= 1e-9) return 0;
    return Math.atan2(y, x) * 180 / Math.PI;
}

function editSelected_teleportAngle(zone) {
    var x = Number(zone.zoneData.dirX);
    var y = Number(zone.zoneData.dirY);
    if(!isFinite(x) || !isFinite(y) || Math.sqrt(x*x + y*y) <= 1e-9) return null;
    return Math.atan2(y, x) * 180 / Math.PI;
}

function editSelected_input(id, value, placeholder) {
    var input = document.getElementById(id);
    if(!input) return;
    input.value = editSelected_numberText(value);
    input.placeholder = value === null ? (placeholder || "Mixed — enter to replace") : "";
    editSelected_setOriginal(input, input.value);
}

function editSelected_setOriginal(input, value) {
    if(input.dataset) input.dataset.originalValue = value;
    else input._editSelectedOriginalValue = value;
}

function editSelected_original(input) {
    return input.dataset ? input.dataset.originalValue : input._editSelectedOriginalValue;
}

function editSelected_textChanged(input) {
    return !!input && input.value.trim() !== "" &&
        input.value !== editSelected_original(input);
}

function editSelected_zoneKind(zone) {
    return (zoneTool_typeArray[zone.type] || zoneTool_typeArray[undefined])[0];
}

function editSelected_renderWalls(walls) {
    if(!walls.length) return "";
    return '<section class="edit-selected-group" data-edit-selected-group="walls">' +
        '<header><strong>Walls</strong><span>' + walls.length + '</span></header>' +
        '<label>Height<input id="edit-selected-wall-height" type="number" min="0" step="any"></label>' +
        '<button type="button" class="btn btn-sm btn-primary" data-edit-selected-apply="walls">Apply to walls</button>' +
        '</section>';
}

function editSelected_renderZones(zones) {
    if(!zones.length) return "";
    var allTeleports = zones.every(function(zone) {
        return editSelected_zoneKind(zone) === "teleport";
    });
    var options = '<option value="">Mixed / no change</option>';
    Object.keys(zoneTool_typeArray).filter(function(key) { return key !== "undefined"; })
        .sort(function(a, b) { return Number(a) - Number(b); })
        .forEach(function(key) {
            var kind = zoneTool_typeArray[key][0];
            options += '<option value="' + key + '">' +
                kind.charAt(0).toUpperCase() + kind.slice(1) + '</option>';
        });
    var teleportFields = allTeleports ?
        '<div class="edit-selected-subgroup"><strong>Teleport destination</strong>' +
        '<small>These are rendered map coordinates. You can also drag the destination marker directly.</small>' +
        '<label>Destination X<input id="edit-selected-zone-dest-x" type="number" step="any"></label>' +
        '<label>Destination Y<input id="edit-selected-zone-dest-y" type="number" step="any"></label>' +
        '<label>Exit angle °<input id="edit-selected-zone-exit-angle" type="number" step="any"></label>' +
        '</div>' : '';
    return '<section class="edit-selected-group" data-edit-selected-group="zones">' +
        '<header><strong>Zones</strong><span>' + zones.length + '</span></header>' +
        '<label>Radius<input id="edit-selected-zone-radius" type="number" min="0.000001" step="any"></label>' +
        '<label>Growth<input id="edit-selected-zone-growth" type="number" step="any"></label>' +
        '<label>Zone type<select id="edit-selected-zone-type">' + options + '</select></label>' +
        '<label class="edit-selected-checkbox">Player-private<input id="edit-selected-zone-private" type="checkbox"></label>' +
        teleportFields +
        '<button type="button" class="btn btn-sm btn-primary" data-edit-selected-apply="zones">Apply to zones</button>' +
        '</section>';
}

function editSelected_renderSpawns(spawns) {
    if(!spawns.length) return "";
    return '<section class="edit-selected-group" data-edit-selected-group="spawns">' +
        '<header><strong>Spawns</strong><span>' + spawns.length + '</span></header>' +
        '<label>Direction angle °<input id="edit-selected-spawn-angle" type="number" step="any"></label>' +
        '<small>0° points right, 90° points up.</small>' +
        '<button type="button" class="btn btn-sm btn-primary" data-edit-selected-apply="spawns">Apply to spawns</button>' +
        '</section>';
}

function editSelected_sync(forceOpen) {
    var win = document.getElementById("edit-selected-window");
    var container = document.getElementById("edit-selected-groups");
    var summary = document.getElementById("edit-selected-summary");
    if(!win || !container || !summary) return;
    var selection = editSelected_liveSelection();
    var signature = selection.map(function(object) { return object.objectID; }).sort().join(":");
    if(signature !== editSelected_lastSignature) {
        editSelected_lastSignature = signature;
        editSelected_userClosed = false;
    }
    if(!selection.length) {
        summary.textContent = "Nothing selected.";
        container.innerHTML = "";
        win.style.display = "none";
        return;
    }

    var groups = editSelected_groups();
    var parts = [];
    if(groups.walls.length) parts.push(groups.walls.length + " wall" + (groups.walls.length === 1 ? "" : "s"));
    if(groups.zones.length) parts.push(groups.zones.length + " zone" + (groups.zones.length === 1 ? "" : "s"));
    if(groups.spawns.length) parts.push(groups.spawns.length + " spawn" + (groups.spawns.length === 1 ? "" : "s"));
    summary.textContent = selection.length + " selected · " + parts.join(" · ");
    container.innerHTML = editSelected_renderWalls(groups.walls) +
        editSelected_renderZones(groups.zones) + editSelected_renderSpawns(groups.spawns);

    if(groups.walls.length) {
        editSelected_input("edit-selected-wall-height", editSelected_commonValue(
            groups.walls, function(wall) { return Number(wall.height); }
        ));
    }
    if(groups.zones.length) {
        editSelected_input("edit-selected-zone-radius", editSelected_commonValue(
            groups.zones, function(zone) { return Number(zone.radius); }
        ));
        editSelected_input("edit-selected-zone-growth", editSelected_commonValue(
            groups.zones, function(zone) { return Number(zone.growth); }
        ));
        var commonType = editSelected_commonValue(groups.zones, function(zone) {
            return Number(zone.type);
        });
        var typeInput = document.getElementById("edit-selected-zone-type");
        typeInput.value = commonType === null ? "" : String(commonType);
        editSelected_setOriginal(typeInput, typeInput.value);
        var privateInput = document.getElementById("edit-selected-zone-private");
        var commonPrivate = editSelected_commonValue(groups.zones, function(zone) {
            return !!zone.privatePerPlayer;
        });
        privateInput.indeterminate = commonPrivate === null;
        privateInput.checked = commonPrivate === true;
        editSelected_setOriginal(privateInput,
            commonPrivate === null ? "mixed" : String(commonPrivate));

        var allTeleports = groups.zones.every(function(zone) {
            return editSelected_zoneKind(zone) === "teleport";
        });
        if(allTeleports) {
            editSelected_input("edit-selected-zone-dest-x", editSelected_commonValue(
                groups.zones, function(zone) { return zone.teleportDestination().x; }
            ));
            editSelected_input("edit-selected-zone-dest-y", editSelected_commonValue(
                groups.zones, function(zone) { return zone.teleportDestination().y; }
            ));
            editSelected_input("edit-selected-zone-exit-angle", editSelected_commonValue(
                groups.zones, editSelected_teleportAngle
            ), "Mixed / incoming — enter to replace");
        }
    }
    if(groups.spawns.length) {
        editSelected_input("edit-selected-spawn-angle", editSelected_commonValue(
            groups.spawns, editSelected_angle
        ));
    }

    if(forceOpen) editSelected_userClosed = false;
    if(!editSelected_userClosed) win.style.display = "block";
    if(typeof gui_refreshFloatingWindows === "function") gui_refreshFloatingWindows();
}

function editSelected_copyValue(value) {
    if(value === undefined) return undefined;
    if(value === null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
}

function editSelected_snapshot(object) {
    if(object instanceof Wall) return {height:object.height};
    if(object instanceof Spawn) return {xDir:object.xDir, yDir:object.yDir};
    return {
        radius:object.radius,
        growth:object.growth,
        type:object.type,
        privatePerPlayer:!!object.privatePerPlayer,
        option:editSelected_copyValue(object.option),
        zoneData:editSelected_copyValue(object.zoneData)
    };
}

function editSelected_restore(object, state) {
    if(object instanceof Wall) {
        object.height = state.height;
    } else if(object instanceof Spawn) {
        object.xDir = state.xDir;
        object.yDir = state.yDir;
    } else if(object instanceof Zone) {
        object.radius = state.radius;
        object.growth = state.growth;
        object.type = state.type;
        object.privatePerPlayer = state.privatePerPlayer;
        object.option = editSelected_copyValue(state.option);
        if(state.zoneData === undefined) delete object.zoneData;
        else object.zoneData = editSelected_copyValue(state.zoneData);
    }
}

function editSelected_record(label, objects, mutate) {
    var before = objects.map(function(object) {
        return {object:object, state:editSelected_snapshot(object)};
    });
    objects.forEach(mutate);
    var after = objects.map(function(object) {
        return {object:object, state:editSelected_snapshot(object)};
    });
    if(JSON.stringify(before.map(function(item) { return item.state; })) ===
       JSON.stringify(after.map(function(item) { return item.state; }))) {
        return false;
    }
    function restore(entries) {
        entries.forEach(function(item) { editSelected_restore(item.object, item.state); });
        vectron_render();
        editSelected_sync();
        if(typeof zoneTool_syncSelectedProperties === "function") zoneTool_syncSelectedProperties();
    }
    aamap_recordAction({
        label:label,
        undo:function() { restore(before); },
        redo:function() { restore(after); }
    });
    vectron_render();
    editSelected_sync();
    if(typeof zoneTool_syncSelectedProperties === "function") zoneTool_syncSelectedProperties();
    return true;
}

function editSelected_toast(message) {
    if(typeof gui_toast === "function") gui_toast(message);
    else gui_writeLog(message);
}

function editSelected_changeZoneType(zone, type, checkpointId) {
    if(zone.type === type) return;
    zone.type = type;
    var kind = (zoneTool_typeArray[type] || zoneTool_typeArray[undefined])[0];
    if(kind === "rubber") {
        zone.option = 2;
        delete zone.zoneData;
    } else if(kind === "checkpoint") {
        zone.zoneData = {checkpointId:checkpointId || 1, legacyTime:"0"};
        zone.option = zone.zoneData.checkpointId;
    } else if(kind === "teleport") {
        zone.zoneData = {mode:"abs", destX:zone.x, destY:zone.y, dirX:0, dirY:0, reloc:0};
        zone.option = zone.zoneData;
    } else {
        zone.option = 0;
        delete zone.zoneData;
    }
}

function editSelected_applyWalls(walls) {
    var input = document.getElementById("edit-selected-wall-height");
    var height = Number(input && input.value);
    if(!editSelected_textChanged(input)) {
        editSelected_toast("Change the wall height before applying.");
        return;
    }
    if(!isFinite(height) || height < 0) {
        editSelected_toast("Enter a non-negative wall height.");
        return;
    }
    editSelected_record("Edit " + walls.length + " wall" + (walls.length === 1 ? "" : "s"), walls,
        function(wall) { wall.height = height; });
}

function editSelected_applyZones(zones) {
    var radiusInput = document.getElementById("edit-selected-zone-radius");
    var growthInput = document.getElementById("edit-selected-zone-growth");
    var typeInput = document.getElementById("edit-selected-zone-type");
    var privateInput = document.getElementById("edit-selected-zone-private");
    var radius = editSelected_textChanged(radiusInput) ? Number(radiusInput.value) : null;
    var growth = editSelected_textChanged(growthInput) ? Number(growthInput.value) : null;
    var type = editSelected_textChanged(typeInput) ? Number(typeInput.value) : null;
    var privateChanged = !!privateInput && !privateInput.indeterminate &&
        String(privateInput.checked) !== editSelected_original(privateInput);
    if(radius !== null && (!isFinite(radius) || radius <= 0)) {
        editSelected_toast("Zone radius must be greater than zero.");
        return;
    }
    if(growth !== null && !isFinite(growth)) {
        editSelected_toast("Zone growth must be a number.");
        return;
    }

    var destXInput = document.getElementById("edit-selected-zone-dest-x");
    var destYInput = document.getElementById("edit-selected-zone-dest-y");
    var exitAngleInput = document.getElementById("edit-selected-zone-exit-angle");
    var destX = editSelected_textChanged(destXInput) ? Number(destXInput.value) : null;
    var destY = editSelected_textChanged(destYInput) ? Number(destYInput.value) : null;
    var exitAngle = editSelected_textChanged(exitAngleInput) ? Number(exitAngleInput.value) : null;
    if([destX, destY, exitAngle].some(function(value) { return value !== null && !isFinite(value); })) {
        editSelected_toast("Teleport destination and direction must be numbers.");
        return;
    }
    if(radius === null && growth === null && type === null && !privateChanged &&
       destX === null && destY === null && exitAngle === null) {
        editSelected_toast("Change at least one zone property before applying.");
        return;
    }

    var nextCheckpointId = aamap_objects.reduce(function(highest, object) {
        if(!(object instanceof Zone) || editSelected_zoneKind(object) !== "checkpoint" ||
           !object.zoneData) return highest;
        return Math.max(highest, Number(object.zoneData.checkpointId) || 0);
    }, 0) + 1;
    var changed = editSelected_record(
        "Edit " + zones.length + " zone" + (zones.length === 1 ? "" : "s"),
        zones,
        function(zone) {
            if(type !== null && zone.type !== type) {
                var newKind = (zoneTool_typeArray[type] || zoneTool_typeArray[undefined])[0];
                editSelected_changeZoneType(zone, type,
                    newKind === "checkpoint" ? nextCheckpointId++ : undefined);
            }
            if(radius !== null) zone.radius = radius;
            if(growth !== null) zone.growth = growth;
            if(privateChanged) {
                zone.privatePerPlayer = privateInput.checked;
            }
            if(editSelected_zoneKind(zone) === "teleport" && (destX !== null || destY !== null)) {
                var current = zone.teleportDestination();
                zone.setTeleportDestination(destX === null ? current.x : destX,
                    destY === null ? current.y : destY);
            }
            if(editSelected_zoneKind(zone) === "teleport" && exitAngle !== null) {
                var radians = exitAngle * Math.PI / 180;
                zone.zoneData.dirX = Math.cos(radians);
                zone.zoneData.dirY = Math.sin(radians);
            }
        }
    );
    if(changed && zones.some(function(zone) {
        var kind = editSelected_zoneKind(zone);
        return kind === "checkpoint" || kind === "teleport";
    })) zoneTool_ensureSpecialDtd();
}

function editSelected_applySpawns(spawns) {
    var input = document.getElementById("edit-selected-spawn-angle");
    var angle = Number(input && input.value);
    if(!editSelected_textChanged(input)) {
        editSelected_toast("Change the spawn direction before applying.");
        return;
    }
    if(!isFinite(angle)) {
        editSelected_toast("Enter a spawn direction angle.");
        return;
    }
    var radians = angle * Math.PI / 180;
    editSelected_record("Edit " + spawns.length + " spawn" + (spawns.length === 1 ? "" : "s"),
        spawns, function(spawn) {
            spawn.xDir = Math.cos(radians);
            spawn.yDir = Math.sin(radians);
        });
}

function editSelected_open() {
    editSelected_userClosed = false;
    editSelected_sync(true);
}

function editSelected_init() {
    var close = document.getElementById("edit-selected-close");
    var groups = document.getElementById("edit-selected-groups");
    if(close) close.addEventListener("click", function(event) {
        event.preventDefault();
        editSelected_userClosed = true;
        document.getElementById("edit-selected-window").style.display = "none";
    });
    if(groups) groups.addEventListener("click", function(event) {
        var button = event.target.closest("[data-edit-selected-apply]");
        if(!button) return;
        event.preventDefault();
        var selected = editSelected_groups();
        if(button.dataset.editSelectedApply === "walls") editSelected_applyWalls(selected.walls);
        else if(button.dataset.editSelectedApply === "zones") editSelected_applyZones(selected.zones);
        else if(button.dataset.editSelectedApply === "spawns") editSelected_applySpawns(selected.spawns);
    });
}
