/**
 * Deterministic Mulberry32 PRNG for reproducible runs via NOVAKI_QA.start({ seed })
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = (seed >>> 0) || 0x1337beef;
  }

  public setSeed(seed: number): void {
    this.state = (seed >>> 0) || 0x1337beef;
  }

  public getSeedState(): number {
    return this.state;
  }

  /** Returns a float in [0, 1) */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max) */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  public int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  /** Returns true with probability p (0..1) */
  public chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks a random element from a non-empty array */
  public pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Returns a new shuffled copy of an array */
  public shuffle<T>(arr: readonly T[]): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
}

/**
 * Spatial Hash Grid for O(1) broadphase collision and nearest-neighbor queries.
 * Handles 500+ enemies and projectiles at locked 60 FPS without GC pressure.
 */
export class SpatialHashGrid<T extends { x: number; y: number; radius: number }> {
  private cellSize: number;
  private cells: Map<number, T[]> = new Map();
  private pool: T[][] = [];

  constructor(cellSize: number = 96) {
    this.cellSize = cellSize;
  }

  private hash(cx: number, cy: number): number {
    // Pack two signed 16-bit cell coordinates into one 32-bit integer key
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  public clear(): void {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.pool.push(bucket);
    }
    this.cells.clear();
  }

  public insert(item: T): void {
    const r = item.radius;
    const minX = Math.floor((item.x - r) / this.cellSize);
    const maxX = Math.floor((item.x + r) / this.cellSize);
    const minY = Math.floor((item.y - r) / this.cellSize);
    const maxY = Math.floor((item.y + r) / this.cellSize);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = this.hash(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = this.pool.pop() || [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  public queryRadius(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.cells.get(this.hash(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          const dx = item.x - x;
          const dy = item.y - y;
          const maxDist = radius + item.radius;
          if (dx * dx + dy * dy <= maxDist * maxDist) {
            if (out.indexOf(item) === -1) {
              out.push(item);
            }
          }
        }
      }
    }
    return out;
  }
}
