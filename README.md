# Vectron 1.1

A map editor for Armagetron Advanced.

Originally created by Carlo Veneziano and re-written by Tristan Whitcher.

### Accounts and access

Vectron uses Firebase Authentication, Cloud Firestore, and Cloud Storage in the
`tronnerrepository` project. The account screen supports email/password access,
persistent sessions, password reset, and a separate local Guest workspace.

New registrations enter a `pending` state. Pending users and guests can browse,
download, and remix every active catalog map, and their work is saved locally.
They cannot upload a revision, create a submission, edit catalog metadata, or
perform any other repository write. An admin must approve the registration and
link it to an existing author (or create the requested author) before map
submission is enabled. Denial requires a reason. Approval and denial decisions
appear in the user's in-app notifications, except registration denial, which
permanently deletes both the pending registration and its Firebase login.

Approved users submit maps as immutable objects under
`_revisions/<uid>/<submission-id>/<map-version.aamap.xml>`. The corresponding
Firestore submission is
`pending` until an admin validates and approves it. Publishing changes only the
active catalog pointer; it never overwrites an existing map object. Vectron
always rewrites uploaded map resources and submission metadata to the
`maps` category, including admin review edits and metadata revisions. Firebase
rules enforce the same category at both the Storage and Firestore boundaries.
An approved user can also see their denied submissions under **Maps → My maps**,
including the review reason. Opening **Edit and resubmit** loads the exact denied
revision, preserves whether it was a new map or an edit, and links the new review
to the denied submission without changing the original review record.
Submission creation is handled by a trusted Cloud Function that atomically
reserves the normalized author/name/version resource path. Published versions,
pending versions, concurrent uploads, stale browser clients, and independent
uploads that duplicate a pending resubmission are rejected before they can
create another review item at the same path. The browser advances the numeric
version until it finds a free path before uploading, while the trusted endpoint
remains the authoritative concurrency guard.
Admins may:

- approve registrations or deny and permanently delete pending users, with a
  recorded audit reason;
- approve or deny submissions, or deny and permanently delete a reviewed map,
  its catalog records, reserved paths, and stored revisions;
- link an account to an existing author;
- open any pending submission in the full Vectron editor and save its changes
  as an immutable review draft on the same review item, or save, approve, and
  publish the edited revision in one step;
- freely correct the final author, map name, and version before approval, with
  occupied versions automatically advanced until the resource path is free;
- review each pending map in a two-column card with its submitted reason,
  metadata and vertically stacked actions beside an inline map preview, in a
  desktop review panel that can be dragged by its header and resized from its
  bottom-right corner;
- browse completed review history and reopen any retained revision as a new,
  auditable pending review without rewriting the earlier decision;
- publish author, name, or version corrections for an existing map as a new
  immutable revision; and
- view the pending-registration and pending-submission counts in Vectron.

The racing server can also submit an active map for review. A server-origin
review keeps that map inactive until approval, does not create a synthetic user
notification, and returns the exact approved source or admin-edited draft to
the server catalog. Denial leaves it inactive for follow-up or explicit
cancellation from the server.

After a successful upload, Vectron displays a copyable `MAP_FILE` command in
the form `MAP_FILE map-version.aamap.xml(full-revision-URL)`. The immutable
revision becomes publicly readable only after its matching submission record
exists, allowing the author to run the exact uploaded bytes on another
Armagetron server. Revision writes, replacement, deletion, and listing remain
restricted by Firebase rules.

The review dialog defaults to its 620-pixel content-safe minimum width and the
maximum height that fits the viewport. Wall and Zone tool windows follow their
visible content height automatically until manually resized; using their reset
buttons restores content-driven sizing.

Every decision creates an immutable audit event. Resource-path reservation
documents prevent two maps or revisions from publishing to the same logical
path, and SHA-256 values bind catalog records to their Storage bytes. The public
`maps` collection exposes active catalog metadata only; account, notification,
submission, audit, and author-link data remain private under the checked-in
rules. Administrator access is granted only through the Firebase `admin` custom
claim, never through a display name.

The checked-in `.firebaserc` and `firebase.json` keep the Firebase configuration
reproducible. Deploy the catalog rules together with the compatible Vectron
client:

```sh
firebase deploy --only auth
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The Firebase web configuration in `js/auth.js` identifies the public browser
client and is safe to ship. Administrator credentials and service-account keys
must never be added to this repository. Firestore and Storage Rules enforce the
access boundary independently of the hidden or disabled browser controls.

### Catalog migration

`scripts/migrate-firebase-catalog.mjs` builds the effective catalog from a Git
checkout, the live override directory, and the exclusion-key JSON export. It
validates each map, uploads checksum-addressed immutable revisions, and writes
the matching authors, submissions, active map pointers, path reservations, and
catalog settings. It is dry-run by default and idempotent when `--apply` is
used. The migration leaves `catalogSettings/current.ready` false so the game
server cannot cut over before an independently verified shadow sync.

The game server uses a separate least-privilege service account for catalog
reads and server-approved `/size` or status changes. That credential belongs on
the server only and must not be committed here.


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

### Teleports and checkpoints

The Zone Tool supports native Sty+ct teleport and checkpoint zones. Teleport
placement follows the spawn workflow: choose the entrance center, entrance
radius, destination, and destination direction. Absolute destinations place the
cycle exactly at the selected point. After selecting a teleport, its destination
marker can be dragged separately; dragging the entrance leaves the destination
fixed. Exit compensation is only applied to map-relative and
cycle-relative offsets. A zero direction preserves the cycle's incoming
direction.

### Editing selections

The Select Tool opens an **Edit Selected** panel for single or box selections.
Mixed selections are grouped into independent wall, zone, and spawn sections.
The panel can apply one wall height, zone radius/growth/type/privacy setting, or
spawn direction across each group in one undoable action. Teleport-only zone
selections also expose destination coordinates and exit angle.

Checkpoint IDs are edited per zone, while ordered or unordered behavior is one
setting for the entire map. Vectron writes `RACE_CHECKPOINT_REQUIRE_HIT 2` for
ordered maps or `1` for unordered maps and selects the compatible
`map-0.2.9_styctap_v1.5.dtd`. The legacy checkpoint `time` attribute is hidden
because it is not used, but importing and exporting a map preserves its value.

### Player-private zones

Every Zone Tool type can be marked **Player-private**, including death, win,
target, rubber, fortress, checkpoint, and teleport zones. Vectron draws these
zones with a dashed outline and preserves the flag through selection edits,
symmetry, import, and export.

The exported map keeps each one as an ordinary `<Zone>` and adds one reserved
map setting, `PLAYER_PRIVATE_ZONES_V1`, containing the one-based ordinals of
the private zones. A compatible Tronner server replaces each marked global
zone with an independent copy for each network client: only that client sees
its copy, and only cycles owned by that client interact with it. An unmodified
Sty server ignores the unknown setting and runs the ordinary zones globally,
so the same map remains playable as a stock-server fallback.

Privacy is enforced per network connection. Multiple local players sharing one
client also share that client's private-zone view.

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
node tests/vectron-catalog.test.mjs
```

The authentication browser smoke test exercises the real Firebase project and
must only be run with its cleanup-capable management token. It creates
disposable accounts and data, verifies Guest and pending read-only access,
registration review, author linking, notifications, immutable submission
review, and the catalog browser, then removes the disposable test state. With
Vectron served locally and Firefox running with WebDriver BiDi enabled:

```sh
VECTRON_BIDI_URL=ws://127.0.0.1:9223/session \
VECTRON_TEST_URL=http://127.0.0.1:8000/ \
node tests/vectron-auth-browser-smoke.js
```

```sh
VECTRON_ADMIN_OAUTH_TOKEN=... \
VECTRON_BIDI_URL=ws://127.0.0.1:9223/session \
VECTRON_TEST_URL=http://127.0.0.1:8000/ \
node tests/vectron-auth-browser-smoke.js
```
