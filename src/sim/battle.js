// Deterministic real-time battle simulation.
// Fixed timestep (TPS ticks per second), integer maths, seeded RNG, no rendering code.
// Same parties + same seed = same fight, every time, on every device.

import { mulberry32 } from './rng.js';
import { SPELLS, STATUSES, TPS, sec } from './data.js';

const BAR_STEP = 100; // action bar gain per tick before Heat
const HEAT_STEP = 10; // +10% fill rate per Heat stack

const freshStatuses = () => Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 0]));
const freshTimers = () => ({ taunt: 0, guarded: 0, martyr: 0, bastion: 0, silence: 0 });

function makeUnit(def, side, slot) {
  return {
    id: `${side}${slot}`,
    def,
    kind: def.kind,
    side,
    slot,
    name: def.name,
    maxHp: def.maxHp,
    hp: def.maxHp,
    s: freshStatuses(),
    tm: freshTimers(),
    links: {}, // timer or DoT -> unit id that applied it (guard, martyr, burn, poison)
    bar: 0,
    barMax: def.fillTicks * BAR_STEP,
    cast: null,
    cd: {},
    used: {},
    alive: true,
    waiting: false,
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
    this.inferno = { ally: 0, enemy: 0 }; // Burn on that side ignores Block
    this.consecrate = { ally: 0, enemy: 0 };
    this.healLog = { ally: [], enemy: [] };
    this.units = [...party.map((d, i) => makeUnit(d, 'ally', i)), ...enemies.map((d, i) => makeUnit(d, 'enemy', i))];
    this.stats = { total: 0, blockDmg: 0, shattered: 0, peakBurn: 0, kills: 0, bySource: {}, casts: {}, units: {} };
    for (const u of this.units) this.stats.units[u.id] = { dealt: 0, healed: 0, taken: 0, blocked: 0, casts: 0 };
  }

  get time() { return this.t / TPS; }
  unit(id) { return this.units.find((u) => u.id === id); }
  alliesOf(u) { return this.units.filter((x) => x.alive && x.side === u.side); }
  enemiesOf(u) { return this.units.filter((x) => x.alive && x.side !== u.side); }
  hasPassive(u, id) { return u.spellbook.some((l) => l.spell === id); }
  emit(e) { e.t = this.t; this.events.push(e); }

  // ---------------------------------------------------------------- tick

  step() {
    this.events = [];
    if (this.over) return this.events;
    const t = ++this.t;

    for (const side of ['ally', 'enemy']) {
      if (this.inferno[side] > 0 && --this.inferno[side] === 0) this.emit({ type: 'inferno', side, on: false });
      if (this.consecrate[side] > 0 && --this.consecrate[side] === 0) this.emit({ type: 'consecrate', side, on: false });
    }

    for (const u of this.units) {
      if (!u.alive && u.respawnIn > 0 && --u.respawnIn === 0) this.respawn(u);
      if (!u.alive) continue;
      for (const k in u.tm) if (u.tm[k] > 0 && --u.tm[k] === 0) this.emit({ type: 'timer', tgt: u.id, key: k, on: false });
    }

    if (t % TPS === 0) {
      for (const u of this.units) if (u.alive && u.s.burn > 0) this.burnTick(u);
      for (const u of this.units) if (u.alive && u.s.poison > 0) this.damage(null, u, u.s.poison, { kind: 'poison', source: 'poison', ignoreBlock: true, credit: this.unit(u.links.poison) });
      for (const u of this.units) {
        if (u.alive && u.s.regen > 0) {
          this.heal(u, u, u.s.regen * 2, 'regen');
          this.addStatus(u, 'regen', -1, 'regen', u);
        }
      }
    }

    for (const u of this.units) {
      if (!u.alive || this.over) continue;
      for (const k in u.cd) if (u.cd[k] > 0) u.cd[k]--;
      if (u.cast) {
        if (--u.cast.left <= 0) this.resolveCast(u);
        continue;
      }
      if (u.bar < u.barMax) {
        u.bar = Math.min(u.barMax, u.bar + BAR_STEP + HEAT_STEP * u.s.heat);
        if (u.bar < u.barMax) continue;
      }
      // bar is full: cast the first line that fits, otherwise wait with a full bar
      const pick = u.tm.silence > 0 ? null : this.pickLine(u);
      if (pick) {
        u.bar = 0;
        u.waiting = false;
        this.startCast(u, pick);
      } else if (!u.waiting) {
        u.waiting = true;
        this.emit({ type: 'wait', unit: u.id, silenced: u.tm.silence > 0 });
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

  // Enemies that can legally be singled out: Sanctuary hides, Taunt forces.
  visibleFoes(u) {
    const all = this.enemiesOf(u);
    const shown = all.filter((x) => !x.s.sanctuary);
    const pool = shown.length ? shown : all;
    const taunters = pool.filter((x) => x.tm.taunt > 0);
    return { pool, taunters };
  }

  selectTargets(u, spell, sel, condRes) {
    switch (spell.target) {
      case 'self': return [u];
      case 'passive': return null;
      case 'allEnemies': { const e = this.enemiesOf(u); return e.length ? e : null; }
      case 'allAllies': return this.alliesOf(u);
      case 'deadAlly': {
        const d = this.units.filter((x) => x.side === u.side && !x.alive);
        return d.length ? [d[0]] : null;
      }
      case 'ally': {
        if (sel === 'self') return [u];
        const fromCond = condRes && (condRes.who === 'ally' || condRes.who === 'self') && condRes.pool;
        const pool = fromCond || this.alliesOf(u);
        switch (sel) {
          case 'frontAlly': return this.pick(pool, (x) => -x.slot);
          case 'backAlly': return this.pick(pool, (x) => x.slot);
          case 'mostBurnAlly': return this.pick(pool, (x) => x.s.burn);
          case 'mostPoisonAlly': return this.pick(pool, (x) => x.s.poison);
          default: return this.pick(pool, (x) => -x.hp / x.maxHp);
        }
      }
    }
    // single enemy
    const { pool: visible, taunters } = this.visibleFoes(u);
    if (taunters.length) return [taunters[0]];
    const fromCond = condRes && condRes.who === 'enemy' && condRes.pool;
    const pool = fromCond ? fromCond.filter((x) => visible.includes(x)) : visible;
    if (!pool.length) return null;
    switch (sel) {
      case 'highestHp': return this.pick(pool, (x) => x.hp);
      case 'mostBurn': return this.pick(pool, (x) => x.s.burn);
      case 'leastBurn': return this.pick(pool, (x) => -x.s.burn);
      case 'mostPoison': return this.pick(pool, (x) => x.s.poison);
      case 'mostBlock': return this.pick(pool, (x) => x.s.block);
      case 'front': return this.pick(pool, (x) => -x.slot);
      case 'back': return this.pick(pool, (x) => x.slot);
      default: return this.pick(pool, (x) => -x.hp);
    }
  }

  // Read the spellbook top to bottom; the first line whose condition holds and spell is ready wins.
  pickLine(u) {
    const book = u.spellbook;
    for (let i = 0; i < book.length; i++) {
      const line = book[i];
      const spell = SPELLS[line.spell];
      if (!spell || spell.passive) continue;
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

  startCast(u, pick) {
    const spell = SPELLS[pick.spell];
    const ticks = Math.max(1, sec(spell.cast));
    u.cast = { spell: pick.spell, line: pick.line, sel: pick.sel, targets: pick.targets.map((x) => x.id), left: ticks, total: ticks };
    if (spell.cd) u.cd[pick.spell] = sec(spell.cd);
    if (spell.once) u.used[pick.spell] = true;
    this.emit({ type: 'castStart', unit: u.id, spell: pick.spell, line: pick.line, targets: u.cast.targets, ticks });
  }

  resolveCast(u) {
    const c = u.cast;
    u.cast = null;
    const spell = SPELLS[c.spell];
    let targets;
    if (spell.target === 'enemy' || spell.target === 'ally') {
      targets = c.targets.map((id) => this.unit(id)).filter((x) => x && x.alive);
      if (spell.target === 'enemy') {
        // a taunt that started mid-cast still pulls the spell
        const { taunters } = this.visibleFoes(u);
        if (taunters.length) targets = [taunters[0]];
      }
      if (!targets.length) targets = this.selectTargets(u, spell, c.sel, null);
    } else if (spell.target === 'deadAlly') {
      targets = c.targets.map((id) => this.unit(id)).filter((x) => x && !x.alive);
    } else {
      targets = this.selectTargets(u, spell, c.sel, null);
    }
    if (!targets || !targets.length || (spell.canCast && !spell.canCast(this, u, targets))) {
      return this.emit({ type: 'fizzle', unit: u.id, spell: c.spell });
    }
    this.emit({ type: 'cast', unit: u.id, spell: c.spell, line: c.line, targets: targets.map((x) => x.id) });
    this.stats.units[u.id].casts++;
    if (u.side === 'ally') this.stats.casts[c.spell] = (this.stats.casts[c.spell] || 0) + 1;
    spell.resolve(this, u, targets);
  }

  // ------------------------------------------------------------- effects

  record(src, tgt, source, dmg, blocked) {
    this.stats.units[tgt.id].taken += dmg;
    if (src) this.stats.units[src.id].dealt += dmg;
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
    if (tgt.s.fireShield) this.addStatus(tgt, 'fireShield', -1, 'fireShield', tgt);
    if (this.hasPassive(tgt, 'reprisal')) {
      this.emit({ type: 'reprisal', unit: tgt.id });
      for (const e of this.enemiesOf(tgt)) this.damage(tgt, e, 10, { kind: 'area', source: 'reprisal' });
    }
  }

  // Damage that only touches Block (Melt, Backdraft's removal).
  damageBlock(src, tgt, amount, source) {
    if (!tgt.alive || amount <= 0 || tgt.s.block <= 0) return 0;
    const n = Math.min(amount, tgt.s.block);
    tgt.s.block -= n;
    this.emit({ type: 'damage', src: src?.id, tgt: tgt.id, amount: 0, blocked: n, kind: 'spell', source });
    this.record(src, tgt, source, 0, n);
    if (tgt.s.block === 0) this.breakBlock(tgt);
    return n;
  }

  // Who actually takes a hit aimed at tgt: Bastion first, then Guard.
  protector(tgt, kind) {
    const bastion = this.units.find((x) => x.alive && x !== tgt && x.side === tgt.side && x.tm.bastion > 0);
    if (bastion) return { unit: bastion, scale: 0.7 };
    if ((kind === 'attack' || kind === 'spell') && tgt.tm.guarded > 0) {
      const g = this.unit(tgt.links.guarded);
      if (g && g.alive && g !== tgt) return { unit: g, scale: 1 };
    }
    return null;
  }

  damage(src, tgt, amount, { kind = 'spell', source, ignoreBlock = false, big = false, redirected = false, credit = null } = {}) {
    if (!tgt.alive || amount <= 0) return 0;
    if (src && src.alive && (kind === 'attack' || kind === 'spell') && src.s.empower) amount += src.s.empower;
    if (src && src.s.sanctuary && src.side !== tgt.side) this.addStatus(src, 'sanctuary', -1, 'sanctuary', src);
    if (kind === 'area' && tgt.s.sanctuary) this.addStatus(tgt, 'sanctuary', -1, 'sanctuary', tgt);

    if (!redirected) {
      const p = this.protector(tgt, kind);
      if (p) {
        this.emit({ type: 'redirect', from: tgt.id, tgt: p.unit.id });
        return this.damage(src, p.unit, Math.max(1, Math.ceil(amount * p.scale)), { kind, source, ignoreBlock, big, redirected: true });
      }
      if (tgt.tm.martyr > 0) {
        const m = this.unit(tgt.links.martyr);
        if (m && m.alive && m !== tgt) {
          const half = Math.floor(amount / 2);
          amount -= half;
          if (half > 0) {
            this.emit({ type: 'redirect', from: tgt.id, tgt: m.id });
            this.damage(src, m, half, { kind, source, ignoreBlock, redirected: true });
          }
        }
      }
    }

    const retaliate = kind === 'attack' && src && src.alive && src.side !== tgt.side;
    const shieldHeld = tgt.s.fireShield > 0;
    const spikes = tgt.s.spikes;
    let blocked = 0;
    if (!ignoreBlock && kind !== 'poison' && tgt.s.block > 0) {
      blocked = Math.min(tgt.s.block, amount);
      tgt.s.block -= blocked;
      amount -= blocked;
    }
    tgt.hp -= amount;
    this.emit({ type: 'damage', src: src?.id, tgt: tgt.id, amount, blocked, kind, source, big });
    this.record(src || credit, tgt, source, amount, blocked);
    if (blocked > 0 && tgt.s.block === 0) this.breakBlock(tgt);
    if (retaliate && shieldHeld) this.addStatus(src, 'burn', 2, 'fireShield', tgt);
    if (retaliate && spikes > 0) this.damage(tgt, src, spikes, { kind: 'spikes', source: 'spikes' });
    if (tgt.hp <= 0) this.kill(tgt);
    return amount;
  }

  heal(src, tgt, amount, source) {
    if (!tgt.alive || amount <= 0) return 0;
    if (src !== tgt && this.hasPassive(src, 'plagueSaint')) {
      const e = this.selectTargets(src, SPELLS.smite, 'lowestHp', null)?.[0];
      this.emit({ type: 'plague', src: src.id, tgt: e?.id, amount });
      if (e) this.addStatus(e, 'poison', amount, 'plagueSaint', src);
      return 0;
    }
    const healed = Math.min(amount, tgt.maxHp - tgt.hp);
    const over = amount - healed;
    tgt.hp += healed;
    this.emit({ type: 'heal', src: src.id, tgt: tgt.id, amount: healed, over, source });
    this.stats.units[src.id].healed += healed;
    if (healed > 0) this.healLog[src.side].push({ t: this.t, n: healed });
    if (over > 0 && source !== 'regen' && this.hasPassive(src, 'mercy')) this.addStatus(tgt, 'block', Math.min(20, over), 'mercy', src);
    if (this.consecrate[tgt.side] > 0 && source !== 'regen') this.addStatus(tgt, 'block', 2, 'consecrate', src);
    if (healed > 0 && this.hasPassive(tgt, 'emberSaint')) {
      const e = this.selectTargets(tgt, SPELLS.kindle, 'lowestHp', null)?.[0];
      if (e) this.addStatus(e, 'burn', healed, 'emberSaint', tgt);
    }
    return healed;
  }

  recentHealing(side) {
    const from = this.t - sec(5);
    const log = this.healLog[side];
    while (log.length && log[0].t <= from) log.shift();
    return log.reduce((a, h) => a + h.n, 0);
  }

  addStatus(tgt, key, n, source, by = null) {
    if (!tgt.alive || n === 0) return;
    if (n > 0 && STATUSES[key].debuff && by && by.side !== tgt.side && tgt.s.ward > 0) {
      tgt.s.ward--;
      this.emit({ type: 'status', tgt: tgt.id, key: 'ward', delta: -1, value: tgt.s.ward, source: 'ward' });
      this.emit({ type: 'warded', tgt: tgt.id, key });
      return;
    }
    if (key === 'block' && n > 0 && this.hasPassive(tgt, 'lastStand') && tgt.hp * 10 < tgt.maxHp * 3) n *= 2;
    const before = tgt.s[key];
    tgt.s[key] = Math.max(0, before + n);
    const delta = tgt.s[key] - before;
    if (delta === 0) return;
    if (key === 'block' && delta > 0) this.stats.units[tgt.id].blocked += delta;
    if ((key === 'burn' || key === 'poison') && delta > 0 && by && by.side !== tgt.side) tgt.links[key] = by.id;
    this.emit({ type: 'status', tgt: tgt.id, key, delta, value: tgt.s[key], source });
    if (key === 'burn' && tgt.side === 'enemy' && tgt.s.burn > this.stats.peakBurn) this.stats.peakBurn = tgt.s.burn;
  }

  setTimer(tgt, key, ticks, by) {
    if (!tgt.alive) return;
    tgt.tm[key] = ticks;
    tgt.links[key] = by.id;
    this.emit({ type: 'timer', tgt: tgt.id, key, on: true, by: by.id });
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
    this.damage(null, u, n, { kind: 'burn', source: 'burn', ignoreBlock, credit: this.unit(u.links.burn) });
  }

  passSource(c, target) {
    return this.pick(this.enemiesOf(c).filter((x) => x !== target && x.s.burn > 0), (x) => x.s.burn)?.[0];
  }

  startInferno(c, ticks) {
    const side = c.side === 'ally' ? 'enemy' : 'ally';
    this.inferno[side] = ticks;
    this.emit({ type: 'inferno', side, on: true });
  }

  kill(u) {
    if (u.s.phoenix) {
      u.hp = 1;
      this.addStatus(u, 'phoenix', -1, 'phoenixAsh', u);
      this.emit({ type: 'phoenix', tgt: u.id });
      const burn = Math.floor(u.maxHp / 5);
      for (const e of this.enemiesOf(u)) this.addStatus(e, 'burn', burn, 'phoenixAsh', u);
      return;
    }
    u.hp = 0;
    u.alive = false;
    u.cast = null;
    u.bar = 0;
    u.waiting = false;
    this.emit({ type: 'death', tgt: u.id });
    if (u.side === 'enemy') this.stats.kills++;
    if (u.def.respawn) u.respawnIn = sec(2);
    if (!this.units.some((x) => x.side === 'ally' && x.alive)) {
      this.over = 'defeat';
      this.emit({ type: 'over', result: 'defeat' });
    }
  }

  reset(u) {
    u.s = freshStatuses();
    u.tm = freshTimers();
    u.links = {};
    u.bar = 0;
    u.cast = null;
    u.waiting = false;
  }

  revive(u, frac) {
    if (u.alive) return;
    this.reset(u);
    u.alive = true;
    u.hp = Math.max(1, Math.floor(u.maxHp * frac));
    this.emit({ type: 'revive', tgt: u.id });
  }

  respawn(u) {
    this.reset(u);
    u.alive = true;
    u.hp = u.maxHp;
    u.cd = {};
    u.used = {};
    this.emit({ type: 'respawn', tgt: u.id });
  }
}
