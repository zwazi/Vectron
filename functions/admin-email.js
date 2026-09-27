"use strict";

const {createHash} = require("node:crypto");

// This secret lives in the existing identity project's Secret Manager. Only the
// two notification runtimes receive access to this individual secret.
const CONFIG_SECRET = "projects/neotron-7ba2a/secrets/TRONNER_ADMIN_EMAIL/versions/latest";
let cachedConfig;

async function loadEmailConfig(credential, fetchImpl = fetch) {
  if(cachedConfig) return cachedConfig;
  const {access_token:token} = await credential.getAccessToken();
  const response = await fetchImpl(`https://secretmanager.googleapis.com/v1/${CONFIG_SECRET}:access`, {
    headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) throw new Error(`Email configuration unavailable (${response.status}).`);
  const result = await response.json();
  const config = JSON.parse(Buffer.from(result.payload.data, "base64").toString("utf8"));
  if(!config.apiKey || !config.sender || !config.recipient) throw new Error("Email configuration is incomplete.");
  cachedConfig = config;
  return config;
}

function short(value, maximum = 200) {
  return String(value || "").replace(/[\r\n\x00-\x1f]/gu, " ").trim().slice(0, maximum);
}

function reviewEmail(kind, id, data) {
  if(data?.status !== "pending") return null;
  const registration = kind === "registration";
  const title = registration ? "New Vectron registration" : "New Vectron map review";
  const name = registration ? data.requestedAuthorName || data.displayName : data.mapName;
  return {
    subject:`[Vectron] ${title}: ${short(name) || id}`,
    text:[title, "", `Reference: ${id}`,
      ...(registration
        ? [`Author requested: ${short(name)}`, `Account: ${short(data.email)}`]
        : [`Map: ${short(data.mapName)} (${short(data.mapVersion)})`,
          `Author: ${short(data.authorName)}`, `Operation: ${short(data.operation)}`,
          `Submitted by: ${short(data.submittedBy || data.ownerUid)}`,
          `Reason: ${String(data.submissionReason || "").slice(0, 2000)}`]),
      "", "Open Vectron → Account → Admin:", "https://vectron.tronner.io/"
    ].join("\n")
  };
}

function suggestionEmail(id, data) {
  if(!data?.authorId || !data.body) return null;
  return {
    subject:`[${data.source === "vectron" ? "Vectron" : "tronner.io"}] Feature suggestion from ${short(data.authorName) || "Racer"}`,
    text:["Feature suggestion", "", `Reference: ${id}`,
      `From: ${short(data.authorName)} (${short(data.authorId)})`,
      `Source: ${short(data.source)}`,
      ...Object.entries(data.context || {}).slice(0, 8).map(([k, v]) => `${short(k)}: ${short(v, 240)}`),
      "", String(data.body).slice(0, 2000), "", "https://tronner.io/", 
      "Replies to the user can be sent through tronner.io Messages."
    ].join("\n")
  };
}

async function sendEmail({config, payload, key, fetchImpl = fetch}) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method:"POST",
    headers:{Authorization:`Bearer ${config.apiKey}`, "Content-Type":"application/json", "Idempotency-Key":key},
    body:JSON.stringify(payload), signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  const result = await response.json();
  if(!result.id) throw new Error("Email provider did not acknowledge delivery.");
  return result.id;
}

async function deliverAdminEmail({db, fieldValue, credential, key, email, now = Date.now,
  configLoader = loadEmailConfig, sender = sendEmail}) {
  if(!email) return {skipped:true};
  const config = await configLoader(credential);
  const id = createHash("sha256").update(key).digest("hex");
  const reference = db.collection("adminEmailDeliveries").doc(id);
  const quotaReference = db.collection("adminEmailState").doc("quota");
  const milliseconds = now();
  const date = new Date(milliseconds).toISOString();
  const record = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if(snapshot.exists) return snapshot.data();
    const quotaSnapshot = await transaction.get(quotaReference);
    const quota = quotaSnapshot.exists ? quotaSnapshot.data() : {};
    const day = date.slice(0, 10), month = date.slice(0, 7);
    const dayCount = quota.day === day ? Number(quota.dayCount || 0) : 0;
    const monthCount = quota.month === month ? Number(quota.monthCount || 0) : 0;
    // Bound abuse/cost independently in each project. No paid tier is enabled.
    if(dayCount >= 50 || monthCount >= 240) throw new Error("Admin email safety limit reached; notification remains pending.");
    const record = {
      key, status:"pending", firstAttemptMs:milliseconds,
      payload:{from:config.sender, to:[config.recipient], subject:email.subject, text:email.text},
      createdAt:fieldValue.serverTimestamp()
    };
    transaction.create(reference, record);
    transaction.set(quotaReference, {day, month, dayCount:dayCount + 1, monthCount:monthCount + 1});
    return record;
  });
  if(record.status === "sent" || record.status === "needs-attention") return {skipped:true};
  // Resend retains idempotency keys for 24h. Do not risk a duplicate once an
  // ambiguous send is older than that window. Preserve it for operator recovery.
  if(milliseconds - record.firstAttemptMs >= 23 * 60 * 60 * 1000) {
    await reference.update({status:"needs-attention", lastError:"Delivery retry window expired."});
    throw new Error("Admin email needs operator attention after retry window expired.");
  }
  const providerId = await sender({config, payload:record.payload, key:`tronner-${id}`});
  await reference.update({status:"sent", providerId, sentAt:fieldValue.serverTimestamp()});
  return {sent:true, providerId};
}

module.exports = {deliverAdminEmail, reviewEmail, suggestionEmail, sendEmail};
