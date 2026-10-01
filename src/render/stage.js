// Three.js battle stage. The scene renders at true pixel-art resolution (one texel = one
// screen pixel) and the canvas is upscaled by a whole number with nearest-neighbour sampling.
// The camera is orthographic with a slight downward tilt; sprites are billboards that face it,
// so they keep exact pixel scale while the floor recedes.

import * as THREE from 'three';
import { drawMage, MAGE_FRAMES, MAGE_W, MAGE_H, handPos } from '../art/mage.js';
import { drawDummy, DUMMY_W, DUMMY_H } from '../art/dummy.js';
import {
  drawSky, drawSkyline, drawBalustrade, drawFloorTile, drawDuelCircle, drawRune,
  drawShadow, drawGlow, drawShieldBubble, drawLantern,
} from '../art/env.js';
import { FX, rand } from './fx.js';
import { Overlay } from './overlay.js';
import { SPELLS, STATUSES, TPS } from '../sim/data.js';

THREE.ColorManagement.enabled = false;

const THETA = 0.3;
const SIN = Math.sin(THETA);
const COS = Math.cos(THETA);
const UP = new THREE.Vector3(0, COS, -SIN); // camera up, in world space
const TO_CAM = new THREE.Vector3(0, SIN, COS);
const DUMMY_Z = [0, -8, -16];

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
  uniform float flash, opacity, burn, time;
  uniform vec3 tint, add;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    vec3 col = c.rgb * tint + add;
    float b = burn * (0.6 + 0.4 * sin(time * 9.0 + vUv.y * 18.0)) * (1.1 - vUv.y);
    b = floor(clamp(b, 0.0, 1.0) * 4.0) / 4.0;
    col = mix(col, col * vec3(1.3, 0.82, 0.6) + vec3(0.14, 0.04, 0.0), b);
    col = mix(col, vec3(1.0, 0.97, 0.92), flash);
    gl_FragColor = vec4(col, opacity);
  }`;

function spriteMat(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, flash: { value: 0 }, opacity: { value: 1 }, burn: { value: 0 }, time: { value: 0 },
      tint: { value: new THREE.Color(1, 1, 1) }, add: { value: new THREE.Color(0, 0, 0) },
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

const PROJECTILE = { bolt: 'bolt', lob: 'lob', spark: 'spark', beam: 'beam', pass: 'pass', wave: 'wave', flashpoint: 'bolt', spray: 'spray' };

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
    this.onInferno = () => {};

    // Shared textures
    this.tx = {
      mage: Object.fromEntries(Object.entries(MAGE_FRAMES).map(([k, f]) => [k, tex(drawMage(f))])),
      dummy: [0, 1, 2].map((v) => ({ idle: tex(drawDummy(v)), hit: tex(drawDummy(v, { hit: true })) })),
      shadow: drawShadow(13, 3),
      bubbleMage: tex(drawShieldBubble(17, 33)),
      bubbleDummy: tex(drawShieldBubble(17, 28)),
      rune: drawRune(18, 5),
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
    const scale = Math.max(1, Math.floor(Math.min(devW / 192, devH / 150)));
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
    // feet line sits 25% up from the bottom
    this.T.set(0, (0.25 * ih) / COS, 0);
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

    const FAR = Math.round((0.31 * ih) / SIN);
    const NEAR = Math.round(ih / SIN);
    this.far = FAR;
    const hz = Math.round(-0.25 * ih + FAR * SIN); // horizon in camera pixels from centre

    const sky = plane(iw, ih, new THREE.MeshBasicMaterial({ map: tex(drawSky(iw, ih, ih / 2 - hz)), depthWrite: false }), 'center');
    sky.position.set(0, 0, -2900);
    bg.add(sky);
    const farLine = plane(iw + 8, 84, basicMat(tex(drawSkyline(iw + 8, 84, false, 3))));
    farLine.position.set(0, hz + 10, -2800);
    bg.add(farLine);
    const nearLine = plane(iw + 8, 58, basicMat(tex(drawSkyline(iw + 8, 58, true, 9))));
    nearLine.position.set(0, hz + 10, -2700);
    bg.add(nearLine);
    const bal = plane(iw + 8, 16, basicMat(tex(drawBalustrade(iw + 8))));
    bal.position.set(0, hz - 1, -2600);
    bg.add(bal);

    // floor
    const W = iw + 240;
    const D = FAR + NEAR;
    const tile = tex(drawFloorTile());
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(W / 64, (D * SIN) / 48);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tile }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (NEAR - FAR) / 2);
    env.add(floor);

    const circle = floorDecal(drawDuelCircle(96, 22));
    circle.position.set(-6, 0.05, -6);
    env.add(circle);

    // lanterns at the courtyard edge
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
      const light = new THREE.PointLight('#ffb35c', 1.6, 120, 0);
      light.position.set(x, 26, z + 10);
      env.add(light);
      this.lanterns.push({ light, halo, phase: Math.random() * 10 });
    }

    // rune under the mage
    this.rune = floorDecal(this.tx.rune, { emissive: new THREE.Color('#ff8a3a'), emissiveIntensity: 0.9, opacity: 0 });
    this.rune.position.set(-Math.round(iw * 0.3) + 4, 0.1, 0);
    env.add(this.rune);

    for (const v of this.views.values()) this.layoutView(v);
  }

  // Unit spots scale with the visible width so 1-3 dummies always fit.
  spot(u) {
    const iw = this.size.iw;
    if (u.side === 'ally') return new THREE.Vector3(-Math.round(iw * 0.3), 0, 0);
    return new THREE.Vector3(Math.round(iw * 0.06) + u.slot * 29, 0, DUMMY_Z[u.slot]);
  }

  layoutView(v) {
    v.base.copy(this.spot(v.u));
    v.shadow.position.set(v.base.x + (v.isMage ? 4 : 0), 0.06, v.base.z);
  }

  // ------------------------------------------------------------- units

  bind(battle) {
    this.battle = battle;
    for (const v of this.views.values()) {
      v.group.removeFromParent();
      v.shadow.removeFromParent();
      v.light.removeFromParent();
    }
    this.views.clear();
    this.overlay.clear();
    this.fx.clear();
    this.timeline.length = 0;
    this.infernoOn = false;
    for (const u of battle.units) this.views.set(u.id, this.makeView(u));
  }

  makeView(u) {
    const isMage = u.def.kind === 'mage';
    const frames = isMage ? this.tx.mage : this.tx.dummy[u.def.variant ?? 0];
    const w = isMage ? MAGE_W : DUMMY_W;
    const h = isMage ? MAGE_H : DUMMY_H;
    const mat = spriteMat(isMage ? frames.idle0 : frames.idle);
    const mesh = plane(w, h, mat);
    const group = new THREE.Group();
    group.rotation.x = -THETA;
    group.add(mesh);
    const flip = u.side === 'enemy';
    if (flip) mesh.scale.x = -1;
    const bubble = plane(34, isMage ? 66 : 56, basicMat(isMage ? this.tx.bubbleMage : this.tx.bubbleDummy, { extra: { opacity: 0.9 } }));
    bubble.position.set(isMage ? -3 : 0, isMage ? -1 : 0, 2);
    bubble.visible = false;
    group.add(bubble);
    this.scene.add(group);

    const shadow = floorDecal(this.tx.shadow, { opacity: 0.75 });
    this.scene.add(shadow);
    const light = new THREE.PointLight('#ff7a2f', 0, 90, 0);
    this.scene.add(light);

    const base = new THREE.Vector3();
    const v = {
      id: u.id, u, isMage, frames, mesh, mat, group, bubble, shadow, light, base, flip, w, h,
      frame: '', anim: null, hitT: 9, flash: 0, wob: 0, wobV: 0, knock: 0,
      deadT: 0, dropT: 9, blinkIn: rand(1, 4), blinkT: 0, emit: 0, heatEmit: 0, auraEmit: 0, bubbleT: 0,
    };
    this.layoutView(v);
    return v;
  }

  // A point on the unit's sprite, in sprite pixels from the bottom centre (x toward the enemy).
  point(v, sx, sy, out = new THREE.Vector3()) {
    const dir = v.flip ? -1 : 1;
    return out.copy(v.base).addScaledVector(UP, sy).add(new THREE.Vector3(sx * dir, 0, 0)).addScaledVector(TO_CAM, 8);
  }
  center(v) {
    return this.point(v, v.isMage ? 4 : 0, v.isMage ? 30 : 28);
  }
  head(v) {
    return this.point(v, v.isMage ? 6 : 0, v.isMage ? 62 : 54);
  }
  hand(v, arm = 'up') {
    const [hx, hy] = handPos(arm);
    return this.point(v, hx - MAGE_W / 2, MAGE_H - hy);
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
    v.anim = { spell: e.spell, start: this.simTime, dur };
    const spell = SPELLS[e.spell];
    const targets = e.targets.map((id) => this.views.get(id)).filter(Boolean);

    if (e.spell === 'attack') {
      if (v.isMage) {
        this.at(dur * 0.45, () => targets[0] && this.fx.projectile(this.hand(v, 'forward'), this.center(targets[0]), dur * 0.55, 'ember'));
      } else {
        v.knock = -5;
        this.overlay.castLabel(v.id, 'Thwack', 'tone-enemy');
      }
      return;
    }

    if (v.isMage) {
      const n = e.line + 1;
      this.overlay.castLabel(v.id, `<b>${n}</b>${spell.name}`, `rar-${spell.rarity}`);
      this.runeT = dur + 0.25;
      this.fx.flash(this.hand(v), '#ffb347', 2.2, 3);
    } else {
      this.overlay.castLabel(v.id, spell.name, 'tone-enemy');
    }

    const style = PROJECTILE[spell.fx];
    if (v.isMage && style && style !== 'spray' && style !== 'wave' && style !== 'pass') {
      this.at(dur * 0.4, () => {
        const tv = targets[0];
        if (tv) this.fx.projectile(this.hand(v, 'forward'), this.center(tv), dur * 0.6, style);
      });
    } else if (spell.fx === 'spray') {
      for (const tv of targets) {
        for (let i = 0; i < 4; i++) {
          this.at(dur * (0.3 + i * 0.07), () => this.fx.projectile(this.hand(v, 'forward'), this.point(tv, rand(-6, 6), rand(16, 40)), dur * 0.45, 'spray'));
        }
      }
    } else if (spell.fx === 'wave') {
      this.at(dur * 0.3, () => targets[0] && this.fx.projectile(this.point(v, 14, 2), this.point(targets[0], 0, 2), dur * 0.7, 'wave'));
    } else if (spell.fx === 'pass') {
      const tgt = this.battle.unit(e.targets[0]);
      const src = tgt && this.battle.passSource(this.battle.unit(e.unit), tgt);
      const sv = src && this.views.get(src.id);
      if (sv) this.at(dur * 0.25, () => this.fx.projectile(this.center(sv), this.center(targets[0]), dur * 0.75, 'pass'));
    }
  }

  on_cast(e) {
    const v = this.views.get(e.unit);
    if (!v || e.spell === 'attack') {
      const tv = this.views.get(e.targets?.[0]);
      if (tv) this.fx.burst(this.center(tv), { n: 8, speed: 30, life: 0.35 });
      return;
    }
    const spell = SPELLS[e.spell];
    const targets = e.targets.map((id) => this.views.get(id)).filter(Boolean);
    const fx = this.fx;
    switch (spell.fx) {
      case 'bolt':
        for (const t of targets) {
          fx.burst(this.center(t), { n: 22, speed: 55, life: 0.5 });
          fx.flash(this.center(t), '#ff8a3a', 3.5, 5);
        }
        fx.shake(1.5);
        break;
      case 'lob':
        for (const t of targets) {
          fx.flames(this.point(t, 0, 4), 22, 30, 26);
          fx.burst(this.center(t), { n: 10, speed: 30, life: 0.4 });
          fx.flash(this.center(t), '#ff7a2f', 2.5, 4);
        }
        break;
      case 'spark':
        for (const t of targets) {
          fx.flames(this.point(t, 0, 6), 18, 34, 40, 'hot');
          fx.flash(this.center(t), '#ffb347', 3, 4);
        }
        break;
      case 'beam':
        for (const t of targets) {
          fx.burst(this.center(t), { n: 24, speed: 60, ramp: 'steel', life: 0.5, solid: true, g: 120 });
          fx.burst(this.center(t), { n: 14, speed: 40, ramp: 'hot', life: 0.4 });
          fx.flash(this.center(t), '#ffe0a0', 3, 5);
        }
        break;
      case 'flashpoint':
        for (const t of targets) {
          const c = this.center(t);
          fx.burst(c, { n: 70, speed: 110, life: 0.8, size: [1, 3], ramp: 'hot', g: 40, drag: 3 });
          fx.burst(c, { n: 30, speed: 50, life: 1.1, size: [2, 3], ramp: 'fire', g: -20 });
          fx.ring(t.base, { n: 40, speed: 90 });
          fx.flash(c, '#ffd28a', 9, 3);
          t.flash = 1;
        }
        fx.shake(5);
        this.whiteFlash = 1;
        break;
      case 'shield':
        for (const t of targets) {
          fx.burst(this.center(t), { n: 18, speed: 30, ramp: 'steel', life: 0.6, g: -10, spreadX: 12, spreadY: 20 });
          if (e.spell === 'fireShield') fx.flames(this.point(t, 0, 0), 30, 50, 30);
          t.bubbleT = 0;
        }
        break;
      case 'buff':
        for (const t of targets) {
          if (e.spell === 'smother') fx.burst(this.center(t), { n: 24, speed: 25, ramp: 'smoke', life: 0.9, solid: true, g: -15, spreadX: 10, spreadY: 18 });
          else {
            fx.flames(this.point(t, 0, 0), 26, 8, 30, 'heat');
            fx.ring(t.base, { n: 24, speed: 50, ramp: 'heat' });
          }
        }
        break;
      case 'spray':
        for (const t of targets) fx.burst(this.center(t), { n: 10, speed: 30, life: 0.35 });
        break;
      case 'pass':
        for (const t of targets) {
          fx.burst(this.center(t), { n: 30, speed: 45, ramp: 'gold', life: 0.6 });
          fx.flames(this.point(t, 0, 4), 22, 30, 20);
        }
        break;
      case 'pact':
        fx.flames(this.point(v, 4, 0), 30, 56, 60);
        fx.ring(v.base, { n: 36, speed: 70, ramp: 'heat' });
        fx.flash(this.center(v), '#ff5a6e', 5, 3);
        fx.shake(2);
        break;
      case 'wave':
        for (const t of targets) {
          fx.flames(this.point(t, 0, 0), 34, 50, 60);
          fx.burst(this.center(t), { n: 40, speed: 80, ramp: 'hot', life: 0.6 });
          fx.flash(this.center(t), '#ffb347', 7, 4);
        }
        fx.shake(4);
        break;
      case 'inferno':
        fx.ring(v.base, { n: 60, speed: 140, ramp: 'fire', life: 0.8, size: 3 });
        fx.flash(this.center(v), '#ff7a2f', 10, 1.5);
        fx.shake(4);
        break;
      case 'phoenix':
        for (const t of targets) fx.burst(this.center(t), { n: 40, speed: 40, ramp: 'gold', life: 1.2, g: -12, spreadX: 10, spreadY: 24 });
        break;
    }
  }

  on_damage(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const h = this.toCss(this.head(v));
    const enemyHit = v.u.side === 'enemy';
    if (e.amount > 0) {
      let cls = e.kind === 'burn' ? 'n-burn' : e.kind === 'attack' ? 'n-attack' : 'n-spell';
      if (!enemyHit) cls = 'n-hurt';
      if (e.big && e.amount >= 30) cls += ' n-big';
      this.overlay.number(h.x, h.y - 4, String(e.amount), cls);
    }
    if (e.blocked > 0) this.overlay.number(h.x + 18, h.y + 8, `−${e.blocked}`, 'n-block', { dx: 10, rise: 18 });
    const hurt = e.amount + e.blocked * 0.5;
    v.flash = e.kind === 'burn' ? 0.45 : 1;
    if (v.isMage) v.hitT = 0;
    else {
      v.hitT = 0;
      v.wobV += Math.min(5, 1 + hurt / 6) * (e.kind === 'burn' ? 0.5 : 1);
      if (e.kind !== 'burn') v.knock = Math.min(4, 1 + hurt / 10);
    }
    if (e.big && e.amount >= 40) {
      this.fx.shake(6);
      this.overlay.banner(`${e.amount}`, SPELLS[e.source]?.name ?? '', 'tone-burn');
    }
  }

  on_status(e) {
    const v = this.views.get(e.tgt);
    if (!v || e.source === 'flashpoint' || e.source === 'passTheFlame' || e.source === 'wildfire' && e.key === 'burn') return;
    const meta = STATUSES[e.key];
    const c = this.toCss(this.point(v, v.isMage ? 2 : 0, v.isMage ? 44 : 40));
    if (meta.flag) {
      if (e.delta > 0) this.overlay.number(c.x, c.y, meta.name, `n-tag tone-${meta.tone}`, { dx: 0, rise: 22, duration: 1200 });
      return;
    }
    if (e.source === 'brace' || e.source === 'fireShield' || e.source === 'smother') {
      if (e.key === 'block') v.bubbleT = 0;
    }
    if (e.key === 'burn' && e.delta > 0 && e.source !== 'phoenixAsh') this.fx.flames(this.point(v, 0, 4), 18, 26, 4 + e.delta * 2);
    const sign = e.delta > 0 ? '+' : '−';
    this.overlay.number(c.x + (v.flip ? -22 : 22), c.y, `${sign}${Math.abs(e.delta)} ${meta.name}`, `n-status tone-${meta.tone}`, { dx: v.flip ? -6 : 6, rise: 16, duration: 900 });
  }

  on_blockBreak(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    const c = this.center(v);
    this.fx.burst(c, { n: 34, speed: 70, ramp: 'steel', life: 0.7, solid: true, g: 140, size: [1, 2], spreadX: 12, spreadY: 18, floor: true });
    this.fx.flash(c, '#cfe4f7', 4, 5);
    this.fx.shake(2);
    const h = this.toCss(this.point(v, 0, 34));
    this.overlay.number(h.x, h.y, 'Shattered', 'n-tag tone-block', { dx: 0, rise: 20, duration: 1100 });
  }

  on_burnTick(e) {
    const v = this.views.get(e.tgt);
    if (v) this.fx.flames(this.point(v, 0, 4), 20, 34, 6 + Math.min(24, e.amount));
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
    this.fx.burst(this.point(v, 0, 6), { n: 30, speed: 40, ramp: 'dust', solid: true, life: 0.9, g: 30, spreadX: 14, floor: true });
    this.fx.flames(this.point(v, 0, 4), 24, 40, 30);
    if (!v.isMage) this.overlay.banner('Dummy down', `${v.u.name} is back in 2s`, 'tone-muted');
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

  on_inferno(e) {
    if (e.side !== 'enemy') return;
    this.infernoOn = e.on;
    this.onInferno(e.on);
    if (e.on) this.overlay.banner('Inferno', 'Burn ignores Block for 6s', 'tone-burn');
  }

  on_phoenix(e) {
    const v = this.views.get(e.tgt);
    if (!v) return;
    this.overlay.banner('Phoenix Ash', 'Saved at 1 HP', 'tone-gold');
    this.fx.burst(this.center(v), { n: 80, speed: 90, ramp: 'gold', life: 1.2, g: -10 });
    this.fx.ring(v.base, { n: 40, speed: 100, ramp: 'gold' });
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

    // rune under the mage while casting
    this.runeT = Math.max(0, (this.runeT || 0) - simDt);
    if (this.rune) this.rune.material.opacity = Math.min(1, this.runeT * 4) * (0.75 + 0.25 * Math.sin(this.time * 20));

    for (const L of this.lanterns || []) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 7 + L.phase) * Math.sin(this.time * 3.1 + L.phase * 2);
      L.light.intensity = 1.5 * f + (this.infernoOn ? 0.6 : 0);
    }

    this.fx.ambient(simDt || realDt * 0.5, { x0: -this.size.iw / 2, x1: this.size.iw / 2 });
    this.fx.update(simDt, realDt);

    // integer-pixel screen shake
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

    // pick the frame
    let frame;
    v.hitT += dt;
    if (v.isMage) {
      const a = v.anim;
      const p = a ? (this.simTime - a.start) / a.dur : 9;
      if (v.deadT > 0) frame = 'hit';
      else if (a && p < 1.15) {
        if (a.spell === 'attack') frame = p < 0.4 ? 'cast0' : 'attack';
        else {
          const fx = SPELLS[a.spell].fx;
          const thrown = PROJECTILE[fx] && fx !== 'flashpoint';
          frame = thrown ? (p < 0.4 ? 'cast1' : 'attack') : p < 0.35 ? 'cast0' : 'cast1';
        }
      } else if (v.hitT < 0.2) frame = 'hit';
      else {
        v.blinkIn -= realDt;
        if (v.blinkIn < 0) { v.blinkT = 0.12; v.blinkIn = rand(2, 5); }
        v.blinkT -= realDt;
        frame = v.blinkT > 0 ? 'blink' : Math.floor(this.time / 0.5) % 2 ? 'idle1' : 'idle0';
      }
    } else {
      frame = v.hitT < 0.22 || v.deadT > 0 ? 'hit' : 'idle';
    }
    if (frame !== v.frame) {
      v.frame = frame;
      m.map.value = v.frames[frame];
    }

    // wobble spring for dummies, knockback for everyone
    v.wobV += (-38 * v.wob - 5 * v.wobV) * dt;
    v.wob += v.wobV * dt;
    v.knock *= Math.max(0, 1 - dt * 10);
    v.flash = Math.max(0, v.flash - dt * 7);
    m.flash.value = v.flash > 0.5 ? 0.85 : v.flash > 0.15 ? 0.4 : 0;

    const pos = v.base.clone();
    pos.x += (v.flip ? 1 : -1) * v.knock * 0.6; // positive knock pushes away from the enemy
    let rot = (v.flip ? 1 : -1) * Math.max(-0.35, Math.min(0.35, v.wob * 0.07));
    let opacity = 1;

    if (v.deadT > 0) {
      v.deadT += dt;
      const k = Math.min(1, v.deadT / 0.45);
      rot = (v.flip ? 1 : -1) * -1.45 * (1 - (1 - k) ** 3);
      opacity = v.isMage ? 0.6 : Math.max(0, 1 - Math.max(0, v.deadT - 0.9) * 2);
    }
    if (v.dropT < 0.6) {
      v.dropT += dt;
      const k = Math.min(1, v.dropT / 0.35);
      pos.addScaledVector(UP, (1 - k * k) * 60);
      if (k >= 1 && !v.landed) {
        v.landed = true;
        this.fx.burst(this.point(v, 0, 1), { n: 26, speed: 50, ramp: 'dust', solid: true, life: 0.6, g: 40, spreadX: 12, floor: true });
        v.wobV += 3;
        this.fx.shake(1.5);
      }
    }
    v.mesh.rotation.z = rot;
    m.opacity.value = opacity;
    v.group.position.copy(this.snap(pos));
    v.shadow.material.opacity = 0.75 * opacity * (v.dropT < 0.35 ? v.dropT / 0.35 : 1);

    // status visuals
    const burn = u.alive ? u.s.burn : 0;
    m.burn.value = burn > 0 ? Math.min(0.9, 0.25 + burn / 40) : 0;
    const warm = this.infernoOn && u.side === 'enemy' ? 0.06 : 0;
    m.add.value.setRGB(warm, warm * 0.4, 0);

    v.bubble.visible = u.alive && u.s.block > 0;
    if (v.bubble.visible) {
      v.bubbleT += realDt;
      const pop = Math.min(1, v.bubbleT / 0.15);
      v.bubble.material.opacity = (0.55 + 0.25 * Math.sin(this.time * 4)) * pop;
    }

    const lightPos = this.center(v);
    v.light.position.set(lightPos.x, 14, v.base.z + 14);
    v.light.intensity = burn > 0 ? (0.8 + Math.min(2.6, burn * 0.08)) * (0.8 + 0.2 * Math.sin(this.time * 13 + v.base.x)) : 0;

    if (dt > 0 && u.alive) {
      v.emit += dt * (burn > 0 ? 3 + Math.min(36, burn * 1.1) : 0);
      while (v.emit >= 1) {
        v.emit -= 1;
        this.fx.flames(this.point(v, v.isMage ? 3 : 0, 2), v.isMage ? 18 : 20, v.isMage ? 44 : 40, 1);
      }
      if (u.s.heat > 0) {
        v.heatEmit += dt * Math.min(20, u.s.heat * 1.5);
        while (v.heatEmit >= 1) {
          v.heatEmit -= 1;
          this.fx.glow.spawn({ x: v.base.x + rand(-10, 16), y: rand(0, 6), z: v.base.z + 6, vy: rand(20, 40), life: rand(0.4, 0.8), size: 1, ramp: 'heat', wobble: 6, seed: Math.random() * 9, shrink: true });
        }
      }
      if (u.s.phoenix || u.s.fireShield || u.s.wildfire) {
        v.auraEmit += dt * 8;
        while (v.auraEmit >= 1) {
          v.auraEmit -= 1;
          const a = Math.random() * Math.PI * 2;
          const ramp = u.s.phoenix ? 'gold' : 'fire';
          const p = this.point(v, Math.cos(a) * 16, 28 + Math.sin(a) * 26);
          this.fx.glow.spawn({ x: p.x, y: p.y, z: p.z, vy: rand(4, 12), life: rand(0.4, 0.9), size: 1, ramp, shrink: true });
        }
      }
    }

    // overlay anchor above the head
    const hc = this.toCss(this.point(v, v.isMage ? 6 : 0, v.isMage ? 68 : 60));
    this.overlay.place(v.id, u.side, hc.x, hc.y, u);
  }
}
