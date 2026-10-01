// Deterministic real-time battle simulation.
// Fixed timestep (TPS ticks per second), integer maths, seeded RNG, no rendering code.
// Same party + same seed = same fight, every time, on every device.

import { mulberry32 } from './rng.js';
import { SPELLS, TPS, sec } from './data.js';

const BAR_STEP = 100; // action bar gain per tick before Heat
const HEAT_STEP = 10; // +10% fill rate per Heat stack
const ATTACK_CAST = sec(0.3);

function freshStatuses() {
  return { burn: 0, block: 0, heat: 0, fireShield: 0, wildfire: 0, phoenix: 0 };
}

function makeUnit(def, side, slot) {
  return {
    id: `${side}${slot}`,
    def,
    side,
    slot,
    name: def.name,
    maxHp: def.maxHp,
    hp: def.maxHp,
    s: freshStatuses(),
    bar: 0,
    barMax: def.fillTicks * BAR_STEP,
    cast: null,
    cd: {},
    used: {},
    alive: true,
    respawnIn: 0,
    spellbook: def.spellbook || [],
  };
}

export class Battle {
  constructor({ seed = 1, party, enemies }) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.t = 0;
    this.over = null;
    this.events = [];
    this.inferno = { ally: 0, enemy: 0 }; // ticks left where Burn on that side ignores Block
    this.units = [
      ...party.map((d, i) => makeUnit(d, 'ally', i)),
      ...enemies.map((d, i) => makeUnit(d, 'enemy', i)),
    ];
    this.stats = { total: 0, blockDmg: 0, shattered: 0, peakBurn: 0, kills: 0, bySource: {}, casts: {} };
  }

  get time() {
    return this.t / TPS;
  }

  unit(id) {
    return this.units.find((u) => u.id === id);
  }
  alliesOf(u) {
    return this.units.filter((x) => x.alive && x.side === u.side);
  }
  enemiesOf(u) {
    return this.units.filter((x) => x.alive && x.side !== u.side);
  }

  emit(e) {
    e.t = this.t;
    this.events.push(e);
  }

  // ---------------------------------------------------------------- tick

  step() {
    this.events = [];
    if (this.over) return this.events;
    const t = ++this.t;

    for (const side of ['ally', 'enemy']) {
      if (this.inferno[side] > 0 && --this.inferno[side] === 0) this.emit({ type: 'inferno', side, on: false });
    }

    for (const u of this.units) {
      if (!u.alive && u.respawnIn > 0 && --u.respawnIn === 0) this.respawn(u);
    }

    if (t % TPS === 0) {
      for (const u of this.units) if (u.alive && u.s.burn > 0) this.burnTick(u);
    }

    for (const u of this.units) {
      if (!u.alive || this.over) continue;
      for (const k in u.cd) if (u.cd[k] > 0) u.cd[k]--;
      if (u.cast) {
        if (--u.cast.left <= 0) this.resolveCast(u);
        continue;
      }
      if (u.def.passive) continue;
      u.bar += BAR_STEP + HEAT_STEP * u.s.heat;
      if (u.bar >= u.barMax) {
        u.bar = 0;
        this.chooseAction(u);
      }
    }
    return this.events;
  }

  // ------------------------------------------------------------- spellbook

  statOf(u, stat) {
    return stat === 'hp' ? Math.floor((u.hp * 100) / u.maxHp) : u.s[stat];
  }

  evalCond(u, cond) {
    if (!cond) return { ok: true, pool: null, who: null };
    const list = cond.who === 'enemy' ? this.enemiesOf(u) : cond.who === 'ally' ? this.alliesOf(u) : [u];
    const pool = list.filter((x) => {
      const v = this.statOf(x, cond.stat);
      return cond.cmp === 'lt' ? v < cond.val : v >= cond.val;
    });
    return { ok: pool.length > 0, pool, who: cond.who };
  }

  pick(pool, score) {
    // highest score wins; ties go to the frontmost slot
    let best = null;
    let bestScore = -Infinity;
    for (const x of pool) {
      const s = score(x);
      if (s > bestScore || (s === bestScore && x.slot < best.slot)) {
        best = x;
        bestScore = s;
      }
    }
    return best ? [best] : null;
  }

  selectTargets(u, spell, sel, condRes) {
    if (spell.target === 'self') return [u];
    if (spell.target === 'allEnemies') {
      const e = this.enemiesOf(u);
      return e.length ? e : null;
    }
    if (spell.target === 'ally') {
      if (sel === 'self') return [u];
      const fromCond = condRes && (condRes.who === 'ally' || condRes.who === 'self') && condRes.pool;
      const pool = fromCond || this.alliesOf(u);
      if (sel === 'mostBurnAlly') return this.pick(pool, (x) => x.s.burn);
      return this.pick(pool, (x) => -x.hp);
    }
    const fromCond = condRes && condRes.who === 'enemy' && condRes.pool;
    const pool = fromCond || this.enemiesOf(u);
    switch (sel) {
      case 'highestHp': return this.pick(pool, (x) => x.hp);
      case 'mostBurn': return this.pick(pool, (x) => x.s.burn);
      case 'leastBurn': return this.pick(pool, (x) => -x.s.burn);
      case 'mostBlock': return this.pick(pool, (x) => x.s.block);
      case 'front': return this.pick(pool, (x) => -x.slot);
      case 'back': return this.pick(pool, (x) => x.slot);
      default: return this.pick(pool, (x) => -x.hp);
    }
  }

  // Read the spellbook top to bottom; first line whose condition holds and spell is ready wins.
  pickLine(u) {
    const book = u.spellbook;
    for (let i = 0; i < book.length; i++) {
      const line = book[i];
      const spell = SPELLS[line.spell];
      if (!spell) continue;
      if ((u.cd[line.spell] || 0) > 0) continue;
      if (spell.once && u.used[line.spell]) continue;
      const cond = this.evalCond(u, line.cond);
      if (!cond.ok) continue;
      const targets = this.selectTargets(u, spell, line.target, cond);
      if (!targets) continue;
      if (spell.canCast && !spell.canCast(this, u, targets)) continue;
      return { line: i, spell: line.spell, sel: line.target, targets };
    }
    return null;
  }

  chooseAction(u) {
    const pick = this.pickLine(u);
    if (pick) {
      const spell = SPELLS[pick.spell];
      const ticks = Math.max(1, sec(spell.cast));
      u.cast = { spell: pick.spell, line: pick.line, sel: pick.sel, targets: pick.targets.map((x) => x.id), left: ticks, total: ticks };
      if (spell.cd) u.cd[pick.spell] = sec(spell.cd);
      if (spell.once) u.used[pick.spell] = true;
      this.emit({ type: 'castStart', unit: u.id, spell: pick.spell, line: pick.line, targets: u.cast.targets, ticks });
      return;
    }
    if (!u.def.weapon) return;
    const front = this.pick(this.enemiesOf(u), (x) => -x.slot);
    if (!front) return;
    u.cast = { spell: 'attack', line: -1, sel: 'front', targets: [front[0].id], left: ATTACK_CAST, total: ATTACK_CAST };
    this.emit({ type: 'castStart', unit: u.id, spell: 'attack', line: -1, targets: u.cast.targets, ticks: ATTACK_CAST });
  }

  resolveCast(u) {
    const c = u.cast;
    u.cast = null;
    if (c.spell === 'attack') {
      let tgt = this.unit(c.targets[0]);
      if (!tgt || !tgt.alive) tgt = this.pick(this.enemiesOf(u), (x) => -x.slot)?.[0];
      if (!tgt) return this.emit({ type: 'fizzle', unit: u.id, spell: 'attack' });
      const w = u.def.weapon;
      const dmg = w.min + Math.floor(this.rng() * (w.max - w.min + 1));
      this.emit({ type: 'cast', unit: u.id, spell: 'attack', line: -1, targets: [tgt.id] });
      this.damage(u, tgt, dmg, { kind: 'attack', source: 'attack' });
      return;
    }
    const spell = SPELLS[c.spell];
    let targets;
    if (spell.target === 'allEnemies' || spell.target === 'self') {
      targets = this.selectTargets(u, spell, c.sel, null);
    } else {
      targets = c.targets.map((id) => this.unit(id)).filter((x) => x && x.alive);
      if (!targets.length) targets = this.selectTargets(u, spell, c.sel, null);
    }
    if (!targets || (spell.canCast && !spell.canCast(this, u, targets))) {
      return this.emit({ type: 'fizzle', unit: u.id, spell: c.spell });
    }
    this.emit({ type: 'cast', unit: u.id, spell: c.spell, line: c.line, targets: targets.map((x) => x.id) });
    if (u.side === 'ally') this.stats.casts[c.spell] = (this.stats.casts[c.spell] || 0) + 1;
    spell.resolve(this, u, targets);
  }

  // ------------------------------------------------------------- effects

  record(tgt, source, dmg, blocked) {
    if (tgt.side !== 'enemy') return;
    const r = (this.stats.bySource[source] ||= { dmg: 0, block: 0, hits: 0 });
    r.dmg += dmg;
    r.block += blocked;
    r.hits++;
    this.stats.total += dmg;
    this.stats.blockDmg += blocked;
  }

  breakBlock(tgt) {
    this.emit({ type: 'blockBreak', tgt: tgt.id });
    if (tgt.side === 'enemy') this.stats.shattered++;
    if (tgt.s.fireShield) this.addStatus(tgt, 'fireShield', -1, 'fireShield');
  }

  // Damage that only touches Block (Melt, Backdraft's removal).
  damageBlock(src, tgt, amount, source) {
    if (!tgt.alive || amount <= 0 || tgt.s.block <= 0) return 0;
    const n = Math.min(amount, tgt.s.block);
    tgt.s.block -= n;
    this.emit({ type: 'damage', src: src?.id, tgt: tgt.id, amount: 0, blocked: n, kind: 'spell', source });
    this.record(tgt, source, 0, n);
    if (tgt.s.block === 0) this.breakBlock(tgt);
    return n;
  }

  damage(src, tgt, amount, { kind = 'spell', source, ignoreBlock = false, big = false } = {}) {
    if (!tgt.alive || amount <= 0) return 0;
    const retaliate = kind === 'attack' && tgt.s.fireShield > 0;
    let blocked = 0;
    if (!ignoreBlock && tgt.s.block > 0) {
      blocked = Math.min(tgt.s.block, amount);
      tgt.s.block -= blocked;
      amount -= blocked;
    }
    tgt.hp -= amount;
    this.emit({ type: 'damage', src: src?.id, tgt: tgt.id, amount, blocked, kind, source, big });
    this.record(tgt, source, amount, blocked);
    if (blocked > 0 && tgt.s.block === 0) this.breakBlock(tgt);
    if (retaliate && src && src.alive) this.addStatus(src, 'burn', 2, 'fireShield');
    if (tgt.hp <= 0) this.kill(tgt);
    return amount;
  }

  addStatus(tgt, key, n, source) {
    if (!tgt.alive || n === 0) return;
    const before = tgt.s[key];
    tgt.s[key] = Math.max(0, before + n);
    const delta = tgt.s[key] - before;
    if (delta === 0) return;
    this.emit({ type: 'status', tgt: tgt.id, key, delta, value: tgt.s[key], source });
    if (key === 'burn' && tgt.side === 'enemy' && tgt.s.burn > this.stats.peakBurn) this.stats.peakBurn = tgt.s.burn;
  }

  burnTick(u) {
    const n = u.s.burn;
    const ignoreBlock = this.inferno[u.side] > 0;
    this.emit({ type: 'burnTick', tgt: u.id, amount: n });
    if (u.s.wildfire) {
      for (const x of this.alliesOf(u)) {
        if (Math.abs(x.slot - u.slot) === 1) {
          this.emit({ type: 'spread', from: u.id, tgt: x.id });
          this.addStatus(x, 'burn', 1, 'wildfire');
        }
      }
    }
    this.damage(null, u, n, { kind: 'burn', source: 'burn', ignoreBlock });
  }

  passSource(c, target) {
    return this.pick(
      this.enemiesOf(c).filter((x) => x !== target && x.s.burn > 0),
      (x) => x.s.burn,
    )?.[0];
  }

  startInferno(c, ticks) {
    const side = c.side === 'ally' ? 'enemy' : 'ally';
    this.inferno[side] = ticks;
    this.emit({ type: 'inferno', side, on: true });
  }

  kill(u) {
    if (u.s.phoenix) {
      u.hp = 1;
      this.addStatus(u, 'phoenix', -1, 'phoenixAsh');
      this.emit({ type: 'phoenix', tgt: u.id });
      const burn = Math.floor(u.maxHp / 5);
      for (const e of this.enemiesOf(u)) this.addStatus(e, 'burn', burn, 'phoenixAsh');
      return;
    }
    u.hp = 0;
    u.alive = false;
    u.cast = null;
    u.bar = 0;
    this.emit({ type: 'death', tgt: u.id });
    if (u.side === 'enemy') this.stats.kills++;
    if (u.def.respawn) u.respawnIn = sec(2);
    if (!this.units.some((x) => x.side === 'ally' && x.alive)) {
      this.over = 'defeat';
      this.emit({ type: 'over', result: 'defeat' });
    }
  }

  respawn(u) {
    u.alive = true;
    u.hp = u.maxHp;
    u.s = freshStatuses();
    u.bar = 0;
    u.cd = {};
    u.used = {};
    u.cast = null;
    this.emit({ type: 'respawn', tgt: u.id });
  }
}
