"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getAppCheck} = require("firebase-admin/app-check");
const {getAuth} = require("firebase-admin/auth");
const {getDatabase} = require("firebase-admin/database");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const {createHash} = require("node:crypto");
const logger = require("firebase-functions/logger");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {buildCatalogArtifacts} = require("./catalog-manifest");
const {validateSubmissionRevocation} = require("./submission-revocation");
const {
  IdentityBridgeError,
  bearerToken,
  createIdentityBridgeController,
  firestoreLinkRepository
} = require("./identity-bridge");
const {
  RacingRatingError,
  createRacingRatingController,
  firestoreProfileRepository
} = require("./racing-rating");
const {
  UserAuditError,
  bearerToken: auditBearerToken,
  createUserAuditController,
  realtimeUserAuditRepository,
  requestIp
} = require("./user-audit");

initializeApp();
const neotronApp = getApps().find(app => app.name === "neotron-identity") ||
  initializeApp({projectId: "neotron-7ba2a"}, "neotron-identity");

const adminAuth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();
const neotronAuth = getAuth(neotronApp);
const MAP_CATEGORY = "maps";
const MAX_MAP_BYTES = 2 * 1024 * 1024;
const SUBMISSION_GRANT_LIFETIME_MS = 10 * 60 * 1000;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000;
const SUBMISSION_RATE_MINIMUM_GAP_MS = 30 * 1000;
const SUBMISSION_RATE_MAXIMUM = 5;
const allowedOrigins = [
  "https://tronner.io",
  "https://www.tronner.io",
  "https://vectron.tronner.io",
  "https://zwazi.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

const identityBridge = createIdentityBridgeController({
  // Cross-project verification can validate the Neotron signature/audience
  // without granting the repository service account access to Neotron users.
  // Revoked tokens naturally expire within one hour; the Neotron handoff also
  // performs the same-project disabled/profile check before minting a token.
  verifyNeotronToken: token => neotronAuth.verifyIdToken(token),
  repositoryAuth: adminAuth,
  links: firestoreLinkRepository(db)
});

const racingRating = createRacingRatingController({
  verifyToken:token => neotronAuth.verifyIdToken(token),
  verifyAppCheck:token => getAppCheck().verifyToken(token),
  profiles:firestoreProfileRepository(),
  rateLimits:{
    async reserve(uid, requestedAt) {
      const reference = db.collection("racingRatingRateLimits").doc(uid);
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const previous = snapshot.exists ? snapshot.data() : {};
        const windowStartedAt = Number(previous.windowStartedAt || 0);
        const lastRequestedAt = Number(previous.lastRequestedAt || 0);
        const sameWindow = requestedAt - windowStartedAt < 60 * 60 * 1000;
        const count = sameWindow ? Number(previous.count || 0) : 0;
        if(requestedAt - lastRequestedAt < 1500 || count >= 60) {
          throw new RacingRatingError(
            429,
            "rate-limited",
            "Please wait before changing another map rating."
          );
        }
        transaction.set(reference, {
          windowStartedAt:sameWindow ? windowStartedAt : requestedAt,
          lastRequestedAt:requestedAt,
          count:count + 1
        });
      });
    }
  },
  commands:{
    async enqueue(command) {
      const reference = getDatabase().ref("racing/ratingCommands/nyc1").push();
      await reference.set(command);
      return reference.key;
    }
  }
});

exports.exchangeNeotronIdentity = onRequest({
  region: "us-central1",
  cors: allowedOrigins,
  timeoutSeconds: 15,
  memory: "256MiB"
}, async (request, response) => {
  response.set("Cache-Control", "no-store, max-age=0");
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST to open Vectron.");
    return;
  }
  try {
    response.status(200).json(await identityBridge.exchange(bearerToken(request)));
  } catch(error) {
    if(!(error instanceof IdentityBridgeError)) {
      logger.error("Neotron identity bridge failed", {
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || "Unknown error").slice(0, 300)
      });
    }
    response.status(error instanceof IdentityBridgeError ? error.status : 500).json({
      error: {
        code: error instanceof IdentityBridgeError ? error.code : "internal-error",
        message: error instanceof IdentityBridgeError
          ? error.message
          : "Vectron could not open this Neotron account."
      }
    });
  }
});

exports.submitRacingMapRating = onRequest({
  region:"us-central1",
  cors:allowedOrigins,
  timeoutSeconds:15,
  memory:"256MiB"
}, async (request, response) => {
  response.set("Cache-Control", "no-store, max-age=0");
  response.set("X-Content-Type-Options", "nosniff");
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST to rate a map.");
    return;
  }
  try {
    const result = await racingRating.submit({
      idToken:bearerToken(request),
      appCheckToken:String(request.get("x-firebase-appcheck") || ""),
      body:request.body
    });
    response.status(202).json(result);
  } catch(error) {
    if(!(error instanceof RacingRatingError)) {
      logger.error("Racing map rating failed", {
        errorName:error?.name || "Error",
        errorMessage:String(error?.message || "Unknown error").slice(0, 300)
      });
    }
    response.status(error instanceof RacingRatingError ? error.status : 500).json({
      error:{
        code:error instanceof RacingRatingError ? error.code : "internal-error",
        message:error instanceof RacingRatingError
          ? error.message
          : "The map rating could not be submitted."
      }
    });
  }
});

exports.recordNeotronActivity = onRequest({
  region: "us-central1",
  cors: allowedOrigins,
  timeoutSeconds: 15,
  memory: "256MiB"
}, async (request, response) => {
  response.set("Cache-Control", "no-store, max-age=0");
  response.set("X-Content-Type-Options", "nosniff");
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST to record website activity.");
    return;
  }
  try {
    const controller = createUserAuditController({
      // This cross-project app can verify Neotron signatures and audience, but
      // it intentionally has no permission to read Neotron user records for a
      // revoked-token lookup. Tokens expire within one hour, as on the existing
      // identity bridge above.
      verifyToken: token => neotronAuth.verifyIdToken(token),
      events: realtimeUserAuditRepository(getDatabase())
    });
    const result = await controller.recordSession({
      idToken: auditBearerToken(request),
      body: request.body && typeof request.body === "object" ? request.body : {},
      ipAddress: requestIp(request),
      userAgent: request.get("user-agent") || ""
    });
    response.status(200).json(result);
  } catch(error) {
    if(!(error instanceof UserAuditError)) {
      logger.error("Website activity audit failed", {
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || "Unknown error").slice(0, 300)
      });
    }
    response.status(error instanceof UserAuditError ? error.status : 500).json({
      error: {
        code: error instanceof UserAuditError ? error.code : "internal-error",
        message: error instanceof UserAuditError
          ? error.message
          : "Website activity could not be recorded."
      }
    });
  }
});

function requestError(response, status, message) {
  response.status(status).json({error: message});
}

async function authenticatedUser(request) {
  const authorization = String(request.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if(!match) throw Object.assign(new Error("Sign in before submitting a map."), {status: 401});
  const appCheckToken = String(request.get("x-firebase-appcheck") || "");
  if(!appCheckToken || appCheckToken.length > 8192) {
    throw Object.assign(new Error("Vectron could not verify this browser."), {status: 401});
  }
  try {
    const [user] = await Promise.all([
      adminAuth.verifyIdToken(match[1], true),
      getAppCheck().verifyToken(appCheckToken)
    ]);
    return user;
  } catch {
    throw Object.assign(new Error("Vectron could not verify this browser."), {status: 401});
  }
}

async function authenticatedAdmin(request) {
  const token = await authenticatedUser(request);
  if(token.admin !== true) {
    throw Object.assign(new Error("Only a Vectron admin may delete users."), {status: 403});
  }
  return token;
}

function httpError(status, message) {
  return Object.assign(new Error(message), {status});
}

const LEGACY_AUTHOR_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const LEGACY_MAP_NAME_PATTERN = /^[\p{L}\p{N} ._-]+$/u;
const LEGACY_VERSION_PATTERN = /^(v)?\d+(?:\.\d+)*$/i;

function normalizedIdentityText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function legacyMapName(value) {
  return value.length <= 100 && LEGACY_MAP_NAME_PATTERN.test(value) &&
    !/^[. ]|[. ]$| {2,}/.test(value);
}

function authorPathSegment(value) {
  const author = normalizedIdentityText(value);
  return LEGACY_AUTHOR_PATTERN.test(author) ? author : `~${base64Url(author)}`;
}

function mapFileName(mapName, mapVersion) {
  if(legacyMapName(mapName) && LEGACY_VERSION_PATTERN.test(mapVersion)) {
    return `${mapName}-${mapVersion}.aamap.xml`;
  }
  return `~${base64Url(mapName)}.${base64Url(mapVersion)}.aamap.xml`;
}

function resourceKey(value) {
  const normalized = String(value ?? "").normalize("NFKC");
  const encoded = base64Url(normalized);
  return encoded.length <= 1400
    ? `resource_${encoded}`
    : `resource_sha256_${createHash("sha256").update(normalized).digest("hex")}`;
}

function submissionPayload(body) {
  const data = body && typeof body === "object" ? body : {};
  const string = (name, maximum = 1000) => String(data[name] ?? "").trim().slice(0, maximum);
  const identity = (name, maximum, label) => {
    const raw = String(data[name] ?? "");
    const normalized = normalizedIdentityText(raw);
    if(!normalized || Array.from(normalized).length > maximum || raw !== normalized) {
      throw httpError(400, `The map ${label} is invalid.`);
    }
    return normalized;
  };
  const payload = {
    submissionId: string("submissionId", 128),
    mapId: string("mapId", 128),
    operation: string("operation", 32),
    authorId: string("authorId", 1024),
    authorName: identity("authorName", 60, "author"),
    category: string("category", 60),
    mapName: identity("mapName", 100, "name"),
    mapVersion: identity("mapVersion", 64, "version"),
    storagePath: string("storagePath", 2048),
    sourceRevisionId: string("sourceRevisionId", 128),
    sourceMapId: string("sourceMapId", 128),
    resubmissionOf: string("resubmissionOf", 128),
    replacesSubmissionId: string("replacesSubmissionId", 128),
    submissionReason: string("submissionReason", 1000),
    sha256: string("sha256", 64),
    contentSha256: string("contentSha256", 64),
    clientMapId: string("clientMapId", 128),
    contentBytes: Number(data.contentBytes)
  };
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(payload.submissionId) ||
     !/^[A-Za-z0-9_-]{1,128}$/.test(payload.mapId)) {
    throw httpError(400, "The submission or map identifier is invalid.");
  }
  if(!["create", "edit", "metadata", "size"].includes(payload.operation)) {
    throw httpError(400, "The map operation is invalid.");
  }
  if(!payload.authorId || payload.category !== MAP_CATEGORY) {
    throw httpError(400, "The map name, version, or category is invalid.");
  }
  if(!/^[0-9a-f]{64}$/.test(payload.sha256) ||
     !/^[0-9a-f]{64}$/.test(payload.contentSha256) ||
     !/^[A-Za-z0-9._:-]{1,128}$/.test(payload.clientMapId) ||
     !Number.isInteger(payload.contentBytes) || payload.contentBytes <= 0 ||
     payload.contentBytes >= MAX_MAP_BYTES) {
    throw httpError(400, "The submitted map checksum or size is invalid.");
  }
  if(payload.operation === "create") {
    if(payload.sourceRevisionId || payload.sourceMapId) {
      throw httpError(400, "A new map cannot identify an existing source revision.");
    }
  } else if(!payload.sourceRevisionId || payload.sourceMapId !== payload.mapId) {
    throw httpError(400, "An edited map must identify its current source revision.");
  }
  return payload;
}

function activeResourcePath(payload) {
  return `${authorPathSegment(payload.authorName)}/${MAP_CATEGORY}/` +
    mapFileName(payload.mapName, payload.mapVersion);
}

function pendingHashId(uid, sha256) {
  return `${uid}_${sha256}`;
}

function pendingClientMapId(uid, clientMapId) {
  return `${uid}_${createHash("sha256").update(clientMapId).digest("hex")}`;
}

function submissionPayloadDigest(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function timestampMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

exports.createMapSubmission = onRequest({
  region: "us-central1",
  cors: allowedOrigins,
  timeoutSeconds: 30,
  memory: "256MiB"
}, async (request, response) => {
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST for map submissions.");
    return;
  }
  try {
    const user = await authenticatedUser(request);
    const stage = String(request.body && request.body.stage || "finalize");
    if(!["reserve", "finalize"].includes(stage)) {
      throw httpError(400, "The map submission stage is invalid.");
    }
    const payload = submissionPayload(request.body);
    const payloadDigest = submissionPayloadDigest(payload);
    const accountRef = db.collection("accounts").doc(user.uid);
    const accountSnapshot = await accountRef.get();
    const account = accountSnapshot.exists ? accountSnapshot.data() : null;
    const admin = user.admin === true;
    if(!admin && (!account || account.status !== "approved" ||
       !account.authorId || !account.authorName)) {
      throw httpError(403, "Your Vectron account is not approved and linked to an author.");
    }
    if(!admin && (payload.authorId !== account.authorId ||
       payload.authorName !== normalizedIdentityText(account.authorName))) {
      throw httpError(403, "This submission does not match your linked Vectron author.");
    }
    const expectedStoragePath = `_revisions/${user.uid}/${payload.submissionId}/` +
      mapFileName(payload.mapName, payload.mapVersion);
    if(payload.storagePath !== expectedStoragePath) {
      throw httpError(400, "The uploaded revision path does not match this submission.");
    }

    const resourcePath = activeResourcePath(payload);
    const pendingResourceId = resourceKey(resourcePath);
    const submissionRef = db.collection("mapSubmissions").doc(payload.submissionId);
    const resourceRef = db.collection("resourcePaths").doc(pendingResourceId);
    const pendingRef = db.collection("pendingResourcePaths").doc(pendingResourceId);
    const resubmissionRef = payload.resubmissionOf
      ? db.collection("mapSubmissions").doc(payload.resubmissionOf) : null;
    const replacementRef = payload.replacesSubmissionId
      ? db.collection("mapSubmissions").doc(payload.replacesSubmissionId) : null;
    const hashRef = db.collection("pendingSubmissionHashes")
      .doc(pendingHashId(user.uid, payload.sha256));
    const clientMapRef = db.collection("pendingClientMaps")
      .doc(pendingClientMapId(user.uid, payload.clientMapId));
    const rateRef = db.collection("submissionRateLimits").doc(user.uid);
    const grantRef = db.collection("submissionUploadGrants").doc(payload.submissionId);

    let replacementData = null;
    let replacementPendingRef = null;
    let replacementHashRef = null;
    if(replacementRef) {
      const replacementSnapshot = await replacementRef.get();
      replacementData = replacementSnapshot.exists ? replacementSnapshot.data() : null;
      if(!replacementData || replacementData.status !== "pending" ||
         replacementData.submittedBy !== user.uid) {
        throw httpError(409, "The queued submission can no longer be updated.");
      }
      if(replacementData.pendingResourceId) {
        replacementPendingRef = db.collection("pendingResourcePaths")
          .doc(replacementData.pendingResourceId);
      }
      if(/^[0-9a-f]{64}$/.test(String(replacementData.sha256 || ""))) {
        replacementHashRef = db.collection("pendingSubmissionHashes")
          .doc(pendingHashId(user.uid, replacementData.sha256));
      }
    }

    if(stage === "reserve") {
      let reusedGrant = false;
      await db.runTransaction(async transaction => {
        const reads = await Promise.all([
          transaction.get(accountRef),
          transaction.get(submissionRef),
          transaction.get(resourceRef),
          transaction.get(pendingRef),
          resubmissionRef ? transaction.get(resubmissionRef) : Promise.resolve(null),
          replacementRef ? transaction.get(replacementRef) : Promise.resolve(null),
          transaction.get(hashRef),
          transaction.get(clientMapRef),
          transaction.get(rateRef),
          transaction.get(grantRef)
        ]);
        const [freshAccount, existingSubmission, publishedResource, pendingResource, deniedSource,
          replacementSnapshot, hashSnapshot, clientMapSnapshot, rateSnapshot, grantSnapshot] = reads;
        const now = Date.now();
        if(grantSnapshot.exists) {
          const existingGrant = grantSnapshot.data();
          if(existingGrant.ownerUid === user.uid && existingGrant.payloadDigest === payloadDigest &&
             timestampMillis(existingGrant.expiresAt) > now) {
            reusedGrant = true;
            return;
          }
          throw httpError(409, "This submission identifier already has a different upload reservation.");
        }
        const freshAccountData = freshAccount.exists ? freshAccount.data() : null;
        if(!admin && (!freshAccountData || freshAccountData.status !== "approved" ||
           freshAccountData.authorId !== payload.authorId ||
           normalizedIdentityText(freshAccountData.authorName) !== payload.authorName)) {
          throw httpError(403, "Your linked author changed before the upload was reserved.");
        }
        if(existingSubmission.exists) {
          throw httpError(409, "This submission identifier has already been used.");
        }
        const replacement = replacementSnapshot && replacementSnapshot.exists
          ? replacementSnapshot.data() : null;
        if(payload.replacesSubmissionId && (!replacement || replacement.status !== "pending" ||
           replacement.submittedBy !== user.uid)) {
          throw httpError(409, "The queued submission can no longer be updated.");
        }
        if(hashSnapshot.exists &&
           hashSnapshot.data().submissionId !== payload.replacesSubmissionId) {
          throw httpError(409, "This exact map is already waiting in the review queue.");
        }
        if(clientMapSnapshot.exists &&
           clientMapSnapshot.data().submissionId !== payload.replacesSubmissionId) {
          throw httpError(409, "This local map already has a queued submission. Update it instead.");
        }
        if(publishedResource.exists) {
          throw httpError(
            409,
            `${payload.mapName} ${payload.mapVersion} is already published. Choose a new version.`
          );
        }
        if(pendingResource.exists &&
           pendingResource.data().submissionId !== payload.replacesSubmissionId) {
          throw httpError(
            409,
            `${payload.mapName} ${payload.mapVersion} is already pending review. ` +
            "Edit that submission or choose a new version."
          );
        }
        if(payload.resubmissionOf) {
          const denied = deniedSource && deniedSource.exists ? deniedSource.data() : null;
          if(!denied || denied.status !== "denied" || denied.submittedBy !== user.uid ||
             denied.mapId !== payload.mapId || denied.operation !== payload.operation ||
             denied.authorId !== payload.authorId ||
             String(denied.sourceRevisionId || "") !== payload.sourceRevisionId) {
            throw httpError(409, "The denied review is not valid for this resubmission.");
          }
        }
        if(!admin && rateSnapshot.exists) {
          const rate = rateSnapshot.data();
          const windowStarted = timestampMillis(rate.windowStartedAt);
          const lastReserved = timestampMillis(rate.lastReservedAt);
          if(now - lastReserved < SUBMISSION_RATE_MINIMUM_GAP_MS) {
            throw httpError(429, "Please wait 30 seconds before reserving another map upload.");
          }
          if(now - windowStarted < SUBMISSION_RATE_WINDOW_MS &&
             Number(rate.count || 0) >= SUBMISSION_RATE_MAXIMUM) {
            throw httpError(429, "This account reached the hourly map upload limit.");
          }
        }
        transaction.create(grantRef, {
          ...payload,
          ownerUid: user.uid,
          payloadDigest,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(now + SUBMISSION_GRANT_LIFETIME_MS)
        });
        if(!admin) {
          const previousRate = rateSnapshot.exists ? rateSnapshot.data() : {};
          const previousStart = timestampMillis(previousRate.windowStartedAt);
          const continuing = now - previousStart < SUBMISSION_RATE_WINDOW_MS;
          transaction.set(rateRef, {
            windowStartedAt: continuing && previousRate.windowStartedAt
              ? previousRate.windowStartedAt : FieldValue.serverTimestamp(),
            count: continuing ? Number(previousRate.count || 0) + 1 : 1,
            lastReservedAt: FieldValue.serverTimestamp()
          });
        }
      });
      logger.info("Vectron map upload reserved", {
        submissionId: payload.submissionId,
        mapId: payload.mapId,
        resourcePath,
        submittedBy: user.uid,
        reusedGrant
      });
      response.status(reusedGrant ? 200 : 201).json({
        reserved: true,
        submissionId: payload.submissionId,
        expiresInSeconds: Math.floor(SUBMISSION_GRANT_LIFETIME_MS / 1000)
      });
      return;
    }

    const grantSnapshot = await grantRef.get();
    const grant = grantSnapshot.exists ? grantSnapshot.data() : null;
    if(!grant || grant.ownerUid !== user.uid || grant.payloadDigest !== payloadDigest ||
       timestampMillis(grant.expiresAt) <= Date.now()) {
      throw httpError(409, "This upload reservation is missing or expired. Please submit again.");
    }

    let objectMetadata;
    try {
      [objectMetadata] = await bucket.file(payload.storagePath).getMetadata();
    } catch(error) {
      if(error && Number(error.code) === 404) {
        throw httpError(400, "The uploaded map revision could not be found.");
      }
      throw error;
    }
    const custom = objectMetadata.metadata || {};
    if(Number(objectMetadata.size) !== payload.contentBytes ||
       !String(objectMetadata.contentType || "").startsWith("application/xml") ||
       custom.ownerUid !== user.uid || custom.submissionId !== payload.submissionId ||
       custom.authorId !== payload.authorId || custom.authorName !== payload.authorName ||
       custom.category !== MAP_CATEGORY || custom.mapName !== payload.mapName ||
       custom.mapVersion !== payload.mapVersion || custom.operation !== payload.operation ||
       custom.sha256 !== payload.sha256) {
      throw httpError(400, "The uploaded map metadata does not match this submission.");
    }

    await db.runTransaction(async transaction => {
      const reads = await Promise.all([
        transaction.get(accountRef),
        transaction.get(submissionRef),
        transaction.get(resourceRef),
        transaction.get(pendingRef),
        resubmissionRef ? transaction.get(resubmissionRef) : Promise.resolve(null),
        replacementRef ? transaction.get(replacementRef) : Promise.resolve(null),
        transaction.get(hashRef),
        transaction.get(clientMapRef),
        transaction.get(grantRef),
        replacementPendingRef ? transaction.get(replacementPendingRef) : Promise.resolve(null),
        replacementHashRef && replacementHashRef.path !== hashRef.path
          ? transaction.get(replacementHashRef) : Promise.resolve(null)
      ]);
      const [freshAccount, existingSubmission, publishedResource, pendingResource, deniedSource,
        replacementSnapshot, hashSnapshot, clientMapSnapshot, freshGrantSnapshot,
        replacementPendingSnapshot, replacementHashSnapshot] = reads;
      const freshAccountData = freshAccount.exists ? freshAccount.data() : null;
      if(!admin && (!freshAccountData || freshAccountData.status !== "approved" ||
         freshAccountData.authorId !== payload.authorId ||
         normalizedIdentityText(freshAccountData.authorName) !== payload.authorName)) {
        throw httpError(403, "Your linked author changed before the submission completed.");
      }
      if(existingSubmission.exists) {
        throw httpError(409, "This submission identifier has already been used.");
      }
      const freshGrant = freshGrantSnapshot.exists ? freshGrantSnapshot.data() : null;
      if(!freshGrant || freshGrant.ownerUid !== user.uid ||
         freshGrant.payloadDigest !== payloadDigest ||
         timestampMillis(freshGrant.expiresAt) <= Date.now()) {
        throw httpError(409, "This upload reservation expired before it could be finalized.");
      }
      const replacement = replacementSnapshot && replacementSnapshot.exists
        ? replacementSnapshot.data() : null;
      if(payload.replacesSubmissionId && (!replacement || replacement.status !== "pending" ||
         replacement.submittedBy !== user.uid)) {
        throw httpError(409, "The queued submission can no longer be updated.");
      }
      if(hashSnapshot.exists &&
         hashSnapshot.data().submissionId !== payload.replacesSubmissionId) {
        throw httpError(409, "This exact map is already waiting in the review queue.");
      }
      if(clientMapSnapshot.exists &&
         clientMapSnapshot.data().submissionId !== payload.replacesSubmissionId) {
        throw httpError(409, "This local map already has a queued submission. Update it instead.");
      }
      if(publishedResource.exists) {
        throw httpError(
          409,
          `${payload.mapName} ${payload.mapVersion} is already published. Choose a new version.`
        );
      }
      if(pendingResource.exists &&
         pendingResource.data().submissionId !== payload.replacesSubmissionId) {
        throw httpError(
          409,
          `${payload.mapName} ${payload.mapVersion} is already pending review. ` +
          "Edit that submission or choose a new version."
        );
      }
      if(payload.resubmissionOf) {
        const denied = deniedSource && deniedSource.exists ? deniedSource.data() : null;
        if(!denied || denied.status !== "denied" || denied.submittedBy !== user.uid ||
           denied.mapId !== payload.mapId || denied.operation !== payload.operation ||
           denied.authorId !== payload.authorId ||
           String(denied.sourceRevisionId || "") !== payload.sourceRevisionId) {
          throw httpError(409, "The denied review is not valid for this resubmission.");
        }
      }
      if(replacementRef) {
        transaction.update(replacementRef, {
          status: "superseded",
          replacedBy: payload.submissionId,
          updatedAt: FieldValue.serverTimestamp()
        });
        if(replacementPendingRef && replacementPendingRef.path !== pendingRef.path &&
           replacementPendingSnapshot && replacementPendingSnapshot.exists &&
           replacementPendingSnapshot.data().submissionId === payload.replacesSubmissionId) {
          transaction.delete(replacementPendingRef);
        }
        if(replacementHashRef && replacementHashRef.path !== hashRef.path &&
           replacementHashSnapshot && replacementHashSnapshot.exists &&
           replacementHashSnapshot.data().submissionId === payload.replacesSubmissionId) {
          transaction.delete(replacementHashRef);
        }
      }
      transaction.create(submissionRef, {
        ...payload,
        status: "pending",
        reviewState: "unread",
        reviewReadAt: null,
        reviewStartedAt: null,
        submittedBy: user.uid,
        submittedByName: account && account.authorName || user.name || user.email || user.uid,
        pendingResourceId,
        resourcePath,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(pendingRef, {
        pendingResourceId,
        resourcePath,
        submissionId: payload.submissionId,
        mapId: payload.mapId,
        authorId: payload.authorId,
        authorName: payload.authorName,
        category: MAP_CATEGORY,
        mapName: payload.mapName,
        mapVersion: payload.mapVersion,
        submittedBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(hashRef, {
        submissionId:payload.submissionId,
        submittedBy:user.uid,
        sha256:payload.sha256,
        createdAt:FieldValue.serverTimestamp()
      });
      transaction.set(clientMapRef, {
        submissionId:payload.submissionId,
        submittedBy:user.uid,
        clientMapId:payload.clientMapId,
        createdAt:FieldValue.serverTimestamp()
      });
      transaction.delete(grantRef);
    });
    logger.info("Vectron map submission finalized", {
      submissionId: payload.submissionId,
      mapId: payload.mapId,
      resourcePath,
      submittedBy: user.uid
    });
    response.status(201).json({
      submitted: true,
      submissionId: payload.submissionId,
      pendingResourceId,
      resourcePath
    });
  } catch(error) {
    logger.error("Vectron map submission failed", error);
    requestError(
      response,
      Number.isInteger(error && error.status) ? error.status : 500,
      error && error.status ? error.message : "The map submission could not be created."
    );
  }
});

exports.revokeMapSubmission = onRequest({
  region: "us-central1",
  cors: allowedOrigins,
  timeoutSeconds: 30,
  memory: "256MiB"
}, async (request, response) => {
  response.set("Cache-Control", "no-store, max-age=0");
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST to revoke a map submission.");
    return;
  }
  try {
    const user = await authenticatedUser(request);
    const submissionId = String(request.body && request.body.submissionId || "").trim();
    const expectedStoragePath = String(
      request.body && request.body.expectedStoragePath || ""
    ).trim().slice(0, 2048);
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(submissionId)) {
      throw httpError(400, "Choose a valid map submission.");
    }
    if(!expectedStoragePath) {
      throw httpError(400, "The map revision to restore is required.");
    }

    const submissionRef = db.collection("mapSubmissions").doc(submissionId);
    const auditRef = db.collection("auditEvents").doc();
    let revokedSubmission = null;
    await db.runTransaction(async transaction => {
      const submissionSnapshot = await transaction.get(submissionRef);
      const submission = validateSubmissionRevocation(
        submissionSnapshot.exists ? submissionSnapshot.data() : null,
        user.uid,
        expectedStoragePath
      );

      const pendingResourceId = String(submission.pendingResourceId || resourceKey(
        activeResourcePath(submission)
      ));
      const pendingRef = db.collection("pendingResourcePaths").doc(pendingResourceId);
      const hashRef = /^[0-9a-f]{64}$/.test(String(submission.sha256 || ""))
        ? db.collection("pendingSubmissionHashes")
          .doc(pendingHashId(user.uid, submission.sha256)) : null;
      const clientMapRef = submission.clientMapId
        ? db.collection("pendingClientMaps")
          .doc(pendingClientMapId(user.uid, submission.clientMapId)) : null;
      const [pendingSnapshot, hashSnapshot, clientMapSnapshot] = await Promise.all([
        transaction.get(pendingRef),
        hashRef ? transaction.get(hashRef) : Promise.resolve(null),
        clientMapRef ? transaction.get(clientMapRef) : Promise.resolve(null)
      ]);

      transaction.update(submissionRef, {
        status: "revoked",
        reviewState: "revoked",
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: user.uid,
        historyVisible: false,
        updatedAt: FieldValue.serverTimestamp()
      });
      if(pendingSnapshot.exists && pendingSnapshot.data().submissionId === submissionId) {
        transaction.delete(pendingRef);
      }
      if(hashRef && hashSnapshot && hashSnapshot.exists &&
         hashSnapshot.data().submissionId === submissionId) {
        transaction.delete(hashRef);
      }
      if(clientMapRef && clientMapSnapshot && clientMapSnapshot.exists &&
         clientMapSnapshot.data().submissionId === submissionId) {
        transaction.delete(clientMapRef);
      }
      transaction.create(auditRef, {
        actorUid: user.uid,
        actorName: submission.submittedByName || user.name || user.email || user.uid,
        action: "map.review.revoke",
        targetType: "mapSubmission",
        targetId: submissionId,
        mapId: submission.mapId || "",
        before: {status: "pending", reviewState: submission.reviewState || "unread"},
        after: {status: "revoked"},
        createdAt: FieldValue.serverTimestamp()
      });
      revokedSubmission = {
        submissionId,
        mapId: String(submission.mapId || ""),
        operation: String(submission.operation || "create"),
        authorId: String(submission.authorId || ""),
        authorName: String(submission.authorName || ""),
        category: MAP_CATEGORY,
        mapName: String(submission.mapName || ""),
        mapVersion: String(submission.mapVersion || ""),
        storagePath: String(submission.storagePath || ""),
        sourceRevisionId: String(submission.sourceRevisionId || ""),
        sourceMapId: String(submission.sourceMapId || ""),
        resubmissionOf: String(submission.resubmissionOf || ""),
        clientMapId: String(submission.clientMapId || ""),
        sha256: String(submission.sha256 || "")
      };
    });

    logger.info("Vectron map submission revoked", {
      submissionId,
      mapId: revokedSubmission.mapId,
      submittedBy: user.uid
    });
    response.status(200).json({revoked: true, submission: revokedSubmission});
  } catch(error) {
    logger.error("Vectron map submission revocation failed", error);
    requestError(
      response,
      Number.isInteger(error && error.status) ? error.status : 500,
      error && error.status ? error.message : "The map submission could not be revoked."
    );
  }
});

async function saveImmutableManifest(path, contents, isPublic) {
  try {
    await bucket.file(path).save(contents, {
      resumable: false,
      preconditionOpts: {ifGenerationMatch: 0},
      metadata: {
        contentType: "application/json; charset=utf-8",
        contentEncoding: "gzip",
        cacheControl: isPublic
          ? "public, max-age=31536000, immutable"
          : "private, max-age=31536000, immutable"
      }
    });
  } catch(error) {
    if(Number(error && error.code) !== 412) throw error;
  }
}

async function publishCatalogState(event) {
  const [maps, settings] = await Promise.all([
    db.collection("maps").get(),
    db.collection("catalogSettings").doc("current").get()
  ]);
  const ready = settings.exists && settings.data().ready === true;
  const artifacts = buildCatalogArtifacts(maps.docs, ready);
  await Promise.all([
    saveImmutableManifest(artifacts.serverPath, artifacts.server, false),
    saveImmutableManifest(artifacts.publicPath, artifacts.public, true)
  ]);
  await db.collection("catalogState").doc("current").set({
    schemaVersion: 1,
    catalogVersion: FieldValue.increment(1),
    generation: artifacts.generation,
    serverManifestPath: artifacts.serverPath,
    serverManifestSha256: artifacts.serverSha256,
    publicManifestPath: artifacts.publicPath,
    publicManifestSha256: artifacts.publicSha256,
    mapCount: artifacts.mapCount,
    activeMapCount: artifacts.activeMapCount,
    ready,
    lastSourceId: String(event.params.mapId || event.params.settingId || ""),
    updatedAt: FieldValue.serverTimestamp()
  }, {merge: true});
  logger.info("Published immutable map catalog manifests", {
    catalogGeneration: artifacts.generation,
    mapCount: artifacts.mapCount,
    activeMapCount: artifacts.activeMapCount,
    lastSourceId: event.params.mapId || event.params.settingId
  });
}

const catalogPublisherOptions = {
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "256MiB"
};

exports.publishCatalogManifest = onDocumentWritten({
  ...catalogPublisherOptions,
  document: "maps/{mapId}"
}, publishCatalogState);

exports.publishCatalogSettingsManifest = onDocumentWritten({
  ...catalogPublisherOptions,
  document: "catalogSettings/{settingId}"
}, publishCatalogState);

exports.cleanupPendingSubmissionReservations = onDocumentWritten({
  region: "us-central1",
  timeoutSeconds: 30,
  memory: "256MiB",
  document: "mapSubmissions/{submissionId}"
}, async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if(!before || before.status !== "pending" || (after && after.status === "pending")) return;
  const submittedBy = String(before.submittedBy || "");
  const submissionId = String(event.params.submissionId || "");
  if(!submittedBy || !submissionId) return;
  const refs = [];
  if(/^[0-9a-f]{64}$/.test(String(before.sha256 || ""))) {
    refs.push(db.collection("pendingSubmissionHashes")
      .doc(pendingHashId(submittedBy, before.sha256)));
  }
  if(before.clientMapId) {
    refs.push(db.collection("pendingClientMaps")
      .doc(pendingClientMapId(submittedBy, before.clientMapId)));
  }
  await Promise.all(refs.map(async ref => {
    const snapshot = await ref.get();
    if(snapshot.exists && snapshot.data().submissionId === submissionId) await ref.delete();
  }));
});

exports.denyRegistration = onRequest({
  region: "us-central1",
  cors: allowedOrigins,
  timeoutSeconds: 30,
  memory: "256MiB"
}, async (request, response) => {
  if(request.method !== "POST") {
    response.set("Allow", "POST");
    requestError(response, 405, "Use POST for registration deletion.");
    return;
  }
  try {
    const reviewer = await authenticatedAdmin(request);
    const accountId = String(request.body && request.body.accountId || "").trim();
    const reason = String(request.body && request.body.reason || "").trim();
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
      requestError(response, 400, "Choose a valid pending registration.");
      return;
    }
    if(!reason || reason.length > 1000) {
      requestError(response, 400, "Enter a deletion reason of 1,000 characters or fewer.");
      return;
    }
    if(accountId === reviewer.uid) {
      requestError(response, 400, "An admin cannot delete their own account here.");
      return;
    }

    const accountRef = db.collection("accounts").doc(accountId);
    await db.runTransaction(async transaction => {
      const account = await transaction.get(accountRef);
      if(!account.exists || account.data().status !== "pending") {
        throw Object.assign(
          new Error("This registration has already been reviewed or removed."),
          {status: 409}
        );
      }
      transaction.update(accountRef, {
        status: "deleting",
        denialReason: reason,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: reviewer.uid,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    try {
      await adminAuth.deleteUser(accountId);
    } catch(error) {
      if(error && error.code !== "auth/user-not-found") {
        await accountRef.update({
          status: "pending",
          denialReason: FieldValue.delete(),
          reviewedAt: FieldValue.delete(),
          reviewedBy: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        });
        throw error;
      }
    }

    const notificationRoot = db.collection("notifications").doc(accountId);
    const notificationItems = await notificationRoot.collection("items").get();
    const auditRef = db.collection("auditEvents").doc();
    const batch = db.batch();
    notificationItems.docs.forEach(item => batch.delete(item.ref));
    batch.delete(notificationRoot);
    batch.delete(accountRef);
    batch.set(auditRef, {
      actorUid: reviewer.uid,
      actorName: reviewer.name || reviewer.email || reviewer.uid,
      action: "account.deny-delete",
      targetType: "account",
      targetId: accountId,
      reason,
      before: {status: "pending"},
      after: {status: "deleted"},
      createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();
    logger.info("Vectron registration denied and deleted", {
      reviewerUid: reviewer.uid,
      accountId,
      auditId: auditRef.id
    });
    response.status(200).json({deleted: true, accountId});
  } catch(error) {
    logger.error("Vectron registration deletion failed", error);
    requestError(
      response,
      Number.isInteger(error && error.status) ? error.status : 500,
      error && error.status ? error.message : "The user could not be deleted."
    );
  }
});
