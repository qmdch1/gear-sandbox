# STATUS — where the project stands

A handover note, so a session starting cold knows what is done, what is deliberately not done,
and what is worth doing next. Read [AGENTS.md](../AGENTS.md) first for how to work here; this is
just the current state.

Keep it short. When something here stops being true, edit it rather than appending.

## Done

**23 presets**, each a complete machine with its own tests: clock, car, castle gate, hoist,
airplane, windmill, bicycle, locomotive, piston engine, factory line shaft, watermill, ferris
wheel, carousel, well pump, conveyor, tower crane, music box, clock tower, gearbox, planetary
hoist, differential axle, worm rotary table, capstan. Twenty stand in the default showroom yard
(5x4); the clock movement and music box stay out as tabletop pieces.

**All twelve gear types are now exercised by a real machine.** `differential` and `worm` were the
last holdouts; a test asserts this stays true, because a type no preset uses is a type whose
branch in `meshing.ts` nothing drives end to end.

**Every machine stands on the ground.** The ground plane is opaque, and sixteen presets were
authored with something below y = 0 (the piston engine by 16 units). `src/sim/ground.ts` seats a
machine before it is shown, and a test checks each preset and the whole yard.

**The simulation solves real mechanics, not just ratios.** `src/sim/dynamics.ts` integrates each
motorised shaft from its own torque balance (`J_eff·dω/dt = T_eff`, with reflected inertia
`ΣJᵢnᵢ²` and reflected torque `ΣnᵢTᵢ`), so a machine takes time to come up to speed, runs slower
with a load on it, and is held back by the weight it carries. Masses come from the steel volume
each part is drawn as, so no number in there is a tuning knob. `src/sim/gravity.ts` gives loose
parts real free fall and bouncing: contact time is solved algebraically inside the step, so a
drop is exactly `h = gt²/2` and a rebound exactly `e²h` at any frame rate. `src/sim/units.ts`
pins the scale — **one world unit is one centimetre** — and gravity is selectable (Earth, Moon,
Mars, Jupiter, none), reaching both the falling parts and a vehicle's rolling resistance.

**Two machines actually drive.** The car and the locomotive are `Vehicle`s with mass, carried by
no-slip rolling (`distance = wheelRotation × radius`) and turned round by a limit switch that
reverses the motor, so they overshoot while braking exactly as something with momentum should.
Their gears never move: travel is a displacement applied when drawing, which is what keeps
meshing and overlap meaning the same thing parked or moving.

**Sound.** Procedurally synthesised, no audio files: a whirr whose pitch follows the fastest
gear, tooth clatter over it, and a landing thud whose loudness comes from the impact speed.

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

- **The clock movement and music box stay out of the yard on purpose.** They are tabletop
  pieces and read as scale nonsense beside a locomotive. They work and are reachable from the
  preset panel; placing them would mean measuring their extents and checking the cross-machine
  overlap floor, as `showroom.ts` documents.
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
- **Dropped parts fall through machines.** There is no contact between a loose part and a gear —
  only with the ground. A part dropped onto the locomotive lands on the floor beside it.
- **Only two machines are motorised.** The other twenty-one cranks are still ideal velocity
  sources: honest as "a hand turning a handle at a chosen rate", but they do not spin up and do
  not sag under load. Converting one is a small change (`motor` on its crank, seed it at rest)
  but it changes that preset's numbers, so its tests move with it.
- **A `load` gear is a damper, not a weight.** Nothing hangs off a drum, so a hoist does not feel
  what it is lifting. This is the biggest remaining gap between the model and the machines it
  draws.
- **All twenty-three presets have now had a defect audit, and every one yielded real defects.**
  Roughly seventy findings in total, each reproduced by measurement before it was acted on, and
  each fix proved by injection: break the thing the test names, watch it go red, revert. Two
  classes dominated. First, assertions that could not fail -- about thirty, now removed, with
  `tests/meta/vacuousAssertions.test.ts` blocking the commonest shape mechanically. Second,
  parts drawn through other parts, all of them invisible to the simulation: windmill sails
  inside the tower, capstan bars sweeping the drum, a tower-crane cab through each mast leg four
  times a revolution, a clock hand buried in its bezel, four spark plugs inside a rocker cover,
  a well mouth paved over with stone, and two clamp bars drawn inside each other over 3.7 units.
  A carousel, a bicycle and a set of millstones were all hovering over the things said to carry
  them.

  A third pattern is worth naming because it recurred five times: a preset deliberately adds an
  asymmetric part -- sails, spokes, paddles, a key on a shaft -- precisely so that rotation is
  legible, and then nothing tests that the part is still attached or still visible. Detaching
  all forty asymmetric props from the water wheel left its suite green with the wheel rendering
  pixel-identical every frame.

  What no longer needs doing: the audit itself. What a future session should be suspicious of is
  any NEW preset, since every existing one arrived with defects of exactly these kinds.

## If you are looking for something to do

1. **Make a weight actually pull.** A `load` could carry a mass and a lever arm and contribute a
   constant `m·g·r` torque instead of viscous damping — then a hoist really would strain, run
   slower lifting than lowering, and overhaul when released. Everything needed is already in
   `dynamics.ts`; it is a new term in the torque sum plus a `load`'s mass, and it would close the
   gap listed under rough edges above.
2. Interlock a *new* preset rather than the yard: one power source, many stations, is what
   `factory.ts` already demonstrates and could be pushed much further.
3. The yard is a 5x4 grid and is full. A 24th machine means either a wider grid (and a bigger
   `GROUND_SIZE`, which `chainGeometry.ts`'s cap derivation cites) or deciding a machine belongs
   on the bench instead.
4. `planetary` is used but only as an ordinary reduction wheel; a machine built *around* a real
   sun/planet/ring arrangement would exercise it the way the capstan now exercises the ratchet.
