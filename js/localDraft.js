/*
 * Local, per-account draft persistence for Vectron.
 * Drafts never leave this browser and are keyed by the signed-in Firebase UID.
 */

var vectron_localDraftStoragePrefix = "vectron.localDraft.v1.";
var vectron_localDraftUserId = "";
var vectron_localDraftSaveTimer = null;
var vectron_localDraftRestoring = false;
var vectron_localDraftSaveFailureShown = false;

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
    return true;
}

function vectron_localDraftPayload() {
    if(typeof eventHandler_getExportMap !== "function") return null;
    var map = eventHandler_getExportMap();
    return {
        schema: 1,
        savedAt: new Date().toISOString(),
        xml: map.xml,
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

window.addEventListener("beforeunload", vectron_localDraftSaveNow);
document.addEventListener("visibilitychange", function() {
    if(document.visibilityState === "hidden") vectron_localDraftSaveNow();
});
