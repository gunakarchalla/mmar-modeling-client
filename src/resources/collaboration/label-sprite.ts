import * as THREE from "three";

/**
 * Camera-facing text labels for collaborator presence: the name pill beside the point a
 * peer's ray lands on ({@link RemoteCursorRenderer}) and the name tag above a peer's
 * selection box ({@link RemoteSelectionRenderer}).
 *
 * Both are `THREE.Sprite`s carrying a canvas texture rather than a mesh or the troika
 * `Text` the vizreps use, because sprites billboard for free: a label reads identically
 * from every collaborator's camera, whatever angle they view the scene from.
 *
 * Sizing: labels hold a constant fraction of the viewport height rather than a fixed
 * world size, since a named cursor that becomes unreadable when you zoom out has stopped
 * doing its job. `scaleLabel` maintains that, and callers must re-run it when the local
 * camera moves (both renderers do, from the animator's per-frame tick).
 *
 * Depth: the selection name tag is depth-tested like the other presence helpers, so
 * geometry in front of it hides it. The cursor pill is not, because it tracks a moving
 * pointer that constantly passes behind things and a name that flickers as it grazes
 * geometry is worse than one that stays legible.
 *
 * Canvas is optional: the renderer suites run in vitest's node environment, where
 * `document` does not exist. Every canvas step is guarded, so the sprite is still built
 * and positioned — just without a texture — and placement stays testable without a DOM.
 */

/** Label height as a fraction of the viewport height (~25 px on a 640 px canvas). */
const LABEL_SCREEN_FRACTION = 0.04;
/** World height used when the camera cannot supply one (degenerate test cameras). */
const FALLBACK_WORLD_HEIGHT = 0.6;

// Canvas-space metrics (a texture is drawn once per label, so these are generous).
const FONT_PX = 44;
const PILL_HEIGHT = 64;
const PILL_PAD_X = 22;
const PILL_RADIUS = 32;
/**
 * Transparent margin left below and to the left of a cursor pill, so it clears the
 * arrow head marking the exact point. Baked into the texture rather than applied as a
 * world offset, so the gap stays visually constant as the label rescales.
 */
const CURSOR_GAP = 16;
/** Mean glyph width as a fraction of font size, for estimating text width with no DOM. */
const ESTIMATED_GLYPH_RATIO = 0.62;

const FONT = `bold ${FONT_PX}px sans-serif`;

/**
 * A name pill anchored at its bottom-left transparent corner: pass the point a peer's
 * ray lands on and the pill floats beside it, leaving the point itself to the cursor's
 * arrow head. Drawn on top of the scene — see the DEPTH note above.
 */
export function createNamedCursor(text: string, color: string): THREE.Sprite {
  const pillWidth = measureTextWidth(text) + PILL_PAD_X * 2;

  const sprite = buildSprite(
    pillWidth + CURSOR_GAP,
    PILL_HEIGHT + CURSOR_GAP,
    (ctx) => {
      drawPill(ctx, CURSOR_GAP, 0, pillWidth, PILL_HEIGHT, color);
      drawText(ctx, text, CURSOR_GAP + pillWidth / 2, PILL_HEIGHT / 2);
    },
    false,
  );

  sprite.center.set(0, 0);
  return sprite;
}

/**
 * A name pill anchored at its bottom edge: pass a point just above a bounding box and
 * the pill grows upward from there, so its placement stays correct as {@link scaleLabel}
 * resizes it.
 */
export function createNameTag(text: string, color: string): THREE.Sprite {
  const width = measureTextWidth(text) + PILL_PAD_X * 2;

  const sprite = buildSprite(width, PILL_HEIGHT, (ctx) => {
    drawPill(ctx, 0, 0, width, PILL_HEIGHT, color);
    drawText(ctx, text, width / 2, PILL_HEIGHT / 2);
  });

  sprite.center.set(0.5, 0);
  return sprite;
}

/**
 * Resize a label so it covers a constant fraction of the viewport, whichever camera is
 * active: the 2D orthographic camera scales sprites by its `zoom`, the 3D perspective
 * one by distance, so both are converted to the world height currently spanning the
 * viewport at the label's position. Cheap enough to call every frame per label.
 */
export function scaleLabel(sprite: THREE.Sprite, camera: THREE.Camera | undefined): void {
  if (!camera) return;

  let worldHeight = 0;
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    worldHeight = (ortho.top - ortho.bottom) / (ortho.zoom || 1);
  } else if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = camera.position.distanceTo(sprite.position);
    worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov * 0.5)) * distance;
  }

  // Cameras are constructed with zeroed frustums (see global-definition) and only sized
  // once the canvas mounts, so fall back rather than collapsing the label to nothing.
  const height = (worldHeight > 0 ? worldHeight : FALLBACK_WORLD_HEIGHT) * LABEL_SCREEN_FRACTION;
  const aspect = (sprite.userData.labelAspect as number | undefined) ?? 1;
  sprite.scale.set(height * aspect, height, 1);
}

/** Free a label's texture and material. The caller removes it from the scene. */
export function disposeLabelSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

// ---------------------------------------------------------------------------
// Canvas plumbing
// ---------------------------------------------------------------------------

/**
 * Build the sprite, and paint it only if this environment has a 2D canvas. The aspect
 * ratio is recorded either way so `scaleLabel` keeps the label's proportions even when
 * it has no texture to take them from.
 */
function buildSprite(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  depthTest = true,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest,
    // Translucent geometry writing depth would occlude whatever sorts behind it.
    depthWrite: false,
  });

  const canvas = createCanvas(width, height);
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      paint(ctx);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
    }
  }

  const sprite = new THREE.Sprite(material);
  sprite.userData.labelAspect = width / height;
  // Drawn after the arrow shafts and box helpers it shares a point with — which is what
  // puts the cursor pill on top, and settles ties between translucent helpers for the
  // depth-tested name tag.
  sprite.renderOrder = 999;
  scaleLabel(sprite, undefined);
  return sprite;
}

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

/** Text width in canvas units, estimated from the character count with no DOM. */
function measureTextWidth(text: string): number {
  const canvas = createCanvas(1, 1);
  const ctx = canvas?.getContext("2d");
  if (!ctx) return text.length * FONT_PX * ESTIMATED_GLYPH_RATIO;
  ctx.font = FONT;
  return ctx.measureText(text).width;
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  ctx.beginPath();
  // roundRect is unavailable in older engines; a square pill still reads correctly.
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, PILL_RADIUS);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fillStyle = color;
  ctx.fill();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}
