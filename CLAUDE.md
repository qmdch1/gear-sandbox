# CLAUDE.md

Agent instructions for this repo live in **[AGENTS.md](AGENTS.md)** — read that first.

It is kept as `AGENTS.md` rather than duplicated here so every tool that looks for a
conventional agent file finds the same, single copy. This file exists only because Claude Code
looks for `CLAUDE.md` by name.

The short version, if you read nothing else:

- **Verify with all three**: `npx vitest run`, `npx tsc --noEmit`, `npx vite build`. Vitest does
  not type-check, so `tsc` catches real bugs it misses.
- **This sim models angular velocity and rotation only.** Never claim torque, force, mechanical
  advantage or load capacity — there is no force model to make such a claim honest.
- **Never write "the test asserts X" unless you wrote that assertion.**
- Comments explain *why*, with the measurement that justified the number. Commit messages are
  Korean and do the same; user-facing strings and gear ids are Korean, code is English.
