import type { FallingBody } from "./gravity";

/** The loose parts that can be dropped into the yard, as the three materials a workshop floor
 *  actually collects: a hardened steel ball, a stone offcut, a rusted lump.
 *
 *  The numbers are the measured ones, not stylistic choices. Coefficient of restitution is what
 *  separates them: a hardened steel ball on a steel plate returns about 0.85 of its approach
 *  speed (so it comes back to roughly three quarters of the height it was dropped from and
 *  bounces for a long time), stone on concrete is around 0.4, and corroded iron barely rebounds
 *  at all. Densities are likewise real -- steel 7850, granite 2700, rusted iron about 5200
 *  kg/m^3 -- and mass is worked out from the sphere the part is actually drawn as, so a big
 *  stone really is heavier than a small ball. */
export interface PartKind {
  /** Matched by `render/fallingBodies.ts` against the body's id to choose a texture. */
  name: "steel" | "stone" | "rust";
  density: number;
  restitution: number;
  radius: number;
}

export const PART_KINDS: PartKind[] = [
  { name: "steel", density: 7850, restitution: 0.85, radius: 2.5 },
  { name: "stone", density: 2700, restitution: 0.4, radius: 4 },
  { name: "rust", density: 5200, restitution: 0.22, radius: 3.2 },
];

/** Height above the ground a dropped part starts from, world units -- 3 metres, about the
 *  height of a workshop ceiling, and far enough that the fall is clearly a fall (0.78 s on
 *  Earth, a lazy 1.9 s on the Moon) rather than a twitch. */
export const DROP_HEIGHT = 300;

/** Builds the `index`-th dropped part at `position`.
 *
 *  Deterministic in `index`: the kinds cycle in order, so dropping five parts always gives the
 *  same five, a test can say exactly what it expects, and the sandbox never surprises a user
 *  with a run of identical ones the way independent random picks would. */
export function makeDroppedPart(index: number, position: [number, number, number]): FallingBody {
  const kind = PART_KINDS[index % PART_KINDS.length];
  const radiusMetres = kind.radius / 100; // one world unit is a centimetre (units.ts)
  return {
    id: `part-${index}-${kind.name}`,
    position,
    velocity: [0, 0, 0],
    radius: kind.radius,
    mass: kind.density * (4 / 3) * Math.PI * radiusMetres ** 3,
    restitution: kind.restitution,
    rotation: 0,
    resting: false,
  };
}
