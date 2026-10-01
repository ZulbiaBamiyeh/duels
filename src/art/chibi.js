// Shared chibi rig for party sprites (96x128, 3/4 view facing right, feet on row 123).
// Parts are drawn as separate layers, each outlined in a tinted line colour; the final pass turns
// silhouette-edge lines dark ("selective outlining"), which reads much softer than black everywhere.

import { Raster } from './raster.js';

export const W = 96;
export const H = 128;
export const OUT = '#1d1420';

export class Sprite {
  constructor(w = W, h = H) {
    this.r = new Raster(w, h);
    this.line = new Uint8Array(w * h);
  }

  layer() {
    return new Raster(this.r.w, this.r.h);
  }

  // Composite a part, outlining it with lineColor (null = no outline).
  add(layer, lineColor = OUT) {
    const { w, h } = layer;
    const src = layer.px;
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? src[y * w + x] : null);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) {
          this.r.px[i] = src[i];
          this.line[i] = 0;
        } else if (lineColor && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) {
          this.r.px[i] = lineColor;
          this.line[i] = 1;
        }
      }
    return this;
  }

  // Paint without touching line bookkeeping (eyes, glints, glows).
  paint(fn) {
    fn(this.r);
    return this;
  }

  finish(out = OUT) {
    const { w, h, px } = this.r;
    const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !px[y * w + x];
    const edges = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.line[i] && (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1))) edges.push(i);
      }
    for (const i of edges) px[i] = out;
    // close any gaps: silhouette pixels touching empty space that are not lines also get the dark line outside
    return this.r;
  }
}

// Directional cel shading for a single-colour part: light from the upper right.
export function celShade(layer, { shadow, light, deep, shadowW = 3, lightW = 1, deepW = 1, test = null }) {
  if (shadow) layer.edge(-1, 1, shadowW, shadow, test);
  if (deep) layer.edge(-1, 1, deepW, deep, test);
  if (light) layer.edge(1, -1, lightW, light, test);
  return layer;
}

// ---------------------------------------------------------------- head

// Face shape for a 3/4 view facing right. ox/oy shift the whole head.
export function faceTest(ox = 0, oy = 0) {
  const pts = [[37.5 + ox, 44 + oy], [61.5 + ox, 42 + oy], [60 + ox, 49 + oy], [54 + ox, 56.5 + oy], [48 + ox, 56 + oy], [41 + ox, 51 + oy]];
  const inPoly = (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return (x, y) => ((x - (49.5 + ox)) / 12.5) ** 2 + ((y - (42 + oy)) / 11.5) ** 2 <= 1 || inPoly(x, y);
}

export function drawFace(sp, skin, { ox = 0, oy = 0, eye = 'open', mouth = 'smile', iris, irisDark, irisLight, blush = '#f39a9a', lash = '#2a1620' } = {}) {
  const face = sp.layer();
  face.shape(faceTest(ox, oy), skin.mid);
  face.edge(-1, 0, 1, skin.shade);
  face.edge(0, 1, 1, skin.shade);
  face.edge(1, -1, 1, skin.light);
  // soft shadow cast by the bangs across the top of the face
  face.recolor((x, y) => y < 41 + oy, skin.shade);
  sp.add(face, skin.line);

  sp.paint((r) => {
    // eyes: near eye (left, larger) and far eye (right, narrower)
    const eyeAt = (x0, y0, w, h) => {
      if (eye === 'blink') {
        r.rect(x0 - 1, y0 + h - 3, w + 2, 1, lash);
        r.rect(x0, y0 + h - 2, w, 1, lash);
        return;
      }
      if (eye === 'shut') {
        // >< squeeze
        for (let k = 0; k < Math.ceil(h / 2); k++) r.set(x0 + k, y0 + 2 + k, lash), r.set(x0 + k, y0 + h - k, lash);
        r.rect(x0 + Math.ceil(h / 2) - 1, y0 + Math.ceil(h / 2) + 1, 2, 1, lash);
        return;
      }
      r.rect(x0, y0 + 2, w, h - 2, '#fbf3ee');
      r.rect(x0 + (w > 4 ? 1 : 0), y0 + 2, w - (w > 4 ? 1 : 0), h - 2, irisDark);
      r.rect(x0 + (w > 4 ? 1 : 0), y0 + 2 + Math.floor((h - 2) / 2), w - (w > 4 ? 1 : 0), Math.ceil((h - 2) / 2), iris);
      r.rect(x0 + (w > 4 ? 2 : 1), y0 + h - 1, Math.max(1, w - 3), 1, irisLight);
      r.rect(x0 - 1, y0, w + 2, 2, lash); // heavy upper lash
      r.set(x0 + w + 1, y0 - 1, lash); // lash flick
      r.rect(x0 + 1, y0 + 3, 2, 2, '#ffffff');
      r.set(x0 + w - 1, y0 + h - 2, '#ffffff');
      r.rect(x0, y0 + h, w, 1, skin.shade);
    };
    eyeAt(42 + ox, 41 + oy, 6, 8);
    eyeAt(54 + ox, 41 + oy, 4, 7);
    // blush
    r.rect(41 + ox, 51 + oy, 3, 1, blush);
    r.rect(55 + ox, 50 + oy, 2, 1, blush);
    // nose hint
    r.set(53 + ox, 48 + oy, skin.shade);
    // mouth
    const mx = 50 + ox, my = 52 + oy;
    if (mouth === 'open') {
      r.rect(mx - 1, my, 3, 2, '#7a2430');
      r.rect(mx - 1, my + 2, 3, 1, '#c45a62');
      r.rect(mx - 1, my - 1, 3, 1, lash);
    } else if (mouth === 'flat') {
      r.rect(mx - 1, my, 3, 1, skin.line);
    } else if (mouth === 'grit') {
      r.rect(mx - 1, my, 4, 1, lash);
      r.rect(mx - 1, my + 1, 4, 1, '#ffffff');
    } else {
      r.rect(mx - 1, my, 2, 1, skin.line);
      r.set(mx + 1, my - 1, skin.line);
    }
  });
}

// Spiky anime bangs across the top of the face.
export function bangsTest(cx, cy, rx, ry, base, depth, period = 6, phase = 0) {
  return (x, y) => {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) return false;
    const p = ((((x - phase) % period) + period) % period) / period;
    const tri = 1 - Math.abs(p * 2 - 1);
    return y < base + tri * depth;
  };
}

// The glossy "angel ring" highlight across a hair cap.
export function hairShine(layer, cx, cy, rx, ry, color, band = [0.5, 0.68], gap = 5) {
  layer.recolor((x, y) => {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const d = Math.hypot(nx, ny);
    return ny < -0.05 && nx > -0.75 && d > band[0] && d < band[1] && (x % gap) !== 0;
  }, color);
}

// Limb: shoulder -> elbow -> hand, with a sleeve colour on the upper part.
export function limb(layer, pts, r, color) {
  for (let i = 0; i < pts.length - 1; i++) layer.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Array.isArray(r) ? r[i] : r, Array.isArray(color) ? color[i] : color);
  return layer;
}

// Simple boot with a folded cuff and a toe pointing right.
export function boot(layer, x, top, tone, { cuff, toe = 6, w = 7 } = {}) {
  layer.poly([[x, top], [x + w, top], [x + w, 119], [x, 119]], tone.mid);
  layer.ellipse(x + (w + toe) / 2, 120.5, (w + toe) / 2 + 0.5, 2.6, tone.mid);
  layer.rect(x - 1, 122, w + toe + 2, 1, tone.dark);
  layer.edge(-1, 0, 2, tone.dark);
  layer.edge(0, 1, 1, tone.dark);
  layer.edge(1, -1, 1, tone.light);
  if (cuff) layer.rect(x - 1, top, w + 2, 3, (i, j) => (j === top ? cuff.light : cuff.mid));
  return layer;
}

// ---------------------------------------------------------------- profile head (facing right)
// Face, one eye, nose bump, and a hair cap that covers the back of the head with spiky bangs in
// front. Returns the head layer so characters can add locks, tails or headwear before outlining.
export const HEAD = { fx: 51, fy: 41, frx: 12.5, fry: 13, hx: 45, hy: 33, hrx: 18.5, hry: 15.5 };

export function profileHead(sp, skin, hair, { ox = 0, oy = 0, eye = 'open', mouth = 'smile', iris, irisDark, irisLight, blush = '#f39a9a', lash = '#2a1620', bangDepth = 3, nape = true } = {}) {
  const h = sp.layer();
  const fx = HEAD.fx + ox, fy = HEAD.fy + oy;
  // face with a slightly forward chin
  h.ellipse(fx, fy, HEAD.frx, HEAD.fry, skin.mid);
  h.poly([[fx - 2, fy + 6], [fx + 11, fy + 6], [fx + 9, fy + 11], [fx + 4, fy + 13.5], [fx - 2, fy + 12]], skin.mid);
  h.poly([[fx + 10, fy - 2], [fx + 14.2, fy + 2.6], [fx + 10, fy + 3.5]], skin.mid); // nose
  h.edge(0, 1, 1, skin.shade);
  h.recolor((x, y, c) => c === skin.mid && x < fx - 4, skin.shade);
  h.edge(1, -1, 1, skin.light);

  // hair cap: back of the head plus bangs over the forehead
  const hx = HEAD.hx + ox, hy = HEAD.hy + oy;
  const inCap = (x, y) =>
    ((x - hx) / HEAD.hrx) ** 2 + ((y - hy) / HEAD.hry) ** 2 <= 1 ||
    ((x - (hx - 6)) / 11) ** 2 + ((y - (hy + 9)) / 13) ** 2 <= 1;
  const bangLine = (x) => {
    const p = (((x - 1) % 5) + 5) % 5 / 5;
    const tri = 1 - Math.abs(p * 2 - 1);
    return hy - 1 + tri * bangDepth + (x > fx + 6 ? 2 : 0);
  };
  const face = (x, y) => x > fx - 5 && y > bangLine(x);
  h.shape((x, y) => inCap(x, y) && !face(x, y), (x, y) => {
    const nx = (x - hx) / HEAD.hrx, ny = (y - hy) / HEAD.hry;
    if (ny > -0.78 && ny < -0.52 && nx > -0.55 && nx < 0.6 && Math.floor(x) % 5 !== 0) return hair.shine;
    const d = nx * 0.55 + ny * -0.83;
    return d > 0.3 ? hair.light : d < -0.35 ? hair.shade : hair.mid;
  });
  // sideburn lock in front of the ear
  h.tube([fx - 4, hy + 4], [fx - 5, hy + 14], [fx - 4, hy + 20], [fx - 3, hy + 26], (t) => 2.6 - t * 1.4, hair.mid);
  if (nape) h.tube([hx - 10, hy + 14], [hx - 12, hy + 20], [hx - 10, hy + 24], [hx - 7, hy + 27], (t) => 4 - t * 2, hair.shade);

  // eye (anime profile: iris toward the back, a sliver of white in front)
  const ex = Math.floor(fx + 5), ey = Math.floor(fy - 4);
  if (eye === 'open') {
    h.rect(ex, ey + 1, 3, 3, irisDark);
    h.rect(ex, ey + 4, 3, 2, iris);
    h.rect(ex + 1, ey + 6, 2, 1, irisLight);
    h.rect(ex + 3, ey + 2, 1, 4, '#fbf3ee');
    h.rect(ex - 1, ey, 5, 1, lash);
    h.rect(ex - 1, ey + 1, 1, 2, lash);
    h.set(ex - 2, ey - 1, lash);
    h.set(ex + 1, ey + 2, '#ffffff');
    h.set(ex + 1, ey + 3, '#ffffff');
    h.rect(ex, ey + 7, 3, 1, skin.shade);
  } else if (eye === 'blink') {
    h.rect(ex - 1, ey + 5, 5, 1, lash);
    h.set(ex - 2, ey + 4, lash);
  } else {
    for (let k = 0; k < 3; k++) h.set(ex + 2 - k, ey + 2 + k, lash), h.set(ex + 2 - k, ey + 6 - k, lash);
  }
  h.rect(ex - 1, ey + 9, 3, 1, blush);
  const mx = Math.floor(fx + 10), my = Math.floor(fy + 7);
  if (mouth === 'open') {
    h.rect(mx - 1, my, 2, 2, '#7a2430');
    h.set(mx - 1, my + 2, '#c45a62');
  } else if (mouth === 'grit') {
    h.rect(mx - 2, my, 3, 1, lash);
  } else {
    h.rect(mx - 1, my, 2, 1, skin.line);
  }
  return h;
}
