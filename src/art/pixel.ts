// Procedural pixel-art canvas. Shapes are drawn with "materials" (3-tone colour
// ramps). A resolve pass applies top-left bevel lighting per material, then an
// outline pass wraps the silhouette – this gives a consistent hand-pixelled
// look to every generated sprite.

export interface Material {
  hi: number;
  mid: number;
  lo: number;
  /** Flat materials ignore lighting (used for ASCII-authored detail). */
  flat?: boolean;
  /** Skip outline next to this material (glows / soft effects). */
  noOutline?: boolean;
}

const materials: Material[] = [];
const flatCache = new Map<number, number>();

export function mat(hi: number, mid: number, lo: number, opts: Partial<Material> = {}): number {
  materials.push({ hi, mid, lo, ...opts });
  return materials.length - 1;
}

export function flat(color: number, noOutline = false): number {
  const key = color + (noOutline ? 0x1000000 : 0);
  const c = flatCache.get(key);
  if (c !== undefined) return c;
  const id = mat(color, color, color, { flat: true, noOutline });
  flatCache.set(key, id);
  return id;
}

export function getMaterial(id: number): Material {
  return materials[id];
}

export const EMPTY = -1;

export class PixelBuf {
  readonly w: number;
  readonly h: number;
  m: Int16Array;
  /** Resolved ARGB-ish colours (0xRRGGBB, with alpha in `a`). */
  c: Uint32Array;
  a: Uint8Array;
  resolved = false;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.m = new Int16Array(w * h).fill(EMPTY);
    this.c = new Uint32Array(w * h);
    this.a = new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, m: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    this.m[y * this.w + x] = m;
  }

  get(x: number, y: number): number {
    if (!this.inside(x, y)) return EMPTY;
    return this.m[y * this.w + x];
  }

  clear(x: number, y: number): void {
    this.set(x, y, EMPTY);
  }

  rect(x: number, y: number, w: number, h: number, m: number): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let yy = y0; yy < y0 + Math.round(h); yy++) for (let xx = x0; xx < x0 + Math.round(w); xx++) this.set(xx, yy, m);
  }

  /** Filled ellipse centred on (cx, cy). Half-pixel centres are supported. */
  ellipse(cx: number, cy: number, rx: number, ry: number, m: number): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / Math.max(0.5, rx);
        const dy = (y + 0.5 - cy) / Math.max(0.5, ry);
        if (dx * dx + dy * dy <= 1) this.set(x, y, m);
      }
    }
  }

  circle(cx: number, cy: number, r: number, m: number): void {
    this.ellipse(cx, cy, r, r, m);
  }

  line(x0: number, y0: number, x1: number, y1: number, m: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, m);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Thick line built from stamped discs – used for limbs. */
  thick(x0: number, y0: number, x1: number, y1: number, width: number, m: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len * 2));
    const r = width / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (width <= 1) this.set(x, y, m);
      else if (width <= 2) {
        this.set(x, y, m);
        this.set(x + 1, y, m);
        this.set(x, y + 1, m);
        this.set(x + 1, y + 1, m);
      } else this.circle(x, y, r, m);
    }
  }

  /** Tapered thick line (width w0 at start, w1 at end). */
  taper(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, m: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = w0 + (w1 - w0) * t;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (w <= 1.2) this.set(x, y, m);
      else this.circle(x, y, w / 2, m);
    }
  }

  /** Scanline polygon fill. */
  poly(pts: number[][], m: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, m);
      }
    }
  }

  /**
   * Stamp ASCII art. `map` maps characters to material ids; '.' and ' ' are
   * transparent. `flipX` mirrors horizontally.
   */
  ascii(rows: string[], map: Record<string, number>, ox: number, oy: number, flipX = false): void {
    const w = rows.reduce((mx, r) => Math.max(mx, r.length), 0);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const m = map[ch];
        if (m === undefined) continue;
        const px = flipX ? ox + (w - 1 - x) : ox + x;
        this.set(px, oy + y, m);
      }
    }
  }

  /** Copy another (unresolved) buffer's materials in, with optional rotation around (px,py). */
  stamp(src: PixelBuf, dx: number, dy: number, opts: { flipX?: boolean; angle?: number; px?: number; py?: number } = {}): void {
    const ang = opts.angle ?? 0;
    if (!ang) {
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          const m = src.m[y * src.w + x];
          if (m === EMPTY) continue;
          const sx = opts.flipX ? src.w - 1 - x : x;
          this.set(dx + sx, dy + y, m);
        }
      }
      return;
    }
    // Rotation via inverse mapping (nearest neighbour) around pivot.
    const px = opts.px ?? src.w / 2;
    const py = opts.py ?? src.h / 2;
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    const R = Math.ceil(Math.hypot(src.w, src.h));
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const sx = Math.floor(px + x * cos - y * sin + 0.5);
        const sy = Math.floor(py + x * sin + y * cos + 0.5);
        if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
        const ssx = opts.flipX ? src.w - 1 - sx : sx;
        const m = src.m[sy * src.w + ssx];
        if (m === EMPTY) continue;
        this.set(dx + px + x, dy + py + y, m);
      }
    }
  }

  /** Apply bevel lighting and write final colours. */
  resolve(): this {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const id = this.m[i];
        if (id === EMPTY) {
          this.a[i] = 0;
          continue;
        }
        const mt = materials[id];
        let col = mt.mid;
        if (!mt.flat) {
          const up = this.get(x, y - 1) !== id;
          const dn = this.get(x, y + 1) !== id;
          const lf = this.get(x - 1, y) !== id;
          const rt = this.get(x + 1, y) !== id;
          const score = (up ? 1 : 0) + (lf ? 0.55 : 0) - (dn ? 1 : 0) - (rt ? 0.55 : 0);
          if (score > 0.3) col = mt.hi;
          else if (score < -0.3) col = mt.lo;
        }
        this.c[i] = col;
        this.a[i] = 255;
      }
    }
    this.resolved = true;
    return this;
  }

  /** Paint an outline in transparent pixels bordering opaque ones. */
  outline(color: number, diagonal = false): this {
    const { w, h } = this;
    const add: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.a[i]) continue;
        let hit = false;
        const check = (xx: number, yy: number) => {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) return;
          const j = yy * w + xx;
          if (!this.a[j]) return;
          const id = this.m[j];
          if (id !== EMPTY && materials[id].noOutline) return;
          hit = true;
        };
        check(x - 1, y);
        check(x + 1, y);
        check(x, y - 1);
        check(x, y + 1);
        if (diagonal) {
          check(x - 1, y - 1);
          check(x + 1, y - 1);
          check(x - 1, y + 1);
          check(x + 1, y + 1);
        }
        if (hit) add.push(i);
      }
    }
    for (const i of add) {
      this.c[i] = color;
      this.a[i] = 255;
    }
    return this;
  }

  /** Set a final colour directly (after resolve). */
  paint(x: number, y: number, color: number, alpha = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.c[i] = color;
    this.a[i] = alpha;
  }

  /** Replace every final pixel of colour `from` with `to`. */
  recolor(from: number, to: number): void {
    for (let i = 0; i < this.c.length; i++) if (this.a[i] && this.c[i] === from) this.c[i] = to;
  }

  clone(): PixelBuf {
    const b = new PixelBuf(this.w, this.h);
    b.m.set(this.m);
    b.c.set(this.c);
    b.a.set(this.a);
    b.resolved = this.resolved;
    return b;
  }

  /** Write resolved pixels into a 2D context at (dx, dy). */
  blit(ctx: CanvasRenderingContext2D, dx: number, dy: number): void {
    if (!this.resolved) this.resolve();
    const img = ctx.createImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0; i < this.w * this.h; i++) {
      const c = this.c[i];
      d[i * 4] = (c >> 16) & 255;
      d[i * 4 + 1] = (c >> 8) & 255;
      d[i * 4 + 2] = c & 255;
      d[i * 4 + 3] = this.a[i];
    }
    // putImageData ignores compositing; draw through a temp canvas to allow overlap.
    const tmp = document.createElement('canvas');
    tmp.width = this.w;
    tmp.height = this.h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, dx, dy);
  }
}

/** Helper to lay out frames in a horizontal strip canvas. */
export class Sheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  fw: number;
  fh: number;
  count: number;
  constructor(fw: number, fh: number, count: number) {
    this.fw = fw;
    this.fh = fh;
    this.count = count;
    this.canvas = document.createElement('canvas');
    this.canvas.width = fw * count;
    this.canvas.height = fh;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }
  put(i: number, buf: PixelBuf, ox = 0, oy = 0): void {
    buf.blit(this.ctx, i * this.fw + ox, oy);
  }
}

export function hexLerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function cssHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
