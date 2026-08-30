#!/usr/bin/env node

import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const {applicationDefault, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {GoogleAuth} = require("google-auth-library");

const apply = process.argv.includes("--apply");
const backupDirectory = process.argv.find(value => value.startsWith("--backup="))?.slice(9);
if(!backupDirectory) throw new Error("Pass --backup=/protected/auth/export/directory.");

const [neotronExport, vectronExport] = await Promise.all([
  readFile(`${backupDirectory}/neotron-before.json`, "utf8").then(JSON.parse),
  readFile(`${backupDirectory}/vectron-before.json`, "utf8").then(JSON.parse)
]);
const neotronUsers = neotronExport.users || [];
const vectronUsers = vectronExport.users || [];
const canonicalByEmail = new Map(neotronUsers.map(user => [String(user.email || "").toLowerCase(), user]));
const shared = vectronUsers.filter(user => canonicalByEmail.has(String(user.email || "").toLowerCase()));
const unique = vectronUsers.filter(user => !canonicalByEmail.has(String(user.email || "").toLowerCase()));
if(shared.length !== 1 || unique.length !== 3) {
  throw new Error(`Expected one shared and three Vectron-only accounts; found ${shared.length} and ${unique.length}.`);
}
if(!unique.every(user => user.localId && user.email && user.passwordHash && user.salt)) {
  throw new Error("Every Vectron-only account must have a UID, email, password hash, and salt.");
}
const sharedVectron = shared[0];
const sharedNeotron = canonicalByEmail.get(String(sharedVectron.email).toLowerCase());
const sharedClaims = JSON.parse(sharedVectron.customAttributes || "{}");
if(sharedClaims.admin !== true) throw new Error("The shared Vectron account is not the expected administrator.");

const credential = applicationDefault();
const neotronApp = initializeApp({credential, projectId: "neotron-7ba2a"}, "migration-neotron");
const vectronApp = initializeApp({credential, projectId: "tronnerrepository"}, "migration-vectron");
const neotronAuth = getAuth(neotronApp);
const vectronDb = getFirestore(vectronApp);

for(const user of unique) {
  await neotronAuth.getUser(user.localId).then(
    () => { throw new Error("A Vectron-only UID already exists in Neotron Auth."); },
    error => { if(error.code !== "auth/user-not-found") throw error; }
  );
  await neotronAuth.getUserByEmail(user.email).then(
    () => { throw new Error("A Vectron-only email already exists in Neotron Auth."); },
    error => { if(error.code !== "auth/user-not-found") throw error; }
  );
}

console.log(JSON.stringify({apply, importAccounts: unique.length, linkedAccounts: shared.length}));
if(!apply) process.exit(0);

const googleAuth = new GoogleAuth({scopes: ["https://www.googleapis.com/auth/cloud-platform"]});
const client = await googleAuth.getClient();
const accessToken = await client.getAccessToken();
const configResponse = await fetch(
  "https://identitytoolkit.googleapis.com/admin/v2/projects/tronnerrepository/config",
  {headers: {Authorization: `Bearer ${accessToken.token}`}}
);
if(!configResponse.ok) throw new Error(`Could not read Vectron password hash configuration (${configResponse.status}).`);
const hash = (await configResponse.json()).signIn?.hashConfig;
if(!hash || hash.algorithm !== "SCRYPT" || !hash.signerKey) {
  throw new Error("Vectron Firebase Auth did not return its SCRYPT configuration.");
}

const records = unique.map(user => ({
  uid: user.localId,
  email: user.email,
  emailVerified: user.emailVerified === true,
  displayName: user.displayName || undefined,
  disabled: user.disabled === true,
  passwordHash: Buffer.from(user.passwordHash, "base64"),
  passwordSalt: Buffer.from(user.salt, "base64")
}));
const imported = await neotronAuth.importUsers(records, {
  hash: {
    algorithm: "SCRYPT",
    key: Buffer.from(hash.signerKey, "base64"),
    saltSeparator: Buffer.from(hash.saltSeparator || "", "base64"),
    rounds: Number(hash.rounds),
    memoryCost: Number(hash.memoryCost)
  }
});
if(imported.failureCount || imported.successCount !== records.length) {
  throw new Error(`Auth import was incomplete (${imported.successCount} succeeded, ${imported.failureCount} failed).`);
}

await vectronDb.collection("accountLinks").doc(sharedNeotron.localId).set({
  neotronUid: sharedNeotron.localId,
  repositoryUid: sharedVectron.localId,
  admin: true,
  status: "active",
  schemaVersion: 1,
  migratedAt: new Date()
});

const verified = await Promise.all(unique.map(user => neotronAuth.getUser(user.localId)));
if(verified.length !== unique.length || !verified.every(user => user.email)) {
  throw new Error("Imported accounts could not be verified.");
}
console.log(JSON.stringify({complete: true, imported: imported.successCount, linked: 1}));
