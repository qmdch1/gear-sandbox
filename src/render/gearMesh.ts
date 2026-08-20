import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { cachedGeometryFor } from "./geometryCache";
import { TYPE_HEALTHY_COLORS, createMetalTexture, createGaugeDialTexture } from "./metalTexture";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

// Generated once and shared by every gear mesh — regenerating a canvas per gear would
// be wasteful, and the pattern doesn't need to vary between gears to read as "metal".
// null under environments with no 2D canvas context (e.g. jsdom in tests); MeshStandardMaterial
// treats `map: null` as "no texture, just use color", so this degrades gracefully there.
const sharedMetalTexture = createMetalTexture();
// Same reasoning, but only used for the gauge's dial face -- every other gear type
// keeps the brushed-metal look above, painting a dial face onto them would be wrong.
const sharedGaugeDialTexture = createGaugeDialTexture();

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
    if (gear.position2) {
      // Unlike every other type (a fixed shape at one point + a fixed axis), a
      // rod (shaft OR beam -- the only two types that ever carry a position2)
      // has its position/orientation/LENGTH all derived fresh from its two
      // endpoints every update -- gearGeometry.ts's shaftGeometry/beamGeometry
      // are unit-length, stretched via scale.z rather than rebuilding geometry
      // every frame.
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

  dispose(): void {
    // Deliberately does NOT dispose this.mesh.geometry -- it's a shared,
    // cached instance (see geometryCache.ts), quite possibly still in active
    // use by every OTHER gear of the same type/teeth/module. Only the
    // material is genuinely per-instance (durability color/emissive), so only
    // it needs disposing when a gear is removed.
    (this.mesh.material as THREE.Material).dispose();
  }
}
