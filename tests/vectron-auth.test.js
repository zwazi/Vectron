"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const firebase = JSON.parse(read("firebase.json"));
const firebaseRc = JSON.parse(read(".firebaserc"));
const storageRules = read("storage.rules");
const index = read("index.html");
const authSource = read("js/auth.js");
const authCss = read("css/auth.css");
const vectronSource = read("js/vectron.js");
const localDraftSource = read("js/localDraft.js");

assert.deepStrictEqual(firebase.auth.providers, {emailPassword: true});
assert.deepStrictEqual(firebase.storage, {rules: "storage.rules"});
assert.strictEqual(firebaseRc.projects.default, "tronnerrepository");

assert.match(index, /<body class="noscroll auth-locked">/);
assert.match(index, /id="auth-gate"[^>]*aria-modal="true"/);
assert.match(index, /id="auth-login-tab"/);
assert.match(index, /id="auth-signup-tab"/);
assert.match(index, /data-auth-signout/);
assert.match(index, /data-map-upload/);
assert.match(index, /id="auth-account-controls"[^>]*auth-account-controls/);
assert.match(index, /id="auth-account-controls"[\s\S]*data-map-upload[\s\S]*data-auth-signout/);
assert.match(index, /id="top-settings-bar"[\s\S]*id="auth-account-controls"/);
assert.doesNotMatch(index, /class="toolbar-upload"/);
assert.match(index, /id="map_author"[^>]*readonly/);
assert.match(index, /id="map_category"[^>]*value="maps"[^>]*readonly/);
assert.match(index, /id="map_version"[^>]*value="1"[^>]*readonly/);
assert.match(index, /src="\.\/js\/localDraft\.js"/);
assert.match(index, /<script type="module" src="\.\/js\/auth\.js"><\/script>/);

assert.match(authSource, /projectId:\s*"tronnerrepository"/);
assert.match(authSource, /onAuthStateChanged\(auth/);
assert.match(authSource, /createUserWithEmailAndPassword\(auth/);
assert.match(authSource, /signInWithEmailAndPassword\(auth/);
assert.match(authSource, /sendPasswordResetEmail\(auth/);
assert.match(authSource, /signOut\(auth\)/);
assert.match(authSource, /browserLocalPersistence/);
assert.match(authSource, /browserSessionPersistence/);
assert.match(authSource, /firebase-storage\.js/);
assert.match(authSource, /uploadString\(mapRef, map\.xml/);
assert.match(authSource, /`\$\{author\}\/\$\{MAP_CATEGORY\}\/\$\{fileName\}`/);
assert.match(authSource, /window\.xml_author = author/);
assert.match(authSource, /window\.xml_category = MAP_CATEGORY/);
assert.match(authSource, /vectron_localDraftSetUser\(user\.uid\)/);
assert.match(authSource, /vectron_localDraftSaveNow/);
assert.match(authSource, /setEditorInert\(true\)/);
assert.doesNotMatch(authSource, /[?&](?:skip|bypass|noauth)=/i);

assert.match(vectronSource, /function vectron_start\(\)/);
assert.match(vectronSource, /if\(vectron_started\) return;/);
assert.match(vectronSource, /vectron_localDraftRestore\(\)/);
assert.doesNotMatch(vectronSource, /window\.onload\s*=\s*function\s*\(\)\s*\{\s*vectron_init/);

assert.match(localDraftSource, /vectron\.localDraft\.v1\./);
assert.match(localDraftSource, /localStorage\.setItem/);
assert.match(localDraftSource, /localStorage\.getItem/);
assert.match(localDraftSource, /beforeunload/);
assert.match(localDraftSource, /visibilitychange/);

assert.match(authCss, /#auth-gate\s*\{[^}]*z-index:\s*20000/s);
assert.match(authCss, /#auth-gate\s*\{[^}]*align-items:\s*center[^}]*justify-items:\s*center/s);
assert.match(authCss, /#auth-gate\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.48\)/s);
assert.match(authCss, /\.auth-account-controls\s*\{[^}]*position:\s*static[^}]*margin-left:\s*auto/s);
assert.match(authCss, /\.auth-account-controls\s*\{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
assert.match(authCss, /--auth-cyan:\s*#55f4dc/);
assert.match(authCss, /--auth-violet:\s*#9a7cff/);
assert.doesNotMatch(authCss, /#(?:3b94de|1c70bb|68d6e8|398dcc|1c5f96)/i);
assert.doesNotMatch(index, /auth-backdrop|auth-orbit|auth-horizon/);
assert.match(authCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(authCss, /@media \(max-width: 720px\)/);

assert.match(storageRules, /match \/\{author\}\/maps\/\{fileName\}/);
assert.match(storageRules, /request\.auth\.token\.name == author/);
assert.match(storageRules, /request\.resource\.metadata\.ownerUid == request\.auth\.uid/);
assert.match(storageRules, /request\.resource\.metadata\.category == 'maps'/);
assert.doesNotMatch(storageRules, /allow (?:read|write): if true/);

console.log("Vectron authentication configuration tests passed.");
