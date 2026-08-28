"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const {onRequest} = require("firebase-functions/v2/https");

initializeApp();

const adminAuth = getAuth();
const db = getFirestore();
const allowedOrigins = [
  "https://vectron.tronner.io",
  "https://zwazi.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

function requestError(response, status, message) {
  response.status(status).json({error: message});
}

async function authenticatedAdmin(request) {
  const authorization = String(request.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if(!match) throw Object.assign(new Error("Sign in as an admin to delete users."), {status: 401});
  const token = await adminAuth.verifyIdToken(match[1], true);
  if(token.admin !== true) {
    throw Object.assign(new Error("Only a Vectron admin may delete users."), {status: 403});
  }
  return token;
}

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
