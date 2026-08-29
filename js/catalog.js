export const MAP_CATEGORY = "maps";
export const MAX_MAP_BYTES = 10 * 1024 * 1024;

const CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,59}$/u;
const LEGACY_AUTHOR_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const LEGACY_MAP_NAME_PATTERN = /^[\p{L}\p{N} ._-]+$/u;
const LEGACY_VERSION_PATTERN = /^(v)?\d+(?:\.\d+)*$/i;

function normalizedIdentityText(value) {
    return String(value ?? "").normalize("NFKC").trim();
}

function identityLength(value) {
    return Array.from(value).length;
}

function base64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sha256Hex(value) {
    const constants = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rotateRight = (word, amount) => word >>> amount | word << (32 - amount);
    const bytes = Array.from(new TextEncoder().encode(value));
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while(bytes.length % 64 !== 56) bytes.push(0);
    for(let shift = 56; shift >= 0; shift -= 8) {
        bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
    }
    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    for(let offset = 0; offset < bytes.length; offset += 64) {
        const words = new Array(64);
        for(let index = 0; index < 16; index += 1) {
            const start = offset + index * 4;
            words[index] = bytes[start] << 24 | bytes[start + 1] << 16 |
                bytes[start + 2] << 8 | bytes[start + 3];
        }
        for(let index = 16; index < 64; index += 1) {
            const first = words[index - 15];
            const second = words[index - 2];
            const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ first >>> 3;
            const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ second >>> 10;
            words[index] = words[index - 16] + sigma0 + words[index - 7] + sigma1 | 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for(let index = 0; index < 64; index += 1) {
            const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const choice = e & f ^ ~e & g;
            const temp1 = h + sum1 + choice + constants[index] + words[index] | 0;
            const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const majority = a & b ^ a & c ^ b & c;
            const temp2 = sum0 + majority | 0;
            h = g;
            g = f;
            f = e;
            e = d + temp1 | 0;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2 | 0;
        }
        [a, b, c, d, e, f, g, h].forEach((word, index) => {
            hash[index] = hash[index] + word | 0;
        });
    }
    return hash.map(word => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

function legacyMapName(value) {
    return value.length <= 100 && LEGACY_MAP_NAME_PATTERN.test(value) &&
        !/^[. ]|[. ]$| {2,}/.test(value);
}

function authorPathSegment(value) {
    const author = normalizeAuthorName(value);
    return LEGACY_AUTHOR_PATTERN.test(author) ? author : `~${base64Url(author)}`;
}

export function normalizeAuthorName(value) {
    return normalizedIdentityText(value);
}

export function authorNameError(value) {
    const name = normalizeAuthorName(value);
    if(!name) return "Choose an author name.";
    if(identityLength(name) > 60) return "Keep your author name to 60 characters or fewer.";
    return "";
}

export function authorKey(value) {
    const normalized = normalizeAuthorName(value).toLocaleLowerCase("en-US");
    return `author_${base64Url(normalized)}`;
}

export function resourceKey(value) {
    const normalized = String(value ?? "").normalize("NFKC");
    const encoded = base64Url(normalized);
    return encoded.length <= 1400
        ? `resource_${encoded}`
        : `resource_sha256_${sha256Hex(normalized)}`;
}

export function normalizeCategory(value) {
    const category = String(value || "").normalize("NFKC").trim();
    return CATEGORY_PATTERN.test(category) ? category : MAP_CATEGORY;
}

export function categoryError(value) {
    const category = String(value || "").normalize("NFKC").trim();
    if(!category) return "Enter a category.";
    if(!CATEGORY_PATTERN.test(category)) {
        return "Use 1–60 letters, numbers, periods, hyphens, or underscores, with no slashes.";
    }
    return "";
}

export function safeMapName(value, maximumLength = 100) {
    const name = normalizedIdentityText(value) || "map";
    return Array.from(name).slice(0, maximumLength).join("");
}

export function mapNameError(value) {
    const name = normalizedIdentityText(value);
    if(!name) return "Enter a map name.";
    if(identityLength(name) > 100) return "Keep the map name to 100 characters or fewer.";
    return "";
}

export function normalizeMapVersion(value) {
    return normalizedIdentityText(value) || "v1";
}

export function mapVersionError(value) {
    const version = normalizedIdentityText(value);
    if(!version) return "Enter a map version.";
    if(identityLength(version) > 64) return "Keep the map version to 64 characters or fewer.";
    return "";
}

export function bumpMapVersion(value) {
    const version = normalizeMapVersion(value);
    if(LEGACY_VERSION_PATTERN.test(version)) {
        const prefix = /^v/i.test(version) ? version[0] : "";
        const parts = version.slice(prefix.length).split(".");
        parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
        return `${prefix}${parts.join(".")}`;
    }
    const suffix = version.match(/^(.*)\.(\d+)$/su);
    return suffix ? `${suffix[1]}.${Number(suffix[2]) + 1}` : `${version}.1`;
}

export function mapFileName(mapName, version) {
    const name = safeMapName(mapName);
    const normalizedVersion = normalizeMapVersion(version);
    if(legacyMapName(name) && LEGACY_VERSION_PATTERN.test(normalizedVersion)) {
        return `${name}-${normalizedVersion}.aamap.xml`;
    }
    return `~${base64Url(name)}.${base64Url(normalizedVersion)}.aamap.xml`;
}

export function revisionStoragePath(ownerUid, submissionId, mapName = "", version = "") {
    const base = `_revisions/${ownerUid}/${submissionId}`;
    return mapName ? `${base}/${mapFileName(mapName, version)}` : base;
}

export function firebaseStorageMediaUrl(bucket, storagePath) {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}` +
        `/o/${encodeURIComponent(storagePath)}?alt=media`;
}

export function mapFileCommand(bucket, storagePath, mapName, version) {
    const fileName = mapFileName(mapName, version);
    const locator = `${fileName}(${firebaseStorageMediaUrl(bucket, storagePath)})`;
    return `MAP_FILE ${/\s/.test(locator) ? JSON.stringify(locator) : locator}`;
}

export function activeResourcePath(authorName, category, mapName, version) {
    return `${authorPathSegment(authorName)}/${normalizeCategory(category)}/${mapFileName(mapName, version)}`;
}

export function submissionOperation(value) {
    const operation = String(value || "");
    return ["create", "edit", "metadata", "size"].includes(operation) ? operation : "create";
}

function xmlAttribute(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function decodeXmlAttribute(value) {
    return String(value || "")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function replaceOpeningTagAttribute(tag, attribute, value) {
    const escaped = xmlAttribute(value);
    const expression = new RegExp(`(\\s${attribute}\\s*=\\s*)(["'])(.*?)\\2`, "i");
    if(expression.test(tag)) {
        return tag.replace(expression, (match, prefix) => `${prefix}"${escaped}"`);
    }
    return tag.replace(/\s*(\/?>)$/, (match, ending) =>
        ` ${attribute}="${escaped}"${ending}`
    );
}

export function rewriteResourceIdentity(xml, identity) {
    const source = String(xml || "");
    const opening = source.match(/<Resource\b(?:[^>"']|"[^"]*"|'[^']*')*>/i);
    if(!opening) throw new Error("The map does not contain a Resource element.");
    let replacement = opening[0];
    ["author", "category", "name", "version"].forEach(attribute => {
        if(identity[attribute] !== undefined) {
            replacement = replaceOpeningTagAttribute(replacement, attribute, identity[attribute]);
        }
    });
    return source.slice(0, opening.index) + replacement +
        source.slice(opening.index + opening[0].length);
}

export function resourceIdentityFromXml(xml) {
    const opening = String(xml || "").match(/<Resource\b(?:[^>"']|"[^"]*"|'[^']*')*>/i);
    if(!opening) return null;
    const read = attribute => {
        const match = opening[0].match(new RegExp(`\\s${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i"));
        return match ? decodeXmlAttribute(match[2]) : "";
    };
    return {
        author: read("author"),
        category: read("category"),
        name: read("name"),
        version: read("version")
    };
}

export function timestampMillis(value) {
    if(!value) return 0;
    if(typeof value.toMillis === "function") return value.toMillis();
    if(typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatTimestamp(value) {
    const millis = timestampMillis(value);
    return millis ? new Date(millis).toLocaleString() : "Just now";
}
