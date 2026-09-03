"use strict";

const {randomUUID} = require("node:crypto");

const AUDIT_LIMIT = 1000;
const SESSION_INTERVAL_MS = 5 * 60 * 1000;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

class UserAuditError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "UserAuditError";
    this.status = status;
    this.code = code;
  }
}

function bearerToken(request) {
  const match = /^Bearer ([^\s]+)$/u.exec(String(request.get("authorization") || ""));
  return match ? match[1] : "";
}

function cleanText(value, maximum) {
  return String(value || "").replace(/[\u0000\r\n]/gu, " ").trim().slice(0, maximum);
}

function requestIp(request) {
  const value = cleanText(request.ip || request.socket?.remoteAddress || "unknown", 128);
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function createUserAuditController({verifyToken, events, now = () => Date.now()}) {
  if(typeof verifyToken !== "function" || !events || typeof events.recordSession !== "function") {
    throw new TypeError("User audit dependencies are required.");
  }
  return {
    async recordSession(request) {
      if(!request.idToken) {
        throw new UserAuditError(401, "sign-in-required", "Sign in before recording website activity.");
      }
      let decoded;
      try {
        decoded = await verifyToken(request.idToken);
      } catch {
        throw new UserAuditError(401, "invalid-session", "The website session has expired.");
      }
      const uid = cleanText(decoded?.uid || decoded?.sub, 128);
      if(!UID_PATTERN.test(uid)) {
        throw new UserAuditError(401, "invalid-identity", "The website session is invalid.");
      }
      const occurredAt = now();
      const event = {
        schemaVersion: 1,
        source: "website",
        action: "website_session",
        occurredAt,
        websiteUid: uid,
        websiteName: cleanText(decoded.name || request.body?.displayName || "Racer", 80) || "Racer",
        gameUsername: cleanText(request.body?.gameUsername, 128),
        ipAddress: cleanText(request.ipAddress, 128),
        path: cleanText(request.body?.path, 200),
        userAgent: cleanText(request.userAgent, 300)
      };
      return {
        recorded: await events.recordSession(event, SESSION_INTERVAL_MS),
        occurredAt
      };
    }
  };
}

function realtimeUserAuditRepository(database, {shouldPrune = () => Math.random() < 0.04} = {}) {
  const root = database.ref("racing/admin/audit");
  return {
    async recordSession(event, intervalMilliseconds) {
      const presence = root.child(`presence/${event.websiteUid}`);
      const transaction = await presence.transaction(current => {
        const lastAt = Number(current?.lastAt || 0);
        if(
          lastAt > event.occurredAt - intervalMilliseconds
          && String(current?.ipAddress || "") === event.ipAddress
        ) return;
        return {lastAt: event.occurredAt, ipAddress: event.ipAddress};
      }, undefined, false);
      if(!transaction.committed) return false;
      const key = `${String(event.occurredAt).padStart(13, "0")}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      await root.child(`events/${key}`).set({...event, id: key});
      if(shouldPrune()) {
        const snapshot = await root.child("events").orderByKey().limitToLast(AUDIT_LIMIT + 25).get();
        const keys = Object.keys(snapshot.val() || {}).sort();
        const updates = Object.fromEntries(keys.slice(0, -AUDIT_LIMIT).map(item => [item, null]));
        if(Object.keys(updates).length) await root.child("events").update(updates);
      }
      return true;
    }
  };
}

module.exports = {
  AUDIT_LIMIT,
  SESSION_INTERVAL_MS,
  UserAuditError,
  bearerToken,
  createUserAuditController,
  realtimeUserAuditRepository,
  requestIp
};
