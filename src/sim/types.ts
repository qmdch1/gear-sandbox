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
  edgeKeys: Set<string>; // pass back into the next tick() call's `previousEdgeKeys`
}
