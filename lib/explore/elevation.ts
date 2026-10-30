// Terrain heights from the open AWS Terrarium elevation tiles.
// Returns a sampler over local metres (x east, y north) around the frame.

import { toLngLat, type LngLat } from "./geo";

const TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const TILE = 256;

export type HeightSampler = {
  /** Ground height in metres relative to the lowest point of the area. */
  at: (x: number, y: number) => number;
  relief: number; // metres between lowest and highest point
  flat: boolean; // true when elevation data could not be loaded
};

const lngToTileX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`tile ${url}`));
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    img.src = url;
  });
}

/**
 * Builds a `res × res` height grid covering ±half metres around `center`, then
 * samples it bilinearly. Zoom is chosen so a tile pixel ≈ one grid cell.
 */
export async function loadHeights(
  center: LngLat,
  half: number,
  res = 256,
  signal?: AbortSignal
): Promise<HeightSampler> {
  const flat: HeightSampler = { at: () => 0, relief: 0, flat: true };
  try {
    const cell = (half * 2) / res;
    const latCos = Math.cos((center[1] * Math.PI) / 180);
    const z = Math.max(8, Math.min(15, Math.round(Math.log2((156543 * latCos) / cell))));

    const [w, s] = toLngLat([-half, -half], center);
    const [e, n] = toLngLat([half, half], center);
    const x0 = Math.floor(lngToTileX(w, z));
    const x1 = Math.floor(lngToTileX(e, z));
    const y0 = Math.floor(latToTileY(n, z));
    const y1 = Math.floor(latToTileY(s, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 36) return flat;

    const cw = (x1 - x0 + 1) * TILE;
    const ch = (y1 - y0 + 1) * TILE;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const jobs: Promise<void>[] = [];
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        jobs.push(
          loadImage(`${TILE_URL}/${z}/${tx}/${ty}.png`, signal).then((img) => {
            ctx.drawImage(img, (tx - x0) * TILE, (ty - y0) * TILE);
          })
        );
      }
    }
    await Promise.all(jobs);
    const px = ctx.getImageData(0, 0, cw, ch).data;

    const rawAt = (lng: number, lat: number) => {
      const fx = (lngToTileX(lng, z) - x0) * TILE - 0.5;
      const fy = (latToTileY(lat, z) - y0) * TILE - 0.5;
      const ix = Math.max(0, Math.min(cw - 2, Math.floor(fx)));
      const iy = Math.max(0, Math.min(ch - 2, Math.floor(fy)));
      const tx = Math.min(1, Math.max(0, fx - ix));
      const ty = Math.min(1, Math.max(0, fy - iy));
      const h = (x: number, y: number) => {
        const i = (y * cw + x) * 4;
        return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
      };
      const top = h(ix, iy) * (1 - tx) + h(ix + 1, iy) * tx;
      const bot = h(ix, iy + 1) * (1 - tx) + h(ix + 1, iy + 1) * tx;
      return top * (1 - ty) + bot * ty;
    };

    // Resample into a local grid, then smooth once to remove tile noise.
    const n1 = res + 1;
    let grid: Float32Array<ArrayBuffer> = new Float32Array(n1 * n1);
    for (let j = 0; j < n1; j++) {
      for (let i = 0; i < n1; i++) {
        const [lng, lat] = toLngLat([-half + i * cell, -half + j * cell], center);
        grid[j * n1 + i] = rawAt(lng, lat);
      }
    }
    grid = blur(grid, n1);

    let min = Infinity,
      max = -Infinity;
    for (const v of grid) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || max - min > 9000) return flat;
    for (let i = 0; i < grid.length; i++) grid[i] -= min;

    return { at: gridSampler(grid, res, half), relief: max - min, flat: false };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    console.warn("[explore] elevation unavailable, using flat terrain", err);
    return flat;
  }
}

function blur(src: Float32Array, n: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(src.length);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0,
        cnt = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di,
            y = j + dj;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          sum += src[y * n + x];
          cnt++;
        }
      }
      out[j * n + i] = sum / cnt;
    }
  }
  return out;
}

/** Bilinear lookup in a (res+1)² grid covering ±half metres. */
function gridSampler(grid: Float32Array, res: number, half: number) {
  const n1 = res + 1;
  const cell = (half * 2) / res;
  return (x: number, y: number) => {
    const fx = Math.max(0, Math.min(res - 1e-6, (x + half) / cell));
    const fy = Math.max(0, Math.min(res - 1e-6, (y + half) / cell));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const a = grid[j * n1 + i];
    const b = grid[j * n1 + i + 1];
    const c = grid[(j + 1) * n1 + i];
    const d = grid[(j + 1) * n1 + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/* ── Terrain shaping ─────────────────────────────────────────────────── */

/** How the ground is printed: smoothed (small bumps gone, slopes kept) or flat. */
export type TerrainMode = "smooth" | "flat";

export const FLAT_GROUND: HeightSampler = { at: () => 0, relief: 0, flat: true };

/**
 * The ground the model is built on — only the terrain changes; roads,
 * buildings and greenery are draped on whatever this returns.
 *
 * "smooth" compares every point with the average height around it. Small
 * departures from that average — bumps, dips and elevation-data noise that
 * print as rough specks — are flattened onto it; larger ones (real hills,
 * banks, valleys) are kept, minus just the small part. An average of a slope
 * is the same slope, so inclines survive untouched. Single-cell spikes go
 * first, through a median filter.
 *
 * `mpm` is metres per printed millimetre, so "small" means small in print.
 */
export function shapeTerrain(h: HeightSampler, mode: TerrainMode, half: number, mpm: number): HeightSampler {
  if (mode === "flat") return FLAT_GROUND;
  if (h.flat) return h;

  const res = 160;
  const n1 = res + 1;
  const cell = (half * 2) / res;
  let grid: Float32Array = new Float32Array(n1 * n1);
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) grid[j * n1 + i] = h.at(-half + i * cell, -half + j * cell);
  }
  grid = median3(grid, n1);

  // Neighbourhood ≈ 3 mm of print (at least 12 m): bumps narrower than that
  // are measured against the ground around them.
  const r = Math.max(1, Math.round(Math.max(12, 3 * mpm) / cell));
  let avg: Float32Array = grid;
  for (let pass = 0; pass < 3; pass++) avg = boxBlur(avg, n1, r);

  // Departures under ~0.5 mm of print (at least 1.5 m) are noise.
  const t = Math.max(1.5, 0.5 * mpm);
  let min = Infinity, max = -Infinity;
  for (let k = 0; k < grid.length; k++) {
    const d = grid[k] - avg[k];
    const v = avg[k] + (Math.abs(d) <= t ? 0 : d - Math.sign(d) * t);
    grid[k] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (let k = 0; k < grid.length; k++) grid[k] -= min;
  return { at: gridSampler(grid, res, half), relief: max - min, flat: max - min < 0.01 };
}

/** 3×3 median: removes one-cell spikes and pits, leaves edges and slopes. */
function median3(src: Float32Array, n: number): Float32Array {
  const out = new Float32Array(src.length);
  const w = new Array<number>(9);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = Math.max(0, Math.min(n - 1, i + di));
          const y = Math.max(0, Math.min(n - 1, j + dj));
          w[k++] = src[y * n + x];
        }
      }
      w.sort((a, b) => a - b);
      out[j * n + i] = w[4];
    }
  }
  return out;
}

/** Separable box blur, radius `r` cells. Edges extend the border slope
 *  (not just its value) so an incline stays straight up to the frame edge. */
function boxBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const get = (a: number, b: number) => (horizontal ? from[a * n + b] : from[b * n + a]);
    for (let a = 0; a < n; a++) {
      const at = (b: number) => {
        if (b < 0) return 2 * get(a, 0) - get(a, Math.min(n - 1, -b));
        if (b >= n) return 2 * get(a, n - 1) - get(a, Math.max(0, 2 * (n - 1) - b));
        return get(a, b);
      };
      let sum = 0;
      for (let b = -r; b <= r; b++) sum += at(b);
      for (let b = 0; b < n; b++) {
        to[horizontal ? a * n + b : b * n + a] = sum / (2 * r + 1);
        sum += at(b + r + 1) - at(b - r);
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}
