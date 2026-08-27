# Vectron 1.1

A map editor for Armagetron Advanced.

Originally created by Carlo Veneziano and re-written by Tristan Whitcher.


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
```
