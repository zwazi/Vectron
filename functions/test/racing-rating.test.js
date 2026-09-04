"use strict";

const assert = require("node:assert/strict");
const {describe, it} = require("node:test");
const {
  RacingRatingError,
  createRacingRatingController,
  firestoreProfileRepository,
  publicPlayerId
} = require("../racing-rating");

function harness(profile = {
  status:"active",
  verifiedIdentity:true,
  displayName:"Website Racer",
  gameUsername:"LinkedRacer"
}) {
  const reservations = [];
  const queued = [];
  return {
    reservations,
    queued,
    controller:createRacingRatingController({
      verifyToken:async token => {
        assert.equal(token, "identity-token");
        return {uid:"web-user", name:"Token Name"};
      },
      verifyAppCheck:async token => assert.equal(token, "app-check-token"),
      profiles:{get:async (uid, token) => {
        assert.equal(uid, "web-user");
        assert.equal(token, "identity-token");
        return profile;
      }},
      rateLimits:{reserve:async (...input) => reservations.push(input)},
      commands:{enqueue:async command => {
        queued.push(command);
        return "command-1";
      }},
      now:() => 123456
    })
  };
}

describe("website racing-map ratings", () => {
  it("queues a trusted linked-game identity and returns its public id", async () => {
    const test = harness();
    const result = await test.controller.submit({
      idToken:"identity-token",
      appCheckToken:"app-check-token",
      body:{ratingKey:"map-id", rating:5}
    });
    assert.deepEqual(test.reservations, [["web-user", 123456]]);
    assert.deepEqual(test.queued[0], {
      schemaVersion:1,
      state:"queued",
      ratingKey:"map-id",
      rating:5,
      websiteUid:"web-user",
      displayName:"Website Racer",
      gameUsername:"LinkedRacer",
      requestedAt:123456,
      expiresAt:423456
    });
    assert.deepEqual(result, {
      accepted:true,
      commandId:"command-1",
      playerId:publicPlayerId("auth:linkedracer"),
      name:"LinkedRacer",
      racingProfile:true,
      rating:5,
      ratedAt:123456
    });
  });

  it("uses one stable website identity when no game account is linked", async () => {
    const test = harness({
      status:"active",
      verifiedIdentity:true,
      displayName:"Web Only",
      gameUsername:""
    });
    const result = await test.controller.submit({
      idToken:"identity-token",
      appCheckToken:"app-check-token",
      body:{ratingKey:"map-id", rating:3}
    });
    assert.equal(result.playerId, publicPlayerId("web:web-user"));
    assert.equal(result.racingProfile, false);
    assert.equal(test.queued[0].gameUsername, "");
  });

  it("rejects invalid values and inactive or unverified profiles", async () => {
    const test = harness();
    await assert.rejects(
      () => test.controller.submit({idToken:"identity-token", appCheckToken:"app-check-token", body:{ratingKey:" map ", rating:6}}),
      error => error instanceof RacingRatingError && error.status === 400
    );
    const inactive = harness({status:"disabled", verifiedIdentity:true});
    await assert.rejects(
      () => inactive.controller.submit({idToken:"identity-token", appCheckToken:"app-check-token", body:{ratingKey:"map", rating:4}}),
      error => error instanceof RacingRatingError && error.code === "inactive-account"
    );
    const unverified = harness({status:"active", verifiedIdentity:false});
    await assert.rejects(
      () => unverified.controller.submit({idToken:"identity-token", appCheckToken:"app-check-token", body:{ratingKey:"map", rating:4}}),
      error => error instanceof RacingRatingError && error.code === "verification-required"
    );
  });

  it("decodes the signed-in user's Firestore REST profile", async () => {
    const requests = [];
    const profiles = firestoreProfileRepository({fetchImpl:async (url, options) => {
      requests.push({url, options});
      return {
        ok:true,
        status:200,
        async json() {
          return {fields:{
            status:{stringValue:"active"},
            displayName:{stringValue:"REST Racer"},
            verifiedIdentity:{booleanValue:true}
          }};
        }
      };
    }});
    assert.deepEqual(await profiles.get("user-1", "secret-token"), {
      status:"active",
      displayName:"REST Racer",
      verifiedIdentity:true
    });
    assert.match(requests[0].url, /documents\/users\/user-1$/u);
    assert.equal(requests[0].options.headers.Authorization, "Bearer secret-token");
  });
});
