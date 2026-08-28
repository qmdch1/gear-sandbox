import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { buildGeometryForType } from "./gearGeometry";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

/** Green above 50% durability, fading to yellow then red as it depletes. */
export function colorForDurabilityRatio(ratio: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return BROKEN.clone();
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) * 2; // 0..1 from yellow to green
    return WARNING.clone().lerp(HEALTHY, t);
  }
  const t = clamped * 2; // 0..1 from red to yellow
  return CRITICAL.clone().lerp(WARNING, t);
}

export class GearMeshObject {
  readonly mesh: THREE.Mesh;

  constructor(gear: GearInstance) {
    const geometry = buildGeometryForType(gear.type, gear.teeth || 1, gear.module || 1);
    const material = new THREE.MeshStandardMaterial({ color: colorForDurabilityRatio(1) });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = gear.id;
    this.update(gear);
  }

  /** `facePinionPosition`: for a rack only, the world position of the pinion it should
   *  visually face (its teeth run along local Y, and a rack has no rotation of its own
   *  to derive that facing from -- unlike every other gear type, whose radial symmetry
   *  makes the roll around `axis` irrelevant). Omit it (or pass it for a non-rack gear)
   *  to fall back to the axis-only alignment, which is correct for every other type and
   *  a harmless default for an unmeshed rack. */
  update(gear: GearInstance, facePinionPosition?: [number, number, number]): void {
    this.mesh.position.set(...gear.position);
    this.mesh.rotation.set(0, 0, 0);
    const axis = new THREE.Vector3(...gear.axis).normalize();
    const towardPinion =
      gear.type === "rack" && facePinionPosition
        ? new THREE.Vector3(...facePinionPosition).sub(this.mesh.position)
        : null;
    const up = towardPinion?.addScaledVector(axis, -towardPinion.dot(axis)) ?? null;
    if (up && up.lengthSq() > 1e-8) {
      up.normalize();
      const right = new THREE.Vector3().crossVectors(up, axis);
      this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, axis));
    } else {
      this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    }
    if (gear.type === "rack") {
      this.mesh.position.addScaledVector(axis, gear.linearPosition ?? 0);
    } else {
      this.mesh.rotateZ(gear.rotation);
    }
    const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
    (this.mesh.material as THREE.MeshStandardMaterial).color = colorForDurabilityRatio(gear.broken ? 0 : ratio);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
