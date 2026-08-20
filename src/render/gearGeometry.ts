import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 1.2; // face width -- chunkier than the original 0.4, which read as a flat paper cutout rather than a solid mechanical part
const ADDENDUM_FACTOR = 1.25; // bevel/worm tip radius beyond the pitch radius, in modules (unrelated to the involute profile below)
const BEVEL_OPTIONS = { bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };

const PRESSURE_ANGLE = (20 * Math.PI) / 180; // standard 20° pressure angle
const DEDENDUM_FACTOR = 1.25; // root depth below the pitch circle, in modules (standard)
const FLANK_SEGMENTS = 4; // involute-curve samples per tooth flank

/** A point on the involute of a circle of `baseRadius`, at roll parameter `t` (t=0 is
 *  where the involute meets the base circle). This is the actual curve every real
 *  gear tooth's flank is cut to -- not an approximation of it. */
function involutePoint(baseRadius: number, t: number): THREE.Vector2 {
  return new THREE.Vector2(
    baseRadius * (Math.cos(t) + t * Math.sin(t)),
    baseRadius * (Math.sin(t) - t * Math.cos(t)),
  );
}

/** The roll parameter `t` at which the involute of `baseRadius` reaches `radius`
 *  (radius = baseRadius * sqrt(1 + t^2), inverted). */
function involuteParamAtRadius(baseRadius: number, radius: number): number {
  const ratio = radius / baseRadius;
  return Math.sqrt(Math.max(0, ratio * ratio - 1));
}

/** A real involute tooth profile -- the exact mathematical curve every manufactured
 *  gear tooth flank uses (standard 20° pressure angle, 1-module addendum, 1.25-module
 *  dedendum) -- rather than the flat-sided block shape this used to generate. Each
 *  tooth is a root point, an involute flank curving out to the addendum (teeth are
 *  wider at the root and narrow toward the tip, the recognizable real-gear silhouette),
 *  a short tip, the mirrored flank back down, and a root point on the other side. The
 *  short straight step from the root circle up to the base circle (where the involute
 *  begins) approximates the fillet real gears cut there -- a standard simplification
 *  that doesn't change the tooth's overall silhouette. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(PRESSURE_ANGLE);
  const addendumRadius = pitchRadius + module;
  const dedendumRadius = pitchRadius - module * DEDENDUM_FACTOR;

  const anglePerTooth = (Math.PI * 2) / teeth;
  const halfToothAngle = anglePerTooth / 4; // quarter of the full tooth-pitch angle

  // Rotates the raw involute (whose t=0 point naturally sits at polar angle 0) so its
  // pitch-radius crossing lands exactly half a tooth-width from the tooth's centerline.
  const tPitch = involuteParamAtRadius(baseRadius, pitchRadius);
  const pitchPoint = involutePoint(baseRadius, tPitch);
  const pitchAngle = Math.atan2(pitchPoint.y, pitchPoint.x);
  const rotationOffset = -halfToothAngle - pitchAngle;
  const tEnd = involuteParamAtRadius(baseRadius, addendumRadius);

  const points: THREE.Vector2[] = [];
  for (let tooth = 0; tooth < teeth; tooth++) {
    const center = tooth * anglePerTooth;
    const leftBaseAngle = rotationOffset + center; // angle of the involute's t=0 (base circle) point

    points.push(new THREE.Vector2(Math.cos(leftBaseAngle) * dedendumRadius, Math.sin(leftBaseAngle) * dedendumRadius));

    for (let i = 0; i <= FLANK_SEGMENTS; i++) {
      const t = (tEnd * i) / FLANK_SEGMENTS;
      const raw = involutePoint(baseRadius, t);
      const angle = Math.atan2(raw.y, raw.x) + rotationOffset + center;
      points.push(new THREE.Vector2(Math.cos(angle) * raw.length(), Math.sin(angle) * raw.length()));
    }

    for (let i = FLANK_SEGMENTS; i >= 0; i--) {
      const t = (tEnd * i) / FLANK_SEGMENTS;
      const raw = involutePoint(baseRadius, t);
      const angle = -(Math.atan2(raw.y, raw.x) + rotationOffset) + center; // mirror of the left flank about `center`
      points.push(new THREE.Vector2(Math.cos(angle) * raw.length(), Math.sin(angle) * raw.length()));
    }

    const rightBaseAngle = center - rotationOffset; // mirror of leftBaseAngle about `center`
    points.push(new THREE.Vector2(Math.cos(rightBaseAngle) * dedendumRadius, Math.sin(rightBaseAngle) * dedendumRadius));
  }
  return points;
}

function circlePoints(radius: number, segments = 32): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

/** A circular hole path for `Shape.holes` — used to give gears and the flywheel an
 *  actual center bore instead of a solid disc. */
function boreHole(radius: number): THREE.Path {
  return new THREE.Path().setFromPoints(circlePoints(radius));
}

function extrudedGearGeometry(teeth: number, module: number, twistPerUnit = 0): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const pitchRadius = (module * teeth) / 2;
  const boreRadius = Math.max(pitchRadius * 0.3, module * 0.6);
  shape.holes.push(boreHole(boreRadius));

  // Without a custom UVGenerator, ExtrudeGeometry's default maps UVs straight from
  // the shape's raw (unnormalized) local coordinates -- for a ~20-unit-wide gear
  // face that tiles the brushed-metal texture's radial gradient dozens of times
  // over, reading as fine noise rather than one coherent brushed-metal disc (see
  // `radialUVGenerator` below, also used for the gauge dial face).
  const geometry = new THREE.ExtrudeGeometry(shape, {
    ...BEVEL_OPTIONS,
    depth: GEAR_THICKNESS,
    curveSegments: 1,
    UVGenerator: radialUVGenerator(pitchRadius + module),
  });
  geometry.translate(0, 0, -GEAR_THICKNESS / 2); // center on its own origin, like discWithHole below
  if (twistPerUnit !== 0) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      const angle = z * twistPerUnit;
      const x = position.getX(i);
      const y = position.getY(i);
      position.setX(i, x * Math.cos(angle) - y * Math.sin(angle));
      position.setY(i, x * Math.sin(angle) + y * Math.cos(angle));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // A raised hub/collar around the shaft bore, protruding a little past both faces --
  // real gears almost never sit flush from the tooth face straight down to a bare
  // hole; the hub is the single biggest visual cue that reads as "a real mechanical
  // part" rather than a flat toothed cutout.
  const hubOuterRadius = Math.max(boreRadius * 1.7, module * 1.1);
  const hubThickness = GEAR_THICKNESS + module * 0.7;
  const hub = discWithHole(hubOuterRadius, boreRadius, hubThickness);

  return mergeGeometries([geometry, hub]);
}

function crankGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const handle = new THREE.CylinderGeometry(module * 0.3, module * 0.3, pitchRadius * 1.4, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(pitchRadius * 0.9, 0, 0); // centered through the (now centered) gear body's thickness
  return mergeGeometries([base, handle]);
}

/** The subset of three.js's `ExtrudeGeometry` UVGenerator interface this needs --
 *  typed by hand rather than pulled from three's own (unexported) internal type. */
interface DiscUVGenerator {
  generateTopUV(geometry: THREE.ExtrudeGeometry, vertices: number[], a: number, b: number, c: number): THREE.Vector2[];
  generateBottomUV(geometry: THREE.ExtrudeGeometry, vertices: number[], a: number, b: number, c: number): THREE.Vector2[];
  generateSideWallUV(geometry: THREE.ExtrudeGeometry, vertices: number[], a: number, b: number, c: number, d: number): THREE.Vector2[];
}

/** Normalizes a disc's own local (x, y) shape coordinates to a [0,1] UV square
 *  centered on the disc, so a texture painted as a circular face (see
 *  `createGaugeDialTexture`) lands correctly on the disc's front/back caps: the
 *  disc's own outer radius maps exactly to the UV square's edges. The rim (side
 *  wall) samples a single fixed point instead of stretching the face texture around
 *  the thin edge -- picked in a corner of the UV square, outside the inscribed
 *  circle, which is exactly the "background" area of a texture like
 *  `createGaugeDialTexture` that fills the dial face right up to the edges. */
function radialUVGenerator(outerRadius: number): DiscUVGenerator {
  const toUV = (x: number, y: number) => new THREE.Vector2(x / (2 * outerRadius) + 0.5, y / (2 * outerRadius) + 0.5);
  const faceUV = (vertices: number[], a: number, b: number, c: number) => [
    toUV(vertices[a * 3], vertices[a * 3 + 1]),
    toUV(vertices[b * 3], vertices[b * 3 + 1]),
    toUV(vertices[c * 3], vertices[c * 3 + 1]),
  ];
  const corner = () => new THREE.Vector2(0.03, 0.03);
  return {
    generateTopUV: (_geometry, vertices, a, b, c) => faceUV(vertices, a, b, c),
    generateBottomUV: (_geometry, vertices, a, b, c) => faceUV(vertices, a, b, c),
    generateSideWallUV: () => [corner(), corner(), corner(), corner()],
  };
}

/** A flat, circular Shape extruded along Z, centered on its own thickness — the shared
 *  builder behind the flywheel and gauge dial (both are "solid disc with a hole,"
 *  differing only in radii and what else gets merged onto them). `ExtrudeGeometry`
 *  already extrudes along +Z from a shape defined in the XY plane, which is exactly
 *  the thickness axis `gearMesh.ts` expects (no `rotateX` needed here, unlike the
 *  Y-aligned primitives like `CylinderGeometry`/`ConeGeometry` below). `useRadialUV`
 *  (on by default) uses `radialUVGenerator` above instead of ExtrudeGeometry's raw,
 *  unnormalized default UVs -- without it, a texture tiles into fine repeated noise
 *  across a disc this size rather than reading as one coherent surface, whether
 *  that's the gauge's printed dial face or the flywheel/fan hub's brushed metal. */
function discWithHole(outerRadius: number, innerRadius: number, thickness: number, useRadialUV = true): THREE.BufferGeometry {
  const shape = new THREE.Shape(circlePoints(outerRadius));
  shape.holes.push(boreHole(innerRadius));
  const options: THREE.ExtrudeGeometryOptions = { ...BEVEL_OPTIONS, depth: thickness, curveSegments: 24 };
  if (useRadialUV) options.UVGenerator = radialUVGenerator(outerRadius);
  const geometry = new THREE.ExtrudeGeometry(shape, options);
  geometry.translate(0, 0, -thickness / 2); // center on its local origin, like the other gear geometries
  return geometry;
}

/** A flywheel: a ring (annulus) rather than a solid disc, so it visibly has a hole. */
function loadGeometry(module: number): THREE.BufferGeometry {
  return discWithHole(module * 2, module * 0.7, GEAR_THICKNESS * 2);
}

/** An RPM dial: a disc face + a needle merged on top, both rigid so the needle visibly
 *  sweeps around as the coupled shaft spins — an at-a-glance "how fast is this turning"
 *  readout for a teaching sandbox, without needing a numeric HUD overlay. */
function gaugeGeometry(module: number): THREE.BufferGeometry {
  const dialRadius = module * 2;
  const dial = discWithHole(dialRadius, module * 0.3, GEAR_THICKNESS);
  const needle = new THREE.BoxGeometry(dialRadius * 1.7, module * 0.15, GEAR_THICKNESS * 1.5);
  needle.translate(dialRadius * 0.35, 0, 0);
  return mergeGeometries([dial, needle]);
}

/** A small hub with a few blade paddles, radiating outward — a fan/propeller, giving
 *  rotation a second, very legible "output device" beyond the flywheel's plain color
 *  change (kids can watch it visibly spin like a real fan). */
function fanGeometry(module: number): THREE.BufferGeometry {
  const hubRadius = module * 0.6;
  const hub = discWithHole(hubRadius, hubRadius * 0.3, GEAR_THICKNESS);
  const bladeCount = 4;
  const bladeLength = module * 2.2;
  const parts = [hub];
  for (let i = 0; i < bladeCount; i++) {
    const blade = new THREE.BoxGeometry(bladeLength, module * 0.7, GEAR_THICKNESS * 0.6);
    blade.translate(bladeLength / 2 + hubRadius * 0.7, 0, 0);
    blade.rotateZ((i / bladeCount) * Math.PI * 2);
    parts.push(blade);
  }
  return mergeGeometries(parts);
}

/** A cone with real teeth cut into its slanted face -- tapering from wide at the rim
 *  down toward the apex, the actual visual signature of a bevel gear that makes it
 *  legible as "this meshes at an angle" (fixed-size studs near the rim, tried
 *  earlier, just read as a spiky crown, not a cone with teeth on its slant). Each
 *  tooth is a small angular wedge of a SECOND, slightly larger cone sharing the same
 *  apex/height/slant as the body -- `THREE.CylinderGeometry`'s `thetaStart`/
 *  `thetaLength` params slice out that wedge directly, so it inherits the cone's
 *  taper for free instead of needing a hand-rolled lofted shape. Built in the cone's
 *  own local Y-axis frame (radial = XZ, axis = Y, apex at +Y per `ConeGeometry`'s own
 *  convention) like the plain cone was; `buildGeometryForType` applies the same
 *  `rotateX(Math.PI/2)` the old plain cone used. A wedge's angular center sits at
 *  `i * anglePerTooth` via `thetaStart`/`thetaLength` directly -- CylinderGeometry's
 *  own theta parameterization (x = r*sin(theta), z = r*cos(theta)) is exactly what
 *  `rotateY(theta)` produces on a point starting at local +Z, so this lines up with
 *  every other gear type's "tooth i's center is at angle i*pitch" convention (and
 *  with `meshPhaseAlignment`'s bevel phase math in meshing.ts, which depends on it). */
function bevelGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius + module * ADDENDUM_FACTOR;
  const height = GEAR_THICKNESS * 3;
  const cone = new THREE.ConeGeometry(baseRadius, height, 32);

  const anglePerTooth = (Math.PI * 2) / teeth;
  const toothAngularWidth = anglePerTooth * 0.6;
  const toothProtrusion = module * 1.1; // pronounced enough to read clearly against a meshed partner
  const toothAxialSpan = height * 0.55; // from the wide base, most of the way toward the apex

  // The body cone's own radius at height y (apex at +height/2, base at -height/2,
  // per ConeGeometry's convention) -- the taper a tooth wedge rides on top of.
  const bodyRadiusAt = (y: number) => (baseRadius * (height / 2 - y)) / height;

  const yBase = -height / 2;
  const yInner = yBase + toothAxialSpan;
  const radiusAtBase = bodyRadiusAt(yBase) + toothProtrusion;
  const radiusAtInner = bodyRadiusAt(yInner) + toothProtrusion;

  const parts: THREE.BufferGeometry[] = [cone];
  for (let i = 0; i < teeth; i++) {
    const thetaStart = i * anglePerTooth - toothAngularWidth / 2;
    // CylinderGeometry(radiusTop, radiusBottom, ...) -- top is +Y (toward the apex,
    // narrower), bottom is -Y (the wide base), matching yInner/yBase above.
    const wedge = new THREE.CylinderGeometry(radiusAtInner, radiusAtBase, toothAxialSpan, 2, 1, false, thetaStart, toothAngularWidth);
    wedge.translate(0, (yBase + yInner) / 2, 0);
    parts.push(wedge);
  }
  return mergeGeometries(parts);
}

/** A helix traced on the surface of a cylinder of `radius`, `turns` times over its
 *  `length` -- the curve `TubeGeometry` sweeps a circular cross-section along to
 *  build the worm's screw-thread ridge. Built in the same Y-axis frame as
 *  `CylinderGeometry` (radial = XZ, axis = Y). */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private length: number,
    private turns: number,
  ) {
    super();
  }
  getPoint(t: number, target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.turns;
    const y = (t - 0.5) * this.length;
    return target.set(Math.cos(angle) * this.radius, y, Math.sin(angle) * this.radius);
  }
}

/** A worm gear with an actual helical thread ridge wound around its shaft, instead of
 *  a perfectly smooth cylinder -- a thin core cylinder plus a `TubeGeometry` swept
 *  along a `HelixCurve` and merged onto it, both built in the cylinder's own local
 *  Y-axis frame; `buildGeometryForType` applies the same `rotateX(Math.PI/2)` the old
 *  plain cylinder used. */
function wormGeometry(module: number): THREE.BufferGeometry {
  const length = module * 6;
  const rootRadius = module * 0.85;
  const threadCrestRadius = module * 1.7; // chunkier ridge -- read clearly as an actual thread, not a fine groove
  const tubeRadius = module * 0.5;
  const turns = 3; // fewer, wider-pitched turns are easier to read as "a screw thread" than a dense one

  const core = new THREE.CylinderGeometry(rootRadius, rootRadius, length, 20, 1, false);
  const thread = new THREE.TubeGeometry(
    new HelixCurve(threadCrestRadius - tubeRadius, length * 0.94, turns),
    turns * 24,
    tubeRadius,
    8,
    false,
  );
  return mergeGeometries([core, thread]);
}

/** A sub-part passed to `mergeGeometries` with its own per-vertex tint -- multiplies
 *  with the shared material's own `color`/durability tint (see gearMesh.ts's
 *  `vertexColors: true`), so e.g. a wheel's rubber tire can render dark regardless
 *  of whatever metal tone the rest of the part is. Omitting `color` (or passing a
 *  bare `BufferGeometry`) defaults to white, a no-op multiplier -- every existing
 *  caller before the wheel needed no changes. */
interface ColoredPart {
  geometry: THREE.BufferGeometry;
  color: THREE.Color;
}

const WHITE = new THREE.Color(0xffffff);

const TIRE_COLOR = new THREE.Color(0x1c1c1e); // dark rubber, regardless of the wheel's own metal tint

/** A cart/wagon-style wheel: a hub, spokes radiating out to a rim, and a rounded
 *  "tire" (a `TorusGeometry` wrapped around the rim, tinted dark rubber-black via
 *  `mergeGeometries`'s per-part vertex color) -- another coupling-only output
 *  device like the flywheel/fan/gauge, just a more immediately recognizable one
 *  (a rolling wheel, rather than an abstract disc or paddle blades). */
function wheelGeometry(module: number): THREE.BufferGeometry {
  const hubRadius = module * 0.7;
  const boreRadius = hubRadius * 0.4;
  const rimRadius = module * 3.2;
  const spokeCount = 6;
  const spokeThickness = module * 0.3;
  const rimBandWidth = module * 0.5;
  const thickness = GEAR_THICKNESS * 1.1;

  const hub = discWithHole(hubRadius, boreRadius, thickness * 1.3);
  const rim = discWithHole(rimRadius, rimRadius - rimBandWidth, thickness);

  const parts: Array<THREE.BufferGeometry | ColoredPart> = [hub, rim];
  for (let i = 0; i < spokeCount; i++) {
    const spokeLength = rimRadius - rimBandWidth / 2 - hubRadius;
    const spoke = new THREE.BoxGeometry(spokeLength, spokeThickness, thickness * 0.6);
    spoke.translate(hubRadius + spokeLength / 2, 0, 0);
    spoke.rotateZ((i / spokeCount) * Math.PI * 2);
    parts.push(spoke);
  }

  // The tire: a torus centered on the rim's own radius, its tube cross-section
  // giving the classic rounded tire silhouette a flat band never would.
  const tire = new THREE.TorusGeometry(rimRadius - rimBandWidth * 0.1, rimBandWidth * 0.65, 12, 32);
  parts.push({ geometry: tire, color: TIRE_COLOR });

  return mergeGeometries(parts);
}

function mergeGeometries(parts: Array<THREE.BufferGeometry | ColoredPart>): THREE.BufferGeometry {
  // Simple non-indexed concatenation — sufficient for a display mesh with one material.
  // Carries `uv`/`color` along with position/normal so a texture map or per-part tint
  // doesn't silently vanish on merged geometries (the crank's handle, the wheel's tire).
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (const part of parts) {
    const isColored = !(part instanceof THREE.BufferGeometry);
    const geo = isColored ? (part as ColoredPart).geometry : (part as THREE.BufferGeometry);
    const color = isColored ? (part as ColoredPart).color : WHITE;
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      colors.push(color.r, color.g, color.b);
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

export function buildGeometryForType(type: GearType, teeth: number, module: number): THREE.BufferGeometry {
  switch (type) {
    case "spur":
      return extrudedGearGeometry(teeth, module);
    case "helical":
      return extrudedGearGeometry(teeth, module, 1.2); // twisted teeth = helical
    case "crank":
      return crankGeometry(teeth, module);
    case "bevel":
      return bevelGeometry(teeth, module).rotateX(Math.PI / 2);
    case "worm":
      return wormGeometry(module).rotateX(Math.PI / 2);
    case "load":
      return loadGeometry(module);
    case "gauge":
      return gaugeGeometry(module);
    case "fan":
      return fanGeometry(module);
    case "wheel":
      return wheelGeometry(module);
  }
}
