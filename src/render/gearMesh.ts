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

/** Ratio-space threshold below which a durability change is skipped as invisible, rather
 *  than re-lerped and reassigned to the material every frame. `colorForGear` maps the
 *  0..1 ratio through two half-range lerps (t = (ratio - 0.5) * 2, or ratio * 2 below the
 *  midpoint), so a channel's rate of change with respect to ratio is on the order of 2 --
 *  i.e. a delta of `d` in ratio can move a color channel by roughly `2*d`. A rendered
 *  channel is effectively 8-bit (1/255 per step), so half a step (~1/510 ≈ 0.00196) is
 *  the largest change that could plausibly still look identical; picking an epsilon at
 *  roughly half of that (0.001) keeps real, human-visible durability shifts from ever
 *  being delayed by more than a fraction of a color step. `wear.ts`'s `applyWear` reduces
 *  `durabilityCurrent` by a small float amount every tick a gear is spinning above
 *  `MIN_SPIN_TO_WEAR` (there is no discrete "wear event" -- it drifts continuously), so an
 *  exact `===` check on ratio would recompute on essentially every frame for any gear
 *  that's currently spinning under load, defeating the optimization for exactly the
 *  common case it needs to help with. Comparing against the last *applied* ratio (not the
 *  previous frame's ratio) also means these sub-epsilon deltas don't reset each frame --
 *  they accumulate until they cross the threshold relative to what's actually on screen. */
const COLOR_UPDATE_EPSILON = 0.001;

export class GearMeshObject {
  readonly mesh: THREE.Mesh;
  /** Last ratio/broken values actually applied to the material's color, so `update` can
   *  skip the recompute+reassign when nothing durability-relevant has meaningfully changed
   *  since then. `null` until the first `update` call applies a color, so a fresh instance
   *  (including one made right after a `dispose()`d gear is recreated) always paints its
   *  initial color rather than comparing against stale state. */
  private lastColorRatio: number | null = null;
  private lastColorBroken: boolean | null = null;

  /** The `type`/`teeth`/`module` this instance's `this.mesh.geometry` was actually built
   *  from (post `|| 1` fallback, matching what was really handed to `buildGeometryForType`
   *  below) -- `update()` only ever touches position/rotation/color, never the geometry, so
   *  these three fields are frozen at construction time. `needsRebuild` compares a gear's
   *  *current* values against these to tell whether the geometry on screen has silently
   *  gone stale (e.g. a same-id gear re-imported with a different `type`/`teeth`/`module`)
   *  and a fresh `GearMeshObject` -- not another `update()` -- is what's actually needed. */
  private readonly builtType: GearType;
  private readonly builtTeeth: number;
  private readonly builtModule: number;

  constructor(gear: GearInstance) {
    this.builtType = gear.type;
    this.builtTeeth = gear.teeth || 1;
    this.builtModule = gear.module || 1;
    const geometry = buildGeometryForType(this.builtType, this.builtTeeth, this.builtModule);
    // `GEAR_TYPE_COLOR` (colorForGear.ts) names its palette after real metals -- steel,
    // bronze, copper -- but `MeshStandardMaterial` defaults to `roughness: 1, metalness: 0`
    // (fully matte, zero specular response) when neither is set, which reads as unglazed
    // clay/plastic, not metal, regardless of the color chosen. A moderate metalness +
    // lower roughness gives every gear an actual specular highlight that moves with the
    // camera/lights, which is what makes a curved or toothed surface read as solid,
    // dimensional metal instead of a flat-shaded cutout (confirmed the flatness by
    // screenshot before this change, not just reasoning about it).
    const material = new THREE.MeshStandardMaterial({
      color: colorForGear(gear.type, 1, false),
      metalness: 0.55,
      roughness: 0.45,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = gear.id;
    // Gears occlude and are occluded like everything else in the scene, so a gear train lands
    // a real contact shadow on the ground and on the body it drives.
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.update(gear);
  }

  /** True once `gear`'s shape-relevant fields (`type`/`teeth`/`module`, the only inputs
   *  `buildGeometryForType` takes) have drifted from what this instance's geometry was
   *  actually built with -- e.g. a same-id gear whose `type` or tooth count changed via a
   *  re-import. `update()` never rebuilds `this.mesh.geometry`, so the caller (`sceneSync`)
   *  must dispose this instance and construct a fresh one instead of calling `update()` on
   *  a gear this returns true for. Compares against the post-`|| 1`-fallback values actually
   *  used to build the geometry, not the raw gear fields, so e.g. `teeth: 0` and
   *  `teeth: undefined` (both normalized to 1) never look like a spurious rebuild. */
  needsRebuild(gear: GearInstance): boolean {
    return (
      gear.type !== this.builtType ||
      (gear.teeth || 1) !== this.builtTeeth ||
      (gear.module || 1) !== this.builtModule
    );
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
    const ratioUnchanged =
      this.lastColorRatio !== null && Math.abs(ratio - this.lastColorRatio) < COLOR_UPDATE_EPSILON;
    const brokenUnchanged = this.lastColorBroken !== null && gear.broken === this.lastColorBroken;
    if (!ratioUnchanged || !brokenUnchanged) {
      (this.mesh.material as THREE.MeshStandardMaterial).color = colorForGear(gear.type, ratio, gear.broken);
      this.lastColorRatio = ratio;
      this.lastColorBroken = gear.broken;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
