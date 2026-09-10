# STATUS — where the project stands

A handover note, so a session starting cold knows what is done, what is deliberately not done,
and what is worth doing next. Read [AGENTS.md](../AGENTS.md) first for how to work here; this is
just the current state.

Keep it short. When something here stops being true, edit it rather than appending.

## Done

**20 presets**, each a complete machine with its own tests: clock, car, castle gate, hoist,
airplane, windmill, bicycle, locomotive, piston engine, factory line shaft, watermill, ferris
wheel, carousel, well pump, conveyor, tower crane, music box, clock tower, gearbox, planetary
hoist. Sixteen of them stand in the default showroom yard.

**Movement.** Props follow their gears through five mechanisms (`attachTo`, `slideWith`,
`windWith`, `linkTo`, plus `reverseAt` on a crank) — see AGENTS.md. Belts and chains now travel
with the wheels driving them, which they did not before: the ribbon geometry depended only on its
two endpoints, and gears never move, so every frame drew identical links.

**Materials.** Seven procedural textures at 512², used as colour, bump and roughness maps, on
props *and* on the gear bodies. Shadows, ACES tone mapping and an environment map so metal has
something to reflect.

**Wear is off in the app.** The mechanic still exists and is still tested; `main.ts` passes
`{ wear: false }` so machines run indefinitely, and `repair.ts` restores durability if it is
turned back on.

## Deliberately not done

- **Two of the four planned interlocking presets were never built**: a **differential axle** and a
  **worm-drive rotary table**. Their build agents died before writing anything. Note that
  `differential` and `worm` are the two gear types **no preset currently uses** — building these
  would be the last piece of type coverage, and both have their own branches in `meshing.ts` with
  rules the rest of the presets never exercise (worm in particular sets a one-way drive direction,
  which nothing tests end to end today).
- **Gearbox and planetary hoist are registered but not in the showroom yard.** They work and are
  reachable from the preset panel; they simply have not been placed on the grid. Placing them
  means measuring their extents and checking the cross-machine overlap floor, as `showroom.ts`
  documents.
- **The clock movement and the music box are excluded from the yard on purpose** — they are
  tabletop pieces and read as scale nonsense beside a locomotive.
- **The showroom does not interlock.** Each machine has its own crank. A single power source
  driving the whole yard would need one connected component, and `rotation.ts` silently discards
  every crank but the first in such a component — so it would mean rebuilding each preset's input,
  not just adding belts.

## Known defects

**`clock.ts` meshes two different modules.** Its idler is 12 teeth at module 1 (r = 6) and its
hour wheel is 120 teeth at module 0.2 (r = 12). The radii sum to the centre distance, so
`evaluatePair` returns a perfectly happy mesh edge — but module *is* tooth size, so the two wheels
are drawn with teeth five times different and could not engage on any real shaft. This is exactly
the trap AGENTS.md warns about, live in a bundled preset, and it is why the one-module rule cannot
yet be asserted across all presets.

It is not a one-line fix. The preset claims a 1/12 minute:hour reduction in a single stage, and a
12x tooth ratio at one module makes the hour wheel enormous (120 teeth at module 1 is a wheel 120
across). `clocktower.ts` hit the same wall and resolved it honestly — it takes one stage of 1/4 and
says plainly in its doc comment that it is not the 12:1 of a real clock. The clock movement should
either do the same, or reach 1/12 through two stages at one module, as a real going train does.

## Known rough edges

- The full suite's runtime swings a lot with machine load — seconds when the box is idle, a
  couple of minutes when something else is running. Most of it is preset tests making hundreds of
  real `tick` calls over large layouts. Nothing is wrong; it is just worth knowing before adding
  another whole-showroom test (see the test-performance note in AGENTS.md).
- Repair is still wired to the UI while wear is off, so the button is permanently disabled. Either
  is defensible — leaving it means the feature is there the moment wear is switched back on.

## If you are looking for something to do

1. Build the differential axle and worm-drive table (above) — closes gear-type coverage.
2. Place gearbox and planetary hoist in the yard.
3. Interlock a *new* preset rather than the yard: one power source, many stations, is what
   `factory.ts` already demonstrates and could be pushed much further.
