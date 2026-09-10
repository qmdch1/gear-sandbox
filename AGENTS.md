# AGENTS.md — working on Gear Sandbox

Onboarding for an AI agent (or a new human) picking this repo up cold. `README.md` is the
user-facing tour; this file is the stuff that is expensive to rediscover — the invariants,
the traps, and how to prove a change actually works. For what is currently built, what is
deliberately unfinished, and what to pick up next, see [docs/STATUS.md](docs/STATUS.md).

Every factual claim here was checked against the source. If you find one that is wrong, fix it
here in the same change — a doc other agents trust is worse than no doc when it drifts.

## What this is

A browser gear-simulation sandbox: place gears, mesh them, link them with belts and chains,
watch the train turn. Ships 22 fully-modelled example machines ("presets") — a locomotive, a
factory line shaft, a clock tower, a music box, a tower crane, and so on.

Stack: TypeScript + Vite + THREE.js on the client, a small Express + better-sqlite3 server for
saved layouts. Tests are Vitest. There is no framework — plain modules.

```
src/main.ts       entry point: builds the DOM, seeds the showroom, owns the frame loop
src/sim/          simulation core: types, meshing, graph, rotation, wear, repair, simulation
src/sim/presets/  one module per example machine (24 files: 22 presets + index + wheels helper)
src/render/       THREE.js: scene, gear geometry, props, procedural textures, chain/belt ribbons
src/ui/           DOM panels (palette, diagnostics, durability, save/load, presets)
src/interaction/  placement + drag controls
src/runtime/      dirtyTracker (unsaved-changes state) + frameSafety (one throw inside rAF must
                  not permanently freeze the app)
src/persistence/  serialize + localStorage + server sync
server/           Express API for saved layouts
tests/            mirrors src/ (tests/sim, tests/render, tests/ui, tests/integration, ...)
```

## The one rule that matters most: only claim what you verified

This sandbox models **angular velocity and rotation. Nothing else.** There is no torque, no
force, no mass, no friction, no load capacity.

So: never write that a mechanism "provides mechanical advantage", "lifts N", "is stronger",
or "delivers torque". A winch here trades crank speed for nothing — it just turns slower.
Ratios, directions and travel distances are fair game because they are real outputs of the
model; anything about force is not.

The same applies to comments about tests. **Do not write "the test asserts X" unless you wrote
that assertion.** Several files in this repo once claimed tests that did not exist; they were
caught and written, but the habit is what causes it.

## Verifying a change

```bash
npx vitest run          # full suite (796 tests in 68 files); `npm test` is the same thing
npx tsc --noEmit        # types — vitest does NOT type-check, so this catches real bugs it misses
npx vite build          # production build
```

Run all three before calling anything done. `tsc` in particular has caught type errors in test
files that passed `vitest` cleanly.

To run one file while iterating: `npx vitest run tests/sim/presets/<name>.test.ts`.

**If several agents are writing files concurrently, only run your own test file.** A whole-suite
run will read someone else's half-written module and fail with a confusing transform error that
is not your bug.

### Test performance

`vitest.config.ts` caps `maxWorkers` at 6 and sets a 20s timeout. Both are deliberate: this
machine has 18 cores but only a couple of GB free, and one worker per core (each loading its own
THREE.js, plus jsdom for render tests) exhausted memory — the suite went from 5s to 96s, tests
timed out purely from contention, and a worker failed to start outright.

Note `poolOptions.forks.maxForks` was REMOVED in Vitest 4 and is silently ignored. The working
keys are top-level `maxWorkers` / `minWorkers`.

Keep individual tests cheap. Ticking the whole 16-machine showroom for minutes of simulated time
once made four tests take 320s between them; the invariants they checked hold for any layout, so
they now use a 3-gear preset and run in 6s. Pick the smallest layout that exercises the thing.

## Simulation invariants

### Meshing (`src/sim/meshing.ts` is the authority)

- Two gears form a tooth mesh when their centres sit `pitchRadius(a) + pitchRadius(b)` apart,
  within `MESH_TOLERANCE` (5% of that sum). `pitchRadius = module * teeth / 2`.
- **A rack is the exception**, checked first and by a different rule: the pinion's centre must sit
  `pitchRadius(pinion)` from the rack's infinite axis line (within 5% of that pinion radius), with
  perpendicular axes. The rack's own radius does not enter — but the edge is still `kind: "mesh"`,
  so an audit that assumes the sum rule will wrongly flag every rack and pinion.
- `bevel` needs perpendicular axes (`|dot| < 0.1`); `worm` has its own rule and sets `oneWay`.
- **COINCIDENT_ONLY is `load`, `differential`, `sprocket`, `pulley`** — they take drive by sharing
  a position and axis with what drives them. `sprocket` and `pulley` matter most: a chain/belt
  `RemoteLink` only relates two already-placed gears, so without a coincident coupling a sprocket
  or pulley has no path to a crank at all. `differential` is the exception inside the set: when it
  is *not* coincident it falls through to the perpendicular bevel check and can mesh after all.
- **`evaluatePair` does NOT check `module`.** Two gears with different tooth SIZES will happily
  form a simulation edge and render as a visibly impossible pair. Every meshing wheel in a train
  must share one module — assert it in your NEW preset's test for every mesh edge `buildEdges`
  produces. It now holds repo-wide — `clock.ts` was the last violator and was rebuilt at one
  module — so an audit across all presets is safe.
- `classify` flags an overlap when centres sit closer than
  `0.95 * (overlapRadius(a) + overlapRadius(b))`. `overlapRadius` is the pitch radius for a toothed
  gear but `module * 2` for a zero-teeth object like `load`, which has no pitch circle yet still
  occupies space. **Any pair `evaluatePair` returns an edge for is exempt**, so a deliberately
  coincident load or worm coupling is never an overlap. It does not care that two gears belong to
  different machines — which is what constrains showroom layout.

### Rotation (`src/sim/rotation.ts`)

- A `mesh` edge carries sign **−1** (an external tooth mesh reverses direction). `coupling`,
  `belt` and `chain` all carry **+1**.
- Mesh ratio is `teeth_a / teeth_b`. Belt ratio is `pitchRadius(a) / pitchRadius(b)`. Chain ratio
  is teeth-based. They are not interchangeable.
- `edge.ratio` is the **a→b** figure and is inverted when the walk crosses it backwards
  (`isForward ? edge.ratio : 1 / edge.ratio`). Deriving a speed by hand means knowing which way
  the traversal reached that edge, not just reading `ratio`.
- **A rack gets no angular velocity at all.** It receives a linear velocity of
  `driverSpeed * pitchRadius(driver)`, signed by traversal direction rather than by the −1 mesh
  sign. Its travel comes from the *driver's* radius, never its own.
- Cranks are the only inputs. Roots are `type === "crank" && !broken`, and if two cranks end up in
  one connected component, the first in array order wins and the other's commanded speed is
  **silently discarded**. Separate clusters each with their own crank are fine — the tower crane
  and the bicycle both rely on that.
- A gear with no edges at all is `unconnectedIds`. A lone crank driving only props still counts as
  unconnected — give it a coincident `load` partner (see the clock tower's pendulum).

### Wear

`wear.ts` only ever subtracts, and a gear at zero durability is `broken`, which `rotation.ts`
treats as a dead end that stops relaying drive. Left on, any layout destroys itself: the showroom
loses its first gear at **~67s** (a bevel driving a load: 120 / (1.2 × 1.5)) and has 27 of 72
broken by 150s.

Two details decide when things actually fail:

- **`loadWearMultiplier` is per COMPONENT, not per edge.** `simulation.ts` floods the whole
  connected component, so one `load` anywhere in a train makes every gear in it wear faster.
- A gear spinning slower than `MIN_SPIN_TO_WEAR` (0.01 rad/s) does not wear at all, which is why
  unpowered halves of a layout survive indefinitely. Wear also scales with `timeScale`.

**The app runs with wear off** (`tick(layout, dt, timeScale, { wear: false })` in `main.ts`).
The default stays `true` so the mechanic and its tests are unchanged. `src/sim/repair.ts` restores
durability, wired to a per-gear button and a "전체 수리" toolbar action.

Durability and wear rate are per type (`gearDefs.ts`): `spur` is 100 durability / 1.0 per second,
so 100s to failure with **no** `load` in its component — but 66.7s with one, since spur's
`loadWearMultiplier` is 1.5. `pulley` is 130 / 0.5. If you need a test where something actually
wears out, use a preset with `spur` gears; a car's `pulley` wheels will not fail inside a short
window.

## Making things move (`src/render/props.ts`)

Props are decorative, non-simulated meshes. They never mesh, rotate, persist or get diagnosed —
but they are not all static. Five mechanisms drive them. Four read accumulated state rather than
velocity, so they are frame-rate independent and deterministic: `attachTo`, `windWith` and
`linkTo` read the gear's accumulated `rotation`; `slideWith` reads a rack's separately accumulated
`linearPosition`.

| field | motion | used by |
|---|---|---|
| `attachTo` | spins about the gear's axis, around **the gear's centre** | sails, spokes, hands, jibs |
| `slideWith` | translates along a rack's axis by its `linearPosition` | castle gate |
| `windWith` | rope on a drum: `rotation × radius` along a direction, clamped | hooks, buckets, parcels |
| `linkTo` | crank-slider: pin + rigid rod + slider on an axis | piston engine, locomotive rods, factory |
| (gear) `reverseAt` | makes a crank oscillate instead of turning through | pendulums, gates, hoists |

`reverseAt` and `travelLimit` are **type-restricted**: `reverseAt` applies to a `crank` only,
`travelLimit` to a `rack` only. They are not interchangeable ways to bound any moving thing.

The `linkTo` rod contract is easy to violate silently: the rod prop's **authored length must equal
`rodLength`**, and its long axis must be local **+Y**, because the solver re-points that axis along
pin→slider each frame. `rodLength` must also exceed `crankRadius` or the linkage cannot close.

Traps, each of which has bitten this repo already:

- **`attachTo` rotates about the GEAR's centre, not the prop's own.** A clock hand drawn on a
  dial at y=62 but attached to a wheel at y=10 swept a 52-unit circle out of the tower. If a hand
  must turn on a dial, that dial's centre and the gear's centre have to coincide — which is why
  the clock tower has a separate hour sub-dial.
- **A rotationally symmetric prop shows no motion.** A disc, cylinder, cone or ring spun about its
  own axis is pixel-identical every frame however fast it turns. Wheels, drums and pulleys need
  spokes, bars or blades attached before rotation is visible at all.
- **`windWith` composes with `attachTo`** (the winding pass adds its lift on top of the spun
  position). It did not always — a crane's jib orbited the mast while the hook hung behind in
  mid-air.
- **A crank-slider is not a pendulum.** `linkTo` converts rotation into STRAIGHT-LINE
  reciprocation; a "pendulum" built from one slid sideways on a rail. A pendulum needs oscillating
  *rotation*: a crank with `reverseAt` plus `attachTo`.
- Anything with finite travel must be bounded, or it accumulates forever and leaves the scene (the
  castle gate reached 210 units on a 34-unit gatehouse).

## Rendering notes

- For the involute types (spur, helical, crank, bevel, rack) a rendered tooth reaches **one full
  module past the pitch circle** (`addendum = 1 × module`, `dedendum = 1.25 × module`). Measure
  prop clearances against that tip radius, not the pitch radius, or you leave a `module`-sized
  interference at every rim. The non-involute bodies (worm, planetary, ratchet, sprocket, pulley,
  load, differential) are drawn by their own builders — check `gearGeometry.ts` before assuming
  the same margin.
- Belts and chains travel: their run is driven by `a.rotation * pitchRadius(a)`. Chain links wrap
  (the straight run is one side of a closed loop); belts scroll a ribbed texture instead, since a
  smooth tube has nothing discrete to move. Belt ribbons get `map` + `bumpMap` only — the
  `roughnessMap` triple below is props and gears.
- `src/render/textures.ts` generates seven greyscale patterns (wood, stone, brick, metal, fabric,
  tile, rust) at 512², used as `map` + `bumpMap` + `roughnessMap`. Greyscale on purpose: the map
  multiplies the prop's own `color`, so one "wood" reads as pine or walnut depending on the colour,
  and gear type/durability colour-coding survives untouched.
- Everything degrades gracefully with no canvas backend: `getProceduralTexture` returns `null` and
  the surface stays flat-coloured. `createScene` guards `renderer.shadowMap` and re-checks it
  before building the PMREM environment. Note the real `THREE.WebGLRenderer` constructor **throws**
  under jsdom rather than degrading, so scene tests mock it (`vi.mock("three", ...)`).
- `GROUND_SIZE` (`scene.ts`, currently 600) sizes the ground plane and grid. Nothing else imports
  it: `showroom.ts` hardcodes its cell offsets and `chainGeometry.ts` only names it in the comment
  justifying `CHAIN_MAX_LINKS`. If you change it, update both by hand.

## Writing a preset

Each preset is a deliberately **self-contained** module: it duplicates its own `seedGear` helper
rather than importing one, so it reads as a complete, hand-verifiable spec of one mechanism.
`windmill.ts` is the simplest good reference; `musicbox.ts` and `clocktower.ts` are the most
thorough (derived constants, clearances against tip radii, doc comments that explain *why* each
number is what it is).

Requirements:

1. Two files: `src/sim/presets/<name>.ts` and `tests/sim/presets/<name>.test.ts`.
2. Every gear id prefixed with the Korean machine name + `_`, so ids stay unique across presets
   (the showroom concatenates them all into one layout).
3. `classify` must report `unconnectedIds: []`, `noPowerIds: []`, `overlapPairs: []`.
4. Derive positions arithmetically and show the arithmetic in a comment. Do not guess coordinates.
5. Export the constants the tests need, so a later change to tooth counts updates both sides at
   once instead of silently drifting from hardcoded numbers.
6. Register it in `src/sim/presets/index.ts` (label in Korean, shown in the preset panel).
7. **If it belongs in the yard, also add it to `src/sim/showroom.ts`** — `index.ts` is only the
   preset panel. A machine registered but not placed simply never appears in the default view.

The test should verify gear list and positions, real edges via the real `evaluatePair`, clean
`classify`, the ratio claim over hundreds of real `tick` calls, that every `attachTo`/`windWith`/
`linkTo` names a gear that exists, and one module per mesh.

## Showroom

`src/sim/showroom.ts` places 16 machines on a 4×4 grid (130 × 120 pitch) as the default first
view. Placement is derived from each preset's **measured** extent, not eyeballed — the factory
spans 114 units of X and the locomotive 103 of Z, and those set the pitch. Two machines' gears
must also clear the overlap floor even though they are unrelated.

Four presets stay out of the yard: the clock movement and music box (tabletop pieces that read as
scale nonsense beside a locomotive), plus the gearbox and planetary hoist (added later and never
wired in). All four remain available from the preset panel.

`SceneSync.fitAll` clamps its computed camera distance to `controls.maxDistance`, so a ceiling
below what the scene needs crops the view **silently**. There is a test that recomputes the
requirement so growing the yard past it fails loudly instead.

## Local setup

```bash
npm install
npm run dev          # client + API server
npm run dev:client   # client only — what the preview uses
```

`.claude/launch.json` pins the dev server to a free port with `--strictPort`; 5173 belongs to an
unrelated project on this machine. The preview never uses the API server, so it runs `dev:client`.

## Language

User-facing strings, gear ids and preset labels are **Korean**. Code comments and identifiers are
**English**. Commit messages in this repo are Korean, and they explain *why* — including what was
measured and what was wrong before. Match that.
