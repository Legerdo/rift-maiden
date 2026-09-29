// Uniform grid for enemy broad-phase queries (projectiles, explosions, AI).

import { ARENA_W, GAME_H } from '../core/constants';

export interface GridItem {
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** De-duplication stamp used during queries. */
  qstamp: number;
}

export class SpatialGrid<T extends GridItem> {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private cells: T[][];
  private stamp = 1;
  private readonly minX = -160;
  private readonly minY = -120;

  constructor(cell = 32) {
    this.cell = cell;
    this.cols = Math.ceil((ARENA_W + 320) / cell);
    this.rows = Math.ceil((GAME_H + 240) / cell);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private cx(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell)));
  }
  private cy(y: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.minY) / this.cell)));
  }

  insert(it: T): void {
    const x0 = this.cx(it.x - it.hw);
    const x1 = this.cx(it.x + it.hw);
    const y0 = this.cy(it.y - it.hh);
    const y1 = this.cy(it.y + it.hh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.cells[y * this.cols + x].push(it);
  }

  /** Items whose cells overlap the rectangle. Reuses `out`. */
  query(x0: number, y0: number, x1: number, y1: number, out: T[]): T[] {
    out.length = 0;
    const s = ++this.stamp;
    const cx0 = this.cx(Math.min(x0, x1));
    const cx1 = this.cx(Math.max(x0, x1));
    const cy0 = this.cy(Math.min(y0, y1));
    const cy1 = this.cy(Math.max(y0, y1));
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const c = this.cells[y * this.cols + x];
        for (let i = 0; i < c.length; i++) {
          const it = c[i];
          if (it.qstamp === s) continue;
          it.qstamp = s;
          out.push(it);
        }
      }
    }
    return out;
  }

  queryCircle(x: number, y: number, r: number, out: T[]): T[] {
    return this.query(x - r, y - r, x + r, y + r, out);
  }
}
