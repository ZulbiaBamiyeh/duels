// Shieldmaiden, side view facing right: copper hair in a long braid, steel circlet with a wing over the
// ear, breastplate over a deep teal tunic, tassets and greaves, a kite shield held forward, and a sword.

import { Sprite, celShade, profileHead, HEAD, W, H } from './chibi.js';

export const TANK_W = W;
export const TANK_H = H;

const SKIN = { light: '#ffe6d4', mid: '#f7cdb3', shade: '#de9c84', line: '#a8625a' };
const HAIR = { light: '#f08c4c', mid: '#c95b2e', shade: '#8f3a22', shine: '#ffb47c', line: '#46170f' };
const STEEL = { light: '#eef3fa', mid: '#b2bdd0', shade: '#717d96', line: '#2c3247' };
const STEEL_FAR = { light: '#b2bdd0', mid: '#8994aa', shade: '#5c6680' };
const TUNIC = { light: '#448595', mid: '#2d6070', shade: '#1d4150', line: '#0e2530' };
const GOLD = { light: '#ffe390', mid: '#f0b63c', shade: '#c27f28' };
const LEATHER = { mid: '#6e4630', shade: '#4c2f20' };

// sword = far arm (behind the body); shield = near arm, held forward
const POSES = {
  idle: { sword: [[45, 62], [42, 70], [41, 78]], blade: -2.75, shield: [0, 0] },
  cast0: { sword: [[45, 62], [41, 54], [42, 45]], blade: -0.35, shield: [1, 0], mouth: 'open' },
  cast1: { sword: [[45, 61], [43, 51], [46, 41]], blade: 0.1, shield: [1, 0], mouth: 'open' },
  attack: { sword: [[46, 62], [55, 64], [63, 66]], blade: 1.4, shield: [-5, 4], mouth: 'grit' },
  hit: { sword: [[44, 62], [40, 70], [38, 77]], blade: -2.5, shield: [-1, 1], eye: 'shut', mouth: 'grit', lean: -2 },
};

export function drawTank(pose = 'idle', { b = 0, sway = 0, eye: eyeOverride } = {}) {
  const P = POSES[pose];
  const sp = new Sprite();
  const L = P.lean || 0;
  const eye = eyeOverride || P.eye || 'open';

  // ---- braid down the back
  const braid = sp.layer();
  const bx = (t) => 33 + L - Math.sin(t * 2.2) * 3 + sway * t * 2;
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    braid.ellipse(bx(t), 46 + b + t * 46, 3.8 - t * 1.4, 3.2, HAIR.mid);
  }
  celShade(braid, { shadow: HAIR.shade, light: HAIR.light, shadowW: 2 });
  for (let i = 0; i < 10; i++) braid.rect(Math.round(bx(i / 9)) - 2, Math.round(48 + b + (i / 9) * 46), 3, 1, HAIR.shade);
  braid.ellipse(bx(1), 95 + b, 2, 1.6, GOLD.mid);
  sp.add(braid, HAIR.line);

  // ---- sword arm and sword, behind the body
  const [s, e, w] = P.sword.map(([x, y]) => [x + L, y + b]);
  const arm = sp.layer();
  arm.capsule(s[0], s[1], e[0], e[1], 3, TUNIC.shade);
  arm.capsule(e[0], e[1], w[0], w[1], 2.8, STEEL_FAR.mid);
  celShade(arm, { shadow: STEEL_FAR.shade, light: STEEL_FAR.light, shadowW: 1 });
  arm.ellipse(w[0], w[1], 2.6, 2.6, LEATHER.mid);
  sp.add(arm, STEEL.line);
  const sw = sp.layer();
  const ux = Math.sin(P.blade), uy = -Math.cos(P.blade);
  const tip = [w[0] + ux * 30, w[1] + uy * 30];
  sw.capsule(w[0] + ux * 4, w[1] + uy * 4, tip[0], tip[1], 1.9, STEEL.light);
  sw.capsule(w[0] + ux * 4, w[1] + uy * 4, tip[0] - ux * 2, tip[1] - uy * 2, 0.6, STEEL.mid);
  sw.capsule(w[0] - uy * 5, w[1] + ux * 5, w[0] + uy * 5, w[1] - ux * 5, 1.2, GOLD.mid);
  sw.capsule(w[0] - ux * 4, w[1] - uy * 4, w[0], w[1], 1.1, LEATHER.shade);
  sw.ellipse(w[0] - ux * 5, w[1] - uy * 5, 1.6, 1.6, GOLD.mid);
  sp.add(sw, STEEL.line);

  // ---- legs: greaves and sabatons, far leg darker
  for (const [x, tone] of [[41, STEEL_FAR], [48, STEEL]]) {
    const leg = sp.layer();
    leg.capsule(x + 2, 96, x + 2, 106, 3.4, TUNIC.shade);
    leg.poly([[x - 1, 104], [x + 6, 104], [x + 6.5, 117], [x + 11, 119], [x + 11, 123], [x - 1, 123]], tone.mid);
    celShade(leg, { shadow: tone.shade, light: tone.light, shadowW: 2, test: (px, py, c) => c !== TUNIC.shade });
    leg.recolor((px, py, c) => py === 104 && c !== TUNIC.shade, GOLD.mid);
    leg.recolor((px, py) => py === 112 && px > x, tone.shade);
    sp.add(leg, STEEL.line);
  }

  // ---- tunic skirt, tassets, breastplate (side-on)
  const skirt = sp.layer();
  skirt.poly([[42 + L, 76 + b], [55 + L, 76 + b], [60, 100], [36, 100]], TUNIC.mid);
  celShade(skirt, { shadow: TUNIC.shade, light: TUNIC.light, shadowW: 3 });
  skirt.recolor((x, y) => y >= 98, GOLD.mid);
  sp.add(skirt, TUNIC.line);

  const tassets = sp.layer();
  for (const [x0, x1] of [[40, 48], [48, 57]]) tassets.poly([[x0 + L * 0.5, 78 + b], [x1 + L * 0.5, 78 + b], [x1 + 1, 89], [x0 - 1, 89]], STEEL.mid);
  celShade(tassets, { shadow: STEEL.shade, light: STEEL.light, shadowW: 2 });
  tassets.recolor((x, y) => y === 88, GOLD.mid);
  tassets.recolor((x) => x === 48, STEEL.line);
  sp.add(tassets, STEEL.line);

  const chest = sp.layer();
  chest.ellipse(48 + L, 63 + b, 6, 5, STEEL.mid);
  chest.poly([[42 + L, 61 + b], [54 + L, 61 + b], [57.5 + L, 68 + b], [55 + L, 79 + b], [43 + L, 79 + b], [41.5 + L, 70 + b]], STEEL.mid);
  celShade(chest, { shadow: STEEL.shade, light: STEEL.light, shadowW: 3 });
  chest.recolor((x, y) => y >= 77 + b, LEATHER.mid);
  chest.rect(52 + L, 76 + b, 5, 4, (x, y) => (x === 52 + L || x === 56 + L || y === 76 + b || y === 79 + b ? GOLD.mid : LEATHER.shade));
  chest.recolor((x, y) => y === 61 + b && x > 44 + L, GOLD.mid);
  sp.add(chest, STEEL.line);

  const neck = sp.layer();
  neck.rect(46 + L, 52 + b, 6, 9, SKIN.shade);
  neck.rect(45 + L, 58 + b, 8, 3, TUNIC.mid);
  sp.add(neck, SKIN.line);

  // ---- head with circlet
  const head = profileHead(sp, SKIN, HAIR, { ox: L, oy: b, eye, mouth: P.mouth || 'smile', iris: '#3dbd80', irisDark: '#1b6448', irisLight: '#baffd8', blush: '#f19a8c', nape: false });
  sp.add(head, HAIR.line);
  const circ = sp.layer();
  const hx = HEAD.hx + L, hy = HEAD.hy + b, fx = HEAD.fx + L;
  circ.shape((x, y) => ((x - hx) / (HEAD.hrx + 0.5)) ** 2 + ((y - hy) / (HEAD.hry + 0.5)) ** 2 <= 1 && Math.abs(y - (hy - 3 + (x - hx) * 0.06)) < 0.9 && x < fx + 7, STEEL.mid);
  // small wing above the ear, swept back
  circ.poly([[hx - 7, hy - 4], [hx - 17, hy - 12], [hx - 18, hy - 9], [hx - 9, hy - 2]], STEEL.light);
  circ.poly([[hx - 8, hy - 2], [hx - 17, hy - 7], [hx - 17, hy - 4], [hx - 9, hy]], STEEL.mid);
  circ.ellipse(fx + 4, hy - 2.5, 1.6, 1.6, '#3dbd80');
  sp.add(circ, STEEL.line);

  // ---- shield arm: pauldron, then the kite shield held forward
  const pa = sp.layer();
  pa.ellipse(50 + L, 63 + b, 5, 4.5, STEEL.mid);
  celShade(pa, { shadow: STEEL.shade, light: STEEL.light, shadowW: 2 });
  pa.recolor((x, y) => y > 65 + b, GOLD.mid);
  sp.add(pa, STEEL.line);

  const [sx, sy] = P.shield;
  const sh = sp.layer();
  const ox = 55 + sx + L, oy = 60 + sy + b;
  sh.poly([[ox, oy], [ox + 19, oy - 1], [ox + 20, oy + 18], [ox + 10, oy + 38], [ox - 1, oy + 18]], STEEL.mid);
  const full = sh.px.slice();
  const inside = (x, y) => [[-2, 0], [2, 0], [0, -2], [0, 2]].every(([i, j]) => full[(y + j) * sh.w + x + i]);
  sh.recolor((x, y) => inside(x, y), (x) => (x < ox + 7 ? TUNIC.shade : TUNIC.mid));
  sh.edge(-1, 1, 2, STEEL.shade, (x, y, c) => c === STEEL.mid);
  sh.edge(1, -1, 1, STEEL.light, (x, y, c) => c === STEEL.mid);
  const ex = ox + 10, ey = oy + 14;
  sh.ellipse(ex, ey, 4, 4, GOLD.mid);
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + 0.3;
    sh.capsule(ex, ey, ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7, 0.8, GOLD.mid);
  }
  sh.ellipse(ex, ey, 2, 2, GOLD.light);
  sp.add(sh, STEEL.line);

  const out = sp.finish();
  out.meta = { hand: tip, shield: [ex, ey] };
  return out;
}

export const TANK_FRAMES = {
  idle0: ['idle', { b: 0, sway: 0 }],
  idle1: ['idle', { b: 1, sway: 1 }],
  blink: ['idle', { b: 0, eye: 'blink' }],
  cast0: ['cast0', { sway: -1 }],
  cast1: ['cast1', { sway: -2 }],
  attack: ['attack', { sway: -1 }],
  hit: ['hit', { sway: 2 }],
};
