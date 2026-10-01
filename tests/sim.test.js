import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/sim/battle.js';
import { TPS, SPELLS, spellsOf } from '../src/sim/data.js';
import { partyDefs, defaultParty, dummyDefs, defaultDummies, presetLines, PRESETS } from '../src/sim/party.js';

function battle(party = defaultParty(), dummies = defaultDummies(), seed = 7) {
  return new Battle({ seed, party: partyDefs(party), enemies: dummyDefs(dummies) });
}
function run(b, seconds) {
  const log = [];
  for (let i = 0; i < seconds * TPS && !b.over; i++) log.push(...b.step());
  return log;
}
const three = () => ({ ...defaultDummies(), count: 3 });

test('same seed and parties give the identical fight', () => {
  const a = run(battle(defaultParty(), three()), 60);
  const c = run(battle(defaultParty(), three()), 60);
  assert.equal(JSON.stringify(a), JSON.stringify(c));
});

test('every preset casts spells and its party survives 60s against 3 dummies', () => {
  for (const kind of ['tank', 'mage', 'cleric']) {
    for (const p of PRESETS[kind]) {
      const party = defaultParty();
      party.books[kind] = presetLines(kind, p.id);
      const b = battle(party, three());
      run(b, 60);
      assert.ok(b.stats.total > 0, `${kind}/${p.id} dealt no damage`);
      assert.ok(b.stats.units[b.units.find((u) => u.kind === kind).id].casts > 0, `${kind}/${p.id} cast nothing`);
    }
  }
});

test('units with no fitting line wait instead of attacking', () => {
  const party = defaultParty();
  party.books.mage = [{ cond: { who: 'enemy', stat: 'burn', cmp: 'gte', val: 50 }, spell: 'flashpoint', target: 'mostBurn' }];
  const b = battle(party);
  const log = run(b, 10);
  const mage = b.units.find((u) => u.kind === 'mage');
  assert.ok(log.some((e) => e.type === 'wait' && e.unit === mage.id));
  assert.ok(!log.some((e) => e.type === 'castStart' && e.unit === mage.id));
  assert.equal(mage.bar, mage.barMax);
});

test('taunt pulls enemy attacks onto the Shieldmaiden', () => {
  const party = { formation: ['mage', 'tank', 'cleric'], books: { mage: [], cleric: [], tank: [{ cond: null, spell: 'taunt', target: 'self' }] } };
  const b = battle(party, { count: 1, hp: 600, list: [{ strike: true }] });
  const log = run(b, 12);
  const tank = b.units.find((u) => u.kind === 'tank');
  const hits = log.filter((e) => e.type === 'damage' && e.source === 'thwack');
  assert.ok(hits.length > 0);
  assert.ok(hits.some((e) => e.tgt === tank.id), 'taunted hits land on the tank even though the mage is in front');
});

test('poison ignores block and absolve moves it', () => {
  const party = defaultParty();
  const b = battle(party, { count: 1, hp: 600, list: [{ spit: true }] });
  const log = run(b, 30);
  assert.ok(log.some((e) => e.type === 'damage' && e.kind === 'poison' && e.blocked === 0));
  assert.ok(log.some((e) => e.type === 'cast' && e.spell === 'absolve'));
});

test('flashpoint consumes burn and ignores block', () => {
  const log = run(battle(), 60);
  const fp = log.find((e) => e.type === 'damage' && e.source === 'flashpoint');
  assert.ok(fp, 'flashpoint should fire within 60s');
  assert.equal(fp.blocked, 0);
});

test('every player spell resolves without throwing', () => {
  for (const kind of ['tank', 'mage', 'cleric']) {
    for (const id of spellsOf(kind)) {
      const sp = SPELLS[id];
      const party = defaultParty();
      const target = { enemy: 'front', ally: 'lowestHpAlly', deadAlly: 'deadAlly', allEnemies: 'allEnemies', allAllies: 'allAllies', self: 'self', passive: 'passive' }[sp.target];
      party.books[kind] = [{ cond: null, spell: id, target }, ...party.books[kind]];
      const b = battle(party, three());
      assert.doesNotThrow(() => run(b, 20), id);
    }
  }
});

test('an undefended party eventually falls', () => {
  const party = { formation: ['tank', 'mage', 'cleric'], books: { tank: [], mage: [], cleric: [] } };
  const b = battle(party, { count: 3, hp: 600, list: [{ strike: true }, { strike: true }, { strike: true, spit: true }] });
  run(b, 120);
  assert.equal(b.over, 'defeat');
});
