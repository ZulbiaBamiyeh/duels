// All DOM UI outside the 3D stage: unit cards, spellbook editor, pickers, dummy settings, report.

import {
  SPELLS, PLAYER_SPELLS, RARITY, STATUSES, TARGETS, COND_WHO, COND_STAT, COND_CMP, COND_VALUES,
  condLabel, targetLabel, defaultTarget, sourceName, sec, TPS,
} from '../sim/data.js';
import { PRESETS, MAX_LINES, DUMMY_NAMES, SLOT_NAMES, clonePreset } from '../sim/party.js';
import { iconImg } from '../art/icons.js';
import { drawMage } from '../art/mage.js';
import { drawDummy } from '../art/dummy.js';
import { Raster } from '../art/raster.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function crop(src, x, y, w, h) {
  const r = new Raster(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) r.set(i, j, src.get(x + i, y + j));
  return r;
}
const portraitURL = {
  mage: () => crop(drawMage({}), 14, 0, 30, 30).toCanvas(1).toDataURL(),
  dummy: (v) => crop(drawDummy(v), 8, 2, 24, 24).toCanvas(1).toDataURL(),
};

const SPELL_ICON = (id) => (id === 'attack' ? 'attack' : SPELLS[id]?.icon ?? 'flame');

export class UI {
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
    this.battle = null;
    this.log = [];
    this.lastReport = 0;

    this.heroEl = $('#heroCard');
    this.stripEl = $('#enemyStrip');
    this.linesEl = $('#lines');
    this.sheetEl = $('#sheet');
    this.sheetBody = $('.sheet-body', this.sheetEl);

    this.mageImg = portraitURL.mage();
    this.dummyImg = [0, 1, 2].map(portraitURL.dummy);
    $('#brandMark').src = this.mageImg;

    this.bindTabs();
    this.bindSheet();
    this.renderBook();
    this.renderDummies();

    $('#addLine').addEventListener('click', () => {
      if (this.state.book.length >= MAX_LINES) return;
      this.state.book.push({ cond: null, spell: 'firebolt', target: 'lowestHp' });
      this.bookChanged();
    });
    $('#presetBtn').addEventListener('click', () => this.openPresets());
  }

  // ------------------------------------------------------------ battle binding

  bind(battle) {
    this.battle = battle;
    this.log = [];
    this.renderHero();
    this.renderStrip();
    this.renderReport(true);
    $('#defeat').hidden = true;
  }

  onEvents(evs) {
    const b = this.battle;
    for (const e of evs) {
      const u = e.unit && b.unit(e.unit);
      switch (e.type) {
        case 'castStart':
          if (u.side === 'ally' && e.line >= 0) this.flashLine(e.line);
          break;
        case 'cast': {
          const tgts = e.targets.map((id) => b.unit(id)?.name).filter(Boolean);
          const who = u.side === 'ally' ? 'Fire Mage' : u.name;
          const what = e.spell === 'attack' ? (u.def.weapon?.name ?? 'Attack') : SPELLS[e.spell].name;
          const lineTag = e.line >= 0 && u.side === 'ally' ? `<b class="lg-line">${e.line + 1}</b>` : '';
          const tgt = SPELLS[e.spell]?.target === 'self' ? '' : ` → ${[...new Set(tgts)].join(', ')}`;
          this.pushLog(e.t, `${lineTag}${esc(who)} · <span class="lg-spell">${esc(what)}</span>${esc(tgt)}`, u.side === 'ally' ? '' : 'lg-enemy');
          break;
        }
        case 'fizzle':
          this.pushLog(e.t, `${esc(u.name)}'s ${esc(SPELLS[e.spell]?.name ?? 'attack')} fizzled (target lost)`, 'lg-muted');
          break;
        case 'blockBreak':
          this.pushLog(e.t, `${esc(b.unit(e.tgt).name)}'s Block shattered`, 'lg-block');
          break;
        case 'death':
          this.pushLog(e.t, `${esc(b.unit(e.tgt).name)} is down`, 'lg-burn');
          break;
        case 'respawn':
          this.pushLog(e.t, `${esc(b.unit(e.tgt).name)} is back up`, 'lg-muted');
          break;
        case 'inferno':
          if (e.side === 'enemy') this.pushLog(e.t, e.on ? 'Inferno: enemy Burn ignores Block' : 'Inferno ended', 'lg-burn');
          break;
        case 'phoenix':
          this.pushLog(e.t, `Phoenix Ash saved ${esc(b.unit(e.tgt).name)} at 1 HP`, 'lg-gold');
          break;
        case 'over':
          this.showDefeat();
          break;
      }
    }
  }

  pushLog(t, html, cls = '') {
    this.log.push({ t: t / TPS, html, cls });
    if (this.log.length > 80) this.log.shift();
    this.logDirty = true;
  }

  // Called every animation frame.
  frame() {
    const b = this.battle;
    if (!b) return;
    $('#clock').textContent = fmtTime(b.time);
    $('#dpsTop').textContent = `${(b.stats.total / Math.max(1, b.time)).toFixed(1)} dps`;
    this.updateHero();
    this.updateStrip();
    this.updateBookLive();
    const now = performance.now();
    if (now - this.lastReport > 300) {
      this.lastReport = now;
      this.renderReport();
    }
  }

  // ------------------------------------------------------------ hero + enemy cards

  statusChips(u, compact = false) {
    const out = [];
    for (const [k, meta] of Object.entries(STATUSES)) {
      const n = u.s[k];
      if (!n) continue;
      const label = meta.flag ? (compact ? '' : esc(meta.name)) : n;
      out.push(`<span class="chip tone-${meta.tone}${label === '' ? ' chip-flag' : ''}" title="${esc(meta.name)}: ${esc(meta.text)}">${iconImg(meta.icon)}${label}</span>`);
    }
    return out.join('');
  }

  renderHero() {
    const u = this.battle.units.find((x) => x.side === 'ally');
    this.hero = u;
    this.heroEl.innerHTML = `
      <img class="portrait" src="${this.mageImg}" alt="">
      <div class="hero-main">
        <div class="hero-top">
          <span class="hero-name">Fire Mage</span>
          <span class="hero-hp tnum"></span>
        </div>
        <div class="bar bar-hp"><i class="fill"></i><i class="block"></i></div>
        <div class="bar bar-act"><i class="fill"></i><span class="act-label"></span></div>
        <div class="chips"></div>
      </div>`;
    this.heroRefs = {
      hp: $('.hero-hp', this.heroEl),
      hpFill: $('.bar-hp .fill', this.heroEl),
      blockFill: $('.bar-hp .block', this.heroEl),
      act: $('.bar-act', this.heroEl),
      actFill: $('.bar-act .fill', this.heroEl),
      actLabel: $('.act-label', this.heroEl),
      chips: $('.chips', this.heroEl),
    };
  }

  updateHero() {
    const u = this.hero;
    const r = this.heroRefs;
    r.hp.textContent = `${Math.max(0, u.hp)} / ${u.maxHp}`;
    r.hpFill.style.width = `${(Math.max(0, u.hp) / u.maxHp) * 100}%`;
    r.blockFill.style.width = `${Math.min(1, u.s.block / u.maxHp) * 100}%`;
    let label = '';
    if (u.cast) {
      const p = 1 - u.cast.left / u.cast.total;
      r.actFill.style.width = `${p * 100}%`;
      r.act.classList.add('is-casting');
      label = u.cast.spell === 'attack' ? 'Ember Flick' : `${u.cast.line + 1} · ${SPELLS[u.cast.spell].name}`;
    } else {
      r.actFill.style.width = `${(u.bar / u.barMax) * 100}%`;
      r.act.classList.remove('is-casting');
      label = u.s.heat ? `Heat +${u.s.heat * 10}% speed` : '';
    }
    if (r.actLabel.textContent !== label) r.actLabel.textContent = label;
    const chips = this.statusChips(u);
    if (chips !== r.chipsHtml) {
      r.chips.innerHTML = chips || '<span class="chip chip-none">No statuses</span>';
      r.chipsHtml = chips;
    }
  }

  renderStrip() {
    const foes = this.battle.units.filter((x) => x.side === 'enemy');
    this.foes = foes;
    this.stripEl.style.setProperty('--cols', foes.length);
    this.stripEl.classList.toggle('is-compact', foes.length > 1);
    this.stripEl.innerHTML = foes
      .map(
        (u) => `
      <div class="foe" data-id="${u.id}">
        <div class="foe-top"><img class="foe-face" src="${this.dummyImg[u.def.variant]}" alt=""><span class="foe-name">${esc(u.name)}</span><span class="foe-slot">${SLOT_NAMES[u.slot]}</span></div>
        <div class="bar bar-hp"><i class="fill"></i><i class="block"></i><span class="bar-num tnum"></span></div>
        <div class="chips"></div>
      </div>`,
      )
      .join('');
    this.foeRefs = foes.map((u) => {
      const el = this.stripEl.querySelector(`[data-id="${u.id}"]`);
      return { el, fill: $('.fill', el), block: $('.block', el), num: $('.bar-num', el), chips: $('.chips', el), html: null };
    });
  }

  updateStrip() {
    this.foes.forEach((u, i) => {
      const r = this.foeRefs[i];
      r.fill.style.width = `${(Math.max(0, u.hp) / u.maxHp) * 100}%`;
      r.block.style.width = `${Math.min(1, u.s.block / u.maxHp) * 100}%`;
      const txt = u.alive ? `${u.hp}${u.s.block ? ` +${u.s.block}` : ''}` : 'down';
      if (r.num.textContent !== txt) r.num.textContent = txt;
      r.el.classList.toggle('is-dead', !u.alive);
      const chips = this.statusChips(u, this.foes.length > 1);
      if (chips !== r.html) {
        r.chips.innerHTML = chips;
        r.html = chips;
      }
    });
  }

  showDefeat() {
    const d = $('#defeat');
    const b = this.battle;
    $('.defeat-sub', d).textContent = `Lasted ${fmtTime(b.time)} · ${b.stats.total} damage dealt`;
    d.hidden = false;
  }

  // ------------------------------------------------------------ tabs

  bindTabs() {
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    const pick = (name) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      document.querySelectorAll('.panel > section').forEach((s) => (s.hidden = s.dataset.tab !== name));
      try { localStorage.setItem('sb.tab', name); } catch {}
      if (name === 'report') this.renderReport(true);
    };
    tabs.forEach((t) => t.addEventListener('click', () => pick(t.dataset.tab)));
    let saved = 'book';
    try { saved = localStorage.getItem('sb.tab') || 'book'; } catch {}
    pick(tabs.some((t) => t.dataset.tab === saved) ? saved : 'book');
  }

  // ------------------------------------------------------------ spellbook

  bookChanged() {
    this.renderBook();
    this.hooks.onBookChange();
  }

  renderBook() {
    const book = this.state.book;
    this.linesEl.innerHTML = book
      .map((l, i) => {
        const sp = SPELLS[l.spell];
        const cond = l.cond
          ? `<span class="kw">If</span>${esc(condLabel(l.cond))}`
          : `<span class="kw kw-else">Otherwise</span>`;
        return `
        <li class="line" data-i="${i}">
          <div class="line-rail">
            <span class="line-num">${i + 1}</span>
            <button class="grip" aria-label="Drag line ${i + 1} to reorder"><i></i><i></i><i></i></button>
          </div>
          <div class="line-body">
            <button class="tile tile-cond" data-act="cond">${cond}</button>
            <div class="line-row">
              <button class="tile tile-spell rar-${sp.rarity}" data-act="spell">${iconImg(sp.icon)}<span class="nm">${esc(sp.name)}</span><span class="cd tnum">${sp.once ? 'once' : sp.cd + 's'}</span><i class="cdbar"></i></button>
              <span class="arrow" aria-hidden="true"></span>
              <button class="tile tile-target" data-act="target">${esc(targetLabel(l.spell, l.target))}</button>
            </div>
          </div>
          <button class="line-del" data-act="del" aria-label="Remove line ${i + 1}">×</button>
        </li>`;
      })
      .join('');
    $('#lineCount').textContent = `${book.length} / ${MAX_LINES} lines`;
    $('#addLine').disabled = book.length >= MAX_LINES;
    this.linesEl.querySelectorAll('.line').forEach((li) => {
      const i = Number(li.dataset.i);
      li.addEventListener('click', (ev) => {
        const act = ev.target.closest('[data-act]')?.dataset.act;
        if (act === 'cond') this.openCond(i);
        else if (act === 'spell') this.openSpell(i);
        else if (act === 'target') this.openTarget(i);
        else if (act === 'del') {
          this.state.book.splice(i, 1);
          this.bookChanged();
        }
      });
      this.bindDrag(li, i);
    });
    this.lineRefs = [...this.linesEl.querySelectorAll('.line')].map((li) => ({ li, bar: $('.cdbar', li), tile: $('.tile-spell', li) }));
  }

  bindDrag(li, from) {
    const grip = $('.grip', li);
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      grip.setPointerCapture(ev.pointerId);
      li.classList.add('is-dragging');
      const list = this.linesEl;
      const startY = ev.clientY;
      let to = from;
      const move = (e) => {
        const items = [...list.children];
        const others = items.filter((x) => x !== li);
        li.style.transform = `translateY(${e.clientY - startY}px)`;
        to = others.length;
        for (let k = 0; k < others.length; k++) {
          const r = others[k].getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { to = k; break; }
        }
        others.forEach((o, k) => o.classList.toggle('drop-above', k === to));
        list.classList.toggle('drop-end', to === others.length);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        li.classList.remove('is-dragging');
        li.style.transform = '';
        this.linesEl.classList.remove('drop-end');
        if (to !== from) {
          const [l] = this.state.book.splice(from, 1);
          this.state.book.splice(to, 0, l);
          this.bookChanged();
        } else this.renderBook();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  flashLine(i) {
    const r = this.lineRefs?.[i];
    if (!r) return;
    r.li.classList.remove('is-cast');
    void r.li.offsetWidth;
    r.li.classList.add('is-cast');
  }

  updateBookLive() {
    const u = this.hero;
    if (!u || !this.lineRefs) return;
    this.state.book.forEach((l, i) => {
      const r = this.lineRefs[i];
      if (!r) return;
      const sp = SPELLS[l.spell];
      let k = 0;
      if (sp.once && u.used[l.spell]) k = 1;
      else if (sp.cd) k = (u.cd[l.spell] || 0) / sec(sp.cd);
      r.bar.style.transform = `scaleX(${k.toFixed(3)})`;
      r.tile.classList.toggle('is-spent', sp.once && !!u.used[l.spell]);
    });
  }

  // ------------------------------------------------------------ bottom sheet pickers

  bindSheet() {
    this.sheetEl.addEventListener('click', (e) => {
      if (e.target.closest('.sheet-backdrop') || e.target.closest('.sheet-done')) this.closeSheet();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !this.sheetEl.hidden && this.closeSheet());
  }

  openSheet(title, html, onClick) {
    $('.sheet h2', this.sheetEl).textContent = title;
    this.sheetBody.innerHTML = html;
    this.sheetBody.onclick = onClick;
    this.sheetEl.hidden = false;
    requestAnimationFrame(() => this.sheetEl.classList.add('open'));
    this.sheetBody.scrollTop = 0;
  }

  closeSheet() {
    this.sheetEl.classList.remove('open');
    setTimeout(() => (this.sheetEl.hidden = true), 180);
  }

  openSpell(i) {
    const line = this.state.book[i];
    const groups = Object.keys(RARITY)
      .map((r) => {
        const items = PLAYER_SPELLS.filter((k) => SPELLS[k].rarity === r);
        return `<h3 class="rar-head rar-${r}">${RARITY[r].label}</h3>` + items
          .map((k) => {
            const s = SPELLS[k];
            return `<button class="opt spell-opt rar-${s.rarity} ${k === line.spell ? 'is-on' : ''}" data-v="${k}">
              ${iconImg(s.icon, 'px-icon px-icon-lg')}
              <span class="opt-main"><span class="opt-title">${esc(s.name)}<span class="opt-meta tnum">${s.once ? 'once per fight' : `${s.cd}s cooldown`} · ${s.cast}s cast</span></span>
              <span class="opt-text">${esc(s.text)}</span>${s.hint ? `<span class="opt-hint">${esc(s.hint)}</span>` : ''}</span>
            </button>`;
          })
          .join('');
      })
      .join('');
    this.openSheet(`Line ${i + 1} · Spell`, `<div class="opt-list">${groups}</div>`, (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      line.spell = b.dataset.v;
      const kind = SPELLS[line.spell].target;
      if (!TARGETS[kind].some(([k]) => k === line.target)) line.target = defaultTarget(line.spell);
      this.bookChanged();
      this.closeSheet();
    });
  }

  openTarget(i) {
    const line = this.state.book[i];
    const kind = SPELLS[line.spell].target;
    const opts = TARGETS[kind];
    const note = line.cond && ((line.cond.who === 'enemy' && kind === 'enemy') || (line.cond.who !== 'enemy' && kind === 'ally'))
      ? `<p class="sheet-note">Picks from the units that matched this line's condition (${esc(condLabel(line.cond))}).</p>`
      : opts.length === 1 ? `<p class="sheet-note">${esc(SPELLS[line.spell].name)} always targets ${esc(opts[0][1])}.</p>` : '';
    this.openSheet(`Line ${i + 1} · Target`, `${note}<div class="opt-list">${opts
      .map(([k, label]) => `<button class="opt ${k === line.target ? 'is-on' : ''}" data-v="${k}"><span class="opt-title">${esc(label)}</span></button>`)
      .join('')}</div>`, (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      line.target = b.dataset.v;
      this.bookChanged();
      this.closeSheet();
    });
  }

  openCond(i) {
    const line = this.state.book[i];
    const draft = line.cond ? { ...line.cond } : { who: 'enemy', stat: 'burn', cmp: 'gte', val: 10 };
    let otherwise = !line.cond;
    const chips = (name, list, cur) =>
      `<div class="chips-pick">${list.map(([k, l]) => `<button class="pick ${String(k) === String(cur) ? 'is-on' : ''}" data-k="${name}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
    const render = () => {
      const vals = COND_VALUES[draft.stat];
      if (!vals.includes(draft.val)) draft.val = vals[Math.floor(vals.length / 2)];
      const html = `
        <div class="cond-preview">${otherwise ? '<span class="kw kw-else">Otherwise</span> always fits' : `<span class="kw">If</span>${esc(condLabel(draft))}`}</div>
        <button class="opt opt-else ${otherwise ? 'is-on' : ''}" data-k="else"><span class="opt-title">Otherwise</span><span class="opt-text">Always true. Use it as the last line, or to make a spell fire whenever it is off cooldown.</span></button>
        <div class="cond-build ${otherwise ? 'is-off' : ''}">
          <h3>Who</h3>${chips('who', COND_WHO, draft.who)}
          <h3>Has</h3>${chips('stat', COND_STAT, draft.stat)}
          <h3>Compare</h3>${chips('cmp', COND_CMP.map(([k, l]) => [k, k === 'lt' ? `${l} less than` : `${l} at least`]), draft.cmp)}
          <h3>Value</h3>${chips('val', vals.map((v) => [v, draft.stat === 'hp' ? `${v}%` : v]), draft.val)}
        </div>`;
      this.sheetBody.innerHTML = html;
    };
    this.openSheet(`Line ${i + 1} · Condition`, '', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || !b.dataset.k) return;
      const k = b.dataset.k;
      if (k === 'else') otherwise = !otherwise;
      else {
        otherwise = false;
        draft[k] = k === 'val' ? Number(b.dataset.v) : b.dataset.v;
      }
      line.cond = otherwise ? null : { ...draft };
      render();
      this.bookChanged();
    });
    render();
  }

  openPresets() {
    this.openSheet('Spellbook presets', `<p class="sheet-note">Loading a preset replaces your current lines. The fight keeps running.</p><div class="opt-list">${PRESETS.map(
      (p) => `<button class="opt" data-v="${p.id}"><span class="opt-title">${esc(p.name)}</span><span class="opt-text">${esc(p.note)}</span>
        <span class="preset-icons">${p.lines.map((l) => iconImg(SPELLS[l.spell].icon)).join('')}</span></button>`,
    ).join('')}</div>`, (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      this.state.book = clonePreset(b.dataset.v);
      this.bookChanged();
      this.closeSheet();
    });
  }

  // ------------------------------------------------------------ dummies

  renderDummies() {
    const d = this.state.dummies;
    const seg = (name, vals, cur, fmt = (v) => v) =>
      `<div class="seg" role="group">${vals.map((v) => `<button data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${fmt(v)}</button>`).join('')}</div>`;
    const cards = d.list
      .slice(0, d.count)
      .map(
        (o, i) => `
      <div class="dummy-card">
        <img class="dummy-face" src="${this.dummyImg[i]}" alt="">
        <div class="dummy-main">
          <div class="dummy-name">${DUMMY_NAMES[i]} <span>${SLOT_NAMES[i]} slot</span></div>
          <button class="toggle" data-k="shield" data-i="${i}" aria-pressed="${o.shield}"><i></i><span><b>Braces</b> Gains 12 Block every 5s</span></button>
          <button class="toggle" data-k="strike" data-i="${i}" aria-pressed="${o.strike}"><i></i><span><b>Strikes back</b> Hits the Fire Mage for 4–6</span></button>
        </div>
      </div>`,
      )
      .join('');
    $('#dummyForm').innerHTML = `
      <div class="field"><span class="field-label">Dummies</span>${seg('count', [1, 2, 3], d.count)}</div>
      <div class="field"><span class="field-label">Max HP each</span>${seg('hp', [200, 500, 1000], d.hp)}</div>
      <div class="dummy-list">${cards}</div>`;
    $('#dummyForm').onclick = (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if (k === 'count' || k === 'hp') d[k] = Number(b.dataset.v);
      else d.list[Number(b.dataset.i)][k] = b.getAttribute('aria-pressed') !== 'true';
      this.renderDummies();
      this.hooks.onDummyChange();
    };
  }

  // ------------------------------------------------------------ report

  renderReport(force = false) {
    const sec = $('[data-tab="report"]');
    if (!force && sec.hidden) return;
    const b = this.battle;
    if (!b) return;
    const st = b.stats;
    const t = Math.max(1, b.time);
    $('#kpis').innerHTML = [
      ['Damage', st.total, 'burn'],
      ['DPS', (st.total / t).toFixed(1), 'burn'],
      ['Block broken', st.blockDmg, 'block'],
      ['Peak Burn', st.peakBurn, 'burn'],
      ['Shields shattered', st.shattered, 'block'],
      ['Dummies downed', st.kills, 'gold'],
    ]
      .map(([k, v, tone]) => `<div class="kpi tone-${tone}"><span class="kpi-v tnum">${v}</span><span class="kpi-k">${k}</span></div>`)
      .join('');
    const rows = Object.entries(st.bySource)
      .map(([k, r]) => ({ k, ...r, total: r.dmg + r.block }))
      .sort((a, b2) => b2.total - a.total);
    const max = Math.max(1, ...rows.map((r) => r.total));
    $('#sources').innerHTML = rows.length
      ? rows
          .map((r) => {
            const icon = r.k === 'burn' ? 'flame' : r.k === 'attack' ? 'attack' : SPELL_ICON(r.k);
            const casts = st.casts[r.k];
            return `<div class="src">
            ${iconImg(icon)}
            <span class="src-name">${esc(sourceName(r.k))}${casts ? `<em class="tnum">×${casts}</em>` : ''}</span>
            <span class="src-v tnum">${r.dmg}${r.block ? `<em> +${r.block} block</em>` : ''}</span>
            <span class="src-bar"><i style="width:${(r.dmg / max) * 100}%"></i><i class="b" style="width:${(r.block / max) * 100}%"></i></span>
          </div>`;
          })
          .join('')
      : '<p class="empty">No damage yet. Press play and the Fire Mage starts reading her spellbook.</p>';
    if (this.logDirty || force) {
      this.logDirty = false;
      $('#log').innerHTML = this.log
        .slice()
        .reverse()
        .map((l) => `<li class="${l.cls}"><time class="tnum">${fmtTime(l.t)}</time><span>${l.html}</span></li>`)
        .join('');
    }
    $('#seed').textContent = `Seed ${b.seed}. The same seed, spellbook and dummies always replay the same fight.`;
  }
}
