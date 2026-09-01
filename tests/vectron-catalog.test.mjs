import assert from "node:assert/strict";
import {
    activeResourcePath,
    authorKey,
    authorNameError,
    bumpMapVersion,
    categoryError,
    firebaseStorageMediaUrl,
    mapFileCommand,
    mapFileName,
    mapNameError,
    mapRatingSummary,
    normalizeCategory,
    normalizeMapVersion,
    mapVersionError,
    normalizeAuthorName,
    resourceIdentityFromXml,
    resourceKey,
    revisionStoragePath,
    rewriteResourceIdentity,
    safeMapName
} from "../js/catalog.js";

assert.equal(normalizeMapVersion("v3"), "v3");
assert.deepEqual(mapRatingSummary(4.25, 4), {
    average:4.25,
    count:4,
    label:"4.25/5",
    description:"4.25/5 from 4 ratings."
});
assert.equal(mapRatingSummary(5, 1).description, "5.00/5 from 1 rating.");
assert.deepEqual(mapRatingSummary(null, 0), {
    average:null,
    count:0,
    label:"Unrated",
    description:"This map has not been rated yet."
});
assert.equal(mapRatingSummary(Number.NaN, 3).label, "Unrated");
assert.equal(mapRatingSummary(6, 1).label, "Unrated");
assert.equal(normalizeMapVersion("0.1"), "0.1");
assert.equal(normalizeMapVersion("bad/$ version 💥"), "bad/$ version 💥");
assert.equal(mapVersionError("bad/$ version 💥"), "");
assert.equal(mapNameError("Track / \"quoted\" & 💥"), "");
assert.equal(safeMapName("Track / \"quoted\" & 💥"), "Track / \"quoted\" & 💥");
assert.equal(normalizeAuthorName("  Lover$Boy / O'Brien 💥  "), "Lover$Boy / O'Brien 💥");
assert.equal(bumpMapVersion("v9"), "v10");
assert.equal(bumpMapVersion("0.1"), "0.2");
assert.equal(bumpMapVersion("release/$"), "release/$.1");
assert.equal(bumpMapVersion("release/$.9"), "release/$.10");
assert.equal(revisionStoragePath("uid", "submission"), "_revisions/uid/submission");
assert.equal(
    revisionStoragePath("uid", "submission", "Tree Fiddy", "v5"),
    "_revisions/uid/submission/Tree Fiddy-v5.aamap.xml"
);
assert.equal(
    firebaseStorageMediaUrl("maps.example", "_revisions/uid/id/Map-v1.aamap.xml"),
    "https://firebasestorage.googleapis.com/v0/b/maps.example/o/" +
        "_revisions%2Fuid%2Fid%2FMap-v1.aamap.xml?alt=media"
);
assert.equal(
    mapFileCommand(
        "maps.example", "_revisions/uid/id/Tree Fiddy-v5.aamap.xml",
        "Tree Fiddy", "v5"
    ),
    "MAP_FILE \"Tree Fiddy-v5.aamap.xml(" +
        "https://firebasestorage.googleapis.com/v0/b/maps.example/o/" +
        "_revisions%2Fuid%2Fid%2FTree%20Fiddy-v5.aamap.xml?alt=media)\""
);
assert.equal(activeResourcePath("Zwazi", "maps", "Tree Fiddy", "v5"),
    "Zwazi/maps/Tree Fiddy-v5.aamap.xml");
const specialFileName = mapFileName("Track / \"quoted\" & 💥", "release/$ (one)");
assert.match(specialFileName, /^~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.aamap\.xml$/);
assert.equal(specialFileName.includes("/"), false,
    "Reserved identity characters must not create a nested Storage path");
const specialPath = activeResourcePath(
    "Lover$Boy / O'Brien 💥", "maps", "Track / \"quoted\" & 💥", "release/$ (one)"
);
assert.equal(specialPath.split("/").length, 3,
    "An arbitrary author, name, and version must remain one catalog resource path");
assert.match(specialPath, /^~[A-Za-z0-9_-]+\/maps\/~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.aamap\.xml$/);
assert.equal(
    revisionStoragePath("uid", "submission", "Track / \"quoted\" & 💥", "release/$ (one)"),
    `_revisions/uid/submission/${specialFileName}`
);
assert.equal(authorKey("  Zwazi  "), authorKey("zwazi"));
assert.equal(authorNameError("$"), "");
assert.equal(authorNameError("O'Brien / 💥"), "");
assert.equal(resourceKey("Zwazi/maps/Tree Fiddy-v5.aamap.xml"),
    "resource_WndhemkvbWFwcy9UcmVlIEZpZGR5LXY1LmFhbWFwLnhtbA");
assert.equal(authorNameError("Valid Author"), "");
assert.match(resourceKey("💥".repeat(1000)), /^resource_sha256_[0-9a-f]{64}$/,
    "Long Unicode paths use a Firestore-safe deterministic key");
assert.equal(categoryError("maps/sub"),
    "Use 1–60 letters, numbers, periods, hyphens, or underscores, with no slashes.");
assert.equal(normalizeCategory("race_maps"), "race_maps");

const xml = `<?xml version="1.0"?>
<!DOCTYPE Resource SYSTEM "map-0.2.8.dtd">
<Resource type="aamap" name="Old" author="Old Author" version="v1" category="maps">
  <Map><World><Field><Spawn x="0" y="0" xdir="1" ydir="0"/></Field></World></Map>
</Resource>`;
const rewritten = rewriteResourceIdentity(xml, {
    author: `New $& O'Brien / \"Author\" 💥`,
    category: "race",
    name: `Map > < & \"quoted\" O'Brien / $& 💥`,
    version: "release/$& > 2"
});
assert.match(rewritten, /author="New \$&amp; O'Brien \/ &quot;Author&quot; 💥"/);
assert.match(rewritten, /category="race"/);
assert.match(rewritten, /version="release\/\$&amp; &gt; 2"/);
assert.match(rewritten, /<!DOCTYPE Resource SYSTEM "map-0\.2\.8\.dtd">/);
assert.deepEqual(resourceIdentityFromXml(rewritten), {
    author: `New $& O'Brien / \"Author\" 💥`,
    category: "race",
    name: `Map > < & \"quoted\" O'Brien / $& 💥`,
    version: "release/$& > 2"
});

console.log("Vectron Firebase catalog helpers passed.");
