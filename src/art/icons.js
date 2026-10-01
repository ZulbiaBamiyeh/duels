// 9x9 pixel icons for spells and statuses, authored as ASCII. Aliases reuse a shape with a palette swap.

import { fromAscii } from './raster.js';

const PAL = {
  o: '#1b1526', // outline
  r: '#c4422b', f: '#ff7a2f', y: '#ffd166', w: '#fff6d6', // fire
  s: '#6f8fb8', t: '#b9d6f2', // steel
  g: '#e0a93f', G: '#fff0b3', // gold
  h: '#ff5a6e', H: '#ffb0b9', // heat
  k: '#6e6880', K: '#a9a2bb', // ash
  b: '#8a6a4a', // wood
  e: '#5fd08a', E: '#b8ffd0', n: '#2a6a4a', // heal green
  p: '#9bd45a', P: '#4a7a2a', q: '#d8ff9a', // poison
  c: '#f4ead6', // bone
  u: '#3fa8d8', // gem blue
  T: '#ff6b5a', // taunt
  m: '#ff9fd0', M: '#ffd6ec', // empower
};

const ICONS = {
  flame: ['....o....', '...ofo...', '..ofyfo..', '.ofyyfo..', '.ofywyfo.', 'ofywwyfo.', 'ofyywwyfo', '.orffffo.', '..ooooo..'],
  fireball: ['.....ooo.', '...ooyyyo', '..ofyywwo', '.ofyywwwo', 'offyywwyo', 'orffyyyo.', '.orffoo..', '..ooo....', '.........'],
  heat: ['....o....', '...oHo...', '..ohHho..', '.ohhohho.', 'ohho.ohho', 'oo.oHo.oo', '..ohHho..', '.ohhohho.', '.oo...oo.'],
  spray: ['.......o.', '..o...oyo', '.oyo...o.', '..o..o...', '....oyo..', '.o...o...', 'oyo....o.', '.o....oyo', '.......o.'],
  stoke: ['...o.....', '..ofo....', '.ofyfo...', '.ofwyfo..', 'ofywyfooo', 'orffffoyo', '.oooooyyy', '......oyo', '.......o.'],
  melt: ['ooooooooo', 'otttottso', 'ottto.sso', 'otto..sso', '.oto.oso.', '.ottoyso.', '..ooyfo..', '...ofo...', '....o....'],
  shield: ['ooooooooo', 'otttttsso', 'otttttsso', 'otttttsso', '.ottttso.', '.otttsso.', '..otsso..', '...oso...', '....o....'],
  fshield: ['ooooooooo', 'otttottso', 'ottofosso', 'otofyfoso', '.ofywyfo.', '.ofwwyfo.', '..offfo..', '...ooo...', '....o....'],
  burst: ['....o....', '.o..y..o.', '..oyfyo..', '..yfwfy..', 'oyfwwwfyo', '..yfwfy..', '..oyfyo..', '.o..y..o.', '....o....'],
  smother: ['..ooooo..', '.oKKKKKo.', 'oKKkkKKko', 'okkkkkkko', '.ooooooo.', '..o.f.o..', '...ofo...', '..ofyfo..', '...ooo...'],
  pass: ['..ooo....', '.ofyfo...', '.ofwfo...', '..ofo.oo.', '.....oyyo', '.ooo.oo.o', 'oyyyyyo..', '.ooo.oo..', '.........'],
  pact: ['...ooo...', '..ofyfo..', '.ofywyfo.', 'oggggggo.', 'ogGGGGgo.', 'ogGoooGgo', 'ogGGGGGgo', '.ogggggo.', '..ooooo..'],
  wave: ['.........', '.ooo.....', 'ofyfoo...', 'oyyyyfo..', 'owwyyyfo.', '.ooowyyfo', '....owyfo', '....oooo.', '.........'],
  inferno: ['o...o...o', 'fo.ofo.of', 'yfoyfyofy', 'ywfywyfwy', 'ywwywwywy', 'wwwwwwwww', 'ywwwwwwwy', 'oyyyyyyyo', '.ooooooo.'],
  wildfire: ['.........', '....o....', '.o.ofo.o.', 'ofoofooyo', 'ofyofyoyo', 'oyyoyyoyo', 'oyyoywoyo', '.oooooooo', '.........'],
  feather: ['......ooo', '....ooGGo', '...oGGgo.', '..oGGgGo.', '.oGGgGo..', '.oGgGo...', 'ogGGo....', 'ogoo.....', 'oo.......'],
  attack: ['.........', '.....o...', '....oyo..', '...oyw.o.', '..oyw.oyo', '.ofy...o.', 'ofo......', 'oo.......', '.........'],
  heart: ['.oo...oo.', 'offo.offo', 'ofyffyffo', 'ofyyyyffo', '.offyffo.', '..offfo..', '...ofo...', '....o....', '.........'],
  cross: ['..ooooo..', '..oEEeo..', 'oooEeeooo', 'oEEEeeeeo', 'oEeeeeeno', 'oooeeenoo', '..oeeno..', '..ooooo..', '.........'],
  drop: ['....o....', '...opo...', '..oppPo..', '..opppo..', '.oqppppo.', '.oqpppPo.', '.opppPPo.', '..oPPPo..', '...ooo...'],
  sparkle: ['....o....', '...owo...', 'o..owo..o', '.oowwwoo.', 'owwwcwwwo', '.oowwwoo.', '...owo...', '...owo...', '....o....'],
  smite: ['..oyyyo..', '..oywyo..', '..oywyo..', '..oywyo..', '..oywyo..', '.oywwwyo.', 'oyywwwyyo', '.ooyyyoo.', '...ooo...'],
  leaf: ['.....ooo.', '...ooEEo.', '..oEEeeo.', '.oEeeneo.', '.oeeneo..', 'oeneeo...', 'onoo.....', 'no.......', 'o........'],
  rings: ['..ooooo..', '.oGgggGo.', 'oGo...oGo', 'og.ooo.go', 'og.oGo.go', 'og.ooo.go', 'oGo...oGo', '.oGgggGo.', '..ooooo..'],
  ward: ['..ooooo..', '.oG...Go.', 'oG..G..Go', 'o..GGG..o', 'oGGGwGGGo', 'o..GGG..o', 'oG..G..Go', '.oG...Go.', '..ooooo..'],
  dome: ['.........', '...ooo...', '.ooGGGoo.', 'oGG...GGo', 'oG.....Go', 'oG..g..Go', 'oG.ggg.Go', 'ooooooooo', '.........'],
  chain: ['oo.......', 'ogo......', 'oGgo.....', '.ogGoo...', '..oo.Goo.', '...ooGgo.', '....ogGo.', '.....ogGo', '......ooo'],
  sun: ['o...o...o', '.o.oyo.o.', '..oyyyo..', '.oyywyyo.', 'oyywwwyyo', '.oyywyyo.', '..oyyyo..', '.o.oyo.o.', 'o...o...o'],
  judgement: ['.ooooooo.', 'oGGGGGGgo', 'oGGgggggo', '.ooogooo.', '...ogo...', '...ogo...', '...ogo...', '...ogo...', '...ooo...'],
  ankh: ['...ooo...', '..oGgGo..', '..og.go..', '..oGgGo..', 'ooooGoooo', 'oGGGGGGgo', 'ooooGoooo', '...oGo...', '...ooo...'],
  skull: ['..ooooo..', '.occccco.', 'occccccco', 'oco.c.oco', 'occcoccco', '.occccco.', '..oc.co..', '..ooooo..', '....p....'],
  candle: ['....o....', '...oyo...', '...oyo...', '....o....', '..ooooo..', '..occco..', '..occco..', '..occco..', '.ooooooo.'],
  sword: ['.......oo', '......owo', '.....owo.', '....owo..', '.o.owo...', '.ogowo...', '..ogo....', '.ogoGo...', 'oo..o....'],
  shout: ['o..ooo..o', '.o.oTo.o.', 'o..oTo..o', '...oTo...', 'o..oTo..o', '.o.ooo.o.', 'o..oTo..o', '...ooo...', '.........'],
  bash: ['o..oooooo', '..ottttso', 'o.otttsso', '..otttsso', 'o.ottttso', '...otsso.', '....oso..', '.....o...', '.........'],
  spikes: ['o...o...o', 'oo.oto.oo', 'oto.t.oto', '.ottttto.', 'ostttttso', 'osssssss.', '.oooooooo', '.........', '.........'],
  banner: ['oo.......', 'ogooooo..', 'ogommmmo.', 'ogoMmmmmo', 'ogommmmo.', 'ogooooo..', 'og.......', 'og.......', 'oo.......'],
  tower: ['.o.o.o.o.', '.otototo.', '.ottttto.', '..ottso..', '..ottso..', '..otoso..', '..oo.so..', '.otttsso.', '.ooooooo.'],
  staff: ['.....ooo.', '....oGuGo', '....ouuGo', '....oGGo.', '...obo...', '..obo....', '.obo.....', 'obo......', 'oo.......'],
};

// name -> [base shape, palette remap]
const ALIASES = {
  flameHeart: ['heart', {}],
  heartShield: ['heart', { f: 'g', y: 'G', r: 'g' }],
  skullDrop: ['skull', {}],
  steelBurst: ['burst', { f: 's', y: 't', w: 'w' }],
  slam: ['burst', { f: 's', y: 't' }],
  towerShield: ['shield', { t: 'G', s: 'g' }],
  guard: ['fshield', { f: 'u', y: 't', w: 'w' }],
  fist: ['leaf', { e: 's', E: 't', n: 'k' }],
  brokenShield: ['melt', { y: 'h', f: 'r' }],
};

const cache = new Map();

export function iconRaster(name) {
  const [base, remap] = ALIASES[name] || [name, {}];
  const rows = ICONS[base] || ICONS.flame;
  const pal = { ...PAL };
  for (const [from, to] of Object.entries(remap)) pal[from] = PAL[to];
  return fromAscii(rows, pal);
}

export const ICON_NAMES = [...Object.keys(ICONS), ...Object.keys(ALIASES)];

// Returns a data URL for use in <img>. Rendered at 1x; CSS scales it with pixelated sampling.
export function iconURL(name) {
  if (!cache.has(name)) cache.set(name, iconRaster(name).toCanvas(1).toDataURL());
  return cache.get(name);
}

export function iconImg(name, cls = 'px-icon') {
  return `<img class="${cls}" src="${iconURL(name)}" alt="" draggable="false">`;
}
