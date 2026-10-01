// DOM layer over the canvas: damage numbers, cast labels, mini HP bars and banners.

export class Overlay {
  constructor(el) {
    this.el = el;
    this.units = new Map();
    this.onPick = () => {};
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'banner';
    this.bannerEl.hidden = true;
    el.appendChild(this.bannerEl);
  }

  clear() {
    for (const u of this.units.values()) { u.root.remove(); u.hit.remove(); }
    this.units.clear();
    this.el.querySelectorAll('.num').forEach((n) => n.remove());
    this.bannerEl.hidden = true;
  }

  ensure(id, side) {
    let u = this.units.get(id);
    if (u) return u;
    const root = document.createElement('div');
    root.className = `ov-unit ov-${side}`;
    root.innerHTML = `<div class="cast-label"></div><div class="wait-pill" hidden></div><div class="mini"><i class="mini-hp"></i><i class="mini-block"></i></div>`;
    this.el.appendChild(root);
    const hit = document.createElement('button');
    hit.className = 'ov-hit';
    hit.setAttribute('aria-label', 'Select unit');
    hit.addEventListener('click', () => this.onPick(id));
    this.el.appendChild(hit);
    u = {
      root,
      label: root.querySelector('.cast-label'),
      hp: root.querySelector('.mini-hp'),
      block: root.querySelector('.mini-block'),
      mini: root.querySelector('.mini'),
      wait: root.querySelector('.wait-pill'),
      hit,
    };
    this.units.set(id, u);
    return u;
  }

  place(id, side, x, y, unit, box) {
    const u = this.ensure(id, side);
    if (box) {
      const h = box.bottom - box.top;
      Object.assign(u.hit.style, { left: `${Math.round(box.x - box.w / 2)}px`, top: `${Math.round(box.top)}px`, width: `${Math.round(box.w)}px`, height: `${Math.round(h)}px` });
    }
    u.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    const hp = Math.max(0, unit.hp / unit.maxHp);
    u.hp.style.width = `${hp * 100}%`;
    u.block.style.width = `${Math.min(1, unit.s.block / unit.maxHp) * 100}%`;
    u.root.classList.toggle('is-dead', !unit.alive);
    u.mini.classList.toggle('is-low', hp < 0.3);
  }

  waiting(id, on, text = 'Waiting') {
    const u = this.units.get(id);
    if (!u) return;
    u.wait.hidden = !on;
    if (on) u.wait.textContent = text;
  }

  castLabel(id, html, tone = '') {
    const u = this.units.get(id);
    if (!u) return;
    u.label.innerHTML = html;
    u.label.className = `cast-label ${tone}`;
    void u.label.offsetWidth; // restart the animation
    u.label.classList.add('show');
  }

  number(x, y, text, cls = '', opts = {}) {
    const n = document.createElement('span');
    n.className = `num ${cls}`;
    n.textContent = text;
    n.style.left = `${Math.round(x)}px`;
    n.style.top = `${Math.round(y)}px`;
    this.el.appendChild(n);
    const dx = opts.dx ?? (Math.random() * 2 - 1) * 16;
    const rise = opts.rise ?? 26;
    const big = cls.includes('n-big');
    const anim = n.animate(
      [
        { transform: `translate(-50%, 0) scale(${big ? 0.4 : 0.6})`, opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.4}px), ${-rise * 0.8}px) scale(${big ? 1.5 : 1.15})`, opacity: 1, offset: 0.18 },
        { transform: `translate(calc(-50% + ${dx * 0.8}px), ${-rise}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), ${-rise * 0.55}px) scale(0.9)`, opacity: 0 },
      ],
      { duration: big ? 1300 : opts.duration ?? 850, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    anim.onfinish = () => n.remove();
  }

  banner(title, sub = '', tone = '') {
    const b = this.bannerEl;
    b.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    b.className = `banner ${tone}`;
    b.hidden = false;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (b.hidden = true), 1600);
  }
}
