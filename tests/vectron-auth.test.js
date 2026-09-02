"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const firebase = JSON.parse(read("firebase.json"));
const firebaseRc = JSON.parse(read(".firebaserc"));
const storageRules = read("storage.rules");
const firestoreRules = read("firestore.rules");
const firestoreIndexes = JSON.parse(read("firestore.indexes.json"));
const databaseRules = JSON.parse(read("database.rules.json"));
const index = read("index.html");
const authSource = read("js/auth.js");
const authCss = read("css/auth.css");
const vectronCss = read("css/vectron.css");
const darkCss = read("css/vectron-dark.css");
const workspaceCss = read("css/workspace-theme.css");
const vectronSource = read("js/vectron.js");
const eventSource = read("js/eventHandler.js");
const aamapSource = read("js/aamap.js");
const selectSource = read("js/AamapTools/selectTool.js");
const editSelectedSource = read("js/AamapTools/editSelectedTool.js");
const zoneSource = read("js/AamapObjects/Zone.js");
const wallToolSource = read("js/AamapTools/wallTool.js");
const configSource = read("js/config.js");
const xmlSource = read("js/xml.js");
const localDraftSource = read("js/localDraft.js");
const functionsSource = read("functions/index.js");
const revocationSource = read("functions/submission-revocation.js");

assert.deepStrictEqual(firebase.auth.providers, {emailPassword: true});
assert.deepStrictEqual(firebase.storage, {rules: "storage.rules"});
assert.deepStrictEqual(firebase.firestore, {
    rules: "firestore.rules",
    indexes: "firestore.indexes.json"
});
assert.deepStrictEqual(firebase.functions, {source: "functions", codebase: "default"});
assert.deepStrictEqual(firestoreIndexes.fieldOverrides, []);
assert.strictEqual(firestoreIndexes.indexes.length, 10);
assert.deepStrictEqual(
    new Set(firestoreIndexes.indexes.slice(0, 8).map(indexDefinition =>
        `${indexDefinition.fields[2].fieldPath}:${indexDefinition.fields[2].order}`
    )),
    new Set([
        "authorName:ASCENDING", "authorName:DESCENDING",
        "mapName:ASCENDING", "mapName:DESCENDING",
        "createdAt:ASCENDING", "createdAt:DESCENDING",
        "reviewedAt:ASCENDING", "reviewedAt:DESCENDING"
    ])
);
firestoreIndexes.indexes.slice(0, 8).forEach(indexDefinition => {
    assert.strictEqual(indexDefinition.collectionGroup, "mapSubmissions");
    assert.strictEqual(indexDefinition.queryScope, "COLLECTION");
    assert.deepStrictEqual(indexDefinition.fields.slice(0, 2), [
        {fieldPath:"historyVisible", order:"ASCENDING"},
        {fieldPath:"status", order:"ASCENDING"}
    ]);
});
assert.deepStrictEqual(firestoreIndexes.indexes.slice(8).map(item => item.fields), [
    [
        {fieldPath:"submittedBy", order:"ASCENDING"},
        {fieldPath:"status", order:"ASCENDING"}
    ],
    [
        {fieldPath:"submittedBy", order:"ASCENDING"},
        {fieldPath:"resubmissionOf", order:"ASCENDING"}
    ]
]);
assert.strictEqual(firebaseRc.projects.default, "tronnerrepository");

assert.match(index, /<body class="noscroll auth-locked">/);
assert.match(index, /id="auth-gate"[^>]*aria-modal="true"/);
assert.match(index, /id="auth-login-tab"/);
assert.match(index, /id="auth-signup-tab"/);
assert.match(index, /id="auth-guest"[^>]*auth-guest-button/);
assert.match(index, /Continue as guest/);
assert.match(index, /data-auth-signout/);
assert.match(index, /data-map-upload/);
assert.match(index, /id="review-admin-window"/);
assert.match(index, /data-map-review-deny[^>]*[\s\S]*?<span>Deny<\/span>/);
assert.match(index, /data-map-review-publish[^>]*[\s\S]*?<span>Approve<\/span>/);
assert.match(index, /id="review-admin-save"[\s\S]*?<span>Save<\/span><\/button>/);
assert.match(index, /data-map-repository/);
assert.match(index, /data-notifications/);
assert.match(index, /data-admin-review/);
assert.match(index, /id="notification-overlay"/);
assert.match(index, /id="admin-overlay"/);
assert.match(index, /id="map-file-command-overlay"/);
assert.match(index, /id="map-file-command-value"[^>]*readonly/);
assert.match(index, /id="map-file-command-copy"/);
assert.match(index, /id="auth-confirm-popover"[^>]*role="dialog"/);
assert.match(index, /id="duplicate-map-overlay"[^>]*repository-overlay/);
assert.match(index, /id="duplicate-map-list"[^>]*duplicate-map-list/);
assert.match(index, /id="duplicate-map-approve"[^>]*>Approve anyway<\/button>/);
assert.match(index, /id="show-axis-alignment-guides"/);
assert.match(index, /id="triangle-grid-popover"[^>]*role="dialog"/);
assert.match(index, /id="triangle-grid-switch"[^>]*>Switch to triangle<\/button>/);
assert.match(index, /id="auth-confirm-reason"[^>]*type="text"[^>]*maxlength="1000"/);
assert.doesNotMatch(index, /<textarea id="auth-confirm-reason"/);
assert.match(index, /id="auth-confirm-reason-error"[^>]*role="alert"/);
assert.match(index, /id="auth-confirm-quick-reasons"[^>]*role="group"[^>]*aria-label="Quick denial reasons"/);
assert.match(index, /data-admin-tab="accounts"/);
assert.match(index, /data-admin-tab="submissions"/);
assert.match(index, /data-admin-tab="history"/);
assert.match(index, /data-admin-tab="maps"/);
assert.match(index, /id="map-repository-overlay"[^>]*repository-overlay/);
assert.match(index, /id="map-repository-search"/);
assert.match(index, /id="map-repository-search-submit"[^>]*aria-label="Search repository maps"[^>]*title="Search"/);
assert.match(index, /id="map-repository-gallery"[^>]*class="repository-icon-button active"[^>]*aria-pressed="true"/);
assert.match(index, /id="map-repository-preview-list"[^>]*aria-label="List with map previews"/);
assert.match(index, /id="map-repository-list-layout"[^>]*aria-label="List without map previews"/);
assert.match(index, /id="map-repository-group-authors"[^>]*aria-pressed="true"[^>]*aria-label="Ungroup maps"/);
assert.match(index, /id="map-repository-refresh"[^>]*aria-label="Refresh repository maps"[^>]*title="Refresh"/);
assert.doesNotMatch(index, /id="map-repository-(?:search-submit|refresh)"[^>]*>\s*<i[^>]*><\/i>\s*<span>/);
assert.match(index, /id="map-repository-sort"/);
assert.match(index, /id="map-repository-sort-order"/);
assert.match(index, /id="map-repository-list"/);
assert.strictEqual((index.match(/data-repository-resize=/g) || []).length, 8);
assert.match(index, /css\/auth\.css\?v=20260902-axis-review-1/);
assert.match(index, /css\/workspace-theme\.css\?v=20260902-axis-review-1/);
assert.match(index, /js\/auth\.js\?v=20260902-axis-review-1/);
assert.match(authSource, /\.\/catalog\.js\?v=20260831-map-ratings-1/);
assert.match(index, /id="map-repository-mine-tab"[^>]*aria-selected="false"/);
assert.match(index, /id="map-repository-review-tab"[^>]*aria-disabled="true"[^>]*disabled[^>]*>Under Review /);
assert.match(index, /id="map-repository-others-tab"[^>]*aria-selected="true"/);
assert.match(index, /id="map-repository-others-tab"[^>]*>All maps /);
assert.doesNotMatch(index, />Other maps /);
assert.match(index, /id="feature-suggestion-toggle"/);
assert.match(index, /id="feature-suggestion-popover"[^>]*hidden/);
assert.match(index, /id="admin-search-submit"/);
assert.match(index, /id="admin-author-filter"/);
assert.match(index, /id="admin-decision-filter"/);
assert.match(index, /id="admin-reason-filter"/);
assert.match(index, /id="admin-sort"/);
assert.match(index, /id="admin-sort-order"/);
assert.match(index, /id="admin-page-size"[\s\S]*?<option value="10" selected>[\s\S]*?<option value="25">[\s\S]*?<option value="50">[\s\S]*?<option value="100">/);
assert.match(index, /id="admin-page-first"/);
assert.match(index, /id="admin-page-number"[^>]*type="number"/);
assert.match(index, /id="admin-page-last"/);
assert.strictEqual((index.match(/data-admin-resize=/g) || []).length, 8);
assert.match(index, /id="map-metadata-form"/);
assert.match(index, /id="auth-account-controls"[^>]*auth-account-controls/);
assert.match(index, /id="auth-account-controls"[\s\S]*data-map-upload[\s\S]*data-auth-signout/);
assert.match(index, /class="auth-role-badge" data-auth-role>User<\/span>/);
assert.match(index, /id="top-settings-bar"[\s\S]*id="auth-account-controls"/);
assert.doesNotMatch(index, /class="toolbar-upload"/);
assert.match(index, /id="map_author"[^>]*readonly/);
assert.match(index, /id="map_category"[^>]*value="maps"[^>]*readonly/);
assert.match(index, /id="map_version"[^>]*value="1"[^>]*readonly/);
assert.doesNotMatch(index, /id="map_axes_forced"/);
assert.match(index, /id="map_dtd"[^>]*role="combobox"[^>]*aria-controls="map-dtd-options"/);
assert.match(index, /id="map_dtd"[^>]*rel="tooltip"[^>]*Unlock from the settings menu/);
assert.match(index, /id="show-tooltips"/);
assert.match(index, /id="unlock-advanced-map-options"/);
assert.match(index, /id="tooltip-welcome-popover"[^>]*role="dialog"/);
assert.match(index, /<strong id="tooltip-welcome-title">Welcome!<\/strong>/);
assert.match(index, /Thanks for using Vectron\./);
assert.match(index, /id="tooltip-welcome-disable"[^>]*>Show only on hover<\/button>/);
assert.match(index, /id="symmetry-menu-toggle"[^>]*rel="tooltip"/);
assert.match(index, /class="info-anchor-values"[^>]*rel="tooltip"/);
assert.match(index, /id="map_name"[^>]*rel="tooltip"/);
assert.match(index, /id="map_axes"[^>]*rel="tooltip"/);
assert.doesNotMatch(index, /class="compact-sort-control"/);
assert.match(index, /id="admin-author-filter-wrap" class="admin-filter-control"/);
assert.match(index, /id="admin-sort-wrap" class="admin-filter-control"/);
assert.match(index, /href="\.\/css\/workspace-theme\.css\?v=[^"]+"/);
assert.strictEqual((index.match(/data-dtd-value=/g) || []).length, 8);
assert.match(index, /id="map-dtd-options"[^>]*role="listbox"/);
assert.match(index, /src="\.\/js\/localDraft\.js\?v=[^"]+"/);
assert.match(index, /src="\.\/js\/AamapTools\/editSelectedTool\.js"/);
assert.match(index, /id="edit-selected-window"/);
assert.match(index, /id="contextMenu-edit-selected"/);
assert.match(index, /<script type="module" src="\.\/js\/auth\.js\?v=[^"]+"><\/script>/);

assert.match(authSource, /projectId:\s*"tronnerrepository"/);
assert.match(authSource, /submitFeatureSuggestion/);
assert.match(authSource, /setRepositoryTab\("others"\)/);
assert.match(authSource, /onAuthStateChanged\(identityAuth/);
assert.match(authSource, /createUserWithEmailAndPassword\(identityAuth/);
assert.match(authSource, /signInWithEmailAndPassword\(identityAuth/);
assert.match(authSource, /sendPasswordResetEmail\(identityAuth/);
assert.match(authSource, /signOut\(identityAuth\)/);
assert.match(authSource, /browserLocalPersistence/);
assert.match(authSource, /browserSessionPersistence/);
assert.match(authSource, /authSdk\.getIdTokenResult\(user, true\)/);
assert.match(authSource, /token\.claims && token\.claims\.admin === true/);
assert.match(authSource, /currentUserRole === "admin"/);
assert.match(authSource, /window\.vectron_syncAdvancedOptionLocks/);
assert.match(authSource, /repositoryMapIsMine\(map\) \|\| currentUserIsAdmin\(\)/);
assert.match(authSource, /firebase-storage\.js/);
assert.match(authSource, /firebase-firestore\.js/);
assert.match(authSource, /uploadString\(mapRef, map\.xml/);
assert.match(authSource, /collection\(firestore, "mapSubmissions"\)/);
assert.match(authSource, /status: "pending"/);
assert.match(authSource, /revisionStoragePath\(\s*user\.uid, submissionRef\.id,/);
assert.match(authSource, /const category = MAP_CATEGORY;/);
assert.match(authSource, /const finalCategory = target\.category;/);
assert.match(authSource, /category\.value = MAP_CATEGORY;[\s\S]*category\.readOnly = true;/);
assert.match(authSource, /function showMapFileCommand\(/);
assert.match(authSource, /mapFileCommand\([\s\S]*REPOSITORY_FIREBASE_CONFIG\.storageBucket/);
assert.match(authSource, /firebaseStorageMediaUrl\([\s\S]*REPOSITORY_FIREBASE_CONFIG\.storageBucket/);
assert.doesNotMatch(authSource, /\bFIREBASE_CONFIG\b/);
assert.match(authSource, /async function firebaseStorageRequestHeaders\(\)/);
assert.match(authSource, /headers\["X-Firebase-AppCheck"\] = appCheckToken/);
assert.match(authSource, /firebaseStorageMediaUrl\(state\.publicManifestPath\), \{[\s\S]*headers:await firebaseStorageRequestHeaders\(\)/);
assert.match(authSource, /async function downloadRepositoryMap\([\s\S]*const headers = await firebaseStorageRequestHeaders\(\)/);
assert.match(authSource, /showMapFileCommand\(mapName, mapVersion, objectPath\)/);
assert.doesNotMatch(authSource, /storageSdk\.listAll/);
assert.doesNotMatch(authSource, /archiveEditedSource/);
assert.doesNotMatch(authSource, /deleteObject\(storageSdk\.ref\(storage, editState\.sourcePath\)\)/);
assert.match(authSource, /if\(auth && auth\.currentUser\)[\s\S]*authSdk\.getIdToken\(auth\.currentUser\)/);
assert.match(authSource, /headers\.Authorization = `Firebase \$\{idToken\}`/);
assert.doesNotMatch(authSource, /getDownloadURL/);
assert.match(eventSource, /function eventHandler_setTooltipsEnabled\(/);
assert.match(eventSource, /delay:\s*\{\s*show:\s*220,\s*hide:\s*80/);
assert.match(eventSource, /function eventHandler_showTooltipWelcomeIfNeeded\(/);
assert.match(eventSource, /function eventHandler_syncAdvancedOptionLocks\(/);
assert.match(eventSource, /window\.vectron_userRole === "admin"/);
assert.match(eventSource, /\["zone-private-per-player", "zone-selected-private", "edit-selected-zone-private"\]/);
assert.match(eventSource, /dtdInput\.readOnly = !unlocked/);
assert.match(eventSource, /dtdToggle\.disabled = !unlocked/);
assert.match(eventSource, /eventHandler_setTooltipsEnabled\(!eventHandler_tooltipsEnabled, true\)/);
assert.doesNotMatch(eventSource, /descTimer = setTimeout/);
assert.match(workspaceCss, /--workspace-cyan:\s*#ef4444/);
assert.match(workspaceCss, /\.tooltip-inner\s*\{[\s\S]*linear-gradient/);
assert.match(workspaceCss, /\.repository-toolbar-select,[\s\S]*\.admin-filter-control select/);
assert.match(storageRules, /request\.resource\.metadata\.category == 'maps'/);
assert.match(authSource, /MAP_SUBMISSION_URL = .*createMapSubmission/);
assert.match(authSource, /function nextAvailableSubmissionVersion\(/);
assert.match(authSource, /"pendingResourcePaths", resourceId/);
assert.match(authSource, /legacyPending/);
assert.match(authSource, /version = bumpMapVersion\(version\)/);
assert.match(authSource, /async function createMapSubmission\(/);
assert.match(authSource, /await createMapSubmission\(user,/);
assert.doesNotMatch(authSource, /await firestoreSdk\.setDoc\(submissionRef,/);
assert.match(authSource, /pendingResourceSnapshot\.data\(\)\.submissionId === submissionId/);
assert.match(authSource, /transaction\.delete\(pendingResourceRef\)/);
assert.match(authSource, /pendingResourceId: publish \? "" : finalPendingResourceId/);
assert.match(authSource, /transaction\.set\(finalPendingRef,/);
assert.match(authSource, /let repositorySubmissions = \[\]/);
assert.match(authSource, /where\("submittedBy", "==", auth\.currentUser\.uid\)/);
assert.match(authSource, /item\.data\(\)\.status === "denied"/);
assert.match(authSource, /"edit-denied"/);
assert.match(authSource, /deniedSubmissionId: map\.denied \? map\.submissionId : ""/);
assert.match(authSource, /resubmissionOf,/);
assert.match(authSource, /Edited and resubmitted after a denied review/);
assert.match(authSource, /dataset\.repositoryOpen = map\.fullPath/);
assert.match(authSource, /dataset\.repositoryAction = action/);
assert.match(authSource, /addAction\(map\.denied \? "edit-denied" : "edit"\)/);
assert.match(authSource, /if\(!map\.denied && \(!repositoryMapIsMine\(map\) \|\| currentUserIsAdmin\(\)\)\) addAction\("remix"\)/);
assert.match(authSource, /\["edit", "edit-denied"\]\.includes\(requestedAction\)/);
assert.match(authSource, /repositoryExpandedAuthors = new Set\(\)/);
assert.match(authSource, /heading\.dataset\.repositoryAuthor = author/);
assert.match(authSource, /mapList\.hidden = !expanded/);
assert.match(authSource, /repositoryExpandedAuthors\.clear\(\)/);
assert.match(authSource, /repositoryTab = "others"/);
assert.match(authSource, /window\.xml_appendRemixSource/);
assert.match(authSource, /depth === 1 \? "_r" : `_r\$\{depth\}`/);
assert.match(authSource, /nameInput\.readOnly = true/);
assert.match(authSource, /function nextAvailableMapVersion\(/);
assert.match(authSource, /reviewing \? "Save"/);
assert.match(authSource, /window\.vectron_getRepositoryEditState/);
assert.match(authSource, /targetAuthor: map\.author/);
assert.match(authSource, /targetAuthorId: map\.authorId/);
assert.match(authSource, /sourceOwnerUid/);
assert.match(authSource, /window\.xml_author = author/);
assert.match(authSource, /window\.xml_category = category/);
assert.match(authSource, /authorInput\.readOnly = !admin/);
assert.match(authSource, /versionInput\.readOnly = !admin/);
assert.match(authSource, /if\(lockedName && !admin\)/);
assert.match(authSource, /function uploadAuthorIdentity\(/);
assert.match(authSource, /vectron_localDraftSetUser\(draftOwner\)/);
assert.match(authSource, /unlockWorkspace\("guest"\)/);
assert.match(authSource, /function enterGuestMode\(\)/);
assert.match(authSource, /if\(guestMode\)[\s\S]*Sign in or create an account to upload maps/);
assert.match(authSource, /nextTab === "review" && reviewCount \? "review"/);
assert.match(authSource, /function syncRepositoryReviewTab\(/);
assert.match(authSource, /repositoryReviewTab\.disabled = count === 0/);
assert.match(authSource, /function repositoryReviewStatus\(/);
assert.match(authSource, /function loadRepositoryRatings\(/);
assert.match(authSource, /doc\(firestore, "racingCatalog", "current"\)/);
assert.match(authSource, /function repositoryRatingElement\(/);
assert.match(authSource, /copy\.append\(name, detail, repositoryRatingElement\(submission\)\)/);
assert.match(authSource, /copy\.append\(name, path, repositoryRatingElement\(map\)\)/);
assert.match(authCss, /\.repository-map-rating\s*\{/);
assert.match(authSource, /label:"Processing"/);
assert.match(authSource, /label:"Read"/);
assert.match(authSource, /label:"Unread"/);
assert.match(authSource, /function revokeRepositorySubmission\(/);
assert.match(authSource, /expectedStoragePath:submission\.storagePath/);
assert.match(authSource, /revokedSubmissionId:revoked\.submissionId/);
assert.match(authSource, /window\.vectron_localDraftClearCurrent\(\)/);
assert.match(authSource, /if\(repositoryMineTab\) repositoryMineTab\.hidden = true/);
assert.match(authSource, /vectron_localDraftSaveNow/);
assert.match(authSource, /setEditorInert\(true\)/);
assert.doesNotMatch(authSource, /[?&](?:skip|bypass|noauth)=/i);
assert.match(authSource, /function ensureAccountRecord\(/);
assert.match(authSource, /function startAccountListener\(/);
assert.match(authSource, /status: "approved"/);
assert.match(authSource, /status: approved \? "approved" : "denied"/);
assert.match(authSource, /function startAdminListeners\(/);
assert.match(authSource, /function startAdminQueueListeners\(/);
assert.match(authSource, /function loadPublicCatalog\(/);
assert.match(authSource, /collection\(firestore, "catalogState"|doc\(firestore, "catalogState", "current"\)/);
assert.match(authSource, /where\("submittedBy", "==", user\.uid\)[\s\S]*firestoreSdk\.limit\(100\)/);
assert.match(authSource, /firestoreSdk\.getCountFromServer/);
assert.match(authSource, /firestoreSdk\.startAfter/);
assert.match(authSource, /where\("historyVisible", "==", true\)/);
assert.match(authSource, /cacheKey = "all-visible-history"/);
assert.doesNotMatch(authSource, /cacheKey = JSON\.stringify\(\{[\s\S]*decision:adminFilterState\.history\.decision,[\s\S]*field:sort\.field/);
assert.match(authSource, /function reviewAccount\(/);
assert.match(authSource, /function denyRegistration\(/);
assert.match(authSource, /Deny and delete user/);
assert.match(authSource, /REGISTRATION_DENIAL_URL/);
assert.match(authSource, /function reviewSubmission\(/);
assert.match(authSource, /const reusablePublishedPath = serverOrigin[\s\S]*submission\.sourceResourcePath/);
assert.match(authSource, /function denyCurrentReview\(/);
assert.match(authSource, /reasonRequired:true/);
assert.match(authSource, /DEFAULT_QUICK_DENY_REASONS = Object\.freeze\(\[[\s\S]*"Tunnel Trouble"[\s\S]*"Too Easy"[\s\S]*"Too Long"[\s\S]*"Not a Race Map"[\s\S]*"duplicate"/);
assert.match(authSource, /function populateQuickDenyReasons\(/);
assert.match(authSource, /CUSTOM_QUICK_DENY_REASONS_KEY = "vectron\.quickDenyReasons\.v1"/);
assert.match(authSource, /window\.localStorage\.getItem\(CUSTOM_QUICK_DENY_REASONS_KEY\)/);
assert.match(authSource, /function addQuickDecisionReason\(/);
assert.match(authSource, /function removeQuickDecisionReason\(/);
assert.match(authSource, /catalogSettings", "reviewReasons"/);
assert.match(authSource, /input\.setAttribute\("list", list\.id\)/);
assert.match(authSource, /reason\.type = "text"/);
assert.match(authSource, /submitAdminSubmissionDenial\(submission\.id, reason\)/);
assert.match(authSource, /function submitAdminSubmissionDenial\([\s\S]*skipConfirmation:true/);
assert.match(authSource, /confirmReasonInput\.addEventListener\("keydown"[\s\S]*event\.key !== "Enter"[\s\S]*settleConfirmation\(true\)/);
assert.match(authSource, /reviewSubmission\(editState\.reviewSubmissionId, false, \{[\s\S]*skipConfirmation:true/);
assert.match(authSource, /reviewDenyButton\.addEventListener\("click"/);
assert.match(authSource, /function adminMapIdentity\(/);
assert.match(authSource, /data-admin-map-author/);
assert.match(authSource, /data-admin-map-name/);
assert.match(authSource, /data-admin-map-version/);
assert.match(authSource, /function nextAvailableAdminVersion\(/);
assert.match(authSource, /target\.mapName !== submission\.mapName/);
assert.match(authSource, /name: target\.mapName/);
assert.match(authSource, /version: target\.mapVersion/);
assert.match(authSource, /A pending create may have[\s\S]*become an edit/);
assert.match(authSource, /function deleteReviewedMap\(/);
assert.match(authSource, /Deny and delete map/);
assert.match(authSource, /submission\.submissionReason/);
assert.match(authSource, /function buildAdminMapPreview\(/);
assert.match(authSource, /map-preview-checkpoint-label/);
assert.match(authSource, /map-preview-teleport-link/);
assert.match(authSource, /IntersectionObserver/);
assert.match(authSource, /function editPendingSubmission\(/);
assert.match(authSource, /function pendingSubmissionIdentity[\s\S]*nextAvailableAdminVersion\(/);
assert.match(authSource, /function loadPendingSubmissionIntoEditor\(/);
assert.match(authSource, /function nextPendingSubmissionAfter\(/);
assert.match(authSource, /nextPendingSubmissionAfter\(editState\.reviewSubmissionId\)/);
assert.match(authSource, /const nextSubmission = nextPendingSubmissionAfter\(editState\.reviewSubmissionId\)/);
assert.match(authSource, /Now editing [\s\S]*the next map in the review queue/);
assert.match(authSource, /The map review queue is clear/);
assert.match(authSource, /if\(publish\)[\s\S]*nextPendingSubmissionAfter[\s\S]*} else \{[\s\S]*showMapFileCommand\(mapName, mapVersion, objectPath\)/);
assert.match(authSource, /confirmMapApproval\([\s\S]*"Approve"/);
assert.match(authSource, /function nextAvailableReviewVersion[\s\S]*let version = normalizeMapVersion\(startingVersion\)/);
assert.match(authSource, /function savePendingReviewDraft\(/);
assert.match(authSource, /publish \? "map\.review\.edit-approve" : "map\.review\.edit"/);
assert.match(authSource, /uploadCurrentMap\(\{publishReview: true\}\)/);
assert.match(authSource, /function renderAdminHistory\(/);
assert.match(authSource, /function renderAdminMap\([\s\S]*map-review-published-card/);
assert.match(authSource, /dataset\.adminPreviewId = `published:\$\{map\.id\}`/);
assert.match(authSource, /queueAdminSubmissionPreview\(preview, map\)/);
assert.match(authSource, /function reopenReviewHistory\(/);
assert.match(authSource, /action: "map\.review\.reopen"/);
assert.match(authSource, /historySourceSubmissionId: history\.id/);
assert.match(authSource, /actionButton\("Edit map in Vectron", "edit-submission"/);
assert.match(authSource, /operation: "review-edit"/);
assert.match(authSource, /status: publish \? "approved" : "review-draft"/);
assert.match(authSource, /reviewRevisionId: revisionRef\.id/);
assert.match(authSource, /Map approved, published, and returned to server rotation/);
assert.match(authSource, /function editPublishedMapMetadata\(/);
assert.match(authSource, /function holdPublishedMap\(/);
assert.match(authSource, /function deletePublishedMap\(/);
assert.match(authSource, /function saveReviewText\(/);
assert.match(authSource, /function submitAdminSearch\(/);
assert.match(authSource, /function submitRepositorySearch\(/);
assert.match(authSource, /adminPagination = \{[\s\S]*pageSize:10/);
assert.match(authSource, /adminReasonCategory\(item\.reviewReason\)/);
assert.match(authSource, /function repositoryMapIsMine\(map\)[\s\S]*currentAccount\.authorId[\s\S]*map\.authorId === currentAccount\.authorId/);
assert.match(authSource, /!map\.authorId && map\.ownerUid === auth\.currentUser\.uid/);
assert.doesNotMatch(authSource, /map\.ownerUid === auth\.currentUser\.uid \|\|/);
assert.doesNotMatch(authSource, /repositorySearchInput\.addEventListener\("input", renderRepositoryMaps\)/);
assert.doesNotMatch(authSource, /adminSearchInput\.addEventListener\("input", renderAdminList\)/);
assert.match(authSource, /adminPageFirst\.addEventListener\("click"/);
assert.match(authSource, /adminPageLast\.addEventListener\("click"/);
assert.match(authSource, /adminPageNumber\.addEventListener\("keydown"/);
assert.match(authSource, /repositoryLayout = readRepositoryLayout\(\)/);
assert.match(authSource, /vectron\.repositoryLayout\.v3/);
assert.match(authSource, /\["gallery", "preview-list", "list"\]\.includes/);
assert.match(authSource, /vectron\.repositoryLayout\.v2[\s\S]*\? "list" : "gallery"/);
assert.match(authSource, /repositoryGroupedByAuthor = readRepositoryGrouping\(\)/);
assert.match(authSource, /vectron\.repositoryGroupedByAuthor\.v1/);
assert.match(authSource, /if\(!repositoryGroupedByAuthor\)[\s\S]*createMapList\(visibleMaps\)/);
assert.match(authCss, /\.repository-browser-dialog\s*\{[\s\S]*width: min\(620px, 100%\);[\s\S]*height: calc\(100vh - 48px\);/);
assert.match(authCss, /\.repository-author-maps\.gallery\s*\{[\s\S]*display: grid[\s\S]*repeat\(auto-fill, minmax\(250px, 1fr\)\)/);
assert.match(authCss, /\.repository-map-row\.gallery\s*\{[\s\S]*flex-direction: column/);
assert.match(authCss, /\.repository-map-row\.preview-list\s*\{[\s\S]*grid-template-columns: minmax\(180px, 0\.9fr\) minmax\(0, 1\.1fr\)/);
assert.match(authSource, /recipientUid:/);
assert.match(authSource, /collection\(firestore, "auditEvents"\)/);
assert.match(authSource, /Your registration is awaiting admin approval/);
assert.match(authSource, /you cannot submit yet/);
assert.match(authSource, /function confirmAction\(/);
assert.match(authSource, /function duplicatePublishedMaps\(/);
assert.match(authSource, /function promptDuplicateMapApproval\(/);
assert.match(authSource, /loadAdminSubmissionPreview\(preview, map\)/);
assert.match(authSource, /confirmMapApproval\([\s\S]*finalIdentity\.mapName/);
assert.match(authSource, /confirmMapApproval\([\s\S]*editState\.mapId/);
assert.match(authCss, /\.duplicate-map-list\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(260px, 1fr\)\)/);
assert.match(wallToolSource, /function wallTool_axisGuideSegments\(/);
assert.match(wallToolSource, /stroke: "#22c55e"/);
assert.match(configSource, /case "showAxisAlignmentGuides": return "true"/);
assert.match(authSource, /function anchorAdminDialog\(/);
assert.match(authSource, /adminDialog\.classList\.add\("positioned"\)/);
assert.match(authSource, /function anchorRepositoryDialog\(/);
assert.match(authSource, /repositoryDialog\.classList\.add\("positioned"\)/);
assert.match(authSource, /function setAdminTab[\s\S]*adminList\.scrollTop = 0;[\s\S]*renderAdminList\(\)/);
assert.match(authSource, /function refreshAdminQueues[\s\S]*adminList\.scrollTop = 0;[\s\S]*startAdminListeners\(\)/);
assert.match(authSource, /function setRepositoryTab[\s\S]*repositoryList\.scrollTop = 0;[\s\S]*renderRepositoryMaps\(\)/);
assert.match(authSource, /function refreshRepositoryMaps[\s\S]*repositoryList\.scrollTop = 0;/);
assert.match(authSource, /adminRefreshButton\.addEventListener\("click", refreshAdminQueues\)/);
assert.doesNotMatch(authSource, /window\.(?:confirm|alert)\s*\(/);

const duplicateFunctionSource = [
    authSource.match(/function normalizedDuplicateMapName\(value\) \{[\s\S]*?\n\}/)[0],
    authSource.match(/function duplicatePublishedMaps\(mapName, currentMapId, maps = adminData\.maps\) \{[\s\S]*?\n\}/)[0]
].join("\n");
const duplicateContext = {result:null};
vm.runInNewContext(`${duplicateFunctionSource}\nresult = duplicatePublishedMaps("  Same   Map ", "keep", [
    {id:"first", mapName:"same map", authorName:"One", mapVersion:"1"},
    {id:"second", mapName:"Same Map", authorName:"Two", mapVersion:"9"},
    {id:"keep", mapName:"SAME MAP", authorName:"Three", mapVersion:"4"},
    {id:"other", mapName:"Different", authorName:"One", mapVersion:"1"}
]);`, duplicateContext);
assert.deepStrictEqual(Array.from(duplicateContext.result, item => item.id), ["first", "second"],
    "Duplicate review ignores author and version while excluding the map being updated");

const repositoryPreferenceSource = [
    authSource.match(/function readRepositoryLayout\(\) \{[\s\S]*?\n\}/)[0],
    authSource.match(/function readRepositoryGrouping\(\) \{[\s\S]*?\n\}/)[0]
].join("\n");
const repositoryPreferenceContext = {
    window:{localStorage:{
        values:new Map(),
        getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    }},
    result:null
};
vm.runInNewContext(
    `${repositoryPreferenceSource}\nresult = [readRepositoryLayout(), readRepositoryGrouping()];`,
    repositoryPreferenceContext
);
assert.deepStrictEqual(Array.from(repositoryPreferenceContext.result), ["gallery", true],
    "The repository defaults to a grouped gallery");
repositoryPreferenceContext.window.localStorage.values.set("vectron.repositoryLayout.v3", "preview-list");
repositoryPreferenceContext.window.localStorage.values.set("vectron.repositoryGroupedByAuthor.v1", "false");
vm.runInNewContext(
    `${repositoryPreferenceSource}\nresult = [readRepositoryLayout(), readRepositoryGrouping()];`,
    repositoryPreferenceContext
);
assert.deepStrictEqual(Array.from(repositoryPreferenceContext.result), ["preview-list", false],
    "The preview-list and ungrouped choices persist");
repositoryPreferenceContext.window.localStorage.values.delete("vectron.repositoryLayout.v3");
repositoryPreferenceContext.window.localStorage.values.set("vectron.repositoryLayout.v2", "list");
vm.runInNewContext(
    `${repositoryPreferenceSource}\nresult = readRepositoryLayout();`,
    repositoryPreferenceContext
);
assert.strictEqual(repositoryPreferenceContext.result, "list",
    "The existing compact-list preference migrates without previews");

const nextSubmissionSource = authSource.match(
    /function nextPendingSubmissionAfter\(submissionId\) \{[\s\S]*?\n\}/
);
assert.ok(nextSubmissionSource, "The next-review selector must remain independently testable");
const nextSubmissionContext = {
    adminData: {submissions: [{id:"first"}, {id:"second"}, {id:"third"}]},
    selected: null
};
vm.runInNewContext(
    `${nextSubmissionSource[0]}\nselected = nextPendingSubmissionAfter("second");`,
    nextSubmissionContext
);
assert.strictEqual(nextSubmissionContext.selected.id, "third",
    "Approval advances to the following queued map");
vm.runInNewContext(
    `${nextSubmissionSource[0]}\nselected = nextPendingSubmissionAfter("third");`,
    nextSubmissionContext
);
assert.strictEqual(nextSubmissionContext.selected.id, "first",
    "Approval wraps to the first remaining queued map");
nextSubmissionContext.adminData.submissions = [{id:"only"}];
vm.runInNewContext(
    `${nextSubmissionSource[0]}\nselected = nextPendingSubmissionAfter("only");`,
    nextSubmissionContext
);
assert.strictEqual(nextSubmissionContext.selected, null,
    "Approval leaves the editor idle when the review queue is clear");

assert.match(vectronSource, /function vectron_start\(\)/);
assert.match(vectronSource, /if\(vectron_started\) return;/);
assert.match(vectronSource, /vectron_localDraftRestore\(\)/);
assert.doesNotMatch(vectronSource, /window\.onload\s*=\s*function\s*\(\)\s*\{\s*vectron_init/);

assert.doesNotMatch(aamapSource + eventSource + xmlSource, /map_axes_forced/);
assert.match(aamapSource, /xml \+= '        <Axes number="'\+axes\+'"\/>'/);
assert.match(eventSource, /mapSettingsCustomCfg\.push\("ARENA_AXES " \+ mapAxes\)/);
assert.match(eventSource, /eventHandler_initDtdCombobox/);
assert.match(xmlSource, /Vectron remix provenance \(oldest source first\)/);
assert.match(xmlSource, /Original map:/);
assert.match(xmlSource, /xml_appendRemixSource/);
assert.match(xmlSource, /Vectron version notes data:/);
assert.match(authSource, /reviewAdminVersionNotes/);
assert.match(index, /id="review-admin-version-notes"/);

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
assert.match(authCss, /--auth-cyan:\s*#ef4444/);
assert.match(authCss, /--auth-violet:\s*#dc2626/);
assert.match(authCss, /\.auth-role-badge\[data-role="admin"\]/);
assert.match(authCss, /\.auth-role-badge\[data-role="guest"\]/);
assert.match(authCss, /\.auth-role-badge\[data-role="pending"\]/);
assert.match(authCss, /\.account-card/);
assert.match(authCss, /\.map-review-card\s*\{[^}]*grid-template-columns:/s);
assert.match(authCss, /\.map-review-actions\s*\{[^}]*flex-direction:\s*column/s);
assert.match(authCss, /\.map-review-preview/);
assert.match(authCss, /\.admin-dialog\s*\{[^}]*resize:\s*none/s);
assert.match(authCss, /\.repository-browser-dialog\s*\{[^}]*resize:\s*none/s);
assert.match(authCss, /\.admin-resize-n\s*\{[^}]*top:\s*-5px/s);
assert.match(authCss, /\.admin-resize-e\s*\{[^}]*right:\s*-5px/s);
assert.match(authCss, /\.admin-resize-s\s*\{[^}]*bottom:\s*-5px/s);
assert.match(authCss, /\.admin-resize-w\s*\{[^}]*left:\s*-5px/s);
assert.match(authCss, /\.admin-dialog\s*\{[^}]*width:\s*min\(620px, 100%\)/s);
assert.match(authCss, /\.admin-dialog\s*\{[^}]*height:\s*calc\(100vh - 48px\)/s);
assert.match(authCss, /\.map-file-command-dialog\s*\{/);
assert.match(authCss, /\.admin-dialog\.positioned,[\s\S]*\.repository-browser-dialog\.positioned\s*\{[^}]*position:\s*fixed/s);
assert.match(authCss, /\.admin-dialog \.repository-header,[\s\S]*\.repository-browser-dialog \.repository-header\s*\{[^}]*cursor:\s*move/s);
assert.match(authCss, /\.auth-confirm-popover/);
assert.match(authCss, /\.auth-review-deny-button/);
assert.match(authCss, /\.auth-confirm-reason-field input/);
assert.match(authCss, /\.auth-deny-quick-reasons/);
assert.match(authCss, /\.account-card-button\.auth-deny-quick-reason/);
assert.match(authCss, /\.auth-deny-quick-custom/);
assert.match(authCss, /\.auth-deny-quick-remove/);
assert.match(authCss, /\.account-card-button\.auth-deny-quick-add/);
assert.match(authCss, /\.map-preview-checkpoint-label/);
assert.match(authCss, /\.map-preview-teleport-link/);
assert.match(authCss, /\.auth-guest-button/);
assert.doesNotMatch(authCss, /#(?:3b94de|1c70bb|68d6e8|398dcc|1c5f96)/i);
assert.doesNotMatch(index, /auth-backdrop|auth-orbit|auth-horizon/);
assert.match(authCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(authCss, /@media \(max-width: 720px\)/);
assert.match(authCss, /\.repository-tabs/);
assert.match(authCss, /button\.repository-author-heading/);
assert.match(authCss, /\.repository-author-heading\[aria-expanded="true"\]/);
assert.match(vectronCss, /\.tsb-combobox-menu/);
assert.match(vectronCss, /#wall-tool-window\s*\{[^}]*height:\s*fit-content/s);
assert.match(vectronCss, /#zone-tool-window\s*\{[^}]*height:\s*fit-content/s);
assert.match(vectronCss, /#edit-selected-window\s*\{[^}]*height:\s*fit-content/s);
assert.match(read("js/gui.js"), /defaultHeight:\s*"auto"/);
assert.match(darkCss, /\.tsb-combobox-menu/);
assert.match(darkCss, /#edit-selected-window/);
assert.match(editSelectedSource, /function editSelected_applyWalls\(/);
assert.match(editSelectedSource, /function editSelected_applyZones\(/);
assert.match(editSelectedSource, /function editSelected_applySpawns\(/);
assert.match(selectSource, /function selectTool_findTeleportDestinationAt\(/);
assert.match(selectSource, /label:"Move teleport destination"/);
assert.match(zoneSource, /function\(x, y\)[\s\S]*this\.setTeleportDestination/);
assert.match(eventSource, /if\(e\.which === 3 \|\| e\.button === 2\) return;/);

assert.match(storageRules, /match \/_revisions\/\{ownerUid\}\/\{submissionId\}/);
assert.match(storageRules, /match \/_revisions\/\{ownerUid\}\/\{submissionId\}\/\{fileName\}/);
assert.match(storageRules, /canReadRevision\(ownerUid, submissionId, expectedPath\)/);
assert.match(storageRules, /submission\(submissionId\)\.data\.storagePath == expectedPath/);
assert.match(storageRules, /request\.auth\.uid == ownerUid/);
assert.match(storageRules, /account\(request\.auth\.uid\)\.data\.status == 'approved'/);
assert.match(storageRules, /request\.resource\.metadata\.submissionId == submissionId/);
assert.doesNotMatch(storageRules, /metadata\.mapVersion\.matches/);
assert.match(storageRules, /request\.resource\.metadata\.mapVersion\.size\(\) > 0/);
assert.match(storageRules, /author != '_revisions'/);
assert.match(storageRules, /fileName\.matches\('\.\*\\\\\.aamap\\\\\.xml'\)/);
assert.match(storageRules, /request\.auth\.token\.admin == true/);
assert.match(authSource, /editorUid: user\.uid/);
assert.match(authSource, /editorRole: currentUserRole/);
assert.match(storageRules, /allow update: if false/);
assert.doesNotMatch(storageRules, /allow (?:read|write): if true/);
assert.doesNotMatch(storageRules, /allow (?:create|delete|write): if true/);

assert.match(firestoreRules, /match \/accounts\/\{uid\}/);
assert.match(firestoreRules, /request\.resource\.data\.status == 'pending'/);
assert.match(firestoreRules, /match \/maps\/\{mapId\}/);
assert.match(firestoreRules, /resource\.data\.status == 'active' \|\| isAdmin\(\)/);
assert.match(firestoreRules, /match \/resourcePaths\/\{resourceId\}/);
assert.match(firestoreRules, /match \/pendingResourcePaths\/\{resourceId\}/);
assert.match(firestoreRules, /match \/pendingResourcePaths\/\{resourceId\}[\s\S]*allow read: if signedIn\(\)/);
assert.match(firestoreRules, /match \/mapSubmissions\/\{submissionId\}/);
assert.match(firestoreRules, /match \/mapSubmissions\/\{submissionId\}[\s\S]*allow create: if isAdmin\(\)/);
assert.match(firestoreRules, /match \/notifications\/\{uid\}\/items\/\{notificationId\}/);
assert.match(firestoreRules, /affectedKeys\(\)\.hasOnly\(\['readAt'\]\)/);
assert.match(firestoreRules, /match \/auditEvents\/\{eventId\}/);
assert.doesNotMatch(firestoreRules, /allow write: if true/);

assert.match(databaseRules.rules.racing.chat[".read"], /auth\.token\.admin == true/);
assert.match(databaseRules.rules.racing.chat[".read"], /auth\.token\.neotron == true/);
assert.strictEqual(databaseRules.rules.racing.activity[".read"], true);
assert.deepStrictEqual(databaseRules.rules.racing.activity[".indexOn"], ["finishedAt"]);

const commandRules = databaseRules.rules.racing.admin.commands.$serverId.$commandId;
const commandFields = [
    "schemaVersion", "type", "state", "requestedAt", "expiresAt", "requestedBy",
    "requestedName", "target", "message", "mapKey", "reason", "option", "value",
    "durationMinutes", "scope", "clientVersion"
];
assert.match(commandRules[".write"], /auth\.token\.admin == true/);
assert.match(commandRules[".write"], /auth\.token\.neotron == true/);
assert.match(commandRules[".write"], /\$serverId == 'nyc1'/);
assert.match(commandRules[".validate"], /newData\.hasChildren/);
assert.match(commandRules[".validate"], /start_console_stream/);
assert.match(commandRules[".validate"], /restart_server/);
assert.match(commandRules[".validate"], /console_command/);
assert.match(commandRules[".validate"], /scope'\)\.val\(\) == 'local'/);
for(const field of commandFields) {
    assert.deepStrictEqual(commandRules[field], {".validate": true},
        `Realtime Database commands must explicitly allow ${field} before the unknown-field catch-all`);
}
assert.strictEqual(commandRules.$other[".validate"], false,
    "Realtime Database commands must reject undeclared fields");
assert.deepStrictEqual(
    databaseRules.rules.racing.admin.console.$serverId[".indexOn"],
    ["publishedAt"]
);

assert.match(functionsSource, /exports\.denyRegistration = onRequest/);
assert.match(functionsSource, /exports\.createMapSubmission = onRequest/);
assert.match(functionsSource, /exports\.revokeMapSubmission = onRequest/);
assert.match(functionsSource, /function mapFileName\(/);
assert.match(functionsSource, /const admin = user\.admin === true/);
assert.match(functionsSource, /if\(!admin && \(payload\.authorId !== account\.authorId/);
assert.match(functionsSource, /if\(stage === "reserve"\)/);
assert.match(functionsSource, /collection\("submissionUploadGrants"\)/);
assert.match(functionsSource, /payloadDigest/);
assert.match(functionsSource, /transaction\.get\(resourceRef\)/);
assert.match(functionsSource, /transaction\.get\(pendingRef\)/);
assert.match(functionsSource, /transaction\.create\(submissionRef/);
assert.match(functionsSource, /transaction\.set\(pendingRef/);
assert.match(functionsSource, /reviewState: "unread"/);
assert.match(functionsSource, /validateSubmissionRevocation\(/);
assert.match(revocationSource, /submission\.submittedBy !== userUid/);
assert.match(revocationSource, /submission\.storagePath !== expectedStoragePath/);
assert.match(functionsSource, /status: "revoked"/);
assert.match(functionsSource, /action: "map\.review\.revoke"/);
assert.match(functionsSource, /denied\.status !== "denied"/);
assert.match(functionsSource, /custom\.sha256 !== payload\.sha256/);
assert.match(functionsSource, /verifyIdToken\(match\[1\], true\)/);
assert.match(functionsSource, /token\.admin !== true/);
assert.match(functionsSource, /adminAuth\.deleteUser\(accountId\)/);
assert.match(functionsSource, /action: "account\.deny-delete"/);

console.log("Vectron authentication configuration tests passed.");
