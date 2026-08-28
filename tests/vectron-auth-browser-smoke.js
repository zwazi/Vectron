"use strict";

// Destructive smoke test for the real Firebase project. Disposable accounts,
// revisions, and catalog records are removed in finally. A management token is
// mandatory so cleanup never depends on the client rules under test.

const assert = require("assert");
const crypto = require("crypto");

const project = "tronnerrepository";
const bucket = "tronnerrepository.firebasestorage.app";
const apiKey = "AIzaSyCglVAiB3494_GQf2ESrE9y_2YWELpIfBg";
const oauthToken = process.env.VECTRON_ADMIN_OAUTH_TOKEN || "";
const bidiUrl = process.env.VECTRON_BIDI_URL || "ws://127.0.0.1:9223/session";
const testUrl = process.env.VECTRON_TEST_URL || "http://127.0.0.1:8000/";
const nonce = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const userName = `Browser User ${nonce}`;
const adminName = `Browser Admin ${nonce}`;
const mapName = `Browser Map ${nonce}`;
const userEmail = `vectron-user-${nonce}@example.com`;
const adminEmail = `vectron-admin-${nonce}@example.com`;
const userPassword = `Vu-${crypto.randomUUID()}!`;
const adminPassword = `Va-${crypto.randomUUID()}!`;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

if(!oauthToken) throw new Error("VECTRON_ADMIN_OAUTH_TOKEN is required for safe cleanup.");

let user = null;
let admin = null;
let submission = null;

const managementHeaders = json => ({
    authorization: `Bearer ${oauthToken}`,
    ...(json ? {"content-type": "application/json"} : {})
});

async function checkedFetch(url, options = {}) {
    const response = await fetch(url, options);
    if(!response.ok) {
        const detail = await response.text();
        throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    return response;
}

async function createAccount(email, password, displayName) {
    const signup = await checkedFetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {method: "POST", headers: {"content-type": "application/json"},
            body: JSON.stringify({email, password, returnSecureToken: true})}
    );
    const account = await signup.json();
    await checkedFetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({idToken: account.idToken, displayName, returnSecureToken: true})
    });
    return account;
}

const stringValue = value => ({stringValue: String(value)});
const timestampValue = () => ({timestampValue: new Date().toISOString()});
const authorKey = value => `author_${Buffer.from(
    value.normalize("NFKC").trim().toLocaleLowerCase("en-US"), "utf8"
).toString("base64url")}`;
const resourceKey = value => `resource_${Buffer.from(
    value.normalize("NFKC"), "utf8"
).toString("base64url")}`;

function write(collection, id, fields) {
    return {update: {
        name: `projects/${project}/databases/(default)/documents/${collection}/${id}`,
        fields
    }};
}

async function promoteAndBootstrapAdmin(account) {
    await checkedFetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:update`, {
        method: "POST", headers: managementHeaders(true),
        body: JSON.stringify({
            localId: account.localId,
            customAttributes: JSON.stringify({role: "admin", admin: true})
        })
    });
    const now = timestampValue();
    const authorId = authorKey(adminName);
    await checkedFetch(`${root}:commit`, {
        method: "POST", headers: managementHeaders(true),
        body: JSON.stringify({writes: [
            write("authors", authorId, {
                authorId: stringValue(authorId), name: stringValue(adminName),
                normalizedName: stringValue(adminName.toLocaleLowerCase("en-US")),
                ownerUid: stringValue(account.localId), status: stringValue("active"),
                createdAt: now, updatedAt: now
            }),
            write("accounts", account.localId, {
                uid: stringValue(account.localId), email: stringValue(adminEmail),
                displayName: stringValue(adminName), requestedAuthorName: stringValue(adminName),
                authorId: stringValue(authorId), authorName: stringValue(adminName),
                status: stringValue("approved"), denialReason: stringValue(""),
                createdAt: now, updatedAt: now, reviewedAt: now,
                reviewedBy: stringValue(account.localId)
            })
        ]})
    });
}

function decodeDocument(document) {
    const decoded = {id: document.name.split("/").pop()};
    Object.entries(document.fields || {}).forEach(([key, value]) => {
        if("stringValue" in value) decoded[key] = value.stringValue;
        else if("integerValue" in value) decoded[key] = Number(value.integerValue);
        else if("booleanValue" in value) decoded[key] = value.booleanValue;
        else if("timestampValue" in value) decoded[key] = value.timestampValue;
        else if("nullValue" in value) decoded[key] = null;
    });
    return decoded;
}

async function listDocuments(collectionPath) {
    const response = await checkedFetch(`${root}/${collectionPath}?pageSize=300`, {
        headers: managementHeaders(false)
    });
    return ((await response.json()).documents || []).map(decodeDocument);
}

async function waitForRemote(check, message, timeout = 30000) {
    const started = Date.now();
    while(Date.now() - started < timeout) {
        const value = await check();
        if(value) return value;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(message);
}

async function deleteDocument(collectionPath, id) {
    if(!id) return;
    const response = await fetch(`${root}/${collectionPath}/${encodeURIComponent(id)}`, {
        method: "DELETE", headers: managementHeaders(false)
    });
    if(!response.ok && response.status !== 404) {
        throw new Error(`Could not delete ${collectionPath}/${id} (${response.status}).`);
    }
}

async function deleteStoragePrefix(prefix) {
    let pageToken = "";
    do {
        const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucket}/o`);
        url.searchParams.set("prefix", prefix);
        url.searchParams.set("versions", "true");
        if(pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await checkedFetch(url, {headers: managementHeaders(false)});
        const result = await response.json();
        for(const item of result.items || []) {
            const target = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(item.name)}?generation=${encodeURIComponent(item.generation)}`;
            const removed = await fetch(target, {method: "DELETE", headers: managementHeaders(false)});
            if(!removed.ok && removed.status !== 404) throw new Error(`Could not delete ${item.name}.`);
        }
        pageToken = result.nextPageToken || "";
    } while(pageToken);
}

async function cleanup() {
    const accounts = [user, admin].filter(Boolean);
    const uids = accounts.map(item => item.localId);
    const [submissions, maps, audits] = await Promise.all([
        listDocuments("mapSubmissions"), listDocuments("maps"), listDocuments("auditEvents")
    ]);
    const testSubmissions = submissions.filter(item => uids.includes(item.submittedBy) || item.mapName === mapName);
    const testMaps = maps.filter(item => item.mapName === mapName);
    const testIds = new Set([...uids, ...testSubmissions.map(item => item.id), ...testMaps.map(item => item.mapId)]);
    const testAudits = audits.filter(item => testIds.has(item.actorUid) || testIds.has(item.targetId) || testIds.has(item.mapId));
    for(const uid of uids) {
        for(const item of await listDocuments(`notifications/${uid}/items`)) {
            await deleteDocument(`notifications/${uid}/items`, item.id);
        }
    }
    for(const item of testAudits) await deleteDocument("auditEvents", item.id);
    for(const item of testSubmissions) await deleteDocument("mapSubmissions", item.id);
    for(const item of testMaps) {
        await deleteDocument("resourcePaths", resourceKey(item.resourcePath));
        await deleteDocument("maps", item.id);
    }
    for(const account of accounts) {
        await deleteStoragePrefix(`_revisions/${account.localId}/`);
        await deleteDocument("accounts", account.localId);
    }
    await deleteDocument("authors", authorKey(userName));
    await deleteDocument("authors", authorKey(adminName));
    for(const account of accounts) {
        const removed = await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`,
            {method: "POST", headers: managementHeaders(true),
                body: JSON.stringify({localId: account.localId})}
        );
        if(!removed.ok && removed.status !== 404) throw new Error(`Could not delete test account (${removed.status}).`);
    }
}

const ws = new WebSocket(bidiUrl);
const pending = new Map();
let sequence = 0;
let sessionCreated = false;

function call(method, params) {
    return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, {resolve, reject});
        ws.send(JSON.stringify({id, method, params}));
    });
}

ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if(!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    if(message.type === "error") task.reject(new Error(message.message || message.error));
    else task.resolve(message.result);
};

async function evaluate(context, body) {
    const expression = `(async function(){
        function waitFor(check, message, timeout) {
            return new Promise(function(resolve, reject) {
                const started = Date.now();
                (function poll(){
                    let value = false;
                    try { value = check(); } catch(error) {}
                    if(value) return resolve(value);
                    if(Date.now() - started > (timeout || 30000)) return reject(new Error(message));
                    setTimeout(poll, 80);
                })();
            });
        }
        ${body}
    })().then(JSON.stringify)`;
    const result = await call("script.evaluate", {
        expression, target: {context}, awaitPromise: true, resultOwnership: "none"
    });
    if(!result.result || result.result.type !== "string") {
        throw new Error(`Browser evaluation failed: ${JSON.stringify(result)}`);
    }
    return JSON.parse(result.result.value);
}

async function login(context, email, password, role) {
    return evaluate(context, `
        await waitFor(function(){ return !document.getElementById("auth-panel").hidden; }, "Login panel not ready");
        document.getElementById("auth-login-tab").click();
        document.getElementById("auth-email").value = ${JSON.stringify(email)};
        document.getElementById("auth-password").value = ${JSON.stringify(password)};
        document.getElementById("auth-form").requestSubmit();
        await waitFor(function(){ return window.vectron_started === true &&
            document.querySelector("[data-auth-role]").textContent === ${JSON.stringify(role)}; },
            "Expected ${role} session did not start");
        return {role: window.vectron_userRole};
    `);
}

async function logout(context) {
    return evaluate(context, `
        document.querySelector("[data-auth-signout]").click();
        await waitFor(function(){ return document.body.classList.contains("auth-locked") &&
            !document.getElementById("auth-panel").hidden; }, "Sign out did not finish");
        return true;
    `);
}

ws.onerror = event => {
    console.error(event.message || event);
    process.exitCode = 1;
};

ws.onopen = async () => {
    try {
        if(process.env.VECTRON_BIDI_ATTACHED !== "1") {
            await call("session.new", {capabilities: {}});
            sessionCreated = true;
        }
        const tree = await call("browsingContext.getTree", {});
        const context = tree.contexts[0].context;
        await call("browsingContext.navigate", {context, url: testUrl, wait: "complete"});

        const guest = await evaluate(context, `
            await waitFor(function(){ return !document.getElementById("auth-panel").hidden; }, "Auth panel not ready");
            document.getElementById("auth-guest").click();
            await waitFor(function(){ return window.vectron_started === true && window.vectron_userRole === "guest"; }, "Guest mode failed");
            document.querySelector("[data-map-repository]").click();
            await waitFor(function(){ return document.querySelectorAll("[data-repository-open]").length >= 230; }, "Guest catalog failed", 45000);
            const visibleMaps = document.querySelectorAll("[data-repository-open]").length;
            const editActions = document.querySelectorAll('[data-repository-action="edit"]').length;
            window.confirm = function(){ return true; };
            document.querySelector('[data-repository-action="remix"]').click();
            await waitFor(function(){ return document.getElementById("map-repository-overlay").hidden; }, "Guest map download failed", 45000);
            return {visibleMaps, editActions, uploadHidden: document.querySelector("[data-map-upload]").hidden,
                toast: document.getElementById("vt-toast").textContent};
        `);
        assert.ok(guest.visibleMaps >= 230);
        assert.strictEqual(guest.editActions, 0);
        assert.strictEqual(guest.uploadHidden, true);
        assert.match(guest.toast, /Remixing/);
        await logout(context);

        const pendingUser = await evaluate(context, `
            document.getElementById("auth-signup-tab").click();
            document.getElementById("auth-name").value = ${JSON.stringify(userName)};
            document.getElementById("auth-email").value = ${JSON.stringify(userEmail)};
            document.getElementById("auth-password").value = ${JSON.stringify(userPassword)};
            document.getElementById("auth-confirm-password").value = ${JSON.stringify(userPassword)};
            document.getElementById("auth-form").requestSubmit();
            await waitFor(function(){ return window.vectron_userRole === "pending"; }, "Pending session failed");
            document.querySelector("[data-map-repository]").click();
            document.getElementById("map-repository-others-tab").click();
            await waitFor(function(){ return document.querySelectorAll("[data-repository-open]").length >= 230; }, "Pending catalog failed", 45000);
            return {role: window.vectron_userRole, uploadDisabled: document.querySelector("[data-map-upload]").disabled,
                editActions: document.querySelectorAll('[data-repository-action="edit"]').length};
        `);
        assert.deepStrictEqual(pendingUser, {role: "pending", uploadDisabled: true, editActions: 0});
        user = await waitForRemote(async () => {
            const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
                method: "POST", headers: {"content-type": "application/json"},
                body: JSON.stringify({email: userEmail, password: userPassword, returnSecureToken: true})
            });
            return response.ok ? response.json() : null;
        }, "Pending test account not found");
        await logout(context);

        admin = await createAccount(adminEmail, adminPassword, adminName);
        await promoteAndBootstrapAdmin(admin);
        await login(context, adminEmail, adminPassword, "Admin");
        const registration = await evaluate(context, `
            await waitFor(function(){ return !document.querySelector("[data-admin-review]").hidden; }, "Admin tools missing");
            document.querySelector("[data-admin-review]").click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${user.localId}"]'); }, "Registration queue missing user", 45000);
            const card = document.querySelector('[data-admin-card="${user.localId}"]');
            card.querySelector("[data-admin-author]").value = "__requested__";
            card.querySelector("[data-admin-author-name]").value = ${JSON.stringify(userName)};
            window.confirm = function(){ return true; };
            card.querySelector('[data-admin-action="approve-account"]').click();
            await waitFor(function(){ return !document.querySelector('[data-admin-card="${user.localId}"]'); }, "Registration approval failed", 45000);
            return document.getElementById("admin-status").textContent;
        `);
        assert.match(registration, /approved/i);
        await waitForRemote(async () => (await listDocuments("accounts"))
            .find(item => item.id === user.localId && item.status === "approved"),
        "Account did not become approved");

        await logout(context);
        await login(context, userEmail, userPassword, "User");
        const upload = await evaluate(context, `
            await waitFor(function(){ return !document.querySelector("[data-map-upload]").disabled; }, "Submission button stayed disabled");
            document.getElementById("map_name").value = ${JSON.stringify(mapName)};
            document.querySelector("[data-map-upload]").click();
            await waitFor(function(){ return /submitted for admin review/i.test(document.getElementById("vt-toast").textContent); }, "Map submission failed", 45000);
            return {toast: document.getElementById("vt-toast").textContent,
                notificationCount: Number(document.querySelector("[data-notification-count]").textContent || 0)};
        `);
        assert.match(upload.toast, /submitted for admin review/i);
        assert.ok(upload.notificationCount >= 1);
        submission = await waitForRemote(async () => (await listDocuments("mapSubmissions"))
            .find(item => item.submittedBy === user.localId && item.mapName === mapName && item.status === "pending"),
        "Pending submission not found");

        await logout(context);
        await login(context, adminEmail, adminPassword, "Admin");
        const publication = await evaluate(context, `
            document.querySelector("[data-admin-review]").click();
            document.querySelector('[data-admin-tab="submissions"]').click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${submission.id}"]'); }, "Submission queue missing map", 45000);
            const card = document.querySelector('[data-admin-card="${submission.id}"]');
            window.confirm = function(){ return true; };
            card.querySelector('[data-admin-action="approve-submission"]').click();
            await waitFor(function(){ return !document.querySelector('[data-admin-card="${submission.id}"]'); }, "Publication failed", 60000);
            return document.getElementById("admin-status").textContent;
        `);
        assert.match(publication, /published/i);
        await waitForRemote(async () => (await listDocuments("maps"))
            .find(item => item.mapName === mapName && item.status === "active"),
        "Approved map did not become active");

        await logout(context);
        await login(context, userEmail, userPassword, "User");
        const notices = await evaluate(context, `
            await waitFor(function(){ return Number(document.querySelector("[data-notification-count]").textContent || 0) >= 2; }, "Approval notice missing", 45000);
            document.querySelector("[data-notifications]").click();
            await waitFor(function(){ return document.querySelectorAll("#notification-list .account-card").length >= 2; }, "Notices did not render");
            return Array.from(document.querySelectorAll("#notification-list .account-card strong"), function(node){ return node.textContent; });
        `);
        assert.ok(notices.some(title => /approved/i.test(title)));
        console.log(JSON.stringify({guestMaps: guest.visibleMaps, pendingReadOnly: true,
            registrationApproved: true, submissionApproved: true, notifications: notices.length}, null, 2));
    } catch(error) {
        console.error(error.stack || error.message || error);
        process.exitCode = 1;
    } finally {
        try { await cleanup(); }
        catch(error) { console.error("Cleanup failed:", error.stack || error); process.exitCode = 1; }
        try { if(sessionCreated) await call("session.end", {}); } catch(error) {}
        ws.close();
    }
};
