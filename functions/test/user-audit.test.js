"use strict";

const assert = require("node:assert/strict");
const {describe, it} = require("node:test");
const {
  SESSION_INTERVAL_MS,
  UserAuditError,
  createUserAuditController,
  requestIp
} = require("../user-audit");

describe("cross-system user audit", () => {
  it("records a bounded website session using the verified identity and request IP", async () => {
    const writes = [];
    const controller = createUserAuditController({
      verifyToken: async token => {
        assert.equal(token, "valid");
        return {uid: "web-user", name: "Website Racer"};
      },
      events: {
        async recordSession(event, interval) {
          writes.push(event);
          assert.equal(interval, SESSION_INTERVAL_MS);
          return true;
        }
      },
      now: () => 123456
    });

    const result = await controller.recordSession({
      idToken: "valid",
      ipAddress: "203.0.113.8",
      userAgent: "Audit test browser",
      body: {path: "/live", gameUsername: "racer@tronner"}
    });

    assert.deepEqual(result, {recorded: true, occurredAt: 123456});
    assert.deepEqual(writes[0], {
      schemaVersion: 1,
      source: "website",
      action: "website_session",
      occurredAt: 123456,
      websiteUid: "web-user",
      websiteName: "Website Racer",
      gameUsername: "racer@tronner",
      ipAddress: "203.0.113.8",
      path: "/live",
      userAgent: "Audit test browser"
    });
  });

  it("rejects missing or invalid signed-in identities", async () => {
    const controller = createUserAuditController({
      verifyToken: async () => ({uid: "bad uid"}),
      events: {recordSession: async () => true}
    });
    await assert.rejects(
      () => controller.recordSession({idToken: "valid", body: {}}),
      error => error instanceof UserAuditError && error.code === "invalid-identity"
    );
    await assert.rejects(
      () => controller.recordSession({idToken: "", body: {}}),
      error => error instanceof UserAuditError && error.code === "sign-in-required"
    );
  });

  it("normalizes IPv4-mapped addresses from the trusted request object", () => {
    assert.equal(
      requestIp({ip: "::ffff:198.51.100.4", get: () => ""}),
      "198.51.100.4"
    );
  });
});
