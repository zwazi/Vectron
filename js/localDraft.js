/*
 * Local, per-account draft persistence for Vectron.
 * Drafts never leave this browser and are keyed by Firebase UID or guest session.
 */

var vectron_localDraftStoragePrefix = "vectron.localDraft.v1.";
var vectron_localDraftUserId = "";
var vectron_localDraftSaveTimer = null;
var vectron_localDraftRestoring = false;
var vectron_localDraftSaveFailureShown = false;
var vectron_localMapIdentityId = "";

function vectron_newLocalMapIdentity() {
    if(window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return "map-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function vectron_localMapIdentity() {
    if(!vectron_localMapIdentityId) vectron_localMapIdentityId = vectron_newLocalMapIdentity();
    return vectron_localMapIdentityId;
}

function vectron_localMapIdentityReset(identityId) {
    vectron_localMapIdentityId = String(identityId || "").trim() || vectron_newLocalMapIdentity();
    return vectron_localMapIdentityId;
}

function vectron_localDraftStorageKey(userId) {
    return vectron_localDraftStoragePrefix + encodeURIComponent(String(userId || ""));
}

function vectron_localDraftSetUser(userId) {
    var nextUserId = String(userId || "").trim();
    if(nextUserId === vectron_localDraftUserId) return false;

    if(vectron_localDraftUserId && window.vectron_started === true) {
        vectron_localDraftSaveNow();
    }
    vectron_localDraftUserId = nextUserId;
    if(typeof window.vectron_localLibrarySetUser === "function") {
        window.vectron_localLibrarySetUser(nextUserId);
    }
    return true;
}

function vectron_localDraftPayload() {
    if(typeof eventHandler_getExportMap !== "function") return null;
    var map = eventHandler_getExportMap();
    return {
        schema: 1,
        savedAt: new Date().toISOString(),
        localMapId: vectron_localMapIdentity(),
        xml: map.xml,
        repositoryEdit: typeof window.vectron_getRepositoryEditState === "function"
            ? window.vectron_getRepositoryEditState()
            : null,
        viewport: {
            panX: Number(window.vectron_panX) || 0,
            panY: Number(window.vectron_panY) || 0,
            zoom: Number(window.vectron_zoom) || 1
        }
    };
}

function vectron_localDraftSaveNow() {
    if(vectron_localDraftSaveTimer) {
        window.clearTimeout(vectron_localDraftSaveTimer);
        vectron_localDraftSaveTimer = null;
    }
    if(vectron_localDraftRestoring || !vectron_localDraftUserId ||
       window.vectron_started !== true) return false;

    try {
        var payload = vectron_localDraftPayload();
        if(!payload) return false;
        localStorage.setItem(
            vectron_localDraftStorageKey(vectron_localDraftUserId),
            JSON.stringify(payload)
        );
        vectron_localDraftSaveFailureShown = false;
        return true;
    } catch(error) {
        console.warn("Vectron could not save the local draft.", error);
        if(!vectron_localDraftSaveFailureShown && typeof gui_toast === "function") {
            vectron_localDraftSaveFailureShown = true;
            gui_toast("Local save failed. Export a copy before leaving.");
        }
        return false;
    }
}

function vectron_localDraftScheduleSave() {
    if(vectron_localDraftRestoring || !vectron_localDraftUserId ||
       window.vectron_started !== true) return;
    if(vectron_localDraftSaveTimer) window.clearTimeout(vectron_localDraftSaveTimer);
    vectron_localDraftSaveTimer = window.setTimeout(function() {
        vectron_localDraftSaveTimer = null;
        vectron_localDraftSaveNow();
    }, 350);
}

function vectron_localDraftRestore() {
    if(!vectron_localDraftUserId) return false;
    var key = vectron_localDraftStorageKey(vectron_localDraftUserId);
    var raw;

    try {
        raw = localStorage.getItem(key);
        if(!raw) return false;
        var draft = JSON.parse(raw);
        if(!draft || draft.schema !== 1 || typeof draft.xml !== "string" ||
           draft.xml.indexOf("<Resource") < 0) throw new Error("Invalid local draft");
        $.parseXML(draft.xml);

        vectron_localDraftRestoring = true;
        if(typeof vectron_resetForInitialMap === "function") {
            vectron_resetForInitialMap();
        } else {
            aamap_objects = [];
        }
        if(typeof aamap_disableSymmetry === "function") aamap_disableSymmetry();
        xml_process(draft.xml);
        vectron_localMapIdentityReset(draft.localMapId);
        if(typeof window.vectron_setRepositoryEditState === "function") {
            window.vectron_setRepositoryEditState(draft.repositoryEdit || null);
        }

        var viewport = draft.viewport || {};
        if(isFinite(Number(viewport.panX))) vectron_panX = Number(viewport.panX);
        if(isFinite(Number(viewport.panY))) vectron_panY = Number(viewport.panY);
        if(isFinite(Number(viewport.zoom)) && Number(viewport.zoom) > 0) {
            vectron_zoom = Number(viewport.zoom);
        }
        if(typeof aamap_clearHistory === "function") aamap_clearHistory();
        vectron_render();
        if(typeof gui_toast === "function") gui_toast("Restored your local draft.");
        return true;
    } catch(error) {
        console.warn("Vectron ignored an invalid local draft.", error);
        try { localStorage.removeItem(key); } catch(storageError) {}
        return false;
    } finally {
        vectron_localDraftRestoring = false;
    }
}

window.vectron_localDraftSetUser = vectron_localDraftSetUser;
window.vectron_localDraftSaveNow = vectron_localDraftSaveNow;
window.vectron_localDraftScheduleSave = vectron_localDraftScheduleSave;
window.vectron_localDraftRestore = vectron_localDraftRestore;
window.vectron_localMapIdentity = vectron_localMapIdentity;
window.vectron_localMapIdentityReset = vectron_localMapIdentityReset;

window.addEventListener("beforeunload", vectron_localDraftSaveNow);
document.addEventListener("visibilitychange", function() {
    if(document.visibilityState === "hidden") vectron_localDraftSaveNow();
});
