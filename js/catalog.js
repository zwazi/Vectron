export const MAP_CATEGORY = "maps";
export const MAX_MAP_BYTES = 10 * 1024 * 1024;

const VERSION_PATTERN = /^(v)?\d+(?:\.\d+)*$/i;
const CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,59}$/u;

export function normalizeAuthorName(value) {
    return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function authorNameError(value) {
    const name = normalizeAuthorName(value);
    if(name.length < 2) return "Choose an author name with at least 2 characters.";
    if(name.length > 60) return "Keep your author name to 60 characters or fewer.";
    if(!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) {
        return "Use letters, numbers, spaces, periods, hyphens, or underscores.";
    }
    return "";
}

export function authorKey(value) {
    const normalized = normalizeAuthorName(value).toLocaleLowerCase("en-US");
    const bytes = new TextEncoder().encode(normalized);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return `author_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

export function resourceKey(value) {
    const normalized = String(value || "").normalize("NFKC");
    const bytes = new TextEncoder().encode(normalized);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return `resource_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
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
    const cleaned = String(value || "map")
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
        .replace(/\s+/g, " ")
        .replace(/^[. ]+|[. ]+$/g, "")
        .slice(0, maximumLength);
    return cleaned || "map";
}

export function normalizeMapVersion(value) {
    const version = String(value || "").trim();
    return VERSION_PATTERN.test(version) ? version : "v1";
}

export function bumpMapVersion(value) {
    const version = normalizeMapVersion(value);
    const prefix = /^v/i.test(version) ? version[0] : "";
    const parts = version.slice(prefix.length).split(".");
    parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
    return `${prefix}${parts.join(".")}`;
}

export function mapFileName(mapName, version) {
    return `${safeMapName(mapName)}-${normalizeMapVersion(version)}.aamap.xml`;
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
    return `${normalizeAuthorName(authorName)}/${normalizeCategory(category)}/${mapFileName(mapName, version)}`;
}

export function submissionOperation(value) {
    const operation = String(value || "");
    return ["create", "edit", "metadata", "size"].includes(operation) ? operation : "create";
}

function xmlAttribute(value) {
    return String(value || "")
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
    const expression = new RegExp(`(\\s${attribute}\\s*=\\s*)(["'])[^"']*\\2`, "i");
    if(expression.test(tag)) return tag.replace(expression, `$1"${escaped}"`);
    return tag.replace(/\s*(\/?>)$/, ` ${attribute}="${escaped}"$1`);
}

export function rewriteResourceIdentity(xml, identity) {
    const source = String(xml || "");
    const opening = source.match(/<Resource\b[^>]*>/i);
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
    const opening = String(xml || "").match(/<Resource\b[^>]*>/i);
    if(!opening) return null;
    const read = attribute => {
        const match = opening[0].match(new RegExp(`\\s${attribute}\\s*=\\s*(["'])([^"']*)\\1`, "i"));
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
