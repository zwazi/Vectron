/* Canonical Arma Racing map format (.armamap, UTF-8 JSON). */

var ARMAMAP_FORMAT = "arma-racing-map";
var ARMAMAP_FORMAT_VERSION = 1;
var ARMAMAP_REVISION_PREFIX = "armamap-revision-v1:";
var ARMAMAP_REVISION_DOMAIN = "ARMA-RACING-MAP-REVISION-V1\0";

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
    var payload = ARMAMAP_REVISION_DOMAIN +
        armamap_stableJson(armamap_revisionProjection(document));
    return ARMAMAP_REVISION_PREFIX +
        xml_bytesToHex(xml_sha256Fallback(armamap_utf8(payload)));
}

function armamap_applyRevision(document) {
    if(!document.metadata || typeof document.metadata !== "object") document.metadata = {};
    if(document.metadata.tags === undefined) {
        var legacyTags = document.metadata.category;
        if(legacyTags === undefined) legacyTags = document.metadata.catregory;
        document.metadata.tags = armamap_parseTags(legacyTags);
        delete document.metadata.category;
        delete document.metadata.catregory;
    }
    document.metadata.revision = armamap_computeRevision(document);
    return document.metadata.revision;
}

function armamap_verifyRevision(document) {
    var metadata = document && document.metadata;
    var revision = metadata && metadata.revision;
    if(revision === undefined || revision === null || revision === "") return true;
    revision = String(revision);
    if(revision.indexOf(ARMAMAP_REVISION_PREFIX) !== 0) {
        // Numeric/free-form revisions belong to transitional pre-hash files.
        if(revision.indexOf("armamap-revision-") === 0) {
            throw new Error("unsupported .armamap revision algorithm");
        }
        return true;
    }
    if(!/^armamap-revision-v1:[0-9a-f]{64}$/.test(revision)) {
        throw new Error("malformed .armamap revision hash");
    }
    var expected = armamap_computeRevision(document);
    var difference = 0;
    for(var index = 0; index < expected.length; index++) {
        difference |= expected.charCodeAt(index) ^ revision.charCodeAt(index);
    }
    if(difference !== 0) throw new Error(".armamap revision does not match its persisted content");
    return true;
}

function armamap_round(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
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
    var x = Array.isArray(vector) ? Number(vector[0]) : NaN;
    var y = Array.isArray(vector) ? Number(vector[1]) : NaN;
    if(!Array.isArray(vector) || vector.length !== 2 ||
        !isFinite(x) || !isFinite(y) ||
        (Math.round(x * 1000) === 0 && Math.round(y * 1000) === 0)) {
        throw new Error(label + " must be a finite nonzero direction vector");
    }
    return [x, y];
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
        type:true,level:true,shape:true,trigger:true,start_tick:true,end_tick:true,movement:true
    };
    var effectFields = {
        death:{}, win:{}, checkpoint:{order:true}, health:{delta:true},
        speed:{delta_mps:true,duration_ticks:true}, setting:{setting:true,value:true},
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
    var canonicalType = zone.zoneName === "rubber" ? "health" : zone.zoneName;
    var result = {type:canonicalType, level:aamap_normalizeLevel(zone.level, 0),
        shape:armamap_shape(zone)};
    if(zone.trigger) result.trigger = zone.trigger;
    if(zone.activeStartTick !== null && zone.activeEndTick !== null &&
        isFinite(Number(zone.activeStartTick)) && isFinite(Number(zone.activeEndTick))) {
        result.start_tick = Number(zone.activeStartTick);
        result.end_tick = Number(zone.activeEndTick);
    }
    if(zone.zoneName === "checkpoint") result.order = Number(zone.option) || 0;
    else if(zone.zoneName === "speed") {
        result.delta_mps = Number(zone.options.delta_mps);
        result.duration_ticks = Number(zone.options.duration_ticks);
    } else if(zone.zoneName === "rubber") {
        result.delta = -Number(zone.options.delta);
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
            spawn_at_vertices:!!zone.spawnAtVertices,
            path:zone.movementPath.map(function(point) { return armamap_point(point); })
        };
    }
    return result;
}

function armamap_build(name, author, tags, revision, axes, settings, authorPasswordHash) {
    var parsedTags = armamap_parseTags(tags);
    var document = {
        format:ARMAMAP_FORMAT,
        format_version:ARMAMAP_FORMAT_VERSION,
        metadata:{name:name, author:author, tags:parsedTags.length ? parsedTags : ["racing"]},
        axes:$("#map_axes_forced").is(":checked") ?
            (Array.isArray(xml_axis_vectors) ? xml_axis_vectors.map(function(vector, index) {
                return armamap_nonzeroVector(
                    [armamap_round(vector[0]), armamap_round(vector[1])],
                    "Axis " + index);
            }) : Number(axes)) : 8,
        levels:{count:aamap_levelCount(), gaps:[]},
        settings:armamap_settings(settings),
        spawns:[], walls:[], floors:[], ramps:[], zones:[]
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
    aamap_objects.forEach(function(object) {
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
        }
    });
    armamap_applyRevision(document);
    return {
        fileName:String(name || "map").replace(/[^a-z0-9._-]+/gi, "-") + ".armamap",
        text:JSON.stringify(document, null, 2) + "\n",
        document:document,
        validationErrors:aamap_validateForExport(axes),
        validationWarnings:aamap_warningsForExport()
    };
}

function armamap_escape(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");
}

function armamap_xmlPoint(point) {
    if(!Array.isArray(point) || point.length < 2) throw new Error("point must contain x and y");
    var height = point.length > 2 ? ' height="' + armamap_escape(point[2]) + '"' : "";
    return '<Point x="' + armamap_escape(point[0]) + '" y="' +
        armamap_escape(point[1]) + '"' + height + '/>';
}

function armamap_shapeXml(shape) {
    if(!shape || typeof shape !== "object") throw new Error("zone shape must be an object");
    var fields = {
        line:["type","start","end","width"],
        rectangle:["type","min","max"],
        polygon:["type","points"],
        circle:["type","center","radius"]
    }[shape.type];
    if(!fields) throw new Error("unsupported zone shape " + shape.type);
    armamap_assertFields(shape, "zone shape", fields);
    if(shape.type === "line") return '<ShapeLine width="' + armamap_escape(shape.width) + '">' +
        armamap_xmlPoint(shape.start) + armamap_xmlPoint(shape.end) + '</ShapeLine>';
    if(shape.type === "rectangle") return '<ShapeRectangle minx="' + armamap_escape(shape.min[0]) +
        '" miny="' + armamap_escape(shape.min[1]) + '" maxx="' + armamap_escape(shape.max[0]) +
        '" maxy="' + armamap_escape(shape.max[1]) + '"/>';
    if(shape.type === "polygon") return '<ShapePolygon scale="1"><Point x="0" y="0"/>' +
        (shape.points || []).map(armamap_xmlPoint).join("") + '</ShapePolygon>';
    if(shape.type === "circle") return '<ShapeCircle radius="' + armamap_escape(shape.radius) + '">' +
        armamap_xmlPoint(shape.center) + '</ShapeCircle>';
    throw new Error("unsupported zone shape " + shape.type);
}

function armamap_toCompatibilityXml(document) {
    if(!document || document.format !== ARMAMAP_FORMAT ||
        Number(document.format_version) !== ARMAMAP_FORMAT_VERSION) {
        throw new Error("not a supported Arma Racing map");
    }
    armamap_assertFields(document, "map document", ["format","format_version","metadata",
        "axes","levels","settings","spawns","walls","floors","ramps","zones","validation"]);
    armamap_verifyRevision(document);
    var metadata = document.metadata || {};
    armamap_assertFields(metadata, "metadata", ["name","author","tags","category",
        "catregory","revision","author_password_hash"]);
    if(metadata.tags !== undefined &&
        (metadata.category !== undefined || metadata.catregory !== undefined)) {
        throw new Error("metadata.tags cannot be combined with legacy category/catregory");
    }
    var tagsSource = metadata.tags;
    if(tagsSource === undefined) tagsSource = metadata.category;
    if(tagsSource === undefined) tagsSource = metadata.catregory;
    var tags = armamap_parseTags(tagsSource);
    if(metadata.author_password_hash !== undefined &&
        !xml_isValidAuthorPasswordHash(metadata.author_password_hash)) {
        throw new Error("metadata.author_password_hash is invalid or unsupported");
    }
    var password = metadata.author_password_hash !== undefined ?
        ' author_password_hash="' + armamap_escape(metadata.author_password_hash) + '"' : "";
    var xml = '<Resource name="' + armamap_escape(metadata.name || "Unnamed map") +
        '" author="' + armamap_escape(metadata.author || "") + '" category="' +
        armamap_escape(tags.join(", ")) + '" version="' +
        armamap_escape(metadata.revision || "1") + '"><Map checkpoint_order_base="1"' + password + '>';
    var settings = document.settings || {};
    armamap_assertFields(settings, "settings", Object.keys(settings));
    armamap_assertFields(document.levels || {}, "levels", ["count","gaps"]);
    var settingNames = Object.keys(settings);
    if(settingNames.length) xml += '<Settings>' + settingNames.map(function(name) {
        return '<Setting name="' + armamap_escape(name) + '" value="' +
            armamap_escape(settings[name]) + '"/>';
    }).join("") + '</Settings>';
    var gaps = document.levels && Array.isArray(document.levels.gaps) ? document.levels.gaps : [];
    xml += '<World><Field' + (gaps.length ? ' level_heights="' + armamap_escape(gaps.join(",")) + '"' : "") + '>';
    if(Array.isArray(document.axes)) {
        xml += '<Axes number="' + document.axes.length + '" normalize="false">' +
            document.axes.map(function(axis, index) {
                axis = armamap_nonzeroVector(axis, "Canonical axis " + index);
                return '<Axis xdir="' + armamap_escape(axis[0]) +
                    '" ydir="' + armamap_escape(axis[1]) + '"/>';
            }).join("") + '</Axes>';
    } else if(document.axes !== undefined) xml += '<Axes number="' + armamap_escape(document.axes) + '"/>';
    var count = Number(document.levels && document.levels.count) || 1;
    for(var level = 0; level < count; level++) xml += '<Level index="' + level + '"/>';
    (document.spawns || []).forEach(function(spawn, index) {
        armamap_assertFields(spawn, "spawns[" + index + "]", ["level","position","direction"]);
        var direction = spawn.direction;
        var directionX = Array.isArray(direction) ? Number(direction[0]) : NaN;
        var directionY = Array.isArray(direction) ? Number(direction[1]) : NaN;
        if(!Array.isArray(direction) || direction.length !== 2 ||
            !isFinite(directionX) || !isFinite(directionY) ||
            (directionX === 0 && directionY === 0)) {
            throw new Error("canonical spawn " + index + " needs a nonzero direction vector");
        }
        xml += '<Spawn level="' + (Number(spawn.level) || 0) + '" x="' + armamap_escape(spawn.position[0]) +
            '" y="' + armamap_escape(spawn.position[1]) + '" xdir="' + armamap_escape(directionX) +
            '" ydir="' + armamap_escape(directionY) + '"/>';
    });
    (document.walls || []).forEach(function(wall, index) {
        armamap_assertFields(wall, "walls[" + index + "]", ["level","height","points"]);
        if(wall.height === null) throw new Error("walls[" + index + "].height must be a number");
        xml += '<Wall level="' + (Number(wall.level) || 0) + '"' +
            (wall.height === undefined || wall.height === null ? "" : ' height="' + armamap_escape(wall.height) + '"') + '>' +
            (wall.points || []).map(armamap_xmlPoint).join("") + '</Wall>';
    });
    (document.floors || []).forEach(function(floor, index) {
        armamap_assertFields(floor, "floors[" + index + "]", ["level","points"]);
        xml += '<Floor level="' + floor.level + '">' + (floor.points || []).map(armamap_xmlPoint).join("") + '</Floor>';
    });
    (document.ramps || []).forEach(function(ramp, index) {
        armamap_assertFields(ramp, "ramps[" + index + "]",
            ["from_level","to_level","width","points"]);
        if(!Array.isArray(ramp.points) || [2,4].indexOf(ramp.points.length) < 0) {
            throw new Error("canonical ramp points must contain exactly 2 or 4 points");
        }
        if(ramp.points.length === 2 &&
            (!(Number(ramp.width) > 0) || !isFinite(Number(ramp.width)))) {
            throw new Error("a 2-point canonical ramp needs a positive width");
        }
        if(ramp.points.length === 4 && ramp.width !== undefined) {
            throw new Error("ramps[" + index + "].width is valid only for a 2-point ramp");
        }
        var rampWidth = ramp.width === undefined || ramp.width === null ? "" :
            ' width="' + armamap_escape(ramp.width) + '"';
        xml += '<Ramp from_level="' + ramp.from_level + '" to_level="' + ramp.to_level + '"' +
            rampWidth + '>' +
            (ramp.points || []).map(armamap_xmlPoint).join("") + '</Ramp>';
    });
    (document.zones || []).forEach(function(zone) {
        var supportedTypes = {death:true,win:true,health:true,checkpoint:true,
            speed:true,teleport:true,setting:true};
        if(!supportedTypes[zone.type]) {
            throw new Error("unsupported canonical zone type " + zone.type);
        }
        armamap_assertZoneFields(zone);
        var attributes = ' level="' + (Number(zone.level) || 0) + '" type="' + armamap_escape(zone.type) + '"';
        ["trigger","start_tick","end_tick"].forEach(function(name) {
            if(zone[name] !== undefined) attributes += ' ' + name + '="' + armamap_escape(zone[name]) + '"';
        });
        if(zone.type === "checkpoint") attributes += ' order="' + (Number(zone.order) || 0) + '"';
        else if(zone.type === "speed") {
            if(!isFinite(Number(zone.delta_mps)) || !isFinite(Number(zone.duration_ticks))) {
                throw new Error("canonical speed zone needs delta_mps and duration_ticks");
            }
            attributes += ' delta_mps="' + zone.delta_mps +
                '" duration_ticks="' + zone.duration_ticks + '"';
        } else if(zone.type === "health") {
            if(!isFinite(Number(zone.delta))) {
                throw new Error("canonical health zone needs delta");
            }
            attributes += ' delta="' + zone.delta + '"';
        } else if(zone.type === "setting") {
            if(zone.setting === undefined || !isFinite(Number(zone.value))) {
                throw new Error("canonical setting zone needs setting and value");
            }
            attributes += ' setting="' + armamap_escape(zone.setting) +
                '" value="' + armamap_escape(zone.value) + '"';
        }
        else if(zone.type === "teleport") {
            var teleportLevel = zone.destination_level === undefined ?
                (Number(zone.level) || 0) : Number(zone.destination_level);
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
                ["speed","rotation","mode","spawn_at_vertices","path"]);
            var movementSpeed = Number(zone.movement.speed);
            if(!isFinite(movementSpeed) || movementSpeed <= 0) {
                throw new Error("canonical moving-zone speed must be greater than zero");
            }
            attributes += ' movement_speed="' + movementSpeed +
                '" rotation_speed="' + (Number(zone.movement.rotation) || 0) + '"';
        }
        xml += '<Zone' + attributes + '>' + armamap_shapeXml(zone.shape);
        if(zone.movement) xml += '<MovementPath loop="true" mode="' +
            armamap_escape(zone.movement.mode || "circular") + '" spawn_at_vertices="' +
            (!!zone.movement.spawn_at_vertices) + '">' +
            (zone.movement.path || []).map(armamap_xmlPoint).join("") + '</MovementPath>';
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
        ["version","ticks","fraction","tick_rate","fraction_scale",
            "proof_algorithm","replay_proof"].forEach(function(name) {
            if(document.validation[name] !== undefined) {
                validationAttributes.push(name + '="' +
                    armamap_escape(document.validation[name]) + '"');
            }
        });
        if(validationAttributes.length) {
            xml += '<MapValidation ' + validationAttributes.join(' ') + '/>';
        }
    }
    xml += '</Map></Resource>';
    return xml;
}

function armamap_process(document, suppressHistoryClear, compatibilityXml) {
    return xml_process(compatibilityXml || armamap_toCompatibilityXml(document),
        suppressHistoryClear);
}
