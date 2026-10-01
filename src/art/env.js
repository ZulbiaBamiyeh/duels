// Environment textures for the training courtyard at dusk. All pixel art, all generated.

import { Raster, bayer } from './raster.js';
import { mulberry32 } from '../sim/rng.js';

const SKY = ['#211d35', '#2b2541', '#372f4f', '#47395a', '#5a4562', '#715266', '#8a6068', '#a7716c'];

// Full-view sky. horizonY: pixel row where the floor's far edge sits.
export function drawSky(w, h, horizonY) {
  const r = new Raster(w, h);
  const n = SKY.length - 1;
  for (let y = 0; y < h; y++) {
    const t = Math.min(1, Math.max(0, y / Math.max(1, horizonY + 6)));
    const f = t * n;
    const i = Math.min(n - 1, Math.floor(f));
    const frac = f - i;
    for (let x = 0; x < w; x++) r.set(x, y, frac > bayer(x, y) ? SKY[i + 1] : SKY[i]);
  }
  const rng = mulberry32(11);
  for (let k = 0; k < w * 0.25; k++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * horizonY * 0.55);
    r.set(x, y, rng() > 0.8 ? '#efe6ff' : '#8f86ad');
  }
  // moon
  const mx = Math.round(w * 0.8);
  const my = Math.round(horizonY * 0.3);
  r.ellipse(mx + 0.5, my + 0.5, 11, 11, (nx, ny, x, y) => (Math.hypot(nx, ny) > 0.8 && bayer(Math.floor(x), Math.floor(y)) > 0.5 ? '#4a3f62' : null));
  r.ellipse(mx + 0.5, my + 0.5, 6.5, 6.5, (nx, ny) => (nx * 0.6 - ny * 0.8 < -0.45 ? '#cdbfa8' : '#efe3cb'));
  r.set(mx + 2, my - 1, '#d8cbb3');
  r.set(mx - 1, my + 2, '#d8cbb3');
  r.set(mx - 2, my - 2, '#e0d4bd');
  return r;
}

// Academy skyline silhouettes. near = darker, more detailed.
export function drawSkyline(w, h, near, seed) {
  const r = new Raster(w, h);
  const rng = mulberry32(seed);
  const base = near ? '#2c2540' : '#45395b';
  const rim = near ? '#3e3456' : '#54476a';
  const lit = near ? ['#f2c46f', '#e39a55'] : ['#b58b6a'];
  const blocks = [];
  let x = -6;
  while (x < w + 6) {
    const bw = near ? 10 + Math.floor(rng() * 16) : 7 + Math.floor(rng() * 14);
    const tall = rng() < (near ? 0.3 : 0.4);
    const bh = Math.floor((near ? 10 : 18) + rng() * (tall ? h * 0.75 : h * 0.3));
    blocks.push({ x, w: bw, h: Math.min(h - 4, bh), roof: Math.floor(rng() * 4) });
    x += bw + (rng() < 0.3 ? Math.floor(rng() * 6) : -1);
  }
  for (const b of blocks) {
    const top = h - b.h;
    r.rect(b.x, top, b.w, b.h, base);
    const cx = b.x + b.w / 2;
    if (b.roof === 0) r.poly([[b.x - 1, top + 0.5], [cx, top - b.w * 0.9], [b.x + b.w + 1, top + 0.5]], base);
    else if (b.roof === 1) r.ellipse(cx, top, b.w / 2, b.w / 2.4, base);
    else if (b.roof === 2) for (let i = b.x; i < b.x + b.w; i += 3) r.rect(i, top - 2, 2, 2, base);
    else {
      r.rect(Math.floor(cx) - 1, top - 6, 2, 6, base);
      r.poly([[cx - 2, top - 5.5], [cx, top - 12], [cx + 2, top - 5.5]], base);
    }
    // windows
    for (let wy = top + 3; wy < h - 3; wy += near ? 6 : 5) {
      for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += near ? 5 : 4) {
        if (rng() < (near ? 0.18 : 0.12)) {
          const c = lit[Math.floor(rng() * lit.length)];
          r.set(wx, wy, c);
          r.set(wx, wy + 1, c);
          if (near) r.set(wx + 1, wy + 1, c), r.set(wx + 1, wy, c);
        }
      }
    }
  }
  // rim light along the top edges, catching the dusk
  r.recolor((px, py) => !r.get(px, py - 1), (px, py) => (bayer(px, py) > 0.35 ? rim : base));
  if (near) {
    // tree line in front of the buildings
    for (let tx = -4; tx < w + 4; tx += 5 + Math.floor(rng() * 7)) {
      const tr = 4 + rng() * 6;
      r.ellipse(tx, h - tr * 0.6, tr, tr * 0.9, (nx, ny, px, py) => (ny < -0.5 && bayer(Math.floor(px), Math.floor(py)) > 0.5 ? '#2f3346' : '#222436'));
    }
  }
  return r;
}

// Stone balustrade that closes the far edge of the courtyard.
export function drawBalustrade(w) {
  const h = 16;
  const r = new Raster(w, h);
  r.rect(0, 0, w, 3, (x, y) => (y === 0 ? '#9a8fae' : '#7c7193'));
  r.rect(0, 12, w, 4, (x, y) => (y === 12 ? '#6d6385' : '#4e4563'));
  for (let x = 2; x < w; x += 7) {
    r.ellipse(x + 1.5, 7.5, 2.2, 3.4, (nx) => (nx > 0.3 ? '#8a7fa1' : nx < -0.4 ? '#4f4664' : '#6a6083'));
    r.rect(x + 1, 3, 1, 9, '#5d5476');
  }
  for (let x = 0; x < w; x += 42) r.rect(x, 0, 5, 16, (px, py) => (py === 0 ? '#a99fbd' : px === x ? '#5d5476' : '#857a9c'));
  r.recolor((x, y) => y === 3, '#3d3550');
  return r;
}

// Floor tiles, authored already foreshortened so one texel maps to one screen pixel.
export function drawFloorTile() {
  const W = 64;
  const rows = [5, 6, 6, 7, 5, 6, 6, 7];
  const H = rows.reduce((a, b) => a + b, 0);
  const r = new Raster(W, H);
  const rng = mulberry32(5);
  const tones = ['#565070', '#5c5677', '#524b69', '#605a7b', '#5a536f'];
  let y = 0;
  rows.forEach((rh) => {
    let x = Math.floor(rng() * 20);
    const start = x;
    while (x < start + W) {
      const bw = 12 + Math.floor(rng() * 12);
      const tone = tones[Math.floor(rng() * tones.length)];
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < bw; i++) {
          const px = (x + i) % W;
          let c = tone;
          if (i === 0 || j === rh - 1) c = '#3a3349';
          else if (j === 0) c = '#6c6587';
          else if (j === rh - 2) c = '#4d4762';
          else if (rng() < 0.05) c = '#4a4460';
          r.set(px, y + j, c);
        }
      }
      if (rng() < 0.15) {
        const cx = x + 3 + Math.floor(rng() * (bw - 6));
        r.set(cx % W, y + 2, '#3d374f');
        r.set((cx + 1) % W, y + 3, '#3d374f');
      }
      x += bw;
    }
    y += rh;
  });
  return r;
}

// Painted duel circle on the floor (foreshortened ellipse).
export function drawDuelCircle(rx, ry) {
  const w = Math.ceil(rx * 2 + 4);
  const h = Math.ceil(ry * 2 + 4);
  const r = new Raster(w, h);
  const cx = w / 2, cy = h / 2;
  const ring = (k, col, step = 1) =>
    r.shape((x, y) => {
      const d = Math.hypot((x - cx) / (rx * k), (y - cy) / (ry * k));
      return Math.abs(d - 1) < 0.6 / (ry * k) + 0.012;
    }, (x) => (Math.floor(x) % step === 0 ? col : null));
  ring(1, '#c9a86a66');
  ring(0.92, '#c9a86a33', 2);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    r.set(Math.floor(cx + Math.cos(a) * rx * 0.96), Math.floor(cy + Math.sin(a) * ry * 0.96), '#e2c48a88');
  }
  return r;
}

// Cast rune that lights up under the caster's feet.
export function drawRune(rx, ry) {
  const w = Math.ceil(rx * 2 + 2), h = Math.ceil(ry * 2 + 2);
  const r = new Raster(w, h);
  const cx = w / 2, cy = h / 2;
  r.shape((x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return (d <= 1 && d > 0.84) || (d < 0.62 && d > 0.5);
  }, '#ffb347');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    r.set(Math.floor(cx + Math.cos(a) * rx * 0.73), Math.floor(cy + Math.sin(a) * ry * 0.73), '#fff0b3');
  }
  return r;
}

export function drawShadow(rx, ry) {
  const w = Math.ceil(rx * 2), h = Math.ceil(ry * 2);
  const r = new Raster(w, h);
  r.ellipse(w / 2, h / 2, rx, ry, (nx, ny, x, y) => (Math.hypot(nx, ny) < 0.7 || bayer(Math.floor(x), Math.floor(y)) > 0.5 ? '#120e1c' : null));
  return r;
}

// Soft round glow, dithered towards the edge (used with additive blending).
export function drawGlow(radius, color) {
  const s = Math.ceil(radius * 2);
  const r = new Raster(s, s);
  r.ellipse(s / 2, s / 2, radius, radius, (nx, ny, x, y) => {
    const d = Math.hypot(nx, ny);
    return 1 - d > bayer(Math.floor(x), Math.floor(y)) * 1.1 ? color : null;
  });
  return r;
}

// Block bubble drawn around a unit.
export function drawShieldBubble(rx, ry) {
  const w = Math.ceil(rx * 2 + 2), h = Math.ceil(ry * 2 + 2);
  const r = new Raster(w, h);
  const cx = w / 2, cy = h / 2;
  r.shape((x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry) <= 1, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d > 0.93) return '#cfe4f7';
    if (d > 0.82) return bayer(Math.floor(x), Math.floor(y)) > 0.5 ? '#8fb3d9aa' : null;
    if ((x - cx) / rx > 0.2 && (y - cy) / ry < -0.4 && d > 0.6) return '#e6f2ffaa';
    return bayer(Math.floor(x), Math.floor(y)) > 0.85 ? '#8fb3d955' : null;
  });
  return r;
}

export function drawLantern() {
  const r = new Raster(10, 34);
  r.rect(4, 10, 2, 24, (x) => (x === 4 ? '#2a2338' : '#3d344f'));
  r.rect(1, 9, 8, 1, '#2a2338');
  r.rect(2, 1, 6, 1, '#2a2338');
  r.rect(3, 0, 4, 1, '#3d344f');
  r.rect(2, 2, 6, 7, (x, y) => (x === 2 || x === 7 ? '#2a2338' : y < 5 ? '#fff0b3' : '#ffc26b'));
  r.rect(4, 3, 2, 4, '#ffffff');
  r.outline('#1b1526');
  return r;
}
