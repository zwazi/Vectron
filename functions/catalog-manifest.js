"use strict";

const {createHash} = require("node:crypto");
const {gzipSync} = require("node:zlib");

const SERVER_MAP_FIELDS = Object.freeze([
  "mapId", "status", "authorId", "authorName", "category", "mapName",
  "mapVersion", "activeRevisionId", "storagePath", "resourcePath",
  "recordKey", "ratingKey", "sha256"
]);

function jsonSafe(value) {
  if(value === null || value === undefined) return value ?? null;
  if(value instanceof Date) return value.toISOString();
  if(value && typeof value.toDate === "function") return value.toDate().toISOString();
  if(Array.isArray(value)) return value.map(jsonSafe);
  if(value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

function mapRecord(document) {
  const data = typeof document.data === "function" ? document.data() : document.data;
  const id = String(document.id || data && data.mapId || "");
  return {id, data: jsonSafe(data || {})};
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function encodedManifest(payload) {
  return gzipSync(Buffer.from(`${JSON.stringify(payload)}\n`, "utf8"), {
    level: 9,
    mtime: 0
  });
}

function buildCatalogArtifacts(documents, ready = true) {
  const records = documents.map(mapRecord)
    .filter(item => item.id && ["active", "inactive"].includes(item.data.status))
    .sort((left, right) => left.id.localeCompare(right.id));
  const serverMaps = records.map(({id, data}) => Object.fromEntries(
    SERVER_MAP_FIELDS.map(field => [field, field === "mapId" ? id : data[field] ?? null])
  ));
  const generationSource = JSON.stringify({schemaVersion: 2, ready:Boolean(ready), maps:serverMaps});
  const generation = digest(generationSource).slice(0, 24);
  const server = encodedManifest({
    schemaVersion: 2,
    generation,
    ready: Boolean(ready),
    maps: serverMaps
  });
  const publicMaps = records
    .filter(item => item.data.status === "active")
    .map(({id, data}) => ({...data, id, mapId:id}));
  const publicManifest = encodedManifest({
    schemaVersion: 1,
    generation,
    maps: publicMaps
  });
  const serverSha256 = digest(server);
  const publicSha256 = digest(publicManifest);
  return {
    generation,
    mapCount: records.length,
    activeMapCount: publicMaps.length,
    server,
    serverSha256,
    serverPath: `_catalog/server/${generation}-${serverSha256.slice(0, 16)}.json.gz`,
    public: publicManifest,
    publicSha256,
    publicPath: `_catalog/public/${generation}-${publicSha256.slice(0, 16)}.json.gz`
  };
}

module.exports = {buildCatalogArtifacts, jsonSafe};
