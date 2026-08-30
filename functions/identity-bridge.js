"use strict";

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

class IdentityBridgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "IdentityBridgeError";
    this.status = status;
    this.code = code;
  }
}

function bearerToken(request) {
  const match = /^Bearer ([^\s]+)$/u.exec(String(request.get("authorization") || ""));
  return match ? match[1] : "";
}

function safeIdentity(decoded) {
  const uid = String(decoded?.uid || decoded?.sub || "");
  if(!UID_PATTERN.test(uid)) {
    throw new IdentityBridgeError(401, "invalid-identity", "The Neotron session is invalid.");
  }
  return {
    uid,
    email: String(decoded.email || "").trim().slice(0, 320),
    emailVerified: decoded.email_verified === true,
    displayName: String(decoded.name || "").normalize("NFKC").trim().slice(0, 60),
    photoURL: String(decoded.picture || "").slice(0, 2048)
  };
}

async function repositoryUser(auth, repositoryUid) {
  try {
    return await auth.getUser(repositoryUid);
  } catch(error) {
    if(error?.code !== "auth/user-not-found") throw error;
    return null;
  }
}

function createIdentityBridgeController({verifyNeotronToken, repositoryAuth, links}) {
  if(typeof verifyNeotronToken !== "function" || !repositoryAuth || !links) {
    throw new TypeError("Identity bridge dependencies are required.");
  }
  return {
    async exchange(idToken) {
      if(!idToken) {
        throw new IdentityBridgeError(401, "sign-in-required", "Sign in with Neotron to open Vectron.");
      }
      let decoded;
      try {
        decoded = await verifyNeotronToken(idToken);
      } catch {
        throw new IdentityBridgeError(401, "invalid-session", "The Neotron session has expired. Sign in again.");
      }
      const identity = safeIdentity(decoded);
      const link = await links.get(identity.uid);
      if(link?.status === "blocked") {
        throw new IdentityBridgeError(403, "account-blocked", "This account cannot access Vectron.");
      }
      const repositoryUid = String(link?.repositoryUid || identity.uid);
      if(!UID_PATTERN.test(repositoryUid)) {
        throw new IdentityBridgeError(500, "invalid-link", "The Vectron account link is invalid.");
      }

      let user = await repositoryUser(repositoryAuth, repositoryUid);
      if(!user) {
        user = await repositoryAuth.createUser({
          uid: repositoryUid,
          ...(identity.email ? {email: identity.email, emailVerified: identity.emailVerified} : {}),
          ...(identity.displayName ? {displayName: identity.displayName} : {}),
          ...(identity.photoURL ? {photoURL: identity.photoURL} : {})
        });
      }
      if(user.disabled) {
        throw new IdentityBridgeError(403, "account-disabled", "This Vectron account is disabled.");
      }

      const existingClaims = user.customClaims || {};
      const admin = link?.admin === true || existingClaims.admin === true;
      const claims = {
        neotron: true,
        neotronUid: identity.uid,
        ...(admin ? {admin: true, role: "admin"} : {})
      };
      return {
        customToken: await repositoryAuth.createCustomToken(repositoryUid, claims),
        repositoryUid
      };
    }
  };
}

function firestoreLinkRepository(db) {
  return {
    async get(neotronUid) {
      const snapshot = await db.collection("accountLinks").doc(neotronUid).get();
      return snapshot.exists ? snapshot.data() : null;
    }
  };
}

module.exports = {
  IdentityBridgeError,
  bearerToken,
  createIdentityBridgeController,
  firestoreLinkRepository,
  safeIdentity
};
