/* Canonical Neotron map format (.neomap.json, UTF-8 JSON). */

var NEOMAP_FORMAT = "neotron-map";
var NEOMAP_FORMAT_VERSION = 1;
var NEOMAP_REVISION_PREFIX = "neomap-revision-v1:";
var NEOMAP_REVISION_DOMAIN = "NEOTRON-MAP-REVISION-V1\0";
var NEOMAP_MAX_BILLBOARDS = 256;
var NEOMAP_MAX_BILLBOARD_URL_CHARACTERS = 2048;

function armamap_parseTags(value) {
    var sourceIsArray = Array.isArray(value);
    var values;
    if(sourceIsArray) values = value;
    else if(value === undefined || value === null || String(value).trim() === "") values = [];
    else values = String(value).split(",");
    var seen = Object.create(null);
    var tags = [];
    if(sourceIsArray && values.length > 64) {
        throw new Error("metadata.tags cannot contain more than 64 tags");
    }
    values.forEach(function(value, index) {
        if(typeof value !== "string") {
            throw new Error("metadata.tags[" + index + "] must be a string");
        }
        var tag = value.trim();
        if(!tag.length) {
            if(sourceIsArray) {
                throw new Error("metadata.tags cannot contain empty tags");
            }
            return;
        }
        if(sourceIsArray && tag !== value) {
            throw new Error("metadata.tags must already be trimmed");
        }
        if(sourceIsArray && tag.indexOf(",") >= 0) {
            throw new Error("metadata.tags cannot contain commas");
        }
        if(Array.from(tag).length > 64) {
            throw new Error("metadata.tags cannot contain tags longer than 64 characters");
        }
        if(sourceIsArray && seen[tag]) {
            throw new Error("metadata.tags cannot contain duplicate tags");
        }
        if(!seen[tag]) {
            seen[tag] = true;
            tags.push(tag);
        }
    });
    return tags;
}

function armamap_utf8(value) {
    value = String(value);
    var bytes = [];
    for(var index = 0; index < value.length; index++) {
        var code = value.charCodeAt(index);
        if(code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
            var low = value.charCodeAt(index + 1);
            if(low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                index++;
            }
        }
        if(code <= 0x7f) bytes.push(code);
        else if(code <= 0x7ff) {
            bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
        } else if(code <= 0xffff) {
            bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f),
                0x80 | (code & 0x3f));
        } else {
            bytes.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f),
                0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return new Uint8Array(bytes);
}

function armamap_compareUnicodeScalars(left, right) {
    var leftIndex = 0, rightIndex = 0;
    while(leftIndex < left.length && rightIndex < right.length) {
        var leftCode = left.codePointAt(leftIndex);
        var rightCode = right.codePointAt(rightIndex);
        if(leftCode !== rightCode) return leftCode < rightCode ? -1 : 1;
        leftIndex += leftCode > 0xffff ? 2 : 1;
        rightIndex += rightCode > 0xffff ? 2 : 1;
    }
    return left.length - right.length;
}

function armamap_numberToken(value) {
    if(!isFinite(value) || (Math.floor(value) === value &&
        Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
        throw new Error("revision numbers must be finite IEEE-754 safe integers or decimals");
    }
    // JSON.stringify serializes negative zero as zero. Normalize before the
    // revision is computed so the persisted bytes verify on reload.
    if(value === 0) value = 0;
    var buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, false);
    var bytes = new Uint8Array(buffer);
    var token = "~";
    for(var index = 0; index < bytes.length; index++) {
        token += bytes[index].toString(16).padStart(2, "0");
    }
    return token;
}

function armamap_stableJson(value) {
    if(typeof value === "number") return armamap_numberToken(value);
    if(value === null || typeof value !== "object") return JSON.stringify(value);
    if(Array.isArray(value)) {
        return "[" + value.map(armamap_stableJson).join(",") + "]";
    }
    return "{" + Object.keys(value).sort(armamap_compareUnicodeScalars).filter(function(key) {
        return value[key] !== undefined;
    }).map(function(key) {
        return JSON.stringify(key) + ":" + armamap_stableJson(value[key]);
    }).join(",") + "}";
}

function armamap_revisionProjection(document) {
    var projection = {};
    Object.keys(document || {}).forEach(function(key) {
        projection[key] = document[key];
    });
    if(projection.metadata && typeof projection.metadata === "object" &&
        !Array.isArray(projection.metadata)) {
        var metadata = {};
        Object.keys(projection.metadata).forEach(function(key) {
            if(key !== "revision") metadata[key] = projection.metadata[key];
        });
        projection.metadata = metadata;
    }
    return projection;
}

function armamap_computeRevision(document) {
    var payload = NEOMAP_REVISION_DOMAIN +
        armamap_stableJson(armamap_revisionProjection(document));
    return NEOMAP_REVISION_PREFIX +
        xml_bytesToHex(xml_sha256Fallback(armamap_utf8(payload)));
}

function armamap_applyRevision(document) {
    if(!document || typeof document !== "object" || Array.isArray(document)) {
        throw new Error("map document must be an object");
    }
    if(document.metadata === undefined) document.metadata = {};
    else if(!document.metadata || typeof document.metadata !== "object" ||
        Array.isArray(document.metadata)) {
        throw new Error("metadata must be an object");
    }
    if(document.metadata.tags === undefined) {
        var legacyTags = document.metadata.category;
        if(legacyTags === undefined) legacyTags = document.metadata.catregory;
        if(legacyTags !== undefined && typeof legacyTags !== "string") {
            throw new Error("legacy metadata category must be a string");
        }
        document.metadata.tags = armamap_parseTags(legacyTags);
        delete document.metadata.category;
        delete document.metadata.catregory;
    } else if(!Array.isArray(document.metadata.tags)) {
        throw new Error("metadata.tags must be an array");
    }
    document.metadata.revision = armamap_computeRevision(document);
    return document.metadata.revision;
}

function armamap_verifyRevision(document) {
    var metadata = document && document.metadata;
    var revision = metadata && metadata.revision;
    if(revision === undefined || revision === null || revision === "") return true;
    revision = String(revision);
    if(revision.indexOf(NEOMAP_REVISION_PREFIX) !== 0) {
        // Numeric/free-form revisions belong to transitional pre-hash files.
        if(revision.indexOf("neomap-revision-") === 0) {
            throw new Error("unsupported .neomap.json revision algorithm");
        }
        return true;
    }
    if(!/^neomap-revision-v1:[0-9a-f]{64}$/.test(revision)) {
        throw new Error("malformed .neomap.json revision hash");
    }
    var expected = armamap_computeRevision(document);
    var difference = 0;
    for(var index = 0; index < expected.length; index++) {
        difference |= expected.charCodeAt(index) ^ revision.charCodeAt(index);
    }
    if(difference !== 0) {
        throw new Error(".neomap.json revision does not match its persisted content");
    }
    return true;
}

function armamap_round(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
}

function armamap_assertFiniteNumber(value, label, minimum, maximum) {
    if(typeof value !== "number" || !isFinite(value) ||
        Math.abs(value) > Number.MAX_SAFE_INTEGER ||
        (minimum !== undefined && value < minimum) ||
        (maximum !== undefined && value > maximum)) {
        throw new Error(label + " must be a finite number" +
            (minimum !== undefined ? " greater than or equal to " + minimum : "") +
            (maximum !== undefined ? " and no greater than " + maximum : ""));
    }
    return value;
}

function armamap_assertInteger(value, label, minimum, maximum) {
    armamap_assertFiniteNumber(value, label, minimum, maximum);
    if(Math.floor(value) !== value) throw new Error(label + " must be an integer");
    return value;
}

function armamap_assertString(value, label, allowEmpty) {
    if(typeof value !== "string" || (!allowEmpty && !value.length)) {
        throw new Error(label + " must be " + (allowEmpty ? "a string" : "a nonempty string"));
    }
    return value;
}

function armamap_scalarText(value, label) {
    if(typeof value === "string" || typeof value === "boolean") return String(value);
    if(typeof value === "number") {
        armamap_assertFiniteNumber(value, label);
        return String(value);
    }
    throw new Error(label + " must be a string, finite number, or boolean");
}

function armamap_assertPoint(point, label, allowHeight) {
    if(!Array.isArray(point) ||
        (allowHeight ? point.length < 2 || point.length > 3 : point.length !== 2)) {
        throw new Error(label + " must contain exactly " +
            (allowHeight ? "two coordinates and an optional height" : "two coordinates"));
    }
    armamap_assertFiniteNumber(point[0], label + "[0]");
    armamap_assertFiniteNumber(point[1], label + "[1]");
    if(point.length === 3) armamap_assertFiniteNumber(point[2], label + "[2]", 0);
    return point;
}

function armamap_assertPointList(points, label, minimum, allowHeight) {
    if(!Array.isArray(points) || points.length < minimum) {
        throw new Error(label + " must contain at least " + minimum + " points");
    }
    points.forEach(function(point, index) {
        armamap_assertPoint(point, label + "[" + index + "]", allowHeight);
    });
    return points;
}

function armamap_point(point, height) {
    var result = [armamap_round(point.x), armamap_round(point.y)];
    if(height !== undefined && height !== null && isFinite(Number(height))) {
        result.push(armamap_round(height));
    }
    return result;
}

function armamap_settings(lines) {
    var settings = {};
    (lines || []).forEach(function(line) {
        line = String(line || "").trim();
        if(!line) return;
        var separator = line.search(/\s/);
        var name = (separator < 0 ? line : line.slice(0, separator)).toUpperCase();
        if(name === "LANDSCAPE") return;
        settings[name] = separator < 0 ? "" : line.slice(separator).trim();
    });
    return settings;
}

function armamap_validation(validation) {
    if(!validation || typeof validation !== "object") return null;
    var result = {};
    var integerMinimums = {
        version:1, ticks:0, fraction:0, tick_rate:1, fraction_scale:1
    };
    var valid = Object.keys(integerMinimums).every(function(name) {
        var value = Number(validation[name]);
        if(!isFinite(value) || Math.floor(value) !== value ||
            value < integerMinimums[name]) return false;
        result[name] = value;
        return true;
    });
    if(!valid) return null;
    ["proof_algorithm","replay_proof"].forEach(function(name) {
        result[name] = validation[name] === undefined ? "" : String(validation[name]);
    });
    if(!result.proof_algorithm.length || !result.replay_proof.length) return null;
    return result;
}

function armamap_nonzeroVector(vector, label) {
    if(!Array.isArray(vector) || vector.length !== 2 ||
        typeof vector[0] !== "number" || typeof vector[1] !== "number" ||
        !isFinite(vector[0]) || !isFinite(vector[1]) ||
        Math.abs(vector[0]) > Number.MAX_SAFE_INTEGER ||
        Math.abs(vector[1]) > Number.MAX_SAFE_INTEGER ||
        (Math.round(vector[0] * 1000) === 0 && Math.round(vector[1] * 1000) === 0)) {
        throw new Error(label + " must be a finite nonzero direction vector");
    }
    return [vector[0], vector[1]];
}

function armamap_cardinalDirection(direction, label) {
    var normalized = String(direction).toLowerCase();
    normalized = {n:"north",e:"east",s:"south",w:"west"}[normalized] || normalized;
    if(["north","east","south","west"].indexOf(normalized) < 0) {
        throw new Error(label + " must be north, east, south, west, or a nonzero vector");
    }
    return normalized;
}

function armamap_assertFields(object, label, allowed) {
    if(!object || typeof object !== "object" || Array.isArray(object)) {
        throw new Error(label + " must be an object");
    }
    Object.keys(object).forEach(function(field) {
        if(allowed.indexOf(field) < 0) {
            throw new Error(label + "." + field + " is not a recognized canonical field");
        }
    });
}

function armamap_assertZoneFields(zone) {
    var common = {
        type:true,level:true,shape:true,show_icon:true,trigger:true,start_tick:true,
        end_tick:true,movement:true
    };
    var effectFields = {
        death:{}, win:{}, checkpoint:{order:true}, health:{delta:true},
        speed:{delta_mps:true,duration_ticks:true},
        rubber:{delta:true,duration_ticks:true}, setting:{setting:true,value:true},
        teleport:{destination:true,destination_level:true,direction:true}
    };
    var allowed = effectFields[zone.type] || {};
    Object.keys(zone).forEach(function(name) {
        if(!common[name] && !allowed[name]) {
            throw new Error("canonical " + zone.type + " zone does not support field " + name);
        }
    });
}

function armamap_shape(zone) {
    if(zone.shapeType === "line") {
        return {type:"line", start:armamap_point(zone.lineStart),
            end:armamap_point(zone.lineEnd), width:armamap_round(zone.lineWidth)};
    }
    if(zone.shapeType === "rectangle") {
        return {type:"rectangle", min:[armamap_round(zone.minx), armamap_round(zone.miny)],
            max:[armamap_round(zone.maxx), armamap_round(zone.maxy)]};
    }
    if(zone.shapeType === "polygon") {
        return {type:"polygon", points:zone.getMapPoints().map(function(point) {
            return armamap_point(point);
        })};
    }
    return {type:"circle", center:[armamap_round(zone.x), armamap_round(zone.y)],
        radius:armamap_round(zone.radius)};
}

function armamap_zone(zone) {
    var result = {type:zone.zoneName, level:aamap_normalizeLevel(zone.level, 0),
        shape:armamap_shape(zone), show_icon:zone.showIcon !== false};
    if(zone.trigger) result.trigger = zone.trigger;
    if(zone.activeStartTick !== null && zone.activeEndTick !== null &&
        isFinite(Number(zone.activeStartTick)) && isFinite(Number(zone.activeEndTick))) {
        result.start_tick = Number(zone.activeStartTick);
        result.end_tick = Number(zone.activeEndTick);
    }
    if(zone.zoneName === "checkpoint") {
        var checkpointOrder = Number(zone.option);
        if(typeof zoneTool_validCheckpointOrder === "function" &&
            !zoneTool_validCheckpointOrder(checkpointOrder)) {
            throw new Error("checkpoint order must fit the game's unsigned 32-bit range");
        }
        result.order = checkpointOrder || 0;
    }
    else if(zone.zoneName === "speed") {
        result.delta_mps = Number(zone.options.delta_mps);
        result.duration_ticks = Number(zone.options.duration_ticks);
    } else if(zone.zoneName === "rubber") {
        result.delta = Number(zone.options.delta);
        result.duration_ticks = Number(zone.options.duration_ticks);
    } else if(zone.zoneName === "health") {
        result.delta = Number(zone.options.delta);
    } else if(zone.zoneName === "setting") {
        result.setting = String(zone.options.setting || "").toUpperCase();
        result.value = Number(zone.options.value);
    } else if(zone.zoneName === "teleport") {
        result.destination = [Number(zone.options.destination_x), Number(zone.options.destination_y)];
        result.destination_level = aamap_normalizeLevel(
            zone.options.destination_level, result.level);
        if(zone.options.direction !== undefined) {
            result.direction = armamap_cardinalDirection(
                zone.options.direction, "Teleport direction");
        } else if(zone.options.angle !== undefined) {
            var angle = Number(zone.options.angle);
            if(!isFinite(angle)) throw new Error("Teleport angle must be finite");
            var radians = angle * Math.PI / 180;
            result.direction = armamap_nonzeroVector(
                [armamap_round(Math.cos(radians)),armamap_round(Math.sin(radians))],
                "Teleport direction");
        } else if(zone.options.xdir !== undefined || zone.options.ydir !== undefined) {
            result.direction = armamap_nonzeroVector(
                [Number(zone.options.xdir),Number(zone.options.ydir)], "Teleport direction");
        } else {
            result.direction = "east";
        }
    }
    if(zone.movementPath && zone.movementPath.length) {
        result.movement = {
            speed:armamap_round(zone.movementSpeed),
            rotation:armamap_round(zone.rotationSpeed),
            mode:zone.movementMode || "circular",
            instances:(zone.movementInstances || []).map(Number),
            path:zone.movementPath.map(function(point) { return armamap_point(point); })
        };
        if(zone.movementPulseRadii && zone.movementPulseRadii.length) {
            result.movement.pulse_radii = zone.movementPulseRadii.map(function(radius) {
                return radius === null || radius === undefined ? null : armamap_round(radius);
            });
        }
    }
    return result;
}

function armamap_build(name, author, tags, revision, axes, settings, authorPasswordHash, objects) {
    var parsedTags = armamap_parseTags(tags);
    var document = {
        format:NEOMAP_FORMAT,
        format_version:NEOMAP_FORMAT_VERSION,
        metadata:{name:name, author:author, tags:parsedTags.length ? parsedTags : ["racing"]},
        axes:$("#map_axes_forced").is(":checked") ?
            (Array.isArray(xml_axis_vectors) ? xml_axis_vectors.map(function(vector, index) {
                return armamap_nonzeroVector(
                    [armamap_round(vector[0]), armamap_round(vector[1])],
                    "Axis " + index);
            }) : Number(axes)) : 8,
        levels:{count:aamap_levelCount(), gaps:[]},
        settings:armamap_settings(settings),
        spawns:[], walls:[], floors:[], ramps:[], zones:[], billboards:[]
    };
    if(xml_isValidAuthorPasswordHash(authorPasswordHash)) {
        document.metadata.author_password_hash = authorPasswordHash;
    }
    var validation = armamap_validation(xml_map_validation);
    if(validation) document.validation = validation;
    for(var gap = 0; gap < aamap_levelCount() - 1; gap++) {
        var height = Number(xml_level_heights[gap]);
        document.levels.gaps.push(armamap_round(isFinite(height) && height > 0 ? height : 8));
    }
    (objects === undefined ? aamap_objects : objects).forEach(function(object) {
        if(object instanceof Spawn) {
            document.spawns.push({level:aamap_normalizeLevel(object.level, 0),
                position:[armamap_round(object.x), armamap_round(object.y)],
                direction:[armamap_round(object.xDir), armamap_round(object.yDir)]});
        } else if(object instanceof Wall) {
            var wall = {level:aamap_normalizeLevel(object.level, 0),
                points:object.points.map(function(point) {
                    return armamap_point(point, object.slopedHeight ? point.height : undefined);
                })};
            if(object.heightAuthored === true ||
                (object.heightAuthored === null && !object.slopedHeight)) {
                wall.height = armamap_round(object.height);
            }
            document.walls.push(wall);
        } else if(typeof Floor !== "undefined" && object instanceof Floor) {
            if(object.level > 0) document.floors.push({level:object.level,
                points:object.points.map(function(point) { return armamap_point(point); })});
        } else if(typeof Ramp !== "undefined" && object instanceof Ramp) {
            var nativeRamp = {from_level:object.fromLevel, to_level:object.toLevel};
            if(object.sourceTwoPoint) {
                nativeRamp.width = armamap_round(object.sourceTwoPoint.width);
                nativeRamp.points = [object.sourceTwoPoint.start,object.sourceTwoPoint.end]
                    .map(function(point) { return armamap_point(point); });
            } else {
                nativeRamp.points = object.points.map(function(point) {
                    return armamap_point(point);
                });
            }
            document.ramps.push(nativeRamp);
        } else if(object instanceof Zone) {
            document.zones.push(armamap_zone(object));
        } else if(typeof Billboard !== "undefined" && object instanceof Billboard) {
            document.billboards.push({
                level:aamap_normalizeLevel(object.level, 0),
                start:armamap_point(object.start),
                end:armamap_point(object.end),
                height:armamap_round(object.height),
                url:String(object.url),
                facing:billboard_normalizeFacing(object.facing),
                dual_sided:!!object.dualSided
            });
        }
    });
    armamap_applyRevision(document);
    var validationErrors = aamap_validateForExport(axes);
    if(document.billboards.length > NEOMAP_MAX_BILLBOARDS) {
        var billboardLimitError = "Maps may contain at most " +
            NEOMAP_MAX_BILLBOARDS + " billboards.";
        if(validationErrors.indexOf(billboardLimitError) < 0) {
            validationErrors.push(billboardLimitError);
        }
    }
    return {
        fileName:String(name || "map").replace(/[^a-z0-9._-]+/gi, "-") + ".neomap.json",
        text:JSON.stringify(document, null, 2) + "\n",
        document:document,
        validationErrors:validationErrors,
        validationWarnings:aamap_warningsForExport()
    };
}

function armamap_escape(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");
}

function armamap_xmlPoint(point, label, allowHeight) {
    armamap_assertPoint(point, label || "point", !!allowHeight);
    var height = point.length > 2 ? ' height="' + armamap_escape(point[2]) + '"' : "";
    return '<Point x="' + armamap_escape(point[0]) + '" y="' +
        armamap_escape(point[1]) + '"' + height + '/>';
}

function armamap_shapeXml(shape, label) {
    label = label || "zone shape";
    if(!shape || typeof shape !== "object") throw new Error(label + " must be an object");
    var fields = {
        line:["type","start","end","width"],
        rectangle:["type","min","max"],
        polygon:["type","points"],
        circle:["type","center","radius"]
    }[shape.type];
    if(!fields) throw new Error("unsupported zone shape " + shape.type);
    armamap_assertFields(shape, label, fields);
    if(shape.type === "line") {
        armamap_assertPoint(shape.start, label + ".start", false);
        armamap_assertPoint(shape.end, label + ".end", false);
        armamap_assertFiniteNumber(shape.width, label + ".width", 0);
        if(shape.start[0] === shape.end[0] && shape.start[1] === shape.end[1]) {
            throw new Error(label + " line endpoints must be distinct");
        }
        return '<ShapeLine width="' + armamap_escape(shape.width) + '">' +
            armamap_xmlPoint(shape.start, label + ".start") +
            armamap_xmlPoint(shape.end, label + ".end") + '</ShapeLine>';
    }
    if(shape.type === "rectangle") {
        armamap_assertPoint(shape.min, label + ".min", false);
        armamap_assertPoint(shape.max, label + ".max", false);
        if(shape.min[0] === shape.max[0] || shape.min[1] === shape.max[1]) {
            throw new Error(label + " rectangle dimensions must be nonzero");
        }
        return '<ShapeRectangle minx="' + armamap_escape(shape.min[0]) +
        '" miny="' + armamap_escape(shape.min[1]) + '" maxx="' + armamap_escape(shape.max[0]) +
        '" maxy="' + armamap_escape(shape.max[1]) + '"/>';
    }
    if(shape.type === "polygon") {
        armamap_assertPointList(shape.points, label + ".points", 3, false);
        return '<ShapePolygon scale="1"><Point x="0" y="0"/>' +
            shape.points.map(function(point, index) {
                return armamap_xmlPoint(point, label + ".points[" + index + "]");
            }).join("") + '</ShapePolygon>';
    }
    if(shape.type === "circle") {
        armamap_assertPoint(shape.center, label + ".center", false);
        armamap_assertFiniteNumber(shape.radius, label + ".radius", Number.MIN_VALUE);
        return '<ShapeCircle radius="' + armamap_escape(shape.radius) + '">' +
            armamap_xmlPoint(shape.center, label + ".center") + '</ShapeCircle>';
    }
    throw new Error("unsupported zone shape " + shape.type);
}

function armamap_toCompatibilityXml(document) {
    if(!document || document.format !== NEOMAP_FORMAT ||
        document.format_version !== NEOMAP_FORMAT_VERSION) {
        throw new Error("not a supported Neotron map");
    }
    armamap_assertFields(document, "map document", ["format","format_version","metadata",
        "axes","levels","settings","spawns","walls","floors","ramps","zones",
        "billboards","validation"]);
    armamap_verifyRevision(document);
    var metadata = document.metadata === undefined ? {} : document.metadata;
    armamap_assertFields(metadata, "metadata", ["name","author","tags","category",
        "catregory","revision","author_password_hash"]);
    ["name","author"].forEach(function(name) {
        if(metadata[name] !== undefined) {
            armamap_assertString(metadata[name], "metadata." + name, true);
        }
    });
    if(metadata.revision !== undefined) {
        armamap_assertString(metadata.revision, "metadata.revision", true);
    }
    if(metadata.tags !== undefined && !Array.isArray(metadata.tags)) {
        throw new Error("metadata.tags must be an array");
    }
    ["category","catregory"].forEach(function(name) {
        if(metadata[name] !== undefined) {
            armamap_assertString(metadata[name], "metadata." + name, true);
        }
    });
    if(metadata.tags !== undefined &&
        (metadata.category !== undefined || metadata.catregory !== undefined)) {
        throw new Error("metadata.tags cannot be combined with legacy category/catregory");
    }
    var tagsSource = metadata.tags;
    if(tagsSource === undefined) tagsSource = metadata.category;
    if(tagsSource === undefined) tagsSource = metadata.catregory;
    var tags = armamap_parseTags(tagsSource);
    if(metadata.author_password_hash !== undefined) {
        armamap_assertString(metadata.author_password_hash,
            "metadata.author_password_hash", false);
        if(!xml_isValidAuthorPasswordHash(metadata.author_password_hash)) {
            throw new Error("metadata.author_password_hash is invalid or unsupported");
        }
    }
    var password = metadata.author_password_hash !== undefined ?
        ' author_password_hash="' + armamap_escape(metadata.author_password_hash) + '"' : "";
    var xml = '<Resource name="' + armamap_escape(
        metadata.name === undefined ? "Unnamed map" : metadata.name) +
        '" author="' + armamap_escape(metadata.author === undefined ? "" : metadata.author) + '" category="' +
        armamap_escape(tags.join(", ")) + '" version="' +
        armamap_escape(metadata.revision || "1") + '"><Map checkpoint_order_base="1"' + password + '>';
    var settings = document.settings === undefined ? {} : document.settings;
    if(!settings || typeof settings !== "object" || Array.isArray(settings)) {
        throw new Error("settings must be an object");
    }
    // A missing levels object is the canonical single-floor shorthand. If the
    // object is present, its required count remains strictly validated.
    var levels = document.levels === undefined ? {count:1} : document.levels;
    armamap_assertFields(levels, "levels", ["count","gaps"]);
    var count = armamap_assertInteger(levels.count, "levels.count", 1, 255);
    var gaps = levels.gaps === undefined ? [] : levels.gaps;
    if(!Array.isArray(gaps) || gaps.length > 254) {
        throw new Error("levels.gaps must contain at most 254 positive heights");
    }
    gaps.forEach(function(gap, index) {
        armamap_assertFiniteNumber(gap,
            "levels.gaps[" + index + "]", Number.MIN_VALUE);
    });
    ["spawns","walls","floors","ramps","zones","billboards"].forEach(function(name) {
        if(document[name] !== undefined && !Array.isArray(document[name])) {
            throw new Error(name + " must be an array");
        }
    });
    if((document.billboards || []).length > NEOMAP_MAX_BILLBOARDS) {
        throw new Error("billboards cannot contain more than " +
            NEOMAP_MAX_BILLBOARDS + " entries");
    }
    var settingNames = Object.keys(settings);
    if(settingNames.length) xml += '<Settings>' + settingNames.map(function(name) {
        return '<Setting name="' + armamap_escape(name) + '" value="' +
            armamap_escape(armamap_scalarText(settings[name], "settings." + name)) + '"/>';
    }).join("") + '</Settings>';
    xml += '<World><Field' + (gaps.length ? ' level_heights="' + armamap_escape(gaps.join(",")) + '"' : "") + '>';
    if(Array.isArray(document.axes)) {
        if(document.axes.length < 1 || document.axes.length > 65535) {
            throw new Error("axes must contain from 1 through 65535 direction vectors");
        }
        xml += '<Axes number="' + document.axes.length + '" normalize="false">' +
            document.axes.map(function(axis, index) {
                axis = armamap_nonzeroVector(axis, "Canonical axis " + index);
                return '<Axis xdir="' + armamap_escape(axis[0]) +
                    '" ydir="' + armamap_escape(axis[1]) + '"/>';
            }).join("") + '</Axes>';
    } else if(document.axes !== undefined) {
        var axisCount = armamap_assertInteger(document.axes, "axes", 1, 65535);
        xml += '<Axes number="' + armamap_escape(axisCount) + '"/>';
    }
    for(var level = 0; level < count; level++) xml += '<Level index="' + level + '"/>';
    (document.spawns || []).forEach(function(spawn, index) {
        armamap_assertFields(spawn, "spawns[" + index + "]", ["level","position","direction"]);
        armamap_assertPoint(spawn.position, "spawns[" + index + "].position", false);
        var direction;
        try {
            direction = armamap_nonzeroVector(
                spawn.direction, "spawns[" + index + "].direction");
        } catch(error) {
            throw new Error("canonical spawn " + index + " needs a nonzero direction vector");
        }
        var spawnLevel = spawn.level === undefined ? 0 :
            armamap_assertInteger(spawn.level, "spawns[" + index + "].level", 0, 254);
        xml += '<Spawn level="' + spawnLevel + '" x="' + armamap_escape(spawn.position[0]) +
            '" y="' + armamap_escape(spawn.position[1]) + '" xdir="' + armamap_escape(direction[0]) +
            '" ydir="' + armamap_escape(direction[1]) + '"/>';
    });
    (document.walls || []).forEach(function(wall, index) {
        armamap_assertFields(wall, "walls[" + index + "]", ["level","height","points"]);
        armamap_assertPointList(wall.points, "walls[" + index + "].points", 2, true);
        if(wall.height !== undefined) {
            armamap_assertFiniteNumber(wall.height, "walls[" + index + "].height", 0);
        }
        var wallLevel = wall.level === undefined ? 0 :
            armamap_assertInteger(wall.level, "walls[" + index + "].level", 0, 254);
        xml += '<Wall level="' + wallLevel + '"' +
            (wall.height === undefined || wall.height === null ? "" : ' height="' + armamap_escape(wall.height) + '"') + '>' +
            wall.points.map(function(point, pointIndex) {
                return armamap_xmlPoint(point,
                    "walls[" + index + "].points[" + pointIndex + "]", true);
            }).join("") + '</Wall>';
    });
    (document.floors || []).forEach(function(floor, index) {
        armamap_assertFields(floor, "floors[" + index + "]", ["level","points"]);
        var floorLevel = armamap_assertInteger(
            floor.level, "floors[" + index + "].level", 1, 254);
        armamap_assertPointList(floor.points, "floors[" + index + "].points", 3, false);
        if(typeof floorTool_isSimplePolygon === "function" &&
            !floorTool_isSimplePolygon(floor.points.map(function(point) {
                return {x:point[0], y:point[1]};
            }))) {
            throw new Error("floors[" + index + "].points must form a simple polygon");
        }
        xml += '<Floor level="' + floorLevel + '">' + floor.points.map(function(point, pointIndex) {
            return armamap_xmlPoint(point,
                "floors[" + index + "].points[" + pointIndex + "]");
        }).join("") + '</Floor>';
    });
    (document.ramps || []).forEach(function(ramp, index) {
        armamap_assertFields(ramp, "ramps[" + index + "]",
            ["from_level","to_level","width","points"]);
        if(!Array.isArray(ramp.points) || [2,4].indexOf(ramp.points.length) < 0) {
            throw new Error("canonical ramp points must contain exactly 2 or 4 points");
        }
        ramp.points.forEach(function(point, pointIndex) {
            armamap_assertPoint(point,
                "ramps[" + index + "].points[" + pointIndex + "]", false);
        });
        var fromLevel = armamap_assertInteger(
            ramp.from_level, "ramps[" + index + "].from_level", 0, 254);
        var toLevel = armamap_assertInteger(
            ramp.to_level, "ramps[" + index + "].to_level", 0, 254);
        if(fromLevel === toLevel) throw new Error("canonical ramp levels must be distinct");
        if(ramp.points.length === 2) {
            try {
                armamap_assertFiniteNumber(
                    ramp.width, "ramps[" + index + "].width", Number.MIN_VALUE);
            } catch(error) {
                throw new Error("a 2-point canonical ramp needs a positive width");
            }
            if(ramp.points[0][0] === ramp.points[1][0] &&
                ramp.points[0][1] === ramp.points[1][1]) {
                throw new Error("canonical ramp endpoints must be distinct");
            }
        }
        if(ramp.points.length === 4 && ramp.width !== undefined) {
            throw new Error("ramps[" + index + "].width is valid only for a 2-point ramp");
        }
        if(ramp.points.length === 4 && typeof ramp_geometryValid === "function" &&
            !ramp_geometryValid(ramp.points.map(function(point) {
                return {x:point[0], y:point[1]};
            }))) {
            throw new Error("ramps[" + index + "].points contain degenerate or crossed geometry");
        }
        var rampWidth = ramp.width === undefined || ramp.width === null ? "" :
            ' width="' + armamap_escape(ramp.width) + '"';
        xml += '<Ramp from_level="' + fromLevel + '" to_level="' + toLevel + '"' +
            rampWidth + '>' +
            ramp.points.map(function(point, pointIndex) {
                return armamap_xmlPoint(point,
                    "ramps[" + index + "].points[" + pointIndex + "]");
            }).join("") + '</Ramp>';
    });
    (document.billboards || []).forEach(function(billboard, index) {
        armamap_assertFields(billboard, "billboards[" + index + "]",
            ["level","start","end","height","url","facing","dual_sided"]);
        var billboardLevel = billboard.level === undefined ? 0 :
            armamap_assertInteger(billboard.level,
                "billboards[" + index + "].level", 0, 254);
        armamap_assertPoint(billboard.start,
            "billboards[" + index + "].start", false);
        armamap_assertPoint(billboard.end,
            "billboards[" + index + "].end", false);
        if(billboard.start[0] === billboard.end[0] &&
            billboard.start[1] === billboard.end[1]) {
            throw new Error("billboards[" + index + "] endpoints must be distinct");
        }
        armamap_assertFiniteNumber(billboard.height,
            "billboards[" + index + "].height", 0);
        armamap_assertString(billboard.url,
            "billboards[" + index + "].url", false);
        if(billboard.url.length > NEOMAP_MAX_BILLBOARD_URL_CHARACTERS) {
            throw new Error("billboards[" + index + "].url cannot exceed " +
                NEOMAP_MAX_BILLBOARD_URL_CHARACTERS + " characters");
        }
        if(typeof billboard_isExternalUrl === "function" &&
            !billboard_isExternalUrl(billboard.url)) {
            throw new Error("billboards[" + index + "].url must be an external http(s) URL");
        }
        var facing = billboard.facing === undefined ? "right" : billboard.facing;
        if(facing !== "left" && facing !== "right") {
            throw new Error("billboards[" + index + "].facing must be left or right");
        }
        var dualSided = billboard.dual_sided === undefined ? true : billboard.dual_sided;
        if(typeof dualSided !== "boolean") {
            throw new Error("billboards[" + index + "].dual_sided must be boolean");
        }
        xml += '<Billboard level="' + billboardLevel + '" height="' +
            armamap_escape(billboard.height) + '" url="' +
            armamap_escape(billboard.url) + '" facing="' + facing +
            '" dual_sided="' + dualSided + '">' +
            armamap_xmlPoint(billboard.start, "billboards[" + index + "].start") +
            armamap_xmlPoint(billboard.end, "billboards[" + index + "].end") +
            '</Billboard>';
    });
    (document.zones || []).forEach(function(zone, zoneIndex) {
        var supportedTypes = {death:true,win:true,health:true,rubber:true,checkpoint:true,
            speed:true,teleport:true,setting:true};
        if(!supportedTypes[zone.type]) {
            throw new Error("unsupported canonical zone type " + zone.type);
        }
        armamap_assertZoneFields(zone);
        var zoneLevel = zone.level === undefined ? 0 :
            armamap_assertInteger(zone.level, "zones[" + zoneIndex + "].level", 0, 254);
        var attributes = ' level="' + zoneLevel + '" type="' + armamap_escape(zone.type) + '"';
        var showIcon = zone.show_icon === undefined ? true : zone.show_icon;
        if(typeof showIcon !== "boolean") {
            throw new Error("zones[" + zoneIndex + "].show_icon must be boolean");
        }
        attributes += ' show_icon="' + showIcon + '"';
        if(zone.trigger !== undefined) {
            if(["on_enter","while_inside","on_exit"].indexOf(zone.trigger) < 0) {
                throw new Error("zones[" + zoneIndex + "].trigger is invalid");
            }
            attributes += ' trigger="' + armamap_escape(zone.trigger) + '"';
        }
        var hasStartTick = Object.prototype.hasOwnProperty.call(zone, "start_tick");
        var hasEndTick = Object.prototype.hasOwnProperty.call(zone, "end_tick");
        if(hasStartTick !== hasEndTick) {
            throw new Error("zones[" + zoneIndex + "] must provide start_tick and end_tick together");
        }
        if(hasStartTick) {
            var startTick = armamap_assertInteger(
                zone.start_tick, "zones[" + zoneIndex + "].start_tick", 0);
            var endTick = armamap_assertInteger(
                zone.end_tick, "zones[" + zoneIndex + "].end_tick", 0);
            attributes += ' start_tick="' + startTick + '" end_tick="' + endTick + '"';
        }
        if(zone.type === "checkpoint") {
            var checkpointOrder = armamap_assertInteger(
                zone.order, "zones[" + zoneIndex + "].order", 0, 4294967295);
            if(typeof zoneTool_validCheckpointOrder === "function" &&
                !zoneTool_validCheckpointOrder(checkpointOrder)) {
                throw new Error("canonical checkpoint order must be from 0 through 4294967295");
            }
            attributes += ' order="' + (checkpointOrder || 0) + '"';
        }
        else if(zone.type === "speed") {
            armamap_assertFiniteNumber(
                zone.delta_mps, "zones[" + zoneIndex + "].delta_mps");
            armamap_assertInteger(
                zone.duration_ticks, "zones[" + zoneIndex + "].duration_ticks", 0);
            attributes += ' delta_mps="' + zone.delta_mps +
                '" duration_ticks="' + zone.duration_ticks + '"';
        } else if(zone.type === "rubber") {
            armamap_assertInteger(zone.delta,
                "zones[" + zoneIndex + "].delta");
            armamap_assertInteger(zone.duration_ticks,
                "zones[" + zoneIndex + "].duration_ticks", 0);
            attributes += ' delta="' + zone.delta +
                '" duration_ticks="' + zone.duration_ticks + '"';
        } else if(zone.type === "health") {
            try {
                armamap_assertFiniteNumber(zone.delta, "zones[" + zoneIndex + "].delta");
            } catch(error) {
                throw new Error("canonical health zone needs delta");
            }
            attributes += ' delta="' + zone.delta + '"';
        } else if(zone.type === "setting") {
            if(typeof zone.setting !== "string" || !zone.setting.length) {
                throw new Error("canonical setting zone needs setting and value");
            }
            armamap_assertFiniteNumber(zone.value, "zones[" + zoneIndex + "].value");
            if(typeof zoneTool_settingValidationError === "function") {
                var settingError = zoneTool_settingValidationError(zone.setting, zone.value);
                if(settingError) {
                    throw new Error("zones[" + zoneIndex + "]: " + settingError);
                }
            }
            if(typeof ZONE_TOOL_SETTING_INPUTS === "object" &&
                !Object.prototype.hasOwnProperty.call(ZONE_TOOL_SETTING_INPUTS, zone.setting)) {
                throw new Error("zones[" + zoneIndex + "].setting must use its canonical uppercase name");
            }
            attributes += ' setting="' + armamap_escape(zone.setting) +
                '" value="' + armamap_escape(zone.value) + '"';
        }
        else if(zone.type === "teleport") {
            armamap_assertPoint(
                zone.destination, "zones[" + zoneIndex + "].destination", false);
            var teleportLevel = zone.destination_level === undefined ?
                zoneLevel : armamap_assertInteger(zone.destination_level,
                    "zones[" + zoneIndex + "].destination_level", 0, 254);
            attributes += ' destination_x="' + zone.destination[0] +
                '" destination_y="' + zone.destination[1] + '" destination_level="' +
                teleportLevel + '"';
            if(typeof zone.direction === "string") {
                attributes += ' direction="' + armamap_escape(armamap_cardinalDirection(
                    zone.direction, "Canonical teleport direction")) + '"';
            } else if(zone.direction !== undefined) {
                var teleportDirection = armamap_nonzeroVector(
                    zone.direction, "Canonical teleport direction");
                attributes += ' xdir="' + teleportDirection[0] +
                    '" ydir="' + teleportDirection[1] + '"';
            }
        }
        if(zone.movement) {
            armamap_assertFields(zone.movement, "zone movement",
                ["speed","rotation","mode","spawn_at_vertices","instances","pulse_radii","path"]);
            var movementSpeed = zone.movement.speed;
            try {
                armamap_assertFiniteNumber(movementSpeed,
                    "zones[" + zoneIndex + "].movement.speed", Number.MIN_VALUE);
            } catch(error) {
                throw new Error("canonical moving-zone speed must be greater than zero");
            }
            var movementRotation = zone.movement.rotation === undefined ? 0 :
                zone.movement.rotation;
            try {
                armamap_assertFiniteNumber(movementRotation,
                    "zones[" + zoneIndex + "].movement.rotation");
            } catch(error) {
                throw new Error("canonical moving-zone rotation must be finite");
            }
            var hasMovementMode = Object.prototype.hasOwnProperty.call(zone.movement, "mode");
            var movementMode = hasMovementMode ? zone.movement.mode : "circular";
            if(["circular", "ping_pong", "instant"].indexOf(movementMode) < 0) {
                throw new Error("canonical moving-zone mode is invalid");
            }
            var movementPath = zone.movement.path;
            armamap_assertPointList(movementPath,
                "zones[" + zoneIndex + "].movement.path", 2, false);
            if(movementPath.every(function(point) {
                    return point[0] === movementPath[0][0] && point[1] === movementPath[0][1];
                })) {
                throw new Error("canonical movement path needs at least two distinct finite points");
            }
            var hasLegacySpawn = Object.prototype.hasOwnProperty.call(
                zone.movement, "spawn_at_vertices");
            var hasInstances = Object.prototype.hasOwnProperty.call(zone.movement, "instances");
            if(hasLegacySpawn && hasInstances) {
                throw new Error("canonical movement cannot combine instances with legacy spawn_at_vertices");
            }
            if(hasLegacySpawn && typeof zone.movement.spawn_at_vertices !== "boolean") {
                throw new Error("legacy canonical spawn_at_vertices must be boolean");
            }
            var movementInstances = hasInstances ? zone.movement.instances : [];
            if(!Array.isArray(movementInstances) || movementInstances.some(function(index, position) {
                return typeof index !== "number" || !isFinite(index) ||
                    Math.floor(index) !== index || index <= 0 ||
                    index >= movementPath.length || movementInstances.indexOf(index) !== position;
            })) {
                throw new Error("canonical movement instances must be unique in-range path indices after 0");
            }
            if(zone.movement.pulse_radii !== undefined) {
                var pulseRadii = zone.movement.pulse_radii;
                var pulseKeys = Array.isArray(pulseRadii) ? pulseRadii.filter(function(radius) {
                    return radius !== null;
                }) : [];
                if(!Array.isArray(pulseRadii) || pulseRadii.length !== movementPath.length ||
                    pulseKeys.length < 2 || pulseKeys.some(function(radius) {
                        return typeof radius !== "number" || !isFinite(radius) ||
                            Math.abs(radius) > Number.MAX_SAFE_INTEGER || radius <= 0;
                    }) || !zone.shape || zone.shape.type !== "circle") {
                    throw new Error("canonical circle pulse needs aligned positive radius keyframes");
                }
            }
            attributes += ' movement_speed="' + movementSpeed +
                '" rotation_speed="' + movementRotation + '"';
        }
        xml += '<Zone' + attributes + '>' +
            armamap_shapeXml(zone.shape, "zones[" + zoneIndex + "].shape");
        if(zone.movement) {
            var legacySpawn = zone.movement.spawn_at_vertices;
            var instances = (zone.movement.instances || []).map(Number);
            xml += '<MovementPath loop="true" mode="' +
                armamap_escape(Object.prototype.hasOwnProperty.call(zone.movement, "mode") ?
                    zone.movement.mode : "circular") + '"' +
                (legacySpawn === undefined ? '' : ' spawn_at_vertices="' +
                    (!!legacySpawn) + '"') +
                (instances.length ? ' instances="' + instances.join(',') + '"' : '') + '>';
            (zone.movement.path || []).forEach(function(point, pointIndex) {
                var pulseRadius = (zone.movement.pulse_radii || [])[pointIndex];
                xml += '<Point x="' + armamap_round(point[0]) + '" y="' +
                    armamap_round(point[1]) + '"' +
                    (pulseRadius === null || pulseRadius === undefined ? '' :
                        ' radius="' + armamap_round(pulseRadius) + '"') + '/>';
            });
            xml += '</MovementPath>';
        }
        xml += '</Zone>';
    });
    xml += '</Field></World>';
    if(document.validation !== undefined &&
        (!document.validation || typeof document.validation !== "object" ||
            Array.isArray(document.validation))) {
        throw new Error("validation must be an object");
    }
    if(document.validation && typeof document.validation === "object") {
        armamap_assertFields(document.validation, "validation", ["version","ticks","fraction",
            "tick_rate","fraction_scale","proof_algorithm","replay_proof"]);
        var validationAttributes = [];
        var validationMinimums = {
            version:1, ticks:0, fraction:0, tick_rate:1, fraction_scale:1
        };
        Object.keys(validationMinimums).forEach(function(name) {
            var value = armamap_assertInteger(document.validation[name],
                "validation." + name, validationMinimums[name]);
            validationAttributes.push(name + '="' + value + '"');
        });
        ["proof_algorithm","replay_proof"].forEach(function(name) {
            validationAttributes.push(name + '="' + armamap_escape(
                armamap_assertString(document.validation[name], "validation." + name, false)) + '"');
        });
        xml += '<MapValidation ' + validationAttributes.join(' ') + '/>';
    }
    xml += '</Map></Resource>';
    return xml;
}

function armamap_process(document, suppressHistoryClear, compatibilityXml) {
    return xml_process(compatibilityXml || armamap_toCompatibilityXml(document),
        suppressHistoryClear);
}
