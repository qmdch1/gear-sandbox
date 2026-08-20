export type GearType =
  | "spur"
  | "helical"
  | "crank"
  | "bevel"
  | "worm"
  | "load"
  | "gauge"
  | "fan"
  | "wheel"
  | "shaft"
  | "beam"
  | "belt";

export interface GearInstance {
  id: string;
  type: GearType;
  position: [number, number, number];
  // For "shaft"/"beam"/"belt" only: its OTHER end (position is the first end) -- a
  // rod/strap connecting two separate parts at a distance, rather than a single
  // point coupling onto one host like load/gauge/fan/wheel do. Every other type
  // leaves this undefined.
  position2?: [number, number, number];
  axis: [number, number, number]; // normalized rotation axis direction; unused for "shaft"/"beam"/"belt" (their orientation is derived from position/position2 instead)
  teeth: number;       // thread-starts for "worm"; 0 for "load"/"gauge"/"fan"/"wheel"/"shaft"/"beam"/"belt" (no teeth to mesh)
  module: number;      // tooth size, used for meshing distance checks; ignored for "load"/"gauge"/"fan"/"wheel"/"shaft"/"beam"/"belt"
  durabilityMax: number;
  durabilityCurrent: number;
  broken: boolean;
  rotation: number;        // accumulated rotation angle in radians
  angularVelocity: number; // signed rad/s; set externally for "crank", computed for others -- for "belt", this stores a linear "belt speed" (radius * rad/s) instead of a true angular velocity, since its two ends can drive/be driven by differently-sized pulleys (see meshing.ts's beltCouplingEnd)
}

export interface MeshEdge {
  a: string;
  b: string;
  // gear-tooth mesh / rigid (or belt/chain, same-direction, radius-ratio) shaft
  // coupling / a purely rigid, NON-rotating structural joint (a "beam" endpoint
  // coincident with something else -- see meshing.ts's beamJoinsAt). "structural"
  // edges group parts together for dragging (graph.ts's connectedComponentIds)
  // but never carry rotation (rotation.ts's propagateRotation skips them).
  kind: "mesh" | "coupling" | "structural";
  ratio: number;             // mesh: b's speed = -ratio * a's speed. coupling (shaft/load/etc): 1. coupling (belt-to-pulley): that pulley's pitch radius (see meshing.ts). structural: irrelevant, carries no rotation at all.
  oneWay: "none" | "aToB" | "bToA"; // worm: which side can drive the other
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
