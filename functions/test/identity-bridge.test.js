"use strict";

const assert = require("node:assert/strict");
const {describe, it} = require("node:test");
const {
  IdentityBridgeError,
  createIdentityBridgeController
} = require("../identity-bridge");

function harness({link = null, existing = null, decoded = {uid: "neotron-user", email: "racer@example.test", name: "Racer"}} = {}) {
  const created = [];
  const tokens = [];
  const repositoryAuth = {
    async getUser(uid) {
      if(!existing) throw Object.assign(new Error("missing"), {code: "auth/user-not-found"});
      return {...existing, uid};
    },
    async createUser(input) {
      created.push(input);
      return {...input, disabled: false, customClaims: {}};
    },
    async createCustomToken(uid, claims) {
      tokens.push({uid, claims});
      return `token:${uid}`;
    }
  };
  return {
    created,
    tokens,
    controller: createIdentityBridgeController({
      verifyNeotronToken: async token => {
        if(token !== "valid") throw new Error("invalid");
        return decoded;
      },
      repositoryAuth,
      links: {get: async () => link}
    })
  };
}

describe("Neotron identity bridge", () => {
  it("keeps the same UID for a new linked repository account", async () => {
    const test = harness();
    const result = await test.controller.exchange("valid");
    assert.equal(result.repositoryUid, "neotron-user");
    assert.equal(test.created[0].uid, "neotron-user");
    assert.deepEqual(test.tokens[0].claims, {neotron: true, neotronUid: "neotron-user"});
  });

  it("maps a merged identity to its existing repository UID and preserves admin", async () => {
    const test = harness({
      link: {repositoryUid: "legacy-vectron-user", admin: true},
      existing: {disabled: false, customClaims: {admin: true, role: "admin"}}
    });
    const result = await test.controller.exchange("valid");
    assert.equal(result.repositoryUid, "legacy-vectron-user");
    assert.deepEqual(test.tokens[0], {
      uid: "legacy-vectron-user",
      claims: {neotron: true, neotronUid: "neotron-user", admin: true, role: "admin"}
    });
  });

  it("rejects an invalid Neotron token without creating a user", async () => {
    const test = harness();
    await assert.rejects(() => test.controller.exchange("bad"), error =>
      error instanceof IdentityBridgeError && error.status === 401
    );
    assert.equal(test.created.length, 0);
  });

  it("honors a blocked private account link", async () => {
    const test = harness({link: {status: "blocked"}});
    await assert.rejects(() => test.controller.exchange("valid"), error =>
      error instanceof IdentityBridgeError && error.status === 403
    );
  });
});
