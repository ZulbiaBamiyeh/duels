// All DOM UI outside the 3D stage: spellbook editor (left), party cards (bottom), status / setup /
// report panel (right), pickers in a bottom sheet.

import {
  SPELLS, CHARACTERS, RARITY, STATUSES, TIMERS, TARGETS, COND_WHO, COND_STAT, COND_CMP, COND_VALUES,
  condLabel, targetLabel, defaultTarget, sourceName, spellsOf, sec, TPS,
} from '../sim/data.js';
import { PRESETS, MAX_LINES, DUMMY_NAMES, SLOT_NAMES, presetLines } from '../sim/party.js';
import { iconImg } from '../art/icons.js';
import { drawMage } from '../art/mage.js';
import { drawCleric } from '../art/cleric.js';
import { drawTank } from '../art/tank.js';
import { drawDummy } from '../art/dummy.js';
import { Raster } from '../art/raster.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function crop(src, x, y, w, h) {
  const r = new Raster(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) r.set(i, j, src.get(x + i, y + j));
  return r.toCanvas(1).toDataURL();
}
const PORTRAITS = {
  mage: () => crop(drawMage('idle'), 24, 12, 44, 44),
  cleric: () => crop(drawCleric('idle'), 24, 14, 44, 44),
  tank: () => crop(drawTank('idle'), 24, 14, 44, 44),
  dummy: (v) => crop(drawDummy(v), 16, 4, 48, 48),
};

export class UI {
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
    this.battle = null;
    this.log = [];
    this.lastSlow = 0;
    this.kind = state.party.formation[1] || 'mage'; // spellbook being edited
    this.focus = null; // unit id shown in the status panel

    this.img = {
      mage: PORTRAITS.mage(), cleric: PORTRAITS.cleric(), tank: PORTRAITS.tank(),
      dummy: [0, 1, 2].map(PORTRAITS.dummy),
    };
    $('#brandMark').src = this.img.mage;

    this.linesEl = $('#lines');
    this.sheetEl = $('#sheet');
    this.sheetBody = $('.sheet-body', this.sheetEl);

    this.bindTabs();
    this.bindSheet();
    this.renderUnitTabs();
    this.renderBook();
    this.renderSetup();

    $('#addLine').addEventListener('click', () => {
      const book = this.book();
      if (book.length >= MAX_LINES) return;
      const basic = spellsOf(this.kind).find((k) => SPELLS[k].basic);
      book.push({ cond: null, spell: basic, target: 'front' });
      this.bookChanged();
    });
    $('#presetBtn').addEventListener('click', () => this.openPresets());
  }

  book() {
    return this.state.party.books[this.kind];
  }
  img4(u) {
    return u.kind === 'dummy' ? this.img.dummy[u.def.variant] : this.img[u.kind];
  }

  // ------------------------------------------------------------ battle binding

  bind(battle) {
    this.battle = battle;
    this.log = [];
    const ally = battle.units.find((u) => u.kind === this.kind && u.side === 'ally');
    if (!this.focus || !battle.unit(this.focus)) this.focus = ally?.id;
    this.renderParty();
    this.renderStrip();
    this.renderRoster();
    this.renderStatus(true);
    this.renderReport(true);
    $('#defeat').hidden = true;
    this.hooks.onSelect(this.focus);
  }

  // Select a unit (from the stage, a card, the roster).
  select(id) {
    const u = this.battle.unit(id);
    if (!u) return;
    this.focus = id;
    if (u.side === 'ally' && u.kind !== this.kind) {
      this.kind = u.kind;
      this.renderUnitTabs();
      this.renderBook();
    }
    this.renderStatus(true);
    this.renderRoster();
    this.updateParty(true);
    this.hooks.onSelect(id);
  }

  onEvents(evs) {
    const b = this.battle;
    for (const e of evs) {
      const u = e.unit && b.unit(e.unit);
      switch (e.type) {
        case 'castStart':
          if (u.side === 'ally' && u.kind === this.kind) this.flashLine(e.line);
          break;
        case 'cast': {
          const sp = SPELLS[e.spell];
          const tg = [...new Set(e.targets.map((id) => b.unit(id)?.name).filter(Boolean))];
          const tgt = sp.target === 'self' ? '' : ` → ${tg.join(', ')}`;
          const tag = u.side === 'ally' ? `<b class="lg-line">${e.line + 1}</b>` : '';
          this.pushLog(e.t, `${tag}${esc(u.name)} · <span class="lg-spell">${esc(sp.name)}</span>${esc(tgt)}`, u.side === 'ally' ? `lg-${u.kind}` : 'lg-enemy');
          break;
        }
        case 'wait': {
          const w = b.unit(e.unit);
          if (w.side === 'ally') this.pushLog(e.t, `${esc(w.name)} is waiting: ${e.silenced ? 'silenced' : 'no line fits'}`, 'lg-muted');
          break;
        }
        case 'fizzle': this.pushLog(e.t, `${esc(u.name)}'s ${esc(SPELLS[e.spell].name)} fizzled`, 'lg-muted'); break;
        case 'blockBreak': this.pushLog(e.t, `${esc(b.unit(e.tgt).name)}'s Block shattered`, 'lg-block'); break;
        case 'death': this.pushLog(e.t, `${esc(b.unit(e.tgt).name)} is down`, 'lg-burn'); break;
        case 'revive': this.pushLog(e.t, `${esc(b.unit(e.tgt).name)} was resurrected`, 'lg-gold'); break;
        case 'warded': this.pushLog(e.t, `Ward stopped ${esc(STATUSES[e.key].name)} on ${esc(b.unit(e.tgt).name)}`, 'lg-gold'); break;
        case 'inferno': if (e.side === 'enemy') this.pushLog(e.t, e.on ? 'Inferno: enemy Burn ignores Block' : 'Inferno ended', 'lg-burn'); break;
        case 'phoenix': this.pushLog(e.t, `Phoenix Ash saved ${esc(b.unit(e.tgt).name)}`, 'lg-gold'); break;
        case 'reprisal': this.pushLog(e.t, 'Reprisal hit every enemy for 10', 'lg-block'); break;
        case 'over': this.showDefeat(); break;
      }
    }
  }

  pushLog(t, html, cls = '') {
    this.log.push({ t: t / TPS, html, cls });
    if (this.log.length > 120) this.log.shift();
    this.logDirty = true;
  }

  frame() {
    const b = this.battle;
    if (!b) return;
    $('#clock').textContent = fmtTime(b.time);
    $('#dpsTop').textContent = `${(b.stats.total / Math.max(1, b.time)).toFixed(1)} dps`;
    this.updateParty();
    this.updateStrip();
    this.updateBookLive();
    const now = performance.now();
    if (now - this.lastSlow > 250) {
      this.lastSlow = now;
      this.renderStatus();
      this.renderReport();
      this.updateRoster();
    }
  }

  // ------------------------------------------------------------ shared bits

  chips(u, { compact = false } = {}) {
    const out = [];
    for (const [k, meta] of Object.entries(STATUSES)) {
      const n = u.s[k];
      if (!n) continue;
      const label = meta.flag ? (compact ? '' : esc(meta.name)) : n;
      out.push(`<span class="chip tone-${meta.tone}" title="${esc(meta.name)}: ${esc(meta.text)}">${iconImg(meta.icon)}${label}</span>`);
    }
    for (const [k, meta] of Object.entries(TIMERS)) {
      const n = u.tm[k];
      if (!n) continue;
      out.push(`<span class="chip tone-${meta.tone}" title="${esc(meta.name)}: ${esc(meta.text)}">${iconImg(meta.icon)}${compact ? '' : esc(meta.name) + ' '}${Math.ceil(n / TPS)}s</span>`);
    }
    return out.join('');
  }

  actionText(u) {
    if (!u.alive) return { text: 'Down', cls: 'is-down', p: 0 };
    if (u.cast) {
      const sp = SPELLS[u.cast.spell];
      const tag = u.side === 'ally' ? `${u.cast.line + 1} · ` : '';
      return { text: `${tag}${sp.name}`, cls: 'is-casting', p: 1 - u.cast.left / u.cast.total };
    }
    if (u.waiting) return { text: u.tm.silence > 0 ? 'Silenced' : 'Waiting: no line fits', cls: 'is-waiting', p: 1 };
    return { text: u.s.heat ? `Heat +${u.s.heat * 10}%` : '', cls: '', p: u.bar / u.barMax };
  }

  // ------------------------------------------------------------ party cards (bottom)

  renderParty() {
    const allies = this.battle.units.filter((u) => u.side === 'ally').slice().reverse(); // back .. front, like the stage
    const el = $('#partyCards');
    el.innerHTML = allies
      .map((u) => {
        const c = CHARACTERS[u.kind];
        return `<button class="pcard k-${u.kind}" data-id="${u.id}">
          <img class="pc-face" src="${this.img[u.kind]}" alt="">
          <span class="pc-main">
            <span class="pc-top"><span class="pc-name">${esc(c.name)}</span><span class="pc-slot">${SLOT_NAMES[u.slot]}</span></span>
            <span class="bar bar-hp"><i class="fill"></i><i class="block"></i><span class="bar-num tnum"></span></span>
            <span class="bar bar-act"><i class="fill"></i><span class="act-label"></span></span>
            <span class="chips"></span>
          </span>
        </button>`;
      })
      .join('');
    this.partyRefs = allies.map((u) => {
      const card = el.querySelector(`[data-id="${u.id}"]`);
      card.addEventListener('click', () => this.select(u.id));
      return { u, card, fill: $('.bar-hp .fill', card), block: $('.bar-hp .block', card), num: $('.bar-num', card), act: $('.bar-act', card), actFill: $('.bar-act .fill', card), actLabel: $('.act-label', card), chips: $('.chips', card), html: null };
    });
    this.updateParty(true);
  }

  updateParty(force = false) {
    for (const r of this.partyRefs || []) {
      const u = r.u;
      r.fill.style.width = `${(Math.max(0, u.hp) / u.maxHp) * 100}%`;
      r.block.style.width = `${Math.min(1, u.s.block / u.maxHp) * 100}%`;
      const num = `${Math.max(0, u.hp)}${u.s.block ? ` +${u.s.block}` : ''}`;
      if (r.num.textContent !== num) r.num.textContent = num;
      const a = this.actionText(u);
      r.actFill.style.width = `${a.p * 100}%`;
      r.act.className = `bar bar-act ${a.cls}`;
      if (r.actLabel.textContent !== a.text) r.actLabel.textContent = a.text;
      const chips = this.chips(u, { compact: true });
      if (chips !== r.html || force) { r.chips.innerHTML = chips; r.html = chips; }
      r.card.classList.toggle('is-dead', !u.alive);
      r.card.classList.toggle('is-low', u.alive && u.hp / u.maxHp < 0.3);
      r.card.classList.toggle('is-selected', u.id === this.focus);
      r.card.classList.toggle('is-editing', u.kind === this.kind);
    }
  }

  // ------------------------------------------------------------ enemy strip (top of stage)

  renderStrip() {
    const foes = this.battle.units.filter((u) => u.side === 'enemy');
    const el = $('#enemyStrip');
    el.style.setProperty('--cols', foes.length);
    el.innerHTML = foes
      .map((u) => `<button class="foe" data-id="${u.id}">
        <span class="foe-top"><img class="foe-face" src="${this.img.dummy[u.def.variant]}" alt=""><span class="foe-name">${esc(u.name)}</span></span>
        <span class="bar bar-hp"><i class="fill"></i><i class="block"></i><span class="bar-num tnum"></span></span>
        <span class="chips"></span>
      </button>`)
      .join('');
    this.foeRefs = foes.map((u) => {
      const f = el.querySelector(`[data-id="${u.id}"]`);
      f.addEventListener('click', () => this.select(u.id));
      return { u, el: f, fill: $('.fill', f), block: $('.block', f), num: $('.bar-num', f), chips: $('.chips', f), html: null };
    });
  }

  updateStrip() {
    for (const r of this.foeRefs || []) {
      const u = r.u;
      r.fill.style.width = `${(Math.max(0, u.hp) / u.maxHp) * 100}%`;
      r.block.style.width = `${Math.min(1, u.s.block / u.maxHp) * 100}%`;
      const txt = u.alive ? `${u.hp}${u.s.block ? ` +${u.s.block}` : ''}` : 'down';
      if (r.num.textContent !== txt) r.num.textContent = txt;
      r.el.classList.toggle('is-dead', !u.alive);
      r.el.classList.toggle('is-selected', u.id === this.focus);
      const chips = this.chips(u, { compact: true });
      if (chips !== r.html) { r.chips.innerHTML = chips; r.html = chips; }
    }
  }

  showDefeat() {
    const d = $('#defeat');
    const b = this.battle;
    $('.defeat-sub', d).textContent = `Lasted ${fmtTime(b.time)} · ${b.stats.total} damage dealt. Check the Report tab to see what went wrong.`;
    d.hidden = false;
  }

  // ------------------------------------------------------------ right panel tabs

  bindTabs() {
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    const pick = (name) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      document.querySelectorAll('.col-info section[data-tab]').forEach((s) => (s.hidden = s.dataset.tab !== name));
      try { localStorage.setItem('sb.tab2', name); } catch {}
      if (name === 'report') this.renderReport(true);
      if (name === 'status') this.renderStatus(true);
    };
    tabs.forEach((t) => t.addEventListener('click', () => pick(t.dataset.tab)));
    let saved = 'status';
    try { saved = localStorage.getItem('sb.tab2') || 'status'; } catch {}
    pick(tabs.some((t) => t.dataset.tab === saved) ? saved : 'status');
  }

  // ------------------------------------------------------------ status tab

  renderStatus(force = false) {
    const sec = $('.col-info section[data-tab="status"]');
    if (!force && sec.hidden) return;
    const u = this.battle?.unit(this.focus);
    if (!u) return;
    const c = CHARACTERS[u.kind];
    const a = this.actionText(u);
    const rows = [];
    for (const [k, meta] of Object.entries(STATUSES)) {
      if (!u.s[k]) continue;
      rows.push(`<li class="st-row tone-${meta.tone}">${iconImg(meta.icon, 'px-icon px-icon-lg')}<span class="st-main"><span class="st-name">${esc(meta.name)}${meta.flag ? '' : `<b class="tnum">${u.s[k]}</b>`}</span><span class="st-text">${esc(meta.text)}</span></span></li>`);
    }
    for (const [k, meta] of Object.entries(TIMERS)) {
      if (!u.tm[k]) continue;
      rows.push(`<li class="st-row tone-${meta.tone}">${iconImg(meta.icon, 'px-icon px-icon-lg')}<span class="st-main"><span class="st-name">${esc(meta.name)}<b class="tnum">${Math.ceil(u.tm[k] / TPS)}s</b></span><span class="st-text">${esc(meta.text)}</span></span></li>`);
    }
    const book = u.spellbook.map((l, i) => `<li><b>${i + 1}</b>${esc(l.cond ? 'If ' + condLabel(l.cond) : 'Otherwise')} → ${esc(SPELLS[l.spell].name)}</li>`).join('');
    const html = `
      <div class="focus k-${u.kind}">
        <div class="focus-head">
          <img class="focus-face" src="${this.img4(u)}" alt="">
          <div>
            <div class="focus-name">${esc(u.name)}</div>
            <div class="focus-role">${u.side === 'ally' ? `${esc(c.role)} · ${SLOT_NAMES[u.slot]}` : `Enemy · ${SLOT_NAMES[u.slot]}`}</div>
          </div>
        </div>
        ${u.side === 'ally' ? `<p class="focus-hook">${esc(c.hook)}</p>` : ''}
        <dl class="focus-stats">
          <div><dt>HP</dt><dd class="tnum">${Math.max(0, u.hp)} / ${u.maxHp}</dd></div>
          <div><dt>Block</dt><dd class="tnum">${u.s.block}</dd></div>
          <div><dt>Now</dt><dd class="${a.cls}">${esc(a.text || 'Charging')}</dd></div>
        </dl>
        <h4>Statuses</h4>
        ${rows.length ? `<ul class="st-list">${rows.join('')}</ul>` : '<p class="empty">No statuses.</p>'}
        ${u.side === 'enemy' ? `<h4>Spellbook</h4>${book ? `<ol class="mini-book">${book}</ol>` : '<p class="empty">Does nothing. A punching bag.</p>'}` : ''}
      </div>`;
    if (html !== this.statusHtml) {
      $('#statusFocus').innerHTML = html;
      this.statusHtml = html;
    }
  }

  renderRoster() {
    const el = $('#roster');
    el.innerHTML = this.battle.units
      .map((u) => `<button class="ro ${u.side === 'enemy' ? 'ro-foe' : ''} ${u.id === this.focus ? 'is-on' : ''}" data-id="${u.id}">
        <img src="${this.img4(u)}" alt=""><span class="ro-name">${esc(u.name)}</span><span class="ro-hp tnum"></span><span class="chips"></span></button>`)
      .join('');
    el.querySelectorAll('.ro').forEach((b) => b.addEventListener('click', () => this.select(b.dataset.id)));
    this.updateRoster();
  }

  updateRoster() {
    if (!this.battle) return;
    $('#roster').querySelectorAll('.ro').forEach((b) => {
      const u = this.battle.unit(b.dataset.id);
      $('.ro-hp', b).textContent = u.alive ? `${u.hp}/${u.maxHp}` : 'down';
      const chips = this.chips(u, { compact: true });
      const c = $('.chips', b);
      if (c.innerHTML !== chips) c.innerHTML = chips;
      b.classList.toggle('is-dead', !u.alive);
    });
  }

  // ------------------------------------------------------------ spellbook (left)

  renderUnitTabs() {
    const el = $('#unitTabs');
    el.innerHTML = this.state.party.formation
      .map((k) => `<button role="tab" class="ut k-${k}" data-k="${k}" aria-selected="${k === this.kind}"><img src="${this.img[k]}" alt=""><span>${esc(CHARACTERS[k].name)}</span></button>`)
      .join('');
    el.querySelectorAll('.ut').forEach((b) => b.addEventListener('click', () => {
      const u = this.battle?.units.find((x) => x.side === 'ally' && x.kind === b.dataset.k);
      if (u) this.select(u.id);
      else { this.kind = b.dataset.k; this.renderUnitTabs(); this.renderBook(); }
    }));
    const c = CHARACTERS[this.kind];
    $('#bookWho').innerHTML = `<img src="${this.img[this.kind]}" alt=""><div><strong>${esc(c.name)}</strong><span>${esc(c.role)} · ${esc(c.hook)}</span></div>`;
    $('#bookWho').className = `who k-${this.kind}`;
  }

  bookChanged() {
    this.renderBook();
    this.hooks.onBookChange(this.kind);
  }

  renderBook() {
    const book = this.book();
    this.linesEl.innerHTML = book
      .map((l, i) => {
        const sp = SPELLS[l.spell];
        const cond = sp.passive
          ? `<span class="kw kw-passive">Passive</span>always on`
          : l.cond ? `<span class="kw">If</span>${esc(condLabel(l.cond))}` : `<span class="kw kw-else">Otherwise</span>`;
        return `
        <li class="line ${sp.passive ? 'is-passive' : ''}" data-i="${i}">
          <div class="line-rail">
            <span class="line-num">${i + 1}</span>
            <button class="grip" aria-label="Drag line ${i + 1} to reorder"><i></i><i></i><i></i></button>
          </div>
          <div class="line-body">
            <button class="tile tile-cond" data-act="cond" ${sp.passive ? 'disabled' : ''}>${cond}</button>
            <div class="line-row">
              <button class="tile tile-spell rar-${sp.rarity}" data-act="spell">${iconImg(sp.icon)}<span class="nm">${esc(sp.name)}</span><span class="cd tnum">${sp.passive ? '' : sp.once ? 'once' : sp.cd ? sp.cd + 's' : 'basic'}</span><i class="cdbar"></i></button>
              ${sp.passive ? '' : `<span class="arrow" aria-hidden="true"></span><button class="tile tile-target" data-act="target">${esc(targetLabel(l.spell, l.target))}</button>`}
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
        else if (act === 'del') { this.book().splice(i, 1); this.bookChanged(); }
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
        const others = [...list.children].filter((x) => x !== li);
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
        list.classList.remove('drop-end');
        if (to !== from) {
          const book = this.book();
          const [l] = book.splice(from, 1);
          book.splice(to, 0, l);
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
    const u = this.battle?.units.find((x) => x.side === 'ally' && x.kind === this.kind);
    if (!u || !this.lineRefs) return;
    this.book().forEach((l, i) => {
      const r = this.lineRefs[i];
      if (!r) return;
      const sp = SPELLS[l.spell];
      let k = 0;
      if (sp.once && u.used[l.spell]) k = 1;
      else if (sp.cd) k = (u.cd[l.spell] || 0) / sec(sp.cd);
      r.bar.style.transform = `scaleX(${k.toFixed(3)})`;
      r.tile.classList.toggle('is-spent', !!(sp.once && u.used[l.spell]));
    });
  }

  // ------------------------------------------------------------ pickers

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
    const line = this.book()[i];
    const pool = spellsOf(this.kind);
    const groups = Object.keys(RARITY)
      .map((r) => {
        const items = pool.filter((k) => SPELLS[k].rarity === r);
        if (!items.length) return '';
        return `<h3 class="rar-head rar-${r}">${RARITY[r].label}</h3>` + items
          .map((k) => {
            const s = SPELLS[k];
            const meta = s.passive ? 'passive' : `${s.once ? 'once per fight' : s.cd ? `${s.cd}s cooldown` : 'no cooldown'} · ${s.cast}s cast`;
            return `<button class="opt spell-opt rar-${s.rarity} ${k === line.spell ? 'is-on' : ''}" data-v="${k}">
              ${iconImg(s.icon, 'px-icon px-icon-lg')}
              <span class="opt-main"><span class="opt-title">${esc(s.name)}<span class="opt-meta tnum">${meta}</span></span>
              <span class="opt-text">${esc(s.text)}</span>${s.hint ? `<span class="opt-hint">${esc(s.hint)}</span>` : ''}</span>
            </button>`;
          })
          .join('');
      })
      .join('');
    this.openSheet(`${CHARACTERS[this.kind].name} · line ${i + 1} · spell`, `<div class="opt-list opt-grid">${groups}</div>`, (e) => {
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
    const line = this.book()[i];
    const kind = SPELLS[line.spell].target;
    const opts = TARGETS[kind];
    const note = line.cond && ((line.cond.who === 'enemy' && kind === 'enemy') || (line.cond.who !== 'enemy' && kind === 'ally'))
      ? `<p class="sheet-note">Picks from the units that matched this line's condition (${esc(condLabel(line.cond))}). Taunt and Sanctuary still apply.</p>`
      : opts.length === 1 ? `<p class="sheet-note">${esc(SPELLS[line.spell].name)} always targets ${esc(opts[0][1])}.</p>` : '';
    this.openSheet(`Line ${i + 1} · target`, `${note}<div class="opt-list">${opts
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
    const line = this.book()[i];
    const draft = line.cond ? { ...line.cond } : { who: 'enemy', stat: 'burn', cmp: 'gte', val: 10 };
    let otherwise = !line.cond;
    const chips = (name, list, cur) =>
      `<div class="chips-pick">${list.map(([k, l]) => `<button class="pick ${String(k) === String(cur) ? 'is-on' : ''}" data-k="${name}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
    const render = () => {
      const vals = COND_VALUES[draft.stat];
      if (!vals.includes(draft.val)) draft.val = vals[Math.floor(vals.length / 2)];
      this.sheetBody.innerHTML = `
        <div class="cond-preview">${otherwise ? '<span class="kw kw-else">Otherwise</span> always fits' : `<span class="kw">If</span>${esc(condLabel(draft))}`}</div>
        <button class="opt opt-else ${otherwise ? 'is-on' : ''}" data-k="else"><span class="opt-title">Otherwise</span><span class="opt-text">Always true. Use it on the last line, or to fire a spell whenever it is off cooldown.</span></button>
        <div class="cond-build ${otherwise ? 'is-off' : ''}">
          <h3>Who</h3>${chips('who', COND_WHO, draft.who)}
          <h3>Has</h3>${chips('stat', COND_STAT, draft.stat)}
          <h3>Compare</h3>${chips('cmp', COND_CMP.map(([k, l]) => [k, k === 'lt' ? `${l} less than` : `${l} at least`]), draft.cmp)}
          <h3>Value</h3>${chips('val', vals.map((v) => [v, draft.stat === 'hp' ? `${v}%` : v]), draft.val)}
        </div>`;
    };
    this.openSheet(`Line ${i + 1} · condition`, '', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if (k === 'else') otherwise = !otherwise;
      else { otherwise = false; draft[k] = k === 'val' ? Number(b.dataset.v) : b.dataset.v; }
      line.cond = otherwise ? null : { ...draft };
      render();
      this.bookChanged();
    });
    render();
  }

  openPresets() {
    const list = PRESETS[this.kind];
    this.openSheet(`${CHARACTERS[this.kind].name} presets`, `<p class="sheet-note">Loading a preset replaces her lines. The fight keeps running.</p><div class="opt-list">${list.map(
      (p) => `<button class="opt" data-v="${p.id}"><span class="opt-title">${esc(p.name)}</span><span class="opt-text">${esc(p.note)}</span>
        <span class="preset-icons">${p.lines.map((l) => iconImg(SPELLS[l.spell].icon)).join('')}</span></button>`,
    ).join('')}</div>`, (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      this.state.party.books[this.kind] = presetLines(this.kind, b.dataset.v);
      this.bookChanged();
      this.closeSheet();
    });
  }

  // ------------------------------------------------------------ setup tab

  renderSetup() {
    const f = this.state.party.formation;
    $('#formation').innerHTML = f
      .map((k, i) => `<li class="fm k-${k}">
        <span class="fm-slot">${SLOT_NAMES[i]}</span>
        <img src="${this.img[k]}" alt=""><span class="fm-name">${esc(CHARACTERS[k].name)}<em>${esc(CHARACTERS[k].role)}</em></span>
        <span class="fm-btns">
          <button data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(CHARACTERS[k].name)} toward the front">▲</button>
          <button data-mv="1" data-i="${i}" ${i === f.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(CHARACTERS[k].name)} toward the back">▼</button>
        </span></li>`)
      .join('');
    $('#formation').onclick = (e) => {
      const b = e.target.closest('[data-mv]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const j = i + Number(b.dataset.mv);
      [f[i], f[j]] = [f[j], f[i]];
      this.renderSetup();
      this.renderUnitTabs();
      this.hooks.onSetupChange();
    };

    const d = this.state.dummies;
    const seg = (name, vals, cur) =>
      `<div class="seg" role="group">${vals.map((v) => `<button data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${v}</button>`).join('')}</div>`;
    const toggle = (k, i, on, title, text) =>
      `<button class="toggle" data-k="${k}" data-i="${i}" aria-pressed="${on}"><i></i><span><b>${title}</b> ${text}</span></button>`;
    $('#dummyForm').innerHTML = `
      <div class="field"><span class="field-label">Dummies</span>${seg('count', [1, 2, 3], d.count)}</div>
      <div class="field"><span class="field-label">Max HP each</span>${seg('hp', [300, 600, 1200], d.hp)}</div>
      <div class="dummy-list">${d.list.slice(0, d.count).map((o, i) => `
        <div class="dummy-card">
          <img class="dummy-face" src="${this.img.dummy[i]}" alt="">
          <div class="dummy-main">
            <div class="dummy-name">${DUMMY_NAMES[i]} <span>${SLOT_NAMES[i]}</span></div>
            ${toggle('brace', i, !!o.brace, 'Braces', 'gains 12 Block every 5s')}
            ${toggle('strike', i, !!o.strike, 'Thwacks', '8–10 damage to your frontmost')}
            ${toggle('spit', i, !!o.spit, 'Spits', '3 Poison on your backmost every 4s')}
          </div>
        </div>`).join('')}</div>`;
    $('#dummyForm').onclick = (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if (k === 'count' || k === 'hp') d[k] = Number(b.dataset.v);
      else d.list[Number(b.dataset.i)][k] = b.getAttribute('aria-pressed') !== 'true';
      this.renderSetup();
      this.hooks.onSetupChange();
    };
  }

  // ------------------------------------------------------------ report tab

  renderReport(force = false) {
    const sec = $('.col-info section[data-tab="report"]');
    if (!force && sec.hidden) return;
    const b = this.battle;
    if (!b) return;
    const st = b.stats;
    const t = Math.max(1, b.time);
    $('#kpis').innerHTML = [
      ['Damage', st.total, 'burn'],
      ['DPS', (st.total / t).toFixed(1), 'burn'],
      ['Healed', b.units.filter((u) => u.side === 'ally').reduce((a, u) => a + st.units[u.id].healed, 0), 'regen'],
      ['Peak Burn', st.peakBurn, 'burn'],
      ['Shattered', st.shattered, 'block'],
      ['Downed', st.kills, 'gold'],
    ].map(([k, v, tone]) => `<div class="kpi tone-${tone}"><span class="kpi-v tnum">${v}</span><span class="kpi-k">${k}</span></div>`).join('');

    const allies = b.units.filter((u) => u.side === 'ally');
    const max = Math.max(1, ...allies.flatMap((u) => [st.units[u.id].dealt, st.units[u.id].healed, st.units[u.id].taken, st.units[u.id].blocked]));
    const bar = (v, cls) => `<span class="ub ${cls}"><i style="width:${(v / max) * 100}%"></i><em class="tnum">${v}</em></span>`;
    $('#byUnit').innerHTML = allies.map((u) => {
      const s = st.units[u.id];
      return `<div class="bu k-${u.kind}"><img src="${this.img[u.kind]}" alt=""><div class="bu-bars">
        <span class="bu-name">${esc(u.name)}</span>
        ${bar(s.dealt, 'ub-dealt')}${bar(s.healed, 'ub-healed')}${bar(s.taken, 'ub-taken')}${bar(s.blocked, 'ub-blocked')}
      </div></div>`;
    }).join('') + '<p class="legend"><span><i class="ub-dealt"></i>dealt</span><span><i class="ub-healed"></i>healed</span><span><i class="ub-taken"></i>taken</span><span><i class="ub-blocked"></i>Block gained</span></p>';

    const rows = Object.entries(st.bySource).map(([k, r]) => ({ k, ...r, total: r.dmg + r.block })).sort((a, c) => c.total - a.total);
    const smax = Math.max(1, ...rows.map((r) => r.total));
    $('#sources').innerHTML = rows.length
      ? rows.map((r) => {
          const icon = r.k === 'burn' ? 'flame' : r.k === 'poison' ? 'drop' : r.k === 'spikes' ? 'spikes' : SPELLS[r.k]?.icon ?? 'attack';
          const casts = st.casts[r.k];
          return `<div class="src">${iconImg(icon)}
            <span class="src-name">${esc(sourceName(r.k))}${casts ? `<em class="tnum">×${casts}</em>` : ''}</span>
            <span class="src-v tnum">${r.dmg}${r.block ? `<em> +${r.block} block</em>` : ''}</span>
            <span class="src-bar"><i style="width:${(r.dmg / smax) * 100}%"></i><i class="b" style="width:${(r.block / smax) * 100}%"></i></span>
          </div>`;
        }).join('')
      : '<p class="empty">No damage yet.</p>';
    if (this.logDirty || force) {
      this.logDirty = false;
      $('#log').innerHTML = this.log.slice().reverse()
        .map((l) => `<li class="${l.cls}"><time class="tnum">${fmtTime(l.t)}</time><span>${l.html}</span></li>`).join('');
    }
    $('#seed').textContent = `Seed ${b.seed}. The same seed, spellbooks, formation and dummies always replay the same fight.`;
  }
}
