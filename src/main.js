import './style.css';
import { Battle } from './sim/battle.js';
import { TPS } from './sim/data.js';
import { partyDefs, defaultParty, dummyDefs, defaultDummies } from './sim/party.js';
import { Stage } from './render/stage.js';
import { UI } from './ui/ui.js';

const STORE = 'sb.proto.v2';

function load(snapshot) {
  const fresh = { party: defaultParty(), dummies: defaultDummies(), seed: 7 };
  const from = snapshot || (() => {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
  })();
  const ok = from && from.party && Array.isArray(from.party.formation) && from.party.formation.length === 3 && from.party.books && from.dummies;
  return ok ? { ...fresh, ...from } : fresh;
}

function save(state) {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}

function start(hotData) {
  const state = load(hotData?.state);
  const stage = new Stage(document.getElementById('stage'));
  let battle;
  let acc = 0;
  let speed = 1;
  let paused = false;

  const ui = new UI(state, {
    onBookChange(kind) {
      // spellbook edits apply live: she reads it on her next action
      const u = battle.units.find((x) => x.side === 'ally' && x.kind === kind);
      if (u) { u.spellbook = state.party.books[kind]; u.def.spellbook = u.spellbook; u.waiting = false; }
      save(state);
    },
    onSetupChange() {
      save(state);
      reset();
    },
    onSelect(id) {
      stage.select(id);
    },
  });
  stage.onSelect = (id) => ui.select(id);

  function reset() {
    battle = new Battle({ seed: state.seed, party: partyDefs(state.party), enemies: dummyDefs(state.dummies) });
    acc = 0;
    stage.bind(battle);
    ui.bind(battle);
  }

  const stageEl = document.getElementById('stage');
  stage.onInferno = (on) => stageEl.classList.toggle('is-inferno', on);

  const playBtn = document.getElementById('btnPlay');
  const setPaused = (p) => {
    paused = p;
    playBtn.setAttribute('aria-pressed', String(!p));
    playBtn.querySelector('span').textContent = p ? 'Play' : 'Pause';
    stageEl.classList.toggle('is-paused', p);
  };
  playBtn.addEventListener('click', () => {
    if (battle.over) reset();
    setPaused(!paused);
  });
  for (const id of ['btnReset', 'btnRetry']) {
    document.getElementById(id).addEventListener('click', () => {
      reset();
      setPaused(false);
    });
  }
  const speedBtns = [...document.querySelectorAll('#speedSeg button')];
  const setSpeed = (s) => {
    speed = s;
    speedBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s)));
  };
  speedBtns.forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('button, input')) {
      e.preventDefault();
      playBtn.click();
    }
  });

  reset();
  setSpeed(1);
  setPaused(false);

  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let simDt = 0;
    if (!paused && !battle.over) {
      simDt = realDt * speed;
      acc += simDt * TPS;
      while (acc >= 1) {
        acc -= 1;
        const evs = battle.step();
        stage.handle(evs);
        ui.onEvents(evs);
      }
    }
    stage.render(realDt, simDt, (battle.t + acc) / TPS);
    ui.frame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.claude?.hot?.snapshot?.(() => ({ state }));
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
