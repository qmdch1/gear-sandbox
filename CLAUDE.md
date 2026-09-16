# CLAUDE.md

Agent instructions for this repo live in **[AGENTS.md](AGENTS.md)** — read that first.

It is kept as `AGENTS.md` rather than duplicated here so every tool that looks for a
conventional agent file finds the same, single copy. This file exists only because Claude Code
looks for `CLAUDE.md` by name.

The short version, if you read nothing else:

- **Verify with all three**: `npx vitest run`, `npx tsc --noEmit`, `npx vite build`. Vitest does
  not type-check, so `tsc` catches real bugs it misses.
- **The sim models real mechanics now** — torque, moment of inertia, motor torque–speed curves,
  mass from drawn volume, friction, and gravity at 9.80665 m/s² — with **one world unit = one
  centimetre** (`src/sim/units.ts`). So spin-up times, reflected inertia and vehicle travel are
  fair to claim. What is still absent: weight does not load a train (a `load` is a damper, not a
  hanging mass), there is no traction limit, no contact between parts, and no failure under load.
  See AGENTS.md's "only claim what you verified" for the full line.
- **Never write "the test asserts X" unless you wrote that assertion.**
- Comments explain *why*, with the measurement that justified the number. Commit messages are
  Korean and do the same; user-facing strings and gear ids are Korean, code is English.
