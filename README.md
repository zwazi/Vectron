# Vectron 1.1

A map editor for Armagetron Advanced.

Originally created by Carlo Veneziano and re-written by Tristan Whitcher.

### Accounts and access

Vectron uses Firebase Authentication in the `tronnerrepository` project. The
account screen supports email/password sign-in, account creation, persistent
sessions, password reset, and password visibility controls. It also offers a
Guest workspace for local editing and browsing/remixing every public repository
map without signing in. Guest drafts are saved locally under a separate browser
profile, the Upload control is unavailable, and Firebase Storage rejects every
unauthenticated create, replace, archive, and delete request. Every account has
a required author name.
Vectron locks the map Author field to that profile name and the Category field
to `maps`. Accounts default to the `User` level. An `Admin` level is granted
only through Firebase custom claims (`role: "admin"` and `admin: true`) and is
shown beside the signed-in account.

The cloud-upload toolbar button stores the current `.aamap.xml` file at
`<author name>/maps/<map file>` in Cloud Storage. Storage Rules require the
signed-in token name to match the author directory, attach the account UID to
each object, prevent one account from overwriting another account's objects,
accept only XML map files under 10 MiB, and permit public list/download access
only for `.aamap.xml` repository objects.
Admins may edit a map in another author's directory. The editor locks that
author and map name, bumps the version, archives the previous live revision,
and preserves its owner UID on both the archive and replacement. Admins also
retain a separate Remix action, which follows the normal provenance workflow
and uploads the result under the Admin's own author directory.

The checked-in `.firebaserc` and `firebase.json` keep the email/password
provider configuration reproducible. Deploy authentication configuration with:

```sh
firebase deploy --only auth
firebase deploy --only storage
```

Cloud Storage for Firebase requires the project to use the Blaze plan. Create
the default `tronnerrepository.firebasestorage.app` bucket in a Google Cloud
Storage Always Free region before deploying `storage.rules`.

The Firebase web configuration in `js/auth.js` identifies the public browser
client and is safe to ship. Administrator credentials and service-account keys
must never be added to this repository. The sign-in curtain offers the
read-only Guest workspace alongside account access. Map writes are protected
independently by the checked-in Cloud Storage Security Rules, so hiding Guest
upload controls is not the security boundary.


### Features legend:

- *keyb shortcuts are written between [brackets]*
- *'mod' means 'ctrl' (pc) or 'command' (mac)*

### Symmetry

The **Symmetry** picker in the info bar mirrors your editing across one or more
loci. Pick any combination of:

- the vertical line `x = 0` or the horizontal line `y = 0`
- a point reflection through the origin
- a vertical or horizontal line at a coordinate you type
- a point reflection through a point you type

Choosing both a vertical and a horizontal line implies the point reflection
through their intersection, so a single placement fills all four sectors.

While symmetry is on, placing a wall, zone, or spawn also places its
reflections, and dragging, deleting, or pasting one member of a mirrored group
applies to the whole group. Undo and redo treat the group as one action. An
object that already sits on a symmetry locus is its own reflection and is not
duplicated; dragging it off the locus grows the missing copy, and dragging two
halves back together collapses them again.

**Visual check only** reflects the map for inspection without changing it:
each sector is drawn mirrored from the `+x`/`+y` sector so you can see where an
existing map breaks symmetry. Nothing is added to the map in this mode.

Symmetry is an editor aid, not map data. It is not exported, and importing a
map turns it off.

---

# Advanced features
### TODO
- select/edit wall-points tool
- snap cursor to objects
- wall drawing: draw points dragging the cursor, filter them by min-distance threshold
  and join them (could use http://jsfiddle.net/pxemt/2/)
- wall modifiers, ex. cut/divide at point, join walls, etc...
- ~~set zoom 100% button [mod+1]~~ ✓
- ~~fit map to screen button [mod+0]~~ ✓
- ~~history undo/redo [mod+z]/[mod+shift+z]~~ ✓
- ...

---

### Notes:

- The y axis is inverted: in AA the y value is higher on top,
  while in browser the y value is higher on bottom.
- By now vectron starts displaying the map center on the top-left corner of the screen.
  To respect the maps standard, an empty map should start with the center point on the bottom-left corner.
- Keyb shortcuts may change during development.

---

### Tests

```
node tests/vectron-symmetry.test.js
node tests/vectron-auth.test.js
node tests/vectron-local-draft.test.js
node tests/vectron-map-format.test.js
```

The authentication browser smoke test creates a random disposable account in
the real Firebase project, verifies account creation, locked map metadata,
upload path/content, login, logout, session persistence, and editor locking,
then deletes the uploaded map and account. With Vectron served locally and
Firefox running with WebDriver BiDi enabled:

```sh
VECTRON_BIDI_URL=ws://127.0.0.1:9223/session \
VECTRON_TEST_URL=http://127.0.0.1:8000/ \
node tests/vectron-auth-browser-smoke.js
```

Supplying a Firebase-management OAuth token also exercises promotion to Admin
and a disposable cross-author edit:

```sh
VECTRON_ADMIN_OAUTH_TOKEN=... \
VECTRON_BIDI_URL=ws://127.0.0.1:9223/session \
VECTRON_TEST_URL=http://127.0.0.1:8000/ \
node tests/vectron-auth-browser-smoke.js
```
