# Spellbook Battler: party prototype

A playable slice of the design doc. A party of three (Shieldmaiden, Fire Mage, Cleric), each with an editable spellbook, fights 1 to 3 training dummies in real time on a pixel-art Three.js stage. The layout is built for a PC screen in the style of Princess Connect: spellbook on the left, battle in the middle with party cards below, statuses and info on the right. It stacks into one column on narrow screens.

```sh
npm install
npm run dev            # http://localhost:5173
npm test               # simulation tests (determinism, spell rules)
npm run build          # static site in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

## What's in it

- **Three characters, full spell pools.** The Fire Mage and Cleric use their pools from the design doc, 17 spells each. The Shieldmaiden is new, built on the doc's character template: Block, Taunt, Guard, Spikes, Bastion, and a bridge spell (Kindled Steel) that turns enemy Burn into Block. Passive legendaries (Ember Saint, Mercy, Plague Saint, Last Stand, Reprisal) take up a spellbook line and are always on.
- **No default attacks.** Each character has a basic attack spell (Ember Flick, Staff Tap, Strike) that only fires if it's in her spellbook. If no line fits, she waits with a full action bar and shows "Waiting" above her head.
- **Spellbook editor (left).** Pick a party member, tap tiles to change a line's condition, spell or target, and drag the grip to reorder. Up to 6 lines, with presets for each character. Edits apply mid-fight.
- **Status panel (right).** Click any unit on the stage, a party card or an enemy card. The panel shows HP, Block, what she's doing now, and every status with its rule. Enemies also show their spellbook.
- **Setup.** Formation (front, middle, back) and dummies: 1 to 3, at 300/600/1200 HP. Each dummy can Brace (gain Block), Thwack (hit your frontmost) and Spit (Poison your backmost).
- **Report.** Damage, DPS, healing, a per-member breakdown (dealt, healed, taken, Block gained), damage by source, and a combat log.
- **Statuses:** Burn, Poison, Block, Heat, Regeneration, Empower, Spikes, Ward, plus timed effects (Taunt, Guard, Martyr, Bastion, Silence) and flags (Fire Shield, Wildfire, Phoenix, Sanctuary).

## How it's built

```
src/sim/      deterministic simulation: no rendering, no Math.random
  battle.js   fixed 20 Hz tick, action bars, spellbook reading, damage, healing, redirects
  data.js     characters, spells, statuses, keywords, targets (data + resolve functions)
  party.js    formation, default spellbooks, presets, dummies (plain JSON)
src/art/      every sprite, icon and texture is drawn in code
  chibi.js    shared rig: per-part selective outlines, profile head, boots
  mage.js / cleric.js / tank.js   96x128 side-view sprites, 7 frames each
  dummy.js    training dummy, 3 recolours
src/render/   Three.js stage, FX, DOM overlay for numbers, labels and click targets
src/ui/       spellbook editor, pickers, party cards, status/setup/report panel
```

- **Determinism (needed for async PvP later).** The sim uses integer ticks and a seeded RNG, and visuals only *read* sim events. The tests check that the same seed and party produce an identical event log, that every spell resolves, and the rules for waiting, Taunt, Poison and Flashpoint.
- **Pixel-perfect rendering.** The scene renders at the art's native resolution and the canvas is upscaled by a whole number (2× or 3× on a PC). That keeps sprites, particles and lighting on one crisp pixel grid. Slot spacing adapts to the visible width so 3v3 always fits.
- **Replacing placeholder art.** Each character exports `*_FRAMES` (idle0, idle1, blink, cast0, cast1, attack, hit). To use Aseprite exports, load PNG frames as textures in `Stage` with the same names, on a 96×128 canvas with the feet on row 123.

## Rules this prototype had to decide

The design doc leaves these open. All are easy to change in `src/sim`.

- Burn and Poison deal 1 damage per stack every second. Regeneration heals 2 per stack, then loses a stack.
- Action bars fill in 1.4s (Fire Mage), 1.5s (Cleric), 1.6s (Shieldmaiden) and 2.5s (dummies). Heat adds 10% per stack. Cooldowns start when the cast starts.
- When a line's condition and target are on the same side, the target is picked from the units that matched the condition.
- Spells that would do nothing are skipped (Melt without Block, Flashpoint without Burn, Absolve without Poison, Judgement without recent healing), so the book moves on.
- Taunt forces single-target enemy spells and attacks onto the taunter. Sanctuary hides a unit unless it's the only target. Bastion redirects before Guard, and Guard before Martyr.
- Ward only blocks debuffs applied by enemies, so self-inflicted Burn from Pyre Pact still lands.
- Party members stay down when killed, unless Resurrection or Phoenix Ash saves them. Dummies stand back up after 2s.
