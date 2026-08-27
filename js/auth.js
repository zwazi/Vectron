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

let auth = null;
let authSdk = null;
let mode = "login";
let busy = false;
let editorStartQueued = false;

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

function setBusy(nextBusy) {
    busy = nextBusy;
    submitButton.disabled = nextBusy;
    submitButton.classList.toggle("busy", nextBusy);
    forgotButton.disabled = nextBusy;
    loginTab.disabled = nextBusy;
    signupTab.disabled = nextBusy;
    form.setAttribute("aria-busy", String(nextBusy));
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
    setEditorInert(false);
    document.documentElement.classList.remove("auth-pending");
    document.body.classList.remove("auth-locked");
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    document.title = "Vectron";
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
    fatalPanel.hidden = false;
    fatalMessage.textContent = message || "Check your connection and try again.";
    document.title = "Connection problem · Vectron";
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
            if(requestedName) {
                await authSdk.updateProfile(credential.user, {displayName: requestedName});
                syncSessionControls(credential.user);
            }
        } else {
            await authSdk.signInWithEmailAndPassword(auth, email, password);
        }
    } catch(error) {
        setStatus(friendlyAuthError(error));
    } finally {
        setBusy(false);
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

function bindUi() {
    loginTab.addEventListener("click", () => setMode("login"));
    signupTab.addEventListener("click", () => setMode("signup"));
    form.addEventListener("submit", handleSubmit);
    forgotButton.addEventListener("click", handlePasswordReset);
    retryButton.addEventListener("click", () => window.location.reload());
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
        const [appModule, loadedAuthSdk] = await Promise.all([
            import(FIREBASE_APP_URL),
            import(FIREBASE_AUTH_URL)
        ]);
        authSdk = loadedAuthSdk;
        const app = appModule.initializeApp(FIREBASE_CONFIG);
        auth = authSdk.getAuth(app);

        try {
            await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
        } catch(localPersistenceError) {
            await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
        }

        auth.useDeviceLanguage();
        authSdk.onAuthStateChanged(auth, user => {
            if(user) unlockEditor(user);
            else lockEditor();
        }, error => {
            showFatal(friendlyAuthError(error));
        });
    } catch(error) {
        console.error("Vectron authentication failed to initialize.", error);
        showFatal("Account services are unavailable. Check your connection, then try again.");
    }
}

initializeAuthentication();
