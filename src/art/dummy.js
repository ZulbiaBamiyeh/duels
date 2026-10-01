// Training dummy: burlap sack on an oak post, painted target on the chest.
// Three variants share the shape and differ in material tones (recolours).

import { Raster, shade3 } from './raster.js';

export const DUMMY_W = 40;
export const DUMMY_H = 56;

const OUT = '#1b1526';
const WOOD = { light: '#9c7a58', mid: '#7a5b40', dark: '#563e2c' };
const ROPE = { light: '#b08a5c', mid: '#7d5d3c' };
const STRAW = { light: '#ead27f', mid: '#c9a957' };
const PAINT = '#a8564a';

export const DUMMY_VARIANTS = [
  { light: '#dcc391', mid: '#c4a46e', dark: '#9b7c51' }, // straw
  { light: '#cdbf9f', mid: '#ac9d7c', dark: '#827457' }, // oak
  { light: '#b9b4b6', mid: '#938e95', dark: '#6b6673' }, // iron
];

export function drawDummy(variant = 0, { hit = false } = {}) {
  const SACK = DUMMY_VARIANTS[variant];
  const out = new Raster(DUMMY_W, DUMMY_H);

  // stand
  const stand = out.layer();
  stand.poly([[11, 51], [29, 51], [31.5, 55], [8.5, 55]], (nx, ny) => (ny < -0.3 ? WOOD.light : WOOD.mid));
  stand.recolor((x, y) => y === 54 && x % 4 === 1, WOOD.dark);
  stand.outline(OUT);

  // post
  const post = out.layer();
  post.rect(18, 30, 5, 22, (x) => (x === 18 ? WOOD.dark : x === 21 ? WOOD.light : WOOD.mid));
  post.recolor((x, y) => x === 20 && y % 5 === 0, WOOD.dark);
  post.outline(OUT);

  // arm beam and straw tufts
  const beam = out.layer();
  beam.capsule(6.5, 23.5, 33.5, 23.5, 1.6, (x, y) => (y < 23 ? WOOD.light : WOOD.mid));
  for (const [x, y] of [[3, 21], [4, 25], [2, 23], [36, 21], [35, 25], [37, 23]]) {
    beam.capsule(x + 0.5, y + 0.5, x < 20 ? 6.5 : 33.5, 23.5, 0.7, STRAW.mid);
    beam.set(x, y, STRAW.light);
  }
  beam.outline(OUT);

  // body sack
  const sack = out.layer();
  sack.ellipse(20, 32, 8.6, 10.6, shade3([SACK.light, SACK.mid, SACK.dark], 0.3, -0.35));
  sack.recolor((x, y) => y === 25 || y === 39, (x) => (x % 2 ? ROPE.light : ROPE.mid));
  // painted target
  sack.ellipse(19, 32, 4.6, 4.6, PAINT);
  sack.ellipse(19, 32, 3.1, 3.1, SACK.light);
  sack.ellipse(19, 32, 1.6, 1.6, PAINT);
  // stitches down the seam
  sack.recolor((x, y) => x === 25 && y > 27 && y < 38 && y % 2 === 0, SACK.dark);
  sack.outline(OUT);

  // head
  const head = out.layer();
  for (const [x, y] of [[17, 5], [19, 4], [21, 5], [23, 6], [15, 7]]) head.capsule(x + 0.5, y + 0.5, 20, 9, 0.7, STRAW.mid);
  head.set(19, 4, STRAW.light);
  head.set(21, 5, STRAW.light);
  head.ellipse(20, 13, 6.6, 6.8, shade3([SACK.light, SACK.mid, SACK.dark], 0.3, -0.35));
  head.capsule(15.5, 19.5, 24.5, 19.5, 1.2, (x) => (Math.floor(x) % 2 ? ROPE.light : ROPE.mid));
  const eye = (cx, cy) => {
    if (hit) {
      head.set(cx - 1, cy - 1, OUT); head.set(cx, cy, OUT); head.set(cx - 1, cy + 1, OUT);
    } else {
      for (const d of [-1, 0, 1]) { head.set(cx + d, cy + d, OUT); head.set(cx + d, cy - d, OUT); }
    }
  };
  eye(17, 12);
  eye(23, 12);
  for (let x = 17; x <= 23; x++) head.set(x, 16, x % 2 ? OUT : SACK.dark);
  head.outline(OUT);

  out.over(stand).over(post).over(beam).over(sack).over(head);
  return out;
}
