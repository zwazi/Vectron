"use strict";

const {createHash} = require("node:crypto");

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

class RacingRatingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RacingRatingError";
    this.status = status;
    this.code = code;
  }
}

function cleanIdentityText(value, maximum) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim().slice(0, maximum);
}

function publicPlayerId(identityKey) {
  return createHash("sha256").update(`racing:${identityKey}`).digest("hex").slice(0, 24);
}

function firestoreValue(value) {
  if(!value || typeof value !== "object") return null;
  if(Object.hasOwn(value, "stringValue")) return String(value.stringValue);
  if(Object.hasOwn(value, "booleanValue")) return value.booleanValue === true;
  if(Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if(Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if(Object.hasOwn(value, "timestampValue")) return String(value.timestampValue);
  return null;
}

function firestoreProfileRepository({fetchImpl = globalThis.fetch} = {}) {
  if(typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  return {
    async get(uid, idToken) {
      const url = "https://firestore.googleapis.com/v1/projects/neotron-7ba2a/" +
        `databases/(default)/documents/users/${encodeURIComponent(uid)}`;
      const response = await fetchImpl(url, {
        method:"GET",
        headers:{Authorization:`Bearer ${idToken}`}
      });
      if(response.status === 404) return null;
      if(!response.ok) {
        throw new RacingRatingError(
          response.status === 401 || response.status === 403 ? 401 : 503,
          "profile-unavailable",
          "Your Neotron profile could not be verified. Sign in again and retry."
        );
      }
      const document = await response.json();
      return Object.fromEntries(
        Object.entries(document.fields || {}).map(([key, value]) => [key, firestoreValue(value)])
      );
    }
  };
}

function createRacingRatingController({
  verifyToken,
  verifyAppCheck,
  profiles,
  rateLimits,
  commands,
  now = () => Date.now()
}) {
  if(
    typeof verifyToken !== "function" || typeof verifyAppCheck !== "function" ||
    !profiles || !rateLimits || !commands
  ) {
    throw new TypeError("Racing rating dependencies are required.");
  }
  return {
    async submit({idToken, appCheckToken, body}) {
      if(!idToken) {
        throw new RacingRatingError(401, "sign-in-required", "Sign in before rating a map.");
      }
      if(!appCheckToken || String(appCheckToken).length > 8192) {
        throw new RacingRatingError(401, "browser-verification-required", "The rating request could not be verified.");
      }
      let decoded;
      try {
        [decoded] = await Promise.all([
          verifyToken(idToken),
          verifyAppCheck(appCheckToken)
        ]);
      } catch {
        throw new RacingRatingError(401, "invalid-session", "Your session expired. Sign in again.");
      }
      const uid = String(decoded?.uid || decoded?.sub || "");
      if(!UID_PATTERN.test(uid)) {
        throw new RacingRatingError(401, "invalid-identity", "Your account identity is invalid.");
      }
      const data = body && typeof body === "object" ? body : {};
      const rawRatingKey = String(data.ratingKey || "");
      const ratingKey = rawRatingKey.normalize("NFKC").trim();
      const rating = Number(data.rating);
      if(
        !ratingKey || ratingKey !== rawRatingKey || ratingKey.length > 1024 ||
        CONTROL_PATTERN.test(ratingKey)
      ) {
        throw new RacingRatingError(400, "invalid-map", "Choose a valid racing map.");
      }
      if(!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new RacingRatingError(400, "invalid-rating", "Choose a rating from 1 to 5.");
      }
      const profile = await profiles.get(uid, idToken);
      if(!profile || profile.status !== "active") {
        throw new RacingRatingError(403, "inactive-account", "An active Neotron account is required to rate maps.");
      }
      if(profile.verifiedIdentity !== true) {
        throw new RacingRatingError(403, "verification-required", "Verify your Neotron account before rating maps.");
      }
      const displayName = cleanIdentityText(profile.displayName || decoded.name || "Racer", 40) || "Racer";
      const gameUsername = cleanIdentityText(profile.gameUsername, 64);
      const requestedAt = now();
      await rateLimits.reserve(uid, requestedAt);
      const commandId = await commands.enqueue({
        schemaVersion:1,
        state:"queued",
        ratingKey,
        rating,
        websiteUid:uid,
        displayName,
        gameUsername,
        requestedAt,
        expiresAt:requestedAt + 5 * 60 * 1000
      });
      const identityKey = gameUsername
        ? `auth:${gameUsername.toLocaleLowerCase("en-US")}`
        : `web:${uid}`;
      return {
        accepted:true,
        commandId,
        playerId:publicPlayerId(identityKey),
        name:gameUsername || displayName,
        racingProfile:Boolean(gameUsername),
        rating,
        ratedAt:requestedAt
      };
    }
  };
}

module.exports = {
  RacingRatingError,
  createRacingRatingController,
  firestoreProfileRepository,
  publicPlayerId
};
