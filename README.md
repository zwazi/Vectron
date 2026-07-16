# Vectron 1.2

Vectron is the browser map editor for Arma Racing. It exports the canonical,
human-readable `.armamap` JSON format. It imports `.armamap` directly and
converts useful geometry from legacy `.aamap.xml` maps. Canonical files use a
simple descriptive file name; display metadata, search tags, and a generated
SHA-256 revision are stored inside.

File import preserves world coordinates exactly as authored in both legacy XML
and canonical `.armamap` maps. The viewport is fitted to the imported geometry
without translating it. Moving-shape bounds include their footprint at every
path pivot, and nonzero rotation uses a conservative full pivot-radius envelope.
That envelope can add viewport whitespace but cannot omit a reachable
orientation.

Import builds the map model without temporary SVG placeholders, discards the
old Raphael scene in one operation, and renders the imported map once. This
keeps large-map loading proportional to the new map rather than both maps plus
throwaway graphics.

## Arma Racing features

- Arbitrarily many editable levels, with a height control for every adjacent
  gap and independent visibility for each level. Deleting a lower level can
  either shift higher level IDs down or preserve a sparse level stack.
- Walls, spawns, circle/line/rectangle/polygon zones, and all supported racing
  zone effects. Walls may use a single flat height or an individually authored
  height at each point for sloped top edges. Circle, arc, and ellipse wall
  generators honor any whole wall count of three or more without a
  size-derived or fixed editor ceiling.
- Line-zone width may be exactly zero for one authored endpoint-to-endpoint
  line. Positive widths use a closed rectangular footprint with square ends;
  neither form extends beyond its two authored endpoints.
- Free-form walkable upper-Floor polygons with self-intersection validation;
  Level 0 uses the permanent implicit legacy floor.
- Four-click ramp placement: draw one edge, switch levels, then draw the other
  edge. Ramp width follows the authored edges instead of a numeric field.
- Cross-floor teleports with spawn-style destination placement: click once for
  position, then aim the visible arrow to set the exit direction and level.
- Moving zones with freeform directed paths, circular, ping-pong, or instant
  restart modes, optional phase-offset moving copies at path vertices,
  metre-per-second travel speed, signed degree-per-second rotation, and
  entry/inside/exit triggers.
- Checkpoint order `0` means unordered. Positive checkpoint groups use the
  same one-based numbers shown by the editor and game. Legacy zero-based XML
  orders are shifted during import. Empty maps start the Checkpoint # control
  at `1`; the control accepts positive decimal digits only and remains freely
  editable by the author.
- Single-level maps stay single-level on export; multi-level maps use a
  readable `levels.count` plus ordered `levels.gaps` array.
- Export validation catches missing spawns and invalid axes, zones, ramps, or
  self-intersecting Floor polygons before a file is downloaded.
- A top-toolbar author password stores only a salted verifier in the map and
  protects setting an author time from a qualifying replay. Export is blocked
  until a password is secured or an imported map already has a valid verifier,
  and the password must be confirmed in the export popover. The eye buttons
  reveal either password only while pressed by the user.
- Undo/redo, copy/paste, wall split/join, vertex editing, a compatibility XML
  view, and deterministic axes/settings export. Imported custom axes and
  sparse per-point wall heights round-trip without becoming regular/default
  geometry.
- The Map Settings search lists the game-default zone pulse speed as `0.1`
  cycles per second.
- Scroll-wheel zoom changes by 10% by default; the Configure tab retains 2%,
  5%, 10%, and 20% choices, and preserves an existing user preference.
- A full-screen software 3D preview with the same W/A/S/D, Space, Ctrl,
  Shift-fast, and mouse-look free camera as the game. Spawn previews use the
  exact `assets/models/cycle.ASE` mesh when that asset is reachable and a
  correctly scaled 1.0388507-metre fallback otherwise. Moving zones animate
  at their authored path and rotation speeds, while ramp rails use the map's
  configured rim-wall height.

## Main shortcuts

- `1` select, `2` wall, `3` floor, `4` zone, `5` spawn, `6` ramp.
- `7` split, `8` join, `9` wall-vertex editing.
- `F` selects the Floor tool; `Shift+F` finishes its current outline. The tool
  authors upper floors only, using a pale translucent blue infill with no
  secondary grid. Level 0 cannot be outlined because its floor exists
  everywhere.
- `L` cycles the active level. The toolbar's ↓/↑ buttons jump to the previous
  or next authored level, the adjacent `+` creates one immediately, and the
  level menu selects, hides, deletes, and configures levels.
- `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` undo and redo.
- `Ctrl/Cmd+0` fits the visible floors to the screen.
- `+`/`=` and `-`/`_` increase or decrease grid and snap spacing with every
  active tool. Choosing a Wall mode or Zone subtype keeps its owning tool and
  global shortcuts active without discarding placement state.

## Browser and Android testing

From this directory, serve the editor over HTTP:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the development computer. For Android, put the
phone on the same network and open `http://<computer-lan-ip>:8000` in Chrome or
Firefox. The computer firewall must allow inbound TCP port 8000. Export a map,
copy it into the Android build's map directory, and load it from Arma Racing's
map browser.

For the exact cycle model in the 3D preview, serve from the repository root:

```sh
cd ../..
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000/web/Vectron/` (or the same path on the
computer's LAN address from Android). The editor falls back cleanly when it is
served from its own directory and cannot reach the shared model asset.

Run the editor's headless geometry and serialization checks with:

```sh
node tests/vectron-core.test.js
```

For the real-browser smoke test, launch Firefox against the served editor with
WebDriver BiDi enabled, then run `node tests/vectron-browser-smoke.js`. The test
exercises uncapped conic-wall generation, checkpoint input filtering, tool
focus and shortcut handoff, moving-zone placement/XML, sparse level deletion,
the right-click menu, diagonal feedback helpers, and the 3D scene in an actual
browser.

Originally created by Carlo Veneziano and re-written by Tristan Whitcher.
