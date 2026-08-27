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
    document.querySelectorAll(".auth-session, .auth-session-separator").forEach(element => {
        element.hidden = false;
    });
}

function syncMapMetadata(user = auth && auth.currentUser) {
    if(!user || authorNameError(user.displayName)) return;
    const author = user.displayName.trim();
    const authorInput = document.getElementById("map_author");
    const categoryInput = document.getElementById("map_category");

    window.xml_author = author;
    window.xml_category = MAP_CATEGORY;
    window.vectron_mapAuthor = author;
    window.vectron_mapCategory = MAP_CATEGORY;

    if(authorInput) {
        authorInput.value = author;
        authorInput.readOnly = true;
        authorInput.setAttribute("aria-readonly", "true");
        authorInput.title = "Locked to your Vectron author name";
    }
    if(categoryInput) {
        categoryInput.value = MAP_CATEGORY;
        categoryInput.readOnly = true;
        categoryInput.setAttribute("aria-readonly", "true");
        categoryInput.title = "Uploaded maps always use the maps category";
    }
}

window.vectron_syncLockedMetadata = () => syncMapMetadata();

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
    syncSessionControls(user);
    syncMapMetadata(user);
    setEditorInert(false);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.remove("auth-locked");
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    document.title = "Vectron";
    profilePanel.hidden = true;
    queueEditorStart();
}

function lockEditor() {
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
            await authSdk.getIdToken(credential.user, true);
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
        await authSdk.getIdToken(profileUser, true);
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
    if(hasUnsavedWork() && !window.confirm("Sign out of Vectron? Export your map first if you want to keep these changes.")) {
        return;
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

function safeStorageFileName(fileName) {
    const withoutSuffix = String(fileName || "map").replace(/\.aamap\.xml$/i, "");
    const cleaned = withoutSuffix
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
        .replace(/\s+/g, " ")
        .replace(/^[. ]+|[. ]+$/g, "")
        .slice(0, 120);
    return `${cleaned || "map"}.aamap.xml`;
}

function showEditorMessage(message) {
    if(typeof window.gui_toast === "function") window.gui_toast(message);
    else window.alert(message);
}

function friendlyUploadError(error) {
    const code = error && error.code ? error.code : "";
    const messages = {
        "storage/unauthorized": "Your account cannot upload to this author folder.",
        "storage/retry-limit-exceeded": "The upload timed out. Check your connection and retry.",
        "storage/quota-exceeded": "Map storage is temporarily full.",
        "storage/unknown": "The map could not be uploaded. Please try again."
    };
    return messages[code] || "The map could not be uploaded. Please try again.";
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
    const map = window.eventHandler_getExportMap();
    const author = user.displayName.trim();
    const fileName = safeStorageFileName(map.fileName);
    const objectPath = `${author}/${MAP_CATEGORY}/${fileName}`;

    uploadBusy = true;
    if(uploadButton) {
        uploadButton.classList.add("auth-uploading");
        uploadButton.setAttribute("aria-busy", "true");
    }
    showEditorMessage("Uploading map…");

    try {
        const mapRef = storageSdk.ref(storage, objectPath);
        await storageSdk.uploadString(mapRef, map.xml, "raw", {
            contentType: "application/xml; charset=UTF-8",
            customMetadata: {
                ownerUid: user.uid,
                author,
                category: MAP_CATEGORY
            }
        });
        showEditorMessage(`Uploaded to ${objectPath}`);
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
            authSdk.getIdToken(user, true)
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
