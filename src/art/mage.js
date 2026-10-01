// Fire Mage sprite, drawn in code from the reference design:
// blonde high ponytail, navy dress with a dark belt, navy boots, thick dark outline.
// Each body part is outlined separately so overlaps get the inner lines the reference has.

import { Raster, shade3 } from './raster.js';

export const MAGE_W = 48;
export const MAGE_H = 64;

const OUT = '#1b1526';
const HAIR = { hi: '#fff3c9', light: '#f8dd98', mid: '#ecc173', dark: '#cf955a' };
const SKIN = { light: '#fde4cf', mid: '#f5c7a3', dark: '#de9a7b' };
const DRESS = { light: '#5d67ad', mid: '#444b8d', dark: '#2f346c' };
const BELT = { mid: '#221f38', hi: '#3a3660' };
const BOOT = { light: '#4a4880', mid: '#302e56', dark: '#211f3d' };
const EYE = { iris: '#3e66cc', dark: '#22305e', shine: '#a9c6ff' };
const BLUSH = '#f0a38c';

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

const ARMS = {
  down: [[34, 32], [35, 37]],
  forward: [[37.5, 29], [42, 28.5]],
  up: [[37, 24.5], [40, 19]],
  back: [[31, 32], [29, 36]],
};

export function drawMage({ b = 0, sway = 0, arm = 'down', eye = 'open', lean = 0, glow = false } = {}) {
  const out = new Raster(MAGE_W, MAGE_H);
  const L = lean;

  // ---- ponytail (behind everything)
  const pony = out.layer();
  const P = [[22 + L, 8 + b], [12 + L, 3 + b + sway * 0.5], [6 + L + sway, 15 + b], [9 + L + sway * 2, 33 + b]];
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const [x, y] = bez(...P, t);
    const r = 1.5 + 3.6 * Math.sin(Math.PI * (0.12 + 0.78 * t)) * (1 - 0.55 * t);
    pts.push({ x, y, r, t });
  }
  for (const p of pts) pony.ellipse(p.x - 0.7, p.y + 0.7, p.r, p.r, HAIR.dark);
  for (const p of pts) if (p.r > 1.3) pony.ellipse(p.x + 0.3, p.y - 0.3, p.r - 0.9, p.r - 0.9, HAIR.mid);
  for (const p of pts) if (p.t > 0.04 && p.t < 0.72 && p.r > 2.6) pony.ellipse(p.x + 1, p.y - 1, p.r - 2.6, p.r - 2.6, HAIR.light);
  for (const p of pts) if (p.t > 0.12 && p.t < 0.42) pony.set(Math.floor(p.x + p.r * 0.2), Math.floor(p.y - p.r * 0.75), HAIR.hi);
  pony.outline(OUT);
  out.over(pony);

  // ---- back arm
  const bArm = out.layer();
  bArm.capsule(30 + L, 27 + b, 27 + L, 35.5 + b, 1.7, SKIN.dark);
  bArm.ellipse(27 + L, 36 + b, 1.8, 1.8, SKIN.dark);
  bArm.outline(OUT);
  out.over(bArm);

  // ---- legs and boots
  const leg = (x1, x2, footX, skin, tone) => {
    const l = out.layer();
    l.capsule(x1, 45, x2, 53, 1.8, skin);
    l.poly([[x2 - 3, 52], [x2 + 2, 52], [x2 + 2, 59], [x2 - 3, 59]], (nx) => (nx < -0.45 ? tone.dark : tone.mid));
    l.ellipse(footX + 0.6, 60.2, 4.4, 2.3, (nx, ny) => (ny > 0.55 ? tone.dark : nx > 0.2 && ny < 0 ? tone.light : tone.mid));
    l.recolor((x, y) => y === 52, tone.light);
    l.outline(OUT);
    out.over(l);
  };
  leg(29, 28.5, 29.5, SKIN.dark, { light: BOOT.mid, mid: BOOT.dark, dark: '#17152b' });
  leg(34, 35, 36.5, SKIN.mid, BOOT);

  // ---- dress
  const body = out.layer();
  const dressShade = shade3([DRESS.light, DRESS.mid, DRESS.dark], 0.35, -0.3, 0.8, -0.6);
  body.poly([[28.5, 25 + b], [36.5, 25 + b], [37.5, 34 + b], [27.5, 34 + b]], dressShade);
  body.poly([[27.5, 34 + b], [37.5, 34 + b], [41, 46 + b], [24, 46 + b]], dressShade);
  // skirt folds
  body.recolor((x, y) => (x === 30 || x === 34) && y >= 38 + b && y <= 44 + b, (x, y, c) => (c === DRESS.light ? DRESS.mid : DRESS.dark));
  body.recolor((x, y) => y === 45 + b && x % 3 === 0, DRESS.dark);
  // belt
  body.recolor((x, y) => y === 33 + b || y === 34 + b, (x, y) => (y === 33 + b && x > 31 ? BELT.hi : BELT.mid));
  // neck and collar
  body.rect(31 + L, 23 + b, 3, 3, SKIN.dark);
  body.set(32 + L, 25 + b, SKIN.mid);
  body.outline(OUT);
  out.over(body);

  // ---- head
  const head = out.layer();
  head.ellipse(32 + L, 17 + b, 6.6, 7, shade3([SKIN.light, SKIN.light, SKIN.mid], 0, -0.45));
  head.set(39 + L, 18 + b, SKIN.light); // nose
  const hx = 29 + L;
  const hy = 13 + b;
  const bang = (x) => 12.5 + b + (Math.floor(x) % 3 === 0 ? 1.2 : 0) + (x > 36 + L ? 1.5 : 0);
  const inHair = (x, y) =>
    (((x - hx) / 9.5) ** 2 + ((y - hy) / 8) ** 2 <= 1 || ((x - (25.5 + L)) / 5.5) ** 2 + ((y - (17 + b)) / 6.5) ** 2 <= 1) &&
    !(x > 31 + L && y > bang(x));
  const hairShade = shade3([HAIR.light, HAIR.mid, HAIR.dark], 0.25, -0.35);
  head.shape(inHair, (x, y) => {
    const nx = (x - hx) / 9.5;
    const ny = (y - hy) / 8;
    if (ny > -0.74 && ny < -0.5 && nx > -0.5 && nx < 0.6 && Math.floor(x) % 4 !== 0) return HAIR.hi;
    return hairShade(nx, ny);
  });
  // hair tie
  head.ellipse(22.5 + L, 8.5 + b, 1.7, 2, DRESS.mid);
  head.set(23 + L, 7 + b, DRESS.light);
  // face details
  const ex = 35 + L;
  const ey = 16 + b;
  if (eye === 'open') {
    head.rect(ex - 1, ey, 3, 1, EYE.dark);
    head.rect(ex, ey + 1, 2, 2, EYE.iris);
    head.set(ex + 1, ey + 1, EYE.shine);
    head.set(ex, ey + 2, EYE.dark);
  } else if (eye === 'blink') {
    head.rect(ex - 1, ey + 2, 3, 1, EYE.dark);
  } else {
    head.set(ex, ey, EYE.dark);
    head.set(ex + 1, ey + 1, EYE.dark);
    head.set(ex, ey + 2, EYE.dark);
  }
  head.set(34 + L, 20 + b, BLUSH);
  head.set(35 + L, 20 + b, BLUSH);
  head.set(37 + L, 21 + b, SKIN.dark);
  head.outline(OUT);
  out.over(head);

  // ---- front arm with puff sleeve
  const fArm = out.layer();
  const [E, H] = ARMS[arm];
  const sx = 33 + L, sy = 27 + b;
  fArm.capsule(sx, sy, E[0] + L, E[1] + b, 1.6, SKIN.mid);
  fArm.capsule(E[0] + L, E[1] + b, H[0] + L, H[1] + b, 1.5, SKIN.mid);
  fArm.ellipse(H[0] + L, H[1] + b, 1.9, 1.9, SKIN.light);
  fArm.ellipse(sx, sy + 0.5, 3.2, 2.6, shade3([DRESS.light, DRESS.mid, DRESS.dark], 0.2, -0.4));
  fArm.outline(OUT);
  out.over(fArm);

  if (glow) {
    out.ellipse(H[0] + L, H[1] + b, 2.6, 2.6, '#ffb347');
    out.ellipse(H[0] + L, H[1] + b, 1.6, 1.6, '#ffe7a3');
    out.set(Math.floor(H[0] + L), Math.floor(H[1] + b), '#ffffff');
  }
  return out;
}

// The hand position per frame, in sprite pixels from the top-left. Used to launch spell FX.
export function handPos(arm, b = 0) {
  const [, H] = ARMS[arm];
  return [H[0], H[1] + b];
}

export const MAGE_FRAMES = {
  idle0: { b: 0, sway: 0 },
  idle1: { b: 1, sway: 1 },
  blink: { b: 0, sway: 0, eye: 'blink' },
  cast0: { b: 0, sway: -1, arm: 'forward' },
  cast1: { b: 0, sway: -1, arm: 'up', glow: true },
  attack: { b: 0, sway: 0, arm: 'forward', glow: true },
  hit: { b: 0, sway: 2, eye: 'shut', arm: 'back', lean: -1 },
};
