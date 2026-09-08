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

export interface LayoutState {
  gears: GearInstance[];
  remoteLinks: RemoteLink[];
}

export interface SimDiagnostics {
  unconnectedIds: string[];              // no valid edges at all
  noPowerIds: string[];                  // has edges but no path to any crank
  overlapPairs: Array<[string, string]>; // geometrically too-close pairs
}

export interface SimTickResult {
  gears: GearInstance[];
  diagnostics: SimDiagnostics;
}
