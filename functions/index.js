"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const {createHash} = require("node:crypto");
const logger = require("firebase-functions/logger");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {buildCatalogArtifacts} = require("./catalog-manifest");

initializeApp();

const adminAuth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();
const MAP_CATEGORY = "maps";
const MAX_MAP_BYTES = 10 * 1024 * 1024;
const allowedOrigins = [
  "https://vectron.tronner.io",
  "https://zwazi.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

function requestError(response, status, message) {
  response.status(status).json({error: message});
}

async function authenticatedUser(request) {
  const authorization = String(request.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if(!match) throw Object.assign(new Error("Sign in before submitting a map."), {status: 401});
  return adminAuth.verifyIdToken(match[1], true);
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
    submissionReason: string("submissionReason", 1000),
    sha256: string("sha256", 64),
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

function duplicatePendingSubmission(snapshot, payload) {
  return snapshot.docs.find(document => {
    if(document.id === payload.submissionId) return false;
    const existing = document.data();
    return existing.status === "pending" &&
      existing.authorId === payload.authorId &&
      existing.mapName === payload.mapName &&
      existing.mapVersion === payload.mapVersion &&
      existing.category === MAP_CATEGORY;
  });
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
    const payload = submissionPayload(request.body);
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

    // This query also catches pending submissions created before deterministic
    // pending-version reservations were introduced.
    const authorSubmissions = await db.collection("mapSubmissions")
      .where("status", "==", "pending").get();
    if(duplicatePendingSubmission(authorSubmissions, payload)) {
      throw httpError(
        409,
        `${payload.mapName} ${payload.mapVersion} is already pending review. ` +
        "Edit that submission or choose a new version."
      );
    }

    const resourcePath = activeResourcePath(payload);
    const pendingResourceId = resourceKey(resourcePath);
    const submissionRef = db.collection("mapSubmissions").doc(payload.submissionId);
    const resourceRef = db.collection("resourcePaths").doc(pendingResourceId);
    const pendingRef = db.collection("pendingResourcePaths").doc(pendingResourceId);
    const resubmissionRef = payload.resubmissionOf
      ? db.collection("mapSubmissions").doc(payload.resubmissionOf) : null;

    await db.runTransaction(async transaction => {
      const reads = await Promise.all([
        transaction.get(accountRef),
        transaction.get(submissionRef),
        transaction.get(resourceRef),
        transaction.get(pendingRef),
        resubmissionRef ? transaction.get(resubmissionRef) : Promise.resolve(null)
      ]);
      const [freshAccount, existingSubmission, publishedResource, pendingResource, deniedSource] = reads;
      const freshAccountData = freshAccount.exists ? freshAccount.data() : null;
      if(!admin && (!freshAccountData || freshAccountData.status !== "approved" ||
         freshAccountData.authorId !== payload.authorId ||
         normalizedIdentityText(freshAccountData.authorName) !== payload.authorName)) {
        throw httpError(403, "Your linked author changed before the submission completed.");
      }
      if(existingSubmission.exists) {
        throw httpError(409, "This submission identifier has already been used.");
      }
      if(publishedResource.exists) {
        throw httpError(
          409,
          `${payload.mapName} ${payload.mapVersion} is already published. Choose a new version.`
        );
      }
      if(pendingResource.exists) {
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
      transaction.create(submissionRef, {
        ...payload,
        status: "pending",
        submittedBy: user.uid,
        submittedByName: account && account.authorName || user.name || user.email || user.uid,
        pendingResourceId,
        resourcePath,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.create(pendingRef, {
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
    });
    logger.info("Vectron map submission reserved", {
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
