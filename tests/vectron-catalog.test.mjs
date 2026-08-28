import assert from "node:assert/strict";
import {
    activeResourcePath,
    authorKey,
    authorNameError,
    bumpMapVersion,
    categoryError,
    normalizeCategory,
    normalizeMapVersion,
    resourceIdentityFromXml,
    resourceKey,
    revisionStoragePath,
    rewriteResourceIdentity
} from "../js/catalog.js";

assert.equal(normalizeMapVersion("v3"), "v3");
assert.equal(normalizeMapVersion("0.1"), "0.1");
assert.equal(normalizeMapVersion("bad"), "v1");
assert.equal(bumpMapVersion("v9"), "v10");
assert.equal(bumpMapVersion("0.1"), "0.2");
assert.equal(revisionStoragePath("uid", "submission"), "_revisions/uid/submission");
assert.equal(activeResourcePath("Zwazi", "maps", "Tree Fiddy", "v5"),
    "Zwazi/maps/Tree Fiddy-v5.aamap.xml");
assert.equal(authorKey("  Zwazi  "), authorKey("zwazi"));
assert.equal(resourceKey("Zwazi/maps/Tree Fiddy-v5.aamap.xml"),
    "resource_WndhemkvbWFwcy9UcmVlIEZpZGR5LXY1LmFhbWFwLnhtbA");
assert.equal(authorNameError("A"), "Choose an author name with at least 2 characters.");
assert.equal(authorNameError("Valid Author"), "");
assert.equal(categoryError("maps/sub"),
    "Use 1–60 letters, numbers, periods, hyphens, or underscores, with no slashes.");
assert.equal(normalizeCategory("race_maps"), "race_maps");

const xml = `<?xml version="1.0"?>
<!DOCTYPE Resource SYSTEM "map-0.2.8.dtd">
<Resource type="aamap" name="Old" author="Old Author" version="v1" category="maps">
  <Map><World><Field><Spawn x="0" y="0" xdir="1" ydir="0"/></Field></World></Map>
</Resource>`;
const rewritten = rewriteResourceIdentity(xml, {
    author: "New & Author",
    category: "race",
    version: "v2"
});
assert.match(rewritten, /author="New &amp; Author"/);
assert.match(rewritten, /category="race"/);
assert.match(rewritten, /version="v2"/);
assert.match(rewritten, /<!DOCTYPE Resource SYSTEM "map-0\.2\.8\.dtd">/);
assert.deepEqual(resourceIdentityFromXml(rewritten), {
    author: "New & Author",
    category: "race",
    name: "Old",
    version: "v2"
});

console.log("Vectron Firebase catalog helpers passed.");
