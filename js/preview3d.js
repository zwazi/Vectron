/*
 * Lightweight software 3D preview for Vectron.
 *
 * This intentionally uses the browser canvas instead of the Rust gameplay
 * renderer: the editor remains a static web app, while the world dimensions,
 * free-camera controls, and optional ASE cycle model match the client.
 */

var PREVIEW3D_NORMAL_SPEED = 54;
var PREVIEW3D_FAST_SPEED = 270;
var PREVIEW3D_MOUSE_SENSITIVITY = 0.0035;
var PREVIEW3D_CYCLE_SCALE = 0.05;
var PREVIEW3D_CYCLE_DIRECTION = -1;
var PREVIEW3D_CYCLE_HEIGHT = 20.777014 * PREVIEW3D_CYCLE_SCALE;
var PREVIEW3D_CYCLE_FLOOR_CLEARANCE = -0.016;
var PREVIEW3D_NEAR = 0.08;
var PREVIEW3D_DEFAULT_RIM_HEIGHT = 4;
var PREVIEW3D_RIM_COLOR = "#394959";
var PREVIEW3D_RIM_ALPHA = 0.72;
var PREVIEW3D_RIM_TOP_COLOR = "#9ab2c8";
var PREVIEW3D_RIM_TOP_ALPHA = 0.9;

var preview3d_canvas = null;
var preview3d_context = null;
var preview3d_scene = null;
var preview3d_opened = false;
var preview3d_frame = null;
var preview3d_lastFrameTime = 0;
var preview3d_keys = {};
var preview3d_dragging = false;
var preview3d_lastPointer = null;
var preview3d_cycleMesh = null;
var preview3d_cycleMeshRequested = false;
var preview3d_animationElapsedSeconds = 0;
var preview3d_camera = {x:0, y:-30, z:18, yaw:0, pitch:-0.35, fov:68};

function preview3d_levelElevation(level, heights) {
    level = Math.max(0, Math.floor(Number(level) || 0));
    heights = heights || (typeof xml_level_heights !== "undefined" ? xml_level_heights : []);
    var elevation = 0;
    for(var gap = 0; gap < level; gap++) {
        var height = Number(heights[gap]);
        elevation += isFinite(height) && height > 0 ? height : 8;
    }
    return elevation;
}

function preview3d_parseAse(text) {
    var vertices = [];
    var faces = [];
    var vertexPattern = /^\s*\*MESH_VERTEX\s+(\d+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gm;
    var facePattern = /^\s*\*MESH_FACE\s+(\d+):\s+A:\s*(\d+)\s+B:\s*(\d+)\s+C:\s*(\d+)/gm;
    var match;
    while((match = vertexPattern.exec(String(text || "")))) {
        vertices[Number(match[1])] = [Number(match[2]), Number(match[3]), Number(match[4])];
    }
    while((match = facePattern.exec(String(text || "")))) {
        faces.push([Number(match[2]), Number(match[3]), Number(match[4])]);
    }
    if(!vertices.length || !faces.length) return null;

    var edgeMap = {};
    var edges = [];
    faces.forEach(function(face) {
        [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]].forEach(function(edge) {
            var low = Math.min(edge[0], edge[1]);
            var high = Math.max(edge[0], edge[1]);
            var key = low + ":" + high;
            if(!edgeMap[key] && vertices[low] && vertices[high]) {
                edgeMap[key] = true;
                edges.push([low, high]);
            }
        });
    });
    return {vertices:vertices, faces:faces, edges:edges};
}

function preview3d_cycleWorldVertex(local, spawn, elevation) {
    var forwardX = Number(spawn.xDir);
    var forwardY = Number(spawn.yDir);
    var directionLength = Math.hypot(forwardX, forwardY);
    if(!isFinite(directionLength) || directionLength < 1e-9) {
        forwardX = 1;
        forwardY = 0;
    } else {
        forwardX /= directionLength;
        forwardY /= directionLength;
    }
    var leftX = forwardY;
    var leftY = -forwardX;
    var localForward = local[0] * PREVIEW3D_CYCLE_SCALE * PREVIEW3D_CYCLE_DIRECTION;
    var localLeft = local[1] * PREVIEW3D_CYCLE_SCALE;
    var localUp = local[2] * PREVIEW3D_CYCLE_SCALE;
    return [
        Number(spawn.x) + forwardX * localForward + leftX * localLeft,
        Number(spawn.y) + forwardY * localForward + leftY * localLeft,
        elevation + PREVIEW3D_CYCLE_FLOOR_CLEARANCE + localUp
    ];
}

function preview3d_cameraPoint(point, camera) {
    var dx = point[0] - camera.x;
    var dy = point[1] - camera.y;
    var dz = point[2] - camera.z;
    // This is the same horizontal convention as the client free camera:
    // forward = [sin(yaw), cos(yaw)].
    var forwardX = Math.sin(camera.yaw);
    var forwardY = Math.cos(camera.yaw);
    var rightX = -forwardY;
    var rightY = forwardX;
    var horizontalForward = dx * forwardX + dy * forwardY;
    var cameraRight = dx * rightX + dy * rightY;
    var pitchCos = Math.cos(camera.pitch);
    var pitchSin = Math.sin(camera.pitch);
    var depth = horizontalForward * pitchCos + dz * pitchSin;
    var cameraUp = dz * pitchCos - horizontalForward * pitchSin;
    return {right:cameraRight, up:cameraUp, depth:depth};
}

function preview3d_projectCameraPoint(point, camera, width, height) {
    if(!point || point.depth < PREVIEW3D_NEAR) return null;
    var focal = (height / 2) / Math.tan((camera.fov || 68) * Math.PI / 360);
    return {
        x:width / 2 + point.right * focal / point.depth,
        y:height / 2 - point.up * focal / point.depth,
        depth:point.depth
    };
}

function preview3d_projectPoint(point, camera, width, height) {
    return preview3d_projectCameraPoint(preview3d_cameraPoint(point, camera), camera, width, height);
}

function preview3d_interpolateCameraPoint(a, b, t) {
    return {
        right:a.right + (b.right - a.right) * t,
        up:a.up + (b.up - a.up) * t,
        depth:a.depth + (b.depth - a.depth) * t
    };
}

function preview3d_clipProjectPolygon(points, camera, width, height) {
    var input = points.map(function(point) { return preview3d_cameraPoint(point, camera); });
    var output = [];
    for(var i = 0; i < input.length; i++) {
        var current = input[i];
        var previous = input[(i + input.length - 1) % input.length];
        var currentInside = current.depth >= PREVIEW3D_NEAR;
        var previousInside = previous.depth >= PREVIEW3D_NEAR;
        if(currentInside !== previousInside) {
            var t = (PREVIEW3D_NEAR - previous.depth) / (current.depth - previous.depth);
            var intersection = preview3d_interpolateCameraPoint(previous, current, t);
            intersection.depth = PREVIEW3D_NEAR;
            output.push(intersection);
        }
        if(currentInside) output.push(current);
    }
    return output.map(function(point) {
        return preview3d_projectCameraPoint(point, camera, width, height);
    }).filter(Boolean);
}

function preview3d_clipProjectLine(a, b, camera, width, height) {
    var start = preview3d_cameraPoint(a, camera);
    var end = preview3d_cameraPoint(b, camera);
    if(start.depth < PREVIEW3D_NEAR && end.depth < PREVIEW3D_NEAR) return null;
    if(start.depth < PREVIEW3D_NEAR || end.depth < PREVIEW3D_NEAR) {
        var behind = start.depth < PREVIEW3D_NEAR ? start : end;
        var ahead = start.depth < PREVIEW3D_NEAR ? end : start;
        var t = (PREVIEW3D_NEAR - behind.depth) / (ahead.depth - behind.depth);
        var clipped = preview3d_interpolateCameraPoint(behind, ahead, t);
        clipped.depth = PREVIEW3D_NEAR;
        if(start.depth < PREVIEW3D_NEAR) start = clipped;
        else end = clipped;
    }
    return {
        a:preview3d_projectCameraPoint(start, camera, width, height),
        b:preview3d_projectCameraPoint(end, camera, width, height)
    };
}

function preview3d_newScene() {
    return {lines:[], triangles:[], dynamicZones:[], bounds:null};
}

function preview3d_extendBounds(scene, point) {
    if(!point || !point.every(isFinite)) return;
    if(!scene.bounds) {
        scene.bounds = {min:[point[0], point[1], point[2]], max:[point[0], point[1], point[2]]};
        return;
    }
    for(var axis = 0; axis < 3; axis++) {
        scene.bounds.min[axis] = Math.min(scene.bounds.min[axis], point[axis]);
        scene.bounds.max[axis] = Math.max(scene.bounds.max[axis], point[axis]);
    }
}

function preview3d_addLine(scene, a, b, color, width, alpha) {
    if(!a || !b || !a.every(isFinite) || !b.every(isFinite)) return;
    scene.lines.push({a:a, b:b, color:color || "#9bb4d0", width:width || 1, alpha:alpha === undefined ? 1 : alpha});
    preview3d_extendBounds(scene, a);
    preview3d_extendBounds(scene, b);
}

function preview3d_addTriangle(scene, a, b, c, color, alpha) {
    if(!a || !b || !c || !a.every(isFinite) || !b.every(isFinite) || !c.every(isFinite)) return;
    scene.triangles.push({a:a, b:b, c:c, color:color || "#25364a", alpha:alpha === undefined ? 0.45 : alpha});
    preview3d_extendBounds(scene, a);
    preview3d_extendBounds(scene, b);
    preview3d_extendBounds(scene, c);
}

function preview3d_addBillboard(scene, billboard) {
    var start = billboard.start, end = billboard.end;
    var dx = Number(end.x) - Number(start.x);
    var dy = Number(end.y) - Number(start.y);
    var width = Math.hypot(dx, dy);
    if(!isFinite(width) || width < 1e-9) return;
    // External image dimensions are deliberately not fetched by the editor's
    // software preview. A 2:1 placeholder still communicates placement,
    // elevation, facing, and one/two-sided visibility accurately.
    var bottom = preview3d_levelElevation(billboard.level) + Number(billboard.height || 0);
    var top = bottom + width / 2;
    var bottomStart = [Number(start.x), Number(start.y), bottom];
    var bottomEnd = [Number(end.x), Number(end.y), bottom];
    var topStart = [Number(start.x), Number(start.y), top];
    var topEnd = [Number(end.x), Number(end.y), top];
    var side = billboard.facing === "left" ? 1 : -1;
    var normal = [-dy / width * side, dx / width * side, 0];
    var triangleStart = scene.triangles.length;
    preview3d_addTriangle(scene, bottomStart, bottomEnd, topEnd, "#287d91", 0.72);
    preview3d_addTriangle(scene, bottomStart, topEnd, topStart, "#287d91", 0.72);
    for(var index = triangleStart; index < scene.triangles.length; index++) {
        scene.triangles[index].frontNormal = normal;
        scene.triangles[index].dualSided = !!billboard.dualSided;
        scene.triangles[index].center = [
            (Number(start.x) + Number(end.x)) / 2,
            (Number(start.y) + Number(end.y)) / 2,
            (bottom + top) / 2
        ];
    }
    preview3d_addLine(scene, bottomStart, bottomEnd, "#48e8ff", 1.7, 0.95);
    preview3d_addLine(scene, bottomEnd, topEnd, "#48e8ff", 1.7, 0.95);
    preview3d_addLine(scene, topEnd, topStart, "#48e8ff", 1.7, 0.95);
    preview3d_addLine(scene, topStart, bottomStart, "#48e8ff", 1.7, 0.95);
    var center = [(start.x + end.x) / 2, (start.y + end.y) / 2, bottom];
    var arrowLength = Math.min(6, Math.max(1, width * 0.24));
    preview3d_addLine(scene, center,
        [center[0] + normal[0] * arrowLength,
            center[1] + normal[1] * arrowLength, center[2]],
        "#48e8ff", 1.4, 0.9);
}

/** Uses the same geometry and palette for ordinary rims and sloped ramp rails. */
function preview3d_addRimWall(scene, a, b, heightA, heightB) {
    heightA = Number(heightA);
    heightB = heightB === undefined ? heightA : Number(heightB);
    if(!isFinite(heightA) || !isFinite(heightB) || heightA < 0 || heightB < 0 ||
        (heightA === 0 && heightB === 0)) return;
    var topA = [a[0], a[1], a[2] + heightA];
    var topB = [b[0], b[1], b[2] + heightB];
    preview3d_addTriangle(scene, a, b, topB, PREVIEW3D_RIM_COLOR, PREVIEW3D_RIM_ALPHA);
    preview3d_addTriangle(scene, a, topB, topA, PREVIEW3D_RIM_COLOR, PREVIEW3D_RIM_ALPHA);
    preview3d_addLine(scene, topA, topB, PREVIEW3D_RIM_TOP_COLOR, 1.1, PREVIEW3D_RIM_TOP_ALPHA);
}

/** Mirrors map loading: the first authored wall height wins, then RIM_HEIGHT. */
function preview3d_configuredRimHeight(objects) {
    objects = objects || [];
    for(var objectIndex = 0; objectIndex < objects.length; objectIndex++) {
        var object = objects[objectIndex];
        if(typeof Wall !== "undefined" && object instanceof Wall) {
            var wallHeight = Number(object.height);
            if(isFinite(wallHeight) && wallHeight >= 0) return wallHeight;
        }
    }
    var settings = typeof xml_settings !== "undefined" ? xml_settings : [];
    for(var settingIndex = 0; settingIndex < settings.length; settingIndex++) {
        var match = String(settings[settingIndex]).match(/^\s*RIM_HEIGHT\s+(.+?)\s*$/i);
        if(!match) continue;
        var settingHeight = Number(match[1]);
        if(isFinite(settingHeight) && settingHeight >= 0) return settingHeight;
    }
    var defaultHeight = typeof xml_wallheight !== "undefined" ? Number(xml_wallheight) : NaN;
    return isFinite(defaultHeight) && defaultHeight >= 0 ? defaultHeight : PREVIEW3D_DEFAULT_RIM_HEIGHT;
}

function preview3d_polygonOutline(scene, points, z, color, width, alpha) {
    if(!points || points.length < 2) return;
    for(var i = 0; i < points.length; i++) {
        var next = (i + 1) % points.length;
        preview3d_addLine(scene, [points[i].x, points[i].y, z],
            [points[next].x, points[next].y, z], color, width, alpha);
    }
}

function preview3d_polygonSignedArea(points) {
    var area = 0;
    for(var i = 0; i < points.length; i++) {
        var next = points[(i + 1) % points.length];
        area += points[i].x * next.y - next.x * points[i].y;
    }
    return area / 2;
}

function preview3d_triangleCross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function preview3d_pointInTriangle(point, a, b, c) {
    var epsilon = 1e-9;
    var ab = preview3d_triangleCross(a, b, point);
    var bc = preview3d_triangleCross(b, c, point);
    var ca = preview3d_triangleCross(c, a, point);
    var hasNegative = ab < -epsilon || bc < -epsilon || ca < -epsilon;
    var hasPositive = ab > epsilon || bc > epsilon || ca > epsilon;
    return !(hasNegative && hasPositive);
}

/** Ear-clips a validated simple polygon, including concave floor outlines. */
function preview3d_triangulatePolygon(points) {
    var clean = [];
    (points || []).forEach(function(point) {
        var normalized = {x:Number(point.x), y:Number(point.y)};
        var previous = clean[clean.length - 1];
        if(isFinite(normalized.x) && isFinite(normalized.y) &&
            (!previous || previous.x !== normalized.x || previous.y !== normalized.y)) clean.push(normalized);
    });
    if(clean.length > 1 && clean[0].x === clean[clean.length - 1].x &&
        clean[0].y === clean[clean.length - 1].y) clean.pop();

    var removed = true;
    while(removed && clean.length > 3) {
        removed = false;
        for(var cleanIndex = 0; cleanIndex < clean.length; cleanIndex++) {
            var before = clean[(cleanIndex + clean.length - 1) % clean.length];
            var current = clean[cleanIndex];
            var after = clean[(cleanIndex + 1) % clean.length];
            if(Math.abs(preview3d_triangleCross(before, current, after)) <= 1e-9) {
                clean.splice(cleanIndex, 1);
                removed = true;
                break;
            }
        }
    }
    if(clean.length < 3) return [];
    var orientation = preview3d_polygonSignedArea(clean) >= 0 ? 1 : -1;
    var indices = clean.map(function(_, index) { return index; });
    var triangles = [];
    var guard = clean.length * clean.length;
    while(indices.length > 3 && guard-- > 0) {
        var earFound = false;
        for(var i = 0; i < indices.length; i++) {
            var previousIndex = indices[(i + indices.length - 1) % indices.length];
            var currentIndex = indices[i];
            var nextIndex = indices[(i + 1) % indices.length];
            var a = clean[previousIndex], b = clean[currentIndex], c = clean[nextIndex];
            if(preview3d_triangleCross(a, b, c) * orientation <= 1e-9) continue;
            var containsPoint = false;
            for(var candidateIndex = 0; candidateIndex < indices.length; candidateIndex++) {
                var candidate = indices[candidateIndex];
                if(candidate === previousIndex || candidate === currentIndex || candidate === nextIndex) continue;
                if(preview3d_pointInTriangle(clean[candidate], a, b, c)) {
                    containsPoint = true;
                    break;
                }
            }
            if(containsPoint) continue;
            triangles.push([a, b, c]);
            indices.splice(i, 1);
            earFound = true;
            break;
        }
        if(!earFound) return [];
    }
    if(indices.length === 3) {
        triangles.push([clean[indices[0]], clean[indices[1]], clean[indices[2]]]);
    }
    return triangles;
}

function preview3d_fillPolygon(scene, points, z, color, alpha) {
    if(!points || points.length < 3) return;
    preview3d_triangulatePolygon(points).forEach(function(triangle) {
        preview3d_addTriangle(scene,
            [triangle[0].x, triangle[0].y, z],
            [triangle[1].x, triangle[1].y, z],
            [triangle[2].x, triangle[2].y, z], color, alpha);
    });
    preview3d_polygonOutline(scene, points, z + 0.01, "#66a4d8", 1.2, 0.75);
}

function preview3d_pointInPolygon(point, polygon) {
    var inside = false;
    for(var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var a = polygon[i], b = polygon[j];
        if((a.y > point.y) !== (b.y > point.y) &&
            point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function preview3d_clipLineToPolygon(a, b, polygon) {
    var ts = [0, 1];
    var rx = b.x - a.x, ry = b.y - a.y;
    for(var i = 0; i < polygon.length; i++) {
        var p = polygon[i], q = polygon[(i + 1) % polygon.length];
        var sx = q.x - p.x, sy = q.y - p.y;
        var denominator = rx * sy - ry * sx;
        if(Math.abs(denominator) <= 1e-9) continue;
        var qx = p.x - a.x, qy = p.y - a.y;
        var t = (qx * sy - qy * sx) / denominator;
        var u = (qx * ry - qy * rx) / denominator;
        if(t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort(function(left, right) { return left - right; });
    var segments = [];
    for(var index = 0; index < ts.length - 1; index++) {
        var middle = (ts[index] + ts[index + 1]) / 2;
        if(preview3d_pointInPolygon({x:a.x + rx * middle, y:a.y + ry * middle}, polygon)) {
            segments.push([
                {x:a.x + rx * ts[index], y:a.y + ry * ts[index]},
                {x:a.x + rx * ts[index + 1], y:a.y + ry * ts[index + 1]}
            ]);
        }
    }
    return segments;
}

function preview3d_objectBounds(objects) {
    var result = null;
    (objects || []).forEach(function(object) {
        // Level 0 is the implicit legacy arena floor. A stale authored base
        // Floor is a no-op and must not change the preview's arena bounds.
        if(typeof Floor !== "undefined" && object instanceof Floor && object.level === 0) return;
        var bounds = typeof object.getBounds === "function" ? object.getBounds() : null;
        if(!bounds && isFinite(object.x) && isFinite(object.y)) {
            bounds = {minx:Number(object.x), miny:Number(object.y), maxx:Number(object.x), maxy:Number(object.y)};
        }
        if(!bounds) return;
        if(!result) result = {minx:bounds.minx, miny:bounds.miny, maxx:bounds.maxx, maxy:bounds.maxy};
        else {
            result.minx = Math.min(result.minx, bounds.minx);
            result.miny = Math.min(result.miny, bounds.miny);
            result.maxx = Math.max(result.maxx, bounds.maxx);
            result.maxy = Math.max(result.maxy, bounds.maxy);
        }
    });
    if(!result) result = {minx:-24, miny:-24, maxx:24, maxy:24};
    var padding = Math.max(8, Math.max(result.maxx - result.minx, result.maxy - result.miny) * 0.08);
    result.minx -= padding; result.miny -= padding;
    result.maxx += padding; result.maxy += padding;
    return result;
}

function preview3d_visibleLevel(level) {
    if(typeof aamap_levelExistsAt === "function" && !aamap_levelExistsAt(level)) return false;
    return typeof aamap_levelVisible === "undefined" || aamap_levelVisible[level] !== false;
}

function preview3d_levelPolygons(objects, level, explicitFloorsOnly) {
    var polygons = [];
    (objects || []).forEach(function(object) {
        var points = null;
        // Mapper-authored floor polygons apply only above the implicit base
        // arena, matching gameplay floor generation.
        if(level > 0 && typeof Floor !== "undefined" && object instanceof Floor && object.level === level) {
            points = object.points;
        } else if(!explicitFloorsOnly && typeof Wall !== "undefined" && object instanceof Wall &&
            object.level === level && object.points.length >= 4) {
            var first = object.points[0];
            var last = object.points[object.points.length - 1];
            if(Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) points = object.points.slice(0, -1);
        }
        if(points && points.length >= 3) polygons.push(points);
    });
    return polygons;
}

function preview3d_addLevelGrid(scene, bounds, level, polygons, fullGrid) {
    var z = preview3d_levelElevation(level) + 0.004;
    var span = Math.max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny);
    var authoredSpacing = typeof vectron_grid_spacing === "number" && vectron_grid_spacing > 0 ? vectron_grid_spacing : 8;
    var spacing = Math.max(authoredSpacing, span / 55);
    var minX = Math.floor(bounds.minx / spacing) * spacing;
    var maxX = Math.ceil(bounds.maxx / spacing) * spacing;
    var minY = Math.floor(bounds.miny / spacing) * spacing;
    var maxY = Math.ceil(bounds.maxy / spacing) * spacing;

    function addCandidate(a, b, major) {
        if(fullGrid) {
            preview3d_addLine(scene, [a.x, a.y, z], [b.x, b.y, z],
                major ? "#31577b" : "#254057", major ? 1.1 : 0.7, major ? 0.72 : 0.48);
            return;
        }
        polygons.forEach(function(polygon) {
            preview3d_clipLineToPolygon(a, b, polygon).forEach(function(segment) {
                preview3d_addLine(scene, [segment[0].x, segment[0].y, z],
                    [segment[1].x, segment[1].y, z],
                    major ? "#568db8" : "#345d7d", major ? 1.1 : 0.7, major ? 0.8 : 0.58);
            });
        });
    }

    var index = 0;
    for(var x = minX; x <= maxX + spacing * 0.5; x += spacing, index++) {
        addCandidate({x:x, y:minY}, {x:x, y:maxY}, index % 10 === 0);
    }
    index = 0;
    for(var y = minY; y <= maxY + spacing * 0.5; y += spacing, index++) {
        addCandidate({x:minX, y:y}, {x:maxX, y:y}, index % 10 === 0);
    }
}

function preview3d_zoneColor(zone) {
    var colors = {
        death:"#ff4f55", win:"#45e66c", rubber:"#ffc94a", health:"#35d66f",
        setting:"#ff7a24",
        checkpoint:"#ffffff", speed:"#4fb8ff", teleport:"#ff9945"
    };
    return colors[zone.zoneName] || "#b7c4d2";
}

function preview3d_motionSegments(path, mode) {
    var segments = [];
    for(var index = 1; index < path.length; index++) {
        segments.push({start:path[index - 1], end:path[index]});
    }
    if(mode === "circular" && path.length >= 2) {
        segments.push({start:path[path.length - 1], end:path[0]});
    } else if(mode === "ping_pong") {
        for(var reverseIndex = path.length - 1; reverseIndex > 0; reverseIndex--) {
            segments.push({start:path[reverseIndex], end:path[reverseIndex - 1]});
        }
    }
    return segments;
}

function preview3d_closedPathPosition(path, speed, seconds, mode) {
    path = (path || []).filter(function(point) {
        return point && isFinite(Number(point.x)) && isFinite(Number(point.y));
    }).map(function(point) { return {x:Number(point.x), y:Number(point.y)}; });
    if(!path.length) return {x:0, y:0};
    speed = Number(speed);
    seconds = Number(seconds);
    if(path.length < 2 || !isFinite(speed) || speed <= 0 || !isFinite(seconds)) {
        return {x:path[0].x, y:path[0].y};
    }
    mode = ["circular", "ping_pong", "instant"].indexOf(mode) >= 0 ? mode : "circular";
    var segments = preview3d_motionSegments(path, mode);
    var totalLength = 0;
    segments = segments.filter(function(segment) {
        segment.length = Math.hypot(segment.end.x - segment.start.x,
            segment.end.y - segment.start.y);
        totalLength += segment.length;
        return segment.length > 1e-9;
    });
    if(totalLength <= 1e-9) return {x:path[0].x, y:path[0].y};
    var distance = ((speed * seconds) % totalLength + totalLength) % totalLength;
    for(var segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        var segment = segments[segmentIndex];
        if(distance <= segment.length || segmentIndex === segments.length - 1) {
            var fraction = Math.min(1, distance / segment.length);
            return {
                x:segment.start.x + (segment.end.x - segment.start.x) * fraction,
                y:segment.start.y + (segment.end.y - segment.start.y) * fraction
            };
        }
        distance -= segment.length;
    }
    return {x:path[0].x, y:path[0].y};
}

function preview3d_pulseRadius(motion, seconds) {
    var path = motion.path || [];
    var radii = motion.pulseRadii || [];
    if(path.length < 2 || radii.length !== path.length) return null;
    var vertexDistances = [0], forwardLength = 0;
    for(var index = 1; index < path.length; index++) {
        forwardLength += Math.hypot(path[index].x - path[index - 1].x,
            path[index].y - path[index - 1].y);
        vertexDistances.push(forwardLength);
    }
    var keys = radii.map(function(radius, index) {
        radius = radius === null || radius === undefined ? null : Number(radius);
        return radius !== null && isFinite(radius) && radius > 0 ?
            {distance:vertexDistances[index], radius:radius} : null;
    }).filter(Boolean);
    if(keys.length < 2 || forwardLength <= 1e-9) return null;
    var segments = preview3d_motionSegments(path, motion.mode);
    var totalLength = segments.reduce(function(total, segment) {
        return total + Math.hypot(segment.end.x - segment.start.x,
            segment.end.y - segment.start.y);
    }, 0);
    if(totalLength <= 1e-9) return keys[0].radius;
    var position = ((Number(motion.speed) * Number(seconds)) % totalLength + totalLength) %
        totalLength;
    if(motion.mode === "ping_pong" && position > forwardLength) {
        position = totalLength - position;
    }
    if(motion.mode !== "circular") position = Math.min(forwardLength, position);
    position = Math.max(0, position);
    var interpolate = function(start, end, sample) {
        var length = end.distance - start.distance;
        if(length <= 1e-9) return end.radius;
        var amount = (sample - start.distance) / length;
        return start.radius + (end.radius - start.radius) * amount;
    };
    if(motion.mode === "circular") {
        if(position < keys[0].distance) {
            return interpolate(keys[keys.length - 1], {
                distance:keys[0].distance + totalLength, radius:keys[0].radius
            }, position + totalLength);
        }
        if(position >= keys[keys.length - 1].distance) {
            return interpolate(keys[keys.length - 1], {
                distance:keys[0].distance + totalLength, radius:keys[0].radius
            }, position);
        }
    } else {
        if(position <= keys[0].distance) return keys[0].radius;
        if(position >= keys[keys.length - 1].distance) return keys[keys.length - 1].radius;
    }
    for(var keyIndex = 1; keyIndex < keys.length; keyIndex++) {
        if(position <= keys[keyIndex].distance) {
            return interpolate(keys[keyIndex - 1], keys[keyIndex], position);
        }
    }
    return keys[keys.length - 1].radius;
}

function preview3d_transformMovingZonePoint(point, motion, seconds) {
    var path = motion.path || [];
    if(!path.length) return point.slice();
    var anchor = path[0];
    var position = preview3d_closedPathPosition(path, motion.speed, seconds, motion.mode);
    var angle = Number(motion.rotationSpeed) * Number(seconds) * Math.PI / 180;
    if(!isFinite(angle)) angle = 0;
    var cosine = Math.cos(angle), sine = Math.sin(angle);
    var scale = 1;
    if(motion.mode === "instant") {
        var segments = preview3d_motionSegments(path, motion.mode);
        var totalLength = segments.reduce(function(total, segment) {
            return total + Math.hypot(segment.end.x - segment.start.x,
                segment.end.y - segment.start.y);
        }, 0);
        var speed = Number(motion.speed);
        var period = totalLength / speed;
        if(isFinite(period) && period > 0 && Number(seconds) >= period) {
            scale = Math.min(1, (((Number(seconds) % period) + period) % period) /
                0.5);
        }
    }
    var pulseRadius = preview3d_pulseRadius(motion, seconds);
    if(pulseRadius !== null && Number(motion.baseRadius) > 0) {
        // Explicit circle pulse keyframes own size; instant mode's legacy
        // restart regrowth is used only by non-pulsing zones.
        scale = pulseRadius / Number(motion.baseRadius);
    }
    var scaleCenter = motion.scaleCenter || anchor;
    var scaledX = scaleCenter.x + (point[0] - scaleCenter.x) * scale;
    var scaledY = scaleCenter.y + (point[1] - scaleCenter.y) * scale;
    var localX = scaledX - anchor.x;
    var localY = scaledY - anchor.y;
    return [
        position.x + localX * cosine - localY * sine,
        position.y + localX * sine + localY * cosine,
        point[2]
    ];
}

function preview3d_addDynamicZone(scene, lines, zone) {
    var path = zone.movementPath.map(function(point) {
        return {x:Number(point.x), y:Number(point.y)};
    });
    var motion = {
        path:path,
        speed:Number(zone.movementSpeed),
        rotationSpeed:Number(zone.rotationSpeed),
        mode:zone.movementMode || "circular",
        scaleCenter:{x:Number(zone.x), y:Number(zone.y)},
        baseRadius:Number(zone.radius),
        pulseRadii:(zone.movementPulseRadii || []).slice()
    };
    scene.dynamicZones.push({lines:lines, motion:motion, phaseSeconds:0});

    if(zone.movementInstances && zone.movementInstances.length) {
        var phaseDistance = 0;
        var wantedInstances = zone.movementInstances.map(Number);
        for(var copyIndex = 1; copyIndex < path.length; copyIndex++) {
            phaseDistance += Math.hypot(path[copyIndex].x - path[copyIndex - 1].x,
                path[copyIndex].y - path[copyIndex - 1].y);
            if(wantedInstances.indexOf(copyIndex) < 0) continue;
            var instanceDistance = phaseDistance;
            if(motion.mode === "instant" && copyIndex === path.length - 1) {
                instanceDistance = Math.max(0, instanceDistance - 0.001);
            }
            if(instanceDistance <= 1e-9 || !(motion.speed > 0)) continue;
            scene.dynamicZones.push({
                lines:lines,
                motion:motion,
                phaseSeconds:instanceDistance / motion.speed
            });
        }
    }

    // Include the entire swept footprint in Fit Map without drawing the
    // authoring guide over the gameplay-style preview.
    var anchor = path[0];
    var radius = 0;
    lines.forEach(function(line) {
        [line.a, line.b].forEach(function(point) {
            radius = Math.max(radius, Math.hypot(point[0] - anchor.x, point[1] - anchor.y));
        });
    });
    if(motion.baseRadius > 0 && motion.pulseRadii.length) {
        var largestPulseRadius = motion.pulseRadii.reduce(function(maximum, value) {
            return value === null || value === undefined ? maximum :
                Math.max(maximum, Number(value) || 0);
        }, motion.baseRadius);
        radius *= Math.max(1, largestPulseRadius / motion.baseRadius);
    }
    path.forEach(function(point) {
        preview3d_extendBounds(scene, [point.x - radius, point.y - radius, lines[0].a[2]]);
        preview3d_extendBounds(scene, [point.x + radius, point.y + radius, lines[0].a[2]]);
    });
}

function preview3d_addZone(scene, zone) {
    var z = preview3d_levelElevation(zone.level) + 0.08;
    var color = preview3d_zoneColor(zone);
    var points = [];
    if(zone.shapeType === "circle") {
        var segments = 40;
        for(var i = 0; i < segments; i++) {
            var angle = i * Math.PI * 2 / segments;
            points.push({x:zone.x + Math.cos(angle) * zone.radius,
                y:zone.y + Math.sin(angle) * zone.radius});
        }
    } else if(zone.shapeType === "line") {
        points = Number(zone.lineWidth) > 0 &&
            typeof zone.getLineFootprintPoints === "function" ?
            zone.getLineFootprintPoints() : [zone.lineStart, zone.lineEnd];
    } else if(typeof zone.getMapPoints === "function") {
        points = zone.getMapPoints();
    }
    var lines = [];
    if(zone.shapeType === "line" && Number(zone.lineWidth) === 0 && points.length === 2) {
        lines.push({
            a:[points[0].x, points[0].y, z], b:[points[1].x, points[1].y, z],
            color:color, width:2, alpha:0.82
        });
    } else {
        for(var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            var nextPoint = (pointIndex + 1) % points.length;
            lines.push({
                a:[points[pointIndex].x, points[pointIndex].y, z],
                b:[points[nextPoint].x, points[nextPoint].y, z],
                color:color, width:2.2, alpha:0.92
            });
        }
    }
    if(zone.movementPath && zone.movementPath.length >= 2 && lines.length) {
        preview3d_addDynamicZone(scene, lines, zone);
    } else {
        lines.forEach(function(line) {
            preview3d_addLine(scene, line.a, line.b, line.color, line.width, line.alpha);
        });
    }
}

function preview3d_addSpawnFallback(scene, spawn, z) {
    var fx = Number(spawn.xDir), fy = Number(spawn.yDir);
    var length = Math.hypot(fx, fy) || 1;
    fx /= length; fy /= length;
    var lx = fy, ly = -fx;
    var center = [Number(spawn.x), Number(spawn.y), z + PREVIEW3D_CYCLE_HEIGHT * 0.48];
    var halfLength = 1.35, halfWidth = 0.42, halfHeight = PREVIEW3D_CYCLE_HEIGHT * 0.48;
    var corners = [];
    [-1, 1].forEach(function(forwardSign) {
        [-1, 1].forEach(function(leftSign) {
            [-1, 1].forEach(function(upSign) {
                corners.push([
                    center[0] + fx * halfLength * forwardSign + lx * halfWidth * leftSign,
                    center[1] + fy * halfLength * forwardSign + ly * halfWidth * leftSign,
                    center[2] + halfHeight * upSign
                ]);
            });
        });
    });
    [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]].forEach(function(edge) {
        preview3d_addLine(scene, corners[edge[0]], corners[edge[1]], "#f5f7ff", 1.1, 0.9);
    });
    preview3d_addLine(scene, [spawn.x, spawn.y, z + PREVIEW3D_CYCLE_HEIGHT / 2],
        [spawn.x + fx * 3.4, spawn.y + fy * 3.4, z + PREVIEW3D_CYCLE_HEIGHT / 2],
        "#49e7ff", 2, 0.95);
}

function preview3d_addSpawn(scene, spawn) {
    var z = preview3d_levelElevation(spawn.level);
    if(!preview3d_cycleMesh) {
        preview3d_addSpawnFallback(scene, spawn, z);
        return;
    }
    var transformed = preview3d_cycleMesh.vertices.map(function(vertex) {
        return vertex ? preview3d_cycleWorldVertex(vertex, spawn, z) : null;
    });
    preview3d_cycleMesh.edges.forEach(function(edge) {
        preview3d_addLine(scene, transformed[edge[0]], transformed[edge[1]], "#dcecff", 0.65, 0.38);
    });
}

function preview3d_buildScene(objects) {
    objects = objects || (typeof aamap_objects !== "undefined" ? aamap_objects : []);
    var scene = preview3d_newScene();
    var mapBounds = preview3d_objectBounds(objects);
    var configuredRimHeight = preview3d_configuredRimHeight(objects);
    var hasExplicitUpperFloors = objects.some(function(object) {
        return typeof Floor !== "undefined" && object instanceof Floor && object.level > 0;
    });
    var levels = typeof aamap_existingLevels === "function" ? aamap_existingLevels() : [0];
    levels.forEach(function(level) {
        if(!preview3d_visibleLevel(level)) return;
        var polygons = preview3d_levelPolygons(objects, level, hasExplicitUpperFloors);
        var fullBaseGrid = level === 0;
        if(fullBaseGrid) {
            preview3d_addTriangle(scene, [mapBounds.minx,mapBounds.miny,0], [mapBounds.maxx,mapBounds.miny,0],
                [mapBounds.maxx,mapBounds.maxy,0], "#132131", 0.82);
            preview3d_addTriangle(scene, [mapBounds.minx,mapBounds.miny,0], [mapBounds.maxx,mapBounds.maxy,0],
                [mapBounds.minx,mapBounds.maxy,0], "#132131", 0.82);
        }
        polygons.forEach(function(polygon) {
            preview3d_fillPolygon(scene, polygon, preview3d_levelElevation(level) + 0.002, "#18344b", 0.62);
        });
        preview3d_addLevelGrid(scene, mapBounds, level, polygons, fullBaseGrid);
    });

    objects.forEach(function(object) {
        if(typeof Ramp !== "undefined" && object instanceof Ramp &&
            !preview3d_visibleLevel(object.fromLevel) && !preview3d_visibleLevel(object.toLevel)) return;
        if(typeof object.level === "number" && !preview3d_visibleLevel(object.level) &&
            !(typeof Ramp !== "undefined" && object instanceof Ramp)) return;
        if(typeof Wall !== "undefined" && object instanceof Wall) {
            var baseZ = preview3d_levelElevation(object.level);
            var flatHeight = isFinite(Number(object.height)) ? Number(object.height) : 4;
            for(var wallIndex = 0; wallIndex < object.points.length - 1; wallIndex++) {
                var a = object.points[wallIndex], b = object.points[wallIndex + 1];
                var heightA = object.slopedHeight ? wall_normalizeHeight(a.height, flatHeight) : flatHeight;
                var heightB = object.slopedHeight ? wall_normalizeHeight(b.height, flatHeight) : flatHeight;
                preview3d_addRimWall(scene, [a.x,a.y,baseZ], [b.x,b.y,baseZ], heightA, heightB);
            }
        } else if(typeof Floor !== "undefined" && object instanceof Floor) {
            // Already emitted through the per-level floor pass.
        } else if(typeof Ramp !== "undefined" && object instanceof Ramp) {
            var fromZ = preview3d_levelElevation(object.fromLevel);
            var toZ = preview3d_levelElevation(object.toLevel);
            var p = object.points;
            if(p && p.length === 4) {
                var world = [[p[0].x,p[0].y,fromZ], [p[1].x,p[1].y,fromZ],
                    [p[2].x,p[2].y,toZ], [p[3].x,p[3].y,toZ]];
                preview3d_addTriangle(scene, world[0], world[1], world[3], "#526b80", 0.84);
                preview3d_addTriangle(scene, world[0], world[3], world[2], "#526b80", 0.84);
                preview3d_addLine(scene, world[0], world[2], "#d7e8f6", 1.7, 0.95);
                preview3d_addLine(scene, world[1], world[3], "#d7e8f6", 1.7, 0.95);
                // Full rim-wall quads follow the slope. Their endpoint caps
                // rise vertically in world Z, matching the gameplay renderer.
                preview3d_addRimWall(scene, world[0], world[2], configuredRimHeight);
                preview3d_addRimWall(scene, world[1], world[3], configuredRimHeight);
            }
        } else if(typeof Zone !== "undefined" && object instanceof Zone) {
            preview3d_addZone(scene, object);
        } else if(typeof Billboard !== "undefined" && object instanceof Billboard) {
            preview3d_addBillboard(scene, object);
        } else if(typeof Spawn !== "undefined" && object instanceof Spawn) {
            preview3d_addSpawn(scene, object);
        }
    });
    return scene;
}

function preview3d_fitCamera() {
    if(!preview3d_scene || !preview3d_scene.bounds) return;
    var bounds = preview3d_scene.bounds;
    var center = [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2
    ];
    var span = Math.max(18, bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1], (bounds.max[2] - bounds.min[2]) * 2.2);
    preview3d_camera.yaw = 0.72;
    var distance = span * 1.25;
    preview3d_camera.x = center[0] - Math.sin(preview3d_camera.yaw) * distance;
    preview3d_camera.y = center[1] - Math.cos(preview3d_camera.yaw) * distance;
    preview3d_camera.z = center[2] + span * 0.62;
    preview3d_camera.pitch = Math.atan2(center[2] - preview3d_camera.z, distance);
    preview3d_camera.fov = 68;
}

function preview3d_resizeCanvas() {
    if(!preview3d_canvas) return;
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    var rect = preview3d_canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width * ratio));
    var height = Math.max(1, Math.round(rect.height * ratio));
    if(preview3d_canvas.width !== width || preview3d_canvas.height !== height) {
        preview3d_canvas.width = width;
        preview3d_canvas.height = height;
    }
}

function preview3d_drawScene() {
    if(!preview3d_context || !preview3d_scene) return;
    preview3d_resizeCanvas();
    var context = preview3d_context;
    var width = preview3d_canvas.width;
    var height = preview3d_canvas.height;
    var gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#07121d");
    gradient.addColorStop(1, "#020509");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    var triangles = [];
    preview3d_scene.triangles.forEach(function(triangle) {
        if(triangle.frontNormal && !triangle.dualSided) {
            var toCamera = [
                preview3d_camera.x - triangle.center[0],
                preview3d_camera.y - triangle.center[1],
                preview3d_camera.z - triangle.center[2]
            ];
            if(toCamera[0] * triangle.frontNormal[0] +
                toCamera[1] * triangle.frontNormal[1] +
                toCamera[2] * triangle.frontNormal[2] <= 0) return;
        }
        var points = preview3d_clipProjectPolygon(
            [triangle.a, triangle.b, triangle.c], preview3d_camera, width, height);
        if(points.length >= 3) {
            var depth = points.reduce(function(sum, point) { return sum + point.depth; }, 0) / points.length;
            triangles.push({source:triangle, points:points, depth:depth});
        }
    });
    triangles.sort(function(a, b) { return b.depth - a.depth; });
    triangles.forEach(function(projected) {
        context.beginPath();
        context.moveTo(projected.points[0].x, projected.points[0].y);
        for(var pointIndex = 1; pointIndex < projected.points.length; pointIndex++) {
            context.lineTo(projected.points[pointIndex].x, projected.points[pointIndex].y);
        }
        context.closePath();
        context.globalAlpha = projected.source.alpha;
        context.fillStyle = projected.source.color;
        context.fill();
    });

    var lines = [];
    function projectLine(line) {
        var projected = preview3d_clipProjectLine(
            line.a, line.b, preview3d_camera, width, height);
        if(projected && projected.a && projected.b) {
            lines.push({source:line, a:projected.a, b:projected.b,
                depth:(projected.a.depth + projected.b.depth) / 2});
        }
    }
    preview3d_scene.lines.forEach(projectLine);
    (preview3d_scene.dynamicZones || []).forEach(function(dynamicZone) {
        var motionSeconds = preview3d_animationElapsedSeconds +
            Number(dynamicZone.phaseSeconds || 0);
        dynamicZone.lines.forEach(function(line) {
            projectLine({
                a:preview3d_transformMovingZonePoint(
                    line.a, dynamicZone.motion, motionSeconds),
                b:preview3d_transformMovingZonePoint(
                    line.b, dynamicZone.motion, motionSeconds),
                color:line.color, width:line.width, alpha:line.alpha
            });
        });
    });
    lines.sort(function(a, b) { return b.depth - a.depth; });
    lines.forEach(function(projected) {
        context.beginPath();
        context.moveTo(projected.a.x, projected.a.y);
        context.lineTo(projected.b.x, projected.b.y);
        context.globalAlpha = projected.source.alpha;
        context.strokeStyle = projected.source.color;
        context.lineWidth = projected.source.width * Math.min(2, window.devicePixelRatio || 1);
        context.lineCap = "butt";
        context.lineJoin = "miter";
        context.stroke();
    });
    context.globalAlpha = 1;
}

function preview3d_updateCamera(seconds) {
    var fast = preview3d_keys.ShiftLeft || preview3d_keys.ShiftRight;
    var speed = (fast ? PREVIEW3D_FAST_SPEED : PREVIEW3D_NORMAL_SPEED) * seconds;
    var forwardX = Math.sin(preview3d_camera.yaw);
    var forwardY = Math.cos(preview3d_camera.yaw);
    var rightX = -forwardY;
    var rightY = forwardX;
    var moveX = 0, moveY = 0, moveZ = 0;
    if(preview3d_keys.KeyW) { moveX += forwardX; moveY += forwardY; }
    if(preview3d_keys.KeyS) { moveX -= forwardX; moveY -= forwardY; }
    if(preview3d_keys.KeyD) { moveX += rightX; moveY += rightY; }
    if(preview3d_keys.KeyA) { moveX -= rightX; moveY -= rightY; }
    if(preview3d_keys.Space || preview3d_keys.PageUp) moveZ += 1;
    if(preview3d_keys.ControlLeft || preview3d_keys.ControlRight || preview3d_keys.PageDown) moveZ -= 1;
    var horizontalLength = Math.hypot(moveX, moveY);
    if(horizontalLength > 1) { moveX /= horizontalLength; moveY /= horizontalLength; }
    preview3d_camera.x += moveX * speed;
    preview3d_camera.y += moveY * speed;
    preview3d_camera.z = Math.max(0.05, preview3d_camera.z + moveZ * speed);
}

function preview3d_tick(timestamp) {
    if(!preview3d_opened) return;
    var elapsedSeconds = preview3d_lastFrameTime ?
        Math.max(0, (timestamp - preview3d_lastFrameTime) / 1000) : 0;
    preview3d_lastFrameTime = timestamp;
    preview3d_animationElapsedSeconds += elapsedSeconds;
    preview3d_updateCamera(Math.min(0.05, elapsedSeconds));
    preview3d_drawScene();
    preview3d_frame = window.requestAnimationFrame(preview3d_tick);
}

function preview3d_requestCycleMesh() {
    if(preview3d_cycleMeshRequested || typeof fetch !== "function") return;
    preview3d_cycleMeshRequested = true;
    // When Vectron is served from the repository root (recommended for the complete preview),
    // this resolves to the exact model embedded by the client. A compact,
    // correctly scaled fallback remains available when Vectron is served alone.
    fetch("../../assets/models/cycle.ASE").then(function(response) {
        if(!response.ok) throw new Error("cycle asset unavailable");
        return response.text();
    }).then(function(text) {
        preview3d_cycleMesh = preview3d_parseAse(text);
        if(preview3d_opened && preview3d_cycleMesh) {
            preview3d_scene = preview3d_buildScene();
            preview3d_fitCamera();
            $("#preview3d-asset-status").text("Exact cycle.ASE model");
        }
    }).catch(function() {
        $("#preview3d-asset-status").text("Scaled cycle fallback");
    });
}

function preview3d_open() {
    if(!preview3d_canvas) preview3d_init();
    if(!preview3d_canvas) return;
    preview3d_scene = preview3d_buildScene();
    preview3d_fitCamera();
    preview3d_opened = true;
    preview3d_keys = {};
    preview3d_lastFrameTime = 0;
    preview3d_animationElapsedSeconds = 0;
    $("#preview3d-overlay").show().attr("aria-hidden", "false");
    $("#preview3d-asset-status").text(preview3d_cycleMesh ? "Exact cycle.ASE model" : "Scaled cycle fallback");
    preview3d_canvas.focus();
    preview3d_requestCycleMesh();
    if(preview3d_frame !== null) window.cancelAnimationFrame(preview3d_frame);
    preview3d_frame = window.requestAnimationFrame(preview3d_tick);
}

function preview3d_close() {
    preview3d_opened = false;
    preview3d_keys = {};
    preview3d_dragging = false;
    preview3d_lastPointer = null;
    if(document.pointerLockElement === preview3d_canvas && document.exitPointerLock) document.exitPointerLock();
    if(preview3d_frame !== null) window.cancelAnimationFrame(preview3d_frame);
    preview3d_frame = null;
    $("#preview3d-overlay").hide().attr("aria-hidden", "true");
}

function preview3d_mouseLook(dx, dy) {
    preview3d_camera.yaw -= dx * PREVIEW3D_MOUSE_SENSITIVITY;
    preview3d_camera.pitch = Math.max(-1.53, Math.min(1.53,
        preview3d_camera.pitch - dy * PREVIEW3D_MOUSE_SENSITIVITY));
}

function preview3d_init() {
    if(preview3d_canvas || typeof document === "undefined") return;
    preview3d_canvas = document.getElementById("preview3d-canvas");
    if(!preview3d_canvas) return;
    preview3d_context = preview3d_canvas.getContext("2d");

    $(document).on("click", ".toolbar-preview3d", function(event) {
        event.preventDefault();
        preview3d_open();
    });
    $(document).on("click", "#preview3d-close", preview3d_close);
    $(document).on("click", "#preview3d-reset", function() {
        preview3d_scene = preview3d_buildScene();
        preview3d_fitCamera();
    });

    preview3d_canvas.addEventListener("click", function() {
        preview3d_canvas.focus();
        if(preview3d_canvas.requestPointerLock) preview3d_canvas.requestPointerLock();
    });
    preview3d_canvas.addEventListener("pointerdown", function(event) {
        preview3d_dragging = true;
        preview3d_lastPointer = {x:event.clientX, y:event.clientY};
        preview3d_canvas.setPointerCapture && preview3d_canvas.setPointerCapture(event.pointerId);
    });
    preview3d_canvas.addEventListener("pointermove", function(event) {
        if(document.pointerLockElement === preview3d_canvas) return;
        if(!preview3d_dragging || !preview3d_lastPointer) return;
        preview3d_mouseLook(event.clientX - preview3d_lastPointer.x,
            event.clientY - preview3d_lastPointer.y);
        preview3d_lastPointer = {x:event.clientX, y:event.clientY};
    });
    preview3d_canvas.addEventListener("pointerup", function() {
        preview3d_dragging = false;
        preview3d_lastPointer = null;
    });
    document.addEventListener("mousemove", function(event) {
        if(preview3d_opened && document.pointerLockElement === preview3d_canvas) {
            preview3d_mouseLook(event.movementX || 0, event.movementY || 0);
        }
    });
    document.addEventListener("keydown", function(event) {
        if(!preview3d_opened) return;
        if(event.code === "Escape") {
            preview3d_close();
            return;
        }
        if(["KeyW","KeyA","KeyS","KeyD","Space","PageUp","PageDown",
            "ControlLeft","ControlRight","ShiftLeft","ShiftRight"].indexOf(event.code) >= 0) {
            preview3d_keys[event.code] = true;
            event.preventDefault();
        }
    });
    document.addEventListener("keyup", function(event) {
        if(preview3d_opened) preview3d_keys[event.code] = false;
    });
    window.addEventListener("blur", function() { preview3d_keys = {}; });
    $(document).on("pointerdown", "[data-preview-key]", function(event) {
        preview3d_keys[$(this).attr("data-preview-key")] = true;
        event.preventDefault();
    });
    $(document).on("pointerup pointercancel pointerleave", "[data-preview-key]", function(event) {
        preview3d_keys[$(this).attr("data-preview-key")] = false;
        event.preventDefault();
    });
}
