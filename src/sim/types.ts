export type GearType =
  | "spur" | "helical" | "crank" | "bevel" | "worm" | "load"
  | "rack" | "planetary" | "ratchet" | "sprocket" | "pulley" | "differential";

export interface GearInstance {
  id: string;
  type: GearType;
  position: [number, number, number];
  axis: [number, number, number]; // normalized rotation axis direction
  teeth: number;       // thread-starts for "worm"; 0 for "load"
  module: number;      // tooth size, used for meshing distance checks; ignored for "load"
  durabilityMax: number;
  durabilityCurrent: number;
  broken: boolean;
  rotation: number;        // accumulated rotation angle in radians
  angularVelocity: number; // signed rad/s; set externally for "crank", computed for others
  linearPosition?: number; // "rack" only: accumulated linear travel along `axis`, in world units
  /** "rack" only: the travel this rack is physically able to make, as [min, max] world units
   *  of `linearPosition`. A real portcullis, lift table or slide bottoms out and tops out; the
   *  simulation clamps `linearPosition` into this range each tick so a constantly-cranked rack
   *  parks at its stop instead of accumulating forever and sailing out of the scene (which it
   *  does without a limit: the castle gate reaches 210 world units after a minute, on a
   *  gatehouse only 34 tall). Omit for an unlimited rack -- the previous, still-default
   *  behaviour. */
  travelLimit?: [number, number];
  /** "crank" only: makes this crank RECIPROCATE instead of turning forever. Once its
   *  accumulated `rotation` reaches either bound while travelling outward, the simulation
   *  flips the sign of its `angularVelocity`, so the whole train it drives runs back the other
   *  way -- a hand winch being cranked up, then back down, or a limit switch reversing a
   *  motor. Because a crank's stored `angularVelocity` is what seeds `propagateRotation`
   *  every tick, flipping it here reverses every gear downstream too. Omit for a crank that
   *  simply runs one way forever -- the default for every continuously-rotating machine
   *  (wheels, sails, propellers, clock trains). */
  reverseAt?: [number, number];
  /** Makes this crank a real MOTOR rather than an ideal velocity source.
   *
   *  Without it a crank simply holds whatever `angularVelocity` it was given -- the honest model
   *  of a hand turning a handle at a chosen rate, and what every machine here did before there
   *  was any dynamics. With it, the crank's speed stops being an input and becomes a RESULT:
   *  `dynamics.ts` integrates it from the torque balance of the whole train, so the machine
   *  spins up from rest at a rate its own inertia decides, sags when a load is hung on it, and
   *  is slowed by the weight of any vehicle its wheels are carrying. Seed such a crank at
   *  `angularVelocity: 0` -- a real machine starts stopped. */
  motor?: import("./dynamics").Motor;
  /** Id of the `Vehicle` this part is bolted to, if any. The simulation never moves it -- the
   *  part keeps the position that makes it mesh with its neighbours -- but the renderer draws
   *  the whole assembly displaced by how far that vehicle has driven, so a car's wheels travel
   *  with its body instead of spinning on the spot in a chassis that drove off without them. */
  ridesOn?: string;
}

export interface MeshEdge {
  a: string;
  b: string;
  kind: "mesh" | "coupling" | "chain" | "belt"; // gear-tooth mesh vs. load shaft-coupling vs. remote-transmission
  ratio: number;             // mesh: b's speed = -ratio * a's speed. coupling: always 1.
  oneWay: "none" | "aToB" | "bToA"; // worm: which side can drive the other
}

export interface RemoteLink {
  a: string;
  b: string;
  kind: "chain" | "belt";
}

/** A body carried along the ground by a driven wheel: a car, a locomotive, a trolley.
 *
 *  This is a SIMULATED body, not a drawing trick. Its mass is reflected into the gear train that
 *  drives it (`dynamics.ts`), so the engine genuinely has to accelerate it and genuinely runs
 *  slower for having to; its rolling resistance is a real fraction of its real weight, so it
 *  travels differently under a different gravity; and `distance` is integrated by `tick` from the
 *  no-slip rolling relation v = w * r, the same angle-times-radius this sandbox already uses to
 *  drive a rack from a pinion. The renderer only ever reads the answer.
 *
 *  Gear POSITIONS deliberately stay where the preset put them: the vehicle's parts keep their
 *  fixed geometric relationship to each other while the whole assembly is displaced by
 *  `distance`, so mesh distances, couplings and overlap checks mean exactly what they meant when
 *  the machine was standing still, and a vehicle driving past a neighbour cannot mesh with it. */
export interface Vehicle {
  id: string;
  /** The driven road wheel whose rotation carries the vehicle. */
  wheel: string;
  /** That wheel's rolling radius, world units. */
  radius: number;
  /** Mass of the whole vehicle, kg. Felt by the engine as `mass * radius^2` of extra inertia. */
  mass: number;
  /** World direction travelled for a positive wheel rotation. */
  direction: [number, number, number];
  /** Rolling-resistance coefficient; defaults to `DEFAULT_ROLLING_RESISTANCE` (0.015, a tyre on
   *  tarmac). The drag it produces is a fraction of the vehicle's WEIGHT, so it changes with the
   *  gravity setting. */
  rollingResistance?: number;
  /** Distance travelled along `direction`, world units. Simulation state, integrated each tick. */
  distance: number;
  /** How far the vehicle is able to travel, [min, max] world units. Reaching a bound is a wall:
   *  travel stops there while the wheels keep turning, which is exactly what a driven wheel does
   *  against a kerb. Omit for a vehicle free to drive as far as it is driven. */
  limit?: [number, number];
}

export interface LayoutState {
  gears: GearInstance[];
  remoteLinks: RemoteLink[];
  /** Vehicles carried by the wheels in `gears`. Absent in layouts that contain no vehicle, which
   *  is every machine bolted to the floor. */
  vehicles?: Vehicle[];
}

export interface SimDiagnostics {
  unconnectedIds: string[];              // no valid edges at all
  noPowerIds: string[];                  // has edges but no path to any crank
  overlapPairs: Array<[string, string]>; // geometrically too-close pairs
}

export interface SimTickResult {
  gears: GearInstance[];
  diagnostics: SimDiagnostics;
  /** The layout's vehicles after this tick, with `distance` advanced. Absent when the layout has
   *  none, so a caller that never deals with vehicles is unaffected. */
  vehicles?: Vehicle[];
}
