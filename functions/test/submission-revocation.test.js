"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {validateSubmissionRevocation} = require("../submission-revocation");

const pending = {
  submittedBy:"owner-1",
  status:"pending",
  storagePath:"_revisions/owner-1/review-1/map-1.aamap.xml"
};

test("only the owner can revoke the exact pending revision", () => {
  assert.equal(
    validateSubmissionRevocation(pending, "owner-1", pending.storagePath),
    pending
  );
  assert.throws(
    () => validateSubmissionRevocation(pending, "owner-2", pending.storagePath),
    error => error.status === 403
  );
  assert.throws(
    () => validateSubmissionRevocation({...pending, status:"approved"}, "owner-1", pending.storagePath),
    error => error.status === 409
  );
  assert.throws(
    () => validateSubmissionRevocation(pending, "owner-1", "_revisions/owner-1/review-2/map-1.aamap.xml"),
    error => error.status === 409
  );
});
