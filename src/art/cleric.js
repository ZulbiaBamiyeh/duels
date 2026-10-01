// Cleric, side view facing right: white hood with a gold-trimmed edge and a long veil, silver-lavender
// hair spilling out behind, white robe with a teal front panel, and a tall sun-disc staff held in front.

import { Sprite, celShade, profileHead, HEAD, W, H } from './chibi.js';

export const CLERIC_W = W;
export const CLERIC_H = H;

const SKIN = { light: '#ffeadb', mid: '#fcd6c2', shade: '#eaa894', line: '#b46c64' };
const HAIR = { light: '#f6f2ff', mid: '#d8cff0', shade: '#a99dcb', shine: '#ffffff', line: '#5e5084' };
const VEIL = { light: '#ffffff', mid: '#eef0f8', shade: '#c3c7dc', line: '#5d6188' };
const ROBE = { light: '#ffffff', mid: '#e8ebf6', shade: '#b6bdd8', line: '#555c86' };
const ROBE_FAR = { light: '#e8ebf6', mid: '#c9cfe4', shade: '#9aa2c2' };
const PANEL = { light: '#69a8d6', mid: '#3e7fb2', shade: '#2a5a88' };
const GOLD = { light: '#ffe390', mid: '#f0b63c', shade: '#c27f28', line: '#7a4a16' };

// near arm holds the staff in front; far arm is behind the body
const POSES = {
  idle: { near: [[50, 62], [59, 68], [67, 72]], far: [[45, 62], [42, 70], [41, 77]], staff: [0, 52] },
  cast0: { near: [[50, 62], [59, 63], [67, 60]], far: [[45, 62], [41, 68], [39, 74]], staff: [0.22, 44], mouth: 'open' },
  cast1: { near: [[50, 61], [59, 56], [67, 50]], far: [[45, 62], [40, 67], [37, 72]], staff: [0.1, 36], mouth: 'open', glow: true },
  attack: { near: [[50, 62], [57, 64], [63, 64]], far: [[45, 62], [41, 69], [39, 75]], staff: [1.25, 26], mouth: 'grit' },
  hit: { near: [[49, 62], [59, 69], [69, 73]], far: [[44, 62], [40, 69], [38, 74]], staff: [0, 50], eye: 'shut', mouth: 'grit', lean: -2 },
};

function sleeve(sp, pts, tone, hand = true) {
  const a = sp.layer();
  const [s, e, w] = pts;
  a.capsule(s[0], s[1], e[0], e[1], 3.8, tone.mid);
  a.capsule(e[0], e[1], w[0], w[1], 3.4, tone.mid);
  celShade(a, { shadow: tone.shade, light: tone.light, shadowW: 2 });
  const dx = w[0] - e[0], dy = w[1] - e[1];
  const L = Math.hypot(dx, dy) || 1;
  a.ellipseR(w[0] - (dx / L) * 2, w[1] - (dy / L) * 2, 2, 4.8, Math.atan2(dy, dx), (nx) => (nx < 0 ? PANEL.shade : PANEL.mid));
  sp.add(a, ROBE.line);
  const hx = w[0] + (dx / L) * 2, hy = w[1] + (dy / L) * 2;
  if (hand) {
    const h = sp.layer();
    h.ellipse(hx, hy, 2.3, 2.3, SKIN.mid);
    h.edge(-1, 1, 1, SKIN.shade);
    sp.add(h, SKIN.line);
  }
  return [hx, hy];
}

function staff(sp, [hx, hy], tilt, len) {
  const s = sp.layer();
  const up = [Math.sin(tilt), -Math.cos(tilt)];
  const top = [hx + up[0] * len, hy + up[1] * len];
  const bot = [hx - up[0] * 44, hy - up[1] * 44];
  s.capsule(bot[0], Math.min(122, bot[1]), top[0], top[1], 1.4, '#9a6a3a');
  s.edge(1, 0, 1, '#c79254');
  const cx = top[0] + up[0] * 6, cy = top[1] + up[1] * 6;
  s.ellipse(cx, cy, 7, 7, GOLD.mid);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    s.capsule(cx, cy, cx + Math.cos(a) * 9.5, cy + Math.sin(a) * 9.5, 1, GOLD.mid);
  }
  celShade(s, { shadow: GOLD.shade, light: GOLD.light, shadowW: 1 });
  s.ellipse(cx, cy, 4.6, 4.6, (nx, ny) => (Math.hypot(nx, ny) > 0.62 ? GOLD.shade : null));
  s.ellipse(cx, cy, 2.6, 2.6, (nx, ny) => (nx + ny < -0.5 ? '#bff6ff' : nx + ny > 0.6 ? '#1f5f8c' : '#3fa8d8'));
  s.set(Math.floor(cx) - 1, Math.floor(cy) - 1, '#ffffff');
  sp.add(s, GOLD.line);
  return [cx, cy];
}

export function drawCleric(pose = 'idle', { b = 0, sway = 0, eye: eyeOverride } = {}) {
  const P = POSES[pose];
  const sp = new Sprite();
  const L = P.lean || 0;
  const eye = eyeOverride || P.eye || 'open';
  const at = (pts) => pts.map(([x, y]) => [x + L, y + b]);

  // ---- veil hanging down the back
  const veil = sp.layer();
  veil.poly([[40 + L, 26 + b], [52 + L, 30 + b], [46 + L, 60 + b], [44 + sway, 84], [30 + sway * 2, 92], [22 + sway * 2, 86], [28 + L, 50 + b]], VEIL.mid);
  celShade(veil, { shadow: VEIL.shade, light: VEIL.light, shadowW: 4 });
  veil.rim(1, GOLD.mid, (x, y) => y > 76);
  sp.add(veil, VEIL.line);

  // ---- long hair spilling from under the hood
  const tail = sp.layer();
  tail.tube([36 + L, 42 + b], [30 + L, 58 + b], [31 + sway, 80], [35 + sway * 2, 98], (t) => 5.5 - t * 3, HAIR.mid);
  celShade(tail, { shadow: HAIR.shade, light: HAIR.light, shadowW: 2 });
  tail.recolor((x, y) => y > 56 && (x + y) % 9 === 0, HAIR.shade);
  sp.add(tail, HAIR.line);

  // ---- far arm
  sleeve(sp, at(P.far), ROBE_FAR);

  // ---- slippers
  for (const [x, tone] of [[41, GOLD.shade], [49, GOLD.mid]]) {
    const f = sp.layer();
    f.ellipse(x + 4.5, 120.5, 5, 2.8, tone);
    f.edge(1, -1, 1, GOLD.light);
    sp.add(f, GOLD.line);
  }

  // ---- robe, side-on
  const robe = sp.layer();
  robe.ellipse(48 + L, 63 + b, 5.5, 4.5, ROBE.mid);
  robe.poly([[42.5 + L, 61 + b], [54 + L, 61 + b], [56 + L, 68 + b], [54.5 + L, 78 + b], [43 + L, 78 + b], [42 + L, 70 + b]], ROBE.mid);
  robe.poly([[42 + L, 77 + b], [55 + L, 77 + b], [60 + sway * 0.5, 100], [62 + sway, 118], [34 + sway, 118], [36 + sway * 0.5, 100]], ROBE.mid);
  celShade(robe, { shadow: ROBE.shade, light: ROBE.light, shadowW: 3 });
  robe.recolor((x, y) => y > 84 && (x === 41 || x === 47) && (x + y) % 6 !== 0, ROBE.shade);
  // teal panel down the front edge, gold-edged
  const front = (y) => 54 + Math.max(0, y - 78) * 0.2;
  robe.recolor((x, y) => y >= 64 + b && x >= front(y) - 4 && x <= front(y), (x, y) => (x < front(y) - 3 ? GOLD.mid : PANEL.mid));
  robe.recolor((x, y) => y >= 115, (x, y) => (y === 115 ? GOLD.light : GOLD.mid));
  robe.recolor((x, y) => y >= 76 + b && y <= 78 + b && x > 40 && x < 58, (x, y) => (y === 76 + b ? GOLD.light : GOLD.mid));
  sp.add(robe, ROBE.line);

  const neck = sp.layer();
  neck.rect(46 + L, 52 + b, 6, 9, SKIN.shade);
  sp.add(neck, SKIN.line);

  // ---- head, then the hood over the back and top of it
  const head = profileHead(sp, SKIN, HAIR, { ox: L, oy: b, eye, mouth: P.mouth || 'smile', iris: '#3cb3cc', irisDark: '#1b5a78', irisLight: '#b4f4ff', blush: '#f4a4a8', nape: false });
  sp.add(head, HAIR.line);
  const hood = sp.layer();
  const fx = HEAD.fx + L, hx = HEAD.hx + L, hy = HEAD.hy + b;
  const edge = (y) => fx - 8 - (y - hy) * 0.15; // front edge of the hood, just behind the face
  hood.shape((x, y) => {
    const inside = ((x - hx) / (HEAD.hrx + 1.5)) ** 2 + ((y - (hy - 1)) / (HEAD.hry + 1.5)) ** 2 <= 1;
    return inside && (x < edge(y) || y < hy - 6);
  }, VEIL.mid);
  hood.shape((x, y) => x > hx - 16 && x < edge(y) && y >= hy && y < hy + 21, VEIL.mid);
  celShade(hood, { shadow: VEIL.shade, light: VEIL.light, shadowW: 2 });
  hood.rim(1, GOLD.mid, (x, y) => (x >= edge(y) - 1.5 && x < edge(y) + 1 && y >= hy - 6) || (y >= hy - 8 && y < hy - 6 && x >= edge(y) - 1.5));
  hood.ellipse(fx + 2, hy - 8, 1.8, 1.8, '#3fa8d8');
  hood.set(Math.floor(fx + 1), Math.floor(hy - 9), '#bff6ff');
  sp.add(hood, VEIL.line);

  // ---- near arm with the staff
  const hand = sleeve(sp, at(P.near), ROBE);
  const disc = staff(sp, hand, P.staff[0], P.staff[1]);
  const grip = sp.layer();
  grip.ellipse(hand[0], hand[1], 2.3, 2.3, SKIN.mid);
  sp.add(grip, SKIN.line);

  const out = sp.finish();
  if (P.glow) {
    out.ellipse(disc[0], disc[1], 3, 3, '#fff0b3');
    out.ellipse(disc[0], disc[1], 1.6, 1.6, '#ffffff');
  }
  out.meta = { hand: disc };
  return out;
}

export const CLERIC_FRAMES = {
  idle0: ['idle', { b: 0, sway: 0 }],
  idle1: ['idle', { b: 1, sway: 1 }],
  blink: ['idle', { b: 0, eye: 'blink' }],
  cast0: ['cast0', { sway: -1 }],
  cast1: ['cast1', { sway: -2 }],
  attack: ['attack', { sway: -1 }],
  hit: ['hit', { sway: 2 }],
};
