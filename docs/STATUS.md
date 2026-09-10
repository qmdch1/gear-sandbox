# STATUS — where the project stands

A handover note, so a session starting cold knows what is done, what is deliberately not done,
and what is worth doing next. Read [AGENTS.md](../AGENTS.md) first for how to work here; this is
just the current state.

Keep it short. When something here stops being true, edit it rather than appending.

## Done

**22 presets**, each a complete machine with its own tests: clock, car, castle gate, hoist,
airplane, windmill, bicycle, locomotive, piston engine, factory line shaft, watermill, ferris
wheel, carousel, well pump, conveyor, tower crane, music box, clock tower, gearbox, planetary
hoist, differential axle, worm rotary table. Sixteen stand in the default showroom yard.

**All twelve gear types are now exercised by a real machine.** `differential` and `worm` were the
last holdouts; a test asserts this stays true, because a type no preset uses is a type whose
branch in `meshing.ts` nothing drives end to end.

**Every machine stands on the ground.** The ground plane is opaque, and sixteen presets were
authored with something below y = 0 (the piston engine by 16 units). `src/sim/ground.ts` seats a
machine before it is shown, and a test checks each preset and the whole yard.

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

- **Gearbox, planetary hoist, differential axle and worm table are registered but not in the
  showroom yard.** They work and are
  reachable from the preset panel; they simply have not been placed on the grid. Placing them
  means measuring their extents and checking the cross-machine overlap floor, as `showroom.ts`
  documents.
- **The clock movement and the music box are excluded from the yard on purpose** — they are
  tabletop pieces and read as scale nonsense beside a locomotive.
- **The showroom does not interlock.** Each machine has its own crank. A single power source
  driving the whole yard would need one connected component, and `rotation.ts` silently discards
  every crank but the first in such a component — so it would mean rebuilding each preset's input,
  not just adding belts.

## Known rough edges

- The full suite's runtime swings a lot with machine load — seconds when the box is idle, a
  couple of minutes when something else is running. Most of it is preset tests making hundreds of
  real `tick` calls over large layouts. Nothing is wrong; it is just worth knowing before adding
  another whole-showroom test (see the test-performance note in AGENTS.md).
- Repair is still wired to the UI while wear is off, so the button is permanently disabled. Either
  is defensible — leaving it means the feature is there the moment wear is switched back on.

## If you are looking for something to do

1. Place the four unplaced presets in the yard (measure their extents, check the cross-machine
   overlap floor, and mind that the grid is already 4x4).
2. Interlock a *new* preset rather than the yard: one power source, many stations, is what
   `factory.ts` already demonstrates and could be pushed much further.
3. The `ratchet` type is used but its one-way behaviour is only incidental; a machine built
   *around* a ratchet (a capstan that cannot run back) would exercise it the way the worm table
   now exercises the worm.
