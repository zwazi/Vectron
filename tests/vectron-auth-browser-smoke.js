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
const editedUploadPath = "Browser Pilot/maps/Browser Upload-0.2.aamap.xml";
const archivedUploadPath = "Browser Pilot/maps/archive/Browser Upload-0.1.aamap.xml";
const remixUploadPath = "Browser Pilot/maps/Default_r2-1.aamap.xml";
const invalidRemixPath = "Browser Pilot/maps/Default_wrong-1.aamap.xml";
const guestWriteProbePath = "Browser Pilot/maps/Guest Write Probe-1.aamap.xml";
const adminSourcePath = "Admin Target/maps/Admin Fix-0.1.aamap.xml";
const adminEditedPath = "Admin Target/maps/Admin Fix-0.2.aamap.xml";
const adminArchivePath = "Admin Target/maps/archive/Admin Fix-0.1.aamap.xml";
const adminRemixPath = "Browser Pilot/maps/Admin Fix_r-0.1.aamap.xml";
const cleanupPaths = [uploadPath, editedUploadPath, archivedUploadPath, remixUploadPath, invalidRemixPath, guestWriteProbePath,
    adminSourcePath, adminEditedPath, adminArchivePath, adminRemixPath];
const storageBucket = "tronnerrepository.firebasestorage.app";
const adminOAuthToken = process.env.VECTRON_ADMIN_OAUTH_TOKEN || "";

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
    if(process.env.VECTRON_DEBUG_NETWORK === "1" && message.type === "event" &&
       message.method && message.method.startsWith("network.")) {
        const requestUrl = message.params && message.params.request && message.params.request.url;
        const responseUrl = message.params && message.params.response && message.params.response.url;
        const url = requestUrl || responseUrl || "";
        if(url.includes("firebasestorage.googleapis.com")) {
            console.log("STORAGE_NETWORK", message.method,
                message.params.response && message.params.response.status,
                message.params.errorText || "", url);
        }
    }
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

async function readRepositoryMap(fullPath) {
    const account = await signInTestAccount();
    if(!account) throw new Error("Could not sign in to verify the uploaded map.");
    const response = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(fullPath)}?alt=media`,
        {headers: {authorization: `Bearer ${account.idToken}`}}
    );
    if(!response.ok) throw new Error(`Could not read uploaded map (${response.status}).`);
    return response.text();
}

async function promoteTestAccountToAdmin() {
    if(!adminOAuthToken) return false;
    const account = await signInTestAccount();
    if(!account) throw new Error("Could not sign in to promote the disposable account.");
    const response = await fetch(
        "https://identitytoolkit.googleapis.com/v1/projects/tronnerrepository/accounts:update",
        {
            method: "POST",
            headers: {authorization: `Bearer ${adminOAuthToken}`, "content-type": "application/json"},
            body: JSON.stringify({
                localId: account.localId,
                customAttributes: JSON.stringify({role: "admin", admin: true})
            })
        }
    );
    if(!response.ok) throw new Error(`Could not promote disposable account (${response.status}).`);
    return true;
}

async function deleteTestData() {
    const account = await signInTestAccount();
    if(!account) return;
    const tokenClaims = JSON.parse(Buffer.from(account.idToken.split(".")[1], "base64url").toString("utf8"));
    assert.strictEqual(tokenClaims.name, "Browser Pilot");
    if(testUploadEnabled) {
        for(const fullPath of cleanupPaths) {
            const removeMap = await fetch(
                `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(fullPath)}`,
                {
                    method: "DELETE",
                    headers: {authorization: `Bearer ${account.idToken}`}
                }
            );
            if(!removeMap.ok && removeMap.status !== 403 && removeMap.status !== 404) {
                throw new Error(`Could not delete disposable map ${fullPath} (${removeMap.status}).`);
            }
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
        if(process.env.VECTRON_DEBUG_NETWORK === "1") {
            await call("session.subscribe", {events: ["network.responseCompleted", "network.fetchError"]});
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

            document.getElementById('auth-guest').click();
            await waitFor(function() {
                return window.vectron_started === true &&
                    !document.body.classList.contains('auth-locked') &&
                    document.querySelector('[data-auth-role]').textContent === 'Guest';
            }, 'Guest mode did not unlock Vectron');
            document.querySelector('[data-map-repository]').click();
            await waitFor(function() {
                return !document.getElementById('map-repository-overlay').hidden &&
                    document.getElementById('map-repository-others-tab').getAttribute('aria-selected') === 'true' &&
                    document.querySelectorAll('[data-repository-open]').length >= 275;
            }, 'Guest could not read the public repository', 30000);
            const guestGroupsCollapsed = Array.from(document.querySelectorAll('.repository-author-group'))
                .every(function(group) {
                    const heading = group.querySelector('[data-repository-author]');
                    const maps = group.querySelector('.repository-author-maps');
                    return heading && heading.getAttribute('aria-expanded') === 'false' && maps.hidden;
                });
            const guestZwaziGroup = Array.from(document.querySelectorAll('.repository-author-group'))
                .find(function(group) {
                    const author = group.querySelector('.repository-author-heading span:first-child');
                    return author && author.textContent === 'Zwazi';
                });
            if(!guestZwaziGroup) throw new Error('Guest repository did not include Zwazi');
            guestZwaziGroup.querySelector('[data-repository-author]').click();
            const guestRemix = document.querySelector(
                '[data-repository-open="Zwazi/maps/Default-v1.aamap.xml"][data-repository-action="remix"]'
            );
            if(!guestRemix) throw new Error('Guest repository did not offer Remix');
            const guestEditButtons = document.querySelectorAll('[data-repository-action="edit"]').length;
            window.confirm = function() { return true; };
            guestRemix.click();
            await waitFor(function() {
                const toast = document.getElementById('vt-toast');
                return document.getElementById('map-repository-overlay').hidden &&
                    document.getElementById('map_name').value === 'Default_r' &&
                    toast && toast.textContent === 'Remixing Default-v1 by Zwazi as Default_r.';
            }, 'Guest could not remix a public map', 30000);
            window.vectron_uploadCurrentMap();
            await waitFor(function() {
                const toast = document.getElementById('vt-toast');
                return toast && toast.textContent === 'Sign in or create an account to upload maps.';
            }, 'Guest upload guard was not applied');
            const guestXml = window.eventHandler_getExportMap().xml;
            result.guest = {
                unlocked: !document.body.classList.contains('auth-locked'),
                role: document.querySelector('[data-auth-role]').textContent,
                author: document.getElementById('map_author').value,
                authorLocked: document.getElementById('map_author').readOnly,
                categoryLocked: document.getElementById('map_category').readOnly,
                versionLocked: document.getElementById('map_version').readOnly,
                uploadHidden: document.querySelector('[data-map-upload]').hidden,
                mineTabHidden: document.getElementById('map-repository-mine-tab').hidden,
                othersSelectedByDefault: document.getElementById('map-repository-others-tab')
                    .getAttribute('aria-selected') === 'true',
                authorsCollapsedByDefault: guestGroupsCollapsed,
                editButtons: guestEditButtons,
                remixName: document.getElementById('map_name').value,
                remixProvenance: guestXml.includes('Original author: "Zwazi"'),
                draftSavedLocally: window.vectron_localDraftSaveNow(),
                accountAction: document.querySelector('[data-auth-signout] span').textContent
            };
            document.querySelector('[data-auth-signout]').click();
            await waitFor(function() {
                return document.body.classList.contains('auth-locked') &&
                    !document.getElementById('auth-gate').hidden;
            }, 'Guest Sign in action did not return to account access');

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
            const dtdInput = document.getElementById('map_dtd');
            dtdInput.click();
            await waitFor(function() {
                return !document.getElementById('map-dtd-options').hidden;
            }, 'DTD dropdown did not open');
            const dtdOptionCount = document.querySelectorAll('#map-dtd-options [data-dtd-value]').length;
            document.querySelector('[data-dtd-value="map-0.2.9.dtd"]').click();
            const dtdKnownOptionSelected = dtdInput.value === 'map-0.2.9.dtd';
            dtdInput.value = 'custom/browser-map.dtd';
            dtdInput.dispatchEvent(new Event('input', {bubbles: true}));
            const dtdMenu = document.getElementById('map-dtd-options');
            const dtdMenuRect = dtdMenu.getBoundingClientRect();
            const dtdAllOptionsRemainVisible = !dtdMenu.hidden &&
                Array.from(dtdMenu.querySelectorAll('[data-dtd-value]')).every(function(option) {
                    const rect = option.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 &&
                        rect.top >= dtdMenuRect.top && rect.bottom <= dtdMenuRect.bottom;
                });
            dtdInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
            result.created = {
                gateHidden: document.getElementById('auth-gate').hidden,
                sessionVisible: !document.querySelector('.auth-session-plan').hidden,
                displayName: document.querySelector('.auth-session-plan [data-auth-name]').textContent,
                email: document.querySelector('.auth-session-plan [data-auth-email]').textContent,
                role: document.querySelector('.auth-session-plan [data-auth-role]').textContent,
                canvasStarted: document.getElementById('canvas_container').childElementCount > 0,
                author: document.getElementById('map_author').value,
                authorLocked: document.getElementById('map_author').readOnly,
                category: document.getElementById('map_category').value,
                categoryLocked: document.getElementById('map_category').readOnly,
                version: document.getElementById('map_version').value,
                versionLocked: document.getElementById('map_version').readOnly,
                axesCheckboxGone: !document.getElementById('map_axes_forced'),
                exportAlwaysHasAxes: window.eventHandler_getExportMap().xml.includes('<Axes number="8"/>'),
                typedDtd: document.getElementById('map_dtd').value,
                dtdOptionCount: dtdOptionCount,
                dtdKnownOptionSelected: dtdKnownOptionSelected,
                dtdAllOptionsRemainVisible: dtdAllOptionsRemainVisible,
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
                try {
                    await waitFor(function() {
                        const toast = document.getElementById('vt-toast');
                        return toast && toast.textContent === 'Uploaded to Browser Pilot/maps/Browser Upload-0.1.aamap.xml';
                    }, 'Map did not upload to the locked author/maps path', 30000);
                } catch(error) {
                    const [appSdk, authSdk] = await Promise.all([
                        import('https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js'),
                        import('https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js')
                    ]);
                    const token = await authSdk.getIdTokenResult(authSdk.getAuth(appSdk.getApp()).currentUser);
                    throw new Error('Map did not upload: ' + JSON.stringify({
                        toast: document.getElementById('vt-toast').textContent,
                        uiRole: window.vectron_userRole,
                        tokenName: token.claims.name || '',
                        tokenRole: token.claims.role || '',
                        tokenAdmin: token.claims.admin === true
                    }));
                }
                result.uploadPath = document.getElementById('vt-toast').textContent.replace('Uploaded to ', '');
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent ===
                        'That map name and version already exist. Choose a different version.';
                }, 'A duplicate repository identity was not rejected', 30000);
                result.duplicateUploadRejected = true;
            }

            document.querySelector('[data-map-repository]').click();
            if(testUpload) {
                await waitFor(function() {
                    return !document.getElementById('map-repository-overlay').hidden &&
                        document.querySelector('[data-repository-open="Browser Pilot/maps/Browser Upload-0.1.aamap.xml"]');
                }, "The user's repository maps did not become available", 30000);
            }
            const mineTabSelectedByDefault = document.getElementById('map-repository-mine-tab').getAttribute('aria-selected') === 'true';
            const ownMapCount = document.querySelectorAll('[data-repository-open]').length;
            const ownTabOnlyShowsCurrentUser = Array.from(document.querySelectorAll('.repository-author-heading span:first-child'))
                .every(function(node) { return node.textContent === 'Browser Pilot'; });
            const ownEditButton = document.querySelector('[data-repository-open="Browser Pilot/maps/Browser Upload-0.1.aamap.xml"]');
            const ownButtonSaysEdit = !testUpload || ownEditButton.textContent.trim() === 'Edit';
            if(testUpload) {
                window.confirm = function() { return true; };
                ownEditButton.click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return document.getElementById('map-repository-overlay').hidden &&
                        document.getElementById('map_version').value === '0.2' &&
                        toast && toast.textContent === 'Editing Browser Upload. Version bumped to 0.2.';
                }, 'Owned map did not open for editing with a bumped version', 30000);
                result.edit = {
                    name: document.getElementById('map_name').value,
                    nameLocked: document.getElementById('map_name').readOnly,
                    version: document.getElementById('map_version').value,
                    versionLocked: document.getElementById('map_version').readOnly,
                    uploadLabel: document.querySelector('[data-map-upload] span').textContent
                };
                document.getElementById('map_settings').value = 'CYCLE_SPEED 30';
                document.getElementById('map_settings').dispatchEvent(new Event('input', {bubbles: true}));
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent ===
                        'Submitted Browser Pilot/maps/Browser Upload-0.2.aamap.xml; archived the previous version in Browser Pilot/maps/archive/Browser Upload-0.1.aamap.xml.';
                }, 'Edited map was not submitted and archived', 30000);
                result.edit.submittedPath = 'Browser Pilot/maps/Browser Upload-0.2.aamap.xml';
                result.edit.uploadLabelAfterSubmit = document.querySelector('[data-map-upload] span').textContent;

                document.querySelector('[data-map-repository]').click();
                await waitFor(function() {
                    return document.querySelector('[data-repository-open="Browser Pilot/maps/Browser Upload-0.2.aamap.xml"]');
                }, 'The edited live revision did not replace its source', 30000);
                result.edit.archiveHiddenFromLiveMaps =
                    !document.querySelector('[data-repository-open*="/archive/"]') &&
                    !document.querySelector('[data-repository-open="Browser Pilot/maps/Browser Upload-0.1.aamap.xml"]');
            }
            document.getElementById('map-repository-others-tab').click();
            await waitFor(function() {
                return document.getElementById('map-repository-others-tab').getAttribute('aria-selected') === 'true' &&
                    document.querySelectorAll('[data-repository-open]').length >= 275;
            }, "Other authors' repository maps did not become available", 30000);
            const repositoryAuthors = Array.from(document.querySelectorAll('.repository-author-heading span:first-child'))
                .map(function(node) { return node.textContent; });
            const otherAuthorsCollapsedByDefault = Array.from(document.querySelectorAll('.repository-author-group'))
                .every(function(group) {
                    const heading = group.querySelector('[data-repository-author]');
                    const maps = group.querySelector('.repository-author-maps');
                    return heading && heading.getAttribute('aria-expanded') === 'false' && maps.hidden;
                });
            const zwaziGroup = Array.from(document.querySelectorAll('.repository-author-group'))
                .find(function(group) {
                    const author = group.querySelector('.repository-author-heading span:first-child');
                    return author && author.textContent === 'Zwazi';
                });
            if(!zwaziGroup) throw new Error('Expected Zwazi author group was not listed');
            zwaziGroup.querySelector('[data-repository-author]').click();
            await waitFor(function() {
                return Array.from(document.querySelectorAll('.repository-author-group')).some(function(group) {
                    const author = group.querySelector('.repository-author-heading span:first-child');
                    return author && author.textContent === 'Zwazi' &&
                        !group.querySelector('.repository-author-maps').hidden;
                });
            }, 'The Zwazi author group did not expand');
            const repositoryRemix = document.querySelector('[data-repository-open="Zwazi/maps/Default-v1.aamap.xml"]');
            if(!repositoryRemix) throw new Error('Expected cross-user repository map was not listed');
            const otherButtonSaysRemix = repositoryRemix.textContent.trim() === 'Remix';
            const repositoryCount = document.querySelectorAll('[data-repository-open]').length;
            const repositoryLayoutFits = (function() {
                const dialogRect = document.querySelector('.repository-dialog').getBoundingClientRect();
                const listRect = document.getElementById('map-repository-list').getBoundingClientRect();
                return listRect.height > 100 && listRect.top >= dialogRect.top && listRect.bottom <= dialogRect.bottom;
            })();
            window.confirm = function() { return true; };
            repositoryRemix.click();
            try {
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    const repositoryStatus = document.getElementById('map-repository-status');
                    return (document.getElementById('map-repository-overlay').hidden &&
                        document.getElementById('map_name').value === 'Default_r' &&
                        toast && toast.textContent === 'Remixing Default-v1 by Zwazi as Default_r.') ||
                        (!repositoryStatus.hidden && repositoryStatus.classList.contains('error'));
                }, 'Cross-user repository map did not begin remixing', 30000);
            } catch(error) {
                const repositoryStatus = document.getElementById('map-repository-status');
                const toast = document.getElementById('vt-toast');
                throw new Error('Cross-user repository map did not begin remixing: ' + JSON.stringify({
                    overlayHidden: document.getElementById('map-repository-overlay').hidden,
                    buttonDisabled: repositoryRemix.disabled,
                    mapName: document.getElementById('map_name').value,
                    status: repositoryStatus.textContent,
                    statusClass: repositoryStatus.className,
                    toast: toast && toast.textContent,
                    errorDetail: repositoryStatus.dataset.errorDetail
                }));
            }
            const repositoryError = document.getElementById('map-repository-status');
            if(!repositoryError.hidden && repositoryError.classList.contains('error')) {
                throw new Error('Cross-user repository remix failed: ' + repositoryError.textContent +
                    ' (' + (repositoryError.dataset.errorDetail || 'no detail') + ')');
            }
            const remixXml = window.eventHandler_getExportMap().xml;
            const firstRemixName = document.getElementById('map_name').value;
            const firstRemixNameLocked = document.getElementById('map_name').readOnly;
            window.xml_appendRemixSource({
                map: firstRemixName,
                author: 'Browser Pilot',
                version: document.getElementById('map_version').value,
                path: 'Browser Pilot/maps/' + firstRemixName + '-' +
                    document.getElementById('map_version').value + '.aamap.xml'
            });
            window.vectron_syncLockedMetadata();
            const chainedRemixXml = window.eventHandler_getExportMap().xml;
            result.repository = {
                mapCount: repositoryCount,
                mineTabSelectedByDefault: mineTabSelectedByDefault,
                ownMapCount: ownMapCount,
                ownTabOnlyShowsCurrentUser: ownTabOnlyShowsCurrentUser,
                ownButtonSaysEdit: ownButtonSaysEdit,
                otherTabExcludesCurrentUser: !repositoryAuthors.includes('Browser Pilot'),
                otherAuthorsCollapsedByDefault: otherAuthorsCollapsedByDefault,
                otherButtonSaysRemix: otherButtonSaysRemix,
                panelLayoutFits: repositoryLayoutFits,
                hasZwazi: repositoryAuthors.includes('Zwazi'),
                hasAnimuson: repositoryAuthors.includes('Animuson'),
                loadedMap: firstRemixName,
                remixNameLocked: firstRemixNameLocked,
                chainedRemixName: document.getElementById('map_name').value,
                chainedRemixNameLocked: document.getElementById('map_name').readOnly,
                remixProvenance: remixXml.includes('Original map: "Default"') &&
                    remixXml.includes('Original author: "Zwazi"') &&
                    remixXml.includes('Source file: "Zwazi/maps/Default-v1.aamap.xml"') &&
                    remixXml.includes('Vectron remix provenance data:'),
                chainedRemixProvenance: chainedRemixXml.includes('Remix source 2: Map: "Default_r"') &&
                    chainedRemixXml.includes('Original author: "Zwazi"'),
                remixedMapHasAxes: remixXml.includes('<Axes number="'),
                authorStillLocked: document.getElementById('map_author').value === 'Browser Pilot' &&
                    document.getElementById('map_author').readOnly,
                categoryStillLocked: document.getElementById('map_category').value === 'maps' &&
                    document.getElementById('map_category').readOnly
            };

            if(testUpload) {
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent === 'Uploaded to Browser Pilot/maps/Default_r2-1.aamap.xml';
                }, 'Canonical chained remix was rejected by repository rules', 30000);
                result.remixUploadPath = 'Browser Pilot/maps/Default_r2-1.aamap.xml';
            }

            document.getElementById('map_settings').value += String.fromCharCode(10) + 'CYCLE_ACCEL 10';
            document.getElementById('map_settings').dispatchEvent(new Event('input', {bubbles: true}));
            result.created.draftSavedLocally = window.vectron_localDraftSaveNow();

            const [probeAppSdk, probeAuthSdk, probeStorageSdk] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js'),
                import('https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js')
            ]);
            const probeApp = probeAppSdk.getApp();
            const probeAuth = probeAuthSdk.getAuth(probeApp);
            const probeStorage = probeStorageSdk.getStorage(probeApp);
            const probeOwnerUid = probeAuth.currentUser.uid;

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
            let guestWriteCode = 'allowed';
            try {
                await probeStorageSdk.uploadString(
                    probeStorageSdk.ref(probeStorage, ${JSON.stringify(guestWriteProbePath)}),
                    '<Resource type="aamap" name="Guest Write Probe" version="1" author="Browser Pilot" category="maps"></Resource>',
                    'raw', {
                        contentType: 'application/xml; charset=UTF-8',
                        customMetadata: {
                            ownerUid: probeOwnerUid,
                            editorUid: probeOwnerUid,
                            editorRole: 'user',
                            author: 'Browser Pilot',
                            category: 'maps',
                            mapName: 'Guest Write Probe',
                            mapVersion: '1',
                            isRemix: 'false',
                            remixDepth: '0',
                            remixOriginalName: '',
                            archived: 'false',
                            operation: 'create',
                            editSourcePath: '',
                            editSourceName: '',
                            editSourceVersion: '',
                            editSourceCategory: '',
                            editSourceFileName: ''
                        }
                    }
                );
            } catch(error) {
                guestWriteCode = error && error.code || '';
            }
            result.signedOut.unauthenticatedWriteCode = guestWriteCode;

            document.getElementById('auth-login-tab').click();
            document.getElementById('auth-email').value = email;
            document.getElementById('auth-password').value = password;
            document.getElementById('auth-form').requestSubmit();
            await waitFor(function() {
                return !document.body.classList.contains('auth-locked') &&
                    document.getElementById('map_name').value === 'Default_r2';
            }, 'Sign in did not restore the local draft');
            result.loggedIn = {
                unlocked: !document.body.classList.contains('auth-locked'),
                gateHidden: document.getElementById('auth-gate').hidden,
                mapName: document.getElementById('map_name').value,
                mapNameLocked: document.getElementById('map_name').readOnly,
                versionLocked: document.getElementById('map_version').readOnly,
                remixProvenanceRestored: window.eventHandler_getExportMap().xml.includes('Original author: "Zwazi"')
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
        assert.deepStrictEqual(firstPass.guest, {
            unlocked: true,
            role: "Guest",
            author: "Guest",
            authorLocked: true,
            categoryLocked: true,
            versionLocked: true,
            uploadHidden: true,
            mineTabHidden: true,
            othersSelectedByDefault: true,
            authorsCollapsedByDefault: true,
            editButtons: 0,
            remixName: "Default_r",
            remixProvenance: true,
            draftSavedLocally: true,
            accountAction: "Sign in"
        });
        assert.deepStrictEqual(firstPass.created, {
            gateHidden: true,
            sessionVisible: true,
            displayName: "Browser Pilot",
            email: testEmail,
            role: "User",
            canvasStarted: true,
            author: "Browser Pilot",
            authorLocked: true,
            category: "maps",
            categoryLocked: true,
            version: "0.1",
            versionLocked: true,
            axesCheckboxGone: true,
            exportAlwaysHasAxes: true,
            typedDtd: "custom/browser-map.dtd",
            dtdOptionCount: 8,
            dtdKnownOptionSelected: true,
            dtdAllOptionsRemainVisible: true,
            draftSavedLocally: true,
            accountDockTopRight: true
        });
        if(testUploadEnabled) {
            assert.strictEqual(firstPass.uploadPath, uploadPath);
            assert.strictEqual(firstPass.remixUploadPath, remixUploadPath);
            assert.strictEqual(firstPass.duplicateUploadRejected, true);
            assert.deepStrictEqual(firstPass.edit, {
                name: "Browser Upload",
                nameLocked: true,
                version: "0.2",
                versionLocked: true,
                uploadLabel: "Submit edit",
                submittedPath: editedUploadPath,
                uploadLabelAfterSubmit: "Upload",
                archiveHiddenFromLiveMaps: true
            });
        }
        const {mapCount, ...repositoryState} = firstPass.repository;
        assert.ok(mapCount >= 275);
        assert.strictEqual(firstPass.repository.ownMapCount, testUploadEnabled ? 1 : 0);
        assert.deepStrictEqual(repositoryState, {
            mineTabSelectedByDefault: true,
            ownMapCount: testUploadEnabled ? 1 : 0,
            ownTabOnlyShowsCurrentUser: true,
            ownButtonSaysEdit: true,
            otherTabExcludesCurrentUser: true,
            otherAuthorsCollapsedByDefault: true,
            otherButtonSaysRemix: true,
            panelLayoutFits: true,
            hasZwazi: true,
            hasAnimuson: true,
            loadedMap: "Default_r",
            remixNameLocked: true,
            chainedRemixName: "Default_r2",
            chainedRemixNameLocked: true,
            remixProvenance: true,
            chainedRemixProvenance: true,
            remixedMapHasAxes: true,
            authorStillLocked: true,
            categoryStillLocked: true
        });
        assert.deepStrictEqual(firstPass.signedOut, {
            locked: true,
            editorInert: true,
            sessionsHidden: true,
            unauthenticatedWriteCode: "storage/unauthorized"
        });
        assert.deepStrictEqual(firstPass.loggedIn, {
            unlocked: true,
            gateHidden: true,
            mapName: "Default_r2",
            mapNameLocked: true,
            versionLocked: true,
            remixProvenanceRestored: true
        });

        if(testUploadEnabled) {
            const ruleEnforcement = await evaluateJson(context, `(async function() {
                const [appSdk, authSdk, storageSdk] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js'),
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js')
                ]);
                const app = appSdk.getApp();
                const activeAuth = authSdk.getAuth(app);
                const activeStorage = storageSdk.getStorage(app);
                const user = activeAuth.currentUser;
                if(!user) throw new Error('Rule check requires the active disposable account.');
                const existingRef = storageSdk.ref(activeStorage, ${JSON.stringify(editedUploadPath)});
                const existing = await storageSdk.getMetadata(existingRef);
                let duplicateCode = '';
                try {
                    await storageSdk.uploadString(existingRef,
                        '<Resource type="aamap" name="Browser Upload" version="0.2" author="Browser Pilot" category="maps"></Resource>',
                        'raw', {contentType: 'application/xml; charset=UTF-8', customMetadata: existing.customMetadata});
                } catch(error) {
                    duplicateCode = error && error.code || '';
                }
                let invalidRemixCode = '';
                try {
                    await storageSdk.uploadString(
                        storageSdk.ref(activeStorage, ${JSON.stringify(invalidRemixPath)}),
                        '<Resource type="aamap" name="Default_wrong" version="1" author="Browser Pilot" category="maps"></Resource>',
                        'raw', {
                            contentType: 'application/xml; charset=UTF-8',
                            customMetadata: {
                                ownerUid: user.uid,
                                editorUid: user.uid,
                                editorRole: 'user',
                                author: 'Browser Pilot',
                                category: 'maps',
                                mapName: 'Default_wrong',
                                mapVersion: '1',
                                isRemix: 'true',
                                remixDepth: '1',
                                remixOriginalName: 'Default',
                                archived: 'false',
                                operation: 'create',
                                editSourcePath: '',
                                editSourceName: '',
                                editSourceVersion: '',
                                editSourceCategory: '',
                                editSourceFileName: ''
                            }
                        }
                    );
                } catch(error) {
                    invalidRemixCode = error && error.code || '';
                }
                return JSON.stringify({duplicateCode, invalidRemixCode});
            })()`);
            assert.deepStrictEqual(ruleEnforcement, {
                duplicateCode: "storage/unauthorized",
                invalidRemixCode: "storage/unauthorized"
            });

            const uploadedXml = await readRepositoryMap(editedUploadPath);
            assert.match(uploadedXml, /<Resource[^>]*name="Browser Upload"/);
            assert.match(uploadedXml, /version="0\.2"/);
            assert.match(uploadedXml, /author="Browser Pilot"/);
            assert.match(uploadedXml, /category="maps"/);
            assert.match(uploadedXml, /<!DOCTYPE Resource SYSTEM "custom\/browser-map\.dtd">/);
            assert.match(uploadedXml, /<Axes number="8"\/>/);
            const archivedXml = await readRepositoryMap(archivedUploadPath);
            assert.match(archivedXml, /<Resource[^>]*name="Browser Upload"/);
            assert.match(archivedXml, /version="0\.1"/);
            const remixedXml = await readRepositoryMap(remixUploadPath);
            assert.match(remixedXml, /<Resource[^>]*name="Default_r2"/);
            assert.match(remixedXml, /Vectron remix provenance data:/);
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
                mapNameLocked: document.getElementById('map_name').readOnly,
                versionLocked: document.getElementById('map_version').readOnly,
                remixProvenanceRestored: window.eventHandler_getExportMap().xml.includes('Original author: "Zwazi"')
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
            mapName: "Default_r2",
            mapNameLocked: true,
            versionLocked: true,
            remixProvenanceRestored: true,
            lockedAfterLogout: true
        });

        if(await promoteTestAccountToAdmin()) {
            const adminPass = await evaluateJson(context, `(async function() {
                const email = ${JSON.stringify(testEmail)};
                const password = ${JSON.stringify(testPassword)};
                function waitFor(check, message, timeout) {
                    return new Promise(function(resolve, reject) {
                        const started = Date.now();
                        (function poll() {
                            let value = false;
                            try { value = check(); } catch(error) {}
                            if(value) return resolve(value);
                            if(Date.now() - started > (timeout || 30000)) return reject(new Error(message));
                            setTimeout(poll, 80);
                        })();
                    });
                }
                document.getElementById('auth-login-tab').click();
                document.getElementById('auth-email').value = email;
                document.getElementById('auth-password').value = password;
                document.getElementById('auth-form').requestSubmit();
                await waitFor(function() {
                    return !document.body.classList.contains('auth-locked') &&
                        document.querySelector('[data-auth-role]').textContent === 'Admin';
                }, 'Promoted account did not receive its Admin level');

                const [appSdk, authSdk, storageSdk] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js'),
                    import('https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js')
                ]);
                const app = appSdk.getApp();
                const activeAuth = authSdk.getAuth(app);
                const activeStorage = storageSdk.getStorage(app);
                const user = activeAuth.currentUser;
                const disposablePaths = [
                    ${JSON.stringify(adminSourcePath)},
                    ${JSON.stringify(adminEditedPath)},
                    ${JSON.stringify(adminArchivePath)},
                    ${JSON.stringify(adminRemixPath)}
                ];
                for(const path of disposablePaths) {
                    try { await storageSdk.deleteObject(storageSdk.ref(activeStorage, path)); }
                    catch(error) { if(!error || error.code !== 'storage/object-not-found') throw error; }
                }
                await storageSdk.uploadString(
                    storageSdk.ref(activeStorage, ${JSON.stringify(adminSourcePath)}),
                    '<Resource type="aamap" name="Admin Fix" version="0.1" author="Admin Target" category="maps"><Map version="2"><World><Field><Axes number="4"/></Field></World></Map></Resource>',
                    'raw', {
                        contentType: 'application/xml; charset=UTF-8',
                        customMetadata: {
                            ownerUid: '',
                            editorUid: user.uid,
                            editorRole: 'admin',
                            author: 'Admin Target',
                            category: 'maps',
                            mapName: 'Admin Fix',
                            mapVersion: '0.1',
                            isRemix: 'false',
                            remixDepth: '0',
                            remixOriginalName: '',
                            archived: 'false',
                            operation: 'create',
                            editSourcePath: '',
                            editSourceName: '',
                            editSourceVersion: '',
                            editSourceCategory: '',
                            editSourceFileName: ''
                        }
                    }
                );

                document.querySelector('[data-map-repository]').click();
                document.getElementById('map-repository-refresh').click();
                document.getElementById('map-repository-others-tab').click();
                await waitFor(function() {
                    return Array.from(document.querySelectorAll('[data-repository-author]')).some(function(button) {
                        return button.dataset.repositoryAuthor === 'Admin Target' && !button.disabled;
                    });
                }, 'Admin target map was not listed');
                const adminAuthorsCollapsedByDefault = Array.from(
                    document.querySelectorAll('.repository-author-group')
                ).every(function(group) {
                    return group.querySelector('[data-repository-author]').getAttribute('aria-expanded') === 'false' &&
                        group.querySelector('.repository-author-maps').hidden;
                });
                Array.from(document.querySelectorAll('[data-repository-author]'))
                    .find(function(button) { return button.dataset.repositoryAuthor === 'Admin Target'; })
                    .click();
                await waitFor(function() {
                    const button = document.querySelector(
                        '[data-repository-open=${JSON.stringify(adminSourcePath)}][data-repository-action="edit"]'
                    );
                    return button && !button.closest('.repository-author-maps').hidden;
                }, 'Admin target author did not expand');
                let editButton = document.querySelector(
                    '[data-repository-open=${JSON.stringify(adminSourcePath)}][data-repository-action="edit"]'
                );
                const remixButton = document.querySelector(
                    '[data-repository-open=${JSON.stringify(adminSourcePath)}][data-repository-action="remix"]'
                );
                const availableActions = [editButton.textContent.trim(), remixButton.textContent.trim()];
                window.confirm = function() { return true; };
                remixButton.click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return document.getElementById('map-repository-overlay').hidden &&
                        toast && toast.textContent ===
                            'Remixing Admin Fix-0.1 by Admin Target as Admin Fix_r.';
                }, "Admin could not choose Remix for another author's map");
                const remixing = {
                    author: document.getElementById('map_author').value,
                    authorLocked: document.getElementById('map_author').readOnly,
                    name: document.getElementById('map_name').value,
                    nameLocked: document.getElementById('map_name').readOnly,
                    version: document.getElementById('map_version').value,
                    uploadLabel: document.querySelector('[data-map-upload] span').textContent
                };
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent ===
                        'Uploaded to Browser Pilot/maps/Admin Fix_r-0.1.aamap.xml';
                }, 'Admin remix did not upload to the Admin author directory');

                document.querySelector('[data-map-repository]').click();
                document.getElementById('map-repository-others-tab').click();
                await waitFor(function() {
                    return Array.from(document.querySelectorAll('[data-repository-author]')).some(function(button) {
                        return button.dataset.repositoryAuthor === 'Admin Target' && !button.disabled &&
                            button.getAttribute('aria-expanded') === 'false';
                    });
                }, 'Admin target map was not available after remixing');
                Array.from(document.querySelectorAll('[data-repository-author]'))
                    .find(function(button) { return button.dataset.repositoryAuthor === 'Admin Target'; })
                    .click();
                await waitFor(function() {
                    const button = document.querySelector(
                        '[data-repository-open=${JSON.stringify(adminSourcePath)}][data-repository-action="edit"]'
                    );
                    return button && !button.closest('.repository-author-maps').hidden;
                }, 'Admin target author did not re-expand');
                editButton = document.querySelector(
                    '[data-repository-open=${JSON.stringify(adminSourcePath)}][data-repository-action="edit"]'
                );
                const buttonLabel = editButton.textContent.trim();
                editButton.click();
                try {
                    await waitFor(function() {
                        const toast = document.getElementById('vt-toast');
                        return document.getElementById('map-repository-overlay').hidden &&
                            toast && toast.textContent === 'Editing Admin Fix by Admin Target. Version bumped to 0.2.';
                    }, "Admin could not begin editing another author's map");
                } catch(error) {
                    const status = document.getElementById('map-repository-status');
                    throw new Error('Admin edit did not open: ' + JSON.stringify({
                        overlayHidden: document.getElementById('map-repository-overlay').hidden,
                        toast: document.getElementById('vt-toast').textContent,
                        status: status.textContent,
                        statusClass: status.className,
                        detail: status.dataset.errorDetail || '',
                        author: document.getElementById('map_author').value,
                        name: document.getElementById('map_name').value,
                        version: document.getElementById('map_version').value
                    }));
                }
                const editing = {
                    buttonLabel,
                    author: document.getElementById('map_author').value,
                    authorLocked: document.getElementById('map_author').readOnly,
                    name: document.getElementById('map_name').value,
                    nameLocked: document.getElementById('map_name').readOnly,
                    version: document.getElementById('map_version').value,
                    versionLocked: document.getElementById('map_version').readOnly,
                    uploadLabel: document.querySelector('[data-map-upload] span').textContent
                };
                document.getElementById('map_settings').value = 'CYCLE_SPEED 42';
                document.getElementById('map_settings').dispatchEvent(new Event('input', {bubbles: true}));
                document.querySelector('[data-map-upload]').click();
                await waitFor(function() {
                    const toast = document.getElementById('vt-toast');
                    return toast && toast.textContent ===
                        'Submitted Admin Target/maps/Admin Fix-0.2.aamap.xml; archived the previous version in Admin Target/maps/archive/Admin Fix-0.1.aamap.xml.';
                }, 'Admin edit did not archive and replace the target map');

                const liveMetadata = await storageSdk.getMetadata(
                    storageSdk.ref(activeStorage, ${JSON.stringify(adminEditedPath)})
                );
                const archiveMetadata = await storageSdk.getMetadata(
                    storageSdk.ref(activeStorage, ${JSON.stringify(adminArchivePath)})
                );
                const targetFolder = await storageSdk.listAll(storageSdk.ref(activeStorage, 'Admin Target/maps'));
                const sourceDeleted = !targetFolder.items.some(function(item) {
                    return item.fullPath === ${JSON.stringify(adminSourcePath)};
                });
                const result = {
                    role: document.querySelector('[data-auth-role]').textContent,
                    adminAuthorsCollapsedByDefault,
                    availableActions,
                    remixing,
                    editing,
                    sourceDeleted,
                    liveOwnerPreserved: liveMetadata.customMetadata.ownerUid === '',
                    liveEditorRecorded: liveMetadata.customMetadata.editorUid === user.uid &&
                        liveMetadata.customMetadata.editorRole === 'admin',
                    archiveOwnerPreserved: archiveMetadata.customMetadata.ownerUid === ''
                };
                document.querySelector('.auth-session-plan [data-auth-signout]').click();
                await waitFor(function() { return document.body.classList.contains('auth-locked'); },
                    'Admin sign out did not lock Vectron');
                return JSON.stringify(result);
            })()`);
            assert.deepStrictEqual(adminPass, {
                role: "Admin",
                adminAuthorsCollapsedByDefault: true,
                availableActions: ["Edit", "Remix"],
                remixing: {
                    author: "Browser Pilot",
                    authorLocked: true,
                    name: "Admin Fix_r",
                    nameLocked: true,
                    version: "0.1",
                    uploadLabel: "Upload"
                },
                editing: {
                    buttonLabel: "Edit",
                    author: "Admin Target",
                    authorLocked: true,
                    name: "Admin Fix",
                    nameLocked: true,
                    version: "0.2",
                    versionLocked: true,
                    uploadLabel: "Submit edit"
                },
                sourceDeleted: true,
                liveOwnerPreserved: true,
                liveEditorRecorded: true,
                archiveOwnerPreserved: true
            });
            const adminEditedXml = await readRepositoryMap(adminEditedPath);
            const adminArchivedXml = await readRepositoryMap(adminArchivePath);
            const adminRemixedXml = await readRepositoryMap(adminRemixPath);
            assert.match(adminEditedXml, /<Resource[^>]*name="Admin Fix"[^>]*version="0\.2"[^>]*author="Admin Target"/);
            assert.match(adminEditedXml, /<Setting name="CYCLE_SPEED" value="42"\s*\/>/);
            assert.match(adminArchivedXml, /<Resource[^>]*name="Admin Fix"[^>]*version="0\.1"[^>]*author="Admin Target"/);
            assert.match(adminRemixedXml, /<Resource[^>]*name="Admin Fix_r"[^>]*version="0\.1"[^>]*author="Browser Pilot"/);
            assert.match(adminRemixedXml, /Original author: "Admin Target"/);
            assert.match(adminRemixedXml, /Source file: "Admin Target\/maps\/Admin Fix-0\.1\.aamap\.xml"/);
            console.log("Vectron Admin cross-author edit browser smoke test passed.");
        }

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
