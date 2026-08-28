#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT = "tronnerrepository";
const DEFAULT_BUCKET = "tronnerrepository.firebasestorage.app";
const MAP_SUFFIX = ".aamap.xml";

function parseArguments(argv) {
    const result = {apply: false, project: DEFAULT_PROJECT, bucket: DEFAULT_BUCKET};
    for(let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if(argument === "--apply") result.apply = true;
        else if(argument.startsWith("--")) {
            const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            if(index + 1 >= argv.length) throw new Error(`${argument} requires a value.`);
            result[key] = argv[index += 1];
        } else throw new Error(`Unknown argument: ${argument}`);
    }
    for(const required of ["repository", "overrides", "exclusions"]) {
        if(!result[required]) throw new Error(`--${required} is required.`);
    }
    if(result.apply && !process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
        throw new Error("GOOGLE_OAUTH_ACCESS_TOKEN is required with --apply.");
    }
    return result;
}

function walkMaps(root) {
    const found = [];
    function walk(directory) {
        for(const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            if(entry.name === ".git") continue;
            const fullPath = path.join(directory, entry.name);
            if(entry.isDirectory()) walk(fullPath);
            else if(entry.isFile() && entry.name.endsWith(MAP_SUFFIX)) found.push(fullPath);
        }
    }
    if(fs.existsSync(root)) walk(root);
    return found.sort((a, b) => a.localeCompare(b));
}

function decodeXmlAttribute(value) {
    return String(value || "")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function resourceIdentity(xml, sourcePath) {
    const tag = xml.match(/<Resource\b[^>]*>/i);
    if(!tag) throw new Error(`${sourcePath}: missing Resource element.`);
    const attribute = name => {
        const match = tag[0].match(new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`, "i"));
        return decodeXmlAttribute(match && match[2]);
    };
    if(attribute("type") !== "aamap") throw new Error(`${sourcePath}: Resource is not an aamap.`);
    const identity = {
        authorName: attribute("author").trim(),
        category: attribute("category").replace(/^\/+|\/+$/g, ""),
        mapName: attribute("name").trim(),
        mapVersion: attribute("version").trim()
    };
    for(const [field, value] of Object.entries(identity)) {
        if(!value) throw new Error(`${sourcePath}: missing ${field}.`);
        if(value.includes("/") && field !== "category") {
            throw new Error(`${sourcePath}: unsafe ${field}.`);
        }
    }
    if(!/<Spawn\b/i.test(xml)) throw new Error(`${sourcePath}: map has no spawn points.`);
    return identity;
}

function base64Url(bytes) {
    return Buffer.from(bytes).toString("base64url");
}

function authorId(name) {
    return `author_${base64Url(Buffer.from(name.normalize("NFKC").trim().toLocaleLowerCase("en-US"), "utf8"))}`;
}

function resourceId(resourcePath) {
    return `resource_${base64Url(Buffer.from(resourcePath.normalize("NFKC"), "utf8"))}`;
}

function stableId(prefix, ...parts) {
    const digest = crypto.createHash("sha256");
    parts.forEach(part => {
        digest.update(String(part));
        digest.update("\0");
    });
    return `${prefix}_${base64Url(digest.digest()).slice(0, 32)}`;
}

function sizeFactor(xml) {
    const matches = Array.from(xml.matchAll(/<Setting\b[^>]*\bname\s*=\s*["']SIZE_FACTOR["'][^>]*>/gi));
    if(!matches.length) return null;
    const value = matches.at(-1)[0].match(/\bvalue\s*=\s*(["'])([^"']+)\1/i);
    return value && Number.isFinite(Number(value[2])) ? Number(value[2]) : null;
}

function buildCatalog(options) {
    const exclusions = new Set(JSON.parse(fs.readFileSync(options.exclusions, "utf8")));
    const catalog = new Map();
    const issues = [];
    let overrideCount = 0;
    for(const [root, sourceKind] of [[options.repository, "repository"], [options.overrides, "override"]]) {
        for(const filePath of walkMaps(root)) {
            const relativePath = path.relative(root, filePath).split(path.sep).join("/");
            try {
                const bytes = fs.readFileSync(filePath);
                const xml = bytes.toString("utf8");
                const identity = resourceIdentity(xml, relativePath);
                const resourcePath = [
                    identity.authorName,
                    ...identity.category.split("/").filter(Boolean),
                    `${identity.mapName}-${identity.mapVersion}${MAP_SUFFIX}`
                ].join("/");
                if(exclusions.has(resourcePath)) continue;
                const logicalId = stableId(
                    "map",
                    identity.authorName.normalize("NFKC").toLocaleLowerCase("en-US"),
                    identity.category.normalize("NFKC").toLocaleLowerCase("en-US"),
                    identity.mapName.normalize("NFKC").toLocaleLowerCase("en-US")
                );
                const revisionId = stableId("rev", resourcePath, bytes);
                const entry = {
                    ...identity,
                    authorId: authorId(identity.authorName),
                    mapId: logicalId,
                    revisionId,
                    resourcePath,
                    storagePath: `_revisions/migration/${revisionId}`,
                    sourcePath: relativePath,
                    sourceKind,
                    filePath,
                    bytes,
                    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
                    md5: crypto.createHash("md5").update(bytes).digest("base64"),
                    sizeFactor: sizeFactor(xml)
                };
                entry.recordKey = resourcePath;
                entry.ratingKey = [
                    identity.authorName,
                    ...identity.category.split("/").filter(Boolean),
                    identity.mapName
                ].join("/").toLocaleLowerCase("en-US");
                if(catalog.has(logicalId) && sourceKind !== "override") {
                    throw new Error(`multiple active revisions for ${identity.authorName}/${identity.mapName}`);
                }
                if(sourceKind === "override") overrideCount += 1;
                catalog.set(logicalId, entry);
            } catch(error) {
                issues.push(error.message || String(error));
            }
        }
    }
    if(issues.length) throw new Error(`Catalog validation failed:\n${issues.join("\n")}`);
    const maps = Array.from(catalog.values()).sort((a, b) => a.resourcePath.localeCompare(b.resourcePath));
    const authors = new Map();
    maps.forEach(map => authors.set(map.authorId, {
        authorId: map.authorId,
        name: map.authorName,
        normalizedName: map.authorName.normalize("NFKC").trim().toLocaleLowerCase("en-US"),
        ownerUid: "",
        status: "active"
    }));
    return {maps, authors, overrideCount, excludedCount: exclusions.size};
}

function firestoreValue(value) {
    if(value === null || value === undefined) return {nullValue: null};
    if(typeof value === "string") return {stringValue: value};
    if(typeof value === "boolean") return {booleanValue: value};
    if(typeof value === "number") {
        return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
    }
    if(value instanceof Date) return {timestampValue: value.toISOString()};
    if(Array.isArray(value)) return {arrayValue: {values: value.map(firestoreValue)}};
    const fields = {};
    Object.entries(value).forEach(([key, item]) => { fields[key] = firestoreValue(item); });
    return {mapValue: {fields}};
}

function firestoreDocument(project, collection, id, data) {
    const fields = {};
    Object.entries(data).forEach(([key, value]) => { fields[key] = firestoreValue(value); });
    return {
        name: `projects/${project}/databases/(default)/documents/${collection}/${id}`,
        fields
    };
}

async function authorizedFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${process.env.GOOGLE_OAUTH_ACCESS_TOKEN}`);
    const response = await fetch(url, {...options, headers});
    if(!response.ok) {
        const body = await response.text();
        throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${body.slice(0, 500)}`);
    }
    return response;
}

async function existingObject(bucket, objectName) {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
    const response = await fetch(url, {
        headers: {authorization: `Bearer ${process.env.GOOGLE_OAUTH_ACCESS_TOKEN}`}
    });
    if(response.status === 404) return null;
    if(!response.ok) throw new Error(`Could not inspect ${objectName} (${response.status}).`);
    return response.json();
}

async function uploadRevision(options, map) {
    const existing = await existingObject(options.bucket, map.storagePath);
    if(existing) {
        if(existing.md5Hash !== map.md5 || Number(existing.size) !== map.bytes.byteLength) {
            throw new Error(`Immutable revision collision at ${map.storagePath}.`);
        }
        return "existing";
    }
    const boundary = `vectron_${crypto.randomBytes(12).toString("hex")}`;
    const metadata = Buffer.from(JSON.stringify({
        name: map.storagePath,
        contentType: "application/xml; charset=UTF-8",
        metadata: {
            ownerUid: "migration",
            submissionId: map.revisionId,
            authorId: map.authorId,
            authorName: map.authorName,
            category: map.category,
            mapName: map.mapName,
            mapVersion: map.mapVersion,
            operation: "migration",
            sha256: map.sha256
        }
    }));
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
        metadata,
        Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/xml; charset=UTF-8\r\n\r\n`),
        map.bytes,
        Buffer.from(`\r\n--${boundary}--`)
    ]);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(options.bucket)}/o?uploadType=multipart&ifGenerationMatch=0`;
    await authorizedFetch(url, {
        method: "POST",
        headers: {"content-type": `multipart/related; boundary=${boundary}`},
        body
    });
    return "uploaded";
}

async function mapWithConcurrency(items, limit, task) {
    const output = new Array(items.length);
    let cursor = 0;
    async function worker() {
        while(cursor < items.length) {
            const index = cursor++;
            output[index] = await task(items[index], index);
        }
    }
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
    return output;
}

async function writeDocuments(options, documents) {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.project)}/databases/(default)/documents:batchWrite`;
    for(let offset = 0; offset < documents.length; offset += 400) {
        const writes = documents.slice(offset, offset + 400).map(update => ({update}));
        await authorizedFetch(endpoint, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({writes})
        });
    }
}

function migrationDocuments(options, catalog) {
    const now = new Date();
    const documents = [];
    for(const author of catalog.authors.values()) {
        documents.push(firestoreDocument(options.project, "authors", author.authorId, {
            ...author,
            createdAt: now,
            updatedAt: now
        }));
    }
    for(const map of catalog.maps) {
        documents.push(firestoreDocument(options.project, "mapSubmissions", map.revisionId, {
            submissionId: map.revisionId,
            mapId: map.mapId,
            operation: "migration",
            status: "approved",
            submittedBy: "migration",
            submittedByName: "Initial Firebase migration",
            authorId: map.authorId,
            authorName: map.authorName,
            category: map.category,
            mapName: map.mapName,
            mapVersion: map.mapVersion,
            storagePath: map.storagePath,
            sourceRevisionId: "",
            sourceMapId: "",
            sourcePath: map.sourcePath,
            sourceKind: map.sourceKind,
            sha256: map.sha256,
            contentBytes: map.bytes.byteLength,
            sizeFactor: map.sizeFactor,
            createdAt: now,
            updatedAt: now,
            reviewedAt: now,
            reviewedBy: "migration",
            reviewReason: "Imported from the live Tronner Racing catalog"
        }));
        documents.push(firestoreDocument(options.project, "maps", map.mapId, {
            mapId: map.mapId,
            status: "active",
            authorId: map.authorId,
            authorName: map.authorName,
            category: map.category,
            mapName: map.mapName,
            mapVersion: map.mapVersion,
            activeRevisionId: map.revisionId,
            storagePath: map.storagePath,
            resourcePath: map.resourcePath,
            previousRevisionId: "",
            recordKey: map.recordKey,
            ratingKey: map.ratingKey,
            sha256: map.sha256,
            sizeFactor: map.sizeFactor,
            createdAt: now,
            updatedAt: now
        }));
        documents.push(firestoreDocument(options.project, "resourcePaths", resourceId(map.resourcePath), {
            resourceId: resourceId(map.resourcePath),
            resourcePath: map.resourcePath,
            mapId: map.mapId,
            revisionId: map.revisionId,
            createdAt: now,
            updatedAt: now
        }));
    }
    documents.push(firestoreDocument(options.project, "catalogSettings", "current", {
        schemaVersion: 1,
        ready: false,
        source: "live-server-migration",
        mapCount: catalog.maps.length,
        overrideCount: catalog.overrideCount,
        updatedAt: now
    }));
    return documents;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const catalog = buildCatalog(options);
    const summary = {
        apply: options.apply,
        maps: catalog.maps.length,
        authors: catalog.authors.size,
        firestoreDocuments: migrationDocuments(options, catalog).length,
        activeOverrides: catalog.overrideCount,
        exclusionKeys: catalog.excludedCount,
        sizeFactorMaps: catalog.maps.filter(map => map.sizeFactor !== null).length,
        totalBytes: catalog.maps.reduce((sum, map) => sum + map.bytes.byteLength, 0)
    };
    console.log(JSON.stringify(summary, null, 2));
    if(!options.apply) return;

    let completed = 0;
    const uploadResults = await mapWithConcurrency(catalog.maps, 8, async map => {
        const result = await uploadRevision(options, map);
        completed += 1;
        if(completed % 25 === 0 || completed === catalog.maps.length) {
            process.stderr.write(`Verified ${completed}/${catalog.maps.length} immutable revisions.\n`);
        }
        return result;
    });
    await writeDocuments(options, migrationDocuments(options, catalog));
    console.log(JSON.stringify({
        ...summary,
        uploaded: uploadResults.filter(value => value === "uploaded").length,
        alreadyPresent: uploadResults.filter(value => value === "existing").length,
        firestoreDocumentsWritten: migrationDocuments(options, catalog).length
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
});
