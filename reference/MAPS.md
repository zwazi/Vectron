# Custom maps

The Rust client loads C++-style XML map files (`.aamap.xml`) through the
console:

```text
load_map maps/Examples/extended-zones.aamap.xml
```

The loader accepts both the C++ `<Resource><Map><World><Field>` wrapper and a
bare `<Map>` document. Map loading occurs before a race starts; all coordinates
and gameplay values are parsed into integers, so a loaded map has the same
authoritative state hash on every supported platform.

## C++ placement compatibility

`<Spawn>` and `<Wall><Point>` use the same metre-space coordinates as the C++
map parser. The Rust core converts them once to millimetres. A wall is an
ordered point chain: each adjacent pair is one static collision wall. Closing a
loop therefore means repeating its first point as the final point.

```xml
<Spawn x="50" y="50" xdir="1" ydir="0"/>

<Wall>
  <Point x="0" y="0"/>
  <Point x="500" y="0"/>
  <Point x="500" y="500"/>
  <Point x="0" y="500"/>
  <Point x="0" y="0"/>
</Wall>
```

Spawns may use C++ `xdir`/`ydir` vectors or `angle`; both remain exact movement
directions before C++ `NearestWinding` resolves them to the nearest declared
axis. If `<Axes>` is omitted, Rust creates the C++ default eight-direction
clockwise winding. Deterministic angles are available at 30° intervals plus
45° diagonals. `Axes` accepts explicit ordered `Axis xdir`/`ydir` vectors.
Automatic C++ winding accepts every count from 1 through 65,535. Established
C++ counts retain their exact historical fixed-point vectors; other counts are
rounded once during map loading and remain integer-only during play. The
declared clockwise axis order remains the turn order.

Common C++ map settings are read from `<Settings>`: `CYCLE_START_SPEED`,
`CYCLE_SPEED_MAX` (or `CYCLE_SPEED`), `CYCLE_BRAKE`, and `CYCLE_DELAY`.
Unsupported legacy settings are retained as metadata rather than silently
altering deterministic local rules.

## Racing time goals

Map authors can publish four decimal-seconds goals in the normal C++ settings
block. The HUD labels the access-level and medal names together:

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

Classic circles and racing rectangles are available:

```xml
<ShapeCircle radius="20"><Point x="100" y="0"/></ShapeCircle>
<ShapeRectangle minx="80" miny="-10" maxx="120" maxy="10"/>
```

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

The C++ map forms remain valid for terminal zones:

```xml
<Zone effect="death"><ShapeCircle radius="10"><Point x="0" y="0"/></ShapeCircle></Zone>
<Zone effect="win"><ShapeCircle radius="10"><Point x="100" y="0"/></ShapeCircle></Zone>
```

Rust adds deterministic racing effects with `type` (or `kind`). Every zone can
set `priority`, `start_tick`, `end_tick`, and `trigger="while_inside"`.
Without a trigger attribute, a zone fires on entry.

### Checkpoint

Checkpoints must be ordered from zero. The finish gate uses the configured
checkpoint count derived from the loaded map.

```xml
<Zone type="checkpoint" order="0">
  <ShapeCircle radius="18"><Point x="-50" y="0"/></ShapeCircle>
</Zone>
```

### Speed

`delta_mps` is metres-per-second converted deterministically to the fixed
simulation tick rate. `duration_ticks` is exact simulation time.

```xml
<Zone type="speed" delta_mps="5" duration_ticks="90" trigger="while_inside">
  <ShapeRectangle minx="0" miny="-10" maxx="30" maxy="10"/>
</Zone>
```

### Rubber

`delta` is an integer rubber adjustment; duration is measured in ticks.

```xml
<Zone type="rubber" delta="500" duration_ticks="120">
  <ShapeCircle radius="12"><Point x="40" y="0"/></ShapeCircle>
</Zone>
```

### Teleport

Teleport destinations use normal C++ map metres. Their direction accepts the
same C++ vector forms as spawns: `xdir`/`ydir` or `angle`, then follows the
nearest declared winding after teleporting. The older cardinal
`direction="north|east|south|west"` spelling remains accepted for compatibility.

```xml
<Zone type="teleport" destination_x="120" destination_y="0" xdir="0" ydir="1">
  <ShapeCircle radius="10"><Point x="70" y="0"/></ShapeCircle>
</Zone>
```

### Win and death

The extension spelling is useful when sharing a map that does not rely on the
legacy `effect` attribute.

```xml
<Zone type="death"><ShapeCircle radius="10"><Point x="-20" y="0"/></ShapeCircle></Zone>
<Zone type="win"><ShapeCircle radius="15"><Point x="150" y="0"/></ShapeCircle></Zone>
```

See [`maps/Examples/extended-zones.aamap.xml`](maps/Examples/extended-zones.aamap.xml) for a
single loadable map that uses every supported racing zone and C++-style walls,
spawn, axes, settings, circles, rectangles, and polygons.
