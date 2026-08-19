import * as THREE from "three";
import type { GearType } from "../sim/types";

/** Per-type base tint at full durability, so gears read as visually distinct materials
 *  (steel, brass, bronze...) even before any wear sets in — durability still fades
 *  through the same yellow -> red -> gray scale on top of this (see gearMesh.ts). */
export const TYPE_HEALTHY_COLORS: Record<GearType, THREE.Color> = {
  spur: new THREE.Color(0x6fae8c), // steel-green
  helical: new THREE.Color(0x4fa3c7), // teal-blue
  crank: new THREE.Color(0xd4af6a), // brass
  bevel: new THREE.Color(0xb8b8c0), // silver
  worm: new THREE.Color(0xb8763f), // bronze
  load: new THREE.Color(0x5a6472), // dark slate
  gauge: new THREE.Color(0xd9d2bd), // ivory dial face
  fan: new THREE.Color(0x5aa9c9), // sky blue blades
  battery: new THREE.Color(0x7bc47f), // battery green
  outlet: new THREE.Color(0xe0b04a), // warning-yellow, like a real outlet plate
};

/** jsdom (used by this project's DOM-touching tests) implements `getContext` but has no
 *  real 2D canvas backend, and calling it there prints a "Not implemented" console
 *  warning as a side effect of the call itself -- checking the return value is too late
 *  to avoid it. jsdom identifies itself in `navigator.userAgent`, so we can skip calling
 *  `getContext` at all in that environment rather than merely handling a null result. */
function hasRealCanvasSupport(): boolean {
  return typeof navigator !== "undefined" && !navigator.userAgent.includes("jsdom");
}

/** A brushed-metal-looking texture generated on a <canvas>, so gears read as an actual
 *  material instead of a flat solid color — no external image asset (no download,
 *  no licensing) needed. Returns null where real 2D canvas support isn't available (e.g.
 *  jsdom in tests), so callers fall back to a flat-colored material with no `map`. */
export function createMetalTexture(size = 256): THREE.CanvasTexture | null {
  if (!hasRealCanvasSupport()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const cx = size / 2;
  const cy = size / 2;
  const gradient = context.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.5);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.55, "#c4c4c4");
  gradient.addColorStop(1, "#8a8a8a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Brushed-metal radial streaks, drawn once at module load and reused for every gear.
  context.strokeStyle = "rgba(0,0,0,0.08)";
  context.lineWidth = 1;
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const start = size * (0.03 + Math.random() * 0.05);
    const end = size * (0.32 + Math.random() * 0.18);
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
    context.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
