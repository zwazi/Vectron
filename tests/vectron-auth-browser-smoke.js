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
const deniedUserName = `Browser Denied ${nonce}`;
const mapName = `Browser Map ${nonce}`;
const deletedMapName = `Browser Deleted Map ${nonce}`;
const userEmail = `vectron-user-${nonce}@example.com`;
const adminEmail = `vectron-admin-${nonce}@example.com`;
const deniedUserEmail = `vectron-denied-${nonce}@example.com`;
const userPassword = `Vu-${crypto.randomUUID()}!`;
const adminPassword = `Va-${crypto.randomUUID()}!`;
const deniedUserPassword = `Vd-${crypto.randomUUID()}!`;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

if(!oauthToken) throw new Error("VECTRON_ADMIN_OAUTH_TOKEN is required for safe cleanup.");

let user = null;
let admin = null;
let deniedUser = null;
let submission = null;
let deletedSubmission = null;

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
    const documents = [];
    let pageToken = "";
    do {
        const url = new URL(`${root}/${collectionPath}`);
        url.searchParams.set("pageSize", "300");
        if(pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await checkedFetch(url, {headers: managementHeaders(false)});
        const page = await response.json();
        documents.push(...(page.documents || []).map(decodeDocument));
        pageToken = page.nextPageToken || "";
    } while(pageToken);
    return documents;
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
    const accounts = [user, admin, deniedUser].filter(Boolean);
    const uids = accounts.map(item => item.localId);
    const [submissions, maps, audits] = await Promise.all([
        listDocuments("mapSubmissions"), listDocuments("maps"), listDocuments("auditEvents")
    ]);
    const disposableMapNames = new Set([mapName, deletedMapName]);
    const testSubmissions = submissions.filter(item =>
        uids.includes(item.submittedBy) || disposableMapNames.has(item.mapName)
    );
    const testMaps = maps.filter(item => disposableMapNames.has(item.mapName));
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
    await deleteDocument("authors", authorKey(deniedUserName));
    for(const account of accounts) {
        const removed = await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`,
            {method: "POST", headers: managementHeaders(true),
                body: JSON.stringify({localId: account.localId})}
        );
        if(!removed.ok && removed.status !== 404) {
            const detail = await removed.text();
            if(!/USER_NOT_FOUND/i.test(detail)) {
                throw new Error(`Could not delete test account (${removed.status}).`);
            }
        }
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
        async function clickConfirmed(control, message) {
            control.click();
            const popover = await waitFor(function(){
                const candidate = document.getElementById("auth-confirm-popover");
                return candidate && !candidate.hidden && candidate;
            }, message || "Confirmation popover did not open");
            popover.querySelector("#auth-confirm-accept").click();
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
            document.getElementById("auth-gate").hidden &&
            document.querySelector("[data-auth-email]").textContent === ${JSON.stringify(email)} &&
            document.querySelector("[data-auth-role]").textContent === ${JSON.stringify(role)}; },
            "Expected ${role} session did not start");
        return {role: window.vectron_userRole};
    `);
}

async function logout(context) {
    return evaluate(context, `
        document.querySelector("[data-auth-signout]").click();
        await waitFor(function(){
            return document.body.classList.contains("auth-locked") ||
                !document.getElementById("auth-confirm-popover").hidden;
        }, "Sign out neither proceeded nor requested confirmation");
        if(!document.getElementById("auth-confirm-popover").hidden) {
            document.getElementById("auth-confirm-accept").click();
        }
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
            await waitFor(function(){ return document.querySelectorAll("[data-repository-open]").length >= 150; }, "Guest catalog failed", 45000);
            const visibleMaps = document.querySelectorAll("[data-repository-open]").length;
            const editActions = document.querySelectorAll('[data-repository-action="edit"]').length;
            const repositoryList = document.getElementById("map-repository-list");
            repositoryList.scrollTop = repositoryList.scrollHeight;
            const repositoryScrollable = repositoryList.scrollTop > 0;
            document.getElementById("map-repository-refresh").click();
            const refreshResetScroll = repositoryList.scrollTop === 0;
            await waitFor(function(){ return !document.getElementById("map-repository-refresh").disabled; },
                "Guest catalog refresh failed", 45000);
            repositoryList.scrollTop = repositoryList.scrollHeight;
            document.getElementById("map-repository-mine-tab").click();
            const tabResetScroll = repositoryList.scrollTop === 0;
            await clickConfirmed(document.querySelector('[data-repository-action="remix"]'),
                "Guest remix confirmation did not open");
            await waitFor(function(){ return document.getElementById("map-repository-overlay").hidden; }, "Guest map download failed", 45000);
            return {visibleMaps, editActions, uploadHidden: document.querySelector("[data-map-upload]").hidden,
                toast: document.getElementById("vt-toast").textContent,
                repositoryScrollable, refreshResetScroll, tabResetScroll};
        `);
        assert.ok(guest.visibleMaps >= 150);
        assert.strictEqual(guest.editActions, 0);
        assert.strictEqual(guest.uploadHidden, true);
        assert.strictEqual(guest.repositoryScrollable, true);
        assert.strictEqual(guest.refreshResetScroll, true);
        assert.strictEqual(guest.tabResetScroll, true);
        assert.match(guest.toast, /Remixing/);
        await logout(context);

        const pendingUser = await evaluate(context, `
            document.getElementById("auth-signup-tab").click();
            document.getElementById("auth-name").value = ${JSON.stringify(userName)};
            document.getElementById("auth-email").value = ${JSON.stringify(userEmail)};
            document.getElementById("auth-password").value = ${JSON.stringify(userPassword)};
            document.getElementById("auth-confirm-password").value = ${JSON.stringify(userPassword)};
            document.getElementById("auth-form").requestSubmit();
            await waitFor(function(){ return window.vectron_userRole === "pending" &&
                document.getElementById("auth-gate").hidden &&
                document.querySelector("[data-auth-email]").textContent === ${JSON.stringify(userEmail)}; }, "Pending session failed");
            document.querySelector("[data-map-repository]").click();
            document.getElementById("map-repository-others-tab").click();
            await waitFor(function(){ return document.querySelectorAll("[data-repository-open]").length >= 150; }, "Pending catalog failed", 45000);
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
            await clickConfirmed(card.querySelector('[data-admin-action="approve-account"]'),
                "Registration approval confirmation did not open");
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
            let uploadError = "";
            try { await window.vectron_uploadCurrentMap(); }
            catch(error) { uploadError = error && (error.stack || error.message) || String(error); }
            const mapCommandShown = !document.getElementById("map-file-command-overlay").hidden;
            document.getElementById("map-file-command-close").click();
            return {toast: document.getElementById("vt-toast").textContent,
                notificationCount: Number(document.querySelector("[data-notification-count]").textContent || 0),
                role: window.vectron_userRole,
                uploadDisabled: document.querySelector("[data-map-upload]").disabled,
                uploadError, mapCommandShown};
        `);
        assert.match(upload.toast, /submitted for admin review/i, JSON.stringify(upload));
        assert.strictEqual(upload.mapCommandShown, true,
            "Ordinary user uploads should still offer the MAP_FILE command");
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
            card.scrollIntoView({block: "center"});
            await waitFor(function(){ return card.querySelector(".map-review-preview").getAttribute("aria-busy") === "false"; },
                "Submission preview did not settle", 45000);
            const cardStyle = getComputedStyle(card);
            const actionStyle = getComputedStyle(card.querySelector(".map-review-actions"));
            const layout = {
                columns: cardStyle.gridTemplateColumns.trim().split(/\\s+/).length,
                actionDirection: actionStyle.flexDirection,
                hasDelete: Boolean(card.querySelector('[data-admin-action="delete-submission-map"]')),
                submittedReason: card.querySelector(".map-review-submission-reason span").textContent,
                previewRendered: Boolean(card.querySelector(".map-review-preview-svg")),
                previewText: card.querySelector(".map-review-preview").textContent.trim()
            };
            card.querySelector("[data-admin-reason]").value = "Edited and published in one step";
            await clickConfirmed(card.querySelector('[data-admin-action="edit-submission"]'),
                "Review edit confirmation did not open");
            await waitFor(function(){ return document.getElementById("admin-overlay").hidden &&
                !document.querySelector("[data-map-review-publish]").hidden; },
                "Pending review did not open for editing", 45000);
            const publishButton = document.querySelector("[data-map-review-publish]");
            await clickConfirmed(publishButton, "Review publish confirmation did not open");
            await waitFor(function(){ return publishButton.classList.contains("auth-uploading"); },
                "One-step publication did not start", 15000);
            await waitFor(function(){ return !publishButton.classList.contains("auth-uploading"); },
                "One-step publication did not settle", 60000);
            return {status: document.getElementById("vt-toast").textContent, layout,
                publishButtonHidden: document.querySelector("[data-map-review-publish]").hidden,
                mapCommandHidden: document.getElementById("map-file-command-overlay").hidden,
                publishLabel: publishButton.querySelector("span").textContent};
        `);
        assert.match(publication.status, /published/i);
        assert.strictEqual(publication.publishButtonHidden, true);
        assert.strictEqual(publication.mapCommandHidden, true,
            "Admin approval should not open the MAP_FILE command panel");
        assert.strictEqual(publication.publishLabel, "Approve");
        assert.strictEqual(publication.layout.columns, 2);
        assert.strictEqual(publication.layout.actionDirection, "column");
        assert.strictEqual(publication.layout.hasDelete, true);
        assert.match(publication.layout.submittedReason, /No reason was provided/i);
        assert.strictEqual(publication.layout.previewRendered, true, publication.layout.previewText);
        await waitForRemote(async () => (await listDocuments("maps"))
            .find(item => item.mapName === mapName && item.status === "active"),
        "Approved map did not become active");

        const publishedLayout = await evaluate(context, `
            document.querySelector("[data-admin-review]").click();
            document.querySelector('[data-admin-tab="maps"]').click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${submission.mapId}"]'); },
                "Published map was missing", 45000);
            const card = document.querySelector('[data-admin-card="${submission.mapId}"]');
            card.scrollIntoView({block: "center"});
            await waitFor(function(){ return card.querySelector(".map-review-preview").getAttribute("aria-busy") === "false"; },
                "Published map preview did not settle", 45000);
            return {
                columns: getComputedStyle(card).gridTemplateColumns.trim().split(/\\s+/).length,
                actionDirection: getComputedStyle(card.querySelector(".map-review-actions")).flexDirection,
                hasDetails: Boolean(card.querySelector(".map-review-details")),
                hasMetadataAction: Boolean(card.querySelector('[data-admin-action="edit-map-metadata"]')),
                previewRendered: Boolean(card.querySelector(".map-review-preview-svg")),
                previewText: card.querySelector(".map-review-preview").textContent.trim()
            };
        `);
        assert.strictEqual(publishedLayout.columns, 2);
        assert.strictEqual(publishedLayout.actionDirection, "column");
        assert.strictEqual(publishedLayout.hasDetails, true);
        assert.strictEqual(publishedLayout.hasMetadataAction, true);
        assert.strictEqual(publishedLayout.previewRendered, true, publishedLayout.previewText);

        const reviewHistory = await evaluate(context, `
            document.querySelector('[data-admin-tab="history"]').click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${submission.id}"]'); },
                "Approved review did not enter history", 45000);
            const dialog = document.querySelector(".admin-dialog");
            const card = document.querySelector('[data-admin-card="${submission.id}"]');
            const result = {
                resize: getComputedStyle(dialog).resize,
                decision: card.querySelectorAll(".map-review-submission-reason span")[1].textContent,
                hasReopen: Boolean(card.querySelector('[data-admin-action="reopen-history"]'))
            };
            await clickConfirmed(card.querySelector('[data-admin-action="reopen-history"]'),
                "Review history confirmation did not open");
            await waitFor(function(){ return document.getElementById("admin-overlay").hidden &&
                !document.querySelector("[data-map-review-publish]").hidden; },
                "Historical review did not reopen", 60000);
            result.reopened = true;
            const denyButton = document.querySelector("[data-map-review-deny]");
            result.denyVisible = !denyButton.hidden && !denyButton.disabled;
            denyButton.click();
            const popover = await waitFor(function(){
                const candidate = document.getElementById("auth-confirm-popover");
                return candidate && !candidate.hidden && candidate;
            }, "Editor denial confirmation did not open");
            const reasonField = popover.querySelector("#auth-confirm-reason-field");
            const reasonInput = popover.querySelector("#auth-confirm-reason");
            result.reasonVisible = !reasonField.hidden;
            popover.querySelector("#auth-confirm-accept").click();
            await waitFor(function(){
                return !popover.hidden && !popover.querySelector("#auth-confirm-reason-error").hidden;
            }, "Editor denial accepted an empty reason");
            result.emptyReasonBlocked = true;
            reasonInput.value = "Denied from the editor workflow";
            popover.querySelector("#auth-confirm-accept").click();
            await waitFor(function(){ return denyButton.classList.contains("auth-uploading"); },
                "Editor denial did not start", 15000);
            await waitFor(function(){ return !denyButton.classList.contains("auth-uploading"); },
                "Editor denial did not settle", 60000);
            result.denied = /was denied/i.test(document.getElementById("vt-toast").textContent);
            result.queueOutcome = denyButton.hidden ? "clear" : "next";
            window.vectron_clearRepositoryEditState();
            return result;
        `);
        assert.ok(["clear", "next"].includes(reviewHistory.queueOutcome));
        delete reviewHistory.queueOutcome;
        assert.deepStrictEqual(reviewHistory, {
            resize: "both", decision: "Edited and published in one step",
            hasReopen: true, reopened: true, denyVisible: true, reasonVisible: true,
            emptyReasonBlocked: true, denied: true
        });
        await waitForRemote(async () => (await listDocuments("mapSubmissions"))
            .find(item => item.historySourceSubmissionId === submission.id &&
                item.status === "denied" && item.reviewReason === "Denied from the editor workflow"),
        "Historical review was not denied from the editor workflow");

        await logout(context);
        await login(context, userEmail, userPassword, "User");
        const notices = await evaluate(context, `
            await waitFor(function(){ return Number(document.querySelector("[data-notification-count]").textContent || 0) >= 2; }, "Approval notice missing", 45000);
            document.querySelector("[data-notifications]").click();
            await waitFor(function(){ return document.querySelectorAll("#notification-list .account-card").length >= 2; }, "Notices did not render");
            return Array.from(document.querySelectorAll("#notification-list .account-card strong"), function(node){ return node.textContent; });
        `);
        assert.ok(notices.some(title => /approved/i.test(title)));

        const deletionUpload = await evaluate(context, `
            document.getElementById("map_name").value = ${JSON.stringify(deletedMapName)};
            let uploadError = "";
            try { await window.vectron_uploadCurrentMap(); }
            catch(error) { uploadError = error && (error.stack || error.message) || String(error); }
            return {toast: document.getElementById("vt-toast").textContent, uploadError};
        `);
        assert.match(deletionUpload.toast, /submitted for admin review/i, JSON.stringify(deletionUpload));
        deletedSubmission = await waitForRemote(async () => (await listDocuments("mapSubmissions"))
            .find(item => item.submittedBy === user.localId && item.mapName === deletedMapName && item.status === "pending"),
        "Disposable deletion submission not found");
        await logout(context);
        await login(context, adminEmail, adminPassword, "Admin");
        const mapDeletion = await evaluate(context, `
            document.querySelector("[data-admin-review]").click();
            document.querySelector('[data-admin-tab="submissions"]').click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${deletedSubmission.id}"]'); },
                "Disposable map review was missing", 45000);
            const card = document.querySelector('[data-admin-card="${deletedSubmission.id}"]');
            card.querySelector("[data-admin-reason]").value = "Disposable browser map deletion test";
            await clickConfirmed(card.querySelector('[data-admin-action="delete-submission-map"]'),
                "Map deletion confirmation did not open");
            await waitFor(function(){ return /permanently deleted/i.test(document.getElementById("admin-status").textContent); },
                "Map deletion did not complete", 45000);
            return document.getElementById("admin-status").textContent;
        `);
        assert.match(mapDeletion, /permanently deleted/i);
        assert.strictEqual(
            (await listDocuments("mapSubmissions")).some(item => item.mapName === deletedMapName),
            false,
            "Deleted map submission still exists"
        );
        assert.strictEqual(
            (await listDocuments("maps")).some(item => item.mapName === deletedMapName),
            false,
            "Deleted map still exists in the catalog"
        );
        const deletedObjectUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(deletedSubmission.storagePath)}`;
        const deletedObject = await fetch(deletedObjectUrl, {headers: managementHeaders(false)});
        assert.strictEqual(deletedObject.status, 404, "Deleted map revision still exists in Storage");

        await logout(context);
        await evaluate(context, `
            document.getElementById("auth-signup-tab").click();
            document.getElementById("auth-name").value = ${JSON.stringify(deniedUserName)};
            document.getElementById("auth-email").value = ${JSON.stringify(deniedUserEmail)};
            document.getElementById("auth-password").value = ${JSON.stringify(deniedUserPassword)};
            document.getElementById("auth-confirm-password").value = ${JSON.stringify(deniedUserPassword)};
            document.getElementById("auth-form").requestSubmit();
            await waitFor(function(){ return window.vectron_userRole === "pending" &&
                document.querySelector("[data-auth-email]").textContent === ${JSON.stringify(deniedUserEmail)}; },
                "Disposable denial account did not become pending");
            return true;
        `);
        deniedUser = await waitForRemote(async () => {
            const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
                method: "POST", headers: {"content-type": "application/json"},
                body: JSON.stringify({email: deniedUserEmail, password: deniedUserPassword, returnSecureToken: true})
            });
            return response.ok ? response.json() : null;
        }, "Disposable denial account was not created");
        await logout(context);
        await login(context, adminEmail, adminPassword, "Admin");
        const denial = await evaluate(context, `
            document.querySelector("[data-admin-review]").click();
            document.querySelector('[data-admin-tab="accounts"]').click();
            await waitFor(function(){ return document.querySelector('[data-admin-card="${deniedUser.localId}"]'); },
                "Pending denial account was missing", 45000);
            const card = document.querySelector('[data-admin-card="${deniedUser.localId}"]');
            card.querySelector("[data-admin-reason]").value = "Disposable browser deletion test";
            await clickConfirmed(card.querySelector('[data-admin-action="deny-account"]'),
                "Registration deletion confirmation did not open");
            await waitFor(function(){ return /permanently deleted/i.test(document.getElementById("admin-status").textContent); },
                "Registration deletion did not complete", 45000);
            return document.getElementById("admin-status").textContent;
        `);
        assert.match(denial, /permanently deleted/i);
        await waitForRemote(async () => !(await listDocuments("accounts"))
            .some(item => item.id === deniedUser.localId),
        "Denied registration record still exists");
        const deletedLogin = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            method: "POST", headers: {"content-type": "application/json"},
            body: JSON.stringify({email: deniedUserEmail, password: deniedUserPassword, returnSecureToken: true})
        });
        assert.strictEqual(deletedLogin.ok, false, "Denied Firebase login still exists");
        console.log(JSON.stringify({guestMaps: guest.visibleMaps, pendingReadOnly: true,
            registrationApproved: true, registrationDeleted: true,
            submissionApproved: true, submissionDeleted: true,
            notifications: notices.length}, null, 2));
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
