import {
    MAP_CATEGORY,
    MAX_MAP_BYTES,
    activeResourcePath,
    authorKey,
    authorNameError,
    bumpMapVersion,
    formatTimestamp,
    mapFileCommand,
    normalizeAuthorName,
    normalizeMapVersion,
    resourceIdentityFromXml,
    resourceKey,
    revisionStoragePath,
    rewriteResourceIdentity,
    safeMapName
} from "./catalog.js";

const FIREBASE_CONFIG = Object.freeze({
    apiKey: "AIzaSyCglVAiB3494_GQf2ESrE9y_2YWELpIfBg",
    authDomain: "tronnerrepository.firebaseapp.com",
    projectId: "tronnerrepository",
    storageBucket: "tronnerrepository.firebasestorage.app",
    messagingSenderId: "551644623151",
    appId: "1:551644623151:web:1ce98799ba393c491271da"
});

const FIREBASE_SDK_VERSION = "12.17.0";
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;
const FIREBASE_STORAGE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-storage.js`;
const FIREBASE_FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`;
const REGISTRATION_DENIAL_URL = "https://us-central1-tronnerrepository.cloudfunctions.net/denyRegistration";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const gate = document.getElementById("auth-gate");
const loading = document.getElementById("auth-loading");
const panel = document.getElementById("auth-panel");
const fatalPanel = document.getElementById("auth-fatal");
const fatalMessage = document.getElementById("auth-fatal-message");
const form = document.getElementById("auth-form");
const loginTab = document.getElementById("auth-login-tab");
const signupTab = document.getElementById("auth-signup-tab");
const title = document.getElementById("auth-title");
const subtitle = document.getElementById("auth-subtitle");
const nameField = document.getElementById("auth-name-field");
const nameInput = document.getElementById("auth-name");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const confirmField = document.getElementById("auth-confirm-field");
const confirmInput = document.getElementById("auth-confirm-password");
const status = document.getElementById("auth-status");
const submitButton = document.getElementById("auth-submit");
const submitLabel = submitButton.querySelector(".auth-submit-label");
const forgotButton = document.getElementById("auth-forgot-password");
const guestButton = document.getElementById("auth-guest");
const retryButton = document.getElementById("auth-retry");
const profilePanel = document.getElementById("auth-profile");
const profileForm = document.getElementById("auth-profile-form");
const profileNameInput = document.getElementById("auth-profile-name");
const profileStatus = document.getElementById("auth-profile-status");
const profileSubmit = document.getElementById("auth-profile-submit");
const profileSignout = document.getElementById("auth-profile-signout");
const uploadButton = document.querySelector("[data-map-upload]");
const reviewPublishButton = document.querySelector("[data-map-review-publish]");
const repositoryButton = document.querySelector("[data-map-repository]");
const repositoryOverlay = document.getElementById("map-repository-overlay");
const repositoryCloseButton = document.getElementById("map-repository-close");
const repositoryRefreshButton = document.getElementById("map-repository-refresh");
const repositorySearchInput = document.getElementById("map-repository-search");
const repositorySummary = document.getElementById("map-repository-summary");
const repositoryStatus = document.getElementById("map-repository-status");
const repositoryList = document.getElementById("map-repository-list");
const repositoryTabs = Array.from(document.querySelectorAll("[data-repository-tab]"));
const repositoryMineTab = document.getElementById("map-repository-mine-tab");
const repositoryMineCount = document.getElementById("map-repository-mine-count");
const repositoryOthersCount = document.getElementById("map-repository-others-count");
const notificationButton = document.querySelector("[data-notifications]");
const notificationCount = document.querySelector("[data-notification-count]");
const notificationOverlay = document.getElementById("notification-overlay");
const notificationCloseButton = document.getElementById("notification-close");
const notificationMarkReadButton = document.getElementById("notification-mark-read");
const notificationSummary = document.getElementById("notification-summary");
const notificationStatus = document.getElementById("notification-status");
const notificationList = document.getElementById("notification-list");
const adminButton = document.querySelector("[data-admin-review]");
const adminCount = document.querySelector("[data-admin-count]");
const adminOverlay = document.getElementById("admin-overlay");
const adminCloseButton = document.getElementById("admin-close");
const adminRefreshButton = document.getElementById("admin-refresh");
const adminSearchInput = document.getElementById("admin-search");
const adminSummary = document.getElementById("admin-summary");
const adminStatus = document.getElementById("admin-status");
const adminList = document.getElementById("admin-list");
const adminTabs = Array.from(document.querySelectorAll("[data-admin-tab]"));
const adminAccountCount = document.querySelector("[data-admin-account-count]");
const adminSubmissionCount = document.querySelector("[data-admin-submission-count]");
const adminMapCount = document.querySelector("[data-admin-map-count]");
const adminHistoryCount = document.querySelector("[data-admin-history-count]");
const adminDialog = adminOverlay && adminOverlay.querySelector(".admin-dialog");
const confirmPopover = document.getElementById("auth-confirm-popover");
const confirmMessage = document.getElementById("auth-confirm-message");
const confirmCancelButton = document.getElementById("auth-confirm-cancel");
const confirmAcceptButton = document.getElementById("auth-confirm-accept");
const mapFileCommandOverlay = document.getElementById("map-file-command-overlay");
const mapFileCommandValue = document.getElementById("map-file-command-value");
const mapFileCommandCopy = document.getElementById("map-file-command-copy");
const mapFileCommandClose = document.getElementById("map-file-command-close");

let auth = null;
let authSdk = null;
let storage = null;
let storageSdk = null;
let firestore = null;
let firestoreSdk = null;
let mode = "login";
let busy = false;
let editorStartQueued = false;
let profileBusy = false;
let profileUser = null;
let uploadBusy = false;
let repositoryBusy = false;
let repositoryMaps = [];
let repositoryTab = "mine";
let repositoryPreviousFocus = null;
let repositoryEditState = null;
let currentUserRole = "user";
let repositoryExpandedAuthors = new Set();
let guestMode = false;
let currentAccount = null;
let currentUserAdminClaim = false;
let accountUnsubscribe = null;
let notifications = [];
let notificationUnsubscribe = null;
let adminUnsubscribes = [];
let adminData = {accounts: [], submissions: [], maps: [], authors: [], history: []};
let adminTab = "accounts";
let adminBusy = false;
let overlayPreviousFocus = null;
let adminPreviewObserver = null;
const adminPreviewCache = new Map();
const adminPreviewTargets = new WeakMap();
let confirmResolver = null;
let confirmAnchor = null;
let adminDragging = null;

function positionConfirmationPopover() {
    if(!confirmPopover || confirmPopover.hidden) return;
    const margin = 12;
    const anchor = confirmAnchor && confirmAnchor.getBoundingClientRect ? confirmAnchor : null;
    const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
    const popoverRect = confirmPopover.getBoundingClientRect();
    let left = anchorRect ? anchorRect.right - popoverRect.width :
        (window.innerWidth - popoverRect.width) / 2;
    let top = anchorRect ? anchorRect.bottom + 8 :
        (window.innerHeight - popoverRect.height) / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));
    if(top + popoverRect.height > window.innerHeight - margin && anchorRect) {
        top = anchorRect.top - popoverRect.height - 8;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - popoverRect.height - margin));
    confirmPopover.style.left = `${Math.round(left)}px`;
    confirmPopover.style.top = `${Math.round(top)}px`;
}

function settleConfirmation(result) {
    if(!confirmPopover || confirmPopover.hidden) return;
    const resolver = confirmResolver;
    const anchor = confirmAnchor;
    confirmResolver = null;
    confirmAnchor = null;
    confirmPopover.hidden = true;
    confirmPopover.classList.remove("danger");
    confirmAcceptButton.classList.remove("danger");
    if(anchor && typeof anchor.focus === "function") anchor.focus();
    if(resolver) resolver(Boolean(result));
}

function confirmAction(message, options = {}) {
    if(!confirmPopover) return Promise.resolve(false);
    if(confirmResolver) settleConfirmation(false);
    confirmMessage.textContent = String(message || "Continue?");
    confirmAcceptButton.textContent = options.confirmLabel || "Confirm";
    confirmAcceptButton.classList.toggle("danger", options.danger === true);
    confirmAnchor = options.anchor || (
        document.activeElement && document.activeElement !== document.body ?
            document.activeElement : null
    );
    confirmPopover.hidden = false;
    positionConfirmationPopover();
    window.requestAnimationFrame(positionConfirmationPopover);
    window.setTimeout(() => confirmAcceptButton.focus(), 0);
    return new Promise(resolve => { confirmResolver = resolve; });
}

function clampAdminDialog() {
    if(!adminDialog || !adminDialog.classList.contains("positioned")) return;
    const margin = 12;
    const rect = adminDialog.getBoundingClientRect();
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 120) - margin));
    const top = Math.max(margin, Math.min(rect.top, window.innerHeight - Math.min(rect.height, 80) - margin));
    adminDialog.style.left = `${Math.round(left)}px`;
    adminDialog.style.top = `${Math.round(top)}px`;
}

function anchorAdminDialog() {
    if(!adminDialog || adminOverlay.hidden) return;
    if(!adminDialog.classList.contains("positioned")) {
        const rect = adminDialog.getBoundingClientRect();
        adminDialog.style.left = `${Math.round(rect.left)}px`;
        adminDialog.style.top = `${Math.round(rect.top)}px`;
        adminDialog.style.width = `${Math.round(rect.width)}px`;
        adminDialog.style.height = `${Math.round(rect.height)}px`;
        adminDialog.classList.add("positioned");
    }
    clampAdminDialog();
}

function setEditorInert(locked) {
    Array.from(document.body.children).forEach(element => {
        if(element === gate || element.tagName === "SCRIPT") return;
        element.inert = locked;
    });
}

function setStatus(message, type = "error") {
    status.textContent = message || "";
    status.classList.toggle("success", type === "success");
    status.hidden = !message;
}

function setProfileStatus(message) {
    profileStatus.textContent = message || "";
    profileStatus.hidden = !message;
}

function setBusy(nextBusy) {
    busy = nextBusy;
    submitButton.disabled = nextBusy;
    submitButton.classList.toggle("busy", nextBusy);
    forgotButton.disabled = nextBusy;
    guestButton.disabled = nextBusy;
    loginTab.disabled = nextBusy;
    signupTab.disabled = nextBusy;
    form.setAttribute("aria-busy", String(nextBusy));
}

function setProfileBusy(nextBusy) {
    profileBusy = nextBusy;
    profileNameInput.disabled = nextBusy;
    profileSubmit.disabled = nextBusy;
    profileSubmit.classList.toggle("busy", nextBusy);
    profileSignout.disabled = nextBusy;
    profileForm.setAttribute("aria-busy", String(nextBusy));
}

function setMode(nextMode) {
    if(busy) return;
    mode = nextMode === "signup" ? "signup" : "login";
    const signingUp = mode === "signup";

    loginTab.classList.toggle("active", !signingUp);
    loginTab.setAttribute("aria-selected", String(!signingUp));
    signupTab.classList.toggle("active", signingUp);
    signupTab.setAttribute("aria-selected", String(signingUp));
    nameField.hidden = !signingUp;
    nameInput.required = signingUp;
    confirmField.hidden = !signingUp;
    confirmInput.required = signingUp;
    passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
    title.textContent = signingUp ? "Build something new" : "Welcome back";
    subtitle.textContent = signingUp
        ? "Create an account to open your Vectron workspace."
        : "Sign in to open the Vectron editor.";
    submitLabel.textContent = signingUp ? "Create account" : "Open Vectron";
    forgotButton.hidden = signingUp;
    setStatus("");
}

function friendlyAuthError(error) {
    const code = error && error.code ? error.code : "";
    const messages = {
        "auth/email-already-in-use": "An account already uses that email. Try signing in instead.",
        "auth/invalid-credential": "That email or password doesn’t match an account.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/missing-email": "Enter your email address.",
        "auth/missing-password": "Enter your password.",
        "auth/user-disabled": "This account has been disabled.",
        "auth/weak-password": "Choose a password with at least 6 characters.",
        "auth/too-many-requests": "Too many attempts. Wait a moment, then try again.",
        "auth/network-request-failed": "The account service couldn’t be reached. Check your connection and retry.",
        "auth/operation-not-allowed": "Email and password sign-in is not available right now.",
        "auth/invalid-api-key": "Vectron’s account configuration is invalid."
    };
    return messages[code] || "Something went wrong. Please try again.";
}

function displayNameForUser(user) {
    if(user.displayName && user.displayName.trim()) return user.displayName.trim();
    if(user.email) return user.email.split("@")[0];
    return "Vectron user";
}

function initialsForName(name) {
    const words = String(name || "V").trim().split(/\s+/).filter(Boolean);
    if(words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return (words[0] || "V").slice(0, 2).toUpperCase();
}

function normalizeUserRole(value) {
    const role = String(value || "").toLocaleLowerCase();
    if(["admin", "guest", "pending", "denied"].includes(role)) return role;
    return "user";
}

function currentUserIsAdmin() {
    return currentUserRole === "admin";
}

function accountCanSubmit() {
    return currentUserIsAdmin() || Boolean(currentAccount && currentAccount.status === "approved" &&
        currentAccount.authorId && currentAccount.authorName);
}

function sessionAuthorName(user = auth && auth.currentUser) {
    if(currentAccount && currentAccount.authorName) return currentAccount.authorName;
    if(currentAccount && currentAccount.requestedAuthorName) return currentAccount.requestedAuthorName;
    return user ? displayNameForUser(user) : "";
}

function accountRole() {
    if(currentUserAdminClaim) return "admin";
    if(currentAccount && ["pending", "deleting"].includes(currentAccount.status)) return "pending";
    if(currentAccount && currentAccount.status === "denied") return "denied";
    return "user";
}

function setCurrentUserRole(value) {
    currentUserRole = normalizeUserRole(value);
    window.vectron_userRole = currentUserRole;
    document.documentElement.dataset.userRole = currentUserRole;
    document.querySelectorAll("[data-auth-role]").forEach(element => {
        element.textContent = currentUserRole === "admin"
            ? "Admin"
            : currentUserRole === "guest" ? "Guest"
            : currentUserRole === "pending" ? "Pending"
            : currentUserRole === "denied" ? "Denied"
            : "User";
        element.dataset.role = currentUserRole;
    });
    return currentUserRole;
}

async function refreshCurrentUserRole(user) {
    const token = await authSdk.getIdTokenResult(user, true);
    const claims = token.claims || {};
    return setCurrentUserRole(claims.admin === true ? "admin" : accountRole() || claims.role);
}

function syncSessionControls(user) {
    const displayName = sessionAuthorName(user);
    document.querySelectorAll("[data-auth-name]").forEach(element => {
        element.textContent = displayName;
    });
    document.querySelectorAll("[data-auth-email]").forEach(element => {
        element.textContent = user.email || "Signed in";
    });
    document.querySelectorAll("[data-auth-avatar]").forEach(element => {
        element.textContent = initialsForName(displayName);
    });
    if(uploadButton) {
        uploadButton.hidden = false;
        uploadButton.disabled = !accountCanSubmit();
        uploadButton.title = accountCanSubmit()
            ? (repositoryEditState ? "Submit edited map for review" : "Submit map for review")
            : "An admin must approve and link your account before you can submit maps";
    }
    updateUploadButtonLabel();
    if(repositoryMineTab) repositoryMineTab.hidden = false;
    document.querySelectorAll("[data-auth-signout]").forEach(button => {
        const label = button.querySelector("span");
        const icon = button.querySelector("i");
        if(label) label.textContent = "Sign out";
        if(icon) icon.className = "fa-solid fa-arrow-right-from-bracket";
        button.title = "Sign out";
        button.setAttribute("aria-label", "Sign out");
    });
    setCurrentUserRole(accountRole());
    if(adminButton) adminButton.hidden = !currentUserIsAdmin();
    if(notificationButton) notificationButton.hidden = false;
    document.querySelectorAll(".auth-session, .auth-session-separator").forEach(element => {
        element.hidden = false;
    });
}

function syncGuestSessionControls() {
    document.querySelectorAll("[data-auth-name]").forEach(element => {
        element.textContent = "Guest";
    });
    document.querySelectorAll("[data-auth-email]").forEach(element => {
        element.textContent = "Local editing";
    });
    document.querySelectorAll("[data-auth-avatar]").forEach(element => {
        element.textContent = "G";
    });
    if(uploadButton) {
        uploadButton.hidden = true;
        uploadButton.disabled = true;
    }
    if(reviewPublishButton) {
        reviewPublishButton.hidden = true;
        reviewPublishButton.disabled = true;
    }
    if(repositoryMineTab) repositoryMineTab.hidden = true;
    if(notificationButton) notificationButton.hidden = true;
    if(adminButton) adminButton.hidden = true;
    document.querySelectorAll("[data-auth-signout]").forEach(button => {
        const label = button.querySelector("span");
        const icon = button.querySelector("i");
        if(label) label.textContent = "Sign in";
        if(icon) icon.className = "fa-solid fa-arrow-right-to-bracket";
        button.title = "Sign in or create an account";
        button.setAttribute("aria-label", "Sign in or create an account");
    });
    setCurrentUserRole("guest");
    document.querySelectorAll(".auth-session, .auth-session-separator").forEach(element => {
        element.hidden = false;
    });
}

function currentRemixIdentity() {
    const history = Array.isArray(window.xml_remixHistory) ? window.xml_remixHistory : [];
    if(!history.length) return null;
    const depth = history.length;
    const suffix = depth === 1 ? "_r" : `_r${depth}`;
    const originalName = safeMapName(history[0].map, Math.max(1, 100 - suffix.length));
    return {
        depth,
        originalName,
        mapName: `${originalName}${suffix}`
    };
}

function updateUploadButtonLabel() {
    const reviewing = Boolean(repositoryEditState && repositoryEditState.reviewSubmissionId);
    if(uploadButton) {
        const label = uploadButton.querySelector("span");
        if(label) label.textContent = reviewing ? "Save review changes" :
            repositoryEditState ? "Submit edit" : "Upload";
        uploadButton.title = reviewing ? "Save changes to this pending review" :
            repositoryEditState ? "Submit edited map" : "Upload map";
        uploadButton.setAttribute("aria-label", uploadButton.title);
    }
    if(reviewPublishButton) {
        reviewPublishButton.hidden = !(reviewing && currentUserIsAdmin());
        reviewPublishButton.disabled = uploadBusy || !(reviewing && currentUserIsAdmin());
    }
}

function normalizeRepositoryEditState(value) {
    if(!value || typeof value !== "object") return null;
    const sourcePath = String(value.sourcePath || "");
    const rawSourceName = String(value.sourceName || "").trim();
    const sourceName = safeMapName(rawSourceName);
    const sourceVersion = normalizeMapVersion(value.sourceVersion);
    const sourceCategory = String(value.sourceCategory || MAP_CATEGORY);
    const targetAuthor = normalizeAuthorName(value.targetAuthor || "");
    const targetAuthorId = String(value.targetAuthorId || "");
    const sourceOwnerUid = String(value.sourceOwnerUid || "");
    const mapId = String(value.mapId || "");
    const sourceRevisionId = String(value.sourceRevisionId || "");
    const reviewSubmissionId = String(value.reviewSubmissionId || "");
    const reviewSourceOperation = String(value.reviewSourceOperation || "");
    const reviewDecisionReason = String(value.reviewDecisionReason || "").trim().slice(0, 1000);
    const signedInAuthor = sessionAuthorName();
    if(!sourcePath || !rawSourceName || !sourceCategory || sourceCategory.includes("/") ||
       !targetAuthor || targetAuthor.includes("/") || !targetAuthorId || !mapId) return null;
    if(signedInAuthor && targetAuthor !== signedInAuthor && !currentUserIsAdmin()) return null;
    return {
        sourcePath, sourceName, sourceVersion, sourceCategory, targetAuthor,
        targetAuthorId, sourceOwnerUid, mapId, sourceRevisionId,
        reviewSubmissionId, reviewSourceOperation, reviewDecisionReason
    };
}

function setRepositoryEditState(value) {
    repositoryEditState = normalizeRepositoryEditState(value);
    updateUploadButtonLabel();
    if(auth && auth.currentUser) syncMapMetadata(auth.currentUser);
    return repositoryEditState ? {...repositoryEditState} : null;
}

function clearRepositoryEditState() {
    return setRepositoryEditState(null);
}

function getRepositoryEditState() {
    return repositoryEditState ? {...repositoryEditState} : null;
}

function syncMapMetadata(user = auth && auth.currentUser) {
    const guest = guestMode && !user;
    if(!guest && (!user || authorNameError(user.displayName))) return;
    const signedInAuthor = guest ? "Guest" : sessionAuthorName(user);
    const author = repositoryEditState &&
        (repositoryEditState.targetAuthor === signedInAuthor || currentUserIsAdmin())
        ? repositoryEditState.targetAuthor
        : signedInAuthor;
    const authorInput = document.getElementById("map_author");
    const categoryInput = document.getElementById("map_category");
    const versionInput = document.getElementById("map_version");
    const nameInput = document.getElementById("map_name");
    const remixIdentity = currentRemixIdentity();
    const lockedName = remixIdentity ? remixIdentity.mapName :
        (repositoryEditState && repositoryEditState.sourceName || "");

    window.xml_author = author;
    const category = MAP_CATEGORY;
    window.xml_category = category;
    window.vectron_mapAuthor = author;
    window.vectron_mapCategory = category;

    if(nameInput) {
        if(lockedName) {
            nameInput.value = lockedName;
            nameInput.readOnly = true;
            nameInput.setAttribute("aria-readonly", "true");
            nameInput.title = remixIdentity
                ? "Locked to this map's remix lineage"
                : "Locked while editing this repository map";
            window.xml_name = lockedName;
        } else {
            nameInput.readOnly = false;
            nameInput.removeAttribute("aria-readonly");
            nameInput.removeAttribute("title");
        }
    }

    if(authorInput) {
        authorInput.value = author;
        authorInput.readOnly = true;
        authorInput.setAttribute("aria-readonly", "true");
        authorInput.title = guest
            ? "Guest work stays local; sign in to use your permanent author name and upload"
            : author === signedInAuthor
            ? "Locked to your Vectron author name"
            : "Locked to the map author's repository directory for this admin edit";
    }
    if(categoryInput) {
        categoryInput.value = category;
        categoryInput.readOnly = !currentUserIsAdmin() || !repositoryEditState;
        categoryInput.setAttribute("aria-readonly", String(categoryInput.readOnly));
        categoryInput.title = categoryInput.readOnly
            ? "New user submissions use the maps category"
            : "Admins may correct this map's category before submitting a revision";
    }
    if(versionInput) {
        if(!versionInput.value.trim()) versionInput.value = "1";
        window.xml_version = versionInput.value;
        versionInput.readOnly = true;
        versionInput.setAttribute("aria-readonly", "true");
        versionInput.title = "Locked to the current map revision";
    }
}

window.vectron_syncLockedMetadata = () => syncMapMetadata();
window.vectron_getRepositoryEditState = getRepositoryEditState;
window.vectron_setRepositoryEditState = setRepositoryEditState;
window.vectron_clearRepositoryEditState = clearRepositoryEditState;

function hideSessionControls() {
    document.querySelectorAll(".auth-session, .auth-session-separator").forEach(element => {
        element.hidden = true;
    });
}

function queueEditorStart() {
    if(editorStartQueued) return;
    editorStartQueued = true;

    const start = () => {
        if(typeof window.vectron_start === "function") {
            window.vectron_start();
        } else {
            showFatal("The editor could not be started. Reload Vectron and try again.");
        }
    };

    if(document.readyState === "complete") start();
    else window.addEventListener("load", start, {once: true});
}

function unlockWorkspace(draftOwner) {
    const editorAlreadyStarted = window.vectron_started === true;
    const userChanged = typeof window.vectron_localDraftSetUser === "function"
        ? window.vectron_localDraftSetUser(draftOwner)
        : false;
    setEditorInert(false);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.remove("auth-locked");
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    document.title = "Vectron";
    profilePanel.hidden = true;
    if(editorAlreadyStarted && userChanged && typeof window.vectron_loadInitialMap === "function") {
        window.vectron_loadInitialMap();
    }
    queueEditorStart();
}

function unlockEditor(user) {
    guestMode = false;
    syncSessionControls(user);
    syncMapMetadata(user);
    unlockWorkspace(user.uid);
}

function enterGuestMode() {
    if(busy || auth && auth.currentUser) return;
    guestMode = true;
    clearRepositoryEditState();
    syncGuestSessionControls();
    syncMapMetadata(null);
    unlockWorkspace("guest");
}

function exitGuestMode() {
    if(!guestMode) return;
    if(typeof window.vectron_localDraftSaveNow === "function") {
        window.vectron_localDraftSaveNow();
    }
    guestMode = false;
    lockEditor();
}

function lockEditor() {
    if(repositoryOverlay && !repositoryOverlay.hidden) closeRepository();
    if(typeof window.vectron_localDraftSetUser === "function") {
        window.vectron_localDraftSetUser("");
    }
    guestMode = false;
    currentAccount = null;
    currentUserAdminClaim = false;
    stopAccountListeners();
    setCurrentUserRole("user");
    hideSessionControls();
    setEditorInert(true);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.add("auth-locked");
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    loading.hidden = true;
    fatalPanel.hidden = true;
    profilePanel.hidden = true;
    panel.hidden = false;
    document.title = "Sign in · Vectron";
    setBusy(false);
    setStatus("");
    window.setTimeout(() => emailInput.focus(), 0);
}

function showFatal(message) {
    hideSessionControls();
    setEditorInert(true);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.add("auth-locked");
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    loading.hidden = true;
    panel.hidden = true;
    profilePanel.hidden = true;
    fatalPanel.hidden = false;
    fatalMessage.textContent = message || "Check your connection and try again.";
    document.title = "Connection problem · Vectron";
}

function showProfileCompletion(user) {
    profileUser = user;
    hideSessionControls();
    setEditorInert(true);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.add("auth-locked");
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    loading.hidden = true;
    panel.hidden = true;
    fatalPanel.hidden = true;
    profilePanel.hidden = false;
    profileNameInput.value = user.displayName || "";
    setProfileBusy(false);
    setProfileStatus("");
    document.title = "Choose an author name · Vectron";
    window.setTimeout(() => profileNameInput.focus(), 0);
}

function validateForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if(!email || !emailInput.validity.valid) {
        emailInput.focus();
        return "Enter a valid email address.";
    }
    if(password.length < 6) {
        passwordInput.focus();
        return "Your password must contain at least 6 characters.";
    }
    if(mode === "signup") {
        const nameError = authorNameError(nameInput.value);
        if(nameError) {
            nameInput.focus();
            return nameError;
        }
    }
    if(mode === "signup" && password !== confirmInput.value) {
        confirmInput.focus();
        return "Those passwords don’t match.";
    }
    return "";
}

async function handleSubmit(event) {
    event.preventDefault();
    if(busy || !auth || !authSdk) return;

    const validationError = validateForm();
    if(validationError) {
        setStatus(validationError);
        return;
    }

    setBusy(true);
    setStatus("");
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if(mode === "signup") {
            const credential = await authSdk.createUserWithEmailAndPassword(auth, email, password);
            const requestedName = nameInput.value.trim();
            await authSdk.updateProfile(credential.user, {displayName: requestedName});
            await loadAccountSession(credential.user);
            unlockEditor(credential.user);
            showEditorMessage("Registration submitted. You can edit locally and browse maps while an admin reviews it.");
        } else {
            await authSdk.signInWithEmailAndPassword(auth, email, password);
        }
    } catch(error) {
        setStatus(friendlyAuthError(error));
    } finally {
        setBusy(false);
    }
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    if(profileBusy || !profileUser || !authSdk) return;
    const nameError = authorNameError(profileNameInput.value);
    if(nameError) {
        setProfileStatus(nameError);
        profileNameInput.focus();
        return;
    }

    setProfileBusy(true);
    setProfileStatus("");
    try {
        await authSdk.updateProfile(profileUser, {displayName: profileNameInput.value.trim()});
        await loadAccountSession(profileUser);
        unlockEditor(profileUser);
    } catch(error) {
        setProfileStatus(friendlyAuthError(error));
    } finally {
        setProfileBusy(false);
    }
}

async function handlePasswordReset() {
    if(busy || !auth || !authSdk) return;
    const email = emailInput.value.trim();
    if(!email || !emailInput.validity.valid) {
        setStatus("Enter your email above, then choose Forgot your password again.");
        emailInput.focus();
        return;
    }

    setBusy(true);
    setStatus("");
    try {
        await authSdk.sendPasswordResetEmail(auth, email);
        setStatus("If an account uses that email, a password reset link is on its way.", "success");
    } catch(error) {
        if(error && error.code === "auth/user-not-found") {
            setStatus("If an account uses that email, a password reset link is on its way.", "success");
        } else {
            setStatus(friendlyAuthError(error));
        }
    } finally {
        setBusy(false);
    }
}

function hasUnsavedWork() {
    return window.vectron_started === true &&
        Array.isArray(window.aamap_undoStack) &&
        window.aamap_undoStack.length > 0;
}

async function handleSignOut() {
    if(guestMode) {
        exitGuestMode();
        return;
    }
    if(!auth || !authSdk) return;
    if(hasUnsavedWork() && !await confirmAction(
        "Sign out of Vectron? Your in-progress map is saved locally and will be restored when you return.",
        {confirmLabel:"Sign out"}
    )) {
        return;
    }

    if(typeof window.vectron_localDraftSaveNow === "function") {
        window.vectron_localDraftSaveNow();
    }

    const buttons = document.querySelectorAll("[data-auth-signout]");
    buttons.forEach(button => { button.disabled = true; });
    try {
        await authSdk.signOut(auth);
    } catch(error) {
        showEditorMessage(friendlyAuthError(error));
    } finally {
        buttons.forEach(button => { button.disabled = false; });
    }
}

function stopAccountListeners() {
    if(accountUnsubscribe) accountUnsubscribe();
    accountUnsubscribe = null;
    if(notificationUnsubscribe) notificationUnsubscribe();
    notificationUnsubscribe = null;
    adminUnsubscribes.forEach(unsubscribe => unsubscribe());
    adminUnsubscribes = [];
    notifications = [];
    adminData = {accounts: [], submissions: [], maps: [], authors: [], history: []};
    updateNotificationBadge();
    updateAdminBadge();
}

async function ensureAccountRecord(user, isAdminClaim) {
    const accountRef = firestoreSdk.doc(firestore, "accounts", user.uid);
    const existing = await firestoreSdk.getDoc(accountRef);
    if(existing.exists()) {
        currentAccount = {id: existing.id, ...existing.data()};
        return currentAccount;
    }

    const requestedAuthorName = normalizeAuthorName(displayNameForUser(user));
    if(isAdminClaim) {
        const id = authorKey(requestedAuthorName);
        const authorRef = firestoreSdk.doc(firestore, "authors", id);
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const authorSnapshot = await transaction.get(authorRef);
            if(authorSnapshot.exists() && authorSnapshot.data().ownerUid &&
               authorSnapshot.data().ownerUid !== user.uid) {
                throw new Error("The admin author name is already linked to another account.");
            }
            transaction.set(authorRef, {
                authorId: id,
                name: requestedAuthorName,
                normalizedName: requestedAuthorName.toLocaleLowerCase("en-US"),
                ownerUid: user.uid,
                status: "active",
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp()
            }, {merge: true});
            transaction.set(accountRef, {
                uid: user.uid,
                email: user.email || "",
                displayName: requestedAuthorName,
                requestedAuthorName,
                authorId: id,
                authorName: requestedAuthorName,
                status: "approved",
                denialReason: "",
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp(),
                reviewedAt: firestoreSdk.serverTimestamp(),
                reviewedBy: user.uid
            });
        });
    } else {
        await firestoreSdk.setDoc(accountRef, {
            uid: user.uid,
            email: user.email || "",
            displayName: requestedAuthorName,
            requestedAuthorName,
            status: "pending",
            createdAt: firestoreSdk.serverTimestamp(),
            updatedAt: firestoreSdk.serverTimestamp()
        });
    }
    const created = await firestoreSdk.getDoc(accountRef);
    currentAccount = {id: created.id, ...created.data()};
    return currentAccount;
}

async function loadAccountSession(user) {
    const token = await authSdk.getIdTokenResult(user, true);
    const isAdminClaim = token.claims && token.claims.admin === true;
    currentUserAdminClaim = isAdminClaim;
    await ensureAccountRecord(user, isAdminClaim);
    setCurrentUserRole(isAdminClaim ? "admin" :
        ["pending", "deleting"].includes(currentAccount.status) ? "pending" :
        currentAccount.status === "denied" ? "denied" : "user");
    startNotificationListener(user.uid);
    if(isAdminClaim) startAdminListeners();
    startAccountListener(user);
    return currentAccount;
}

function startAccountListener(user) {
    if(accountUnsubscribe) accountUnsubscribe();
    const accountRef = firestoreSdk.doc(firestore, "accounts", user.uid);
    accountUnsubscribe = firestoreSdk.onSnapshot(accountRef, snapshot => {
        if(!snapshot.exists() || !auth || auth.currentUser?.uid !== user.uid) return;
        const previousStatus = currentAccount && currentAccount.status;
        currentAccount = {id: snapshot.id, ...snapshot.data()};
        setCurrentUserRole(accountRole());
        syncSessionControls(user);
        syncMapMetadata(user);
        if(previousStatus && previousStatus !== currentAccount.status) {
            if(currentAccount.status === "approved") {
                showEditorMessage(`Your registration is approved. Submissions are now enabled for ${currentAccount.authorName}.`);
            } else if(currentAccount.status === "denied") {
                showEditorMessage(`Your registration was denied: ${currentAccount.denialReason || "No reason was provided."}`);
            }
        }
    }, error => {
        console.error("Vectron account status failed to refresh.", error);
    });
}

function updateNotificationBadge() {
    const unread = notifications.filter(item => !item.readAt).length;
    if(notificationCount) {
        notificationCount.textContent = String(unread);
        notificationCount.hidden = unread === 0;
    }
}

function notificationCopy(item) {
    if(item.body) return item.body;
    if(item.reason) return item.reason;
    return "Your Vectron account has an update.";
}

function renderNotifications() {
    notificationList.replaceChildren();
    const unread = notifications.filter(item => !item.readAt).length;
    notificationSummary.textContent = notifications.length
        ? `${unread} unread · ${notifications.length} recent ${notifications.length === 1 ? "notification" : "notifications"}`
        : "You do not have any notifications yet.";
    notificationMarkReadButton.disabled = unread === 0;
    if(!notifications.length) {
        const empty = document.createElement("div");
        empty.className = "repository-empty";
        empty.textContent = "Approval and registration decisions will appear here.";
        notificationList.appendChild(empty);
        return;
    }
    const fragment = document.createDocumentFragment();
    notifications.forEach(item => {
        const card = document.createElement("article");
        card.className = `account-card${item.readAt ? "" : " unread"}`;
        const header = document.createElement("div");
        header.className = "account-card-header";
        const title = document.createElement("strong");
        title.textContent = item.title || "Vectron update";
        const time = document.createElement("span");
        time.className = "account-card-time";
        time.textContent = formatTimestamp(item.createdAt);
        header.append(title, time);
        const copy = document.createElement("p");
        copy.className = "account-card-copy";
        copy.textContent = notificationCopy(item);
        card.append(header, copy);
        fragment.appendChild(card);
    });
    notificationList.appendChild(fragment);
}

function startNotificationListener(uid) {
    if(notificationUnsubscribe) notificationUnsubscribe();
    const items = firestoreSdk.collection(firestore, "notifications", uid, "items");
    const notificationQuery = firestoreSdk.query(
        items, firestoreSdk.orderBy("createdAt", "desc"), firestoreSdk.limit(50)
    );
    notificationUnsubscribe = firestoreSdk.onSnapshot(notificationQuery, snapshot => {
        notifications = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
        updateNotificationBadge();
        if(notificationOverlay && !notificationOverlay.hidden) renderNotifications();
    }, error => {
        console.error("Vectron notifications failed to load.", error);
        if(notificationStatus) {
            notificationStatus.textContent = "Notifications could not be loaded.";
            notificationStatus.hidden = false;
        }
    });
}

function openNotifications() {
    if(guestMode || !auth || !auth.currentUser) return;
    overlayPreviousFocus = document.activeElement;
    notificationOverlay.hidden = false;
    notificationButton.setAttribute("aria-expanded", "true");
    renderNotifications();
    window.setTimeout(() => notificationCloseButton.focus(), 0);
}

function closeNotifications() {
    if(notificationOverlay.hidden) return;
    notificationOverlay.hidden = true;
    notificationButton.setAttribute("aria-expanded", "false");
    if(overlayPreviousFocus && typeof overlayPreviousFocus.focus === "function") {
        overlayPreviousFocus.focus();
    }
}

async function markAllNotificationsRead() {
    if(!auth || !auth.currentUser) return;
    const unread = notifications.filter(item => !item.readAt);
    if(!unread.length) return;
    notificationMarkReadButton.disabled = true;
    try {
        const batch = firestoreSdk.writeBatch(firestore);
        unread.forEach(item => batch.update(
            firestoreSdk.doc(firestore, "notifications", auth.currentUser.uid, "items", item.id),
            {readAt: firestoreSdk.serverTimestamp()}
        ));
        await batch.commit();
    } catch(error) {
        console.error("Vectron notifications could not be marked read.", error);
        notificationStatus.textContent = "Notifications could not be updated.";
        notificationStatus.hidden = false;
    }
}

function updateAdminBadge() {
    const total = adminData.accounts.length + adminData.submissions.length;
    if(adminCount) {
        adminCount.textContent = String(total);
        adminCount.hidden = total === 0;
    }
    if(adminAccountCount) adminAccountCount.textContent = String(adminData.accounts.length);
    if(adminSubmissionCount) adminSubmissionCount.textContent = String(adminData.submissions.length);
    if(adminMapCount) adminMapCount.textContent = String(adminData.maps.length);
    if(adminHistoryCount) adminHistoryCount.textContent = String(adminData.history.length);
}

function setAdminCollection(key, snapshot) {
    const records = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
    if(key === "history") {
        const recordsById = new Map(records.map(item => [item.id, item]));
        const finalRevisionIds = new Set(records.map(item => item.finalRevisionId).filter(Boolean));
        adminData.history = records
            .filter(item => !item.sourceSubmissionId &&
                !(finalRevisionIds.has(item.id) && item.finalRevisionId !== item.id))
            .map(item => {
                const final = item.finalRevisionId && item.finalRevisionId !== item.id
                    ? recordsById.get(item.finalRevisionId) : null;
                return final ? {
                    ...item,
                    authorId: final.authorId || item.authorId,
                    authorName: final.authorName || item.authorName,
                    category: final.category || item.category,
                    mapVersion: final.mapVersion || item.mapVersion,
                    storagePath: final.storagePath || item.storagePath,
                    sha256: final.sha256 || item.sha256
                } : item;
            })
            .sort((a, b) => {
                const aTime = a.reviewedAt && typeof a.reviewedAt.toMillis === "function"
                    ? a.reviewedAt.toMillis() : 0;
                const bTime = b.reviewedAt && typeof b.reviewedAt.toMillis === "function"
                    ? b.reviewedAt.toMillis() : 0;
                return bTime - aTime;
            });
    } else {
        adminData[key] = records;
    }
    updateAdminBadge();
    if(adminOverlay && !adminOverlay.hidden && (key === adminTab || key === "authors")) {
        renderAdminList();
    }
}

function startAdminListeners() {
    adminUnsubscribes.forEach(unsubscribe => unsubscribe());
    const specs = [
        ["accounts", firestoreSdk.query(
            firestoreSdk.collection(firestore, "accounts"),
            firestoreSdk.where("status", "==", "pending")
        )],
        ["submissions", firestoreSdk.query(
            firestoreSdk.collection(firestore, "mapSubmissions"),
            firestoreSdk.where("status", "==", "pending")
        )],
        ["maps", firestoreSdk.query(
            firestoreSdk.collection(firestore, "maps"),
            firestoreSdk.where("status", "==", "active")
        )],
        ["history", firestoreSdk.query(
            firestoreSdk.collection(firestore, "mapSubmissions"),
            firestoreSdk.where("status", "in", ["approved", "denied"])
        )],
        ["authors", firestoreSdk.collection(firestore, "authors")]
    ];
    adminUnsubscribes = specs.map(([key, reference]) =>
        firestoreSdk.onSnapshot(reference, snapshot => setAdminCollection(key, snapshot), error => {
            console.error(`Vectron admin ${key} queue failed to load.`, error);
            if(adminStatus) {
                adminStatus.textContent = "One or more admin queues could not be loaded.";
                adminStatus.className = "repository-status error";
                adminStatus.hidden = false;
            }
        })
    );
}

function setAdminBusy(value) {
    adminBusy = value;
    adminRefreshButton.disabled = value;
    adminSearchInput.disabled = value;
    adminList.querySelectorAll("button,input,select,textarea").forEach(control => {
        control.disabled = value;
    });
}

function setAdminStatus(message, type = "") {
    adminStatus.textContent = message || "";
    adminStatus.className = `repository-status${type ? ` ${type}` : ""}`;
    adminStatus.hidden = !message;
}

function adminAuthorOptions(selectedId = "", includeRequested = false) {
    const select = document.createElement("select");
    if(includeRequested) {
        const requested = document.createElement("option");
        requested.value = "__requested__";
        requested.textContent = "Create requested author";
        select.appendChild(requested);
    }
    adminData.authors
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, {sensitivity: "base"}))
        .forEach(author => {
            const option = document.createElement("option");
            option.value = author.id;
            option.textContent = author.name || author.id;
            option.selected = author.id === selectedId;
            select.appendChild(option);
        });
    if(!select.value && select.options.length) select.selectedIndex = 0;
    return select;
}

function cardField(labelText, control) {
    const label = document.createElement("label");
    label.className = "account-card-field";
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, control);
    return label;
}

function actionButton(label, action, id, danger = false) {
    const button = document.createElement("button");
    button.className = `account-card-button${danger ? " danger" : ""}`;
    button.type = "button";
    button.textContent = label;
    button.dataset.adminAction = action;
    button.dataset.adminId = id;
    return button;
}

function previewElements(root, names) {
    const wanted = new Set(names.map(name => name.toLocaleLowerCase("en-US")));
    return Array.from(root.getElementsByTagName("*")).filter(node =>
        wanted.has(String(node.localName || node.tagName || "").toLocaleLowerCase("en-US"))
    );
}

function previewCoordinate(node, name) {
    const value = Number.parseFloat(node.getAttribute(name));
    return Number.isFinite(value) && Math.abs(value) <= 1e9 ? value : null;
}

function previewPoint(node) {
    const x = previewCoordinate(node, "x");
    const y = previewCoordinate(node, "y");
    return x === null || y === null ? null : {x, y};
}

function previewDirectPoints(node) {
    return Array.from(node.children || [])
        .filter(child => String(child.localName || child.tagName || "").toLocaleLowerCase("en-US") === "point")
        .map(previewPoint)
        .filter(Boolean);
}

function previewSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
}

function buildAdminMapPreview(xml, submission) {
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    if(parsed.querySelector("parsererror")) throw new Error("The map XML could not be parsed.");

    const walls = [];
    const circles = [];
    const spawns = [];
    const bounds = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    const include = (point, radius = 0) => {
        bounds.minX = Math.min(bounds.minX, point.x - radius);
        bounds.maxX = Math.max(bounds.maxX, point.x + radius);
        bounds.minY = Math.min(bounds.minY, point.y - radius);
        bounds.maxY = Math.max(bounds.maxY, point.y + radius);
    };

    previewElements(parsed, ["Wall", "ObstacleWall"]).slice(0, 4000).forEach(wall => {
        const points = previewDirectPoints(wall).slice(0, 20000);
        if(points.length < 2) return;
        points.forEach(point => include(point));
        walls.push(points);
    });
    previewElements(parsed, ["ShapeCircle"]).slice(0, 2000).forEach(shape => {
        const center = previewDirectPoints(shape)[0];
        const radius = Math.abs(previewCoordinate(shape, "radius") || 0);
        if(!center || !radius) return;
        let parent = shape.parentElement;
        while(parent && String(parent.localName || "").toLocaleLowerCase("en-US") !== "zone") {
            parent = parent.parentElement;
        }
        const effect = parent && parent.getAttribute("effect") || "zone";
        const children = Array.from(shape.children || []);
        const checkpoint = children.find(child =>
            String(child.localName || child.tagName || "").toLocaleLowerCase("en-US") === "checkpoint"
        );
        const teleport = children.find(child =>
            String(child.localName || child.tagName || "").toLocaleLowerCase("en-US") === "teleport"
        );
        let teleportData = null;
        if(teleport) {
            const destX = previewCoordinate(teleport, "destX");
            const destY = previewCoordinate(teleport, "destY");
            const dirX = previewCoordinate(teleport, "dirX");
            const dirY = previewCoordinate(teleport, "dirY");
            const mode = String(teleport.getAttribute("modes") || "abs").toLocaleLowerCase("en-US");
            if(destX !== null && destY !== null) {
                const destination = mode === "abs"
                    ? {x: destX, y: destY}
                    : {x: center.x + destX, y: center.y + destY};
                teleportData = {
                    destination,
                    direction:{x: dirX || 0, y: dirY || 0},
                    mode
                };
                include(destination);
            }
        }
        include(center, radius);
        circles.push({
            center,
            radius,
            effect,
            checkpointId:checkpoint ? checkpoint.getAttribute("id") : "",
            teleport:teleportData
        });
    });
    previewElements(parsed, ["Spawn"]).slice(0, 2000).forEach(spawn => {
        const point = previewPoint(spawn);
        if(!point) return;
        const xdir = previewCoordinate(spawn, "xdir");
        const ydir = previewCoordinate(spawn, "ydir");
        const angle = previewCoordinate(spawn, "angle");
        const direction = xdir !== null && ydir !== null
            ? {x: xdir, y: ydir}
            : angle !== null
                ? {x: Math.cos(angle * Math.PI / 180), y: Math.sin(angle * Math.PI / 180)}
                : {x: 1, y: 0};
        include(point);
        spawns.push({point, direction});
    });
    if(!Number.isFinite(bounds.minX)) throw new Error("No previewable walls, zones, or spawns were found.");

    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const span = Math.max(spanX, spanY);
    const padding = Math.max(3, span * 0.055);
    const svg = previewSvgElement("svg", {
        class: "map-review-preview-svg",
        viewBox: `${bounds.minX - padding} ${-(bounds.maxY + padding)} ${spanX + padding * 2} ${spanY + padding * 2}`,
        preserveAspectRatio: "xMidYMid meet",
        focusable: "false",
        "aria-hidden": "true"
    });
    const title = previewSvgElement("title");
    title.textContent = `${submission.mapName || "Untitled"} map preview`;
    svg.appendChild(title);
    const pathData = points => points.map((point, index) =>
        `${index ? "L" : "M"}${point.x} ${-point.y}`
    ).join(" ");
    const effectClass = effect => {
        const normalized = String(effect || "zone").toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]/g, "");
        return `map-preview-zone map-preview-zone-${normalized || "zone"}`;
    };
    const markerSize = Math.max(1.5, span / 65);
    circles.filter(zone => zone.teleport).forEach(zone => {
        const destination = zone.teleport.destination;
        svg.appendChild(previewSvgElement("line", {
            class:"map-preview-teleport-link",
            x1:zone.center.x, y1:-zone.center.y,
            x2:destination.x, y2:-destination.y
        }));
        svg.appendChild(previewSvgElement("circle", {
            class:"map-preview-teleport-destination",
            cx:destination.x, cy:-destination.y, r:markerSize * 0.72
        }));
        const direction = zone.teleport.direction;
        const directionLength = Math.hypot(direction.x, direction.y);
        if(directionLength > 1e-9) {
            svg.appendChild(previewSvgElement("line", {
                class:"map-preview-teleport-direction",
                x1:destination.x,
                y1:-destination.y,
                x2:destination.x + direction.x / directionLength * markerSize * 3,
                y2:-(destination.y + direction.y / directionLength * markerSize * 3)
            }));
        }
    });
    circles.forEach(zone => svg.appendChild(previewSvgElement("circle", {
        class: effectClass(zone.effect), cx: zone.center.x, cy: -zone.center.y, r: zone.radius
    })));
    circles.filter(zone => zone.checkpointId).forEach(zone => {
        const label = previewSvgElement("text", {
            class:"map-preview-checkpoint-label",
            x:zone.center.x,
            y:-zone.center.y,
            "text-anchor":"middle",
            "dominant-baseline":"central"
        });
        label.textContent = `CP ${zone.checkpointId}`;
        svg.appendChild(label);
    });
    walls.forEach(points => svg.appendChild(previewSvgElement("path", {
        class: "map-preview-wall", d: pathData(points)
    })));
    spawns.forEach(spawn => {
        svg.appendChild(previewSvgElement("circle", {
            class: "map-preview-spawn", cx: spawn.point.x, cy: -spawn.point.y, r: markerSize * 0.58
        }));
        svg.appendChild(previewSvgElement("line", {
            class: "map-preview-spawn-direction",
            x1: spawn.point.x,
            y1: -spawn.point.y,
            x2: spawn.point.x + spawn.direction.x * markerSize * 2.5,
            y2: -(spawn.point.y + spawn.direction.y * markerSize * 2.5)
        }));
    });
    return svg;
}

async function loadAdminSubmissionPreview(preview, submission) {
    const path = String(submission.storagePath || "");
    if(!path) {
        preview.replaceChildren();
        preview.textContent = "No map revision is attached to this review.";
        preview.classList.add("error");
        preview.setAttribute("aria-busy", "false");
        return;
    }
    try {
        const cacheKey = `${path}|${submission.sha256 || ""}`;
        if(!adminPreviewCache.has(cacheKey)) {
            adminPreviewCache.set(cacheKey, downloadRepositoryMap(path));
        }
        const xml = await adminPreviewCache.get(cacheKey);
        if(!preview.isConnected || preview.dataset.adminPreviewPath !== path) return;
        preview.replaceChildren(buildAdminMapPreview(xml, submission));
        preview.classList.remove("error");
    } catch(error) {
        console.error("Vectron review preview failed.", error);
        if(!preview.isConnected || preview.dataset.adminPreviewPath !== path) return;
        const message = document.createElement("span");
        message.className = "map-review-preview-message";
        message.textContent = error && error.message ? error.message : "Map preview unavailable.";
        preview.replaceChildren(message);
        preview.classList.add("error");
    } finally {
        if(preview.isConnected && preview.dataset.adminPreviewPath === path) {
            preview.setAttribute("aria-busy", "false");
        }
    }
}

function queueAdminSubmissionPreview(preview, submission) {
    adminPreviewTargets.set(preview, submission);
    const load = () => loadAdminSubmissionPreview(preview, submission);
    if(typeof IntersectionObserver !== "function") {
        window.setTimeout(load, 0);
        return;
    }
    if(!adminPreviewObserver) {
        adminPreviewObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if(!entry.isIntersecting) return;
                adminPreviewObserver.unobserve(entry.target);
                const item = adminPreviewTargets.get(entry.target);
                if(item) loadAdminSubmissionPreview(entry.target, item);
            });
        }, {root: adminList, rootMargin: "240px 0px"});
    }
    window.setTimeout(() => {
        if(preview.isConnected) adminPreviewObserver.observe(preview);
    }, 0);
}

function renderAdminAccount(account) {
    const card = document.createElement("article");
    card.className = "account-card";
    card.dataset.adminCard = account.id;
    const header = document.createElement("div");
    header.className = "account-card-header";
    const name = document.createElement("strong");
    name.textContent = account.requestedAuthorName || account.displayName || "Unnamed account";
    const time = document.createElement("span");
    time.className = "account-card-time";
    time.textContent = formatTimestamp(account.createdAt);
    header.append(name, time);
    const meta = document.createElement("div");
    meta.className = "account-card-meta";
    meta.textContent = account.email || "No email shown";
    const fields = document.createElement("div");
    fields.className = "account-card-fields";
    const authorSelect = adminAuthorOptions("", true);
    authorSelect.dataset.adminAuthor = "";
    const newName = document.createElement("input");
    newName.value = account.requestedAuthorName || account.displayName || "";
    newName.dataset.adminAuthorName = "";
    const reason = document.createElement("textarea");
    reason.rows = 2;
    reason.placeholder = "Required when denying and deleting";
    reason.dataset.adminReason = "";
    fields.append(
        cardField("Link to author", authorSelect),
        cardField("New/requested author name", newName),
        cardField("Decision reason", reason)
    );
    const actions = document.createElement("div");
    actions.className = "account-card-actions";
    actions.append(
        actionButton("Deny and delete user", "deny-account", account.id, true),
        actionButton("Approve and link", "approve-account", account.id)
    );
    card.append(header, meta, fields, actions);
    return card;
}

function renderAdminSubmission(submission) {
    const card = document.createElement("article");
    card.className = "account-card map-review-card";
    card.dataset.adminCard = submission.id;
    const details = document.createElement("div");
    details.className = "map-review-details";
    const header = document.createElement("div");
    header.className = "account-card-header";
    const name = document.createElement("strong");
    name.textContent = `${submission.mapName || "Untitled"} · ${submission.mapVersion || ""}`;
    const time = document.createElement("span");
    time.className = "account-card-time";
    time.textContent = formatTimestamp(submission.createdAt);
    header.append(name, time);
    const meta = document.createElement("div");
    meta.className = "account-card-meta";
    meta.textContent = `${submission.operation || "create"} by ${submission.submittedByName || submission.submittedBy} · ${submission.authorName}/${submission.category}`;
    const submittedReason = document.createElement("div");
    submittedReason.className = "map-review-submission-reason";
    const reasonLabel = document.createElement("strong");
    reasonLabel.textContent = "Submitted for review because";
    const reasonCopy = document.createElement("span");
    reasonCopy.textContent = submission.submissionReason || "No reason was provided.";
    submittedReason.append(reasonLabel, reasonCopy);
    const fields = document.createElement("div");
    fields.className = "account-card-fields map-review-fields";
    const authorSelect = adminAuthorOptions(submission.authorId);
    authorSelect.dataset.adminAuthor = "";
    const category = document.createElement("input");
    category.value = MAP_CATEGORY;
    category.readOnly = true;
    category.title = "Vectron uploads always use the maps category.";
    category.dataset.adminCategory = "";
    const reason = document.createElement("textarea");
    reason.rows = 2;
    reason.placeholder = "Required when denying; optional approval note";
    reason.dataset.adminReason = "";
    fields.append(
        cardField("Final author", authorSelect),
        cardField("Final category", category),
        cardField("Decision reason", reason)
    );
    const actions = document.createElement("div");
    actions.className = "account-card-actions map-review-actions";
    actions.append(
        actionButton("Edit map in Vectron", "edit-submission", submission.id),
        actionButton("Deny submission", "deny-submission", submission.id, true),
        actionButton("Deny and delete map", "delete-submission-map", submission.id, true),
        actionButton("Approve and publish", "approve-submission", submission.id)
    );
    details.append(header, meta, submittedReason, fields, actions);
    const preview = document.createElement("div");
    preview.className = "map-review-preview";
    preview.dataset.adminPreviewId = submission.id;
    preview.dataset.adminPreviewPath = submission.storagePath || "";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", `Map preview for ${submission.mapName || "Untitled"}`);
    preview.setAttribute("aria-busy", "true");
    const loading = document.createElement("span");
    loading.className = "map-review-preview-message";
    loading.textContent = "Loading map preview…";
    preview.appendChild(loading);
    card.append(details, preview);
    queueAdminSubmissionPreview(preview, submission);
    return card;
}

function renderAdminHistory(submission) {
    const approved = submission.status === "approved";
    const card = document.createElement("article");
    card.className = "account-card map-review-card map-review-history-card";
    card.dataset.adminCard = submission.id;
    const details = document.createElement("div");
    details.className = "map-review-details";
    const header = document.createElement("div");
    header.className = "account-card-header";
    const name = document.createElement("strong");
    name.textContent = `${submission.mapName || "Untitled"} · ${submission.mapVersion || ""}`;
    const time = document.createElement("span");
    time.className = "account-card-time";
    time.textContent = formatTimestamp(submission.reviewedAt || submission.updatedAt);
    header.append(name, time);
    const meta = document.createElement("div");
    meta.className = "account-card-meta";
    const decision = approved ? "Approved and published" : "Denied";
    meta.textContent = `${decision} · ${submission.authorName}/${submission.category} · ` +
        `${submission.operation || "create"} by ${submission.submittedByName || submission.submittedBy}`;
    const submittedReason = document.createElement("div");
    submittedReason.className = "map-review-submission-reason";
    const submittedLabel = document.createElement("strong");
    submittedLabel.textContent = "Submitted for review because";
    const submittedCopy = document.createElement("span");
    submittedCopy.textContent = submission.submissionReason || "No reason was provided.";
    submittedReason.append(submittedLabel, submittedCopy);
    const reviewReason = document.createElement("div");
    reviewReason.className = "map-review-submission-reason";
    const reviewLabel = document.createElement("strong");
    reviewLabel.textContent = "Review decision";
    const reviewCopy = document.createElement("span");
    reviewCopy.textContent = submission.reviewReason || "No decision note was provided.";
    reviewReason.append(reviewLabel, reviewCopy);
    const actions = document.createElement("div");
    actions.className = "account-card-actions map-review-actions";
    actions.append(actionButton("Reopen and edit", "reopen-history", submission.id));
    details.append(header, meta, submittedReason, reviewReason, actions);
    const preview = document.createElement("div");
    preview.className = "map-review-preview";
    preview.dataset.adminPreviewId = `history:${submission.id}`;
    preview.dataset.adminPreviewPath = submission.storagePath || "";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", `Historical map preview for ${submission.mapName || "Untitled"}`);
    preview.setAttribute("aria-busy", "true");
    const loading = document.createElement("span");
    loading.className = "map-review-preview-message";
    loading.textContent = "Loading historical preview…";
    preview.appendChild(loading);
    card.append(details, preview);
    queueAdminSubmissionPreview(preview, submission);
    return card;
}

function renderAdminMap(map) {
    const card = document.createElement("article");
    card.className = "account-card map-review-card map-review-published-card";
    card.dataset.adminCard = map.id;
    const details = document.createElement("div");
    details.className = "map-review-details";
    const header = document.createElement("div");
    header.className = "account-card-header";
    const name = document.createElement("strong");
    name.textContent = `${map.mapName || "Untitled"} · ${map.mapVersion || ""}`;
    const time = document.createElement("span");
    time.className = "account-card-time";
    time.textContent = formatTimestamp(map.updatedAt || map.createdAt);
    header.append(name, time);
    const meta = document.createElement("div");
    meta.className = "account-card-meta";
    meta.textContent = map.resourcePath || "No published resource path";
    const fields = document.createElement("div");
    fields.className = "account-card-fields map-review-fields";
    const authorSelect = adminAuthorOptions(map.authorId);
    authorSelect.dataset.adminAuthor = "";
    const category = document.createElement("input");
    category.value = MAP_CATEGORY;
    category.readOnly = true;
    category.title = "Vectron uploads always use the maps category.";
    category.dataset.adminCategory = "";
    fields.append(cardField("Author", authorSelect), cardField("Category", category));
    const actions = document.createElement("div");
    actions.className = "account-card-actions map-review-actions";
    actions.append(actionButton("Save metadata revision", "edit-map-metadata", map.id));
    details.append(header, meta, fields, actions);
    const preview = document.createElement("div");
    preview.className = "map-review-preview";
    preview.dataset.adminPreviewId = `published:${map.id}`;
    preview.dataset.adminPreviewPath = map.storagePath || "";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", `Published map preview for ${map.mapName || "Untitled"}`);
    preview.setAttribute("aria-busy", "true");
    const loading = document.createElement("span");
    loading.className = "map-review-preview-message";
    loading.textContent = "Loading published preview…";
    preview.appendChild(loading);
    card.append(details, preview);
    queueAdminSubmissionPreview(preview, map);
    return card;
}

function renderAdminList() {
    const items = adminData[adminTab] || [];
    const query = adminSearchInput.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => !query || JSON.stringify(item).toLocaleLowerCase().includes(query));
    if(adminPreviewObserver) {
        adminPreviewObserver.disconnect();
        adminPreviewObserver = null;
    }
    adminList.replaceChildren();
    const queueLabel = adminTab === "accounts" ? "pending registrations" :
        adminTab === "submissions" ? "pending map submissions" :
        adminTab === "history" ? "review decisions" : "published maps";
    adminSummary.textContent = `${visible.length} of ${items.length} ${queueLabel}.`;
    if(!visible.length) {
        const empty = document.createElement("div");
        empty.className = "repository-empty";
        empty.textContent = query ? "Nothing in this queue matches your search." :
            adminTab === "maps" ? "No published maps are in the catalog." :
            adminTab === "history" ? "No completed reviews are in the history yet." :
                "This review queue is clear.";
        adminList.appendChild(empty);
        return;
    }
    const renderer = adminTab === "accounts" ? renderAdminAccount :
        adminTab === "submissions" ? renderAdminSubmission :
        adminTab === "history" ? renderAdminHistory : renderAdminMap;
    const fragment = document.createDocumentFragment();
    visible.forEach(item => fragment.appendChild(renderer(item)));
    adminList.appendChild(fragment);
}

function setAdminTab(value) {
    adminTab = ["accounts", "submissions", "maps", "history"].includes(value) ? value : "accounts";
    adminTabs.forEach(tab => {
        const active = tab.dataset.adminTab === adminTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    renderAdminList();
}

function openAdmin() {
    if(!currentUserIsAdmin()) return;
    overlayPreviousFocus = document.activeElement;
    adminOverlay.hidden = false;
    anchorAdminDialog();
    adminButton.setAttribute("aria-expanded", "true");
    adminSearchInput.value = "";
    setAdminTab(adminTab);
    window.setTimeout(() => adminSearchInput.focus(), 0);
}

function closeAdmin() {
    if(adminOverlay.hidden) return;
    if(confirmResolver) settleConfirmation(false);
    adminOverlay.hidden = true;
    adminButton.setAttribute("aria-expanded", "false");
    if(overlayPreviousFocus && typeof overlayPreviousFocus.focus === "function") {
        overlayPreviousFocus.focus();
    }
}

function adminCard(id) {
    return Array.from(adminList.querySelectorAll("[data-admin-card]")).find(card =>
        card.dataset.adminCard === id
    );
}

function selectedAuthor(card, fallbackName = "") {
    const select = card && card.querySelector("[data-admin-author]");
    if(!select) throw new Error("Choose an author.");
    if(select.value === "__requested__") {
        const input = card.querySelector("[data-admin-author-name]");
        const name = normalizeAuthorName(input && input.value || fallbackName);
        const error = authorNameError(name);
        if(error) throw new Error(error);
        return {id: authorKey(name), name, create: true};
    }
    const author = adminData.authors.find(item => item.id === select.value);
    if(!author) throw new Error("Choose an existing author.");
    return {id: author.id, name: author.name, create: false};
}

function decisionReason(card, required) {
    const input = card && card.querySelector("[data-admin-reason]");
    const reason = String(input && input.value || "").trim();
    if(required && !reason) throw new Error("Enter a reason before denying this request.");
    if(reason.length > 1000) throw new Error("Keep the decision reason to 1,000 characters or fewer.");
    return reason;
}

function adminNotificationRef(uid) {
    return firestoreSdk.doc(firestoreSdk.collection(firestore, "notifications", uid, "items"));
}

function adminAuditRef() {
    return firestoreSdk.doc(firestoreSdk.collection(firestore, "auditEvents"));
}

async function denyRegistration(accountId) {
    const account = adminData.accounts.find(item => item.id === accountId);
    const card = adminCard(accountId);
    if(!account || !card) return;
    const reason = decisionReason(card, true);
    const reviewer = auth.currentUser;
    if(!await confirmAction(
        `Deny and permanently delete ${account.requestedAuthorName || account.email}? ` +
        "Their Firebase login and Vectron registration will be removed.",
        {confirmLabel:"Deny and delete", danger:true}
    )) return;
    setAdminBusy(true);
    setAdminStatus("Denying registration and deleting user…");
    try {
        const idToken = await authSdk.getIdToken(reviewer, true);
        const response = await fetch(REGISTRATION_DENIAL_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({accountId, reason})
        });
        let result = {};
        try {
            result = await response.json();
        } catch(error) {
            result = {};
        }
        if(!response.ok) {
            throw new Error(result.error || `User deletion failed (${response.status}).`);
        }
        setAdminStatus("Registration denied and user permanently deleted.");
    } finally {
        setAdminBusy(false);
    }
}

async function reviewAccount(accountId) {
    const account = adminData.accounts.find(item => item.id === accountId);
    const card = adminCard(accountId);
    if(!account || !card) return;
    const reason = decisionReason(card, false);
    const author = selectedAuthor(card, account.requestedAuthorName);
    const reviewer = auth.currentUser;
    if(!await confirmAction(
        `Approve registration for ${account.requestedAuthorName || account.email}?`,
        {confirmLabel:"Approve and link"}
    )) return;
    setAdminBusy(true);
    setAdminStatus("Approving registration…");
    try {
        const accountRef = firestoreSdk.doc(firestore, "accounts", accountId);
        const notificationRef = adminNotificationRef(accountId);
        const auditRef = adminAuditRef();
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const accountSnapshot = await transaction.get(accountRef);
            if(!accountSnapshot.exists() || accountSnapshot.data().status !== "pending") {
                throw new Error("This registration has already been reviewed or removed.");
            }
            const authorRef = firestoreSdk.doc(firestore, "authors", author.id);
            const authorSnapshot = await transaction.get(authorRef);
            if(authorSnapshot.exists() && authorSnapshot.data().ownerUid &&
               authorSnapshot.data().ownerUid !== accountId) {
                throw new Error(`${author.name} is already linked to another account.`);
            }
            transaction.set(authorRef, {
                authorId: author.id,
                name: author.name,
                normalizedName: author.name.toLocaleLowerCase("en-US"),
                ownerUid: accountId,
                status: "active",
                createdAt: authorSnapshot.exists() ? authorSnapshot.data().createdAt : firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp()
            }, {merge: true});
            transaction.update(accountRef, {
                status: "approved",
                authorId: author.id,
                authorName: author.name,
                denialReason: "",
                reviewedAt: firestoreSdk.serverTimestamp(),
                reviewedBy: reviewer.uid,
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.set(notificationRef, {
                recipientUid: accountId,
                type: "registration-approved",
                title: "Vectron registration approved",
                body: `Your account is approved and linked to the ${author.name} author.`,
                reason,
                createdAt: firestoreSdk.serverTimestamp(),
                readAt: null
            });
            transaction.set(auditRef, {
                actorUid: reviewer.uid,
                actorName: displayNameForUser(reviewer),
                action: "account.approve",
                targetType: "account",
                targetId: accountId,
                reason,
                after: {status: "approved", authorId: author.id, authorName: author.name},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        setAdminStatus("Registration approved and author linked.");
    } finally {
        setAdminBusy(false);
    }
}

async function uploadReviewedRevision(submission, author) {
    const xml = await downloadRepositoryMap(submission.storagePath);
    const originalSha256 = await sha256Hex(xml);
    if(submission.sha256 && submission.sha256 !== originalSha256) {
        throw new Error("The submitted blob checksum does not match its review record.");
    }
    const identity = resourceIdentityFromXml(xml);
    if(!identity || !identity.name || !identity.version) {
        throw new Error("The submitted file does not contain a valid Resource identity.");
    }
    if(identity.name !== submission.mapName || identity.version !== submission.mapVersion) {
        throw new Error("The submitted XML name/version does not match its review record.");
    }
    const finalCategory = MAP_CATEGORY;
    const corrected = author.id !== submission.authorId || author.name !== submission.authorName ||
        finalCategory !== submission.category || identity.author !== author.name ||
        identity.category !== finalCategory;
    const sourceRevisionId = submission.reviewRevisionId ||
        (submission.operation === "server-review" ? submission.sourceRevisionId : submission.id);
    if(!corrected) return {
        submission,
        storagePath: submission.storagePath,
        revisionId: sourceRevisionId,
        sha256: originalSha256
    };

    const correctionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
    const correctedXml = rewriteResourceIdentity(xml, {author: author.name, category: finalCategory});
    const correctedSha256 = await sha256Hex(correctedXml);
    const storagePath = revisionStoragePath(
        auth.currentUser.uid, correctionRef.id,
        submission.mapName, submission.mapVersion
    );
    await storageSdk.uploadString(storageSdk.ref(storage, storagePath), correctedXml, "raw", {
        contentType: "application/xml; charset=UTF-8",
        customMetadata: {
            ownerUid: auth.currentUser.uid,
            submissionId: correctionRef.id,
            authorId: author.id,
            authorName: author.name,
            category: finalCategory,
            mapName: submission.mapName,
            mapVersion: submission.mapVersion,
            operation: "metadata",
            sha256: correctedSha256
        }
    });
    return {
        submission: {
            ...submission,
            id: correctionRef.id,
            submissionId: correctionRef.id,
            operation: "metadata",
            status: "approved",
            submittedBy: auth.currentUser.uid,
            submittedByName: displayNameForUser(auth.currentUser),
            authorId: author.id,
            authorName: author.name,
            category: finalCategory,
            storagePath,
            sourceRevisionId,
            sourceMapId: submission.mapId,
            sha256: correctedSha256
        },
        storagePath,
        revisionId: correctionRef.id,
        sha256: correctedSha256,
        correctionRef,
        contentBytes: new TextEncoder().encode(correctedXml).byteLength
    };
}

async function reviewSubmission(submissionId, approved) {
    const submission = adminData.submissions.find(item => item.id === submissionId);
    const card = adminCard(submissionId);
    if(!submission || !card) return;
    const reason = decisionReason(card, !approved);
    let author = null;
    let category = MAP_CATEGORY;
    if(approved) {
        author = selectedAuthor(card);
    }
    if(!await confirmAction(
        `${approved ? "Approve and publish" : "Deny"} ${submission.mapName}?`,
        {confirmLabel:approved ? "Approve and publish" : "Deny", danger:!approved}
    )) return;
    setAdminBusy(true);
    setAdminStatus(`${approved ? "Validating and publishing" : "Denying"} map submission…`);
    try {
        const reviewer = auth.currentUser;
        const serverOrigin = submission.operation === "server-review" ||
            String(submission.submittedBy || "").startsWith("server:");
        const originalRef = firestoreSdk.doc(firestore, "mapSubmissions", submissionId);
        const notificationRef = serverOrigin ? null : adminNotificationRef(submission.submittedBy);
        const draftRef = submission.reviewRevisionId ? firestoreSdk.doc(
            firestore, "mapSubmissions", submission.reviewRevisionId
        ) : null;
        const auditRef = adminAuditRef();
        const reviewed = approved ? await uploadReviewedRevision(submission, author) : null;
        const finalSubmission = approved ? reviewed.submission : null;
        const mapRef = approved ? firestoreSdk.doc(firestore, "maps", submission.mapId) : null;
        const resourcePath = approved ? activeResourcePath(
            finalSubmission.authorName, finalSubmission.category,
            finalSubmission.mapName, finalSubmission.mapVersion
        ) : "";
        const resourceRef = approved ? firestoreSdk.doc(
            firestore, "resourcePaths", resourceKey(resourcePath)
        ) : null;
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const originalSnapshot = await transaction.get(originalRef);
            if(!originalSnapshot.exists() || originalSnapshot.data().status !== "pending") {
                throw new Error("This submission has already been reviewed or removed.");
            }
            let previousMap = null;
            let preserveResourceReservation = false;
            let draftSnapshot = null;
            if(approved) {
                const [mapSnapshot, resourceSnapshot, loadedDraft] = await Promise.all([
                    transaction.get(mapRef),
                    transaction.get(resourceRef),
                    draftRef ? transaction.get(draftRef) : Promise.resolve(null)
                ]);
                draftSnapshot = loadedDraft;
                previousMap = mapSnapshot.exists() ? mapSnapshot.data() : null;
                if(submission.operation === "create" && previousMap) {
                    throw new Error("This new-map submission points at an existing map.");
                }
                if(submission.operation !== "create") {
                    if(!previousMap) throw new Error("The map being edited no longer exists.");
                    if(previousMap.activeRevisionId !== submission.sourceRevisionId) {
                        throw new Error("The map changed after this submission. Review a fresh edit instead.");
                    }
                }
                preserveResourceReservation = Boolean(
                    serverOrigin && resourceSnapshot.exists() &&
                    reviewed.revisionId === submission.sourceRevisionId &&
                    resourceSnapshot.data().mapId === submission.mapId &&
                    resourceSnapshot.data().revisionId === submission.sourceRevisionId
                );
                if(resourceSnapshot.exists() && !preserveResourceReservation) {
                    throw new Error("That author, category, map name, and version are already reserved.");
                }
                if(draftRef && (!draftSnapshot || !draftSnapshot.exists() ||
                   draftSnapshot.data().status !== "review-draft")) {
                    throw new Error("The saved review draft is missing or has already been used.");
                }
            } else if(draftRef) {
                draftSnapshot = await transaction.get(draftRef);
            }
            if(approved && reviewed.correctionRef) {
                transaction.set(reviewed.correctionRef, {
                    ...reviewed.submission,
                    submissionId: reviewed.revisionId,
                    contentBytes: reviewed.contentBytes,
                    createdAt: firestoreSdk.serverTimestamp(),
                    updatedAt: firestoreSdk.serverTimestamp(),
                    reviewedAt: firestoreSdk.serverTimestamp(),
                    reviewedBy: reviewer.uid,
                    reviewReason: reason
                });
            }
            if(draftRef && draftSnapshot && draftSnapshot.exists()) {
                transaction.update(draftRef, {
                    status: approved && reviewed.revisionId === submission.reviewRevisionId
                        ? "approved" : approved ? "superseded" : "denied",
                    reviewedAt: firestoreSdk.serverTimestamp(),
                    reviewedBy: reviewer.uid,
                    reviewReason: reason,
                    updatedAt: firestoreSdk.serverTimestamp()
                });
            }
            transaction.update(originalRef, {
                status: approved ? "approved" : "denied",
                finalRevisionId: approved ? reviewed.revisionId : "",
                reviewedAt: firestoreSdk.serverTimestamp(),
                reviewedBy: reviewer.uid,
                reviewReason: reason,
                updatedAt: firestoreSdk.serverTimestamp()
            });
            if(approved) {
                const mapData = {
                    mapId: submission.mapId,
                    status: "active",
                    authorId: finalSubmission.authorId,
                    authorName: finalSubmission.authorName,
                    category: finalSubmission.category,
                    mapName: finalSubmission.mapName,
                    mapVersion: finalSubmission.mapVersion,
                    activeRevisionId: reviewed.revisionId,
                    storagePath: reviewed.storagePath,
                    resourcePath,
                    recordKey: resourcePath,
                    ratingKey: previousMap && previousMap.ratingKey || submission.mapId,
                    previousRevisionId: previousMap && previousMap.activeRevisionId || "",
                    sha256: reviewed.sha256,
                    reviewSubmissionId: "",
                    updatedAt: firestoreSdk.serverTimestamp()
                };
                if(!previousMap) mapData.createdAt = firestoreSdk.serverTimestamp();
                transaction.set(mapRef, mapData, {merge: true});
                if(!preserveResourceReservation) {
                    transaction.set(resourceRef, {
                        resourceId: resourceKey(resourcePath),
                        resourcePath,
                        mapId: submission.mapId,
                        revisionId: reviewed.revisionId,
                        createdAt: firestoreSdk.serverTimestamp(),
                        updatedAt: firestoreSdk.serverTimestamp()
                    });
                }
            }
            if(notificationRef) {
                transaction.set(notificationRef, {
                    recipientUid: submission.submittedBy,
                    type: approved ? "map-approved" : "map-denied",
                    title: approved ? `${submission.mapName} was approved` : `${submission.mapName} was denied`,
                    body: approved
                        ? `${submission.mapName} is approved and will enter the server catalog.${reason ? ` Note: ${reason}` : ""}`
                        : `${submission.mapName} was denied. Reason: ${reason}`,
                    reason,
                    mapId: submission.mapId,
                    submissionId,
                    createdAt: firestoreSdk.serverTimestamp(),
                    readAt: null
                });
            }
            transaction.set(auditRef, {
                actorUid: reviewer.uid,
                actorName: displayNameForUser(reviewer),
                action: approved ? "map.approve" : "map.deny",
                targetType: "mapSubmission",
                targetId: submissionId,
                mapId: submission.mapId,
                reason,
                before: {status: "pending", authorId: submission.authorId, category: submission.category},
                after: approved ? {status: "approved", authorId: author.id, category} : {status: "denied"},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        setAdminStatus(serverOrigin
            ? approved ? "Map approved, published, and returned to server rotation."
                : "Map denied and kept out of server rotation."
            : approved ? "Map approved, published, and submitter notified."
                : "Map denied and submitter notified.");
    } finally {
        setAdminBusy(false);
    }
}

async function deleteReviewedMap(submissionId) {
    const submission = adminData.submissions.find(item => item.id === submissionId);
    const card = adminCard(submissionId);
    if(!submission || !card) return;
    const reason = decisionReason(card, true);
    if(!await confirmAction(
        `Permanently deny and delete ${submission.mapName}? This removes the map, ` +
        "its review history, reserved paths, and stored revisions. This cannot be undone.",
        {confirmLabel:"Deny and delete map", danger:true}
    )) return;
    setAdminBusy(true);
    setAdminStatus("Denying review and permanently deleting map…");
    try {
        const reviewer = auth.currentUser;
        const serverOrigin = submission.operation === "server-review" ||
            String(submission.submittedBy || "").startsWith("server:");
        const originalRef = firestoreSdk.doc(firestore, "mapSubmissions", submissionId);
        const mapRef = firestoreSdk.doc(firestore, "maps", submission.mapId);
        const submissionsQuery = firestoreSdk.query(
            firestoreSdk.collection(firestore, "mapSubmissions"),
            firestoreSdk.where("mapId", "==", submission.mapId)
        );
        const resourcesQuery = firestoreSdk.query(
            firestoreSdk.collection(firestore, "resourcePaths"),
            firestoreSdk.where("mapId", "==", submission.mapId)
        );
        const [submissionSnapshots, resourceSnapshots, mapSnapshot] = await Promise.all([
            firestoreSdk.getDocs(submissionsQuery),
            firestoreSdk.getDocs(resourcesQuery),
            firestoreSdk.getDoc(mapRef)
        ]);
        const submissionRefs = submissionSnapshots.docs.map(item => item.ref);
        if(!submissionRefs.some(reference => reference.path === originalRef.path)) {
            submissionRefs.push(originalRef);
        }
        const storagePaths = new Set(
            submissionSnapshots.docs.map(item => String(item.data().storagePath || "")).filter(Boolean)
        );
        if(mapSnapshot.exists() && mapSnapshot.data().storagePath) {
            storagePaths.add(String(mapSnapshot.data().storagePath));
        }
        const notificationRef = serverOrigin ? null : adminNotificationRef(submission.submittedBy);
        const auditRef = adminAuditRef();
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const [latestSubmission, latestMap] = await Promise.all([
                transaction.get(originalRef),
                transaction.get(mapRef)
            ]);
            if(!latestSubmission.exists() || latestSubmission.data().status !== "pending") {
                throw new Error("This submission has already been reviewed or removed.");
            }
            submissionRefs.forEach(reference => transaction.delete(reference));
            resourceSnapshots.docs.forEach(item => transaction.delete(item.ref));
            if(latestMap.exists()) transaction.delete(mapRef);
            if(notificationRef) {
                transaction.set(notificationRef, {
                    recipientUid: submission.submittedBy,
                    type: "map-deleted",
                    title: `${submission.mapName} was denied and deleted`,
                    body: `${submission.mapName} was denied and permanently deleted. Reason: ${reason}`,
                    reason,
                    mapId: submission.mapId,
                    submissionId,
                    createdAt: firestoreSdk.serverTimestamp(),
                    readAt: null
                });
            }
            transaction.set(auditRef, {
                actorUid: reviewer.uid,
                actorName: displayNameForUser(reviewer),
                action: "map.deny-delete",
                targetType: "map",
                targetId: submission.mapId,
                mapId: submission.mapId,
                reason,
                before: {
                    status: latestMap.exists() ? latestMap.data().status : "unpublished",
                    reviewStatus: "pending",
                    submissionCount: submissionRefs.length,
                    resourcePathCount: resourceSnapshots.size
                },
                after: {status: "deleted"},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        const storagePathList = Array.from(storagePaths);
        const removals = await Promise.allSettled(storagePathList.map(storagePath =>
            storageSdk.deleteObject(storageSdk.ref(storage, storagePath))
        ));
        const failedRemovals = removals.filter(result =>
            result.status === "rejected" &&
            result.reason && result.reason.code !== "storage/object-not-found"
        );
        setAdminStatus(failedRemovals.length
            ? `Map deleted from the catalog; ${failedRemovals.length} orphaned storage object(s) require cleanup.`
            : "Map review denied and map permanently deleted.",
        failedRemovals.length ? "error" : "");
    } finally {
        setAdminBusy(false);
    }
}

async function editPublishedMapMetadata(mapId) {
    const map = adminData.maps.find(item => item.id === mapId);
    const card = adminCard(mapId);
    if(!map || !card) return;
    const author = selectedAuthor(card);
    const category = MAP_CATEGORY;
    if(author.id === map.authorId && category === map.category) {
        throw new Error("Change the author before saving a metadata revision.");
    }
    if(!await confirmAction(
        `Publish an admin metadata revision for ${map.mapName}?`,
        {confirmLabel:"Publish revision"}
    )) return;
    setAdminBusy(true);
    setAdminStatus("Creating immutable metadata revision…");
    try {
        const xml = await downloadRepositoryMap(map.storagePath);
        const mapVersion = bumpMapVersion(map.mapVersion);
        const correctedXml = rewriteResourceIdentity(xml, {
            author: author.name,
            category,
            version: mapVersion
        });
        const sha256 = await sha256Hex(correctedXml);
        const submissionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
        const storagePath = revisionStoragePath(
            auth.currentUser.uid, submissionRef.id, map.mapName, mapVersion
        );
        await storageSdk.uploadString(storageSdk.ref(storage, storagePath), correctedXml, "raw", {
            contentType: "application/xml; charset=UTF-8",
            customMetadata: {
                ownerUid: auth.currentUser.uid,
                submissionId: submissionRef.id,
                authorId: author.id,
                authorName: author.name,
                category,
                mapName: map.mapName,
                mapVersion,
                operation: "metadata",
                sha256
            }
        });
        const auditRef = adminAuditRef();
        const mapRef = firestoreSdk.doc(firestore, "maps", mapId);
        const resourcePath = activeResourcePath(author.name, category, map.mapName, mapVersion);
        const resourceRef = firestoreSdk.doc(firestore, "resourcePaths", resourceKey(resourcePath));
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const [mapSnapshot, resourceSnapshot] = await Promise.all([
                transaction.get(mapRef),
                transaction.get(resourceRef)
            ]);
            if(!mapSnapshot.exists() || mapSnapshot.data().activeRevisionId !== map.activeRevisionId) {
                throw new Error("This map changed before the correction could be published. Refresh and try again.");
            }
            if(resourceSnapshot.exists()) {
                throw new Error("The corrected resource path is already reserved.");
            }
            transaction.set(submissionRef, {
                submissionId: submissionRef.id,
                mapId,
                operation: "metadata",
                status: "approved",
                submittedBy: auth.currentUser.uid,
                submittedByName: displayNameForUser(auth.currentUser),
                authorId: author.id,
                authorName: author.name,
                category,
                mapName: map.mapName,
                mapVersion,
                storagePath,
                sourceRevisionId: map.activeRevisionId,
                sourceMapId: mapId,
                sha256,
                contentBytes: new TextEncoder().encode(correctedXml).byteLength,
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp(),
                reviewedAt: firestoreSdk.serverTimestamp(),
                reviewedBy: auth.currentUser.uid,
                reviewReason: "Admin metadata correction"
            });
            transaction.update(mapRef, {
                authorId: author.id,
                authorName: author.name,
                category,
                mapVersion,
                activeRevisionId: submissionRef.id,
                storagePath,
                resourcePath,
                previousRevisionId: map.activeRevisionId,
                recordKey: map.recordKey || map.resourcePath,
                sha256,
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.set(resourceRef, {
                resourceId: resourceKey(resourcePath),
                resourcePath,
                mapId,
                revisionId: submissionRef.id,
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.set(auditRef, {
                actorUid: auth.currentUser.uid,
                actorName: displayNameForUser(auth.currentUser),
                action: "map.metadata",
                targetType: "map",
                targetId: mapId,
                before: {authorId: map.authorId, authorName: map.authorName, category: map.category, mapVersion: map.mapVersion},
                after: {authorId: author.id, authorName: author.name, category, mapVersion},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        setAdminStatus("Map author/category correction published as a new revision.");
    } finally {
        setAdminBusy(false);
    }
}

async function editPendingSubmission(submissionId) {
    const submission = adminData.submissions.find(item => item.id === submissionId);
    const card = adminCard(submissionId);
    if(!submission || !card) return;
    const author = selectedAuthor(card);
    const category = MAP_CATEGORY;
    if(!await confirmAction(
        `Edit ${submission.mapName} inside Vectron? This replaces your current local draft.`,
        {confirmLabel:"Open in Vectron"}
    )) return;

    setAdminBusy(true);
    setAdminStatus("Opening the pending revision in Vectron…");
    try {
        const xml = await downloadRepositoryMap(submission.storagePath);
        const parsed = $.parseXML(xml);
        const resource = parsed.documentElement;
        if(!resource || resource.tagName.toLocaleLowerCase() !== "resource" ||
           resource.getAttribute("type") !== "aamap") {
            throw new Error("The pending revision is not an Armagetron map resource.");
        }
        const sourceName = safeMapName(resource.getAttribute("name") || submission.mapName);
        const sourceVersion = normalizeMapVersion(resource.getAttribute("version"));
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        try {
            if(typeof window.vectron_resetForInitialMap === "function") {
                window.vectron_resetForInitialMap();
            } else {
                window.aamap_objects = [];
            }
            window.xml_process(xml);
            setRepositoryEditState({
                sourcePath: submission.storagePath,
                sourceName,
                sourceVersion,
                sourceCategory: category,
                targetAuthor: author.name,
                targetAuthorId: author.id,
                sourceOwnerUid: submission.submittedBy || "",
                mapId: submission.mapId,
                sourceRevisionId: submission.sourceRevisionId || "",
                reviewSubmissionId: submission.id,
                reviewSourceOperation: submission.operation || "edit",
                reviewDecisionReason: decisionReason(card, false)
            });
            const nextVersion = submission.operation === "server-review"
                ? await nextAvailableReviewVersion(
                    author.name, category, sourceName, sourceVersion
                )
                : sourceVersion;
            setCurrentMapName(sourceName);
            setCurrentMapVersion(nextVersion);
            syncMapMetadata(auth.currentUser);
            if(typeof window.vectron_localDraftSaveNow === "function") {
                window.vectron_localDraftSaveNow();
            }
        } catch(processError) {
            if(typeof window.vectron_localDraftRestore === "function") {
                window.vectron_localDraftRestore();
            }
            throw processError;
        }
        setAdminStatus("");
        closeAdmin();
        showEditorMessage(
            `Editing pending review for ${sourceName}. Save a draft, or save, approve, and publish in one step when ready.`
        );
    } finally {
        setAdminBusy(false);
    }
}

async function reopenReviewHistory(submissionId) {
    const history = adminData.history.find(item => item.id === submissionId);
    if(!history) return;
    if(!await confirmAction(
        `Reopen the ${history.status} review for ${history.mapName}? ` +
        "This creates a new pending review and replaces your current local draft.",
        {confirmLabel:"Reopen and edit"}
    )) return;

    setAdminBusy(true);
    setAdminStatus("Creating a new review from this historical revision…");
    try {
        const xml = await downloadRepositoryMap(history.storagePath);
        const historicalSha256 = await sha256Hex(xml);
        if(history.sha256 && history.sha256 !== historicalSha256) {
            throw new Error("The historical revision checksum does not match its review record.");
        }
        const parsed = $.parseXML(xml);
        const resource = parsed.documentElement;
        if(!resource || resource.tagName.toLocaleLowerCase() !== "resource" ||
           resource.getAttribute("type") !== "aamap") {
            throw new Error("The historical revision is not an Armagetron map resource.");
        }
        const mapId = String(history.mapId || "");
        if(!mapId) throw new Error("This historical review is not linked to a map record.");
        const mapRef = firestoreSdk.doc(firestore, "maps", mapId);
        const initialMapSnapshot = await firestoreSdk.getDoc(mapRef);
        const initialMap = initialMapSnapshot.exists() && initialMapSnapshot.data().status === "active"
            ? initialMapSnapshot.data() : null;
        const operation = initialMap ? "edit" : "create";
        const sourceRevisionId = initialMap ? initialMap.activeRevisionId : "";
        const author = normalizeAuthorName(history.authorName || resource.getAttribute("author"));
        const authorId = String(history.authorId || authorKey(author));
        const category = MAP_CATEGORY;
        const mapName = safeMapName(history.mapName || resource.getAttribute("name"));
        const startingVersion = normalizeMapVersion(
            initialMap && initialMap.mapVersion || history.mapVersion || resource.getAttribute("version")
        );
        let mapVersion = startingVersion;
        const initialResourcePath = activeResourcePath(author, category, mapName, mapVersion);
        const initialReservation = await firestoreSdk.getDoc(firestoreSdk.doc(
            firestore, "resourcePaths", resourceKey(initialResourcePath)
        ));
        if(initialMap || initialReservation.exists()) {
            mapVersion = await nextAvailableReviewVersion(author, category, mapName, startingVersion);
        }
        const reopenedXml = rewriteResourceIdentity(xml, {
            author, category, name: mapName, version: mapVersion
        });
        const sha256 = await sha256Hex(reopenedXml);
        const revisionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
        const storagePath = revisionStoragePath(
            auth.currentUser.uid, revisionRef.id, mapName, mapVersion
        );
        await storageSdk.uploadString(storageSdk.ref(storage, storagePath), reopenedXml, "raw", {
            contentType: "application/xml; charset=UTF-8",
            customMetadata: {
                ownerUid: auth.currentUser.uid,
                submissionId: revisionRef.id,
                authorId,
                authorName: author,
                category,
                mapName,
                mapVersion,
                operation: "history-reopen",
                sha256
            }
        });
        const historicalRef = firestoreSdk.doc(firestore, "mapSubmissions", history.id);
        const resourcePath = activeResourcePath(author, category, mapName, mapVersion);
        const resourceRef = firestoreSdk.doc(firestore, "resourcePaths", resourceKey(resourcePath));
        const auditRef = adminAuditRef();
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const [historicalSnapshot, latestMapSnapshot, resourceSnapshot] = await Promise.all([
                transaction.get(historicalRef),
                transaction.get(mapRef),
                transaction.get(resourceRef)
            ]);
            if(!historicalSnapshot.exists() ||
               !["approved", "denied"].includes(historicalSnapshot.data().status)) {
                throw new Error("This review is no longer available in history.");
            }
            const latestMap = latestMapSnapshot.exists() && latestMapSnapshot.data().status === "active"
                ? latestMapSnapshot.data() : null;
            if(Boolean(latestMap) !== Boolean(initialMap) ||
               latestMap && latestMap.activeRevisionId !== sourceRevisionId) {
                throw new Error("The published map changed while the history was being reopened.");
            }
            if(resourceSnapshot.exists()) {
                throw new Error("That author, category, map name, and version became reserved. Try again.");
            }
            transaction.set(revisionRef, {
                submissionId: revisionRef.id,
                mapId,
                operation,
                status: "pending",
                submittedBy: auth.currentUser.uid,
                submittedByName: displayNameForUser(auth.currentUser),
                authorId,
                authorName: author,
                category,
                mapName,
                mapVersion,
                storagePath,
                sourceRevisionId,
                sourceMapId: initialMap ? mapId : "",
                historySourceSubmissionId: history.id,
                submissionReason: `Reopened from the ${history.status} review decided ${formatTimestamp(history.reviewedAt || history.updatedAt)}.`,
                sha256,
                contentBytes: new TextEncoder().encode(reopenedXml).byteLength,
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.set(auditRef, {
                actorUid: auth.currentUser.uid,
                actorName: displayNameForUser(auth.currentUser),
                action: "map.review.reopen",
                targetType: "mapSubmission",
                targetId: revisionRef.id,
                mapId,
                before: {submissionId: history.id, status: history.status},
                after: {submissionId: revisionRef.id, status: "pending", sourceRevisionId},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        try {
            if(typeof window.vectron_resetForInitialMap === "function") {
                window.vectron_resetForInitialMap();
            } else {
                window.aamap_objects = [];
            }
            window.xml_process(reopenedXml);
            setRepositoryEditState({
                sourcePath: storagePath,
                sourceName: mapName,
                sourceVersion: mapVersion,
                sourceCategory: category,
                targetAuthor: author,
                targetAuthorId: authorId,
                sourceOwnerUid: auth.currentUser.uid,
                mapId,
                sourceRevisionId,
                reviewSubmissionId: revisionRef.id,
                reviewSourceOperation: operation,
                reviewDecisionReason: history.reviewReason || ""
            });
            setCurrentMapName(mapName);
            setCurrentMapVersion(mapVersion);
            syncMapMetadata(auth.currentUser);
            if(typeof window.vectron_localDraftSaveNow === "function") {
                window.vectron_localDraftSaveNow();
            }
        } catch(processError) {
            if(typeof window.vectron_localDraftRestore === "function") {
                window.vectron_localDraftRestore();
            }
            throw processError;
        }
        setAdminStatus("");
        closeAdmin();
        showEditorMessage(
            `${mapName} was reopened as a new pending review. Edit it, then save or publish when ready.`
        );
    } finally {
        setAdminBusy(false);
    }
}

async function handleAdminAction(action, id) {
    if(adminBusy || !currentUserIsAdmin()) return;
    setAdminStatus("");
    try {
        if(action === "approve-account") await reviewAccount(id);
        else if(action === "deny-account") await denyRegistration(id);
        else if(action === "approve-submission") await reviewSubmission(id, true);
        else if(action === "deny-submission") await reviewSubmission(id, false);
        else if(action === "delete-submission-map") await deleteReviewedMap(id);
        else if(action === "edit-submission") await editPendingSubmission(id);
        else if(action === "reopen-history") await reopenReviewHistory(id);
        else if(action === "edit-map-metadata") await editPublishedMapMetadata(id);
    } catch(error) {
        console.error("Vectron admin action failed.", error);
        setAdminStatus(error && error.message ? error.message : "The admin action failed.", "error");
        setAdminBusy(false);
    }
}

function setCurrentMapVersion(version) {
    const normalized = normalizeMapVersion(version);
    const versionInput = document.getElementById("map_version");
    if(versionInput) versionInput.value = normalized;
    window.xml_version = normalized;
    return normalized;
}

function setCurrentMapName(name) {
    const normalized = safeMapName(name);
    const nameInput = document.getElementById("map_name");
    if(nameInput) nameInput.value = normalized;
    window.xml_name = normalized;
    return normalized;
}

function nextAvailableMapVersion(author, mapName, startingVersion, bumpFirst) {
    let version = bumpFirst ? bumpMapVersion(startingVersion) : normalizeMapVersion(startingVersion);
    const occupied = new Set(repositoryMaps.map(map => map.resourcePath || map.fullPath));
    let attempts = 0;
    while(occupied.has(activeResourcePath(author, MAP_CATEGORY, mapName, version)) && attempts < 1000) {
        version = bumpMapVersion(version);
        attempts += 1;
    }
    if(attempts >= 1000) throw new Error("Could not find an available map version.");
    return version;
}

async function nextAvailableReviewVersion(author, category, mapName, startingVersion) {
    // Start with the revision we opened. A fresh server review still points at
    // the published (reserved) version and will advance once. A saved review
    // draft already using an unreserved bumped version should keep that version
    // when an admin reopens it instead of advancing on every edit session.
    let version = normalizeMapVersion(startingVersion);
    for(let attempts = 0; attempts < 1000; attempts += 1) {
        const path = activeResourcePath(author, category, mapName, version);
        const reservation = await firestoreSdk.getDoc(firestoreSdk.doc(
            firestore, "resourcePaths", resourceKey(path)
        ));
        if(!reservation.exists()) return version;
        version = bumpMapVersion(version);
    }
    throw new Error("Could not find an available map version for this review.");
}

function uploadAuthorFor(user, editState = null) {
    const signedInAuthor = sessionAuthorName(user);
    if(editState && (editState.targetAuthor === signedInAuthor || currentUserIsAdmin())) {
        return editState.targetAuthor;
    }
    return signedInAuthor;
}

function mapUploadMetadata(user, submissionId, authorId, author, category, mapName, mapVersion, operation, sha256) {
    const remixIdentity = currentRemixIdentity();
    return {
        ownerUid: user.uid,
        submissionId,
        editorUid: user.uid,
        editorRole: currentUserRole,
        authorId,
        authorName: author,
        category,
        mapName,
        mapVersion,
        sha256,
        isRemix: remixIdentity ? "true" : "false",
        remixDepth: remixIdentity ? String(remixIdentity.depth) : "0",
        remixOriginalName: remixIdentity ? remixIdentity.originalName : "",
        operation
    };
}

async function sha256Hex(value) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function showEditorMessage(message) {
    if(typeof window.gui_toast === "function") window.gui_toast(message);
    else {
        console.info(message);
        if(status) setStatus(message);
    }
}

function showMapFileCommand(mapName, mapVersion, storagePath) {
    if(!mapFileCommandOverlay || !mapFileCommandValue) return "";
    const command = mapFileCommand(
        FIREBASE_CONFIG.storageBucket,
        storagePath,
        mapName,
        mapVersion
    );
    mapFileCommandValue.value = command;
    mapFileCommandOverlay.hidden = false;
    mapFileCommandValue.focus();
    mapFileCommandValue.select();
    return command;
}

function closeMapFileCommand() {
    if(mapFileCommandOverlay) mapFileCommandOverlay.hidden = true;
}

async function copyMapFileCommand() {
    if(!mapFileCommandValue || !mapFileCommandValue.value) return;
    try {
        await navigator.clipboard.writeText(mapFileCommandValue.value);
    } catch(error) {
        mapFileCommandValue.focus();
        mapFileCommandValue.select();
        document.execCommand("copy");
    }
    showEditorMessage("MAP_FILE command copied.");
}

function friendlyUploadError(error) {
    const code = error && error.code ? error.code : "";
    const messages = {
        "storage/already-exists": "That map name and version already exist. Choose a different version.",
        "storage/unauthorized": "Your account is not approved or linked to this author.",
        "storage/retry-limit-exceeded": "The upload timed out. Check your connection and retry.",
        "storage/quota-exceeded": "Map storage is temporarily full.",
        "storage/unknown": "The map could not be uploaded. Please try again."
    };
    return messages[code] || "The map could not be uploaded. Please try again.";
}

async function savePendingReviewDraft(
    user, editState, authorId, author, category, mapName, mapVersion, map, sha256, publish = false
) {
    if(!currentUserIsAdmin() || !editState.reviewSubmissionId) {
        throw new Error("Only an admin can save changes to a pending review.");
    }
    category = MAP_CATEGORY;
    const originalRef = firestoreSdk.doc(
        firestore, "mapSubmissions", editState.reviewSubmissionId
    );
    const revisionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
    const objectPath = revisionStoragePath(
        user.uid, revisionRef.id, mapName, mapVersion
    );
    const resourcePath = activeResourcePath(author, category, mapName, mapVersion);
    const resourceRef = firestoreSdk.doc(firestore, "resourcePaths", resourceKey(resourcePath));
    const serverOrigin = editState.reviewSourceOperation === "server-review" ||
        String(editState.sourceOwnerUid || "").startsWith("server:");
    const notificationRef = publish && !serverOrigin && editState.sourceOwnerUid
        ? adminNotificationRef(editState.sourceOwnerUid) : null;
    const reviewReason = String(editState.reviewDecisionReason || "").trim();
    uploadBusy = true;
    if(uploadButton) {
        uploadButton.classList.add("auth-uploading");
        uploadButton.setAttribute("aria-busy", "true");
    }
    if(reviewPublishButton) {
        reviewPublishButton.classList.add("auth-uploading");
        reviewPublishButton.setAttribute("aria-busy", "true");
        reviewPublishButton.disabled = true;
    }
    showEditorMessage(publish
        ? "Saving the edited revision, approving it, and publishing…"
        : "Saving an immutable draft to this review…");
    try {
        await storageSdk.uploadString(storageSdk.ref(storage, objectPath), map.xml, "raw", {
            contentType: "application/xml; charset=UTF-8",
            customMetadata: mapUploadMetadata(
                user, revisionRef.id, authorId, author, category,
                mapName, mapVersion, "review-edit", sha256
            )
        });
        const auditRef = adminAuditRef();
        const mapRef = firestoreSdk.doc(firestore, "maps", editState.mapId);
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const originalSnapshot = await transaction.get(originalRef);
            if(!originalSnapshot.exists() || originalSnapshot.data().status !== "pending") {
                throw new Error("This review has already been decided or removed.");
            }
            const original = originalSnapshot.data();
            if(original.mapId !== editState.mapId ||
               original.sourceRevisionId !== editState.sourceRevisionId ||
               original.storagePath !== editState.sourcePath ||
               String(original.submittedBy || "") !== String(editState.sourceOwnerUid || "")) {
                throw new Error("This review changed after you opened it. Open the newest draft and try again.");
            }
            const priorDraftRef = original.reviewRevisionId ? firestoreSdk.doc(
                firestore, "mapSubmissions", original.reviewRevisionId
            ) : null;
            const [mapSnapshot, priorDraftSnapshot, resourceSnapshot] = await Promise.all([
                transaction.get(mapRef),
                priorDraftRef ? transaction.get(priorDraftRef) : Promise.resolve(null),
                publish ? transaction.get(resourceRef) : Promise.resolve(null)
            ]);
            const previousMap = mapSnapshot.exists() ? mapSnapshot.data() : null;
            if(original.operation === "create" && previousMap) {
                throw new Error("This new-map review now points at an existing map.");
            }
            if(original.operation !== "create") {
                if(!previousMap || previousMap.activeRevisionId !== original.sourceRevisionId) {
                    throw new Error("The published map changed while this review was open.");
                }
            }
            if(priorDraftRef && (!priorDraftSnapshot || !priorDraftSnapshot.exists() ||
               priorDraftSnapshot.data().status !== "review-draft")) {
                throw new Error("The previous review draft is no longer editable.");
            }
            if(publish && resourceSnapshot && resourceSnapshot.exists()) {
                throw new Error("That author, category, map name, and version are already reserved.");
            }
            transaction.set(revisionRef, {
                submissionId: revisionRef.id,
                mapId: editState.mapId,
                operation: "review-edit",
                status: publish ? "approved" : "review-draft",
                submittedBy: user.uid,
                submittedByName: displayNameForUser(user),
                authorId,
                authorName: author,
                category,
                mapName,
                mapVersion,
                storagePath: objectPath,
                sourceRevisionId: original.sourceRevisionId || "",
                sourceMapId: editState.mapId,
                sourceSubmissionId: editState.reviewSubmissionId,
                sha256,
                contentBytes: new TextEncoder().encode(map.xml).byteLength,
                reviewedAt: publish ? firestoreSdk.serverTimestamp() : null,
                reviewedBy: publish ? user.uid : "",
                reviewReason: publish ? reviewReason : "",
                createdAt: firestoreSdk.serverTimestamp(),
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.update(originalRef, {
                authorId,
                authorName: author,
                category,
                mapName,
                mapVersion,
                storagePath: objectPath,
                sha256,
                contentBytes: new TextEncoder().encode(map.xml).byteLength,
                reviewRevisionId: revisionRef.id,
                reviewEditedAt: firestoreSdk.serverTimestamp(),
                reviewEditedBy: user.uid,
                status: publish ? "approved" : "pending",
                finalRevisionId: publish ? revisionRef.id : "",
                reviewedAt: publish ? firestoreSdk.serverTimestamp() : null,
                reviewedBy: publish ? user.uid : "",
                reviewReason: publish ? reviewReason : "",
                updatedAt: firestoreSdk.serverTimestamp()
            });
            if(priorDraftRef) {
                transaction.update(priorDraftRef, {
                    status: "superseded",
                    updatedAt: firestoreSdk.serverTimestamp()
                });
            }
            if(publish) {
                const mapData = {
                    mapId: editState.mapId,
                    status: "active",
                    authorId,
                    authorName: author,
                    category,
                    mapName,
                    mapVersion,
                    activeRevisionId: revisionRef.id,
                    storagePath: objectPath,
                    resourcePath,
                    recordKey: resourcePath,
                    ratingKey: previousMap && previousMap.ratingKey || editState.mapId,
                    previousRevisionId: previousMap && previousMap.activeRevisionId || "",
                    sha256,
                    reviewSubmissionId: "",
                    updatedAt: firestoreSdk.serverTimestamp()
                };
                if(!previousMap) mapData.createdAt = firestoreSdk.serverTimestamp();
                transaction.set(mapRef, mapData, {merge: true});
                transaction.set(resourceRef, {
                    resourceId: resourceKey(resourcePath),
                    resourcePath,
                    mapId: editState.mapId,
                    revisionId: revisionRef.id,
                    createdAt: firestoreSdk.serverTimestamp(),
                    updatedAt: firestoreSdk.serverTimestamp()
                });
                if(notificationRef) {
                    transaction.set(notificationRef, {
                        recipientUid: editState.sourceOwnerUid,
                        type: "map-approved",
                        title: `${mapName} was approved`,
                        body: `${mapName} is approved and will enter the server catalog.${reviewReason ? ` Note: ${reviewReason}` : ""}`,
                        reason: reviewReason,
                        mapId: editState.mapId,
                        submissionId: editState.reviewSubmissionId,
                        createdAt: firestoreSdk.serverTimestamp(),
                        readAt: null
                    });
                }
            }
            transaction.set(auditRef, {
                actorUid: user.uid,
                actorName: displayNameForUser(user),
                action: publish ? "map.review.edit-approve" : "map.review.edit",
                targetType: "mapSubmission",
                targetId: editState.reviewSubmissionId,
                mapId: editState.mapId,
                before: {
                    revisionId: original.reviewRevisionId || original.sourceRevisionId ||
                        editState.reviewSubmissionId
                },
                after: {
                    revisionId: revisionRef.id, authorId, category, mapVersion,
                    status: publish ? "approved" : "review-draft"
                },
                reason: publish ? reviewReason : "",
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        clearRepositoryEditState();
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        showEditorMessage(publish
            ? `${mapName} changes were saved, approved, and published.`
            : `${mapName} review changes were saved. Return to Vectron review to approve or deny them.`);
        showMapFileCommand(mapName, mapVersion, objectPath);
    } finally {
        uploadBusy = false;
        if(uploadButton) {
            uploadButton.classList.remove("auth-uploading");
            uploadButton.removeAttribute("aria-busy");
        }
        if(reviewPublishButton) {
            reviewPublishButton.classList.remove("auth-uploading");
            reviewPublishButton.removeAttribute("aria-busy");
        }
        updateUploadButtonLabel();
    }
}

async function uploadCurrentMap(options = {}) {
    if(uploadBusy) return;
    if(guestMode) {
        showEditorMessage("Sign in or create an account to upload maps.");
        return;
    }
    const user = auth && auth.currentUser;
    if(!user || authorNameError(user.displayName)) {
        showEditorMessage("Set your Vectron author name before uploading.");
        return;
    }
    if(!accountCanSubmit()) {
        const reason = currentAccount && currentAccount.status === "denied"
            ? ` Your registration was denied: ${currentAccount.denialReason || "No reason was provided."}`
            : " An admin must approve and link your registration first.";
        showEditorMessage(`You can browse maps and keep editing locally, but you cannot submit yet.${reason}`);
        return;
    }
    if(!storage || !storageSdk || typeof window.eventHandler_getExportMap !== "function") {
        showEditorMessage("Map storage is not ready yet. Please try again.");
        return;
    }

    syncMapMetadata(user);
    const editState = getRepositoryEditState();
    const publishReview = options.publishReview === true;
    if(publishReview && (!editState || !editState.reviewSubmissionId || !currentUserIsAdmin())) {
        showEditorMessage("Open a pending review before using save, approve, and publish.");
        return;
    }
    if(publishReview && !await confirmAction(
        "Save these changes, approve this review, and publish the map now?",
        {confirmLabel:"Save, approve, and publish"}
    )) return;
    const author = uploadAuthorFor(user, editState);
    const authorId = editState ? editState.targetAuthorId : currentAccount.authorId;
    const category = MAP_CATEGORY;
    const mapName = setCurrentMapName(document.getElementById("map_name").value);
    const mapVersion = setCurrentMapVersion(document.getElementById("map_version").value);
    syncMapMetadata(user);
    const map = window.eventHandler_getExportMap();
    const sha256 = await sha256Hex(map.xml);
    if(editState && editState.reviewSubmissionId) {
        try {
            await savePendingReviewDraft(
                user, editState, authorId, author, category,
                mapName, mapVersion, map, sha256, publishReview
            );
        } catch(error) {
            console.error("Vectron review edit failed.", error);
            showEditorMessage(error && error.message ? error.message : friendlyUploadError(error));
        }
        return;
    }
    const submissionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
    const mapId = editState ? editState.mapId :
        firestoreSdk.doc(firestoreSdk.collection(firestore, "maps")).id;
    const operation = editState ? "edit" : "create";
    const objectPath = revisionStoragePath(
        user.uid, submissionRef.id, mapName, mapVersion
    );

    uploadBusy = true;
    if(uploadButton) {
        uploadButton.classList.add("auth-uploading");
        uploadButton.setAttribute("aria-busy", "true");
    }
    showEditorMessage("Submitting map for admin review…");

    try {
        const mapRef = storageSdk.ref(storage, objectPath);
        await storageSdk.uploadString(mapRef, map.xml, "raw", {
            contentType: "application/xml; charset=UTF-8",
            customMetadata: mapUploadMetadata(
                user, submissionRef.id, authorId, author, category, mapName, mapVersion, operation, sha256
            )
        });
        await firestoreSdk.setDoc(submissionRef, {
            submissionId: submissionRef.id,
            mapId,
            operation,
            status: "pending",
            submittedBy: user.uid,
            submittedByName: sessionAuthorName(user),
            authorId,
            authorName: author,
            category,
            mapName,
            mapVersion,
            storagePath: objectPath,
            sourceRevisionId: editState ? editState.sourceRevisionId : "",
            sourceMapId: editState ? editState.mapId : "",
            sha256,
            contentBytes: new TextEncoder().encode(map.xml).byteLength,
            createdAt: firestoreSdk.serverTimestamp(),
            updatedAt: firestoreSdk.serverTimestamp()
        });
        if(editState) clearRepositoryEditState();
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        showEditorMessage(`${mapName} was submitted for admin review. You’ll be notified when it is approved or denied.`);
        showMapFileCommand(mapName, mapVersion, objectPath);
    } catch(error) {
        console.error("Vectron map upload failed.", error);
        showEditorMessage(friendlyUploadError(error));
    } finally {
        uploadBusy = false;
        if(uploadButton) {
            uploadButton.classList.remove("auth-uploading");
            uploadButton.removeAttribute("aria-busy");
        }
    }
}

window.vectron_uploadCurrentMap = uploadCurrentMap;

function repositoryMapDetails(snapshot) {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        mapId: snapshot.id,
        fullPath: data.storagePath,
        storagePath: data.storagePath,
        resourcePath: data.resourcePath || activeResourcePath(
            data.authorName, data.category, data.mapName, data.mapVersion
        ),
        authorId: data.authorId,
        author: data.authorName || "Unknown",
        category: data.category || MAP_CATEGORY,
        mapName: data.mapName || "Untitled map",
        mapVersion: normalizeMapVersion(data.mapVersion),
        name: `${data.mapName || "Untitled map"} · ${normalizeMapVersion(data.mapVersion)}`,
        activeRevisionId: data.activeRevisionId || "",
        ownerUid: data.ownerUid || ""
    };
}

async function downloadRepositoryMap(fullPath) {
    const objectUrl = new URL(
        `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(FIREBASE_CONFIG.storageBucket)}/o/${encodeURIComponent(fullPath)}`
    );
    objectUrl.searchParams.set("alt", "media");
    const headers = {};
    if(auth && auth.currentUser) {
        const idToken = await authSdk.getIdToken(auth.currentUser);
        headers.Authorization = `Firebase ${idToken}`;
    }
    const response = await fetch(objectUrl, {headers});
    if(!response.ok) {
        const error = new Error(`Repository download failed (${response.status}).`);
        if(response.status === 401 || response.status === 403) error.code = "storage/unauthorized";
        throw error;
    }
    const contentLength = Number(response.headers.get("content-length")) || 0;
    if(contentLength > MAX_MAP_BYTES) throw new Error("Repository map is too large.");
    const bytes = await response.arrayBuffer();
    if(bytes.byteLength > MAX_MAP_BYTES) throw new Error("Repository map is too large.");
    return new TextDecoder().decode(bytes);
}

function setRepositoryStatus(message, type = "") {
    repositoryStatus.textContent = message || "";
    repositoryStatus.className = `repository-status${type ? ` ${type}` : ""}`;
    repositoryStatus.hidden = !message;
    if(!message) delete repositoryStatus.dataset.errorDetail;
}

function setRepositoryBusy(nextBusy) {
    repositoryBusy = nextBusy;
    repositoryRefreshButton.disabled = nextBusy;
    repositorySearchInput.disabled = nextBusy && !repositoryMaps.length;
    repositoryList.querySelectorAll(".repository-remix-button").forEach(button => {
        button.disabled = nextBusy;
    });
    repositoryList.querySelectorAll("[data-repository-author]").forEach(button => {
        button.disabled = nextBusy;
    });
}

function repositoryCurrentAuthor() {
    return sessionAuthorName();
}

function repositoryMapIsMine(map) {
    return Boolean(map && auth && auth.currentUser &&
        (map.ownerUid === auth.currentUser.uid ||
          currentAccount && map.authorId === currentAccount.authorId));
}

function repositoryMapCanEdit(map) {
    return Boolean(accountCanSubmit() && map && !map.category.includes("/") &&
        (repositoryMapIsMine(map) || currentUserIsAdmin()));
}

function repositoryCanRead() {
    return Boolean(storage && storageSdk && firestore && firestoreSdk);
}

function setRepositoryTab(nextTab, focusTab = false) {
    repositoryTab = guestMode || nextTab === "others" ? "others" : "mine";
    repositoryTabs.forEach(tab => {
        const selected = tab.dataset.repositoryTab === repositoryTab;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        if(selected && focusTab) tab.focus();
    });
    if(repositoryMaps.length) renderRepositoryMaps();
}

function renderRepositoryMaps() {
    const mine = repositoryMaps.filter(repositoryMapIsMine);
    const others = repositoryMaps.filter(map => !repositoryMapIsMine(map));
    repositoryMineCount.textContent = String(mine.length);
    repositoryOthersCount.textContent = String(others.length);
    const tabMaps = repositoryTab === "mine" ? mine : others;
    const query = repositorySearchInput.value.trim().toLocaleLowerCase();
    const visibleMaps = tabMaps.filter(map => {
        if(!query) return true;
        return `${map.name} ${map.author} ${map.category} ${map.resourcePath}`
            .toLocaleLowerCase()
            .includes(query);
    });
    const authors = new Map();
    visibleMaps.forEach(map => {
        if(!authors.has(map.author)) authors.set(map.author, []);
        authors.get(map.author).push(map);
    });

    repositoryList.replaceChildren();
    repositorySummary.textContent = repositoryMaps.length
        ? `Showing ${visibleMaps.length} of ${tabMaps.length} ${repositoryTab === "mine" ? "your" : "other"} ${tabMaps.length === 1 ? "map" : "maps"}${authors.size ? ` across ${authors.size} ${authors.size === 1 ? "author" : "authors"}` : ""}.`
        : "No repository maps loaded.";

    if(!visibleMaps.length) {
        const empty = document.createElement("div");
        empty.className = "repository-empty";
        if(query && tabMaps.length) empty.textContent = "No maps match that search.";
        else if(repositoryMaps.length && repositoryTab === "mine") empty.textContent = "You haven't uploaded any maps yet.";
        else if(repositoryMaps.length) empty.textContent = "There aren't any maps from other authors yet.";
        else empty.textContent = "The repository does not contain any maps yet.";
        repositoryList.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    Array.from(authors.keys()).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}))
        .forEach((author, authorIndex) => {
            const maps = authors.get(author);
            const group = document.createElement("section");
            group.className = "repository-author-group";
            const collapsible = repositoryTab === "others";
            const expanded = !collapsible || Boolean(query) || repositoryExpandedAuthors.has(author);
            group.classList.toggle("collapsed", !expanded);

            const heading = document.createElement(collapsible ? "button" : "header");
            heading.className = "repository-author-heading";
            if(collapsible) {
                heading.type = "button";
                heading.dataset.repositoryAuthor = author;
                heading.disabled = repositoryBusy;
                heading.setAttribute("aria-expanded", String(expanded));
                heading.setAttribute("aria-controls", `repository-author-maps-${authorIndex}`);
            }
            const authorName = document.createElement("span");
            authorName.textContent = author;
            const count = document.createElement("span");
            count.className = "repository-author-count";
            count.append(document.createTextNode(`${maps.length} ${maps.length === 1 ? "map" : "maps"}`));
            if(collapsible) {
                const chevron = document.createElement("i");
                chevron.className = "fa-solid fa-chevron-down";
                chevron.setAttribute("aria-hidden", "true");
                count.appendChild(chevron);
            }
            heading.append(authorName, count);
            group.appendChild(heading);

            const mapList = document.createElement("div");
            mapList.className = "repository-author-maps";
            mapList.id = `repository-author-maps-${authorIndex}`;
            mapList.hidden = !expanded;

            maps.forEach(map => {
                const row = document.createElement("div");
                row.className = "repository-map-row";
                const copy = document.createElement("span");
                copy.className = "repository-map-copy";
                const name = document.createElement("strong");
                name.textContent = map.name;
                const path = document.createElement("small");
                path.textContent = map.resourcePath;
                copy.append(name, path);

                const actions = document.createElement("span");
                actions.className = "repository-map-actions";
                const addAction = action => {
                    const button = document.createElement("button");
                    const editing = action === "edit";
                    button.className = "repository-remix-button";
                    button.type = "button";
                    button.dataset.repositoryOpen = map.fullPath;
                    button.dataset.repositoryAction = action;
                    button.disabled = repositoryBusy;
                    button.innerHTML = editing
                        ? '<i class="fa-solid fa-pen" aria-hidden="true"></i><span>Edit</span>'
                        : '<i class="fa-solid fa-code-branch" aria-hidden="true"></i><span>Remix</span>';
                    button.setAttribute("aria-label", `${editing ? "Edit" : "Remix"} ${map.name} by ${map.author}`);
                    actions.appendChild(button);
                };
                if(repositoryMapCanEdit(map)) addAction("edit");
                if(!repositoryMapIsMine(map) || currentUserIsAdmin()) addAction("remix");
                row.append(copy, actions);
                mapList.appendChild(row);
            });
            group.appendChild(mapList);
            fragment.appendChild(group);
        });
    repositoryList.appendChild(fragment);
}

async function refreshRepositoryMaps() {
    if(repositoryBusy || !repositoryCanRead()) return;
    let shouldRender = false;
    setRepositoryBusy(true);
    setRepositoryStatus("Loading repository maps…");
    try {
        const snapshot = await firestoreSdk.getDocs(firestoreSdk.query(
            firestoreSdk.collection(firestore, "maps"),
            firestoreSdk.where("status", "==", "active")
        ));
        repositoryMaps = snapshot.docs.map(repositoryMapDetails)
            .sort((a, b) => a.author.localeCompare(b.author, undefined, {sensitivity: "base"}) ||
                a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
        setRepositoryStatus("");
        shouldRender = true;
    } catch(error) {
        console.error("Vectron repository listing failed.", error);
        setRepositoryStatus(
            error && error.code === "storage/unauthorized"
                ? "Your account cannot read the map repository."
                : "The map repository could not be loaded. Try refreshing.",
            "error"
        );
        repositorySummary.textContent = "Repository unavailable.";
    } finally {
        setRepositoryBusy(false);
        if(shouldRender) renderRepositoryMaps();
    }
}

function openRepository() {
    if(!repositoryCanRead()) {
        showEditorMessage("The map repository is not ready yet.");
        return;
    }
    repositorySearchInput.value = "";
    repositoryExpandedAuthors.clear();
    setRepositoryTab(guestMode ? "others" : "mine");
    repositoryPreviousFocus = document.activeElement;
    repositoryOverlay.hidden = false;
    repositoryButton.setAttribute("aria-expanded", "true");
    window.setTimeout(() => repositorySearchInput.focus(), 0);
    if(repositoryMaps.length) renderRepositoryMaps();
    else refreshRepositoryMaps();
}

function closeRepository() {
    if(repositoryOverlay.hidden) return;
    repositoryOverlay.hidden = true;
    repositoryButton.setAttribute("aria-expanded", "false");
    if(repositoryPreviousFocus && typeof repositoryPreviousFocus.focus === "function") {
        repositoryPreviousFocus.focus();
    }
}

async function openRepositoryMap(fullPath, requestedAction) {
    if(repositoryBusy || !repositoryCanRead()) return;
    const map = repositoryMaps.find(candidate => candidate.fullPath === fullPath);
    if(!map) return;
    const editing = requestedAction === "edit" && repositoryMapCanEdit(map);
    const remixing = requestedAction === "remix";
    if(!editing && !remixing) return;
    const action = editing ? "Edit" : "Remix";
    if(!await confirmAction(
        `${action} ${map.name} by ${map.author}? This replaces your current local draft.`,
        {confirmLabel:action}
    )) return;

    setRepositoryBusy(true);
    setRepositoryStatus(`Preparing ${map.name} to ${action.toLocaleLowerCase()}…`);
    try {
        const xml = await downloadRepositoryMap(fullPath);
        const parsed = $.parseXML(xml);
        const resource = parsed.documentElement;
        if(!resource || resource.tagName.toLocaleLowerCase() !== "resource" ||
           resource.getAttribute("type") !== "aamap") {
            throw new Error("The selected file is not an Armagetron map resource.");
        }
        const sourceName = safeMapName(resource.getAttribute("name") || map.name);
        const sourceVersion = normalizeMapVersion(resource.getAttribute("version"));
        const sourceOwnerUid = map.ownerUid;

        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        try {
            if(typeof window.vectron_resetForInitialMap === "function") {
                window.vectron_resetForInitialMap();
            } else {
                window.aamap_objects = [];
            }
            window.xml_process(xml);
            let nextVersion;
            if(editing) {
                setRepositoryEditState({
                    sourcePath: map.fullPath,
                    sourceName,
                    sourceVersion,
                    sourceCategory: map.category,
                    targetAuthor: map.author,
                    targetAuthorId: map.authorId,
                    sourceOwnerUid,
                    mapId: map.mapId,
                    sourceRevisionId: map.activeRevisionId
                });
                const editName = setCurrentMapName(document.getElementById("map_name").value);
                nextVersion = nextAvailableMapVersion(
                    map.author, editName, sourceVersion, true
                );
            } else {
                clearRepositoryEditState();
                if(typeof window.xml_appendRemixSource !== "function") {
                    throw new Error("Remix provenance is unavailable.");
                }
                window.xml_appendRemixSource({
                    map: resource.getAttribute("name") || map.name,
                    author: resource.getAttribute("author") || map.author,
                    version: resource.getAttribute("version") || "",
                    path: map.fullPath
                });
                syncMapMetadata(auth && auth.currentUser);
                const remixName = document.getElementById("map_name").value;
                const remixAuthor = guestMode ? "Guest" : sessionAuthorName(auth.currentUser);
                nextVersion = nextAvailableMapVersion(
                    remixAuthor, remixName, sourceVersion, false
                );
            }
            setCurrentMapVersion(nextVersion);
            syncMapMetadata(auth && auth.currentUser);
            if(typeof window.vectron_localDraftSaveNow === "function") {
                window.vectron_localDraftSaveNow();
            }
        } catch(processError) {
            if(typeof window.vectron_localDraftRestore === "function") {
                window.vectron_localDraftRestore();
            }
            throw processError;
        }
        setRepositoryStatus("");
        closeRepository();
        showEditorMessage(editing
            ? `Editing ${sourceName}${map.author === sessionAuthorName(auth.currentUser) ? "" : ` by ${map.author}`}. Version bumped to ${document.getElementById("map_version").value}.`
            : `Remixing ${map.name} by ${map.author} as ${document.getElementById("map_name").value}.`);
    } catch(error) {
        console.error(`Vectron repository map ${action.toLocaleLowerCase()} failed.`, error);
        repositoryStatus.dataset.errorDetail = error && error.message ? error.message : String(error);
        setRepositoryStatus(
            error && error.code === "storage/unauthorized"
                ? "Your account cannot read that map."
                : `That map could not be ${editing ? "edited" : "remixed"}. Your current work was kept.`,
            "error"
        );
    } finally {
        setRepositoryBusy(false);
    }
}

window.vectron_openMapRepository = openRepository;

function bindUi() {
    loginTab.addEventListener("click", () => setMode("login"));
    signupTab.addEventListener("click", () => setMode("signup"));
    form.addEventListener("submit", handleSubmit);
    forgotButton.addEventListener("click", handlePasswordReset);
    guestButton.addEventListener("click", enterGuestMode);
    retryButton.addEventListener("click", () => window.location.reload());
    profileForm.addEventListener("submit", handleProfileSubmit);
    profileSignout.addEventListener("click", () => authSdk && authSdk.signOut(auth));
    if(uploadButton) {
        uploadButton.addEventListener("click", event => {
            event.preventDefault();
            uploadCurrentMap();
        });
    }
    if(reviewPublishButton) {
        reviewPublishButton.addEventListener("click", event => {
            event.preventDefault();
            uploadCurrentMap({publishReview: true});
        });
    }
    if(mapFileCommandClose) mapFileCommandClose.addEventListener("click", closeMapFileCommand);
    if(mapFileCommandCopy) mapFileCommandCopy.addEventListener("click", copyMapFileCommand);
    if(mapFileCommandOverlay) {
        mapFileCommandOverlay.addEventListener("mousedown", event => {
            if(event.target === mapFileCommandOverlay) closeMapFileCommand();
        });
        mapFileCommandOverlay.addEventListener("keydown", event => {
            if(event.key === "Escape") closeMapFileCommand();
        });
    }
    if(repositoryButton) {
        repositoryButton.addEventListener("click", event => {
            event.preventDefault();
            openRepository();
        });
    }
    repositoryCloseButton.addEventListener("click", closeRepository);
    repositoryRefreshButton.addEventListener("click", refreshRepositoryMaps);
    repositorySearchInput.addEventListener("input", renderRepositoryMaps);
    repositoryTabs.forEach(tab => {
        tab.addEventListener("click", () => setRepositoryTab(tab.dataset.repositoryTab));
        tab.addEventListener("keydown", event => {
            if(!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const nextTab = event.key === "ArrowLeft" || event.key === "Home" ? "mine" : "others";
            setRepositoryTab(nextTab, true);
        });
    });
    repositoryList.addEventListener("click", event => {
        const authorToggle = event.target.closest("[data-repository-author]");
        if(authorToggle) {
            const author = authorToggle.dataset.repositoryAuthor;
            if(repositoryExpandedAuthors.has(author)) repositoryExpandedAuthors.delete(author);
            else repositoryExpandedAuthors.add(author);
            renderRepositoryMaps();
            const nextToggle = Array.from(repositoryList.querySelectorAll("[data-repository-author]"))
                .find(button => button.dataset.repositoryAuthor === author);
            if(nextToggle) nextToggle.focus();
            return;
        }
        const button = event.target.closest("[data-repository-open]");
        if(button) openRepositoryMap(button.dataset.repositoryOpen, button.dataset.repositoryAction);
    });
    repositoryOverlay.addEventListener("mousedown", event => {
        if(event.target === repositoryOverlay) closeRepository();
    });
    repositoryOverlay.addEventListener("keydown", event => {
        if(event.key === "Escape") {
            event.preventDefault();
            closeRepository();
        }
    });
    if(notificationButton) notificationButton.addEventListener("click", openNotifications);
    if(notificationCloseButton) notificationCloseButton.addEventListener("click", closeNotifications);
    if(notificationMarkReadButton) notificationMarkReadButton.addEventListener("click", markAllNotificationsRead);
    if(notificationOverlay) {
        notificationOverlay.addEventListener("mousedown", event => {
            if(event.target === notificationOverlay) closeNotifications();
        });
        notificationOverlay.addEventListener("keydown", event => {
            if(event.key === "Escape") closeNotifications();
        });
    }
    if(adminButton) adminButton.addEventListener("click", openAdmin);
    if(adminCloseButton) adminCloseButton.addEventListener("click", closeAdmin);
    if(adminRefreshButton) adminRefreshButton.addEventListener("click", startAdminListeners);
    if(adminSearchInput) adminSearchInput.addEventListener("input", renderAdminList);
    adminTabs.forEach(tab => tab.addEventListener("click", () => setAdminTab(tab.dataset.adminTab)));
    if(adminList) adminList.addEventListener("click", event => {
        const button = event.target.closest("[data-admin-action]");
        if(button) handleAdminAction(button.dataset.adminAction, button.dataset.adminId);
    });
    if(adminOverlay) {
        adminOverlay.addEventListener("mousedown", event => {
            if(event.target === adminOverlay) closeAdmin();
        });
        adminOverlay.addEventListener("keydown", event => {
            if(event.key === "Escape") closeAdmin();
        });
    }
    if(confirmCancelButton) confirmCancelButton.addEventListener("click", () => settleConfirmation(false));
    if(confirmAcceptButton) confirmAcceptButton.addEventListener("click", () => settleConfirmation(true));
    document.addEventListener("mousedown", event => {
        if(confirmPopover && !confirmPopover.hidden &&
           !confirmPopover.contains(event.target) &&
           !(confirmAnchor && confirmAnchor.contains && confirmAnchor.contains(event.target))) {
            settleConfirmation(false);
        }
    });
    document.addEventListener("keydown", event => {
        if(event.key === "Escape" && confirmPopover && !confirmPopover.hidden) {
            event.preventDefault();
            event.stopPropagation();
            settleConfirmation(false);
        }
    }, true);
    if(adminDialog) {
        const header = adminDialog.querySelector(".repository-header");
        header.addEventListener("mousedown", event => {
            if(event.button !== 0 || event.target.closest("button,input,select,textarea,a")) return;
            anchorAdminDialog();
            const rect = adminDialog.getBoundingClientRect();
            adminDragging = {
                offsetX:event.clientX - rect.left,
                offsetY:event.clientY - rect.top
            };
            event.preventDefault();
        });
        document.addEventListener("mousemove", event => {
            if(!adminDragging) return;
            const rect = adminDialog.getBoundingClientRect();
            const margin = 12;
            const left = Math.max(margin, Math.min(
                event.clientX - adminDragging.offsetX,
                window.innerWidth - Math.min(rect.width, 120) - margin
            ));
            const top = Math.max(margin, Math.min(
                event.clientY - adminDragging.offsetY,
                window.innerHeight - Math.min(rect.height, 80) - margin
            ));
            adminDialog.style.left = `${Math.round(left)}px`;
            adminDialog.style.top = `${Math.round(top)}px`;
        });
        document.addEventListener("mouseup", () => { adminDragging = null; });
    }
    window.addEventListener("resize", () => {
        positionConfirmationPopover();
        clampAdminDialog();
    });
    document.querySelectorAll("[data-auth-signout]").forEach(button => {
        button.addEventListener("click", handleSignOut);
    });
    document.querySelectorAll("[data-auth-password-toggle]").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.authPasswordToggle);
            if(!input) return;
            const showing = input.type === "text";
            input.type = showing ? "password" : "text";
            button.setAttribute("aria-pressed", String(!showing));
            button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
            const icon = button.querySelector("i");
            if(icon) icon.className = showing ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
            input.focus();
        });
    });

    ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "wheel"].forEach(type => {
        gate.addEventListener(type, event => event.stopPropagation());
    });
}

async function initializeAuthentication() {
    setEditorInert(true);
    bindUi();
    setMode("login");

    try {
        const [appModule, loadedAuthSdk, loadedStorageSdk, loadedFirestoreSdk] = await Promise.all([
            import(FIREBASE_APP_URL),
            import(FIREBASE_AUTH_URL),
            import(FIREBASE_STORAGE_URL),
            import(FIREBASE_FIRESTORE_URL)
        ]);
        authSdk = loadedAuthSdk;
        storageSdk = loadedStorageSdk;
        firestoreSdk = loadedFirestoreSdk;
        const app = appModule.initializeApp(FIREBASE_CONFIG);
        auth = authSdk.getAuth(app);
        storage = storageSdk.getStorage(app);
        firestore = firestoreSdk.getFirestore(app);

        try {
            await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
        } catch(localPersistenceError) {
            await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
        }

        auth.useDeviceLanguage();
        authSdk.onAuthStateChanged(auth, async user => {
            if(!user) {
                if(!guestMode) lockEditor();
                return;
            }
            if(authorNameError(user.displayName)) {
                showProfileCompletion(user);
                return;
            }
            try {
                await loadAccountSession(user);
                unlockEditor(user);
                if(currentAccount.status === "pending") {
                    showEditorMessage("Your registration is awaiting admin approval. You can browse maps and edit locally in the meantime.");
                } else if(currentAccount.status === "denied") {
                    showEditorMessage(`Your registration was denied: ${currentAccount.denialReason || "No reason was provided."}`);
                }
            } catch(error) {
                console.error("Vectron account session failed to initialize.", error);
                showFatal(friendlyAuthError(error));
            }
        }, error => {
            if(!guestMode) showFatal(friendlyAuthError(error));
        });
    } catch(error) {
        console.error("Vectron authentication failed to initialize.", error);
        if(!guestMode) showFatal("Account services are unavailable. Check your connection, then try again.");
    }
}

initializeAuthentication();
