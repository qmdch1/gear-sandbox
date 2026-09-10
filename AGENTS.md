# AGENTS.md — working on Gear Sandbox

Onboarding for an AI agent (or a new human) picking this repo up cold. `README.md` is the
user-facing tour; this file is the stuff that is expensive to rediscover — the invariants,
the traps, and how to prove a change actually works. For what is currently built, what is
deliberately unfinished, and what to pick up next, see [docs/STATUS.md](docs/STATUS.md).

## What this is

A browser gear-simulation sandbox: place gears, mesh them, link them with belts and chains,
watch the train turn. Ships 20 fully-modelled example machines ("presets") — a locomotive, a
factory line shaft, a clock tower, a music box, a tower crane, and so on.

Stack: TypeScript + Vite + THREE.js on the client, a small Express + better-sqlite3 server for
saved layouts. Tests are Vitest. There is no framework — plain modules.

```
src/sim/        the simulation core: types, meshing rules, graph, rotation, wear, simulation
src/sim/presets/  one module per example machine (22 files: 20 presets + index + wheels helper)
src/render/     THREE.js: scene, gear geometry, props, procedural textures, chain/belt ribbons
src/ui/         DOM panels (palette, diagnostics, durability, save/load, presets)
src/interaction/  placement + drag controls
src/persistence/  serialize + localStorage + server sync
server/         Express API for saved layouts
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
npx vitest run          # full suite (~160s; 700+ tests)
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
THREE.js, plus jsdom for render tests) exhausted memory — the suite went from 9s to 96s, tests
timed out purely from contention, and a worker failed to start outright.

Note `poolOptions.forks.maxForks` was REMOVED in Vitest 4 and is silently ignored. The working
keys are top-level `maxWorkers` / `minWorkers`.

Keep individual tests cheap. Ticking the whole 16-machine showroom for minutes of simulated time
once made four tests take 320s between them; the invariants they checked hold for any layout, so
they now use a 3-gear preset and run in 6s. Pick the smallest layout that exercises the thing.

## Simulation invariants

### Meshing (`src/sim/meshing.ts` is the authority)

- Two gears mesh only when their centres sit `pitchRadius(a) + pitchRadius(b)` apart, within
  `MESH_TOLERANCE` (5%). `pitchRadius = module * teeth / 2`.
- `bevel` needs perpendicular axes (`|dot| < 0.1`); `worm` has its own rule and sets `oneWay`;
  `pulley` / `load` are COINCIDENT_ONLY — they take drive only by sharing a position and axis
  with what drives them.
- **`evaluatePair` does NOT check `module`.** Two gears with different tooth SIZES will happily
  form a simulation edge and render as a visibly impossible pair. Every meshing wheel in a train
  must share one module — assert it in your test for every mesh edge `buildEdges` produces.
- `classify` flags an overlap when centres sit closer than `0.95 * (rA + rB)`, and it does not
  care that two gears belong to different machines. This is what constrains showroom layout.

### Rotation (`src/sim/rotation.ts`)

- A `mesh` edge carries sign **−1** (an external tooth mesh reverses direction). `coupling`,
  `belt` and `chain` all carry **+1**.
- Mesh ratio is `teeth_a / teeth_b`. Belt ratio is `pitchRadius(a) / pitchRadius(b)`. Chain ratio
  is teeth-based. They are not interchangeable.
- Cranks are the only inputs. Roots are picked by `type === "crank"`, and if two cranks end up in
  one connected component, the first one in array order wins and the other's commanded speed is
  **silently discarded**. Separate clusters each with their own crank are fine — the tower crane
  and the bicycle both rely on that.
- A gear with no edges at all is `unconnectedIds`. A lone crank driving only props still counts
  as unconnected — give it a coincident `load` partner (see the clock tower's pendulum).

### Wear

`wear.ts` only ever subtracts, and a gear at zero durability is `broken`, which `rotation.ts`
treats as a dead end that stops relaying drive. Left on, any layout destroys itself: the showroom
loses its first gear at ~90s and has 27 of 72 broken by 150s.

**The app runs with wear off** (`tick(layout, dt, timeScale, { wear: false })` in `main.ts`).
The default stays `true` so the mechanic and its tests are unchanged. `src/sim/repair.ts` restores
durability, wired to a per-gear button and a "전체 수리" toolbar action.

Durability and wear rate are per type (`gearDefs.ts`): `spur` is 100 / 1.0 per second — exactly
100s to failure — while `pulley` is 130 / 0.5. If you need a test where something actually wears
out, use a preset with `spur` gears; a car's `pulley` wheels will not fail inside a short window.

## Making things move (`src/render/props.ts`)

Props are decorative, non-simulated meshes. They never mesh, rotate, persist or get diagnosed —
but they are not all static. Five mechanisms drive them, all derived from a gear's **accumulated
`rotation`** (not its velocity), so everything is frame-rate independent and deterministic:

| field | motion | used by |
|---|---|---|
| `attachTo` | spins about the gear's axis, around **the gear's centre** | sails, spokes, hands, jibs |
| `slideWith` | translates along a rack's axis by its `linearPosition` | castle gate |
| `windWith` | rope on a drum: `rotation × radius` along a direction, clamped | hooks, buckets, parcels |
| `linkTo` | crank-slider: pin + rigid rod + slider on an axis | pistons, driving rods, pumpjack |
| (gear) `reverseAt` | makes a crank oscillate instead of turning through | pendulums, gates, hoists |

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
- Anything with finite travel must be bounded by `reverseAt` or `travelLimit`, or it accumulates
  forever and leaves the scene (the castle gate reached 210 units on a 34-unit gatehouse).

## Rendering notes

- A rendered tooth reaches **one full module past the pitch circle**
  (`addendum = 1 × module`, `dedendum = 1.25 × module`). Measure prop clearances against that tip
  radius, not the pitch radius, or you leave a `module`-sized interference at every rim.
- Belts and chains travel: their run is driven by `a.rotation * pitchRadius(a)`. Chain links wrap
  (the straight run is one side of a closed loop); belts scroll a ribbed texture instead, since a
  smooth tube has nothing discrete to move.
- `src/render/textures.ts` generates seven greyscale patterns (wood, stone, brick, metal, fabric,
  tile, rust) at 512², used as `map` + `bumpMap` + `roughnessMap`. Greyscale on purpose: the map
  multiplies the prop's own `color`, so one "wood" reads as pine or walnut depending on the colour,
  and gear type/durability colour-coding survives untouched.
- Everything degrades gracefully with no canvas backend (jsdom, headless): `getProceduralTexture`
  returns `null` and the surface stays flat-coloured. `createScene` guards `renderer.shadowMap` for
  the same reason — under jsdom there is no WebGL context and THREE leaves it undefined.
- `GROUND_SIZE` (`scene.ts`) is the single source of truth for the ground plane. `showroom.ts` lays
  machines out inside it and `chainGeometry.ts` derives its worst-case chain length from its
  diagonal — change it in one place and update that derivation.

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

The test should verify gear list and positions, real edges via the real `evaluatePair`, clean
`classify`, the ratio claim over hundreds of real `tick` calls, that every `attachTo`/`windWith`/
`linkTo` names a gear that exists, and one module per mesh.

## Showroom

`src/sim/showroom.ts` places 16 machines on a 4×4 grid (130 × 120 pitch) as the default first
view. Placement is derived from each preset's **measured** extent, not eyeballed — the factory
spans 114 units of X and the locomotive 103 of Z, and those set the pitch. Two machines' gears
must also clear the overlap floor even though they are unrelated. The clock movement and music box
are deliberately excluded: they are tabletop pieces and read as scale nonsense beside a locomotive.

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
