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


var xml_name;
var xml_author;
var xml_version;
var xml_category;
var xml_author_password_hash = "";
var xml_author_password_dirty = false;
var xml_author_password_revision = 0;
var xml_author_password_pending = null;
var xml_wallheight = 4;
var xml_axes = 4;
// Null means the editor is using the regular `number` form.  Explicit vectors
// are retained verbatim (or normalized once for legacy XML) so importing a
// custom winding cannot silently replace it with a regular axis set.
var xml_axis_vectors = null;
var xml_settings = [];
var xml_latest_read_id = 0;
var xml_checkpoint_order_base_one = false;
var xml_map_validation = null;
var XML_AUTHOR_TIME_SETTING_NAMES = [
    "PROGRAM_TIME","USER_TIME","ADMIN_TIME","ARCHITECT_TIME",
    "BRONZE_TIME","SILVER_TIME","GOLD_TIME","AUTHOR_TIME",
    "RACING_PROGRAM_TIME","RACING_USER_TIME","RACING_ADMIN_TIME",
    "RACING_ARCHITECT_TIME","RACING_TIME_PROGRAM","RACING_TIME_USER",
    "RACING_TIME_ADMIN","RACING_TIME_ARCHITECT","TIME_GOAL_PROGRAM",
    "TIME_GOAL_USER","TIME_GOAL_ADMIN","TIME_GOAL_ARCHITECT"
];

function xml_invalidateAuthorTime() {
    var hadValidation = !!xml_map_validation;
    var oldLength = xml_settings.length;
    xml_map_validation = null;
    xml_settings = xml_settings.filter(function(setting) {
        var name = String(setting || "").trim().split(/\s+/, 1)[0].toUpperCase();
        return XML_AUTHOR_TIME_SETTING_NAMES.indexOf(name) < 0;
    });
    if(hadValidation || xml_settings.length !== oldLength) {
        $("#map_settings").val(xml_settings.join("\n"));
        if(typeof mapSettings_renderList === "function") mapSettings_renderList();
        gui_writeLog("Author-time proof and medal targets cleared because the course changed.");
    }
}

function xml_normalizeLegacyAxis(x, y) {
    function fixedMapUnits(value) {
        var match = String(value).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
        if(!match || (!match[2] && !match[3])) return NaN;
        var whole = Number(match[2] || "0");
        var fraction = match[3] || "";
        var denominator = Math.pow(10, fraction.length);
        var scaledFraction = fraction ?
            Math.floor((Number(fraction) * 1000 + denominator / 2) / denominator) : 0;
        var fixed = whole * 1000 + scaledFraction;
        return match[1] === "-" ? -fixed : fixed;
    }
    var fixedX = fixedMapUnits(x);
    var fixedY = fixedMapUnits(y);
    var length = Math.floor(Math.sqrt(fixedX * fixedX + fixedY * fixedY));
    if(!isFinite(fixedX) || !isFinite(fixedY) || length < 1) return null;
    // JavaScript's truncation matches Rust integer division toward zero.
    return [Math.trunc(fixedX * 1000 / length) / 1000,
        Math.trunc(fixedY * 1000 / length) / 1000];
}

var XML_AUTHOR_PASSWORD_DOMAIN = "ArmaRacing Author Password v1\0";
var XML_AUTHOR_PASSWORD_HASH_PATTERN = /^sha256-v1:[0-9a-fA-F]{32}:[0-9a-fA-F]{64}$/;

function xml_isValidAuthorPasswordHash(value) {
    return XML_AUTHOR_PASSWORD_HASH_PATTERN.test(String(value || ""));
}

function xml_bytesToHex(bytes) {
    var output = "";
    for(var i = 0; i < bytes.length; i++) output += bytes[i].toString(16).padStart(2, "0");
    return output;
}

// Standards-compatible fallback for browsers that expose secure random bytes
// but restrict SubtleCrypto on a plain-LAN HTTP origin (common while testing
// Vectron from a phone). It hashes only the short verifier payload.
function xml_sha256Fallback(input) {
    var constants = [
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    var bytes = new Uint8Array(paddedLength);
    bytes.set(input);
    bytes[input.length] = 0x80;
    var bitLength = input.length * 8;
    var highLength = Math.floor(bitLength / 0x100000000);
    var lowLength = bitLength >>> 0;
    for(var lengthByte = 0; lengthByte < 4; lengthByte++) {
        bytes[paddedLength - 8 + lengthByte] = highLength >>> (24 - lengthByte * 8);
        bytes[paddedLength - 4 + lengthByte] = lowLength >>> (24 - lengthByte * 8);
    }

    var state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
        0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var words = new Uint32Array(64);
    function rotateRight(value, count) {
        return (value >>> count) | (value << (32 - count));
    }
    for(var offset = 0; offset < bytes.length; offset += 64) {
        for(var word = 0; word < 16; word++) {
            var index = offset + word * 4;
            words[word] = ((bytes[index] << 24) | (bytes[index + 1] << 16) |
                (bytes[index + 2] << 8) | bytes[index + 3]) >>> 0;
        }
        for(var expanded = 16; expanded < 64; expanded++) {
            var x = words[expanded - 15], y = words[expanded - 2];
            var sigma0 = rotateRight(x,7) ^ rotateRight(x,18) ^ (x >>> 3);
            var sigma1 = rotateRight(y,17) ^ rotateRight(y,19) ^ (y >>> 10);
            words[expanded] = (words[expanded - 16] + sigma0 +
                words[expanded - 7] + sigma1) >>> 0;
        }
        var a=state[0], b=state[1], c=state[2], d=state[3];
        var e=state[4], f=state[5], g=state[6], h=state[7];
        for(var round = 0; round < 64; round++) {
            var upperSigma1 = rotateRight(e,6) ^ rotateRight(e,11) ^ rotateRight(e,25);
            var choose = (e & f) ^ (~e & g);
            var temp1 = (h + upperSigma1 + choose + constants[round] + words[round]) >>> 0;
            var upperSigma0 = rotateRight(a,2) ^ rotateRight(a,13) ^ rotateRight(a,22);
            var majority = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (upperSigma0 + majority) >>> 0;
            h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
        }
        state[0]=(state[0]+a)>>>0; state[1]=(state[1]+b)>>>0;
        state[2]=(state[2]+c)>>>0; state[3]=(state[3]+d)>>>0;
        state[4]=(state[4]+e)>>>0; state[5]=(state[5]+f)>>>0;
        state[6]=(state[6]+g)>>>0; state[7]=(state[7]+h)>>>0;
    }
    var digest = new Uint8Array(32);
    for(var stateIndex = 0; stateIndex < state.length; stateIndex++) {
        for(var outputByte = 0; outputByte < 4; outputByte++) {
            digest[stateIndex * 4 + outputByte] = state[stateIndex] >>> (24 - outputByte * 8);
        }
    }
    return digest;
}

function xml_setAuthorPasswordPlaceholder(message) {
    var input = document.getElementById("map_author_password");
    if(input) input.placeholder = message;
}

/**
 * Derive the public password verifier used by the game. The plaintext never
 * enters exported XML and is intentionally not retained outside the input.
 */
function xml_scheduleAuthorPasswordHash(password) {
    password = String(password || "");
    xml_author_password_dirty = true;
    var revision = ++xml_author_password_revision;
    if(password.length === 0) {
        xml_author_password_hash = "";
        xml_author_password_pending = null;
        xml_setAuthorPasswordPlaceholder("Author-time password");
        return Promise.resolve("");
    }

    xml_author_password_hash = "";
    xml_setAuthorPasswordPlaceholder("Securing password…");
    var cryptoApi = window.crypto;
    if(!cryptoApi || !cryptoApi.getRandomValues) {
        gui_writeLog("Author password hashing requires Web Crypto.");
        gui_toast("This browser cannot securely save the author password.");
        xml_setAuthorPasswordPlaceholder("Password could not be secured");
        return Promise.resolve("");
    }

    var salt = new Uint8Array(16);
    cryptoApi.getRandomValues(salt);
    var encoder = new TextEncoder();
    var domain = encoder.encode(XML_AUTHOR_PASSWORD_DOMAIN);
    var passwordBytes = encoder.encode(password);
    var payload = new Uint8Array(domain.length + salt.length + passwordBytes.length);
    payload.set(domain, 0);
    payload.set(salt, domain.length);
    payload.set(passwordBytes, domain.length + salt.length);

    var digestPromise = cryptoApi.subtle ?
        cryptoApi.subtle.digest("SHA-256", payload).then(function(buffer) {
            return new Uint8Array(buffer);
        }) : Promise.resolve(xml_sha256Fallback(payload));
    var pending = digestPromise.then(function(digest) {
        var verifier = "sha256-v1:" + xml_bytesToHex(salt) + ":" +
            xml_bytesToHex(digest);
        if(revision === xml_author_password_revision) {
            xml_author_password_hash = verifier;
            xml_setAuthorPasswordPlaceholder("Password secured");
        }
        return verifier;
    }).catch(function(error) {
        if(revision === xml_author_password_revision) {
            xml_author_password_hash = "";
            xml_setAuthorPasswordPlaceholder("Password could not be secured");
            gui_toast("Could not secure the author password.");
        }
        gui_writeLog("Could not hash author password: " + error.message);
        return "";
    });
    xml_author_password_pending = pending.then(function(verifier) {
        if(revision === xml_author_password_revision) xml_author_password_pending = null;
        return verifier;
    });
    return xml_author_password_pending;
}

function xml_waitForAuthorPasswordHash() {
    return xml_author_password_pending || Promise.resolve(xml_author_password_hash);
}

function xml_hexToBytes(value) {
    if(!/^[0-9a-f]+$/i.test(value) || value.length % 2) return null;
    var bytes = new Uint8Array(value.length / 2);
    for(var index = 0; index < bytes.length; index++) {
        bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

/** Verify export confirmation without retaining or re-salting the plaintext. */
function xml_verifyAuthorPassword(password) {
    var fields = String(xml_author_password_hash || "").split(":");
    if(fields.length !== 3 || fields[0] !== "sha256-v1" ||
        !/^[0-9a-f]{32}$/i.test(fields[1]) || !/^[0-9a-f]{64}$/i.test(fields[2])) {
        return Promise.resolve(false);
    }
    var salt = xml_hexToBytes(fields[1]);
    var encoder = new TextEncoder();
    var domain = encoder.encode(XML_AUTHOR_PASSWORD_DOMAIN);
    var passwordBytes = encoder.encode(String(password || ""));
    var payload = new Uint8Array(domain.length + salt.length + passwordBytes.length);
    payload.set(domain, 0);
    payload.set(salt, domain.length);
    payload.set(passwordBytes, domain.length + salt.length);
    var cryptoApi = window.crypto;
    var digest = cryptoApi && cryptoApi.subtle ?
        cryptoApi.subtle.digest("SHA-256", payload).then(function(buffer) {
            return new Uint8Array(buffer);
        }) : Promise.resolve(xml_sha256Fallback(payload));
    return digest.then(function(actual) {
        var expected = xml_hexToBytes(fields[2]);
        var difference = 0;
        for(var index = 0; index < expected.length; index++) {
            difference |= actual[index] ^ expected[index];
        }
        return difference === 0;
    }).catch(function() { return false; });
}

function xml_init() {

    $('#files').change(function(e) {
        xml_handle(e);
    });

    window.addEventListener("dragover", function(e) {
        e.preventDefault();
    });
    window.addEventListener("drop", function(e) {
        e.preventDefault();
        var files = e.dataTransfer && e.dataTransfer.files;
        if(!files || !files.length) return;
        xml_handleFile(files[0]);
        if(files.length > 1) {
            gui_writeLog("Only the first dropped map will be loaded.");
        }
    });
}  

function xml_process(xml, suppressHistoryClear) {

    var parsed;
    try {
        parsed = typeof xml === "string" ? $.parseXML(xml) : xml;
    } catch(e) {
        gui_writeLog("Could not parse map XML: " + e.message);
        return;
    }
    var root = $(parsed.documentElement);
    var resource = root.is("Resource") ? root : root.find("Resource").first();
    gui_writeLog(resource.attr("name"));
    xml_name = resource.attr("name") || "";
    xml_author = resource.attr("author") || "";
    xml_version = resource.attr("version") || "";
    xml_category = resource.attr("category") || "";

    xml_settings.splice(0);
    $(parsed).find("Setting").each(function() {
        var name = $(this).attr("name") || "";
        if(name.toUpperCase() !== "LANDSCAPE") {
            xml_settings.push(name+" "+$(this).attr("value"));
        }
    });
    xml_wallheight = 4;
    xml_settings.some(function(setting) {
        var parts = String(setting).trim().split(/\s+/, 2);
        if(parts[0].toUpperCase() !== "RIM_HEIGHT") return false;
        var height = Number(parts[1]);
        if(isFinite(height) && height >= 0) xml_wallheight = height;
        return true;
    });

    xml_axes = 4;
    xml_axis_vectors = null;
    var field = $(parsed).find("Field").first();
    var mapElement = $(parsed).find("Map").first();
    xml_checkpoint_order_base_one = mapElement.attr("checkpoint_order_base") === "1";
    xml_map_validation = null;
    $(parsed).find("MapValidation").first().each(function() {
        xml_map_validation = {};
        ["version","ticks","fraction","tick_rate","fraction_scale",
            "proof_algorithm","replay_proof"].forEach(function(name) {
            xml_map_validation[name] = $(this).attr(name);
        }, this);
    });
    var importedAuthorPasswordHash = mapElement.attr("author_password_hash") || "";
    if(importedAuthorPasswordHash && !xml_isValidAuthorPasswordHash(importedAuthorPasswordHash)) {
        gui_writeLog("Ignored invalid author_password_hash metadata.");
        importedAuthorPasswordHash = "";
    }
    xml_author_password_revision++;
    xml_author_password_pending = null;
    xml_author_password_hash = importedAuthorPasswordHash;
    xml_author_password_dirty = false;
    var fieldLevelHeights = field.attr("level_heights");
    if(fieldLevelHeights === undefined) fieldLevelHeights = field.attr("levelHeights");
    var mapLevelHeights = mapElement.attr("level_heights");
    if(mapLevelHeights === undefined) mapLevelHeights = mapElement.attr("levelHeights");
    var fieldLevelHeight = field.attr("level_height");
    if(fieldLevelHeight === undefined) fieldLevelHeight = field.attr("levelHeight");
    var mapLevelHeight = mapElement.attr("level_height");
    if(mapLevelHeight === undefined) mapLevelHeight = mapElement.attr("levelHeight");
    var rawLevelHeights = fieldLevelHeights !== undefined ? fieldLevelHeights : mapLevelHeights;
    var rawLevelHeight = fieldLevelHeight !== undefined ? fieldLevelHeight : mapLevelHeight;
    var parsedLevelHeight = Number(rawLevelHeight);
    if(fieldLevelHeight !== undefined && mapLevelHeight !== undefined &&
        Number(fieldLevelHeight) !== Number(mapLevelHeight)) {
        gui_writeLog("Conflicting Map and Field level_height values; using the Field value.");
    }
    var parsedLevelHeights = [];
    if(rawLevelHeights !== undefined) {
        String(rawLevelHeights).split(",").forEach(function(value) {
            var height = Number(value.trim());
            if(isFinite(height) && height > 0) parsedLevelHeights.push(height);
        });
        if(!parsedLevelHeights.length || parsedLevelHeights.length !== String(rawLevelHeights).split(",").length) {
            gui_writeLog("Invalid level_heights; invalid entries use 8 metres.");
            parsedLevelHeights = String(rawLevelHeights).split(",").map(function(value) {
                value = Number(value.trim());
                return isFinite(value) && value > 0 ? value : 8;
            });
        }
    }
    if(rawLevelHeight !== undefined && (!isFinite(parsedLevelHeight) || parsedLevelHeight <= 0)) {
        gui_writeLog("Invalid level_height; using 8 metres.");
        parsedLevelHeight = 8;
    }
    $("#map_axes_forced")[0].checked = false;
    $(parsed).find("Axes").first().each(function() {
        var parsedAxes = parseInt($(this).attr("number"));
        if(isFinite(parsedAxes) && parsedAxes >= 1 && parsedAxes <= 65535 &&
            Math.floor(parsedAxes) === parsedAxes) {
            xml_axes = parsedAxes;
        } else if($(this).attr("number") !== undefined) {
            gui_writeLog("Ignored invalid Axes count.");
        }
        var normalize = $(this).attr("normalize") !== "false";
        var vectors = [];
        $(this).children("Axis, Point").each(function() {
            var axis = $(this);
            var x = xml_firstAttribute(axis, ["xdir", "x"]);
            var y = xml_firstAttribute(axis, ["ydir", "y"]);
            if(x === undefined || y === undefined || !isFinite(Number(x)) ||
                !isFinite(Number(y))) return;
            var vector = normalize ? xml_normalizeLegacyAxis(x, y) : [Number(x), Number(y)];
            if(vector) vectors.push(vector);
        });
        if(vectors.length) {
            xml_axis_vectors = vectors.slice(0, xml_axes);
            xml_axes = xml_axis_vectors.length;
        }
        $("#map_axes_forced")[0].checked = true;
    });

    var highestLevel = parsedLevelHeights.length;
    var occupiedLevels = {};
    if(rawLevelHeight !== undefined) highestLevel = Math.max(highestLevel, 1);
    $(parsed).find("Level").each(function() {
        var value = $(this).attr("index");
        if(value === undefined) value = $(this).attr("level");
        value = Number(value);
        if(isFinite(value) && value >= 0 && Math.floor(value) === value) {
            highestLevel = Math.max(highestLevel, value);
            occupiedLevels[value] = true;
        }
    });
    $(parsed).find("Spawn[level],Zone[level],Wall[level],Floor[level]").each(function() {
        var value = Number($(this).attr("level"));
        if(isFinite(value) && value >= 0 && Math.floor(value) === value) {
            highestLevel = Math.max(highestLevel, value);
            occupiedLevels[value] = true;
        }
    });
    $(parsed).find("Ramp").each(function() {
        [$(this).attr("from_level"), $(this).attr("to_level")].forEach(function(raw) {
            var value = Number(raw);
            if(isFinite(value) && value >= 0 && Math.floor(value) === value) {
                highestLevel = Math.max(highestLevel, value);
                occupiedLevels[value] = true;
            }
        });
    });
    $(parsed).find("Zone[destination_level]").each(function() {
        var value = Number($(this).attr("destination_level"));
        if(isFinite(value) && value >= 0 && Math.floor(value) === value) {
            highestLevel = Math.max(highestLevel, value);
            occupiedLevels[value] = true;
        }
    });
    var importedHeights = [];
    for(var gap = 0; gap < highestLevel; gap++) {
        importedHeights.push(parsedLevelHeights[gap] ||
            parsedLevelHeights[parsedLevelHeights.length - 1] ||
            (isFinite(parsedLevelHeight) && parsedLevelHeight > 0 ? parsedLevelHeight : 8));
    }
    aamap_activeLevel = 0;
    aamap_resetLevels(highestLevel + 1, importedHeights, occupiedLevels);
    gui_fillInput();

    aamap_updateLayerControls();
    var pt = xml_process_piece(parsed, 0);
    aamap_updateLayerControls();
    var ptsx = pt[0], ptsy = pt[1];
    if(ptsx.length && ptsy.length) {
        var max_x = Math.max.apply(Math, ptsx);
        var min_x = Math.min.apply(Math, ptsx);
        var max_y = Math.max.apply(Math, ptsy);
        var min_y = Math.min.apply(Math, ptsy);
        vectron_panX = -1*(max_x + min_x)/2;
        vectron_panY = -1*(max_y + min_y)/2;
        var span = (max_x-min_x)+(max_y-min_y);
        vectron_zoom = span > 0 ? (((vectron_width+vectron_height)/2))/span : 1;
    } else {
        vectron_panX = 0;
        vectron_panY = 0;
        vectron_zoom = 1;
    }
    vectron_render();
    if(!suppressHistoryClear) aamap_clearHistory();
}

function xml_parsePlacementLevel(element, fallbackLevel) {
    var node = $(element);
    var explicit = node.attr("level");
    var levelWrapper = node.parents("Level").first();
    var wrapper = levelWrapper.attr("index");
    if(wrapper === undefined) wrapper = levelWrapper.attr("level");
    var level = explicit !== undefined ? Number(explicit) :
        (wrapper !== undefined ? Number(wrapper) : aamap_normalizeLevel(fallbackLevel, 0));
    if((explicit !== undefined && wrapper !== undefined && Number(explicit) !== Number(wrapper)) ||
        !isFinite(level) || level < 0 || Math.floor(level) !== level) {
        gui_writeLog("Skipped " + element.tagName + " with invalid or conflicting floor.");
        return null;
    }
    aamap_ensureLevel(level);
    return level;
}

function xml_zoneKind(value) {
    value = String(value || "death").toLowerCase();
    if(value === "finish") value = "win";
    if(value === "target") value = "win";
    if(value === "kill") value = "death";
    return value;
}

function xml_number(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
}

function xml_firstAttribute(element, names) {
    for(var i = 0; i < names.length; i++) {
        var value = element.attr(names[i]);
        if(value !== undefined) return value;
    }
    return undefined;
}

function xml_createRampFromData(points, width, fromLevel, toLevel) {
    if(points.length === 4) {
        return new Ramp(points[0], points[1], points[2], points[3], fromLevel, toLevel);
    }
    // Compatibility conversion for Vectron/Arma Racing maps authored before
    // four-corner ramps: centre-line endpoints plus width become two edges.
    return new Ramp(points[0], points[1], width, fromLevel, toLevel);
}

function xml_process_piece(xml, defaultLevel)
{
    var ptsx = [];
    var ptsy = [];
    var supportedZoneTypes = {death:true, win:true, rubber:true, health:true,
        checkpoint:true, speed:true, teleport:true, setting:true};

    $(xml).find("Spawn,Zone,Wall,Ramp,Floor").each(function() {
        var tag = this.tagName.toLowerCase();
        var element = $(this);

        if(tag === "spawn") {
            var spawnLevel = xml_parsePlacementLevel(this, defaultLevel);
            if(spawnLevel === null) return;
            var spawnX = Number(element.attr("x"));
            var spawnY = Number(element.attr("y"));
            var xdir = Number(element.attr("xdir"));
            var ydir = Number(element.attr("ydir"));
            var angle = Number(element.attr("angle"));
            if((!isFinite(xdir) || !isFinite(ydir)) && isFinite(angle)) {
                var radians = angle * Math.PI / 180;
                xdir = Math.cos(radians);
                ydir = Math.sin(radians);
            }
            if(!isFinite(spawnX) || !isFinite(spawnY)) {
                gui_writeLog("Skipped spawn with invalid coordinates.");
                return;
            }
            if(!isFinite(xdir) || !isFinite(ydir) || (xdir === 0 && ydir === 0)) {
                xdir = 1;
                ydir = 0;
            }
            var spawnObj = new Spawn();
            spawnObj.level = spawnLevel;
            spawnObj.x = spawnX;
            spawnObj.y = spawnY;
            spawnObj.xDir = xdir;
            spawnObj.yDir = ydir;
            ptsx.push(spawnX);
            ptsy.push(spawnY);
            aamap_add(spawnObj);
            return;
        }

        if(tag === "wall") {
            var wallLevel = xml_parsePlacementLevel(this, defaultLevel);
            if(wallLevel === null) return;
            var wallPoints = [];
            var invalidWall = false;
            var authoredWallHeight = element.attr("height") !== undefined;
            var wallHeight = xml_number(element.attr("height"), xml_wallheight);
            var hasPointHeights = false;
            element.children("Point").each(function() {
                var pointX = Number($(this).attr("x"));
                var pointY = Number($(this).attr("y"));
                var rawPointHeight = $(this).attr("height");
                var pointHeight;
                if(rawPointHeight !== undefined) {
                    pointHeight = Number(rawPointHeight);
                    hasPointHeights = true;
                }
                if(!isFinite(pointX) || !isFinite(pointY) ||
                    (rawPointHeight !== undefined && (!isFinite(pointHeight) || pointHeight < 0))) {
                    invalidWall = true;
                }
                wallPoints.push(new WallPoint(pointX, pointY, pointHeight));
            });
            if(invalidWall || !isFinite(wallHeight) || wallHeight < 0 || wallPoints.length < 2) {
                gui_writeLog("Skipped wall with invalid geometry.");
                return;
            }
            var wallObj = new Wall();
            wallObj.level = wallLevel;
            wallObj.points = wallPoints;
            wallObj.height = wallHeight;
            wallObj.heightAuthored = authoredWallHeight;
            wallObj.slopedHeight = hasPointHeights;
            wallPoints.forEach(function(point) { ptsx.push(point.x); ptsy.push(point.y); });
            aamap_add(wallObj);
            return;
        }

        if(tag === "floor") {
            if(typeof Floor === "undefined") {
                gui_writeLog("Skipped Floor because the floor tool did not load.");
                return;
            }
            var floorLevel = xml_parsePlacementLevel(this, defaultLevel);
            if(floorLevel === null) return;
            if(floorLevel === 0) {
                gui_writeLog("Ignored Floor on Level 0 because the base floor is implicit.");
                return;
            }
            var floorPoints = [];
            var invalidFloor = false;
            element.children("Point").each(function() {
                var point = {x:Number($(this).attr("x")), y:Number($(this).attr("y"))};
                if(!isFinite(point.x) || !isFinite(point.y)) invalidFloor = true;
                floorPoints.push(point);
            });
            if(invalidFloor || !floorTool_isSimplePolygon(floorPoints)) {
                gui_writeLog("Skipped Floor with invalid geometry.");
                return;
            }
            var floorObj = new Floor(floorLevel);
            floorObj.points = floorPoints;
            floorPoints.forEach(function(point) { ptsx.push(point.x); ptsy.push(point.y); });
            aamap_add(floorObj);
            return;
        }

        if(tag === "ramp") {
            if(element.parents("Level").length) {
                gui_writeLog("Skipped Ramp nested inside a Level; ramps must be direct Field children.");
                return;
            }
            if(typeof Ramp === "undefined") {
                gui_writeLog("Skipped Ramp because the ramp tool did not load.");
                return;
            }
            var rampPoints = [];
            element.children("Point").each(function() {
                rampPoints.push({x:Number($(this).attr("x")), y:Number($(this).attr("y"))});
            });
            var rawRampWidth = element.attr("width");
            if(rawRampWidth === undefined) rawRampWidth = element.attr("thickness");
            var rampWidth = rawRampWidth === undefined ? 4 : Number(rawRampWidth);
            var fromLevel = Number(element.attr("from_level"));
            var toLevel = Number(element.attr("to_level"));
            var validLevels = isFinite(fromLevel) && fromLevel >= 0 && Math.floor(fromLevel) === fromLevel &&
                isFinite(toLevel) && toLevel >= 0 && Math.floor(toLevel) === toLevel && fromLevel !== toLevel;
            var validPoints = (rampPoints.length === 2 || rampPoints.length === 4) &&
                rampPoints.every(function(point) { return isFinite(point.x) && isFinite(point.y); });
            if(!validPoints || !validLevels || (rampPoints.length === 2 && !(rampWidth > 0))) {
                gui_writeLog("Skipped Ramp with invalid geometry or floors.");
                return;
            }
            aamap_ensureLevel(fromLevel);
            aamap_ensureLevel(toLevel);
            var rampObj = xml_createRampFromData(rampPoints, rampWidth, fromLevel, toLevel);
            if(!ramp_geometryValid(rampObj.points)) {
                gui_writeLog("Skipped Ramp with degenerate or crossed geometry.");
                return;
            }
            aamap_add(rampObj);
            rampObj.points.forEach(function(point) { ptsx.push(point.x); ptsy.push(point.y); });
            return;
        }

        var zoneLevel = xml_parsePlacementLevel(this, defaultLevel);
        if(zoneLevel === null) return;
        var effect = xml_zoneKind(element.attr("kind") || element.attr("type") || element.attr("effect"));
        if(!supportedZoneTypes[effect]) {
            gui_writeLog("Skipped unsupported zone type '" + effect + "'.");
            return;
        }
        var circle = element.children("ShapeCircle").first();
        var rectangle = element.children("ShapeRectangle").first();
        var polygon = element.children("ShapePolygon").first();
        var line = element.children("ShapeLine").first();
        if(!circle.length && !rectangle.length && !polygon.length && !line.length) {
            gui_writeLog("Skipped zone without a supported shape.");
            return;
        }

        var x = 0, y = 0, radius = 0, growth = ZONE_DEFAULT_GROWTH;
        var option = 0;
        var details = {
            zoneName:effect,
            shapeType:circle.length ? "circle" : (rectangle.length ? "rectangle" : (polygon.length ? "polygon" : "line")),
            trigger:element.attr("trigger") || "",
            activeStartTick:element.attr("start_tick"),
            activeEndTick:element.attr("end_tick"),
            options:{}
        };

        var movementPathElement = element.children("MovementPath").first();
        var rawMovementSpeed = xml_firstAttribute(element, ["movement_speed", "movementSpeed"]);
        var rawRotationSpeed = xml_firstAttribute(element,
            ["rotation_speed", "rotationSpeed", "rotation"]);
        var hasMovementAttributes = rawMovementSpeed !== undefined || rawRotationSpeed !== undefined;
        if(hasMovementAttributes && !movementPathElement.length) {
            gui_writeLog("Skipped zone with movement settings but no MovementPath.");
            return;
        }
        if(movementPathElement.length) {
            details.movementSpeed = xml_number(rawMovementSpeed,
                typeof ZONE_TOOL_DEFAULT_MOVEMENT_SPEED === "number" ?
                    ZONE_TOOL_DEFAULT_MOVEMENT_SPEED : 20);
            details.rotationSpeed = xml_number(rawRotationSpeed,
                typeof ZONE_TOOL_DEFAULT_ROTATION_SPEED === "number" ?
                    ZONE_TOOL_DEFAULT_ROTATION_SPEED : 0);
            var rawMovementMode = String(movementPathElement.attr("mode") ||
                movementPathElement.attr("loop_mode") || "circular").toLowerCase()
                .replace(/-/g, "_");
            if(rawMovementMode === "pingpong") rawMovementMode = "ping_pong";
            if(rawMovementMode === "restart") rawMovementMode = "instant";
            if(rawMovementMode === "loop") rawMovementMode = "circular";
            details.movementMode = rawMovementMode;
            var rawSpawnAtVertices = String(
                movementPathElement.attr("spawn_at_vertices") || "false").toLowerCase();
            details.spawnAtVertices = rawSpawnAtVertices === "true" ||
                rawSpawnAtVertices === "1";
            details.movementPath = [];
            var rawLoop = String(movementPathElement.attr("loop") || "true").toLowerCase();
            var invalidMovementPath = !(details.movementSpeed > 0) ||
                !isFinite(details.rotationSpeed) ||
                ["circular", "ping_pong", "instant"].indexOf(details.movementMode) < 0 ||
                ["true", "false", "1", "0"].indexOf(rawLoop) < 0 ||
                ["true", "false", "1", "0"].indexOf(rawSpawnAtVertices) < 0;
            movementPathElement.children("Point").each(function() {
                var movementPoint = {x:Number($(this).attr("x")), y:Number($(this).attr("y"))};
                if(!isFinite(movementPoint.x) || !isFinite(movementPoint.y)) {
                    invalidMovementPath = true;
                }
                details.movementPath.push(movementPoint);
            });
            if(details.movementPath.length < 2 ||
                details.movementPath.every(function(point) {
                    return point.x === details.movementPath[0].x &&
                        point.y === details.movementPath[0].y;
                })) {
                invalidMovementPath = true;
            }
            if(invalidMovementPath) {
                gui_writeLog("Skipped zone with an invalid MovementPath.");
                return;
            }
            details.movementPath.forEach(function(point) {
                ptsx.push(point.x);
                ptsy.push(point.y);
            });
        }

        if(effect === "checkpoint") {
            if(element.attr("order") !== undefined) {
                option = Number(element.attr("order"));
                if(!xml_checkpoint_order_base_one) option += 1;
            }
            else {
                var legacyId = Number(element.find("Checkpoint").first().attr("id"));
                option = legacyId + 1;
            }
            if(!zoneTool_validCheckpointOrder(option)) {
                gui_writeLog("Skipped checkpoint zone with invalid order.");
                return;
            }
        } else if(effect === "speed") {
            details.options.delta_mps = xml_number(element.attr("delta_mps"), 5);
            details.options.duration_ticks = xml_number(
                element.attr("duration_ticks") !== undefined ?
                    element.attr("duration_ticks") : element.attr("duration"), 90);
        } else if(effect === "rubber") {
            // Canonical maps use health rather than the C++ rubber resource.
            // The effects have opposite sign conventions, so migration
            // negates every explicit/implicit legacy value.
            details.zoneName = "health";
            details.options.delta = -xml_number(element.attr("delta") !== undefined ?
                element.attr("delta") : element.attr("value"), 500);
            effect = "health";
            gui_writeLog("Converted legacy rubber zone to a health zone and inverted its value.");
        } else if(effect === "health") {
            details.options.delta = Number(element.attr("delta") !== undefined ?
                element.attr("delta") : element.attr("value"));
            if(!isFinite(details.options.delta)) {
                gui_writeLog("Skipped health zone with an invalid delta.");
                return;
            }
        } else if(effect === "setting") {
            details.options.setting = String(element.attr("setting") || "").toUpperCase();
            details.options.value = Number(element.attr("value"));
            var settingError = zoneTool_settingValidationError(
                details.options.setting, details.options.value);
            if(settingError) {
                gui_writeLog("Skipped setting zone: " + settingError);
                return;
            }
        } else if(effect === "teleport") {
            details.options.destination_x = Number(element.attr("destination_x"));
            details.options.destination_y = Number(element.attr("destination_y"));
            var rawDestinationLevel = element.attr("destination_level");
            details.options.destination_level = rawDestinationLevel === undefined ?
                zoneLevel : Number(rawDestinationLevel);
            if(!isFinite(details.options.destination_x) ||
                !isFinite(details.options.destination_y) ||
                !isFinite(details.options.destination_level) || details.options.destination_level < 0 ||
                Math.floor(details.options.destination_level) !== details.options.destination_level) {
                gui_writeLog("Skipped teleport zone with an invalid destination.");
                return;
            }
            aamap_ensureLevel(details.options.destination_level);
            if(element.attr("angle") !== undefined) details.options.angle = Number(element.attr("angle"));
            else if(element.attr("direction") !== undefined) details.options.direction = element.attr("direction");
            else if(element.attr("xdir") !== undefined || element.attr("ydir") !== undefined) {
                details.options.xdir = xml_number(element.attr("xdir"), 1);
                details.options.ydir = xml_number(element.attr("ydir"), 0);
            } else details.options.direction = "east";
        }

        if(circle.length) {
            var rawRadius = circle.attr("radius");
            if(rawRadius === undefined) rawRadius = circle.attr("scale");
            radius = rawRadius === undefined ? 1 : Number(rawRadius);
            growth = xml_number(circle.attr("growth"), ZONE_DEFAULT_GROWTH);
            var center = circle.children("Point").first();
            x = Number(center.attr("x"));
            y = Number(center.attr("y"));
            if(!(radius > 0) || !isFinite(growth) || !isFinite(x) || !isFinite(y)) {
                gui_writeLog("Skipped zone with invalid circle geometry.");
                return;
            }
            var extent = radius + Math.abs(growth);
            ptsx.push(x - extent, x + extent);
            ptsy.push(y - extent, y + extent);
        } else if(rectangle.length) {
            details.minx = Number(rectangle.attr("minx"));
            details.miny = Number(rectangle.attr("miny"));
            details.maxx = Number(rectangle.attr("maxx"));
            details.maxy = Number(rectangle.attr("maxy"));
            if(!isFinite(details.minx) || !isFinite(details.miny) || !isFinite(details.maxx) ||
                !isFinite(details.maxy) || details.minx === details.maxx || details.miny === details.maxy) {
                gui_writeLog("Skipped zone with invalid rectangle geometry.");
                return;
            }
            x = (details.minx + details.maxx) / 2;
            y = (details.miny + details.maxy) / 2;
            ptsx.push(details.minx, details.maxx);
            ptsy.push(details.miny, details.maxy);
        } else if(polygon.length) {
            details.polygonScale = xml_number(polygon.attr("scale"), 1);
            var polygonPoints = polygon.children("Point");
            var origin = polygonPoints.first();
            x = Number(origin.attr("x"));
            y = Number(origin.attr("y"));
            details.polygonPoints = [];
            var invalidPolygon = !isFinite(x) || !isFinite(y) || details.polygonScale === 0;
            polygonPoints.slice(1).each(function() {
                var localX = Number($(this).attr("x"));
                var localY = Number($(this).attr("y"));
                if(!isFinite(localX) || !isFinite(localY)) invalidPolygon = true;
                details.polygonPoints.push({x:localX, y:localY});
                ptsx.push(x + localX * details.polygonScale);
                ptsy.push(y + localY * details.polygonScale);
            });
            if(invalidPolygon || details.polygonPoints.length < ZONE_TOOL_MIN_POLYGON_POINTS) {
                gui_writeLog("Skipped polygon zone with invalid geometry.");
                return;
            }
        } else {
            var endpoints = [];
            line.children("Point").each(function() {
                endpoints.push({x:Number($(this).attr("x")), y:Number($(this).attr("y"))});
            });
            var rawLineWidth = line.attr("width");
            if(rawLineWidth === undefined) rawLineWidth = line.attr("thickness");
            details.lineWidth = rawLineWidth === undefined ? 1 : Number(rawLineWidth);
            if(endpoints.length !== 2 || details.lineWidth < 0 || !isFinite(details.lineWidth) ||
                !isFinite(endpoints[0].x) || !isFinite(endpoints[0].y) ||
                !isFinite(endpoints[1].x) || !isFinite(endpoints[1].y) ||
                (endpoints[0].x === endpoints[1].x && endpoints[0].y === endpoints[1].y)) {
                gui_writeLog("Skipped zone with invalid ShapeLine geometry.");
                return;
            }
            details.lineStart = endpoints[0];
            details.lineEnd = endpoints[1];
            x = (endpoints[0].x + endpoints[1].x) / 2;
            y = (endpoints[0].y + endpoints[1].y) / 2;
            radius = Math.hypot(endpoints[1].x - endpoints[0].x,
                endpoints[1].y - endpoints[0].y, details.lineWidth) / 2;
            zone_lineFootprintPoints(endpoints[0], endpoints[1], details.lineWidth)
                .forEach(function(point) {
                    ptsx.push(point.x);
                    ptsy.push(point.y);
                });
        }

        var zoneObj = new Zone(x, y, radius, growth, zoneTool_whatType[effect], option, details);
        zoneObj.level = zoneLevel;
        aamap_add(zoneObj);
    });

    return [ptsx, ptsy];
}

function xml_write() {

}

function xml_load() {

    if (window.File && window.FileReader && window.FileList && window.Blob) {
        gui_writeLog("File reading supported by your browser. Good. Clearing old map");
        vectron_render();
    } else {
        gui_writeLog("And you can't read files D:. Get chrome.");
    }
}

function xml_handle(evt) {
    if(!evt.target.files.length) return;
    xml_handleFile(evt.target.files[0]);
}

function xml_handleFile(file) {
    var reader = new FileReader();
    var thisReadId = ++xml_latest_read_id;
    gui_writeLog("Loading.");
    reader.onload = function(evt) {
       if(thisReadId !== xml_latest_read_id) return;
       var parsed;
       var isNative = String(file.name || "").toLowerCase().endsWith(".armamap") ||
           String(this.result || "").trim().charAt(0) === "{";
       try {
           parsed = isNative ?
               $.parseXML(armamap_toCompatibilityXml(JSON.parse(this.result))) :
               $.parseXML(this.result);
       } catch(error) {
           gui_writeLog("Could not parse map file: " + error.message);
           return;
       }
       if(typeof codeViewer_setSourceFormat === "function") {
           codeViewer_setSourceFormat(isNative ? "armamap" : "legacy-xml");
       }
       vectron_forceSelectTool();
       aamap_objects.forEach(aamap_removeObjectVisuals);
       aamap_objects = [];
       xml_process(parsed);
       if(typeof codeViewer_onMapLoaded === "function") codeViewer_onMapLoaded();
    };
    reader.onerror = function() {
       if(thisReadId !== xml_latest_read_id) return;
       gui_writeLog("Could not read map file.");
    };
    reader.readAsText(file);
}
