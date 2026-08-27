"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const firebase = JSON.parse(read("firebase.json"));
const firebaseRc = JSON.parse(read(".firebaserc"));
const index = read("index.html");
const authSource = read("js/auth.js");
const authCss = read("css/auth.css");
const vectronSource = read("js/vectron.js");

assert.deepStrictEqual(firebase.auth.providers, {emailPassword: true});
assert.strictEqual(firebaseRc.projects.default, "tronnerrepository");

assert.match(index, /<body class="noscroll auth-locked">/);
assert.match(index, /id="auth-gate"[^>]*aria-modal="true"/);
assert.match(index, /id="auth-login-tab"/);
assert.match(index, /id="auth-signup-tab"/);
assert.match(index, /data-auth-signout/);
assert.match(index, /<script type="module" src="\.\/js\/auth\.js"><\/script>/);

assert.match(authSource, /projectId:\s*"tronnerrepository"/);
assert.match(authSource, /onAuthStateChanged\(auth/);
assert.match(authSource, /createUserWithEmailAndPassword\(auth/);
assert.match(authSource, /signInWithEmailAndPassword\(auth/);
assert.match(authSource, /sendPasswordResetEmail\(auth/);
assert.match(authSource, /signOut\(auth\)/);
assert.match(authSource, /browserLocalPersistence/);
assert.match(authSource, /browserSessionPersistence/);
assert.match(authSource, /setEditorInert\(true\)/);
assert.doesNotMatch(authSource, /[?&](?:skip|bypass|noauth)=/i);

assert.match(vectronSource, /function vectron_start\(\)/);
assert.match(vectronSource, /if\(vectron_started\) return;/);
assert.doesNotMatch(vectronSource, /window\.onload\s*=\s*function\s*\(\)\s*\{\s*vectron_init/);

assert.match(authCss, /#auth-gate\s*\{[^}]*z-index:\s*20000/s);
assert.match(authCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(authCss, /@media \(max-width: 720px\)/);

console.log("Vectron authentication configuration tests passed.");
