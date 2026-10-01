# Spellbook Battler: Fire Mage prototype

A playable slice of the design doc: one Fire Mage with an editable spellbook, fighting 1 to 3 training dummies in real time on a pixel-art Three.js stage. It's built for a phone in portrait and also works on desktop.

```sh
npm install
npm run dev            # http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm test               # simulation tests (determinism, spell rules)
npm run build          # static site in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

## What's in it

- **Spellbook editor.** Tap a tile to change a line's condition, spell or target. Drag the grip to reorder lines. Up to 6 lines. Edits apply mid-fight, so you can watch a change take effect straight away. There are five presets, including the example spellbook from the design doc.
- **All 15 non-passive Fire Mage spells**, from Firebolt to Phoenix Ash, with cooldowns, cast times and once-per-fight limits.
- **Statuses:** Burn (ticks every second, never fades, hits Block first), Block, Heat (+10% action bar speed per stack), Fire Shield, Wildfire, Phoenix.
- **Dummies.** 1 to 3 of them, at 200/500/1000 HP. Each can *Brace* (gains 12 Block every 5s) and *Strike back* (4–6 damage), so you can test Melt, Backdraft, Fire Shield and Smother. They stand back up 2s after going down.
- **Report tab:** total damage, DPS, Block broken, peak Burn, a per-source breakdown with cast counts, and a combat log.
- **Readability:** the line number and spell name pop above the mage on each cast, and the line flashes in the spellbook.

## How it's built

```
src/sim/      deterministic simulation: no rendering, no Math.random
  battle.js   fixed 20 Hz tick, action bars, spellbook reading, damage/status rules
  data.js     spells, statuses, keywords, targets (pure data + resolve functions)
  party.js    unit definitions and spellbook presets (plain JSON)
src/art/      every sprite, icon and texture is drawn in code
  mage.js     the Fire Mage, built from your reference design, 7 frames
  dummy.js    training dummy with 3 recolours
src/render/   Three.js stage, FX, DOM overlay for numbers and labels
src/ui/       spellbook editor, pickers, cards, report
```

- **Determinism (needed for async PvP later).** The sim uses integer ticks and a seeded RNG, and visuals only *read* sim events. `tests/sim.test.js` checks that the same seed and party produce an identical event log for every preset.
- **Pixel-perfect rendering.** The scene renders at the art's native resolution and the canvas is upscaled by a whole number with nearest-neighbour sampling. That keeps sprites, particles and floor lighting on one crisp pixel grid. The camera is orthographic with a slight tilt, sprites are billboards facing it, and the floor texture is authored pre-foreshortened, so one texel always maps to one screen pixel.
- **Replacing placeholder art.** Sprites are built per frame in `src/art/mage.js` (`MAGE_FRAMES`). To use Aseprite exports, load your PNG frames as textures in `Stage` (`this.tx.mage`) with the same frame names and a 48×64 canvas with the feet on the bottom row.

## Rules this prototype had to decide

The design doc leaves these open, so the prototype picks something. All of them are easy to change in `src/sim`.

- Burn deals 1 damage per stack every second.
- The action bar fills in 1.4s for the mage and 2.5s for dummies. Heat adds 10% per stack.
- Cooldowns start when the cast starts.
- When a line's condition and target are on the same side, the target is picked from the units that matched the condition. For example, *If enemy Burn ≥ 25 → Flashpoint → enemy with most Burn* only considers enemies at 25+ Burn.
- Melt and Flashpoint are skipped when they would do nothing (no Block, no Burn), so the book moves on to the next line.
- Pass the Flame moves Burn from the enemy with the most Burn onto the line's target.
- Fire Shield's "attackers gain 2 Burn" lasts while its Block holds.
- Ember Saint is not included, because nothing heals yet.
