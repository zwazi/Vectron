"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const {onRequest} = require("firebase-functions/v2/https");

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

function safeMapName(value) {
  const cleaned = String(value || "map")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 100);
  return cleaned || "map";
}

function resourceKey(value) {
  return `resource_${Buffer.from(String(value || "").normalize("NFKC"), "utf8")
    .toString("base64url")}`;
}

function submissionPayload(body) {
  const data = body && typeof body === "object" ? body : {};
  const string = (name, maximum = 1000) => String(data[name] || "").trim().slice(0, maximum);
  const payload = {
    submissionId: string("submissionId", 128),
    mapId: string("mapId", 128),
    operation: string("operation", 32),
    authorId: string("authorId", 256),
    authorName: string("authorName", 60),
    category: string("category", 60),
    mapName: string("mapName", 100),
    mapVersion: string("mapVersion", 64),
    storagePath: string("storagePath", 1024),
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
  if(payload.category !== MAP_CATEGORY || payload.mapName !== safeMapName(payload.mapName) ||
     !/^(v)?\d+(?:\.\d+)*$/i.test(payload.mapVersion)) {
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
  return `${payload.authorName}/${MAP_CATEGORY}/${payload.mapName}-${payload.mapVersion}.aamap.xml`;
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
    if(!account || account.status !== "approved" || !account.authorId || !account.authorName) {
      throw httpError(403, "Your Vectron account is not approved and linked to an author.");
    }
    if(payload.authorId !== account.authorId || payload.authorName !== account.authorName) {
      throw httpError(403, "This submission does not match your linked Vectron author.");
    }
    const expectedStoragePath = `_revisions/${user.uid}/${payload.submissionId}/` +
      `${payload.mapName}-${payload.mapVersion}.aamap.xml`;
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
      .where("authorId", "==", payload.authorId).get();
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
      if(!freshAccountData || freshAccountData.status !== "approved" ||
         freshAccountData.authorId !== payload.authorId ||
         freshAccountData.authorName !== payload.authorName) {
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
        submittedByName: account.authorName,
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
