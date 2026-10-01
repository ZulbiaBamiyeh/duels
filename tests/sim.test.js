import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/sim/battle.js';
import { TPS } from '../src/sim/data.js';
import { mageDef, dummyDefs, defaultDummies, clonePreset, PRESETS } from '../src/sim/party.js';

function run(presetId, dummies, seconds = 60, seed = 7) {
  const b = new Battle({ seed, party: [mageDef(clonePreset(presetId))], enemies: dummyDefs(dummies) });
  const log = [];
  for (let i = 0; i < seconds * TPS; i++) log.push(...b.step());
  return { b, log };
}

const three = () => ({ ...defaultDummies(), count: 3 });

test('same seed and party give the identical fight', () => {
  for (const p of PRESETS) {
    const a = run(p.id, three());
    const c = run(p.id, three());
    assert.equal(JSON.stringify(a.log), JSON.stringify(c.log), p.id);
  }
});

test('every preset casts spells and deals damage', () => {
  for (const p of PRESETS) {
    const { b } = run(p.id, three());
    assert.ok(b.stats.total > 0, `${p.id} dealt no damage`);
    assert.ok(Object.keys(b.stats.casts).length > 0, `${p.id} cast nothing`);
  }
});

test('flashpoint consumes burn and ignores block', () => {
  const { log } = run('cashout', defaultDummies(), 40);
  const fp = log.find((e) => e.type === 'damage' && e.source === 'flashpoint');
  assert.ok(fp, 'flashpoint should fire within 40s');
  assert.equal(fp.blocked, 0);
  assert.equal(fp.amount % 3, 0);
});

test('melt only lands on targets with block', () => {
  const { log } = run('cashout', { ...defaultDummies(), list: [{ shield: false, strike: false }] }, 30);
  assert.ok(!log.some((e) => e.type === 'cast' && e.spell === 'melt'));
});

test('a dummy that strikes back can kill an idle mage', () => {
  const d = { count: 3, hp: 500, list: [{ shield: false, strike: true }, { shield: false, strike: true }, { shield: false, strike: true }] };
  const b = new Battle({ seed: 3, party: [mageDef([])], enemies: dummyDefs(d) });
  for (let i = 0; i < 120 * TPS && !b.over; i++) b.step();
  assert.equal(b.over, 'defeat');
});
