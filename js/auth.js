import {
    MAP_CATEGORY,
    MAX_MAP_BYTES,
    activeResourcePath,
    authorKey,
    authorNameError,
    bumpMapVersion,
    categoryError,
    formatTimestamp,
    normalizeAuthorName,
    normalizeCategory,
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
let adminData = {accounts: [], submissions: [], maps: [], authors: []};
let adminTab = "accounts";
let adminBusy = false;
let overlayPreviousFocus = null;

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
    if(currentAccount && currentAccount.status === "pending") return "pending";
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
    if(!uploadButton) return;
    const label = uploadButton.querySelector("span");
    const reviewing = Boolean(repositoryEditState && repositoryEditState.reviewSubmissionId);
    if(label) label.textContent = reviewing ? "Save review changes" :
        repositoryEditState ? "Submit edit" : "Upload";
    uploadButton.title = reviewing ? "Save changes to this pending review" :
        repositoryEditState ? "Submit edited map" : "Upload map";
    uploadButton.setAttribute("aria-label", uploadButton.title);
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
    const signedInAuthor = sessionAuthorName();
    if(!sourcePath || !rawSourceName || !sourceCategory || sourceCategory.includes("/") ||
       !targetAuthor || targetAuthor.includes("/") || !targetAuthorId || !mapId) return null;
    if(signedInAuthor && targetAuthor !== signedInAuthor && !currentUserIsAdmin()) return null;
    return {
        sourcePath, sourceName, sourceVersion, sourceCategory, targetAuthor,
        targetAuthorId, sourceOwnerUid, mapId, sourceRevisionId,
        reviewSubmissionId, reviewSourceOperation
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
    const category = repositoryEditState && currentUserIsAdmin()
        ? repositoryEditState.sourceCategory
        : MAP_CATEGORY;
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
    if(hasUnsavedWork() && !window.confirm("Sign out of Vectron? Your in-progress map is saved locally and will be restored when you return.")) {
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
        window.alert(friendlyAuthError(error));
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
    adminData = {accounts: [], submissions: [], maps: [], authors: []};
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
        currentAccount.status === "pending" ? "pending" :
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
}

function setAdminCollection(key, snapshot) {
    adminData[key] = snapshot.docs.map(item => ({id: item.id, ...item.data()}));
    updateAdminBadge();
    if(adminOverlay && !adminOverlay.hidden) renderAdminList();
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
    reason.placeholder = "Required when denying";
    reason.dataset.adminReason = "";
    fields.append(
        cardField("Link to author", authorSelect),
        cardField("New/requested author name", newName),
        cardField("Decision reason", reason)
    );
    const actions = document.createElement("div");
    actions.className = "account-card-actions";
    actions.append(
        actionButton("Deny registration", "deny-account", account.id, true),
        actionButton("Approve and link", "approve-account", account.id)
    );
    card.append(header, meta, fields, actions);
    return card;
}

function renderAdminSubmission(submission) {
    const card = document.createElement("article");
    card.className = "account-card";
    card.dataset.adminCard = submission.id;
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
    const fields = document.createElement("div");
    fields.className = "account-card-fields";
    const authorSelect = adminAuthorOptions(submission.authorId);
    authorSelect.dataset.adminAuthor = "";
    const category = document.createElement("input");
    category.value = submission.category || MAP_CATEGORY;
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
    actions.className = "account-card-actions";
    actions.append(
        actionButton("Edit map in Vectron", "edit-submission", submission.id),
        actionButton("Deny submission", "deny-submission", submission.id, true),
        actionButton("Approve and publish", "approve-submission", submission.id)
    );
    card.append(header, meta, fields, actions);
    return card;
}

function renderAdminMap(map) {
    const card = document.createElement("article");
    card.className = "account-card";
    card.dataset.adminCard = map.id;
    const header = document.createElement("div");
    header.className = "account-card-header";
    const name = document.createElement("strong");
    name.textContent = `${map.mapName || "Untitled"} · ${map.mapVersion || ""}`;
    const path = document.createElement("span");
    path.className = "account-card-time";
    path.textContent = map.resourcePath || "";
    header.append(name, path);
    const fields = document.createElement("div");
    fields.className = "account-card-fields";
    const authorSelect = adminAuthorOptions(map.authorId);
    authorSelect.dataset.adminAuthor = "";
    const category = document.createElement("input");
    category.value = map.category || MAP_CATEGORY;
    category.dataset.adminCategory = "";
    fields.append(cardField("Author", authorSelect), cardField("Category", category));
    const actions = document.createElement("div");
    actions.className = "account-card-actions";
    actions.append(actionButton("Save metadata revision", "edit-map-metadata", map.id));
    card.append(header, fields, actions);
    return card;
}

function renderAdminList() {
    const items = adminData[adminTab] || [];
    const query = adminSearchInput.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => !query || JSON.stringify(item).toLocaleLowerCase().includes(query));
    adminList.replaceChildren();
    adminSummary.textContent = `${visible.length} of ${items.length} ${adminTab === "accounts" ? "pending registrations" : adminTab === "submissions" ? "pending map submissions" : "published maps"}.`;
    if(!visible.length) {
        const empty = document.createElement("div");
        empty.className = "repository-empty";
        empty.textContent = query ? "Nothing in this queue matches your search." :
            adminTab === "maps" ? "No published maps are in the catalog." : "This review queue is clear.";
        adminList.appendChild(empty);
        return;
    }
    const renderer = adminTab === "accounts" ? renderAdminAccount :
        adminTab === "submissions" ? renderAdminSubmission : renderAdminMap;
    const fragment = document.createDocumentFragment();
    visible.forEach(item => fragment.appendChild(renderer(item)));
    adminList.appendChild(fragment);
}

function setAdminTab(value) {
    adminTab = ["accounts", "submissions", "maps"].includes(value) ? value : "accounts";
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
    adminButton.setAttribute("aria-expanded", "true");
    adminSearchInput.value = "";
    setAdminTab(adminTab);
    window.setTimeout(() => adminSearchInput.focus(), 0);
}

function closeAdmin() {
    if(adminOverlay.hidden) return;
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

async function reviewAccount(accountId, approved) {
    const account = adminData.accounts.find(item => item.id === accountId);
    const card = adminCard(accountId);
    if(!account || !card) return;
    const reason = decisionReason(card, !approved);
    const author = approved ? selectedAuthor(card, account.requestedAuthorName) : null;
    const reviewer = auth.currentUser;
    if(!window.confirm(`${approved ? "Approve" : "Deny"} registration for ${account.requestedAuthorName || account.email}?`)) return;
    setAdminBusy(true);
    setAdminStatus(`${approved ? "Approving" : "Denying"} registration…`);
    try {
        const accountRef = firestoreSdk.doc(firestore, "accounts", accountId);
        const notificationRef = adminNotificationRef(accountId);
        const auditRef = adminAuditRef();
        await firestoreSdk.runTransaction(firestore, async transaction => {
            const accountSnapshot = await transaction.get(accountRef);
            if(!accountSnapshot.exists() || accountSnapshot.data().status !== "pending") {
                throw new Error("This registration has already been reviewed or removed.");
            }
            if(approved) {
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
            }
            transaction.update(accountRef, {
                status: approved ? "approved" : "denied",
                authorId: approved ? author.id : firestoreSdk.deleteField(),
                authorName: approved ? author.name : firestoreSdk.deleteField(),
                denialReason: approved ? "" : reason,
                reviewedAt: firestoreSdk.serverTimestamp(),
                reviewedBy: reviewer.uid,
                updatedAt: firestoreSdk.serverTimestamp()
            });
            transaction.set(notificationRef, {
                recipientUid: accountId,
                type: approved ? "registration-approved" : "registration-denied",
                title: approved ? "Vectron registration approved" : "Vectron registration denied",
                body: approved
                    ? `Your account is approved and linked to the ${author.name} author.`
                    : `Your registration was denied. Reason: ${reason}`,
                reason,
                createdAt: firestoreSdk.serverTimestamp(),
                readAt: null
            });
            transaction.set(auditRef, {
                actorUid: reviewer.uid,
                actorName: displayNameForUser(reviewer),
                action: approved ? "account.approve" : "account.deny",
                targetType: "account",
                targetId: accountId,
                reason,
                after: approved ? {status: "approved", authorId: author.id, authorName: author.name} : {status: "denied"},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        setAdminStatus(approved ? "Registration approved and author linked." : "Registration denied and user notified.");
    } finally {
        setAdminBusy(false);
    }
}

async function uploadReviewedRevision(submission, author, category) {
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
    const finalCategory = normalizeCategory(category);
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
    const storagePath = revisionStoragePath(auth.currentUser.uid, correctionRef.id);
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
    let category = submission.category;
    if(approved) {
        author = selectedAuthor(card);
        const categoryInput = card.querySelector("[data-admin-category]");
        const categoryIssue = categoryError(categoryInput && categoryInput.value);
        if(categoryIssue) throw new Error(categoryIssue);
        category = normalizeCategory(categoryInput.value);
    }
    if(!window.confirm(`${approved ? "Approve and publish" : "Deny"} ${submission.mapName}?`)) return;
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
        const reviewed = approved ? await uploadReviewedRevision(submission, author, category) : null;
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

async function editPublishedMapMetadata(mapId) {
    const map = adminData.maps.find(item => item.id === mapId);
    const card = adminCard(mapId);
    if(!map || !card) return;
    const author = selectedAuthor(card);
    const categoryInput = card.querySelector("[data-admin-category]");
    const categoryIssue = categoryError(categoryInput && categoryInput.value);
    if(categoryIssue) throw new Error(categoryIssue);
    const category = normalizeCategory(categoryInput.value);
    if(author.id === map.authorId && category === map.category) {
        throw new Error("Change the author or category before saving a metadata revision.");
    }
    if(!window.confirm(`Publish an admin metadata revision for ${map.mapName}?`)) return;
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
        const storagePath = revisionStoragePath(auth.currentUser.uid, submissionRef.id);
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
    const categoryInput = card.querySelector("[data-admin-category]");
    const categoryIssue = categoryError(categoryInput && categoryInput.value);
    if(categoryIssue) throw new Error(categoryIssue);
    const category = normalizeCategory(categoryInput.value);
    if(!window.confirm(
        `Edit ${submission.mapName} inside Vectron? This replaces your current local draft.`
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
                reviewSourceOperation: submission.operation || "edit"
            });
            const nextVersion = submission.operation === "server-review" &&
                !submission.reviewRevisionId
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
            `Editing pending review for ${sourceName}. Save review changes when ready, then approve it from the review queue.`
        );
    } finally {
        setAdminBusy(false);
    }
}

async function handleAdminAction(action, id) {
    if(adminBusy || !currentUserIsAdmin()) return;
    setAdminStatus("");
    try {
        if(action === "approve-account") await reviewAccount(id, true);
        else if(action === "deny-account") await reviewAccount(id, false);
        else if(action === "approve-submission") await reviewSubmission(id, true);
        else if(action === "deny-submission") await reviewSubmission(id, false);
        else if(action === "edit-submission") await editPendingSubmission(id);
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
    let version = bumpMapVersion(startingVersion);
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
    else window.alert(message);
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
    user, editState, authorId, author, category, mapName, mapVersion, map, sha256
) {
    if(!currentUserIsAdmin() || !editState.reviewSubmissionId) {
        throw new Error("Only an admin can save changes to a pending review.");
    }
    const originalRef = firestoreSdk.doc(
        firestore, "mapSubmissions", editState.reviewSubmissionId
    );
    const revisionRef = firestoreSdk.doc(firestoreSdk.collection(firestore, "mapSubmissions"));
    const objectPath = revisionStoragePath(user.uid, revisionRef.id);
    uploadBusy = true;
    if(uploadButton) {
        uploadButton.classList.add("auth-uploading");
        uploadButton.setAttribute("aria-busy", "true");
    }
    showEditorMessage("Saving an immutable draft to this review…");
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
               original.storagePath !== editState.sourcePath) {
                throw new Error("This review changed after you opened it. Open the newest draft and try again.");
            }
            const priorDraftRef = original.reviewRevisionId ? firestoreSdk.doc(
                firestore, "mapSubmissions", original.reviewRevisionId
            ) : null;
            const [mapSnapshot, priorDraftSnapshot] = await Promise.all([
                transaction.get(mapRef),
                priorDraftRef ? transaction.get(priorDraftRef) : Promise.resolve(null)
            ]);
            if(original.operation !== "create") {
                if(!mapSnapshot.exists() ||
                   mapSnapshot.data().activeRevisionId !== original.sourceRevisionId) {
                    throw new Error("The published map changed while this review was open.");
                }
            }
            if(priorDraftRef && (!priorDraftSnapshot || !priorDraftSnapshot.exists() ||
               priorDraftSnapshot.data().status !== "review-draft")) {
                throw new Error("The previous review draft is no longer editable.");
            }
            transaction.set(revisionRef, {
                submissionId: revisionRef.id,
                mapId: editState.mapId,
                operation: "review-edit",
                status: "review-draft",
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
                updatedAt: firestoreSdk.serverTimestamp()
            });
            if(priorDraftRef) {
                transaction.update(priorDraftRef, {
                    status: "superseded",
                    updatedAt: firestoreSdk.serverTimestamp()
                });
            }
            transaction.set(auditRef, {
                actorUid: user.uid,
                actorName: displayNameForUser(user),
                action: "map.review.edit",
                targetType: "mapSubmission",
                targetId: editState.reviewSubmissionId,
                mapId: editState.mapId,
                before: {revisionId: original.reviewRevisionId || original.sourceRevisionId || original.id},
                after: {revisionId: revisionRef.id, authorId, category, mapVersion},
                createdAt: firestoreSdk.serverTimestamp()
            });
        });
        clearRepositoryEditState();
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        showEditorMessage(
            `${mapName} review changes were saved. Return to Vectron review to approve or deny them.`
        );
    } finally {
        uploadBusy = false;
        if(uploadButton) {
            uploadButton.classList.remove("auth-uploading");
            uploadButton.removeAttribute("aria-busy");
        }
    }
}

async function uploadCurrentMap() {
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
    const author = uploadAuthorFor(user, editState);
    const authorId = editState ? editState.targetAuthorId : currentAccount.authorId;
    const category = editState && currentUserIsAdmin()
        ? normalizeCategory(document.getElementById("map_category").value)
        : MAP_CATEGORY;
    const mapName = setCurrentMapName(document.getElementById("map_name").value);
    const mapVersion = setCurrentMapVersion(document.getElementById("map_version").value);
    syncMapMetadata(user);
    const map = window.eventHandler_getExportMap();
    const sha256 = await sha256Hex(map.xml);
    if(editState && editState.reviewSubmissionId) {
        try {
            await savePendingReviewDraft(
                user, editState, authorId, author, category,
                mapName, mapVersion, map, sha256
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
    const objectPath = revisionStoragePath(user.uid, submissionRef.id);

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
    if(!window.confirm(`${action} ${map.name} by ${map.author}? This replaces your current local draft.`)) return;

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
