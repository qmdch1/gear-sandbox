import * as THREE from "three";
import type { GearInstance, GearType } from "../sim/types";
import { buildGeometryForType } from "./gearGeometry";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

/** Green above 50% durability, fading to yellow then red as it depletes. Kept as the
 *  type-agnostic gradient (used standalone by callers/tests that don't care about a
 *  specific gear's type) -- `colorForGear` below layers `GEAR_TYPE_COLOR` on top of
 *  this same shape rather than duplicating the lerp logic. */
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

/** Distinct base material tint per `GearType`, shown when a gear is fully healthy --
 *  lets the eye tell gear types apart at a glance (spur vs. worm vs. pulley, etc.)
 *  without reading labels. Chosen as muted, product-quality metal/industrial tones
 *  (steel, bronze, gunmetal, ...) rather than saturated/garish colors, and kept clear
 *  of the durability gradient's own hues (`WARNING` yellow, `CRITICAL` red, `BROKEN`
 *  gray above) so a worn gear's color shift still reads unambiguously as damage and
 *  not as a different type. */
export const GEAR_TYPE_COLOR: Record<GearType, THREE.Color> = {
  spur: new THREE.Color(0x9aa4ad), // steel gray -- the baseline gear
  helical: new THREE.Color(0x7a90a8), // blued steel -- precision-cut helical teeth
  crank: new THREE.Color(0xb5651d), // copper handle
  bevel: new THREE.Color(0x6b7d8c), // gunmetal -- angled-drive housing
  worm: new THREE.Color(0xb08d57), // bronze -- worm wheels are traditionally bronze
  load: new THREE.Color(0x4a4e57), // dark cast iron -- inert flywheel mass
  rack: new THREE.Color(0xa8a89c), // warm steel bar
  planetary: new THREE.Color(0x5f6b7a), // dark gunmetal -- enclosed gear set
  ratchet: new THREE.Color(0xd4801f), // tool-orange -- one-way mechanism
  sprocket: new THREE.Color(0x606060), // raw/black-oxide steel -- chain drive
  pulley: new THREE.Color(0x2f8f9d), // teal -- belt drive, color-coded distinct from gears
  differential: new THREE.Color(0x8f5a4e), // muted bronze-maroon -- complex assembly
};

/** Blends `GEAR_TYPE_COLOR[type]` with the durability gradient, keeping the same
 *  priority the original gradient had (fully healthy -> pure color; badly worn or
 *  broken -> the damage color dominates regardless of type) so a damaged gear still
 *  reads clearly as damaged. Mirrors `colorForDurabilityRatio`'s own shape: the type
 *  color takes the place of `HEALTHY` at the top of the range, then folds into the
 *  same yellow/red/gray gradient below 50% exactly as before. */
export function colorForGear(type: GearType, ratio: number, broken: boolean): THREE.Color {
  if (broken) return BROKEN.clone();
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return BROKEN.clone();
  const typeColor = GEAR_TYPE_COLOR[type] ?? GEAR_TYPE_COLOR.spur;
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) * 2; // 0..1 from yellow to this type's healthy color
    return WARNING.clone().lerp(typeColor, t);
  }
  const t = clamped * 2; // 0..1 from red to yellow -- unchanged: damage always dominates here
  return CRITICAL.clone().lerp(WARNING, t);
}

export class GearMeshObject {
  readonly mesh: THREE.Mesh;

  constructor(gear: GearInstance) {
    const geometry = buildGeometryForType(gear.type, gear.teeth || 1, gear.module || 1);
    const material = new THREE.MeshStandardMaterial({ color: colorForGear(gear.type, 1, false) });
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
    (this.mesh.material as THREE.MeshStandardMaterial).color = colorForGear(gear.type, ratio, gear.broken);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
