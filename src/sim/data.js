// Static game data: spells, statuses, keywords and targeting options.
// Everything here is plain data + pure resolve functions that talk to the Battle API.

export const TPS = 20; // simulation ticks per second (fixed timestep)
export const sec = (s) => Math.round(s * TPS);

export const RARITY = {
  common: { label: 'Common', order: 0 },
  rare: { label: 'Rare', order: 1 },
  epic: { label: 'Epic', order: 2 },
  legendary: { label: 'Legendary', order: 3 },
};

// Spell target kinds:
//   enemy       one enemy, chosen by the line's target keyword
//   ally        one ally (self counts as an ally)
//   allEnemies  every living enemy
//   self        the caster
export const SPELLS = {
  firebolt: {
    name: 'Firebolt', rarity: 'common', cd: 3, cast: 0.5, target: 'enemy', icon: 'fireball', fx: 'bolt',
    text: 'Deal 6 damage, inflict 2 Burn.',
    resolve(b, c, [t]) {
      b.damage(c, t, 6, { source: 'firebolt' });
      b.addStatus(t, 'burn', 2, 'firebolt');
    },
  },
  kindle: {
    name: 'Kindle', rarity: 'common', cd: 4, cast: 0.4, target: 'enemy', icon: 'flame', fx: 'lob',
    text: 'Inflict 4 Burn; 6 if the target has none.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'burn', t.s.burn > 0 ? 4 : 6, 'kindle');
    },
  },
  warmUp: {
    name: 'Warm Up', rarity: 'common', cd: 6, cast: 0.4, target: 'ally', icon: 'heat', fx: 'buff',
    text: 'Ally gains 3 Heat.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'heat', 3, 'warmUp');
    },
  },
  cinderSpray: {
    name: 'Cinder Spray', rarity: 'common', cd: 5, cast: 0.5, target: 'allEnemies', icon: 'spray', fx: 'spray',
    text: 'Inflict 2 Burn on all enemies.',
    resolve(b, c, targets) {
      for (const t of targets) b.addStatus(t, 'burn', 2, 'cinderSpray');
    },
  },
  stoke: {
    name: 'Stoke', rarity: 'rare', cd: 5, cast: 0.3, target: 'enemy', icon: 'stoke', fx: 'spark',
    text: 'Add Burn equal to a quarter of the target’s current Burn.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'burn', Math.floor(t.s.burn / 4), 'stoke');
    },
  },
  melt: {
    name: 'Melt', rarity: 'rare', cd: 7, cast: 0.5, target: 'enemy', icon: 'melt', fx: 'beam',
    text: 'Deal 15 damage to Block only. If Block breaks, inflict 4 Burn.',
    hint: 'Skipped if the target has no Block.',
    canCast: (b, c, [t]) => t.s.block > 0,
    resolve(b, c, [t]) {
      const hit = Math.min(15, t.s.block);
      b.damageBlock(c, t, hit, 'melt');
      if (t.s.block === 0) b.addStatus(t, 'burn', 4, 'melt');
    },
  },
  fireShield: {
    name: 'Fire Shield', rarity: 'rare', cd: 8, cast: 0.4, target: 'ally', icon: 'fshield', fx: 'shield',
    text: 'Ally gains 10 Block. Attackers gain 2 Burn while it holds.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'block', 10, 'fireShield');
      if (!t.s.fireShield) b.addStatus(t, 'fireShield', 1, 'fireShield');
    },
  },
  flashpoint: {
    name: 'Flashpoint', rarity: 'rare', cd: 6, cast: 0.7, target: 'enemy', icon: 'burst', fx: 'flashpoint',
    text: 'Deal 3× the target’s Burn as damage, ignoring Block, then remove all its Burn.',
    hint: 'Skipped if the target has no Burn.',
    canCast: (b, c, [t]) => t.s.burn > 0,
    resolve(b, c, [t]) {
      const burn = t.s.burn;
      b.addStatus(t, 'burn', -burn, 'flashpoint');
      b.damage(c, t, burn * 3, { source: 'flashpoint', ignoreBlock: true, big: true });
    },
  },
  smother: {
    name: 'Smother', rarity: 'rare', cd: 6, cast: 0.3, target: 'ally', icon: 'smother', fx: 'buff',
    text: 'Remove up to 5 Burn from an ally, give them 5 Block.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'burn', -Math.min(5, t.s.burn), 'smother');
      b.addStatus(t, 'block', 5, 'smother');
    },
  },
  passTheFlame: {
    name: 'Pass the Flame', rarity: 'epic', cd: 6, cast: 0.5, target: 'enemy', icon: 'pass', fx: 'pass',
    text: 'Move all Burn from the enemy with the most Burn onto the target.',
    hint: 'Needs a second enemy that is burning.',
    canCast: (b, c, [t]) => !!b.passSource(c, t),
    resolve(b, c, [t]) {
      const from = b.passSource(c, t);
      if (!from) return;
      const n = from.s.burn;
      b.addStatus(from, 'burn', -n, 'passTheFlame');
      b.addStatus(t, 'burn', n, 'passTheFlame');
    },
  },
  pyrePact: {
    name: 'Pyre Pact', rarity: 'epic', cd: 10, cast: 0.6, target: 'self', icon: 'pact', fx: 'pact',
    text: 'Caster gains 5 Burn; all allies gain Heat equal to the caster’s Burn.',
    resolve(b, c) {
      b.addStatus(c, 'burn', 5, 'pyrePact');
      const n = c.s.burn;
      for (const a of b.alliesOf(c)) b.addStatus(a, 'heat', n, 'pyrePact');
    },
  },
  backdraft: {
    name: 'Backdraft', rarity: 'epic', cd: 8, cast: 0.6, target: 'enemy', icon: 'wave', fx: 'wave',
    text: 'Only if the target has Block: deal 2× its Block as damage and remove it.',
    canCast: (b, c, [t]) => t.s.block > 0,
    resolve(b, c, [t]) {
      const blk = t.s.block;
      b.damageBlock(c, t, blk, 'backdraft');
      b.damage(c, t, blk * 2, { source: 'backdraft', big: true });
    },
  },
  inferno: {
    name: 'Inferno', rarity: 'legendary', cd: 0, once: true, cast: 0.8, target: 'self', icon: 'inferno', fx: 'inferno',
    text: 'Once per fight. For 6s, Burn on enemies ignores Block.',
    resolve(b, c) {
      b.startInferno(c, sec(6));
    },
  },
  wildfire: {
    name: 'Wildfire', rarity: 'legendary', cd: 12, cast: 0.6, target: 'enemy', icon: 'wildfire', fx: 'lob',
    text: 'Inflict 3 Burn. Each Burn tick on that enemy gives its neighbours 1 Burn.',
    resolve(b, c, [t]) {
      b.addStatus(t, 'burn', 3, 'wildfire');
      if (!t.s.wildfire) b.addStatus(t, 'wildfire', 1, 'wildfire');
    },
  },
  phoenixAsh: {
    name: 'Phoenix Ash', rarity: 'legendary', cd: 0, once: true, cast: 0.6, target: 'ally', icon: 'feather', fx: 'phoenix',
    text: 'Once per fight. The next time the ally would die, they survive at 1 HP and enemies gain Burn = their max HP ÷ 5.',
    resolve(b, c, [t]) {
      if (!t.s.phoenix) b.addStatus(t, 'phoenix', 1, 'phoenixAsh');
    },
  },

  // Enemy-only
  brace: {
    name: 'Brace', rarity: 'common', cd: 5, cast: 0.3, target: 'self', icon: 'shield', fx: 'shield', hidden: true,
    text: 'Gain 12 Block.',
    resolve(b, c) {
      b.addStatus(c, 'block', 12, 'brace');
    },
  },
};

export const PLAYER_SPELLS = Object.keys(SPELLS).filter((k) => !SPELLS[k].hidden);

// Damage sources shown in the report that are not spells.
export const SOURCE_NAMES = {
  attack: 'Ember Flick',
  burn: 'Burn ticks',
  fireShield: 'Fire Shield',
  phoenix: 'Phoenix Ash',
};
export const sourceName = (k) => SPELLS[k]?.name ?? SOURCE_NAMES[k] ?? k;

export const STATUSES = {
  burn: { name: 'Burn', icon: 'flame', tone: 'burn', text: 'Deals its stacks as damage every second. Never fades. Hits Block first.' },
  block: { name: 'Block', icon: 'shield', tone: 'block', text: 'Absorbs damage before HP.' },
  heat: { name: 'Heat', icon: 'heat', tone: 'heat', text: 'Action bar fills 10% faster per stack.' },
  fireShield: { name: 'Fire Shield', icon: 'fshield', tone: 'burn', flag: true, text: 'Attackers gain 2 Burn while Block holds.' },
  wildfire: { name: 'Wildfire', icon: 'wildfire', tone: 'burn', flag: true, text: 'Burn ticks spread 1 Burn to neighbours.' },
  phoenix: { name: 'Phoenix', icon: 'feather', tone: 'gold', flag: true, text: 'Survives one lethal hit at 1 HP.' },
};

// Condition keywords: [who] [stat] [comparator] [value]
export const COND_WHO = [
  ['enemy', 'enemy'],
  ['ally', 'ally'],
  ['self', 'self'],
];
export const COND_STAT = [
  ['hp', 'HP %'],
  ['burn', 'Burn'],
  ['block', 'Block'],
  ['heat', 'Heat'],
];
export const COND_CMP = [
  ['lt', '<'],
  ['gte', '≥'],
];
export const COND_VALUES = {
  hp: [10, 20, 30, 40, 50, 60, 70, 80, 90],
  burn: [1, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50],
  block: [1, 5, 8, 10, 15, 20, 30],
  heat: [1, 3, 5, 8, 10, 15],
};

export const TARGETS = {
  enemy: [
    ['lowestHp', 'lowest HP enemy'],
    ['highestHp', 'highest HP enemy'],
    ['mostBurn', 'enemy with most Burn'],
    ['leastBurn', 'enemy with least Burn'],
    ['mostBlock', 'enemy with most Block'],
    ['front', 'frontmost enemy'],
    ['back', 'backmost enemy'],
  ],
  ally: [
    ['self', 'self'],
    ['lowestHpAlly', 'lowest HP ally'],
    ['mostBurnAlly', 'ally with most Burn'],
  ],
  allEnemies: [['allEnemies', 'all enemies']],
  self: [['self', 'self']],
};

export function targetLabel(spellId, sel) {
  const kind = SPELLS[spellId]?.target;
  const opt = (TARGETS[kind] || []).find(([k]) => k === sel);
  return opt ? opt[1] : TARGETS[kind]?.[0]?.[1] ?? '';
}

export function defaultTarget(spellId) {
  return TARGETS[SPELLS[spellId].target][0][0];
}

export function condLabel(cond) {
  if (!cond) return 'Otherwise';
  const stat = COND_STAT.find(([k]) => k === cond.stat)[1];
  const cmp = COND_CMP.find(([k]) => k === cond.cmp)[1];
  return `${cond.who} ${stat.replace(' %', '')} ${cmp} ${cond.val}${cond.stat === 'hp' ? '%' : ''}`;
}
