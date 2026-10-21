// Preferences in the database (3.12.0). A classic script the server puts
// right after <head> of every signed-in HTML page, behind a JSON block
// (#chassis-prefs) that carries the login's synced values, the service's
// declaration of which keys sync, and the limits. It runs before any module
// and before first paint, so the page needs no request to start from the
// right values and nothing flashes.
//
// What it does:
//   1. Applies the database values to localStorage for the declared keys
//      (the database wins). A key this browser holds but the database lacks
//      is uploaded the first time this browser syncs, and removed when it
//      has synced before (another device removed it).
//   2. Seeds sessionStorage for the declared session keys (kp-themes' unsaved
//      bar keeps a draft there) when the tab has none.
//   3. Keeps both in step: writes to declared localStorage keys go to the
//      browser AND the database (Storage.prototype setItem / removeItem /
//      clear, for localStorage and declared keys only — kp-themes' own
//      data-kp-remember writes are caught the same way, kp-themes is not
//      changed); declared session keys are read back after kp-themes'
//      kp-unsaved-change / -save / -discard events and when the page hides.
//   4. Re-reads the database when the page becomes visible again (a change
//      made on another device) and fires `chassis-prefs-change`.
//
// Stays local on purpose: every key that is not declared, the pre-login theme
// (theme-boot.js), and every other sessionStorage key. Secrets are never
// declared; the server refuses them anyway.
//
// window.chassisPrefs = { storage, scope, isSynced(key), flush(), refresh(),
// pending() } is the explicit API; `storage` is a Storage-shaped object for
// kp-themes' configureRemember({ storage }).
(function () {
    "use strict";
    var node = document.getElementById("chassis-prefs");
    if (!node || window.chassisPrefs) return;
    var snap;
    try {
        snap = JSON.parse(node.textContent || "");
    } catch (e) {
        return;
    }
    if (!snap || snap.v !== 1 || !snap.synced) return;

    var local, session;
    try {
        local = window.localStorage;
        local.getItem("chassis-prefs:probe");
    } catch (e) {
        local = null;
    }
    try {
        session = window.sessionStorage;
        session.getItem("chassis-prefs:probe");
    } catch (e) {
        session = null;
    }

    var d = snap.synced;
    var MARK = "chassis-prefs:synced";
    var API = "/api/kit/prefs";

    function startsWithAny(key, list) {
        for (var i = 0; i < (list || []).length; i++) if (key.indexOf(list[i]) === 0) return true;
        return false;
    }
    function inList(key, exact) {
        return (exact || []).indexOf(key) !== -1;
    }
    function denied(key) {
        return key.indexOf("chassis-prefs:") === 0 || inList(key, d.except_exact) || startsWithAny(key, d.except_prefix);
    }
    // The same rule as BrowserKeys::is_synced_local / is_synced_session.
    function isLocal(key) {
        return (inList(key, d.exact) || startsWithAny(key, d.prefix)) && !denied(key);
    }
    function isSession(key) {
        return (inList(key, d.session_exact) || startsWithAny(key, d.session_prefix)) && !denied(key) && !isLocal(key);
    }

    var rawGet = Storage.prototype.getItem;
    var rawSet = Storage.prototype.setItem;
    var rawRemove = Storage.prototype.removeItem;
    var rawClear = Storage.prototype.clear;
    function get(area, key) {
        try {
            return rawGet.call(area, key);
        } catch (e) {
            return null;
        }
    }
    function put(area, key, value) {
        try {
            rawSet.call(area, key, value);
        } catch (e) {}
    }
    function drop(area, key) {
        try {
            rawRemove.call(area, key);
        } catch (e) {}
    }
    function keysOf(area, test) {
        var out = [];
        try {
            for (var i = 0; i < area.length; i++) {
                var k = area.key(i);
                if (k !== null && test(k)) out.push(k);
            }
        } catch (e) {}
        return out;
    }

    // ---- the write queue --------------------------------------------------
    var queue = {}; // key -> { area: "local"|"session", value: string|null }
    var timer = null;
    var running = null;
    var backoff = 0;

    function bytes(s) {
        try {
            return new TextEncoder().encode(s).length;
        } catch (e) {
            return s.length;
        }
    }
    function fail(key, why) {
        try {
            console.warn("chassis preferences: " + key + " stays in this browser: " + why);
            window.dispatchEvent(new CustomEvent("chassis-prefs-error", { detail: { key: key, why: why } }));
        } catch (e) {}
    }
    function enqueue(area, key, value) {
        if (value !== null && snap.limits && bytes(value) > snap.limits.max_value_bytes) {
            fail(key, "the value is larger than the limit of " + snap.limits.max_value_bytes + " bytes");
            return;
        }
        queue[key] = { area: area, value: value };
        schedule(300);
    }
    function schedule(ms) {
        if (timer !== null) return;
        timer = setTimeout(function () {
            timer = null;
            flush();
        }, ms);
    }
    function url(key) {
        // The whole key is one path segment ("/" becomes %2F), so any name
        // travels; "." and ".." are refused by the server (a path cannot
        // carry them).
        return API + "/" + encodeURIComponent(key);
    }
    function send(key, entry, keepalive) {
        var init = {
            method: entry.value === null ? "DELETE" : "PUT",
            credentials: "same-origin",
            keepalive: Boolean(keepalive) && (entry.value === null || bytes(entry.value) < 60000),
        };
        if (entry.value !== null) {
            init.headers = { "Content-Type": "application/json" };
            init.body = JSON.stringify({ value: entry.value });
        }
        return fetch(url(key), init).then(function (r) {
            if (r.ok) return "ok";
            // The server refused this value for good (a limit, a rule):
            // retrying cannot help. A 5xx or a pause for a backup can.
            return r.status >= 500 || r.status === 429 ? "retry" : "refused:" + r.status;
        });
    }
    function flush(keepalive) {
        if (running) return running;
        var keys = Object.keys(queue);
        if (!keys.length) return Promise.resolve();
        var chain = Promise.resolve();
        var retry = false;
        keys.forEach(function (key) {
            var entry = queue[key];
            chain = chain.then(function () {
                return send(key, entry, keepalive)
                    .then(function (state) {
                        if (queue[key] === entry) delete queue[key];
                        if (state === "retry") {
                            retry = true;
                            if (!queue[key]) queue[key] = entry;
                        } else if (state !== "ok") {
                            fail(key, "the service refused it (" + state.slice(8) + ")");
                        }
                    })
                    .catch(function () {
                        retry = true;
                        if (!queue[key]) queue[key] = entry;
                    });
            });
        });
        running = chain.then(function () {
            running = null;
            if (retry && Object.keys(queue).length) {
                backoff = Math.min(backoff ? backoff * 2 : 1000, 30000);
                schedule(backoff);
            } else {
                backoff = 0;
                if (Object.keys(queue).length) schedule(300);
            }
        });
        return running;
    }

    // ---- first apply ------------------------------------------------------
    function applyLocal(fromDb, firstLoad) {
        var changed = [];
        if (!local) return changed;
        var synced = get(local, MARK) === snap.scope;
        Object.keys(fromDb).forEach(function (key) {
            if (!isLocal(key) || (queue[key] && !firstLoad)) return;
            if (get(local, key) !== fromDb[key]) {
                put(local, key, fromDb[key]);
                changed.push(key);
            }
        });
        keysOf(local, isLocal).forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(fromDb, key) || queue[key]) return;
            if (synced) {
                drop(local, key);
                changed.push(key);
            } else {
                enqueue("local", key, get(local, key));
            }
        });
        if (!synced) put(local, MARK, snap.scope);
        return changed;
    }
    function seedSession(fromDb) {
        if (!session) return;
        Object.keys(fromDb).forEach(function (key) {
            if (isSession(key) && get(session, key) === null) put(session, key, fromDb[key]);
        });
        // What the tab already holds and the database lacks goes up.
        keysOf(session, isSession).forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(fromDb, key)) enqueue("session", key, get(session, key));
        });
    }
    var known = {}; // the last session value seen per key, to find changes
    function noteSession() {
        if (!session) return;
        var now = {};
        keysOf(session, isSession).forEach(function (key) {
            var v = get(session, key);
            now[key] = v;
            if (known[key] !== v) enqueue("session", key, v);
        });
        Object.keys(known).forEach(function (key) {
            if (!(key in now)) enqueue("session", key, null);
        });
        known = now;
    }

    // Mirror the theme once the values are in: theme-boot.js read it before
    // or after us depending on the page, so state it again.
    function mirrorTheme() {
        if (!local || !isLocal("theme")) return;
        var t = get(local, "theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
    }

    applyLocal(snap.keys || {}, true);
    seedSession(snap.session || {});
    keysOf(session || { length: 0 }, isSession).forEach(function (k) {
        known[k] = get(session, k);
    });
    mirrorTheme();

    // ---- keeping in step --------------------------------------------------
    function isLocalArea(area) {
        try {
            return local !== null && area === local;
        } catch (e) {
            return false;
        }
    }
    Storage.prototype.setItem = function (key, value) {
        rawSet.call(this, key, value);
        if (isLocalArea(this)) {
            key = String(key);
            if (isLocal(key)) enqueue("local", key, get(local, key));
        }
    };
    Storage.prototype.removeItem = function (key) {
        rawRemove.call(this, key);
        if (isLocalArea(this)) {
            key = String(key);
            if (isLocal(key)) enqueue("local", key, null);
        }
    };
    Storage.prototype.clear = function () {
        var gone = isLocalArea(this) ? keysOf(local, isLocal) : [];
        rawClear.call(this);
        gone.forEach(function (key) {
            enqueue("local", key, null);
        });
        if (isLocalArea(this)) put(local, MARK, snap.scope);
    };

    // kp-themes fires its events BEFORE it writes the draft, so the key is
    // read back on the next turn of the loop.
    ["kp-unsaved-change", "kp-unsaved-save", "kp-unsaved-discard", "kp-unsaved-undo", "kp-unsaved-revert"].forEach(function (name) {
        document.addEventListener(name, function () {
            setTimeout(noteSession, 0);
            setTimeout(noteSession, 250);
        });
    });

    function refresh() {
        return fetch(API, { credentials: "same-origin", headers: { Accept: "application/json" } })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (fresh) {
                if (!fresh || !fresh.keys) return [];
                var changed = applyLocal(fresh.keys, false);
                if (changed.length) {
                    mirrorTheme();
                    window.dispatchEvent(new CustomEvent("chassis-prefs-change", { detail: { keys: changed } }));
                }
                return changed;
            })
            .catch(function () {
                return [];
            });
    }
    var lastRefresh = Date.now();
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
            noteSession();
            flush(true);
        } else if (Date.now() - lastRefresh > 15000) {
            lastRefresh = Date.now();
            flush().then(refresh);
        }
    });
    window.addEventListener("pagehide", function () {
        noteSession();
        flush(true);
    });

    // Storage-shaped, for configureRemember({ storage }). It is localStorage
    // underneath: the patch above does the syncing.
    var composite = {
        getItem: function (k) {
            return local ? local.getItem(k) : null;
        },
        setItem: function (k, v) {
            if (local) local.setItem(k, v);
        },
        removeItem: function (k) {
            if (local) local.removeItem(k);
        },
        clear: function () {
            if (local) local.clear();
        },
        key: function (i) {
            return local ? local.key(i) : null;
        },
        get length() {
            return local ? local.length : 0;
        },
    };
    window.chassisPrefs = {
        storage: composite,
        scope: snap.scope,
        isSynced: function (key) {
            return isLocal(String(key)) || isSession(String(key));
        },
        flush: function () {
            noteSession();
            return flush();
        },
        refresh: refresh,
        pending: function () {
            return Object.keys(queue);
        },
    };
    if (Object.keys(queue).length) schedule(300);
})();
