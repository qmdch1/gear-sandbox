import * as THREE from "three";

/** The procedural surface finishes a prop can ask for (see `Prop.texture`). Each is drawn
 *  once into an offscreen canvas and cached, then reused by every prop that names it.
 *
 *  The patterns are deliberately GREYSCALE, centred near mid-grey: they are used as a
 *  `map`, which THREE multiplies against the material's own `color`, so one "wood" texture
 *  gives light pine, dark walnut or painted timber depending purely on the prop's colour.
 *  The same canvas is also used as a `bumpMap`, so the grain/mortar/weave catches the
 *  scene's raking key light as real relief instead of a flat decal. */
export type TextureKind = "wood" | "stone" | "brick" | "metal" | "fabric" | "tile" | "rust";

/** Deterministic PRNG (mulberry32). The textures must be byte-identical run to run --
 *  a texture that reshuffled itself every reload would make the scene subtly different
 *  every time and impossible to compare against a reference screenshot. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas resolution for every generated pattern. 512 rather than 256 because these are used as
 *  both a colour map AND a bump/roughness map on surfaces the camera can get right up against --
 *  a brick wall 28 units across fills the screen at close orbit, where 256 showed visibly soft,
 *  mushy mortar joints. */
const SIZE = 512;

/** Returns a 2d context for a fresh SIZE x SIZE canvas, or null where none is available --
 *  jsdom (the render tests' environment) has no canvas backend, and a headless run must
 *  degrade to a plain untextured material rather than throwing. */
function makeContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function fill(ctx: CanvasRenderingContext2D, grey: number): void {
  ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

/** Long horizontal grain bands with knots -- reads as sawn timber. */
function drawWood(ctx: CanvasRenderingContext2D): void {
  const rand = makeRandom(101);
  fill(ctx, 168);
  for (let i = 0; i < 190; i++) {
    const y = rand() * SIZE;
    const g = 130 + rand() * 70;
    ctx.strokeStyle = `rgba(${g},${g},${g},${0.35 + rand() * 0.4})`;
    ctx.lineWidth = 0.6 + rand() * 2.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // A gentle waver along the plank so the grain isn't dead-straight ruling.
    for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y + Math.sin((x / SIZE) * 6.2 + i) * 2.2);
    ctx.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    for (let r = 8; r > 0; r--) {
      ctx.strokeStyle = `rgba(120,120,120,${0.10 + r * 0.02})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.7, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Mottled patches -- reads as rough quarried stone. */
function drawStone(ctx: CanvasRenderingContext2D): void {
  const rand = makeRandom(202);
  fill(ctx, 160);
  for (let i = 0; i < 900; i++) {
    const g = 120 + rand() * 80;
    ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE, 2 + rand() * 11, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Running-bond courses with mortar joints. */
function drawBrick(ctx: CanvasRenderingContext2D): void {
  const rand = makeRandom(303);
  fill(ctx, 120); // mortar
  const rows = 8;
  const h = SIZE / rows;
  const w = SIZE / 4;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : -w / 2;
    for (let c = -1; c < 5; c++) {
      const g = 150 + rand() * 55;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(c * w + offset + 1.6, r * h + 1.6, w - 3.2, h - 3.2);
    }
  }
}

/** Fine horizontal streaks -- reads as brushed/machined metal. */
function drawMetal(ctx: CanvasRenderingContext2D): void {
  const rand = makeRandom(404);
  fill(ctx, 180);
  for (let i = 0; i < 1400; i++) {
    const y = rand() * SIZE;
    const g = 150 + rand() * 90;
    ctx.strokeStyle = `rgba(${g},${g},${g},0.28)`;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(rand() * SIZE * 0.4, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }
}

/** Over-under weave -- reads as canvas/sailcloth. */
function drawFabric(ctx: CanvasRenderingContext2D): void {
  fill(ctx, 165);
  const step = 8;
  for (let i = 0; i * step < SIZE; i++) {
    const light = i % 2 === 0;
    ctx.fillStyle = light ? "rgba(205,205,205,0.55)" : "rgba(125,125,125,0.55)";
    ctx.fillRect(i * step, 0, step / 2, SIZE); // warp
    ctx.fillStyle = light ? "rgba(125,125,125,0.45)" : "rgba(205,205,205,0.45)";
    ctx.fillRect(0, i * step, SIZE, step / 2); // weft
  }
}

/** Square tiles with recessed grout lines. */
function drawTile(ctx: CanvasRenderingContext2D): void {
  fill(ctx, 110); // grout
  const n = 6;
  const s = SIZE / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const g = 175 + ((r * n + c) % 3) * 16;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(c * s + 2, r * s + 2, s - 4, s - 4);
    }
  }
}

/** Blotchy pitting -- reads as corroded iron. */
function drawRust(ctx: CanvasRenderingContext2D): void {
  const rand = makeRandom(606);
  fill(ctx, 150);
  for (let i = 0; i < 500; i++) {
    const g = 95 + rand() * 105;
    ctx.fillStyle = `rgba(${g},${g},${g},0.42)`;
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = 3 + rand() * 9;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

const PAINTERS: Record<TextureKind, (ctx: CanvasRenderingContext2D) => void> = {
  wood: drawWood,
  stone: drawStone,
  brick: drawBrick,
  metal: drawMetal,
  fabric: drawFabric,
  tile: drawTile,
  rust: drawRust,
};

const cache = new Map<TextureKind, THREE.CanvasTexture | null>();

/** The cached texture for `kind`, or null where no canvas backend exists (jsdom/headless),
 *  in which case callers fall back to a plain coloured material. Textures are shared, so a
 *  caller must NOT dispose one it did not create -- `SceneSync` disposes prop materials but
 *  deliberately leaves these alone. */
export function getProceduralTexture(kind: TextureKind): THREE.CanvasTexture | null {
  const hit = cache.get(kind);
  if (hit !== undefined) return hit;
  const ctx = makeContext();
  if (!ctx) {
    cache.set(kind, null);
    return null;
  }
  PAINTERS[kind](ctx);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  cache.set(kind, texture);
  return texture;
}

/** Test seam: drops every cached texture so a following call re-draws. */
/** The same pattern, set up to TILE across a large surface.
 *
 *  A cached texture is shared by every prop that asked for that finish, so its `repeat` cannot
 *  be changed in place -- doing so would silently retile every brick wall and wooden beam in the
 *  scene. This hands back a clone instead, which shares the underlying image (no second canvas,
 *  no second upload) while carrying its own wrapping and repeat. Used for the ground, where one
 *  512-pixel slab stretched over eight metres would be an unreadable smear. */
export function getTiledTexture(kind: TextureKind, repeat: number): THREE.CanvasTexture | null {
  const base = getProceduralTexture(kind);
  if (!base) return null;
  const tiled = base.clone();
  tiled.wrapS = THREE.RepeatWrapping;
  tiled.wrapT = THREE.RepeatWrapping;
  tiled.repeat.set(repeat, repeat);
  tiled.needsUpdate = true;
  return tiled;
}

/** A vertical sky gradient, as an equirectangular background.
 *
 *  Two colours up a narrow strip is all a sky needs when the camera never looks far above the
 *  horizon: THREE stretches it around the whole sphere, so the scene gains a horizon and a
 *  sense of "outdoors" that a single flat background colour cannot give. Returns null where
 *  there is no canvas (jsdom), and the caller keeps its plain colour. */
export function makeSkyTexture(top: string, horizon: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.55, horizon);
    gradient.addColorStop(1, horizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

export function clearTextureCache(): void {
  for (const t of cache.values()) t?.dispose();
  cache.clear();
}
