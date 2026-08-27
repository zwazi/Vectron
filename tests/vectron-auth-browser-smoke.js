"use strict";

// Real-browser authentication smoke test. Start Vectron and Firefox with
// WebDriver BiDi as documented in README.md. The test creates one disposable
// Firebase account, exercises account creation/map upload/login/logout/
// persistence, then deletes the uploaded map and account even if an assertion
// fails. Set VECTRON_TEST_UPLOAD=0 only when the Storage bucket is unavailable.

const assert = require("assert");
const crypto = require("crypto");

const apiKey = "AIzaSyCglVAiB3494_GQf2ESrE9y_2YWELpIfBg";
const testEmail = `vectron-browser-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@example.com`;
const testPassword = `Vt-${crypto.randomUUID()}!`;
const bidiUrl = process.env.VECTRON_BIDI_URL || "ws://127.0.0.1:9223/session";
const testUploadEnabled = process.env.VECTRON_TEST_UPLOAD !== "0";
const uploadPath = "Browser Pilot/maps/Browser Upload-0.1.aamap.xml";
const storageBucket = "tronnerrepository.firebasestorage.app";

const ws = new WebSocket(bidiUrl);
const pending = new Map();
let id = 0;
let sessionCreated = false;

function call(method, params) {
    return new Promise((resolve, reject) => {
        const callId = ++id;
        pending.set(callId, {resolve, reject});
        ws.send(JSON.stringify({id: callId, method, params}));
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

async function evaluateJson(context, expression) {
    const evaluated = await call("script.evaluate", {
        expression,
        target: {context},
        awaitPromise: true,
        resultOwnership: "none"
    });
    if(!evaluated.result || evaluated.result.type !== "string") {
        throw new Error("Browser evaluation failed: " + JSON.stringify(evaluated));
    }
    return JSON.parse(evaluated.result.value);
}

async function signInTestAccount() {
    const signIn = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({email: testEmail, password: testPassword, returnSecureToken: true})
        }
    );
    if(!signIn.ok) {
        const response = await signIn.json();
        if(response.error && ["EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS"].includes(response.error.message)) return null;
        throw new Error("Could not retrieve disposable account for cleanup.");
    }
    return signIn.json();
}

async function readUploadedMap() {
    const account = await signInTestAccount();
    if(!account) throw new Error("Could not sign in to verify the uploaded map.");
    const response = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(uploadPath)}?alt=media`,
        {headers: {authorization: `Bearer ${account.idToken}`}}
    );
    if(!response.ok) throw new Error(`Could not read uploaded map (${response.status}).`);
    return response.text();
}

async function deleteTestData() {
    const account = await signInTestAccount();
    if(!account) return;
    const tokenClaims = JSON.parse(Buffer.from(account.idToken.split(".")[1], "base64url").toString("utf8"));
    assert.strictEqual(tokenClaims.name, "Browser Pilot");
    if(testUploadEnabled) {
        const removeMap = await fetch(
            `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(uploadPath)}`,
            {
                method: "DELETE",
                headers: {authorization: `Bearer ${account.idToken}`}
            }
        );
        if(!removeMap.ok && removeMap.status !== 404) {
            throw new Error(`Could not delete disposable map (${removeMap.status}).`);
        }
    }
    const remove = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
        {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({idToken: account.idToken})
        }
    );
    if(!remove.ok) throw new Error("Could not delete disposable Firebase account.");
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
        await call("browsingContext.navigate", {
            context,
            url: process.env.VECTRON_TEST_URL || "http://127.0.0.1:8000/",
            wait: "complete"
        });

        const firstPass = await evaluateJson(context, `(async function() {
            const email = ${JSON.stringify(testEmail)};
            const password = ${JSON.stringify(testPassword)};
            const testUpload = ${JSON.stringify(testUploadEnabled)};
            function waitFor(check, message, timeout) {
                return new Promise(function(resolve, reject) {
                    const started = Date.now();
                    (function poll() {
                        let value = false;
                        try { value = check(); } catch(error) {}
                        if(value) return resolve(value);
                        if(Date.now() - started > (timeout || 15000)) return reject(new Error(message));
                        setTimeout(poll, 80);
                    })();
                });
            }
            await waitFor(function() {
                return !document.getElementById('auth-panel').hidden;
            }, 'Sign-in panel did not become ready');

            const result = {
                initial: {
                    locked: document.body.classList.contains('auth-locked'),
                    gateVisible: !document.getElementById('auth-gate').hidden,
                    editorStopped: window.vectron_started === false,
                    canvasEmpty: document.getElementById('canvas_container').childElementCount === 0,
                    loginSelected: document.getElementById('auth-login-tab').getAttribute('aria-selected'),
                    loginOverlayCentered: (function() {
                        const rect = document.querySelector('.auth-card').getBoundingClientRect();
                        return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) <= 2 &&
                            Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) <= 2;
                    })()
                }
            };

            document.getElementById('auth-signup-tab').click();
            document.getElementById('auth-name').value = 'Browser Pilot';
            document.getElementById('auth-email').value = email;
            document.getElementById('auth-password').value = password;
            document.getElementById('auth-confirm-password').value = password;
            document.getElementById('auth-form').requestSubmit();
            await waitFor(function() {
                return window.vectron_started === true &&
                    !document.body.classList.contains('auth-locked') &&
                    document.querySelector('.auth-session-plan [data-auth-name]').textContent === 'Browser Pilot' &&
                    document.getElementById('map_version').value === '0.1';
            }, 'Account creation did not unlock Vectron');
            result.created = {
                gateHidden: document.getElementById('auth-gate').hidden,
                sessionVisible: !document.querySelector('.auth-session-plan').hidden,
                displayName: document.querySelector('.auth-session-plan [data-auth-name]').textContent,
                email: document.querySelector('.auth-session-plan [data-auth-email]').textContent,
                canvasStarted: document.getElementById('canvas_container').childElementCount > 0,
                author: document.getElementById('map_author').value,
                authorLocked: document.getElementById('map_author').readOnly,
                category: document.getElementById('map_category').value,
                categoryLocked: document.getElementById('map_category').readOnly,
                version: document.getElementById('map_version').value,
                versionLocked: document.getElementById('map_version').readOnly,
                accountDockTopRight: (function() {
                    const dock = document.getElementById('auth-account-controls');
                    const toolbar = document.getElementById('top-settings-bar');
                    const rect = dock.getBoundingClientRect();
                    const toolbarRect = toolbar.getBoundingClientRect();
                    return dock.parentElement === toolbar &&
                        toolbarRect.right - rect.right <= 12 &&
                        rect.top >= toolbarRect.top &&
                        rect.bottom <= toolbarRect.bottom &&
                        dock.contains(document.querySelector('[data-map-upload]'));
                })()
            };

            if(testUpload) {
                document.getElementById('map_name').value = 'Browser Upload';
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent === 'Uploaded to Browser Pilot/maps/Browser Upload-0.1.aamap.xml';
                }, 'Map did not upload to the locked author/maps path', 30000);
                result.uploadPath = document.getElementById('vt-toast').textContent.replace('Uploaded to ', '');
            }

            const draftName = document.getElementById('map_name');
            draftName.value = 'Browser Draft';
            draftName.dispatchEvent(new Event('input', {bubbles: true}));
            result.created.draftSavedLocally = window.vectron_localDraftSaveNow();

            document.querySelector('.auth-session-plan [data-auth-signout]').click();
            await waitFor(function() {
                return document.body.classList.contains('auth-locked') &&
                    !document.getElementById('auth-gate').hidden;
            }, 'Sign out did not lock Vectron');
            result.signedOut = {
                locked: document.body.classList.contains('auth-locked'),
                editorInert: document.getElementById('canvas_container').inert,
                sessionsHidden: Array.from(document.querySelectorAll('.auth-session')).every(function(node) {
                    return node.hidden;
                })
            };

            document.getElementById('auth-login-tab').click();
            document.getElementById('auth-email').value = email;
            document.getElementById('auth-password').value = password;
            document.getElementById('auth-form').requestSubmit();
            await waitFor(function() {
                return !document.body.classList.contains('auth-locked') &&
                    document.getElementById('map_name').value === 'Browser Draft';
            }, 'Sign in did not restore the local draft');
            result.loggedIn = {
                unlocked: !document.body.classList.contains('auth-locked'),
                gateHidden: document.getElementById('auth-gate').hidden,
                mapName: document.getElementById('map_name').value,
                versionLocked: document.getElementById('map_version').readOnly
            };
            return JSON.stringify(result);
        })()`);
        assert.deepStrictEqual(firstPass.initial, {
            locked: true,
            gateVisible: true,
            editorStopped: true,
            canvasEmpty: true,
            loginSelected: "true",
            loginOverlayCentered: true
        });
        assert.deepStrictEqual(firstPass.created, {
            gateHidden: true,
            sessionVisible: true,
            displayName: "Browser Pilot",
            email: testEmail,
            canvasStarted: true,
            author: "Browser Pilot",
            authorLocked: true,
            category: "maps",
            categoryLocked: true,
            version: "0.1",
            versionLocked: true,
            draftSavedLocally: true,
            accountDockTopRight: true
        });
        if(testUploadEnabled) assert.strictEqual(firstPass.uploadPath, uploadPath);
        assert.deepStrictEqual(firstPass.signedOut, {
            locked: true,
            editorInert: true,
            sessionsHidden: true
        });
        assert.deepStrictEqual(firstPass.loggedIn, {
            unlocked: true,
            gateHidden: true,
            mapName: "Browser Draft",
            versionLocked: true
        });

        if(testUploadEnabled) {
            const uploadedXml = await readUploadedMap();
            assert.match(uploadedXml, /<Resource[^>]*name="Browser Upload"/);
            assert.match(uploadedXml, /author="Browser Pilot"/);
            assert.match(uploadedXml, /category="maps"/);
        }

        await call("browsingContext.reload", {context, wait: "complete"});
        const persisted = await evaluateJson(context, `(async function() {
            const started = Date.now();
            while(Date.now() - started < 15000) {
                if(window.vectron_started === true && !document.body.classList.contains('auth-locked')) break;
                await new Promise(function(resolve) { setTimeout(resolve, 80); });
            }
            const result = {
                unlocked: !document.body.classList.contains('auth-locked'),
                editorStarted: window.vectron_started === true,
                email: document.querySelector('.auth-session-plan [data-auth-email]').textContent,
                mapName: document.getElementById('map_name').value,
                versionLocked: document.getElementById('map_version').readOnly
            };
            document.querySelector('.auth-session-plan [data-auth-signout]').click();
            while(Date.now() - started < 20000 && !document.body.classList.contains('auth-locked')) {
                await new Promise(function(resolve) { setTimeout(resolve, 80); });
            }
            result.lockedAfterLogout = document.body.classList.contains('auth-locked');
            return JSON.stringify(result);
        })()`);
        assert.deepStrictEqual(persisted, {
            unlocked: true,
            editorStarted: true,
            email: testEmail,
            mapName: "Browser Draft",
            versionLocked: true,
            lockedAfterLogout: true
        });

        console.log(testUploadEnabled
            ? "Vectron Firebase account/upload/login/logout browser smoke test passed."
            : "Vectron Firebase account/login/logout browser smoke test passed (upload skipped)."
        );
    } catch(error) {
        console.error(error.stack || error);
        process.exitCode = 1;
    } finally {
        try {
            await deleteTestData();
            console.log("Disposable Firebase browser-test map/account deleted (if created).");
        } catch(cleanupError) {
            console.error(cleanupError.stack || cleanupError);
            process.exitCode = 1;
        }
        if(sessionCreated) {
            try { await call("session.end", {}); } catch(error) {}
        }
        ws.close();
    }
};
