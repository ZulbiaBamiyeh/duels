// Unit definitions and spellbook presets. A party is a small JSON blob, so it can be
// saved, replayed, or (later) sent as an async-PvP ghost.

import { sec } from './data.js';

export const MAX_LINES = 6;

const line = (cond, spell, target) => ({ cond, spell, target });
const when = (who, stat, cmp, val) => ({ who, stat, cmp, val });

export const PRESETS = [
  {
    id: 'cashout',
    name: 'Burn and cash out',
    note: 'The design doc example: break shields, stack Burn, detonate at 25.',
    lines: [
      line(when('enemy', 'block', 'gte', 10), 'melt', 'mostBlock'),
      line(when('enemy', 'burn', 'gte', 25), 'flashpoint', 'mostBurn'),
      line(null, 'kindle', 'lowestHp'),
    ],
  },
  {
    id: 'breaker',
    name: 'Shield breaker',
    note: 'Punish Block with Backdraft, fill the gaps with Firebolt.',
    lines: [
      line(when('enemy', 'block', 'gte', 8), 'backdraft', 'mostBlock'),
      line(when('enemy', 'burn', 'lt', 1), 'kindle', 'leastBurn'),
      line(null, 'firebolt', 'front'),
    ],
  },
  {
    id: 'heat',
    name: 'Heat engine',
    note: 'Burn yourself with Pyre Pact for a huge Heat spike, then Smother it.',
    lines: [
      line(when('self', 'burn', 'gte', 3), 'smother', 'self'),
      line(when('self', 'hp', 'gte', 60), 'pyrePact', 'self'),
      line(when('self', 'heat', 'lt', 3), 'warmUp', 'self'),
      line(null, 'firebolt', 'lowestHp'),
    ],
  },
  {
    id: 'wildfire',
    name: 'Wildfire spread',
    note: 'Best against 3 dummies. Seed Wildfire in the middle, let it spread.',
    lines: [
      line(when('enemy', 'burn', 'gte', 30), 'flashpoint', 'mostBurn'),
      line(null, 'wildfire', 'highestHp'),
      line(null, 'cinderSpray', 'allEnemies'),
      line(null, 'kindle', 'leastBurn'),
    ],
  },
  {
    id: 'inferno',
    name: 'Inferno burst',
    note: 'Turn on Strikes back. Shield up, then let Burn ignore their Block.',
    lines: [
      line(when('self', 'hp', 'lt', 30), 'phoenixAsh', 'self'),
      line(when('enemy', 'burn', 'gte', 12), 'inferno', 'self'),
      line(when('self', 'block', 'lt', 1), 'fireShield', 'self'),
      line(null, 'kindle', 'mostBlock'),
    ],
  },
];

export function clonePreset(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return JSON.parse(JSON.stringify(p.lines));
}

export function mageDef(spellbook) {
  return {
    name: 'Fire Mage',
    kind: 'mage',
    maxHp: 150,
    fillTicks: sec(1.4),
    weapon: { name: 'Ember Flick', min: 3, max: 3 },
    spellbook,
  };
}

export const DUMMY_NAMES = ['Straw Dummy', 'Oak Dummy', 'Iron Dummy'];
export const SLOT_NAMES = ['Front', 'Middle', 'Back'];

export function defaultDummies() {
  return {
    count: 1,
    hp: 500,
    list: [
      { shield: true, strike: false },
      { shield: false, strike: false },
      { shield: true, strike: true },
    ],
  };
}

export function dummyDefs(cfg) {
  return cfg.list.slice(0, cfg.count).map((o, i) => ({
    name: DUMMY_NAMES[i],
    kind: 'dummy',
    variant: i,
    maxHp: cfg.hp,
    fillTicks: sec(2.5),
    passive: !o.shield && !o.strike,
    weapon: o.strike ? { name: 'Thwack', min: 4, max: 6 } : null,
    spellbook: o.shield ? [{ cond: null, spell: 'brace', target: 'self' }] : [],
    respawn: true,
  }));
}
