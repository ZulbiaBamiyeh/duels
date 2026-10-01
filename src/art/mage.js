// Fire Mage: an original witch design, side view facing right. Big crooked hat with a gold band,
// dark hair with long side locks, crimson dress with gold zigzag hems, cape, fingerless gloves, boots.

import { Sprite, celShade, profileHead, boot, W, H } from './chibi.js';

export const MAGE_W = W;
export const MAGE_H = H;

const SKIN = { light: '#ffeadb', mid: '#fcd4be', shade: '#eaa48e', line: '#b4685f' };
const HAIR = { light: '#7d5244', mid: '#5a3a32', shade: '#3e2723', shine: '#a06e58', line: '#24151a' };
const DRESS = { light: '#e4585e', mid: '#c33a46', shade: '#8e2434', line: '#561424' };
const GOLD = { light: '#ffe390', mid: '#f0b63c', shade: '#c27f28' };
const CAPE = { light: '#7c4756', mid: '#5c3341', shade: '#40222f', line: '#26101a' };
const LINING = { shade: '#6e2430' };
const HAT = { light: '#7a4a50', mid: '#583239', shade: '#3c2028', line: '#24101a' };
const STOCK = { light: '#4b4158', mid: '#2f2939', shade: '#1f1b27', line: '#120e18' };
const BOOT = { light: '#e48c52', mid: '#c4683b', dark: '#8a4227' };
const BOOT_FAR = { light: '#c4683b', mid: '#a5552f', dark: '#743621' };
const CUFF = { light: '#f4ad6a', mid: '#dc8749' };
const GLOVE = { mid: '#2c2535', light: '#463d55' };

// near = the casting arm in front of the body; far = the arm behind it
const POSES = {
  idle: { near: [[50, 62], [52, 70], [53, 78]], far: [[45, 62], [42, 70], [40, 77]], nearHand: 'fist' },
  cast0: { near: [[50, 62], [55, 69], [60, 66]], far: [[45, 62], [41, 68], [38, 74]], nearHand: 'open', mouth: 'open' },
  cast1: { near: [[50, 61], [59, 58], [68, 53]], far: [[45, 62], [40, 67], [36, 71]], nearHand: 'open', mouth: 'open', glow: true },
  attack: { near: [[50, 62], [60, 62], [69, 61]], far: [[45, 62], [41, 69], [38, 75]], nearHand: 'open', glow: true },
  hit: { near: [[49, 62], [46, 70], [44, 76]], far: [[44, 62], [40, 69], [38, 74]], nearHand: 'fist', eye: 'shut', mouth: 'grit', lean: -2 },
};

function arm(sp, pts, hand, tone = DRESS) {
  const a = sp.layer();
  const [s, e, w] = pts;
  a.capsule(s[0], s[1], e[0], e[1], 3.6, tone.mid);
  a.capsule(e[0], e[1], w[0], w[1], 3.2, tone.mid);
  celShade(a, { shadow: tone.shade, light: tone.light, shadowW: 2 });
  const dx = w[0] - e[0], dy = w[1] - e[1];
  const L = Math.hypot(dx, dy) || 1;
  a.ellipseR(w[0] - (dx / L) * 2.5, w[1] - (dy / L) * 2.5, 2.2, 4.6, Math.atan2(dy, dx), (nx) => (nx < 0 ? GOLD.shade : GOLD.mid));
  sp.add(a, DRESS.line);
  const h = sp.layer();
  const hx = w[0] + (dx / L) * 2, hy = w[1] + (dy / L) * 2;
  h.ellipse(hx, hy, 2.3, 2.3, GLOVE.mid);
  if (hand === 'open') {
    for (let k = -1; k <= 1; k++) {
      const ang = Math.atan2(dy, dx) + k * 0.45;
      h.capsule(hx, hy, hx + Math.cos(ang) * 4.5, hy + Math.sin(ang) * 4.5, 0.9, SKIN.mid);
    }
  }
  h.recolor((x, y, c) => c === GLOVE.mid && y < hy - 0.5, GLOVE.light);
  sp.add(h, '#120e18');
  return [hx, hy];
}

export function drawMage(pose = 'idle', { b = 0, sway = 0, eye: eyeOverride } = {}) {
  const P = POSES[pose];
  const sp = new Sprite();
  const L = P.lean || 0;
  const eye = eyeOverride || P.eye || 'open';
  const at = (pts) => pts.map(([x, y]) => [x + L, y + b]);

  // ---- cape streaming behind
  const cape = sp.layer();
  cape.poly([[52 + L, 58 + b], [42 + L, 58 + b], [32 + L, 68 + b], [22 + sway * 2, 94], [16 + sway * 2, 112], [30 + sway, 110], [40, 112], [52, 104], [56 + L, 80 + b]], CAPE.mid);
  celShade(cape, { shadow: CAPE.shade, light: CAPE.light, shadowW: 4 });
  cape.recolor((x, y) => y > 100 && x > 34 && x < 52, LINING.shade);
  cape.rim(1, GOLD.mid, (x, y) => y > 66);
  cape.recolor((x, y, c) => c === GOLD.mid && x < 30, GOLD.shade);
  sp.add(cape, CAPE.line);

  // ---- long lock falling down the back
  const back = sp.layer();
  back.tube([37 + L, 42 + b], [34 + L, 52 + b], [35 + L, 62 + b], [38 + L, 70 + b], (t) => 4 - t * 2.2, HAIR.mid);
  celShade(back, { shadow: HAIR.shade, light: HAIR.light, shadowW: 2 });
  sp.add(back, HAIR.line);

  // ---- far arm, behind the body (slightly darker)
  arm(sp, at(P.far), 'fist', { light: DRESS.mid, mid: DRESS.shade, shade: '#6e1a2a' });

  // ---- legs and boots: far leg first, darker
  for (const [x1, x2, xb, tone, bt] of [[45, 44, 40, { light: STOCK.mid, mid: STOCK.shade }, BOOT_FAR], [51, 52, 49, STOCK, BOOT]]) {
    const leg = sp.layer();
    leg.capsule(x1, 95, x2, 108, 3.3, tone.mid);
    celShade(leg, { shadow: STOCK.shade, light: tone.light, shadowW: 1 });
    sp.add(leg, STOCK.line);
    const bl = sp.layer();
    boot(bl, xb, 106, bt, { cuff: CUFF, toe: 4, w: 6 });
    sp.add(bl, '#5a2616');
  }

  // ---- dress, side-on
  const dress = sp.layer();
  dress.ellipse(48 + L, 63 + b, 5.5, 4.5, DRESS.mid);
  dress.poly([[42.5 + L, 61 + b], [54 + L, 61 + b], [56 + L, 68 + b], [54.5 + L, 78 + b], [43 + L, 78 + b], [42 + L, 70 + b]], DRESS.mid);
  dress.poly([[42 + L, 77 + b], [55 + L, 77 + b], [62, 97], [59, 98], [37, 98], [34, 97]], DRESS.mid);
  celShade(dress, { shadow: DRESS.shade, light: DRESS.light, shadowW: 3 });
  dress.recolor((x, y) => y > 84 && (x === 41 || x === 50) && (y + x) % 7 !== 0, DRESS.shade);
  dress.recolor((x, y) => y >= 93, (x, y) => (y === 93 ? GOLD.light : (x + y) % 4 === 0 || (x - y + 64) % 4 === 0 ? DRESS.shade : GOLD.mid));
  dress.recolor((x, y) => y >= 61 + b && y <= 66 + b && x >= 52 + L && x <= 54 + L, (x, y) => ((x + y) % 2 ? GOLD.light : DRESS.light));
  dress.recolor((x, y) => y >= 76 + b && y <= 79 + b && x > 40 && x < 58, (x, y) => (y === 76 + b ? '#463a50' : '#272030'));
  dress.rect(51 + L, 75 + b, 5, 6, (x, y) => (x === 51 + L || x === 55 + L || y === 75 + b || y === 80 + b ? '#dcdce6' : '#272030'));
  sp.add(dress, DRESS.line);

  const neck = sp.layer();
  neck.rect(46 + L, 52 + b, 6, 9, SKIN.shade);
  neck.rect(46 + L, 57 + b, 6, 2, '#2a2230'); // choker
  neck.set(51 + L, 58 + b, GOLD.mid);
  sp.add(neck, SKIN.line);

  // ---- head
  const head = profileHead(sp, SKIN, HAIR, { ox: L, oy: b, eye, mouth: P.mouth || 'smile', iris: '#e0414b', irisDark: '#8a1c2c', irisLight: '#ff9d8c' });
  sp.add(head, HAIR.line);

  // ---- casting arm in front
  const hand = arm(sp, at(P.near), P.nearHand);

  // ---- hat
  const hat = sp.layer();
  const hx = L - 2, hy = b;
  hat.poly([[32 + hx, 26 + hy], [61 + hx, 22 + hy], [55 + hx, 12 + hy], [48 + hx, 6 + hy], [41 + hx, 5 + hy], [38 + hx, 12 + hy]], HAT.mid);
  hat.tube([43 + hx, 8 + hy], [36 + hx, 2 + hy], [28 + hx + sway, 3 + hy], [24 + hx + sway, 10 + hy], (t) => 3.2 - t * 1.8, HAT.mid, 30);
  celShade(hat, { shadow: HAT.shade, light: HAT.light, shadowW: 3 });
  hat.recolor((x, y) => y >= 17 + hy && y <= 22 + hy - (x - 32 - hx) * 0.12, (x, y) => ((x + y) % 5 === 0 || (x - y + 100) % 5 === 0) && y > 17 + hy && y < 21 + hy ? DRESS.mid : y === 17 + hy ? GOLD.light : GOLD.mid);
  hat.ellipseR(47 + hx, 27 + hy, 26, 6, -0.14, (nx, ny) => (ny < -0.2 ? HAT.light : ny > 0.4 ? HAT.shade : HAT.mid));
  hat.ellipse(54 + hx, 19 + hy, 2.4, 2.4, GOLD.shade);
  hat.set(54 + hx, 18 + hy, '#ff7a2f');
  hat.set(54 + hx, 19 + hy, '#ffd166');
  hat.ellipse(23.5 + hx + sway, 12 + hy, 2, 2.6, GOLD.mid);
  sp.add(hat, HAT.line);

  const out = sp.finish();
  if (P.glow) {
    out.ellipse(hand[0] + 2, hand[1], 4, 4, '#ff9a3c');
    out.ellipse(hand[0] + 2, hand[1], 2.6, 2.6, '#ffd36b');
    out.ellipse(hand[0] + 2, hand[1], 1.2, 1.2, '#fff6dc');
  }
  out.meta = { hand };
  return out;
}

export const MAGE_FRAMES = {
  idle0: ['idle', { b: 0, sway: 0 }],
  idle1: ['idle', { b: 1, sway: 1 }],
  blink: ['idle', { b: 0, sway: 0, eye: 'blink' }],
  cast0: ['cast0', { sway: -1 }],
  cast1: ['cast1', { sway: -2 }],
  attack: ['attack', { sway: -1 }],
  hit: ['hit', { sway: 2 }],
};
