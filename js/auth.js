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
const MAP_CATEGORY = "maps";

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
const repositoryMineCount = document.getElementById("map-repository-mine-count");
const repositoryOthersCount = document.getElementById("map-repository-others-count");

let auth = null;
let authSdk = null;
let storage = null;
let storageSdk = null;
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

function authorNameError(value) {
    const name = String(value || "").trim();
    if(name.length < 2) return "Choose an author name with at least 2 characters.";
    if(name.length > 60) return "Keep your author name to 60 characters or fewer.";
    if(!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) {
        return "Use letters, numbers, spaces, periods, hyphens, or underscores.";
    }
    return "";
}

function setBusy(nextBusy) {
    busy = nextBusy;
    submitButton.disabled = nextBusy;
    submitButton.classList.toggle("busy", nextBusy);
    forgotButton.disabled = nextBusy;
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
    return String(value || "").toLocaleLowerCase() === "admin" ? "admin" : "user";
}

function currentUserIsAdmin() {
    return currentUserRole === "admin";
}

function setCurrentUserRole(value) {
    currentUserRole = normalizeUserRole(value);
    window.vectron_userRole = currentUserRole;
    document.documentElement.dataset.userRole = currentUserRole;
    document.querySelectorAll("[data-auth-role]").forEach(element => {
        element.textContent = currentUserRole === "admin" ? "Admin" : "User";
        element.dataset.role = currentUserRole;
    });
    return currentUserRole;
}

async function refreshCurrentUserRole(user) {
    const token = await authSdk.getIdTokenResult(user, true);
    const claims = token.claims || {};
    return setCurrentUserRole(claims.admin === true ? "admin" : claims.role);
}

function syncSessionControls(user) {
    const displayName = displayNameForUser(user);
    document.querySelectorAll("[data-auth-name]").forEach(element => {
        element.textContent = displayName;
    });
    document.querySelectorAll("[data-auth-email]").forEach(element => {
        element.textContent = user.email || "Signed in";
    });
    document.querySelectorAll("[data-auth-avatar]").forEach(element => {
        element.textContent = initialsForName(displayName);
    });
    setCurrentUserRole(currentUserRole);
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
    if(label) label.textContent = repositoryEditState ? "Submit edit" : "Upload";
    uploadButton.title = repositoryEditState ? "Submit edited map" : "Upload map";
    uploadButton.setAttribute("aria-label", uploadButton.title);
}

function normalizeRepositoryEditState(value) {
    if(!value || typeof value !== "object") return null;
    const sourcePath = String(value.sourcePath || "");
    const rawSourceName = String(value.sourceName || "").trim();
    const sourceName = safeMapName(rawSourceName);
    const sourceVersion = normalizeMapVersion(value.sourceVersion);
    const sourceCategory = String(value.sourceCategory || MAP_CATEGORY);
    const targetAuthor = String(value.targetAuthor || sourcePath.split("/")[0] || "").trim();
    const sourceOwnerUid = String(value.sourceOwnerUid || "");
    const signedInAuthor = auth && auth.currentUser && auth.currentUser.displayName
        ? auth.currentUser.displayName.trim()
        : "";
    if(!sourcePath || !rawSourceName || !sourceCategory || sourceCategory.includes("/") ||
       !targetAuthor || targetAuthor.includes("/") ||
       !sourcePath.startsWith(`${targetAuthor}/${sourceCategory}/`)) return null;
    if(signedInAuthor && targetAuthor !== signedInAuthor && !currentUserIsAdmin()) return null;
    return {sourcePath, sourceName, sourceVersion, sourceCategory, targetAuthor, sourceOwnerUid};
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
    if(!user || authorNameError(user.displayName)) return;
    const signedInAuthor = user.displayName.trim();
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
    window.xml_category = MAP_CATEGORY;
    window.vectron_mapAuthor = author;
    window.vectron_mapCategory = MAP_CATEGORY;

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
        authorInput.title = author === signedInAuthor
            ? "Locked to your Vectron author name"
            : "Locked to the map author's repository directory for this admin edit";
    }
    if(categoryInput) {
        categoryInput.value = MAP_CATEGORY;
        categoryInput.readOnly = true;
        categoryInput.setAttribute("aria-readonly", "true");
        categoryInput.title = "Uploaded maps always use the maps category";
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

function unlockEditor(user) {
    const editorAlreadyStarted = window.vectron_started === true;
    const userChanged = typeof window.vectron_localDraftSetUser === "function"
        ? window.vectron_localDraftSetUser(user.uid)
        : false;
    syncSessionControls(user);
    syncMapMetadata(user);
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

function lockEditor() {
    if(repositoryOverlay && !repositoryOverlay.hidden) closeRepository();
    if(typeof window.vectron_localDraftSetUser === "function") {
        window.vectron_localDraftSetUser("");
    }
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
            await refreshCurrentUserRole(credential.user);
            unlockEditor(credential.user);
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
        await refreshCurrentUserRole(profileUser);
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

function safeMapName(value, maximumLength = 100) {
    const cleaned = String(value || "map")
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
        .replace(/\s+/g, " ")
        .replace(/^[. ]+|[. ]+$/g, "")
        .slice(0, maximumLength);
    return cleaned || "map";
}

function normalizeMapVersion(value) {
    const version = String(value || "").trim();
    return /^\d+(?:\.\d+)*$/.test(version) ? version : "1";
}

function bumpMapVersion(value) {
    const parts = normalizeMapVersion(value).split(".");
    parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
    return parts.join(".");
}

function storageMapFileName(mapName, version) {
    return `${safeMapName(mapName)}-${normalizeMapVersion(version)}.aamap.xml`;
}

function liveMapPath(author, mapName, version) {
    return `${author}/${MAP_CATEGORY}/${storageMapFileName(mapName, version)}`;
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
    const occupied = new Set(repositoryMaps.map(map => map.fullPath));
    let attempts = 0;
    while(occupied.has(liveMapPath(author, mapName, version)) && attempts < 1000) {
        version = bumpMapVersion(version);
        attempts += 1;
    }
    if(attempts >= 1000) throw new Error("Could not find an available map version.");
    return version;
}

function uploadAuthorFor(user, editState = null) {
    const signedInAuthor = user.displayName.trim();
    if(editState && (editState.targetAuthor === signedInAuthor || currentUserIsAdmin())) {
        return editState.targetAuthor;
    }
    return signedInAuthor;
}

function uploadOwnerUidFor(user, editState = null) {
    if(editState && currentUserIsAdmin()) return editState.sourceOwnerUid;
    return user.uid;
}

function mapUploadMetadata(user, author, mapName, mapVersion, operation, editState = null) {
    const remixIdentity = currentRemixIdentity();
    return {
        ownerUid: uploadOwnerUidFor(user, editState),
        editorUid: user.uid,
        editorRole: currentUserRole,
        author,
        category: MAP_CATEGORY,
        mapName,
        mapVersion,
        isRemix: remixIdentity ? "true" : "false",
        remixDepth: remixIdentity ? String(remixIdentity.depth) : "0",
        remixOriginalName: remixIdentity ? remixIdentity.originalName : "",
        archived: "false",
        operation,
        editSourcePath: editState ? editState.sourcePath : "",
        editSourceName: editState ? editState.sourceName : "",
        editSourceVersion: editState ? editState.sourceVersion : "",
        editSourceCategory: editState ? editState.sourceCategory : "",
        editSourceFileName: editState ? editState.sourcePath.split("/").pop() : ""
    };
}

async function objectMetadataIfExists(fullPath) {
    const slash = fullPath.lastIndexOf("/");
    const parentPath = slash >= 0 ? fullPath.slice(0, slash) : "";
    const result = await storageSdk.listAll(storageSdk.ref(storage, parentPath));
    const reference = result.items.find(item => item.fullPath === fullPath);
    return reference ? storageSdk.getMetadata(reference) : null;
}

function showEditorMessage(message) {
    if(typeof window.gui_toast === "function") window.gui_toast(message);
    else window.alert(message);
}

function friendlyUploadError(error) {
    const code = error && error.code ? error.code : "";
    const messages = {
        "storage/already-exists": "That map name and version already exist. Choose a different version.",
        "storage/unauthorized": "Your account cannot upload to this author folder.",
        "storage/retry-limit-exceeded": "The upload timed out. Check your connection and retry.",
        "storage/quota-exceeded": "Map storage is temporarily full.",
        "storage/unknown": "The map could not be uploaded. Please try again."
    };
    return messages[code] || "The map could not be uploaded. Please try again.";
}

function storageConflict(message) {
    const error = new Error(message || "A map already exists at that repository path.");
    error.code = "storage/already-exists";
    return error;
}

async function archiveEditedSource(user, editState) {
    const author = uploadAuthorFor(user, editState);
    const sourceFileName = editState.sourcePath.split("/").pop();
    const archivePath = `${author}/${editState.sourceCategory}/archive/${sourceFileName}`;
    const existing = await objectMetadataIfExists(archivePath);
    if(existing) {
        const metadata = existing.customMetadata || {};
        const createdByCurrentEditor = metadata.editorUid === user.uid ||
            (!metadata.editorUid && metadata.ownerUid === user.uid);
        if(!createdByCurrentEditor || metadata.archivedFrom !== editState.sourcePath) {
            throw storageConflict("The archive path is already occupied.");
        }
        return archivePath;
    }

    const originalXml = await downloadRepositoryMap(editState.sourcePath);
    await storageSdk.uploadString(storageSdk.ref(storage, archivePath), originalXml, "raw", {
        contentType: "application/xml; charset=UTF-8",
        customMetadata: {
            ownerUid: uploadOwnerUidFor(user, editState),
            editorUid: user.uid,
            editorRole: currentUserRole,
            author,
            category: editState.sourceCategory,
            mapName: editState.sourceName,
            mapVersion: editState.sourceVersion,
            archived: "true",
            operation: "archive",
            archivedFrom: editState.sourcePath
        }
    });
    return archivePath;
}

async function uploadCurrentMap() {
    if(uploadBusy) return;
    const user = auth && auth.currentUser;
    if(!user || authorNameError(user.displayName)) {
        showEditorMessage("Set your Vectron author name before uploading.");
        return;
    }
    if(!storage || !storageSdk || typeof window.eventHandler_getExportMap !== "function") {
        showEditorMessage("Map storage is not ready yet. Please try again.");
        return;
    }

    syncMapMetadata(user);
    const editState = getRepositoryEditState();
    const author = uploadAuthorFor(user, editState);
    const mapName = setCurrentMapName(document.getElementById("map_name").value);
    const mapVersion = setCurrentMapVersion(document.getElementById("map_version").value);
    syncMapMetadata(user);
    const map = window.eventHandler_getExportMap();
    const objectPath = liveMapPath(author, mapName, mapVersion);

    uploadBusy = true;
    if(uploadButton) {
        uploadButton.classList.add("auth-uploading");
        uploadButton.setAttribute("aria-busy", "true");
    }
    showEditorMessage("Uploading map…");

    try {
        const existing = await objectMetadataIfExists(objectPath);
        const existingMetadata = existing && existing.customMetadata || {};
        const resumedEdit = Boolean(editState && existing &&
            (existingMetadata.editorUid === user.uid ||
                (!existingMetadata.editorUid && existingMetadata.ownerUid === user.uid)) &&
            existingMetadata.operation === "edit" &&
            existingMetadata.editSourcePath === editState.sourcePath);
        if(existing && !resumedEdit) throw storageConflict();

        let archivePath = "";
        if(editState) archivePath = await archiveEditedSource(user, editState);

        const mapRef = storageSdk.ref(storage, objectPath);
        if(!resumedEdit) {
            await storageSdk.uploadString(mapRef, map.xml, "raw", {
                contentType: "application/xml; charset=UTF-8",
                customMetadata: mapUploadMetadata(
                    user, author, mapName, mapVersion, editState ? "edit" : "create", editState
                )
            });
        }
        if(editState) {
            try {
                await storageSdk.deleteObject(storageSdk.ref(storage, editState.sourcePath));
            } catch(error) {
                if(!error || error.code !== "storage/object-not-found") throw error;
            }
            clearRepositoryEditState();
        }
        repositoryMaps = [];
        if(typeof window.vectron_localDraftSaveNow === "function") {
            window.vectron_localDraftSaveNow();
        }
        showEditorMessage(editState
            ? `Submitted ${objectPath}; archived the previous version in ${archivePath}.`
            : `Uploaded to ${objectPath}`);
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

function repositoryMapDetails(fullPath) {
    const parts = String(fullPath || "").split("/").filter(Boolean);
    const fileName = parts.pop() || "Untitled map";
    const author = parts.shift() || "Unknown";
    const category = parts.join("/") || MAP_CATEGORY;
    return {
        fullPath,
        author,
        category,
        name: fileName.replace(/\.aamap\.xml$/i, ""),
        ownerUid: ""
    };
}

function isLiveRepositoryMap(reference) {
    const parts = String(reference && reference.fullPath || "").split("/").filter(Boolean);
    return parts.length >= 3 && parts[parts.length - 2] !== "archive" &&
        reference.fullPath.toLocaleLowerCase().endsWith(".aamap.xml");
}

async function addRepositoryOwnership(maps) {
    const user = auth && auth.currentUser;
    const author = repositoryCurrentAuthor();
    if(!user || !author) return maps;
    const possibleOwnMaps = maps.filter(map => map.author === author);
    await Promise.all(possibleOwnMaps.map(async map => {
        try {
            const metadata = await storageSdk.getMetadata(storageSdk.ref(storage, map.fullPath));
            map.ownerUid = metadata.customMetadata && metadata.customMetadata.ownerUid || "";
        } catch(error) {
            console.warn(`Could not verify ownership for ${map.fullPath}.`, error);
        }
    }));
    return maps;
}

async function listRepositoryReferences(folderReference) {
    const result = await storageSdk.listAll(folderReference);
    const descendants = await Promise.all(result.prefixes.map(listRepositoryReferences));
    return result.items.concat(descendants.flat());
}

async function downloadRepositoryMap(fullPath) {
    const idToken = await authSdk.getIdToken(auth.currentUser);
    const objectUrl = new URL(
        `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(FIREBASE_CONFIG.storageBucket)}/o/${encodeURIComponent(fullPath)}`
    );
    objectUrl.searchParams.set("alt", "media");
    const response = await fetch(objectUrl, {
        headers: {Authorization: `Firebase ${idToken}`}
    });
    if(!response.ok) {
        const error = new Error(`Repository download failed (${response.status}).`);
        if(response.status === 401 || response.status === 403) error.code = "storage/unauthorized";
        throw error;
    }
    const contentLength = Number(response.headers.get("content-length")) || 0;
    if(contentLength > 10 * 1024 * 1024) throw new Error("Repository map is too large.");
    const bytes = await response.arrayBuffer();
    if(bytes.byteLength > 10 * 1024 * 1024) throw new Error("Repository map is too large.");
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
    return auth && auth.currentUser && typeof auth.currentUser.displayName === "string"
        ? auth.currentUser.displayName.trim()
        : "";
}

function repositoryMapIsMine(map) {
    return Boolean(map && auth && auth.currentUser && map.ownerUid === auth.currentUser.uid);
}

function repositoryMapCanEdit(map) {
    return Boolean(map && !map.category.includes("/") &&
        (repositoryMapIsMine(map) || currentUserIsAdmin()));
}

function setRepositoryTab(nextTab, focusTab = false) {
    repositoryTab = nextTab === "others" ? "others" : "mine";
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
        return `${map.name} ${map.author} ${map.category} ${map.fullPath}`
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
                path.textContent = map.category === MAP_CATEGORY ? map.fullPath : `${map.category} · ${map.fullPath}`;
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
    if(repositoryBusy || !storage || !storageSdk || !auth || !auth.currentUser) return;
    let shouldRender = false;
    setRepositoryBusy(true);
    setRepositoryStatus("Loading repository maps…");
    try {
        const references = await listRepositoryReferences(storageSdk.ref(storage));
        const maps = references
            .filter(isLiveRepositoryMap)
            .map(reference => repositoryMapDetails(reference.fullPath));
        repositoryMaps = (await addRepositoryOwnership(maps))
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
    if(!auth || !auth.currentUser || !storage || !storageSdk) {
        showEditorMessage("The map repository is not ready yet.");
        return;
    }
    repositorySearchInput.value = "";
    repositoryExpandedAuthors.clear();
    setRepositoryTab("mine");
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
    if(repositoryBusy || !auth || !auth.currentUser) return;
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
        const sourceObjectMetadata = await storageSdk.getMetadata(storageSdk.ref(storage, map.fullPath));
        const sourceOwnerUid = sourceObjectMetadata.customMetadata &&
            sourceObjectMetadata.customMetadata.ownerUid || "";

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
                    sourceOwnerUid
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
                syncMapMetadata(auth.currentUser);
                const remixName = document.getElementById("map_name").value;
                nextVersion = nextAvailableMapVersion(
                    auth.currentUser.displayName.trim(), remixName, sourceVersion, false
                );
            }
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
        setRepositoryStatus("");
        closeRepository();
        showEditorMessage(editing
            ? `Editing ${sourceName}${map.author === auth.currentUser.displayName.trim() ? "" : ` by ${map.author}`}. Version bumped to ${document.getElementById("map_version").value}.`
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
        const [appModule, loadedAuthSdk, loadedStorageSdk] = await Promise.all([
            import(FIREBASE_APP_URL),
            import(FIREBASE_AUTH_URL),
            import(FIREBASE_STORAGE_URL)
        ]);
        authSdk = loadedAuthSdk;
        storageSdk = loadedStorageSdk;
        const app = appModule.initializeApp(FIREBASE_CONFIG);
        auth = authSdk.getAuth(app);
        storage = storageSdk.getStorage(app);

        try {
            await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
        } catch(localPersistenceError) {
            await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
        }

        auth.useDeviceLanguage();
        authSdk.onAuthStateChanged(auth, user => {
            if(!user) {
                lockEditor();
                return;
            }
            if(authorNameError(user.displayName)) {
                showProfileCompletion(user);
                return;
            }
            refreshCurrentUserRole(user)
                .then(() => unlockEditor(user))
                .catch(error => showFatal(friendlyAuthError(error)));
        }, error => {
            showFatal(friendlyAuthError(error));
        });
    } catch(error) {
        console.error("Vectron authentication failed to initialize.", error);
        showFatal("Account services are unavailable. Check your connection, then try again.");
    }
}

initializeAuthentication();
