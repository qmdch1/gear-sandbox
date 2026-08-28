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
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...pointA);
  const b = new THREE.Vector3(...pointB);
  if (kind === "chain") {
    return buildChainLinks(a, b, width);
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
function buildChainLinks(a: THREE.Vector3, b: THREE.Vector3, width: number): THREE.BufferGeometry {
  const distance = a.distanceTo(b);
  const direction = b.clone().sub(a).normalize();
  const alignToChain = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  const desiredPitch = width * CHAIN_LINK_PITCH_FACTOR;
  const linkCount = Math.max(CHAIN_MIN_LINKS, Math.round(distance / Math.max(desiredPitch, 1e-6)));
  const actualPitch = distance / linkCount;
  const linkLength = actualPitch * (1 - CHAIN_LINK_GAP_FACTOR);
  const plateThickness = width * 0.35;
  const plateHeight = width * 0.9;

  const links: THREE.BufferGeometry[] = [];
  for (let i = 0; i < linkCount; i++) {
    const t = (i + 0.5) / linkCount;
    const center = a.clone().lerp(b, t);
    const plate = new THREE.BoxGeometry(plateThickness, linkLength, plateHeight);
    const twist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      i % 2 === 0 ? 0 : Math.PI / 2,
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
