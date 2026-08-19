import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { buildGeometryForType } from "./gearGeometry";
import { TYPE_HEALTHY_COLORS, createMetalTexture } from "./metalTexture";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

// Generated once and shared by every gear mesh — regenerating a canvas per gear would
// be wasteful, and the pattern doesn't need to vary between gears to read as "metal".
// null under environments with no 2D canvas context (e.g. jsdom in tests); MeshStandardMaterial
// treats `map: null` as "no texture, just use color", so this degrades gracefully there.
const sharedMetalTexture = createMetalTexture();

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
    const geometry = buildGeometryForType(gear.type, gear.teeth || 1, gear.module || 1);
    const material = new THREE.MeshStandardMaterial({
      color: colorForDurabilityRatio(1, TYPE_HEALTHY_COLORS[gear.type]),
      map: sharedMetalTexture,
      roughness: 0.55,
      metalness: 0.6,
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
    this.mesh.position.set(...gear.position);
    this.mesh.rotation.set(0, 0, 0);
    const axis = new THREE.Vector3(...gear.axis).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    this.mesh.rotateZ(gear.rotation);
    const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
    (this.mesh.material as THREE.MeshStandardMaterial).color = colorForDurabilityRatio(
      gear.broken ? 0 : ratio,
      TYPE_HEALTHY_COLORS[gear.type],
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
