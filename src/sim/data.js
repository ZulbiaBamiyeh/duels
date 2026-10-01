// Static game data: characters, spells, statuses, keywords and targeting options.
// Spells are plain data plus pure resolve functions that talk to the Battle API.

export const TPS = 20; // simulation ticks per second (fixed timestep)
export const sec = (s) => Math.round(s * TPS);

export const RARITY = {
  common: { label: 'Common', order: 0 },
  rare: { label: 'Rare', order: 1 },
  epic: { label: 'Epic', order: 2 },
  legendary: { label: 'Legendary', order: 3 },
};

export const CHARACTERS = {
  tank: {
    name: 'Shieldmaiden', role: 'Tank', maxHp: 240, fill: 1.6,
    hook: 'Hold the front. Stack Block, punish attackers with Spikes, and turn Block into damage.',
  },
  mage: {
    name: 'Fire Mage', role: 'Damage', maxHp: 130, fill: 1.4,
    hook: 'Stack Burn, break shields, cash out.',
  },
  cleric: {
    name: 'Cleric', role: 'Healer', maxHp: 150, fill: 1.5,
    hook: 'Heal, cleanse permanent damage, protect.',
  },
};

// Spell target kinds:
//   enemy | ally | deadAlly | allEnemies | allAllies | self | passive
const S = (o) => o;

export const SPELLS = {
  // ------------------------------------------------------------ Fire Mage
  emberFlick: S({
    owner: 'mage', name: 'Ember Flick', rarity: 'common', cd: 0, cast: 0.3, target: 'enemy', icon: 'attack', fx: 'ember', basic: true,
    text: 'Basic attack. Deal 4 damage.',
    resolve(b, c, [t]) { b.damage(c, t, 4, { kind: 'attack', source: 'emberFlick' }); },
  }),
  firebolt: S({
    owner: 'mage', name: 'Firebolt', rarity: 'common', cd: 3, cast: 0.5, target: 'enemy', icon: 'fireball', fx: 'bolt',
    text: 'Deal 6 damage, inflict 2 Burn.',
    resolve(b, c, [t]) { b.damage(c, t, 6, { source: 'firebolt' }); b.addStatus(t, 'burn', 2, 'firebolt', c); },
  }),
  kindle: S({
    owner: 'mage', name: 'Kindle', rarity: 'common', cd: 4, cast: 0.4, target: 'enemy', icon: 'flame', fx: 'lob',
    text: 'Inflict 4 Burn; 6 if the target has none.',
    resolve(b, c, [t]) { b.addStatus(t, 'burn', t.s.burn > 0 ? 4 : 6, 'kindle', c); },
  }),
  warmUp: S({
    owner: 'mage', name: 'Warm Up', rarity: 'common', cd: 6, cast: 0.4, target: 'ally', icon: 'heat', fx: 'heat',
    text: 'Ally gains 3 Heat.',
    resolve(b, c, [t]) { b.addStatus(t, 'heat', 3, 'warmUp', c); },
  }),
  cinderSpray: S({
    owner: 'mage', name: 'Cinder Spray', rarity: 'common', cd: 5, cast: 0.5, target: 'allEnemies', icon: 'spray', fx: 'spray',
    text: 'Inflict 2 Burn on all enemies.',
    resolve(b, c, ts) { for (const t of ts) b.addStatus(t, 'burn', 2, 'cinderSpray', c); },
  }),
  stoke: S({
    owner: 'mage', name: 'Stoke', rarity: 'rare', cd: 5, cast: 0.3, target: 'enemy', icon: 'stoke', fx: 'spark',
    text: 'Add Burn equal to a quarter of the target’s current Burn.',
    resolve(b, c, [t]) { b.addStatus(t, 'burn', Math.floor(t.s.burn / 4), 'stoke', c); },
  }),
  melt: S({
    owner: 'mage', name: 'Melt', rarity: 'rare', cd: 7, cast: 0.5, target: 'enemy', icon: 'melt', fx: 'beam',
    text: 'Deal 15 damage to Block only. If Block breaks, inflict 4 Burn.', hint: 'Skipped if the target has no Block.',
    canCast: (b, c, [t]) => t.s.block > 0,
    resolve(b, c, [t]) { b.damageBlock(c, t, 15, 'melt'); if (t.s.block === 0) b.addStatus(t, 'burn', 4, 'melt', c); },
  }),
  fireShield: S({
    owner: 'mage', name: 'Fire Shield', rarity: 'rare', cd: 8, cast: 0.4, target: 'ally', icon: 'fshield', fx: 'shield',
    text: 'Ally gains 10 Block. Attackers gain 2 Burn while it holds.',
    resolve(b, c, [t]) { b.addStatus(t, 'block', 10, 'fireShield', c); if (!t.s.fireShield) b.addStatus(t, 'fireShield', 1, 'fireShield', c); },
  }),
  flashpoint: S({
    owner: 'mage', name: 'Flashpoint', rarity: 'rare', cd: 6, cast: 0.7, target: 'enemy', icon: 'burst', fx: 'flashpoint',
    text: 'Deal 3× the target’s Burn as damage, ignoring Block, then remove all its Burn.', hint: 'Skipped if the target has no Burn.',
    canCast: (b, c, [t]) => t.s.burn > 0,
    resolve(b, c, [t]) { const n = t.s.burn; b.addStatus(t, 'burn', -n, 'flashpoint', c); b.damage(c, t, n * 3, { source: 'flashpoint', ignoreBlock: true, big: true }); },
  }),
  smother: S({
    owner: 'mage', name: 'Smother', rarity: 'rare', cd: 6, cast: 0.3, target: 'ally', icon: 'smother', fx: 'smoke',
    text: 'Remove up to 5 Burn from an ally, give them 5 Block.',
    resolve(b, c, [t]) { b.addStatus(t, 'burn', -Math.min(5, t.s.burn), 'smother', c); b.addStatus(t, 'block', 5, 'smother', c); },
  }),
  passTheFlame: S({
    owner: 'mage', name: 'Pass the Flame', rarity: 'epic', cd: 6, cast: 0.5, target: 'enemy', icon: 'pass', fx: 'pass',
    text: 'Move all Burn from the enemy with the most Burn onto the target.', hint: 'Needs a second burning enemy.',
    canCast: (b, c, [t]) => !!b.passSource(c, t),
    resolve(b, c, [t]) { const f = b.passSource(c, t); if (!f) return; const n = f.s.burn; b.addStatus(f, 'burn', -n, 'passTheFlame', c); b.addStatus(t, 'burn', n, 'passTheFlame', c); },
  }),
  pyrePact: S({
    owner: 'mage', name: 'Pyre Pact', rarity: 'epic', cd: 10, cast: 0.6, target: 'self', icon: 'pact', fx: 'pact',
    text: 'Caster gains 5 Burn; all allies gain Heat equal to the caster’s Burn.',
    resolve(b, c) { b.addStatus(c, 'burn', 5, 'pyrePact', c); const n = c.s.burn; for (const a of b.alliesOf(c)) b.addStatus(a, 'heat', n, 'pyrePact', c); },
  }),
  backdraft: S({
    owner: 'mage', name: 'Backdraft', rarity: 'epic', cd: 8, cast: 0.6, target: 'enemy', icon: 'wave', fx: 'wave',
    text: 'Only if the target has Block: deal 2× its Block as damage and remove it.',
    canCast: (b, c, [t]) => t.s.block > 0,
    resolve(b, c, [t]) { const k = t.s.block; b.damageBlock(c, t, k, 'backdraft'); b.damage(c, t, k * 2, { source: 'backdraft', big: true }); },
  }),
  inferno: S({
    owner: 'mage', name: 'Inferno', rarity: 'legendary', cd: 0, once: true, cast: 0.8, target: 'self', icon: 'inferno', fx: 'inferno',
    text: 'Once per fight. For 6s, Burn on enemies ignores Block.',
    resolve(b, c) { b.startInferno(c, sec(6)); },
  }),
  wildfire: S({
    owner: 'mage', name: 'Wildfire', rarity: 'legendary', cd: 12, cast: 0.6, target: 'enemy', icon: 'wildfire', fx: 'lob',
    text: 'Inflict 3 Burn. Each Burn tick on that enemy gives its neighbours 1 Burn.',
    resolve(b, c, [t]) { b.addStatus(t, 'burn', 3, 'wildfire', c); if (!t.s.wildfire) b.addStatus(t, 'wildfire', 1, 'wildfire', c); },
  }),
  emberSaint: S({
    owner: 'mage', name: 'Ember Saint', rarity: 'legendary', target: 'passive', icon: 'flameHeart', passive: true,
    text: 'Passive. When the Fire Mage is healed, inflict that much Burn on the lowest HP enemy.',
  }),
  phoenixAsh: S({
    owner: 'mage', name: 'Phoenix Ash', rarity: 'legendary', cd: 0, once: true, cast: 0.6, target: 'ally', icon: 'feather', fx: 'phoenix',
    text: 'Once per fight. The next time the ally would die, they survive at 1 HP and enemies gain Burn = their max HP ÷ 5.',
    resolve(b, c, [t]) { if (!t.s.phoenix) b.addStatus(t, 'phoenix', 1, 'phoenixAsh', c); },
  }),

  // ------------------------------------------------------------ Cleric
  staffTap: S({
    owner: 'cleric', name: 'Staff Tap', rarity: 'common', cd: 0, cast: 0.3, target: 'enemy', icon: 'staff', fx: 'tap', basic: true,
    text: 'Basic attack. Deal 3 damage.',
    resolve(b, c, [t]) { b.damage(c, t, 3, { kind: 'attack', source: 'staffTap' }); },
  }),
  mend: S({
    owner: 'cleric', name: 'Mend', rarity: 'common', cd: 3, cast: 0.4, target: 'ally', icon: 'cross', fx: 'heal',
    text: 'Heal ally for 10.',
    resolve(b, c, [t]) { b.heal(c, t, 10, 'mend'); },
  }),
  purify: S({
    owner: 'cleric', name: 'Purify', rarity: 'common', cd: 5, cast: 0.4, target: 'ally', icon: 'sparkle', fx: 'purify',
    text: 'Remove 4 Poison or Burn (whichever is higher) from ally.', hint: 'Skipped if the ally has neither.',
    canCast: (b, c, [t]) => t.s.poison > 0 || t.s.burn > 0,
    resolve(b, c, [t]) { const k = t.s.poison >= t.s.burn ? 'poison' : 'burn'; b.addStatus(t, k, -Math.min(4, t.s[k]), 'purify', c); },
  }),
  blessing: S({
    owner: 'cleric', name: 'Blessing', rarity: 'common', cd: 6, cast: 0.4, target: 'ally', icon: 'shield', fx: 'shield',
    text: 'Ally gains 8 Block.',
    resolve(b, c, [t]) { b.addStatus(t, 'block', 8, 'blessing', c); },
  }),
  smite: S({
    owner: 'cleric', name: 'Smite', rarity: 'common', cd: 4, cast: 0.5, target: 'enemy', icon: 'smite', fx: 'smite',
    text: 'Deal 6 damage.',
    resolve(b, c, [t]) { b.damage(c, t, 6, { source: 'smite' }); },
  }),
  renew: S({
    owner: 'cleric', name: 'Renew', rarity: 'rare', cd: 6, cast: 0.4, target: 'ally', icon: 'leaf', fx: 'renew',
    text: 'Ally gains 3 Regeneration.',
    resolve(b, c, [t]) { b.addStatus(t, 'regen', 3, 'renew', c); },
  }),
  prayerOfMending: S({
    owner: 'cleric', name: 'Prayer of Mending', rarity: 'rare', cd: 8, cast: 0.6, target: 'allAllies', icon: 'rings', fx: 'prayer',
    text: 'Heal all allies for 6.',
    resolve(b, c, ts) { for (const t of ts) b.heal(c, t, 6, 'prayerOfMending'); },
  }),
  absolve: S({
    owner: 'cleric', name: 'Absolve', rarity: 'rare', cd: 7, cast: 0.5, target: 'ally', icon: 'drop', fx: 'absolve',
    text: 'Remove all Poison from ally; inflict half of it on the lowest HP enemy.', hint: 'Skipped if the ally has no Poison.',
    canCast: (b, c, [t]) => t.s.poison > 0,
    resolve(b, c, [t]) {
      const n = t.s.poison;
      b.addStatus(t, 'poison', -n, 'absolve', c);
      const e = b.selectTargets(c, SPELLS.smite, 'lowestHp', null)?.[0];
      if (e && n >= 2) b.addStatus(e, 'poison', Math.floor(n / 2), 'absolve', c);
    },
  }),
  ward: S({
    owner: 'cleric', name: 'Ward', rarity: 'rare', cd: 8, cast: 0.4, target: 'ally', icon: 'ward', fx: 'ward',
    text: 'Ally ignores the next debuff applied to them.',
    resolve(b, c, [t]) { b.addStatus(t, 'ward', 1, 'ward', c); },
  }),
  sanctuary: S({
    owner: 'cleric', name: 'Sanctuary', rarity: 'epic', cd: 0, once: true, cast: 0.5, target: 'ally', icon: 'dome', fx: 'sanctuary',
    text: 'Once per fight. Ally is untargetable until they damage an enemy, are hit by an area attack, or are the only valid target.',
    resolve(b, c, [t]) { if (!t.s.sanctuary) b.addStatus(t, 'sanctuary', 1, 'sanctuary', c); },
  }),
  martyr: S({
    owner: 'cleric', name: 'Martyr', rarity: 'epic', cd: 10, cast: 0.4, target: 'ally', icon: 'chain', fx: 'link',
    text: 'For 5s, the Cleric takes half of the damage dealt to that ally.', hint: 'Can’t target herself.',
    canCast: (b, c, [t]) => t !== c,
    resolve(b, c, [t]) { b.setTimer(t, 'martyr', sec(5), c); },
  }),
  consecrate: S({
    owner: 'cleric', name: 'Consecrate', rarity: 'epic', cd: 10, cast: 0.6, target: 'self', icon: 'sun', fx: 'consecrate',
    text: 'For 5s, healed allies also gain 2 Block.',
    resolve(b, c) { b.consecrate[c.side] = sec(5); b.emit({ type: 'consecrate', side: c.side, on: true }); },
  }),
  judgement: S({
    owner: 'cleric', name: 'Judgement', rarity: 'epic', cd: 8, cast: 0.7, target: 'enemy', icon: 'judgement', fx: 'judgement',
    text: 'Deal damage equal to the team’s healing in the last 5s.', hint: 'Skipped if the team has not healed recently.',
    canCast: (b, c) => b.recentHealing(c.side) > 0,
    resolve(b, c, [t]) { b.damage(c, t, b.recentHealing(c.side), { source: 'judgement', big: true }); },
  }),
  resurrection: S({
    owner: 'cleric', name: 'Resurrection', rarity: 'legendary', cd: 0, once: true, cast: 0.9, target: 'deadAlly', icon: 'ankh', fx: 'resurrect',
    text: 'Once per fight. Revive a dead ally at 30% HP.', hint: 'Only fits when an ally is down.',
    resolve(b, c, [t]) { b.revive(t, 0.3); },
  }),
  mercy: S({
    owner: 'cleric', name: 'Mercy', rarity: 'legendary', target: 'passive', icon: 'heartShield', passive: true,
    text: 'Passive. The Cleric’s overhealing becomes Block, up to 20.',
  }),
  plagueSaint: S({
    owner: 'cleric', name: 'Plague Saint', rarity: 'legendary', target: 'passive', icon: 'skullDrop', passive: true,
    text: 'Passive. The Cleric’s heals don’t heal. They inflict that much Poison on the lowest HP enemy instead.',
  }),
  lastRites: S({
    owner: 'cleric', name: 'Last Rites', rarity: 'legendary', cd: 0, once: true, cast: 0.6, target: 'ally', icon: 'candle', fx: 'lastRites',
    text: 'Once per fight. Only on an ally below 10% HP: full heal and cleanse. The Cleric is silenced for 5s.', hint: 'Skipped unless the target is below 10% HP.',
    canCast: (b, c, [t]) => t.hp * 10 < t.maxHp,
    resolve(b, c, [t]) {
      b.heal(c, t, t.maxHp, 'lastRites');
      b.addStatus(t, 'burn', -t.s.burn, 'lastRites', c);
      b.addStatus(t, 'poison', -t.s.poison, 'lastRites', c);
      b.setTimer(c, 'silence', sec(5), c);
    },
  }),

  // ------------------------------------------------------------ Shieldmaiden
  strike: S({
    owner: 'tank', name: 'Strike', rarity: 'common', cd: 0, cast: 0.3, target: 'enemy', icon: 'sword', fx: 'slash', basic: true,
    text: 'Basic attack. Deal 5 damage.',
    resolve(b, c, [t]) { b.damage(c, t, 5, { kind: 'attack', source: 'strike' }); },
  }),
  shieldUp: S({
    owner: 'tank', name: 'Shield Up', rarity: 'common', cd: 5, cast: 0.3, target: 'self', icon: 'shield', fx: 'shield',
    text: 'Gain 10 Block.',
    resolve(b, c) { b.addStatus(c, 'block', 10, 'shieldUp', c); },
  }),
  taunt: S({
    owner: 'tank', name: 'Taunt', rarity: 'common', cd: 8, cast: 0.4, target: 'self', icon: 'shout', fx: 'taunt',
    text: 'For 4s, enemies must aim attacks and single-target spells at the Shieldmaiden.',
    resolve(b, c) { b.setTimer(c, 'taunt', sec(4), c); },
  }),
  shieldBash: S({
    owner: 'tank', name: 'Shield Bash', rarity: 'common', cd: 5, cast: 0.4, target: 'enemy', icon: 'bash', fx: 'bash',
    text: 'Deal damage equal to half her Block (at least 3). Push the target’s action bar back 30%.',
    resolve(b, c, [t]) {
      b.damage(c, t, Math.max(3, Math.floor(c.s.block / 2)), { kind: 'attack', source: 'shieldBash' });
      if (t.alive) { t.bar = Math.max(0, t.bar - Math.floor(t.barMax * 0.3)); b.emit({ type: 'knock', tgt: t.id }); }
    },
  }),
  bulwark: S({
    owner: 'tank', name: 'Bulwark', rarity: 'rare', cd: 8, cast: 0.5, target: 'allAllies', icon: 'towerShield', fx: 'shield',
    text: 'All allies gain 6 Block.',
    resolve(b, c, ts) { for (const t of ts) b.addStatus(t, 'block', 6, 'bulwark', c); },
  }),
  spikedPlating: S({
    owner: 'tank', name: 'Spiked Plating', rarity: 'rare', cd: 8, cast: 0.4, target: 'self', icon: 'spikes', fx: 'spikes',
    text: 'Gain 3 Spikes.',
    resolve(b, c) { b.addStatus(c, 'spikes', 3, 'spikedPlating', c); },
  }),
  guard: S({
    owner: 'tank', name: 'Guard', rarity: 'rare', cd: 7, cast: 0.4, target: 'ally', icon: 'guard', fx: 'link',
    text: 'Ally gains 6 Block. For 4s, attacks and spells aimed at them hit the Shieldmaiden instead.', hint: 'Can’t target herself.',
    canCast: (b, c, [t]) => t !== c,
    resolve(b, c, [t]) { b.addStatus(t, 'block', 6, 'guard', c); b.setTimer(t, 'guarded', sec(4), c); },
  }),
  ironWill: S({
    owner: 'tank', name: 'Iron Will', rarity: 'rare', cd: 10, cast: 0.4, target: 'self', icon: 'fist', fx: 'purify',
    text: 'Remove up to 4 Burn and 4 Poison from herself. Gain 3 Regeneration.',
    resolve(b, c) {
      b.addStatus(c, 'burn', -Math.min(4, c.s.burn), 'ironWill', c);
      b.addStatus(c, 'poison', -Math.min(4, c.s.poison), 'ironWill', c);
      b.addStatus(c, 'regen', 3, 'ironWill', c);
    },
  }),
  rally: S({
    owner: 'tank', name: 'Rally', rarity: 'epic', cd: 10, cast: 0.6, target: 'allAllies', icon: 'banner', fx: 'rally',
    text: 'All allies gain 2 Empower.',
    resolve(b, c, ts) { for (const t of ts) b.addStatus(t, 'empower', 2, 'rally', c); },
  }),
  shieldSlam: S({
    owner: 'tank', name: 'Shield Slam', rarity: 'epic', cd: 8, cast: 0.5, target: 'enemy', icon: 'slam', fx: 'slam',
    text: 'Deal damage equal to her Block, then lose half of it.', hint: 'Skipped if she has no Block.',
    canCast: (b, c) => c.s.block > 0,
    resolve(b, c, [t]) { b.damage(c, t, c.s.block, { kind: 'attack', source: 'shieldSlam', big: true }); b.addStatus(c, 'block', -Math.ceil(c.s.block / 2), 'shieldSlam', c); },
  }),
  kindledSteel: S({
    owner: 'tank', name: 'Kindled Steel', rarity: 'epic', cd: 8, cast: 0.4, target: 'self', icon: 'fshield', fx: 'kindled',
    text: 'Gain Block equal to a third of all Burn on enemies.', hint: 'Skipped below 3 total enemy Burn.',
    canCast: (b, c) => b.enemiesOf(c).reduce((a, e) => a + e.s.burn, 0) >= 3,
    resolve(b, c) { b.addStatus(c, 'block', Math.floor(b.enemiesOf(c).reduce((a, e) => a + e.s.burn, 0) / 3), 'kindledSteel', c); },
  }),
  bastion: S({
    owner: 'tank', name: 'Bastion', rarity: 'legendary', cd: 0, once: true, cast: 0.7, target: 'self', icon: 'tower', fx: 'bastion',
    text: 'Once per fight. For 6s, all damage to allies hits the Shieldmaiden instead, and she takes 30% less.',
    resolve(b, c) { b.setTimer(c, 'bastion', sec(6), c); },
  }),
  lastStand: S({
    owner: 'tank', name: 'Last Stand', rarity: 'legendary', target: 'passive', icon: 'brokenShield', passive: true,
    text: 'Passive. Below 30% HP, all Block she gains is doubled.',
  }),
  reprisal: S({
    owner: 'tank', name: 'Reprisal', rarity: 'legendary', target: 'passive', icon: 'steelBurst', passive: true,
    text: 'Passive. When her Block breaks, deal 10 damage to all enemies.',
  }),

  // ------------------------------------------------------------ Dummies (hidden)
  brace: S({
    owner: 'enemy', name: 'Brace', rarity: 'common', cd: 5, cast: 0.3, target: 'self', icon: 'shield', fx: 'shield',
    text: 'Gain 12 Block.',
    resolve(b, c) { b.addStatus(c, 'block', 12, 'brace', c); },
  }),
  thwack: S({
    owner: 'enemy', name: 'Thwack', rarity: 'common', cd: 0, cast: 0.3, target: 'enemy', icon: 'attack', fx: 'thwack',
    text: 'Deal 8–10 damage to the frontmost enemy.',
    resolve(b, c, [t]) { b.damage(c, t, 8 + Math.floor(b.rng() * 3), { kind: 'attack', source: 'thwack' }); },
  }),
  spit: S({
    owner: 'enemy', name: 'Spit', rarity: 'common', cd: 4, cast: 0.4, target: 'enemy', icon: 'drop', fx: 'spit',
    text: 'Inflict 3 Poison on the backmost enemy.',
    resolve(b, c, [t]) { b.addStatus(t, 'poison', 3, 'spit', c); },
  }),
};

export const spellsOf = (owner) => Object.keys(SPELLS).filter((k) => SPELLS[k].owner === owner);

export const SOURCE_NAMES = {
  burn: 'Burn ticks',
  poison: 'Poison ticks',
  regen: 'Regeneration',
  spikes: 'Spikes',
  fireShield: 'Fire Shield',
  phoenixAsh: 'Phoenix Ash',
};
export const sourceName = (k) => SPELLS[k]?.name ?? SOURCE_NAMES[k] ?? k;

// Stacking statuses (u.s) and timed ones (u.tm, shown in seconds).
export const STATUSES = {
  burn: { name: 'Burn', icon: 'flame', tone: 'burn', debuff: true, text: 'Deals its stacks as damage every second. Never fades. Hits Block first.' },
  poison: { name: 'Poison', icon: 'drop', tone: 'poison', debuff: true, text: 'Deals its stacks as damage every second. Never fades. Ignores Block.' },
  block: { name: 'Block', icon: 'shield', tone: 'block', text: 'Absorbs damage before HP. Absorbs Burn, not Poison.' },
  heat: { name: 'Heat', icon: 'heat', tone: 'heat', text: 'Action bar fills 10% faster per stack.' },
  regen: { name: 'Regeneration', icon: 'leaf', tone: 'regen', text: 'Heals 2 per stack every second, then loses a stack.' },
  empower: { name: 'Empower', icon: 'banner', tone: 'empower', text: '+1 damage per stack on attacks and damaging spells.' },
  spikes: { name: 'Spikes', icon: 'spikes', tone: 'steel', text: 'Deals its stacks back to anyone who attacks this unit.' },
  ward: { name: 'Ward', icon: 'ward', tone: 'gold', text: 'Ignores the next debuff an enemy applies.' },
  fireShield: { name: 'Fire Shield', icon: 'fshield', tone: 'burn', flag: true, text: 'Attackers gain 2 Burn while Block holds.' },
  wildfire: { name: 'Wildfire', icon: 'wildfire', tone: 'burn', flag: true, text: 'Burn ticks spread 1 Burn to neighbours.' },
  phoenix: { name: 'Phoenix', icon: 'feather', tone: 'gold', flag: true, text: 'Survives one lethal hit at 1 HP.' },
  sanctuary: { name: 'Sanctuary', icon: 'dome', tone: 'gold', flag: true, text: 'Untargetable until they deal damage or are hit by an area attack.' },
};
export const TIMERS = {
  taunt: { name: 'Taunt', icon: 'shout', tone: 'taunt', text: 'Enemies must target this unit.' },
  guarded: { name: 'Guarded', icon: 'guard', tone: 'steel', text: 'Hits on this unit go to the Shieldmaiden.' },
  martyr: { name: 'Martyr', icon: 'chain', tone: 'gold', text: 'The Cleric takes half the damage this unit takes.' },
  bastion: { name: 'Bastion', icon: 'tower', tone: 'steel', text: 'Takes all damage aimed at allies, 30% less.' },
  silence: { name: 'Silenced', icon: 'candle', tone: 'muted', text: 'Can’t cast.' },
};

// Condition keywords: [who] [stat] [comparator] [value]
export const COND_WHO = [['enemy', 'enemy'], ['ally', 'ally'], ['self', 'self']];
export const COND_STAT = [['hp', 'HP %'], ['burn', 'Burn'], ['poison', 'Poison'], ['block', 'Block'], ['heat', 'Heat']];
export const COND_CMP = [['lt', '<'], ['gte', '≥']];
export const COND_VALUES = {
  hp: [10, 20, 30, 40, 50, 60, 70, 80, 90],
  burn: [1, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50],
  poison: [1, 3, 5, 8, 10, 15, 20, 30],
  block: [1, 5, 8, 10, 15, 20, 30],
  heat: [1, 3, 5, 8, 10, 15],
};

export const TARGETS = {
  enemy: [
    ['lowestHp', 'lowest HP enemy'],
    ['highestHp', 'highest HP enemy'],
    ['mostBurn', 'enemy with most Burn'],
    ['leastBurn', 'enemy with least Burn'],
    ['mostPoison', 'enemy with most Poison'],
    ['mostBlock', 'enemy with most Block'],
    ['front', 'frontmost enemy'],
    ['back', 'backmost enemy'],
  ],
  ally: [
    ['lowestHpAlly', 'lowest HP ally'],
    ['self', 'self'],
    ['frontAlly', 'frontmost ally'],
    ['backAlly', 'backmost ally'],
    ['mostBurnAlly', 'ally with most Burn'],
    ['mostPoisonAlly', 'ally with most Poison'],
  ],
  deadAlly: [['deadAlly', 'fallen ally']],
  allEnemies: [['allEnemies', 'all enemies']],
  allAllies: [['allAllies', 'all allies']],
  self: [['self', 'self']],
  passive: [['passive', 'always on']],
};

export function targetLabel(spellId, sel) {
  const kind = SPELLS[spellId]?.target;
  const opt = (TARGETS[kind] || []).find(([k]) => k === sel);
  return opt ? opt[1] : TARGETS[kind]?.[0]?.[1] ?? '';
}

export const defaultTarget = (spellId) => TARGETS[SPELLS[spellId].target][0][0];

export function condLabel(cond) {
  if (!cond) return 'Otherwise';
  const stat = COND_STAT.find(([k]) => k === cond.stat)[1];
  const cmp = COND_CMP.find(([k]) => k === cond.cmp)[1];
  return `${cond.who} ${stat.replace(' %', '')} ${cmp} ${cond.val}${cond.stat === 'hp' ? '%' : ''}`;
}
