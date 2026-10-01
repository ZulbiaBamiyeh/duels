// Three.js battle stage. The scene renders at true pixel-art resolution (one texel = one
// screen pixel) and the canvas is upscaled by a whole number with nearest-neighbour sampling.
// Orthographic camera with a slight downward tilt; sprites are billboards facing it, so they keep
// exact pixel scale while the floor recedes. Party on the left facing right, enemies on the right.

import * as THREE from 'three';
import { drawMage, MAGE_FRAMES } from '../art/mage.js';
import { drawCleric, CLERIC_FRAMES } from '../art/cleric.js';
import { drawTank, TANK_FRAMES } from '../art/tank.js';
import { drawDummy, DUMMY_W, DUMMY_H } from '../art/dummy.js';
import { W as CW, H as CH } from '../art/chibi.js';
import {
  drawSky, drawSkyline, drawBalustrade, drawFloorTile, drawDuelCircle, drawRune,
  drawShadow, drawGlow, drawShieldBubble, drawLantern,
} from '../art/env.js';
import { FX, rand } from './fx.js';
import { Overlay } from './overlay.js';
import { SPELLS, STATUSES, TIMERS, TPS } from '../sim/data.js';

THREE.ColorManagement.enabled = false;

const THETA = 0.3;
const SIN = Math.sin(THETA);
const COS = Math.cos(THETA);
const UP = new THREE.Vector3(0, COS, -SIN); // camera up, in world space
const TO_CAM = new THREE.Vector3(0, SIN, COS);
const SLOT_Z = [0, -16, 8];

const KINDS = {
  tank: { draw: drawTank, frames: TANK_FRAMES, w: CW, h: CH, top: 106, body: 58, rune: '#8fb3d9' },
  mage: { draw: drawMage, frames: MAGE_FRAMES, w: CW, h: CH, top: 124, body: 58, rune: '#ff9a4a' },
  cleric: { draw: drawCleric, frames: CLERIC_FRAMES, w: CW, h: CH, top: 106, body: 58, rune: '#ffe08a' },
  dummy: { w: DUMMY_W, h: DUMMY_H, top: 108, body: 54 },
};

// How the caster animates and what flies, per spell fx.
const MOTION = {
  ember: 'throw', bolt: 'throw', lob: 'throw', spark: 'throw', beam: 'throw', spray: 'throw', flashpoint: 'throw', pass: 'throw', wave: 'throw',
  tap: 'melee', slash: 'melee', bash: 'melee', slam: 'melee', thwack: 'melee',
};
const PROJECTILE = { ember: 'ember', bolt: 'bolt', lob: 'lob', spark: 'spark', beam: 'beam', heal: 'holy', absolve: 'holy', spit: 'spit', renew: 'holy', ward: 'holy' };

function tex(raster) {
  const t = new THREE.CanvasTexture(raster.toCanvas());
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const SPRITE_VS = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPRITE_FS = `
  uniform sampler2D map;
  uniform float flash, opacity, burn, poison, time;
  uniform vec3 tint, add, flashColor;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    vec3 col = c.rgb * tint + add;
    float b = burn * (0.6 + 0.4 * sin(time * 9.0 + vUv.y * 18.0)) * (1.1 - vUv.y);
    b = floor(clamp(b, 0.0, 1.0) * 4.0) / 4.0;
    col = mix(col, col * vec3(1.3, 0.82, 0.6) + vec3(0.14, 0.04, 0.0), b);
    float p = poison * (0.7 + 0.3 * sin(time * 4.0 + vUv.x * 9.0));
    p = floor(clamp(p, 0.0, 1.0) * 3.0) / 3.0;
    col = mix(col, col * vec3(0.8, 1.05, 0.7) + vec3(0.02, 0.06, 0.0), p * 0.6);
    col = mix(col, flashColor, flash);
    gl_FragColor = vec4(col, opacity);
  }`;

function spriteMat(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, flash: { value: 0 }, opacity: { value: 1 }, burn: { value: 0 }, poison: { value: 0 }, time: { value: 0 },
      tint: { value: new THREE.Color(1, 1, 1) }, add: { value: new THREE.Color(0, 0, 0) }, flashColor: { value: new THREE.Color(1, 0.97, 0.92) },
    },
    vertexShader: SPRITE_VS,
    fragmentShader: SPRITE_FS,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

function plane(w, h, mat, pivot = 'bottom') {
  const g = new THREE.PlaneGeometry(w, h);
  if (pivot === 'bottom') g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

function basicMat(map, opts = {}) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: opts.additive ? 0 : 0.5, depthWrite: !opts.additive, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, ...opts.extra });
}

// Lies flat on the floor; texture authored foreshortened, so depth = texels / sin(theta).
function floorDecal(raster, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(raster.w, raster.h / SIN),
    new THREE.MeshLambertMaterial({ map: tex(raster), transparent: true, depthWrite: false, ...opts }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

export class Stage {
  constructor(el) {
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.overlay = new Overlay(el.querySelector('.overlay'));
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#211d35');
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight('#c4b8e6', 2.5));
    this.T = new THREE.Vector3();
    this.fx = new FX(this);
    this.views = new Map();
    this.timeline = [];
    this.time = 0;
    this.simTime = 0;
    this.env = null;
    this.size = { iw: 0, ih: 0 };
    this.selected = null;
    this.onInferno = () => {};
    this.onSelect = () => {};
    this.overlay.onPick = (id) => this.onSelect(id);

    const frameSet = (k) => {
      const out = {};
      for (const [name, [pose, opts]] of Object.entries(KINDS[k].frames)) {
        const r = KINDS[k].draw(pose, opts);
        out[name] = tex(r);
        out[name].meta = r.meta;
      }
      return out;
    };
    this.tx = {
      tank: frameSet('tank'),
      mage: frameSet('mage'),
      cleric: frameSet('cleric'),
      dummy: [0, 1, 2].map((v) => ({ idle: tex(drawDummy(v)), hit: tex(drawDummy(v, { hit: true })) })),
      shadow: drawShadow(22, 5),
      bubble: tex(drawShieldBubble(28, 54)),
      bubbleDummy: tex(drawShieldBubble(26, 52)),
      glow: tex(drawGlow(10, '#ffffff')),
      lantern: tex(drawLantern()),
    };

    this.resize();
    new ResizeObserver(() => this.resize()).observe(el);
  }

  // ------------------------------------------------------------- layout

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    const devW = r.width * dpr;
    const devH = r.height * dpr;
    const scale = Math.max(1, Math.floor(Math.min(devW / 330, devH / 260)));
    const even = (n) => Math.ceil(n / 2) * 2;
    const iw = even(devW / scale);
    const ih = even(devH / scale);
    this.cssPerPx = scale / dpr;
    const cw = iw * this.cssPerPx;
    const ch = ih * this.cssPerPx;
    this.offset = { x: (r.width - cw) / 2, y: (r.height - ch) / 2 };
    Object.assign(this.canvas.style, { width: `${cw}px`, height: `${ch}px`, left: `${this.offset.x}px`, top: `${this.offset.y}px` });
    if (iw === this.size.iw && ih === this.size.ih) return;
    this.size = { iw, ih, scale };
    this.renderer.setSize(iw, ih, false);
    this.fx.setRes(iw, ih);
    const cam = this.camera;
    cam.left = -iw / 2; cam.right = iw / 2; cam.top = ih / 2; cam.bottom = -ih / 2;
    cam.updateProjectionMatrix();
    // feet line sits 20% up from the bottom
    this.T.set(0, (0.3 * ih) / COS, 0);
    this.camBase = this.T.clone().addScaledVector(TO_CAM, 1000);
    cam.position.copy(this.camBase);
    cam.lookAt(this.T);
    cam.updateMatrixWorld();
    this.buildEnv();
  }

  buildEnv() {
    if (this.env) {
      this.env.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      this.env.removeFromParent();
      this.bg?.removeFromParent();
    }
    const { iw, ih } = this.size;
    const env = new THREE.Group();
    const bg = new THREE.Group();
    this.env = env;
    this.bg = bg;
    this.scene.add(env);
    this.camera.add(bg);

    const FAR = Math.round((0.36 * ih) / SIN);
    const NEAR = Math.round(ih / SIN);
    const hz = Math.round(-0.3 * ih + FAR * SIN); // horizon in camera pixels from centre

    const sky = plane(iw, ih, new THREE.MeshBasicMaterial({ map: tex(drawSky(iw, ih, ih / 2 - hz)), depthWrite: false }), 'center');
    sky.position.set(0, 0, -2900);
    bg.add(sky);
    const farLine = plane(iw + 8, 96, basicMat(tex(drawSkyline(iw + 8, 96, false, 3))));
    farLine.position.set(0, hz + 10, -2800);
    bg.add(farLine);
    const nearLine = plane(iw + 8, 64, basicMat(tex(drawSkyline(iw + 8, 64, true, 9))));
    nearLine.position.set(0, hz + 10, -2700);
    bg.add(nearLine);
    const bal = plane(iw + 8, 16, basicMat(tex(drawBalustrade(iw + 8))));
    bal.position.set(0, hz - 1, -2600);
    bg.add(bal);

    const W = iw + 240;
    const D = FAR + NEAR;
    const tile = tex(drawFloorTile());
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(W / 64, (D * SIN) / 48);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tile }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (NEAR - FAR) / 2);
    env.add(floor);

    const circle = floorDecal(drawDuelCircle(Math.min(iw / 2 - 16, 200), 26));
    circle.position.set(0, 0.05, -4);
    env.add(circle);

    this.lanterns = [];
    for (const side of [-1, 1]) {
      const x = side * (iw / 2 - 16);
      const z = -FAR + 18;
      const g = new THREE.Group();
      g.rotation.x = -THETA;
      g.position.set(x, 0, z);
      g.add(plane(10, 34, basicMat(this.tx.lantern)));
      const halo = plane(20, 20, basicMat(this.tx.glow, { additive: true, extra: { color: new THREE.Color('#5a3a1a') } }), 'center');
      halo.position.set(0, 29, 1);
      g.add(halo);
      env.add(g);
      const light = new THREE.PointLight('#ffb35c', 1.6, 140, 0);
      light.position.set(x, 26, z + 10);
      env.add(light);
      this.lanterns.push({ light, phase: Math.random() * 10 });
    }

    this.selRing = floorDecal(drawRune(26, 7), { emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.6, opacity: 0.85 });
    env.add(this.selRing);

    for (const v of this.views.values()) this.layoutView(v);
  }

  // ------------------------------------------------------------- units

  bind(battle) {
    this.battle = battle;
    for (const v of this.views.values()) {
      v.group.removeFromParent();
      v.shadow.removeFromParent();
      v.light.removeFromParent();
      v.rune?.removeFromParent();
    }
    this.views.clear();
    this.overlay.clear();
    this.fx.clear();
    this.timeline.length = 0;
    this.infernoOn = false;
    for (const u of battle.units) this.views.set(u.id, this.makeView(u));
  }

  select(id) {
    this.selected = id;
  }

  // Slot spacing adapts to the visible width so 3v3 always fits.
  spot(u) {
    const half = this.size.iw / 2;
    const front = Math.max(34, Math.min(48, half * 0.22));
    const gap = Math.max(36, Math.min(62, (half - front - 44) / 2));
    const x = Math.round(front + u.slot * gap);
    return new THREE.Vector3(u.side === 'ally' ? -x : x, 0, SLOT_Z[u.slot]);
  }

  makeView(u) {
    const K = KINDS[u.kind];
    const isDummy = u.kind === 'dummy';
    const frames = isDummy ? this.tx.dummy[u.def.variant ?? 0] : this.tx[u.kind];
    const mat = spriteMat(isDummy ? frames.idle : frames.idle0);
    const mesh = plane(K.w, K.h, mat);
    const group = new THREE.Group();
    group.rotation.x = -THETA;
    group.add(mesh);
    const flip = u.side === 'enemy';
    if (flip) mesh.scale.x = -1;
    const bubble = plane(58, 110, basicMat(isDummy ? this.tx.bubbleDummy : this.tx.bubble, { extra: { opacity: 0.9 } }));
    bubble.position.set(0, -1, 2);
    bubble.visible = false;
    group.add(bubble);
    this.scene.add(group);

    const shadow = floorDecal(this.tx.shadow, { opacity: 0.75 });
    this.scene.add(shadow);
    const light = new THREE.PointLight('#ff7a2f', 0, 110, 0);
    this.scene.add(light);
    let rune = null;
    if (!isDummy) {
      rune = floorDecal(drawRune(26, 7), { emissive: new THREE.Color(K.rune), emissiveIntensity: 0.9, opacity: 0 });
      this.env.add(rune);
    }

    const v = {
      id: u.id, u, K, isDummy, frames, mesh, mat, group, bubble, shadow, light, rune, base: new THREE.Vector3(), flip,
      frame: '', anim: null, hitT: 9, flash: 0, flashColor: '#fff8ec', wob: 0, wobV: 0, knock: 0, lunge: 0, runeT: 0,
      deadT: 0, dropT: 9, blinkIn: rand(1, 4), blinkT: 0, emit: 0, heatEmit: 0, auraEmit: 0, poisonEmit: 0, bubbleT: 0,
    };
    this.layoutView(v);
    return v;
  }

  layoutView(v) {
    v.base.copy(this.spot(v.u));
    v.shadow.position.set(v.base.x, 0.06, v.base.z);
    if (v.rune) {
      if (v.rune.parent !== this.env) this.env.add(v.rune);
      v.rune.position.set(v.base.x, 0.1, v.base.z);
    }
  }

  // A point on the unit's sprite, in sprite pixels from the bottom centre (x toward the enemy).
  point(v, sx, sy, out = new THREE.Vector3()) {
    const dir = v.flip ? -1 : 1;
    return out.copy(v.base).addScaledVector(UP, sy).add(new THREE.Vector3(sx * dir, 0, 0)).addScaledVector(TO_CAM, 10);
  }
  center(v) { return this.point(v, 0, v.K.body); }
  head(v) { return this.point(v, 0, v.K.top); }
  hand(v, frame = 'attack') {
    const meta = v.frames[frame]?.meta;
    if (!meta) return this.center(v);
    const [hx, hy] = meta.hand;
    return this.point(v, hx - v.K.w / 2, v.K.h - hy);
  }

  snap(pos) {
    const d = pos.clone().sub(this.T);
    const xc = Math.round(d.x);
    const yc = Math.round(d.dot(UP));
    const zc = d.dot(TO_CAM);
    return this.T.clone().add(new THREE.Vector3(xc, 0, 0)).addScaledVector(UP, yc).addScaledVector(TO_CAM, zc);
  }

  toCss(pos) {
    const p = pos.clone().project(this.camera);
    return {
      x: ((p.x + 1) / 2) * this.size.iw * this.cssPerPx + this.offset.x,
      y: ((1 - p.y) / 2) * this.size.ih * this.cssPerPx + this.offset.y,
    };
  }

  at(delay, fn) {
    this.timeline.push({ at: this.simTime + delay, fn });
  }

  // ------------------------------------------------------------- events

  handle(events) {
    for (const e of events) {
      this.simTime = e.t / TPS;
      const fn = this['on_' + e.type];
      if (fn) fn.call(this, e);
    }
  }

  on_castStart(e) {
    const v = this.views.get(e.unit);
    if (!v) return;
    const dur = e.ticks / TPS;
    const spell = SPELLS[e.spell];
    const motion = MOTION[spell.fx] || 'cast';
    v.anim = { spell: e.spell, start: this.simTime, dur, motion };
    this.overlay.waiting(v.id, false);
    const targets = e.targets.map((id) => this.views.get(id)).filter(Boolean);

    if (v.isDummy) this.overlay.castLabel(v.id, spell.name, 'tone-enemy');
    else if (!spell.basic) {
      this.overlay.castLabel(v.id, `<b>${e.line + 1}</b>${spell.name}`, `rar-${spell.rarity}`);
      v.runeT = dur + 0.25;
      this.fx.flash(this.hand(v, 'cast1'), v.K.rune, 2, 3);
    }

    if (motion === 'melee') {
      this.at(dur * 0.35, () => (v.lunge = 1));
      if (spell.fx === 'tap' && targets[0]) this.at(dur * 0.3, () => this.fx.projectile(this.hand(v, 'attack'), this.center(targets[0]), dur * 0.7, 'holy'));
      return;
    }
    const style = PROJECTILE[spell.fx];
    if (style && targets[0] && targets[0] !== v) {
      this.at(dur * 0.4, () => this.fx.projectile(this.hand(v, motion === 'throw' ? 'attack' : 'cast1'), this.center(targets[0]), dur * 0.6, style));
    } else if (spell.fx === 'spray') {
      for (const tv of targets) {
        for (let i = 0; i < 4; i++) {
          this.at(dur * (0.3 + i * 0.07), () => this.fx.projectile(this.hand(v, 'attack'), this.point(tv, rand(-8, 8), rand(20, 80)), dur * 0.45, 'spray'));
        }
      }
    } else if (spell.fx === 'flashpoint' && targets[0]) {
      this.at(dur * 0.4, () => this.fx.projectile(this.hand(v, 'attack'), this.center(targets[0]), dur * 0.6, 'bolt'));
    } else if (spell.fx === 'wave' && targets[0]) {
      this.at(dur * 0.3, () => this.fx.projectile(this.point(v, 24, 2), this.point(targets[0], 0, 2), dur * 0.7, 'wave'));
    } else if (spell.fx === 'pass') {
      const tgt = this.battle.unit(e.targets[0]);
      const src = tgt && this.battle.passSource(this.battle.unit(e.unit), tgt);
      const sv = src && this.views.get(src.id);
      if (sv) this.at(dur * 0.25, () => this.fx.projectile(this.center(sv), this.center(targets[0]), dur * 0.75, 'pass'));
    } else if (spell.fx === 'smite' || spell.fx === 'judgement') {
      this.at(dur * 0.6, () => targets[0] && this.fx.pillar(this.center(targets[0]), { n: 20, life: 0.3 }));
    }
  }

  on_cast(e) {
    const v = this.views.get(e.unit);
    if (!v) return;
    const spell = SPELLS[e.spell];
    const T = e.targets.map((id) => this.views.get(id)).filter(Boolean);
    const fx = this.fx;
    const C = (t) => this.center(t);
    switch (spell.fx) {
      case 'ember': for (const t of T) fx.burst(C(t), { n: 10, speed: 34, life: 0.35 }); break;
      case 'bolt':
        for (const t of T) { fx.burst(C(t), { n: 24, speed: 60, life: 0.5 }); fx.flash(C(t), '#ff8a3a', 3.5, 5); }
        fx.shake(1.5);
        break;
      case 'lob': for (const t of T) { fx.flames(this.point(t, 0, 6), 30, 50, 30); fx.flash(C(t), '#ff7a2f', 2.5, 4); } break;
      case 'spark': for (const t of T) { fx.flames(this.point(t, 0, 8), 26, 56, 46, 'hot'); fx.flash(C(t), '#ffb347', 3, 4); } break;
      case 'beam':
        for (const t of T) {
          fx.burst(C(t), { n: 28, speed: 70, ramp: 'steel', life: 0.5, solid: true, g: 120 });
          fx.burst(C(t), { n: 16, speed: 46, ramp: 'hot', life: 0.4 });
          fx.flash(C(t), '#ffe0a0', 3, 5);
        }
        break;
      case 'flashpoint':
        for (const t of T) {
          fx.burst(C(t), { n: 90, speed: 130, life: 0.8, size: [1, 3], ramp: 'hot', g: 40, drag: 3 });
          fx.burst(C(t), { n: 40, speed: 60, life: 1.1, size: [2, 3], ramp: 'fire', g: -20 });
          fx.ring(t.base, { n: 48, speed: 110 });
          fx.flash(C(t), '#ffd28a', 9, 3);
          t.flash = 1;
        }
        fx.shake(5);
        this.whiteFlash = 1;
        break;
      case 'shield':
        for (const t of T) {
          fx.burst(C(t), { n: 22, speed: 34, ramp: 'steel', life: 0.6, g: -10, spreadX: 18, spreadY: 30 });
          if (e.spell === 'fireShield') fx.flames(this.point(t, 0, 0), 44, 80, 34);
          t.bubbleT = 0;
        }
        break;
      case 'heat': for (const t of T) { fx.flames(this.point(t, 0, 0), 36, 10, 34, 'heat'); fx.ring(t.base, { n: 28, speed: 60, ramp: 'heat' }); } break;
      case 'smoke': for (const t of T) fx.burst(C(t), { n: 30, speed: 30, ramp: 'smoke', life: 0.9, solid: true, g: -15, spreadX: 14, spreadY: 26 }); break;
      case 'spray': for (const t of T) fx.burst(C(t), { n: 12, speed: 34, life: 0.35 }); break;
      case 'pass': for (const t of T) { fx.burst(C(t), { n: 34, speed: 50, ramp: 'gold', life: 0.6 }); fx.flames(this.point(t, 0, 4), 30, 50, 24); } break;
      case 'pact':
        fx.flames(this.point(v, 0, 0), 40, 100, 70);
        for (const a of this.allViews(v.u.side)) fx.ring(a.base, { n: 24, speed: 60, ramp: 'heat' });
        fx.flash(C(v), '#ff5a6e', 5, 3);
        fx.shake(2);
        break;
      case 'wave':
        for (const t of T) { fx.flames(this.point(t, 0, 0), 44, 80, 70); fx.burst(C(t), { n: 44, speed: 90, ramp: 'hot', life: 0.6 }); fx.flash(C(t), '#ffb347', 7, 4); }
        fx.shake(4);
        break;
      case 'inferno':
        fx.ring(v.base, { n: 70, speed: 170, ramp: 'fire', life: 0.9, size: 3 });
        fx.flash(C(v), '#ff7a2f', 10, 1.5);
        fx.shake(4);
        break;
      case 'phoenix': for (const t of T) fx.burst(C(t), { n: 44, speed: 44, ramp: 'gold', life: 1.2, g: -12, spreadX: 14, spreadY: 40 }); break;
      case 'tap': for (const t of T) fx.burst(C(t), { n: 10, speed: 30, ramp: 'holy', life: 0.35 }); break;
      case 'heal': case 'renew': for (const t of T) fx.rise(this.point(t, 0, 10), 40, 80, 26, spell.fx === 'renew' ? 'heal' : 'holy'); break;
      case 'purify': for (const t of T) { fx.rise(this.point(t, 0, 10), 40, 90, 30, 'holy'); fx.burst(C(t), { n: 18, speed: 26, ramp: 'smoke', solid: true, g: -20, life: 0.8 }); } break;
      case 'smite':
        for (const t of T) { fx.pillar(C(t), { n: 70 }); fx.burst(C(t), { n: 24, speed: 50, ramp: 'holy', life: 0.5 }); fx.flash(C(t), '#fff0b3', 5, 4); }
        fx.shake(1.5);
        break;
      case 'prayer': for (const t of T) { fx.rise(this.point(t, 0, 10), 40, 80, 20, 'heal'); fx.ring(t.base, { n: 20, speed: 40, ramp: 'heal' }); } break;
      case 'absolve': for (const t of T) fx.rise(this.point(t, 0, 10), 40, 80, 30, 'poison'); break;
      case 'ward': for (const t of T) { fx.ring(t.base, { n: 30, speed: 40, ramp: 'holy' }); fx.rise(this.point(t, 0, 20), 46, 70, 16, 'holy'); } break;
      case 'sanctuary': for (const t of T) { fx.pillar(C(t), { n: 50, ramp: 'holy', width: 20 }); fx.ring(t.base, { n: 40, speed: 60, ramp: 'holy' }); } break;
      case 'link': for (const t of T) fx.line(this.center(v), C(t), { ramp: e.spell === 'guard' ? 'steel' : 'holy' }); break;
      case 'consecrate': for (const a of this.allViews(v.u.side)) fx.ring(a.base, { n: 30, speed: 50, ramp: 'holy' }); fx.flash(C(v), '#ffe08a', 4, 2); break;
      case 'judgement':
        for (const t of T) {
          fx.pillar(C(t), { n: 140, width: 14 });
          fx.burst(C(t), { n: 60, speed: 110, ramp: 'holy', life: 0.8, size: [1, 3] });
          fx.ring(t.base, { n: 40, speed: 100, ramp: 'holy' });
          fx.flash(C(t), '#fff0b3', 9, 2.5);
        }
        fx.shake(5);
        this.whiteFlash = 0.8;
        break;
      case 'resurrect': for (const t of T) { fx.pillar(this.point(t, 0, 0), { n: 160, width: 18, height: 200, life: 1 }); fx.flash(C(t), '#fff6dc', 8, 1.5); } break;
      case 'lastRites': for (const t of T) { fx.burst(C(t), { n: 80, speed: 80, ramp: 'holy', life: 1, g: -10 }); fx.flash(C(t), '#fff6dc', 9, 2); } this.whiteFlash = 0.6; break;
      case 'slash':
        for (const t of T) {
          const c = C(t);
          const d = t.flip ? -1 : 1;
          for (let i = 0; i < 14; i++) {
            const a = -0.9 + (i / 13) * 1.8;
            fx.glow.spawn({ x: c.x + (Math.cos(a) * 16 - 6) * d, y: c.y + Math.sin(a) * 22, z: c.z + 6, life: 0.18 + i * 0.006, size: 2, ramp: 'steel', shrink: true });
          }
        }
        break;
      case 'bash': case 'slam':
        for (const t of T) {
          fx.burst(C(t), { n: spell.fx === 'slam' ? 50 : 20, speed: spell.fx === 'slam' ? 100 : 55, ramp: 'steel', life: 0.5, solid: true, g: 100 });
          fx.flash(C(t), '#cfe4f7', spell.fx === 'slam' ? 6 : 3, 5);
        }
        fx.shake(spell.fx === 'slam' ? 5 : 2);
        break;
      case 'taunt':
        for (let i = 0; i < 3; i++) this.at(i * 0.08, () => fx.ring(v.base, { n: 36, speed: 90 + i * 30, ramp: 'taunt', life: 0.4 }));
        fx.burst(this.head(v), { n: 14, speed: 40, ramp: 'taunt', life: 0.4 });
        fx.shake(1.5);
        break;
      case 'spikes': fx.burst(C(v), { n: 40, speed: 50, ramp: 'steel', life: 0.5, solid: true, g: 0, drag: 6, spreadX: 10, spreadY: 26 }); break;
      case 'rally': for (const a of this.allViews(v.u.side)) fx.rise(this.point(a, 0, 0), 44, 100, 26, 'empower'); break;
      case 'kindled':
        for (const e2 of this.allViews(v.u.side === 'ally' ? 'enemy' : 'ally')) if (e2.u.s.burn) fx.projectile(this.center(e2), C(v), 0.4, 'lob');
        this.at(0.4, () => fx.burst(C(v), { n: 30, speed: 40, ramp: 'steel', life: 0.6 }));
        break;
      case 'bastion':
        fx.ring(v.base, { n: 60, speed: 120, ramp: 'steel', life: 0.8, size: 3 });
        for (const a of this.allViews(v.u.side)) if (a !== v) fx.line(C(a), C(v), { ramp: 'steel' });
        fx.flash(C(v), '#8fb3d9', 7, 2);
        fx.shake(3);
        break;
      case 'thwack': for (const t of T) fx.burst(C(t), { n: 14, speed: 44, ramp: 'dust', solid: true, life: 0.4, g: 60 }); break;
      case 'spit': for (const t of T) fx.burst(C(t), { n: 20, speed: 30, ramp: 'poison', solid: true, life: 0.6, g: 80 }); break;
    }
  }

  allViews(side) {
    return [...this.views.values()].filter((x) => x.u.side === side && x.u.alive);
  }

  on_damage(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const h = this.toCss(this.head(v));
    const enemyHit = v.u.side === 'enemy';
    if (e.amount > 0) {
      let cls = { burn: 'n-burn', poison: 'n-poison', attack: 'n-attack', spikes: 'n-steel', area: 'n-steel' }[e.kind] || 'n-spell';
      if (!enemyHit && e.kind !== 'burn' && e.kind !== 'poison') cls = 'n-hurt';
      if (e.big && e.amount >= 30) cls += ' n-big';
      this.overlay.number(h.x, h.y + 6, String(e.amount), cls);
    }
    if (e.blocked > 0) this.overlay.number(h.x + 22, h.y + 18, `−${e.blocked}`, 'n-block', { dx: 10, rise: 18 });
    const hurt = e.amount + e.blocked * 0.5;
    const dot = e.kind === 'burn' || e.kind === 'poison';
    v.flash = dot ? 0.45 : 1;
    v.flashColor = e.kind === 'poison' ? '#d8ff9a' : '#fff8ec';
    v.hitT = 0;
    if (v.isDummy) v.wobV += Math.min(5, 1 + hurt / 6) * (dot ? 0.5 : 1);
    if (!dot) v.knock = Math.min(5, 1 + hurt / 8);
    if (e.big && e.amount >= 40) {
      this.fx.shake(6);
      this.overlay.banner(`${e.amount}`, SPELLS[e.source]?.name ?? '', 'tone-burn');
    }
  }

  on_heal(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const h = this.toCss(this.head(v));
    if (e.amount > 0) this.overlay.number(h.x - 10, h.y + 6, `+${e.amount}`, 'n-heal', { dx: -6 });
    if (e.source === 'regen' && e.amount > 0) this.fx.rise(this.point(v, 0, 10), 30, 60, 4, 'heal');
  }

  on_status(e) {
    const v = this.views.get(e.tgt);
    const quiet = ['flashpoint', 'passTheFlame', 'regen', 'lastRites', 'shieldSlam'];
    if (!v || quiet.includes(e.source) || (e.source === 'wildfire' && e.key === 'burn')) return;
    const meta = STATUSES[e.key];
    const c = this.toCss(this.point(v, 0, v.K.body + 20));
    if (meta.flag) {
      if (e.delta > 0) this.overlay.number(c.x, c.y, meta.name, `n-tag tone-${meta.tone}`, { dx: 0, rise: 22, duration: 1200 });
      return;
    }
    if (e.key === 'block' && e.delta > 0) v.bubbleT = 0;
    if (e.key === 'burn' && e.delta > 0 && e.source !== 'phoenixAsh') this.fx.flames(this.point(v, 0, 6), 26, 40, 4 + e.delta * 2);
    if (e.key === 'poison' && e.delta > 0) this.fx.burst(this.center(v), { n: 6 + e.delta * 2, speed: 24, ramp: 'poison', solid: true, life: 0.6, g: 60 });
    const sign = e.delta > 0 ? '+' : '−';
    this.overlay.number(c.x + (v.flip ? -30 : 30), c.y, `${sign}${Math.abs(e.delta)} ${meta.name}`, `n-status tone-${meta.tone}`, { dx: v.flip ? -6 : 6, rise: 16, duration: 900 });
  }

  on_timer(e) {
    if (!e.on) return;
    const v = this.views.get(e.tgt);
    if (!v) return;
    const meta = TIMERS[e.key];
    const c = this.toCss(this.point(v, 0, v.K.body + 30));
    this.overlay.number(c.x, c.y, meta.name, `n-tag tone-${meta.tone}`, { dx: 0, rise: 22, duration: 1200 });
  }

  on_redirect(e) {
    const a = this.views.get(e.from);
    const b = this.views.get(e.tgt);
    if (a && b) this.fx.line(this.center(a), this.center(b), { ramp: 'steel', n: 14, life: 0.3 });
  }

  on_warded(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const c = this.toCss(this.point(v, 0, v.K.body + 30));
    this.overlay.number(c.x, c.y, 'Warded', 'n-tag tone-gold', { dx: 0, rise: 22, duration: 1100 });
    this.fx.ring(v.base, { n: 24, speed: 40, ramp: 'holy' });
  }

  on_plague(e) {
    const a = this.views.get(e.src);
    const b = this.views.get(e.tgt);
    if (a && b) this.fx.projectile(this.hand(a, 'cast1'), this.center(b), 0.45, 'poison');
  }

  on_reprisal(e) {
    const v = this.views.get(e.unit);
    if (!v) return;
    this.fx.ring(v.base, { n: 60, speed: 160, ramp: 'steel', life: 0.6, size: 3 });
    this.overlay.banner('Reprisal', '10 damage to all enemies', 'tone-block');
    this.fx.shake(3);
  }

  on_knock(e) {
    const v = this.views.get(e.tgt);
    if (v) { v.wobV += 4; v.knock = 6; }
  }

  on_wait(e) {
    const v = this.views.get(e.unit);
    if (!v || v.isDummy) return;
    this.overlay.waiting(v.id, true, e.silenced ? 'Silenced' : 'Waiting');
  }

  on_consecrate(e) {
    if (e.on) for (const a of this.allViews(e.side)) this.fx.rise(this.point(a, 0, 0), 40, 20, 16, 'holy');
  }

  on_blockBreak(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const c = this.center(v);
    this.fx.burst(c, { n: 40, speed: 80, ramp: 'steel', life: 0.7, solid: true, g: 140, size: [1, 2], spreadX: 16, spreadY: 26, floor: true });
    this.fx.flash(c, '#cfe4f7', 4, 5);
    this.fx.shake(2);
    const h = this.toCss(this.point(v, 0, v.K.body + 10));
    this.overlay.number(h.x, h.y, 'Shattered', 'n-tag tone-block', { dx: 0, rise: 20, duration: 1100 });
  }

  on_burnTick(e) {
    const v = this.views.get(e.tgt);
    if (v) this.fx.flames(this.point(v, 0, 6), 28, 54, 6 + Math.min(24, e.amount));
  }

  on_spread(e) {
    const a = this.views.get(e.from);
    const b = this.views.get(e.tgt);
    if (a && b) this.fx.projectile(this.center(a), this.center(b), 0.35, 'lob');
  }

  on_death(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    v.deadT = 0.0001;
    this.overlay.waiting(v.id, false);
    this.fx.burst(this.point(v, 0, 8), { n: 34, speed: 44, ramp: 'dust', solid: true, life: 0.9, g: 30, spreadX: 20, floor: true });
    if (v.isDummy) this.overlay.banner('Dummy down', `${v.u.name} is back in 2s`, 'tone-muted');
    else this.overlay.banner(`${v.u.name} is down`, 'Resurrection can bring her back', 'tone-hurt');
  }

  on_respawn(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    v.deadT = 0;
    v.dropT = 0;
    v.landed = false;
    v.wob = 0;
    v.wobV = 0;
  }

  on_revive(e) {
    this.on_respawn(e);
    const v = this.views.get(e.tgt);
    if (v) this.overlay.banner('Resurrection', `${v.u.name} is back at 30%`, 'tone-gold');
  }

  on_inferno(e) {
    if (e.side !== 'enemy') return;
    this.infernoOn = e.on;
    this.onInferno(e.on);
    if (e.on) this.overlay.banner('Inferno', 'Burn ignores Block for 6s', 'tone-burn');
  }

  on_phoenix(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    this.overlay.banner('Phoenix Ash', `${v.u.name} saved at 1 HP`, 'tone-gold');
    this.fx.burst(this.center(v), { n: 90, speed: 100, ramp: 'gold', life: 1.2, g: -10 });
    this.fx.ring(v.base, { n: 44, speed: 110, ramp: 'gold' });
    this.fx.flash(this.center(v), '#ffd56b', 8, 2);
  }

  // ------------------------------------------------------------- frame

  render(realDt, simDt, simTime) {
    this.time += realDt;
    this.simTime = simTime;
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      const t = this.timeline[i];
      if (simTime >= t.at) {
        this.timeline.splice(i, 1);
        t.fn();
      }
    }
    for (const v of this.views.values()) this.updateView(v, realDt, simDt);

    const sel = this.views.get(this.selected);
    if (this.selRing) {
      this.selRing.visible = !!sel && sel.u.alive;
      if (sel) this.selRing.position.set(sel.base.x, 0.08, sel.base.z);
      this.selRing.material.opacity = 0.55 + 0.25 * Math.sin(this.time * 3);
    }

    for (const L of this.lanterns || []) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 7 + L.phase) * Math.sin(this.time * 3.1 + L.phase * 2);
      L.light.intensity = 1.5 * f + (this.infernoOn ? 0.6 : 0);
    }

    this.fx.ambient(simDt || realDt * 0.5, { x0: -this.size.iw / 2, x1: this.size.iw / 2 });
    this.fx.update(simDt, realDt);

    const s = this.fx.shakeAmt;
    const sx = s > 0.3 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    const sy = s > 0.3 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    this.camera.position.copy(this.camBase).add(new THREE.Vector3(sx, 0, 0)).addScaledVector(UP, sy);

    this.whiteFlash = Math.max(0, (this.whiteFlash || 0) - realDt * 5);
    this.el.style.setProperty('--white', this.whiteFlash.toFixed(3));
    this.renderer.render(this.scene, this.camera);
  }

  updateView(v, realDt, dt) {
    const u = v.u;
    const m = v.mat.uniforms;
    m.time.value = this.time;

    let frame;
    v.hitT += dt;
    if (!v.isDummy) {
      const a = v.anim;
      const p = a ? (this.simTime - a.start) / a.dur : 9;
      if (v.deadT > 0) frame = 'hit';
      else if (a && p < 1.15) {
        if (a.motion === 'throw') frame = p < 0.4 ? 'cast1' : 'attack';
        else if (a.motion === 'melee') frame = p < 0.3 ? 'cast0' : 'attack';
        else frame = p < 0.35 ? 'cast0' : 'cast1';
      } else if (v.hitT < 0.2) frame = 'hit';
      else {
        v.blinkIn -= realDt;
        if (v.blinkIn < 0) { v.blinkT = 0.12; v.blinkIn = rand(2, 5); }
        v.blinkT -= realDt;
        frame = v.blinkT > 0 ? 'blink' : Math.floor((this.time + v.base.x * 0.01) / 0.55) % 2 ? 'idle1' : 'idle0';
      }
    } else {
      frame = v.hitT < 0.22 || v.deadT > 0 ? 'hit' : 'idle';
    }
    if (frame !== v.frame) {
      v.frame = frame;
      m.map.value = v.frames[frame];
    }

    v.wobV += (-38 * v.wob - 5 * v.wobV) * dt;
    v.wob += v.wobV * dt;
    v.knock *= Math.max(0, 1 - dt * 10);
    v.lunge = Math.max(0, v.lunge - dt * 4);
    v.flash = Math.max(0, v.flash - dt * 7);
    m.flash.value = v.flash > 0.5 ? 0.85 : v.flash > 0.15 ? 0.4 : 0;
    m.flashColor.value.set(v.flashColor);

    const pos = v.base.clone();
    const away = v.flip ? 1 : -1; // direction away from the enemy
    pos.x += away * v.knock * 0.8 - away * Math.sin(Math.min(1, v.lunge) * Math.PI) * 14;
    let rot = v.isDummy ? (v.flip ? 1 : -1) * Math.max(-0.35, Math.min(0.35, v.wob * 0.07)) : 0;
    let opacity = 1;

    if (v.deadT > 0) {
      v.deadT += dt;
      const k = Math.min(1, v.deadT / 0.45);
      if (v.isDummy) {
        rot = (v.flip ? 1 : -1) * -1.45 * (1 - (1 - k) ** 3);
        opacity = Math.max(0, 1 - Math.max(0, v.deadT - 0.9) * 2);
      } else {
        opacity = 0.35 + 0.65 * (1 - k);
        m.tint.value.setRGB(0.6, 0.55, 0.7);
      }
    } else if (!v.isDummy) {
      m.tint.value.setRGB(1, 1, 1);
    }
    if (u.alive && u.s.sanctuary) opacity = 0.55 + 0.1 * Math.sin(this.time * 5);
    if (v.dropT < 0.6) {
      v.dropT += dt;
      const k = Math.min(1, v.dropT / 0.35);
      pos.addScaledVector(UP, (1 - k * k) * 70);
      if (k >= 1 && !v.landed) {
        v.landed = true;
        this.fx.burst(this.point(v, 0, 1), { n: 30, speed: 56, ramp: 'dust', solid: true, life: 0.6, g: 40, spreadX: 18, floor: true });
        v.wobV += 3;
        this.fx.shake(1.5);
      }
    }
    v.mesh.rotation.z = rot;
    m.opacity.value = opacity;
    v.group.position.copy(this.snap(pos));
    v.shadow.material.opacity = 0.75 * opacity * (v.dropT < 0.35 ? v.dropT / 0.35 : 1);

    const burn = u.alive ? u.s.burn : 0;
    m.burn.value = burn > 0 ? Math.min(0.9, 0.25 + burn / 40) : 0;
    m.poison.value = u.alive && u.s.poison > 0 ? Math.min(0.8, 0.3 + u.s.poison / 30) : 0;
    const warm = this.infernoOn && u.side === 'enemy' ? 0.06 : 0;
    m.add.value.setRGB(warm, warm * 0.4, 0);

    v.bubble.visible = u.alive && u.s.block > 0;
    if (v.bubble.visible) {
      v.bubbleT += realDt;
      const pop = Math.min(1, v.bubbleT / 0.15);
      v.bubble.material.opacity = (0.5 + 0.2 * Math.sin(this.time * 4)) * pop;
    }

    if (v.rune) {
      v.runeT = Math.max(0, v.runeT - dt);
      v.rune.material.opacity = Math.min(1, v.runeT * 4) * (0.75 + 0.25 * Math.sin(this.time * 20));
    }

    const lp = this.center(v);
    v.light.position.set(lp.x, 18, v.base.z + 16);
    v.light.intensity = burn > 0 ? (0.8 + Math.min(2.6, burn * 0.08)) * (0.8 + 0.2 * Math.sin(this.time * 13 + v.base.x)) : 0;

    if (dt > 0 && u.alive) {
      v.emit += dt * (burn > 0 ? 3 + Math.min(36, burn * 1.1) : 0);
      while (v.emit >= 1) {
        v.emit -= 1;
        this.fx.flames(this.point(v, 0, 4), 28, 70, 1);
      }
      if (u.s.poison > 0) {
        v.poisonEmit += dt * Math.min(14, 2 + u.s.poison * 0.6);
        while (v.poisonEmit >= 1) {
          v.poisonEmit -= 1;
          const p = this.point(v, rand(-14, 14), rand(10, 80));
          this.fx.solid.spawn({ x: p.x, y: p.y, z: p.z, vy: rand(4, 14), life: rand(0.5, 0.9), size: Math.random() < 0.3 ? 2 : 1, ramp: 'poison', wobble: 4, seed: Math.random() * 9, fade: true });
        }
      }
      if (u.s.heat > 0) {
        v.heatEmit += dt * Math.min(20, u.s.heat * 1.5);
        while (v.heatEmit >= 1) {
          v.heatEmit -= 1;
          this.fx.glow.spawn({ x: v.base.x + rand(-16, 16), y: rand(0, 8), z: v.base.z + 8, vy: rand(24, 48), life: rand(0.4, 0.8), size: 1, ramp: 'heat', wobble: 6, seed: Math.random() * 9, shrink: true });
        }
      }
      const aura = u.s.phoenix ? 'gold' : u.s.fireShield || u.s.wildfire ? 'fire' : u.tm.taunt > 0 ? 'taunt' : u.tm.bastion > 0 ? 'steel' : u.s.ward ? 'holy' : u.s.empower ? 'empower' : null;
      if (aura) {
        v.auraEmit += dt * 8;
        while (v.auraEmit >= 1) {
          v.auraEmit -= 1;
          const a = Math.random() * Math.PI * 2;
          const p = this.point(v, Math.cos(a) * 24, v.K.body + Math.sin(a) * 48);
          this.fx.glow.spawn({ x: p.x, y: p.y, z: p.z, vy: rand(4, 12), life: rand(0.4, 0.9), size: 1, ramp: aura, shrink: true });
        }
      }
    }

    const top = this.toCss(this.point(v, 0, v.K.top + 4));
    const foot = this.toCss(this.point(v, 0, 0));
    this.overlay.place(v.id, u.side, top.x, top.y, u, { x: foot.x, bottom: foot.y, top: top.y, w: (v.isDummy ? 50 : 56) * this.cssPerPx });
  }
}
