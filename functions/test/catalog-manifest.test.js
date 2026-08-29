"use strict";

const assert = require("node:assert/strict");
const {gunzipSync} = require("node:zlib");
const test = require("node:test");
const {buildCatalogArtifacts} = require("../catalog-manifest");

test("catalog artifacts separate public active maps from the server catalog", () => {
  const documents = [
    {
      id: "active-id",
      data: () => ({
        status: "active", authorId: "author", authorName: "Tester",
        category: "maps", mapName: "Race", mapVersion: "v1",
        activeRevisionId: "revision-1", storagePath: "_revisions/active",
        resourcePath: "Tester/maps/Race-v1.aamap.xml", sha256: "a".repeat(64),
        createdAt: new Date("2026-01-01T00:00:00Z")
      })
    },
    {
      id: "inactive-id",
      data: () => ({
        status: "inactive", authorId: "author", authorName: "Tester",
        category: "maps", mapName: "Hidden", mapVersion: "v1",
        activeRevisionId: "revision-2", storagePath: "_revisions/inactive",
        resourcePath: "Tester/maps/Hidden-v1.aamap.xml", sha256: "b".repeat(64)
      })
    }
  ];
  const artifacts = buildCatalogArtifacts(documents, true);
  const server = JSON.parse(gunzipSync(artifacts.server));
  const publicManifest = JSON.parse(gunzipSync(artifacts.public));

  assert.equal(server.maps.length, 2);
  assert.equal(publicManifest.maps.length, 1);
  assert.equal(publicManifest.maps[0].mapId, "active-id");
  assert.equal(publicManifest.maps[0].createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(server.generation, publicManifest.generation);
  assert.match(artifacts.serverPath, /^_catalog\/server\//);
  assert.match(artifacts.publicPath, /^_catalog\/public\//);
});

test("identical catalogs produce identical immutable artifacts", () => {
  const documents = [{
    id: "map-id",
    data: {status:"active", mapName:"Race", mapVersion:"v1"}
  }];
  const first = buildCatalogArtifacts(documents);
  const second = buildCatalogArtifacts(documents);
  assert.equal(first.generation, second.generation);
  assert.equal(first.serverSha256, second.serverSha256);
  assert.equal(first.publicSha256, second.publicSha256);
});
