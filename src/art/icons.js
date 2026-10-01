// 9x9 pixel icons for spells and statuses, authored as ASCII.

import { fromAscii } from './raster.js';

const PAL = {
  o: '#1b1526', // outline
  r: '#c4422b', // ember red
  f: '#ff7a2f', // burn orange
  y: '#ffd166', // flame yellow
  w: '#fff6d6', // white-hot
  s: '#6f8fb8', // steel
  t: '#b9d6f2', // steel light
  g: '#e0a93f', // gold
  G: '#fff0b3', // gold light
  h: '#ff5a6e', // heat
  H: '#ffb0b9', // heat light
  k: '#6e6880', // ash grey
  K: '#a9a2bb', // ash light
  b: '#8a6a4a', // wood
};

const ICONS = {
  flame: [
    '....o....',
    '...ofo...',
    '..ofyfo..',
    '.ofyyfo..',
    '.ofywyfo.',
    'ofywwyfo.',
    'ofyywwyfo',
    '.orffffo.',
    '..ooooo..',
  ],
  fireball: [
    '.....ooo.',
    '...ooyyyo',
    '..ofyywwo',
    '.ofyywwwo',
    'offyywwyo',
    'orffyyyo.',
    '.orffoo..',
    '..ooo....',
    '.........',
  ],
  heat: [
    '....o....',
    '...oHo...',
    '..ohHho..',
    '.ohhohho.',
    'ohho.ohho',
    'oo.oHo.oo',
    '..ohHho..',
    '.ohhohho.',
    '.oo...oo.',
  ],
  spray: [
    '.......o.',
    '..o...oyo',
    '.oyo...o.',
    '..o..o...',
    '....oyo..',
    '.o...o...',
    'oyo....o.',
    '.o....oyo',
    '.......o.',
  ],
  stoke: [
    '...o.....',
    '..ofo....',
    '.ofyfo...',
    '.ofwyfo..',
    'ofywyfooo',
    'orffffoyo',
    '.oooooyyy',
    '......oyo',
    '.......o.',
  ],
  melt: [
    'ooooooooo',
    'otttottso',
    'ottto.sso',
    'otto..sso',
    '.oto.oso.',
    '.ottoyso.',
    '..ooyfo..',
    '...ofo...',
    '....o....',
  ],
  shield: [
    'ooooooooo',
    'otttttsso',
    'otttttsso',
    'otttttsso',
    '.ottttso.',
    '.otttsso.',
    '..otsso..',
    '...oso...',
    '....o....',
  ],
  fshield: [
    'ooooooooo',
    'otttottso',
    'ottofosso',
    'otofyfoso',
    '.ofywyfo.',
    '.ofwwyfo.',
    '..offfo..',
    '...ooo...',
    '....o....',
  ],
  burst: [
    '....o....',
    '.o..y..o.',
    '..oyfyo..',
    '..yfwfy..',
    'oyfwwwfyo',
    '..yfwfy..',
    '..oyfyo..',
    '.o..y..o.',
    '....o....',
  ],
  smother: [
    '..ooooo..',
    '.oKKKKKo.',
    'oKKkkKKko',
    'okkkkkkko',
    '.ooooooo.',
    '..o.f.o..',
    '...ofo...',
    '..ofyfo..',
    '...ooo...',
  ],
  pass: [
    '..ooo....',
    '.ofyfo...',
    '.ofwfo...',
    '..ofo.oo.',
    '.....oyyo',
    '.ooo.oo.o',
    'oyyyyyo..',
    '.ooo.oo..',
    '.........',
  ],
  pact: [
    '...ooo...',
    '..ofyfo..',
    '.ofywyfo.',
    'oggggggo.',
    'ogGGGGgo.',
    'ogGoooGgo',
    'ogGGGGGgo',
    '.ogggggo.',
    '..ooooo..',
  ],
  wave: [
    '.........',
    '.ooo.....',
    'ofyfoo...',
    'oyyyyfo..',
    'owwyyyfo.',
    '.ooowyyfo',
    '....owyfo',
    '....oooo.',
    '.........',
  ],
  inferno: [
    'o...o...o',
    'fo.ofo.of',
    'yfoyfyofy',
    'ywfywyfwy',
    'ywwywwywy',
    'wwwwwwwww',
    'ywwwwwwwy',
    'oyyyyyyyo',
    '.ooooooo.',
  ],
  wildfire: [
    '.........',
    '....o....',
    '.o.ofo.o.',
    'ofoofooyo',
    'ofyofyoyo',
    'oyyoyyoyo',
    'oyyoywoyo',
    '.oooooooo',
    '.........',
  ],
  feather: [
    '......ooo',
    '....ooGGo',
    '...oGGgo.',
    '..oGGgGo.',
    '.oGGgGo..',
    '.oGgGo...',
    'ogGGo....',
    'ogoo.....',
    'oo.......',
  ],
  attack: [
    '.........',
    '.....o...',
    '....oyo..',
    '...oyw.o.',
    '..oyw.oyo',
    '.ofy...o.',
    'ofo......',
    'oo.......',
    '.........',
  ],
};

const cache = new Map();

export function iconRaster(name) {
  return fromAscii(ICONS[name] || ICONS.flame, PAL);
}

// Returns a data URL for use in <img>. Rendered at 1x; CSS scales it with pixelated sampling.
export function iconURL(name) {
  if (!cache.has(name)) cache.set(name, iconRaster(name).toCanvas(1).toDataURL());
  return cache.get(name);
}

export function iconImg(name, cls = 'px-icon') {
  return `<img class="${cls}" src="${iconURL(name)}" alt="" draggable="false">`;
}
