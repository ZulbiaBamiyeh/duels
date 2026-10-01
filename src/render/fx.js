// Spell effects: pixel particles, projectiles, glows and dynamic lights.
// Everything here is cosmetic and uses Math.random freely; the sim never sees it.

import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Colour ramps (stepped, pixel-art style), sampled by remaining life.
export const RAMPS = {
  fire: ['#7a2a2a', '#c4422b', '#ff7a2f', '#ffb347', '#ffd166', '#fff6d6'],
  ember: ['#5a2a35', '#c4422b', '#ff7a2f', '#ffd166'],
  hot: ['#ff7a2f', '#ffd166', '#fff6d6', '#ffffff'],
  smoke: ['#2c2638', '#3d354d', '#544a66'],
  steel: ['#4f6a8f', '#8fb3d9', '#cfe4f7', '#ffffff'],
  gold: ['#8a5a1f', '#e0a93f', '#ffd56b', '#fff0b3'],
  heat: ['#6a2236', '#c43a55', '#ff5a6e', '#ffb0b9'],
  dust: ['#3d354d', '#6a6080', '#8f86a3'],
  mote: ['#3a3350', '#7d6f9a', '#d8c7a8', '#fff0c8'],
  holy: ['#8a6a2a', '#e0b84f', '#fff0b3', '#ffffff'],
  heal: ['#2a6a4a', '#5fd08a', '#b8ffd0', '#ffffff'],
  poison: ['#2a3a1a', '#5a8a2a', '#9bd45a', '#d8ff9a'],
  taunt: ['#6a1a1a', '#c43a3a', '#ff6b5a', '#ffc2b0'],
  empower: ['#6a2a4a', '#d06a9a', '#ff9fd0', '#ffe6f2'],
};
const rampCache = {};
function ramp(name) {
  if (!rampCache[name]) rampCache[name] = RAMPS[name].map((h) => new THREE.Color(h));
  return rampCache[name];
}

const PARTICLE_VS = `
  attribute float size;
  attribute vec4 rgba;
  uniform vec2 res;
  varying vec4 vC;
  void main() {
    vC = rgba;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // snap to the pixel grid so particles stay square and crisp
    vec2 sc = (p.xy / p.w * 0.5 + 0.5) * res;
    float odd = mod(size, 2.0);
    sc = floor(sc) + (odd > 0.5 ? 0.5 : 0.0);
    p.xy = (sc / res * 2.0 - 1.0) * p.w;
    gl_Position = p;
    gl_PointSize = size;
  }`;
const PARTICLE_FS = `
  varying vec4 vC;
  void main() {
    if (vC.a < 0.02) discard;
    gl_FragColor = vC;
  }`;

class ParticleSystem {
  constructor(scene, max, additive, res) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: { res },
      transparent: true,
      depthWrite: false,
      depthTest: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    scene.add(this.points);
  }

  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0;
    p.vx ??= 0; p.vy ??= 0; p.vz ??= 0;
    p.g ??= 0; p.drag ??= 0; p.size ??= 1;
    p.ramp = ramp(p.ramp || 'fire');
    p.alpha ??= 1;
    this.list.push(p);
  }

  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; }
      if (p.wobble) p.x += Math.sin((p.age + p.seed) * p.wobble) * 0.15;
      L[n++] = p;
    }
    L.length = n;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const k = 1 - p.age / p.life;
      const r = p.ramp;
      const c = r[Math.min(r.length - 1, Math.floor(k * r.length))];
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b;
      this.col[i * 4 + 3] = p.fade ? p.alpha * Math.min(1, k * 2.5) : p.alpha;
      this.size[i] = p.shrink ? Math.max(1, Math.round(p.size * Math.min(1, k * 1.6))) : p.size;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.rgba.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  clear() { this.list.length = 0; }
}

export class FX {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    this.res = { value: new THREE.Vector2(1, 1) };
    this.glow = new ParticleSystem(scene, 3000, true, this.res);
    this.solid = new ParticleSystem(scene, 1500, false, this.res);
    this.projectiles = [];
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ff9a4a', 0, 110, 0);
      scene.add(l);
      this.lights.push({ l, decay: 4 });
    }
    this.shakeAmt = 0;
  }

  setRes(w, h) { this.res.value.set(w, h); }

  clear() {
    this.glow.clear();
    this.solid.clear();
    this.projectiles.length = 0;
    for (const L of this.lights) L.l.intensity = 0;
  }

  // ------------------------------------------------------------ primitives

  flash(pos, color = '#ff9a4a', intensity = 5, decay = 5) {
    const L = this.lights.reduce((a, b) => (a.l.intensity <= b.l.intensity ? a : b));
    L.l.position.set(pos.x, Math.max(6, pos.y), pos.z + 10);
    L.l.color.set(color);
    L.l.intensity = intensity;
    L.decay = decay;
  }

  shake(n) { this.shakeAmt = Math.min(6, Math.max(this.shakeAmt, n)); }

  burst(pos, { n = 12, ramp = 'fire', speed = 40, up = 10, life = 0.5, size = [1, 2], g = 60, drag = 2, solid = false, spreadX = 2, spreadY = 2, floor = false } = {}) {
    const sys = solid ? this.solid : this.glow;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * speed;
      sys.spawn({
        x: pos.x + rand(-spreadX, spreadX), y: pos.y + rand(-spreadY, spreadY), z: pos.z + 2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 + up, vz: 0,
        life: rand(0.6, 1) * life, size: Math.round(rand(size[0], size[1])), ramp, g, drag, shrink: true, floor,
      });
    }
  }

  // Rising flames within a box (burning units).
  flames(pos, w, h, n, ramp = 'fire') {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({
        x: pos.x + rand(-w / 2, w / 2), y: pos.y + rand(0, h), z: pos.z + 3,
        vx: rand(-4, 4), vy: rand(14, 30), life: rand(0.35, 0.7), size: Math.random() < 0.3 ? 2 : 1,
        ramp, g: -10, drag: 1, wobble: 9, seed: Math.random() * 10, shrink: true,
      });
    }
  }

  // Expanding ring of particles along the floor.
  ring(pos, { n = 32, speed = 70, ramp = 'hot', life = 0.45, size = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.glow.spawn({ x: pos.x, y: 1, z: pos.z, vx: Math.cos(a) * speed, vy: 0, vz: Math.sin(a) * speed, life, size, ramp, drag: 3, shrink: true });
    }
  }

  // Column of light falling onto a point.
  pillar(pos, { ramp = 'holy', height = 140, n = 60, width = 6, life = 0.6 } = {}) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x: pos.x + rand(-width, width), y: rand(0, height), z: pos.z + 4, vy: rand(-80, -20), life: rand(0.3, 1) * life, size: Math.random() < 0.3 ? 2 : 1, ramp, shrink: true });
    }
  }

  // Dotted line of particles between two points (links, chains).
  line(a, b, { ramp = 'holy', n = 24, life = 0.5 } = {}) {
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.glow.spawn({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * 6, z: a.z + 6, vy: rand(-2, 2), life: life * rand(0.6, 1), size: i % 3 === 0 ? 2 : 1, ramp, shrink: true });
    }
  }

  // Sparkles rising through a box (heals, buffs).
  rise(pos, w, h, n, ramp = 'heal') {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x: pos.x + rand(-w / 2, w / 2), y: pos.y + rand(0, h), z: pos.z + 4, vx: rand(-3, 3), vy: rand(10, 30), life: rand(0.5, 1), size: Math.random() < 0.25 ? 2 : 1, ramp, shrink: true, wobble: 5, seed: Math.random() * 9 });
    }
  }

  // Projectile from a to b over dur seconds (sim time). style: bolt | lob | spark | ember | beam | pass | spray
  projectile(a, b, dur, style = 'bolt') {
    const arc = { bolt: 6, lob: 26, spark: 4, ember: 3, beam: 0, pass: 30, spray: 18 + Math.random() * 14, wave: 0, holy: 4, spit: 30, poison: 22 }[style] ?? 6;
    this.projectiles.push({ a: a.clone(), b: b.clone(), t: 0, dur: Math.max(0.05, dur), style, arc, last: a.clone() });
  }

  // ------------------------------------------------------------ frame

  update(dt, realDt) {
    for (const L of this.lights) {
      if (L.l.intensity > 0) L.l.intensity = Math.max(0, L.l.intensity - L.decay * L.l.intensity * dt - 0.2 * dt);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt / p.dur;
      const k = Math.min(1, p.t);
      const pos = new THREE.Vector3().lerpVectors(p.a, p.b, k);
      pos.y += Math.sin(k * Math.PI) * p.arc;
      this.trail(p, pos, dt);
      p.last.copy(pos);
      if (p.t >= 1) this.projectiles.splice(i, 1);
    }
    this.glow.update(dt);
    this.solid.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - realDt * 14);
  }

  trail(p, pos, dt) {
    const steps = Math.max(1, Math.ceil(pos.distanceTo(p.last) / 2));
    for (let s = 0; s < steps; s++) {
      const q = new THREE.Vector3().lerpVectors(p.last, pos, s / steps);
      switch (p.style) {
        case 'beam':
          this.glow.spawn({ x: q.x, y: q.y + rand(-1, 1), z: q.z + 4, life: 0.18, size: 2, ramp: 'hot', shrink: true });
          break;
        case 'holy':
          if (Math.random() < 0.7) this.glow.spawn({ x: q.x + rand(-1, 1), y: q.y + rand(-1, 1), z: q.z + 4, vy: rand(-3, 3), life: 0.25, size: 1, ramp: 'holy', shrink: true });
          break;
        case 'spit':
        case 'poison':
          if (Math.random() < 0.6) this.solid.spawn({ x: q.x, y: q.y, z: q.z + 4, vy: rand(-6, 0), life: 0.3, size: Math.random() < 0.3 ? 2 : 1, ramp: 'poison', g: 40 });
          break;
        case 'spark':
        case 'ember':
          if (Math.random() < 0.6) this.glow.spawn({ x: q.x, y: q.y, z: q.z + 4, vy: rand(-4, 4), life: 0.2, size: 1, ramp: 'ember' });
          break;
        case 'wave':
          this.glow.spawn({ x: q.x + rand(-2, 2), y: rand(0, 14), z: q.z + 4, vy: rand(10, 30), life: rand(0.2, 0.4), size: rand(1, 3) | 0, ramp: 'fire', shrink: true, g: -20 });
          break;
        default:
          if (Math.random() < 0.7) this.glow.spawn({ x: q.x + rand(-1, 1), y: q.y + rand(-1, 1), z: q.z + 4, vx: rand(-6, 6), vy: rand(2, 12), life: rand(0.18, 0.4), size: Math.random() < 0.4 ? 2 : 1, ramp: p.style === 'pass' ? 'gold' : 'fire', shrink: true });
      }
    }
    // the head of the projectile
    const head = { bolt: 4, lob: 3, pass: 3, spray: 2, spark: 2, ember: 2, beam: 3, wave: 0, holy: 3, spit: 3, poison: 3 }[p.style] ?? 3;
    const headRamp = { holy: 'holy', spit: 'poison', poison: 'poison' }[p.style];
    if (head) {
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z + 5, life: dt * 1.5 + 0.001, size: head + 2, ramp: headRamp || 'fire', alpha: 0.55 });
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z + 6, life: dt * 1.5 + 0.001, size: head, ramp: headRamp || 'hot' });
    }
  }

  // Ambient motes drifting through the courtyard.
  ambient(dt, bounds) {
    if (Math.random() < dt * 5) {
      this.solid.spawn({
        x: rand(bounds.x0, bounds.x1), y: rand(0, 20), z: rand(-40, 20),
        vx: rand(-3, 3), vy: rand(3, 8), life: rand(4, 8), size: 1, ramp: 'mote', wobble: 1.4, seed: Math.random() * 10, alpha: 0.85, fade: true,
      });
    }
  }
}

export { rand, pickOne };
