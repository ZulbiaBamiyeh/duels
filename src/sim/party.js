// Unit definitions, default spellbooks and presets. A party is a small JSON blob, so it can be
// saved, replayed, or (later) sent as an async-PvP ghost.

import { CHARACTERS, sec } from './data.js';

export const MAX_LINES = 6;
export const SLOT_NAMES = ['Front', 'Middle', 'Back'];

const line = (cond, spell, target) => ({ cond, spell, target });
const when = (who, stat, cmp, val) => ({ who, stat, cmp, val });

export const PRESETS = {
  tank: [
    {
      id: 'wall', name: 'Hold the line', note: 'Keep Block up, taunt on cooldown, guard whoever is hurt.',
      lines: [
        line(when('self', 'block', 'lt', 5), 'shieldUp', 'self'),
        line(when('ally', 'hp', 'lt', 50), 'guard', 'lowestHpAlly'),
        line(null, 'taunt', 'self'),
        line(null, 'shieldBash', 'front'),
        line(null, 'strike', 'front'),
      ],
    },
    {
      id: 'thorns', name: 'Thorns', note: 'Spikes plus Taunt: every hit on her hurts the attacker.',
      lines: [
        line(null, 'spikedPlating', 'self'),
        line(null, 'taunt', 'self'),
        line(when('self', 'block', 'lt', 10), 'shieldUp', 'self'),
        line(null, 'strike', 'front'),
      ],
    },
    {
      id: 'slam', name: 'Block to damage', note: 'Bank Block, then cash it in with Shield Slam. Reprisal punishes breaks.',
      lines: [
        line(null, 'reprisal', 'passive'),
        line(when('self', 'block', 'gte', 20), 'shieldSlam', 'lowestHp'),
        line(null, 'shieldUp', 'self'),
        line(null, 'kindledSteel', 'self'),
        line(null, 'shieldBash', 'front'),
      ],
    },
  ],
  mage: [
    {
      id: 'cashout', name: 'Burn and cash out', note: 'The design doc example: break shields, stack Burn, detonate at 25.',
      lines: [
        line(when('enemy', 'block', 'gte', 10), 'melt', 'mostBlock'),
        line(when('enemy', 'burn', 'gte', 25), 'flashpoint', 'mostBurn'),
        line(null, 'kindle', 'lowestHp'),
        line(null, 'emberFlick', 'front'),
      ],
    },
    {
      id: 'breaker', name: 'Shield breaker', note: 'Punish Block with Backdraft, fill the gaps with Firebolt.',
      lines: [
        line(when('enemy', 'block', 'gte', 8), 'backdraft', 'mostBlock'),
        line(when('enemy', 'burn', 'lt', 1), 'kindle', 'leastBurn'),
        line(null, 'firebolt', 'front'),
        line(null, 'emberFlick', 'front'),
      ],
    },
    {
      id: 'wildfire', name: 'Wildfire spread', note: 'Best against 3 dummies. Seed Wildfire, let it spread, detonate.',
      lines: [
        line(when('enemy', 'burn', 'gte', 30), 'flashpoint', 'mostBurn'),
        line(null, 'wildfire', 'highestHp'),
        line(null, 'cinderSpray', 'allEnemies'),
        line(null, 'kindle', 'leastBurn'),
        line(null, 'emberFlick', 'front'),
      ],
    },
    {
      id: 'saint', name: 'Ember Saint', note: 'Every heal she receives becomes Burn on an enemy. Pair with a busy Cleric.',
      lines: [
        line(null, 'emberSaint', 'passive'),
        line(when('enemy', 'burn', 'gte', 30), 'flashpoint', 'mostBurn'),
        line(null, 'pyrePact', 'self'),
        line(null, 'firebolt', 'lowestHp'),
        line(null, 'emberFlick', 'front'),
      ],
    },
  ],
  cleric: [
    {
      id: 'healer', name: 'Field medic', note: 'Cleanse Poison, top up the lowest ally, shield the front.',
      lines: [
        line(when('ally', 'poison', 'gte', 6), 'absolve', 'mostPoisonAlly'),
        line(when('ally', 'hp', 'lt', 60), 'mend', 'lowestHpAlly'),
        line(when('ally', 'hp', 'lt', 85), 'renew', 'lowestHpAlly'),
        line(null, 'blessing', 'frontAlly'),
        line(null, 'smite', 'lowestHp'),
        line(null, 'staffTap', 'front'),
      ],
    },
    {
      id: 'judge', name: 'Judgement', note: 'Heal hard, then turn the last 5s of healing into one big hit.',
      lines: [
        line(null, 'consecrate', 'self'),
        line(when('ally', 'hp', 'lt', 70), 'prayerOfMending', 'allAllies'),
        line(when('ally', 'hp', 'lt', 80), 'mend', 'lowestHpAlly'),
        line(null, 'judgement', 'highestHp'),
        line(null, 'staffTap', 'front'),
      ],
    },
    {
      id: 'plague', name: 'Plague Saint', note: 'Heals become Poison on the enemy. The team has to survive on Block.',
      lines: [
        line(null, 'plagueSaint', 'passive'),
        line(null, 'mend', 'lowestHpAlly'),
        line(null, 'prayerOfMending', 'allAllies'),
        line(null, 'blessing', 'frontAlly'),
        line(null, 'staffTap', 'front'),
      ],
    },
  ],
};

export function presetLines(kind, id) {
  const list = PRESETS[kind];
  const p = list.find((x) => x.id === id) || list[0];
  return JSON.parse(JSON.stringify(p.lines));
}

export function defaultParty() {
  return {
    formation: ['tank', 'mage', 'cleric'],
    books: { tank: presetLines('tank'), mage: presetLines('mage'), cleric: presetLines('cleric') },
  };
}

export function partyDefs(party) {
  return party.formation.map((kind) => {
    const c = CHARACTERS[kind];
    return { name: c.name, kind, maxHp: c.maxHp, fillTicks: sec(c.fill), spellbook: party.books[kind] };
  });
}

export const DUMMY_NAMES = ['Straw Dummy', 'Oak Dummy', 'Iron Dummy'];

export function defaultDummies() {
  return {
    count: 2,
    hp: 600,
    list: [
      { brace: false, strike: true, spit: false },
      { brace: true, strike: false, spit: true },
      { brace: true, strike: true, spit: false },
    ],
  };
}

export function dummyDefs(cfg) {
  return cfg.list.slice(0, cfg.count).map((o, i) => {
    const spellbook = [];
    if (o.brace) spellbook.push(line(null, 'brace', 'self'));
    if (o.spit) spellbook.push(line(null, 'spit', 'back'));
    if (o.strike) spellbook.push(line(null, 'thwack', 'front'));
    return { name: DUMMY_NAMES[i], kind: 'dummy', variant: i, maxHp: cfg.hp, fillTicks: sec(2.5), spellbook, respawn: true };
  });
}
