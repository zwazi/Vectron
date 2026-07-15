# Custom maps

The Rust client and Vectron use the canonical, human-readable `.armamap` JSON
format. Load one through the console with:

```text
load_map maps/Examples/native-format.armamap
```

Vectron exports `.armamap` and imports either `.armamap` or legacy `.aamap.xml`.
The current canonical contract, schema, identity rules, and migration behavior
are documented in the [map-format reference](../../../docs/map-format.md).
When Vectron imports a legacy XML file, it applies one shared translation to
spawns, wall/floor/ramp points, every zone shape, moving-zone paths, and
teleport destinations so the combined geometry bounds are centered at world
`(0,0)`. Widths, radii, heights, direction vectors, and relative layout stay
unchanged. Moving shapes contribute their complete footprint at every path
pivot; nonzero rotation uses a conservative full pivot-radius envelope that
may add viewport whitespace. Native `.armamap` files retain their authored
world coordinates.
The XML snippets below document legacy import compatibility; XML is no longer
Vectron's export format. The legacy loader accepts both the C++
`<Resource><Map><World><Field>` wrapper and a bare `<Map>` document. Map loading
occurs before a race starts; authoritative coordinates and gameplay values are
parsed into integers for deterministic state hashes on every supported
platform.

## C++ placement compatibility

`<Spawn>` and `<Wall><Point>` use the same metre-space coordinates as the C++
map parser. The Rust core converts them once to millimetres. A wall is an
ordered point chain: each adjacent pair is one static collision wall. Closing a
loop therefore means repeating its first point as the final point.

Flat walls use one `Wall@height`. For a sloped top edge, put `height` on each
`Point`; the game interpolates between adjacent endpoint heights. Point heights
are metres above the selected level and may be zero. A missing point height
inherits the wall height and then the map rim-height fallback.

```xml
<Spawn x="50" y="50" xdir="1" ydir="0"/>

<Wall>
  <Point x="0" y="0"/>
  <Point x="500" y="0"/>
  <Point x="500" y="500"/>
  <Point x="0" y="500"/>
  <Point x="0" y="0"/>
</Wall>

<Wall level="1">
  <Point x="0" y="20" height="2"/>
  <Point x="40" y="20" height="8"/>
</Wall>
```

Spawns may use `xdir`/`ydir` vectors or `angle`; both remain exact movement
directions before the nearest calculated winding resolves them to a turn axis.
If `<Axes>` is omitted, Rust creates the default eight-direction clockwise
winding. Deterministic angles are available at 30° intervals plus 45°
diagonals. `<Axes number="N"/>` accepts every count from 1 through 65,535.
Established counts retain their exact historical fixed-point vectors; other
counts are rounded once during map loading and remain integer-only during play.

Common map settings are read from `<Settings>`: `CYCLE_START_SPEED`,
`CYCLE_SPEED_MAX` (or `CYCLE_SPEED`), `CYCLE_BRAKE`, and `CYCLE_DELAY`.
`JUMP_ENABLED` toggles jumping and `JUMP_HEIGHT` sets its height in metres.
Unsupported settings are retained as metadata rather than silently altering
deterministic local rules.

## Floors and ramps

Arma Racing supports any number of floors, numbered from `0`. Set the height of
each adjacent gap with `Field@level_heights`, ordered from the `0→1` gap onward,
then put `level="N"` on walls, floors, spawns, and zones. The older scalar
`level_height` is accepted on import and is repeated for every gap.

Canonical export stores the stack as `levels.count` plus positive
`levels.gaps`; the last supplied gap repeats if fewer than `count - 1` are
listed. On legacy XML import, self-closing `<Level index="N"/>` markers preserve
empty levels and sparse stacks without changing global object order.

`Floor` is a non-self-intersecting walkable polygon. Canonical ramps contain
either four corners in exact endpoint-edge order or two centre-line points
plus a positive `width`. Vectron's placement tool authors four-corner ramps
and preserves imported two-point ramps unchanged. In legacy XML both forms
are direct children of `Field`.

```xml
<Field level_heights="6,8">
  <Wall level="0"><Point x="0" y="0"/><Point x="20" y="0"/></Wall>
  <Floor level="2">
    <Point x="16" y="8"/><Point x="24" y="8"/>
    <Point x="24" y="20"/><Point x="16" y="20"/>
  </Floor>
  <Ramp from_level="0" to_level="2">
    <Point x="16" y="0"/><Point x="24" y="0"/>
    <Point x="16" y="8"/><Point x="24" y="8"/>
  </Ramp>
</Field>
```

## Racing time goals

Vectron can protect replay-menu author-time validation with the map author's
password. Passwords are limited to 120 characters so they remain enterable in
the game. Canonical export stores a salted verifier in
`metadata.author_password_hash`; plaintext is never written to the map. Leave
the password field untouched when editing an imported protected map to
preserve its verifier.

Map authors can publish four decimal-seconds goals in canonical `settings`.
The equivalent legacy XML settings block is shown below. The HUD labels the
access-level and medal names together:

```xml
<Settings>
  <Setting name="PROGRAM_TIME" value="45.000"/><!-- Bronze -->
  <Setting name="USER_TIME" value="38.500"/><!-- Silver -->
  <Setting name="ADMIN_TIME" value="34.250"/><!-- Gold -->
  <Setting name="ARCHITECT_TIME" value="31.000"/><!-- Author -->
</Settings>
```

`BRONZE_TIME`, `SILVER_TIME`, `GOLD_TIME`, and `AUTHOR_TIME` are equivalent
aliases. `RACING_PROGRAM_TIME`, `RACING_USER_TIME`, `RACING_ADMIN_TIME`, and
`RACING_ARCHITECT_TIME` are also accepted for namespaced maps. Missing goals
are simply omitted. The player's saved personal best is inserted on the HUD
between the goals already achieved and those still ahead.

## Shapes

Circles, lines, and rectangles are available:

```xml
<ShapeCircle radius="20"><Point x="100" y="0"/></ShapeCircle>
<ShapeLine width="2"><Point x="90" y="-10"/><Point x="90" y="10"/></ShapeLine>
<ShapeRectangle minx="80" miny="-10" maxx="120" maxy="10"/>
```

`ShapeLine` always keeps its two points as the exact endpoints. A width of
`0` is one endpoint-to-endpoint line. A positive width is the full width of a
closed rectangular footprint with square ends, so it does not extend beyond
either point. The Zone Tool's Line Width numeric field accepts a literal `0`;
the value remains `0` through placement, compatibility-XML inspection, import,
and canonical export.
Selecting an existing line zone also opens the contextual Selection panel;
entering `0` there converts it in place and participates in undo/redo.

Vectron's Map Settings picker displays `ZONE_PULSE_SPEED` with the game
default of `0.1` cycles per second.

`ShapePolygon` follows the C++ convention: its first `Point` is the origin and
all later points are local vertices, multiplied by `scale`. Static numeric
polygons, including concave polygons, are deterministic. Time/function-based
C++ shape expressions are intentionally rejected because they would make map
geometry depend on non-fixed-point evaluation.

```xml
<ShapePolygon scale="25">
  <Point x="100" y="40"/>
  <Point x="-1" y="-1"/><Point x="1" y="-1"/>
  <Point x="1" y="1"/><Point x="-1" y="1"/>
</ShapePolygon>
```

## Zones

Arma Racing zones use the `type` attribute:

```xml
<Zone type="death"><ShapeCircle radius="10"><Point x="0" y="0"/></ShapeCircle></Zone>
<Zone type="win"><ShapeCircle radius="10"><Point x="100" y="0"/></ShapeCircle></Zone>
```

Zones can set `trigger="while_inside"` or `trigger="on_exit"`. Without a
trigger attribute, a zone fires on entry. The game owns exact simultaneous
ordering (death before checkpoint, checkpoint before finish, then stable IDs),
so Vectron does not expose priority or tick scheduling fields.

### Moving zones

A zone becomes mobile when it contains a `MovementPath` with at least two
distinct world-space points. Canonical `movement.speed` is required and must
be positive; omitted legacy XML `movement_speed` defaults to `20`. Every shape
can retain signed degree-per-second rotation (default `0`). A circle's silhouette is rotationally
symmetric, but its authored rotation remains authoritative movement, replay,
and map-identity state and therefore survives import/export unchanged.
`mode="circular"` connects the final point to the first, `mode="ping_pong"`
reverses at both endpoints, and `mode="instant"` collapses at the final point
then respawns and grows at the first. `spawn_at_vertices="true"` also starts a
phase-offset moving copy at each remaining vertex. Vectron inserts the zone
center as point one and draws the remaining points like a freeform wall. Full map resets rewind
the route; checkpoint respawns preserve its current phase.

```xml
<Zone type="death" movement_speed="20" rotation_speed="30" trigger="on_exit">
  <ShapeRectangle minx="12" miny="2" maxx="28" maxy="18"/>
  <MovementPath mode="circular" spawn_at_vertices="false">
    <Point x="20" y="10"/><Point x="80" y="10"/><Point x="80" y="40"/>
  </MovementPath>
</Zone>
```

### Checkpoint

Canonical checkpoint order `0` means unordered; each such checkpoint may be
collected in any order. Positive values are one-based ordered groups. Legacy
XML remains zero-based during migration, so XML `order="0"` becomes canonical
ordered group `1`. The finish gate uses the checkpoint requirements derived
from the loaded map.

```json
{
  "type": "checkpoint",
  "order": 0,
  "shape": { "type": "circle", "center": [-50, 0], "radius": 18 }
}
```

### Speed

`delta_mps` is metres-per-second converted deterministically to the fixed
simulation tick rate. `duration_ticks` is exact simulation time.

```xml
<Zone type="speed" delta_mps="5" duration_ticks="90" trigger="while_inside">
  <ShapeRectangle minx="0" miny="-10" maxx="30" maxy="10"/>
</Zone>
```

### Health

`delta` is a signed health-point change: positive heals and negative damages.

```xml
<Zone type="health" delta="25">
  <ShapeCircle radius="12"><Point x="40" y="0"/></ShapeCircle>
</Zone>
```

### Setting

Setting zones change a game rule selected from Vectron's validated list.
`while_inside` restores the previous effective value when the racer leaves.

```xml
<Zone type="setting" setting="JUMP_ENABLED" value="1" trigger="while_inside">
  <ShapeCircle radius="12"><Point x="40" y="0"/></ShapeCircle>
</Zone>
```

### Teleport

Teleport destinations use normal map metres. In canonical maps,
`destination_level` can move the cycle to another floor and `direction` is
either a nonzero `[x,y]` vector or `north`, `east`, `south`, or `west`;
omission means east. Legacy XML accepts `xdir`/`ydir`, `angle`, and the cardinal
`direction` spelling, then follows the nearest declared winding after
teleporting.

```xml
<Zone level="0" type="teleport" destination_x="120" destination_y="0" destination_level="1" xdir="0" ydir="1">
  <ShapeCircle radius="10"><Point x="70" y="0"/></ShapeCircle>
</Zone>
```

### Win and death

Win and death zones use the same Arma Racing `type` spelling as other zones.

```xml
<Zone type="death"><ShapeCircle radius="10"><Point x="-20" y="0"/></ShapeCircle></Zone>
<Zone type="win"><ShapeCircle radius="15"><Point x="150" y="0"/></ShapeCircle></Zone>
```

See the test-only [`extended-zones.armamap`](../../../tests/fixtures/maps/extended-zones.armamap)
for a canonical map that uses every supported racing zone and C++-style walls,
spawn, axes, settings, circles, rectangles, and polygons. A smaller native
example is [`native-format.armamap`](../../../tests/fixtures/maps/native-format.armamap).
