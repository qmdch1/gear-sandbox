import * as THREE from "three";

/** Link pitch (center-to-center spacing) expressed as a multiple of the ribbon's width --
 *  keeps discrete links proportioned to how thick the chain itself is, rather than an
 *  absolute size that would look either too fine or too chunky as `width` varies. */
const CHAIN_LINK_PITCH_FACTOR = 3;
/** Fraction of each link's pitch left as a visible gap to its neighbor, so the chain reads
 *  as a sequence of discrete segments instead of a solid (if faceted) bar. */
const CHAIN_LINK_GAP_FACTOR = 0.3;
/** However short the span, a "chain" of fewer than this many links wouldn't read as a
 *  chain at all -- floor it the same way a real chain can't have a fractional link. */
const CHAIN_MIN_LINKS = 3;

/** Hard ceiling on chain link count. Without one, `linkCount` scales linearly and
 *  unbounded with the distance between the two remote-linked endpoints -- and that
 *  distance is *not* meaningfully bounded by the camera: `scene.ts`'s
 *  `controls.maxDistance` only limits how far the camera sits from its orbit
 *  *target*, and OrbitControls' default panning lets that target move anywhere (nothing
 *  in this codebase clamps `controls.target`), so a user can always pan-then-zoom-in to
 *  precisely click-to-place (`placementControls.ts`) on any point of the actual bound:
 *  the `groundPlane` (`scene.ts`, GROUND_SIZE on a side) itself, whose raycast hits can't
 *  fall outside its own finite mesh. Worst case is therefore the plane's diagonal,
 *  GROUND_SIZE * sqrt(2) -- at today's 600, about 849 units. At the chain width
 *  `sceneSync.ts` hardcodes (0.15), that is an uncapped
 *  round(849 / (0.15 * CHAIN_LINK_PITCH_FACTOR)) = 1885 links -- 1885 * 36 = 67,860
 *  vertices for a single ribbon mesh, and reachable through ordinary UI interaction rather
 *  than only in theory. (The plane was 500 a side when this cap was first derived, giving
 *  1571 links; the yard has since grown and may grow again, which is precisely why the cap,
 *  not the plane size, is what bounds this.)
 *  Capping at 250 links bounds any one chain ribbon to 250 * 36 = 9,000 vertices --
 *  comfortably in "smooth interactivity" territory -- while sitting far above what
 *  ordinary use needs (the bundled default layout's demo chain, 30 units apart, needs
 *  only 67 links) so it only engages for the pathological long-distance chains this risk
 *  is actually about. `actualPitch`/`linkLength` are recomputed from the *capped*
 *  `linkCount`, so hitting the cap just spaces links out further -- it never breaks or
 *  overlaps the geometry. */
export const CHAIN_MAX_LINKS = 250;

/** How many links a run of `distance` gets, and how far apart they sit. Split out so both the
 *  geometry builder and `chainLinkPositions` derive them from one place -- if they disagreed,
 *  the links would travel at a different pitch than they are drawn at and visibly stutter. */
export function chainLinkLayout(distance: number, width: number): { linkCount: number; pitch: number } {
  const desiredPitch = width * CHAIN_LINK_PITCH_FACTOR;
  const rawLinkCount = Math.round(distance / Math.max(desiredPitch, 1e-6));
  const linkCount = Math.min(CHAIN_MAX_LINKS, Math.max(CHAIN_MIN_LINKS, rawLinkCount));
  return { linkCount, pitch: distance / linkCount };
}

/** The normalized positions (t in [0, 1) along a->b) of every chain link, given how far the
 *  chain has TRAVELLED in world units.
 *
 *  This is what makes a chain look driven rather than painted on. The ribbon's geometry depends
 *  only on its two endpoints, and gears never move, so without a travel term every frame
 *  produced byte-identical links: the sprockets spun while the chain between them sat perfectly
 *  still. Feeding in the driving sprocket's own travel (its accumulated rotation times its pitch
 *  radius -- the same angle x radius relation `rotation.ts` uses to drive a rack from a pinion)
 *  makes the links crawl at exactly the rim speed of the wheel pulling them.
 *
 *  Links wrap: one leaving the far end reappears at the near end, which is what a real chain --
 *  a closed loop of which this straight run is one side -- actually does. So the count is
 *  constant and the spacing never gaps. */
export function chainLinkPositions(distance: number, width: number, travel: number): number[] {
  const { linkCount, pitch } = chainLinkLayout(distance, width);
  const phase = pitch > 0 ? travel / pitch : 0;
  const out: number[] = [];
  for (let i = 0; i < linkCount; i++) {
    // Modulo twice so a negative travel (a chain running backwards) still lands in [0, count).
    const slot = (((i + 0.5 + phase) % linkCount) + linkCount) % linkCount;
    out.push(slot / linkCount);
  }
  return out;
}

/** A thin tube-shaped ribbon spanning two world points -- stands in for a chain or belt
 *  segment between two remote-linked sprockets/pulleys. Rebuilt on every SceneSync.sync()
 *  call (Task 14) since both endpoints can move independently of any single GearInstance's
 *  own transform, unlike a normal gear mesh's geometry (which is rebuilt only when the
 *  gear's teeth/module change).
 *
 *  `kind` picks the silhouette: a "belt" (spec §3.4) is one continuous loop, so it keeps
 *  the original smooth `TubeGeometry` unchanged. A "chain" (spec §3.3) is a sequence of
 *  discrete metal links, so it's built from repeated, gapped link shapes instead -- see
 *  `buildChainLinks`. Defaults to "belt" so existing call sites/tests that don't pass a
 *  kind keep exactly their prior behavior. */
export function buildLinkRibbon(
  pointA: [number, number, number],
  pointB: [number, number, number],
  width: number,
  kind: "chain" | "belt" = "belt",
  travel = 0,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...pointA);
  const b = new THREE.Vector3(...pointB);
  if (kind === "chain") {
    return buildChainLinks(a, b, width, travel);
  }
  const curve = new THREE.LineCurve3(a, b);
  return new THREE.TubeGeometry(curve, 1, width, 6, false);
}

/** Builds a chain as a row of small flat "plate" links spaced evenly along a-b, each
 *  separated by a gap so the eye can pick out individual links rather than seeing one
 *  smooth bar. Every other link is twisted 90 degrees about the chain's own axis --
 *  mimicking how a real roller chain alternates inner/outer plate orientation along its
 *  length -- which is what makes the result read as "chain" rather than "row of dashes".
 *  Link count scales with the distance between the endpoints (at a fixed pitch relative
 *  to `width`) so a longer span gets proportionally more links instead of a fixed count
 *  that would look sparse when stretched or crowded when compressed. */
function buildChainLinks(
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
  travel: number,
): THREE.BufferGeometry {
  const distance = a.distanceTo(b);
  const direction = b.clone().sub(a).normalize();
  const alignToChain = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  const { linkCount, pitch: actualPitch } = chainLinkLayout(distance, width);
  const positions = chainLinkPositions(distance, width, travel);
  const linkLength = actualPitch * (1 - CHAIN_LINK_GAP_FACTOR);
  const plateThickness = width * 0.35;
  const plateHeight = width * 0.9;

  const links: THREE.BufferGeometry[] = [];
  for (let i = 0; i < linkCount; i++) {
    const t = positions[i];
    const center = a.clone().lerp(b, t);
    const plate = new THREE.BoxGeometry(plateThickness, linkLength, plateHeight);
    // Alternate the plate twist by SLOT rather than by loop index, so the inner/outer pattern
    // stays fixed to the moving chain instead of flickering as links wrap past the end.
    const twist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.round(t * linkCount) % 2 === 0 ? 0 : Math.PI / 2,
    );
    plate.applyQuaternion(twist);
    plate.applyQuaternion(alignToChain);
    plate.translate(center.x, center.y, center.z);
    links.push(plate);
  }
  return mergeGeometries(links);
}

/** Concatenates several geometries' positions/normals into one non-indexed BufferGeometry.
 *  Equivalent to gearGeometry.ts's `mergeGeometries` helper (same approach: simple
 *  non-indexed concatenation, sufficient for a display mesh with one material) but kept
 *  local here rather than imported, so chainGeometry.ts doesn't take on an awkward
 *  dependency on the gear-body module for an unrelated ribbon-mesh concern. */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  for (const geo of geometries) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}
