import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { cachedGeometryFor } from "./geometryCache";
import { beltTangentGeometry, trackTangentGeometry } from "./gearGeometry";
import { TYPE_HEALTHY_COLORS, createMetalTexture, createGaugeDialTexture } from "./metalTexture";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

// Generated once and shared by every gear mesh — regenerating a canvas per gear would
// be wasteful, and the pattern doesn't need to vary between gears to read as "metal".
// null under environments with no 2D canvas context (e.g. jsdom in tests); MeshStandardMaterial
// treats `map: null` as "no texture, just use color", so this degrades gracefully there.
// Exported so sceneSync.ts's instanced (non-belt) materials can reuse the SAME
// texture objects rather than generating a second, redundant canvas.
export const sharedMetalTexture = createMetalTexture();
// Same reasoning, but only used for the gauge's dial face -- every other gear type
// keeps the brushed-metal look above, painting a dial face onto them would be wrong.
export const sharedGaugeDialTexture = createGaugeDialTexture();

/** `healthyColor` above 50% durability (per gear type, see TYPE_HEALTHY_COLORS), fading
 *  through yellow then red as it depletes, regardless of type — durability danger must
 *  stay recognizable on sight no matter which gear it is. */
export function colorForDurabilityRatio(ratio: number, healthyColor: THREE.Color = HEALTHY): THREE.Color {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return BROKEN.clone();
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) * 2; // 0..1 from yellow to healthy
    return WARNING.clone().lerp(healthyColor, t);
  }
  const t = clamped * 2; // 0..1 from red to yellow
  return CRITICAL.clone().lerp(WARNING, t);
}

export class GearMeshObject {
  readonly mesh: THREE.Mesh;
  // True while this.mesh.geometry is a bespoke, per-instance geometry (a
  // connected belt's tangent-line shape, see `applyBeltTangentGeometry` below)
  // that THIS object must dispose itself. False for the common case -- a
  // shared/cached geometry from geometryCache.ts that other gears of the same
  // type/teeth/module may still be actively using.
  private ownsGeometry = false;

  constructor(gear: GearInstance) {
    const geometry = cachedGeometryFor(gear.type, gear.teeth || 1, gear.module || 1);
    const isGauge = gear.type === "gauge";
    const material = new THREE.MeshStandardMaterial({
      color: colorForDurabilityRatio(1, TYPE_HEALTHY_COLORS[gear.type]),
      map: isGauge ? sharedGaugeDialTexture : sharedMetalTexture,
      // Per-vertex tint (see gearGeometry.ts's mergeGeometries) multiplies with the
      // color/map above -- every existing part's vertices default to white (a no-op),
      // only the wheel's tire passes a real color, so this is a no-visual-change
      // default for everything else.
      vertexColors: true,
      // A painted instrument face reads as flat/matte, not shiny metal like the rest
      // of the drivetrain -- the same MeshStandardMaterial just gets different
      // roughness/metalness for the gauge instead of a whole second material class.
      roughness: isGauge ? 0.85 : 0.55,
      metalness: isGauge ? 0.1 : 0.6,
      // `emissive` is a flat additive term (sceneSync.ts uses it for the "unconnected /
      // no-power / overlapping" warning tint and the drag preview highlight) -- at full
      // strength it washes out the base per-type material color entirely, so every gear
      // just reads as "red" the moment it's alone (which is every gear, right after you
      // place it). Dimming it keeps the warning visible as a tint without hiding what
      // the part actually looks like.
      emissiveIntensity: 0.28,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = gear.id;
    this.update(gear);
  }

  update(gear: GearInstance): void {
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
    const usedTangentGeometry =
      (gear.type === "belt" || gear.type === "track") && gear.position2 ? this.applyBeltTangentGeometry(gear) : false;
    if (usedTangentGeometry) {
      // The tangent geometry already bakes the real world-space strand
      // positions/orientation/taper directly into its vertices (see
      // gearGeometry.ts's beltTangentGeometry) -- unlike the generic rod
      // transform below, the mesh itself stays at the identity transform.
      this.mesh.position.set(0, 0, 0);
      this.mesh.quaternion.identity();
    } else if (gear.position2) {
      // Unlike every other type (a fixed shape at one point + a fixed axis), a
      // rod (shaft/beam/belt -- the only types that ever carry a position2)
      // has its position/orientation/LENGTH all derived fresh from its two
      // endpoints every update -- gearGeometry.ts's shaftGeometry/beamGeometry/
      // beltGeometry are unit-length, stretched via scale.z rather than
      // rebuilding geometry every frame. (An unconnected belt -- no host on
      // either end yet, so no tangent geometry above -- also falls back to
      // this single-centered-strap rendering.)
      const start = new THREE.Vector3(...gear.position);
      const end = new THREE.Vector3(...gear.position2);
      this.mesh.position.copy(start).add(end).multiplyScalar(0.5);
      const delta = end.sub(start);
      const length = delta.length();
      if (length > 1e-6) {
        this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
        this.mesh.rotateZ(gear.rotation);
        this.mesh.scale.z = length;
      }
    } else {
      this.mesh.position.set(...gear.position);
      const axis = new THREE.Vector3(...gear.axis).normalize();
      this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
      this.mesh.rotateZ(gear.rotation);
    }
    const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
    (this.mesh.material as THREE.MeshStandardMaterial).color = colorForDurabilityRatio(
      gear.broken ? 0 : ratio,
      TYPE_HEALTHY_COLORS[gear.type],
    );
  }

  /** For a "belt"/"track" connected on at least one end, rebuilds its geometry
   *  as the real external-tangent two-strand shape (see gearGeometry.ts's
   *  beltTangentGeometry/trackTangentGeometry) and swaps it onto this.mesh,
   *  disposing whatever bespoke geometry it previously owned. Reverts to the
   *  shared/cached default single-strap geometry once neither end is
   *  connected anymore (e.g. dragged away). Returns whether the tangent
   *  geometry is in use, so `update()` knows whether to skip its own
   *  position/quaternion transform (the tangent geometry already bakes those
   *  in as absolute world coordinates). No-op (returns false) for every other
   *  type. */
  private applyBeltTangentGeometry(gear: GearInstance): boolean {
    const r1 = gear.beltEndRadius1 ?? 0;
    const r2 = gear.beltEndRadius2 ?? 0;
    if (r1 <= 0 && r2 <= 0) {
      if (this.ownsGeometry) {
        this.mesh.geometry.dispose();
        this.ownsGeometry = false;
      }
      // Always re-fetch (not just when transitioning away from a bespoke
      // tangent shape) so a disconnected belt/track's module change (see the
      // size slider in main.ts) is reflected too -- a cheap cache lookup
      // either way.
      this.mesh.geometry = cachedGeometryFor(gear.type, gear.teeth || 1, gear.module || 1);
      return false;
    }
    const p1 = new THREE.Vector3(...gear.position);
    const p2 = new THREE.Vector3(...gear.position2!);
    const geometry =
      gear.type === "track"
        ? trackTangentGeometry(gear.module || 1, p1, p2, r1, r2)
        : beltTangentGeometry(gear.module || 1, p1, p2, r1, r2);
    if (this.ownsGeometry) this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.ownsGeometry = true;
    return true;
  }

  dispose(): void {
    // Only dispose the geometry when it's a bespoke, per-instance one (a
    // connected belt's tangent shape) -- the common case is a shared, cached
    // geometry from geometryCache.ts, quite possibly still in active use by
    // every OTHER gear of the same type/teeth/module. The material, however,
    // is ALWAYS genuinely per-instance (durability color/emissive), so it
    // always needs disposing.
    if (this.ownsGeometry) this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
