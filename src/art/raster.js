// Tiny pixel raster used to build sprites, icons and textures in code.
// Shapes are tested at pixel centres, so results are crisp and repeatable.

const hexCache = new Map();
function rgba(hex) {
  let c = hexCache.get(hex);
  if (c) return c;
  const h = hex.slice(1);
  c = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
  hexCache.set(hex, c);
  return c;
}

export class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  inb(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  set(x, y, c) {
    if (c && this.inb(x, y)) this.px[y * this.w + x] = c;
  }
  get(x, y) {
    return this.inb(x, y) ? this.px[y * this.w + x] : null;
  }

  // test(cx, cy) -> bool; color: string | fn(cx, cy) -> string
  shape(test, color, box = [0, 0, this.w, this.h]) {
    const [x0, y0, x1, y1] = box.map((v, i) => (i < 2 ? Math.max(0, Math.floor(v)) : Math.min(i === 2 ? this.w : this.h, Math.ceil(v))));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (test(cx, cy)) this.set(x, y, typeof color === 'function' ? color(cx, cy) : color);
      }
    }
    return this;
  }

  // color fn receives normalised (nx, ny) in [-1, 1]
  ellipse(cx, cy, rx, ry, color) {
    const fn = typeof color === 'function' ? (x, y) => color((x - cx) / rx, (y - cy) / ry, x, y) : color;
    return this.shape((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, fn, [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1]);
  }

  rect(x, y, w, h, color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, typeof color === 'function' ? color(i, j) : color);
    return this;
  }

  poly(pts, color) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const fn = typeof color === 'function'
      ? (x, y) => color(((x - bx0) / (bx1 - bx0 || 1)) * 2 - 1, ((y - by0) / (by1 - by0 || 1)) * 2 - 1, x, y)
      : color;
    return this.shape(inside, fn, [bx0 - 1, by0 - 1, bx1 + 1, by1 + 1]);
  }

  capsule(x1, y1, x2, y2, r, color) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const test = (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
      return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= r * r;
    };
    return this.shape(test, color, [Math.min(x1, x2) - r - 1, Math.min(y1, y2) - r - 1, Math.max(x1, x2) + r + 1, Math.max(y1, y2) + r + 1]);
  }

  // Recolour existing pixels that pass test(x, y, color).
  recolor(test, color) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (c && test(x, y, c)) this.px[y * this.w + x] = typeof color === 'function' ? color(x, y, c) : color;
      }
    return this;
  }

  outline(color, diagonal = false) {
    const src = this.px.slice();
    const at = (x, y) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        let hit = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
        if (!hit && diagonal) hit = at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1);
        if (hit) this.px[y * this.w + x] = color;
      }
    return this;
  }

  over(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + x];
        if (c) this.set(x + dx, y + dy, c);
      }
    return this;
  }

  layer() {
    return new Raster(this.w, this.h);
  }

  toCanvas(scale = 1) {
    const cv = document.createElement('canvas');
    cv.width = this.w * scale;
    cv.height = this.h * scale;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      const [r, g, b, a] = rgba(c);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    if (scale === 1) {
      ctx.putImageData(img, 0, 0);
      return cv;
    }
    const tmp = document.createElement('canvas');
    tmp.width = this.w;
    tmp.height = this.h;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    return cv;
  }
}

// Three-tone cel shading with light from the upper right.
export function shade3([light, mid, dark], hi = 0.3, lo = -0.35, lx = 0.55, ly = -0.83) {
  return (nx, ny) => {
    const d = nx * lx + ny * ly;
    return d > hi ? light : d < lo ? dark : mid;
  };
}

// 4x4 Bayer matrix for ordered dithering.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// Draw an ASCII pixel map. palette maps chars to colours; '.' or ' ' is transparent.
export function fromAscii(rows, palette) {
  const r = new Raster(Math.max(...rows.map((s) => s.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => palette[ch] && r.set(x, y, palette[ch])));
  return r;
}
