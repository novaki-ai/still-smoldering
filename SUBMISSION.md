# Novaki: Still Smoldering

**Subtitle:** *The Last Ember of Matchbox City*

---

## 1. How to Build and Play

### Build Instructions
```bash
npm install
npm run build
```
This compiles TypeScript and bundles the application into `dist/` with relative asset URLs (`base: './'`), allowing the static build to be served from any root or sub-path without external network requests.

To preview locally:
```bash
npm run dev
# or serve the production dist/ folder:
npm run preview
```

### Controls
- **Movement:** `WASD` or `Arrow Keys` / Gamepad Left Stick or D-Pad / On-Screen Touch Joystick (bottom-left)
- **Flame-Step Dash:** `Space` or `Shift` / Gamepad `A`, `B`, or `RB` / On-Screen `DASH` button (bottom-right)
  - Grants brief invincibility frames (`0.28s`) and leaves a scorching napalm zone behind Novaki.
  - Dashing across orange **Strike Pads** (sandpaper flint strips) in the arena triggers a 5.5-second **Strike Frenzy** (+25% move speed, +35% attack speed, +25% damage, +25% Overdrive charge).
- **Ignition Overdrive (Ultimate):** `E`, `Q`, or `R` / Gamepad `X`, `Y`, or `LB` / On-Screen `IGNITE` button when charge reaches `100%`
  - Erupts Novaki's burnt charcoal head into roaring flames for 8 seconds, emitting a radial knockback shockwave and boosting fire rate (+50%), damage (+35%), and speed (+30%).
- **Level-Up Selection:** Click any card, or press `1`, `2`, `3` on the keyboard / D-Pad on Gamepad.
- **Pause:** `Escape` or `P` / Gamepad `Start` / Top-right `II PAUSE` HUD button.

---

## 2. What Was Built

### Hero & Story
- **Novaki** is a grumpy, cynical wooden matchstick whose oversized charcoal head was already struck once—yet a stubborn ember still smolders inside.
- **Voiced Story & Combat Dialogue (23 `varlik voice` clips):**
  - **3-Part Voiced Intro Cutscene** (`intro_1_narrator`, `intro_2_narrator`, `intro_3_novaki`) with custom storybook illustration (`story_intro.jpg`).
  - **Stage Entry Barks** from Novaki at the start of Stages 1, 2, and 3, plus reactive combat voice lines for Weapon Evolution, Ignition Overdrive, Low HP, Menu greeting, and Game Over.
  - **9 Voiced Boss Lines** (Intro, Phase 2 Enrage at <50% HP, and Defeat wail for all 3 Overlords).
  - **3-Part Voiced Epilogue / Victory Cutscene** (`ending_1_narrator`, `ending_2_novaki`, `ending_3_narrator`) with custom victory artwork (`story_victory.jpg`).

### 3 Distinct Stages & 3 Multi-Pattern Bosses
Each stage runs on a 5-minute (300s) wave clock (15 minutes of stage waves + multi-phase boss battles = ~17–20 minutes for a full winning run), with custom `varlik image` seamless floor textures and dedicated `varlik music` stage & boss tracks:
1. **Stage I — The Soggy Cellar (`stage1_bg.jpg`, `music_stage1.mp3`)**
   - **Boss 1: Baron Von Drip (`boss1_drip.png`, `music_boss1.mp3`)** — Cracked royal porcelain teacup warlord with 4 attack patterns: *Earl Grey Spiral Barrage*, *Ricocheting Porcelain Saucers*, *Boiling Tidal Kettle Slam Zones*, and *Cellar Retinue Summon*, plus a Phase 2 Boiling Fury enrage.
2. **Stage II — The Waxworks Cathedral (`stage2_bg.jpg`, `music_stage2.mp3`)**
   - **Boss 2: Arch-Prelate Tallow (`boss2_tallow.png`, `music_boss2.mp3`)** — Towering three-wicked candelabrum fanatic with 4 attack patterns: *Sacred Wax Flame Cross Lasers*, *Paraffin Meteor Rain*, *Candelabra Fireball Nova*, and *Acolyte Procession*, plus Phase 2 Triple-Wick Wrath.
3. **Stage III — The Frostbite Freezer (`stage3_bg.jpg`, `music_stage3.mp3`)**
   - **Boss 3: General Absolute Zero (`boss3_zero.png`, `music_boss3.mp3`)** — Mechanized cryogenic brass bell-snuffer dreadnought with 4 attack patterns: *Extinction Bell Guillotine Slams*, *Cryo-Grid Laser Matrix*, *Absolute Zero Bullet Curtain*, and *Cryo-Pylon Overcharge*, plus Phase 2 Cryogenic Overdrive.

### 15 Enemy Types with Distinct Behaviors
- **Stage 1:**
  1. *Dewdrop Slime* (`hop_puddle` — rhythmic hop bursts, leaves slowing damp puddle on death)
  2. *Mold Sporeling* (`sine_swarm` — weaving sine-wave flanker)
  3. *Rusty Thimble Knight* (`shield_charge` — armored tank that braces and shield-charges)
  4. *Spit-Bug Beetle* (`ranged_kite` — maintains medium distance and spits brackish globules)
  5. *Soaked Sponge Brute* (`death_burst` — heavy absorber that bursts into 6 water droplets on death)
- **Stage 2:**
  6. *Ticking Wick-Imp* (`kamikaze_fuse` — fast sprinter that arms a proximity fuse and explodes)
  7. *Wax Gargoyle* (`dive_swoop` — high-speed diagonal swooping dives)
  8. *Censer Acolyte* (`buffer_support` — empowers nearby enemies' speed and fires ash orbs)
  9. *Molten Blob* (`splitter` — splits into two fast Mini-Waxlings on death)
  10. *Brass Snuff-Hound* (`laser_pounce` — locks on with a red targeting line before pouncing)
- **Stage 3:**
  11. *Icicle Wraith* (`blink_spread` — teleports to flank Novaki and fires a 3-way ice shard fan)
  12. *Cryo-Cube Golem* (`axis_slam` — juggernaut that emits radial frost shockwaves)
  13. *Blizzard Mote* (`orbit_sniper` — circles Novaki at mid-range while firing crystalline darts)
  14. *Hailstone Mortar* (`mortar_lob` — lobs artillery shells onto telegraphed floor circles)
  15. *Frost-Coil Automaton* (`beam_sentinel` — marches forward while projecting a rotating cryo-laser beam)

### 24 Weapons, Passives, and Synergy Evolutions
- **8 Base Weapons (Levels 1–5):** *Charcoal Sparkler*, *Cinder Lash*, *Orbiting Will-o'-Wisps*, *Sandpaper Chakram*, *Matchbox Molotov*, *Magnesium Ray*, *Static Soot Cloud*, *Phosphorus Mortar*.
- **8 Passive Upgrades (Levels 1–5):** *Sulfur Powder* (+Damage), *Pocket Bellows* (+Attack Speed), *Hardened Charcoal* (+Max HP & Armor), *Magnifying Lenses* (+Crit & Projectile Speed), *Kerosene Reserve* (+Area), *White Phosphorus* (+Pierce & Burn DoT), *Magnetized Soot* (+Pickup Range & XP), *Espresso Dipped Stem* (+Move Speed & HP Regen).
- **8 Ultimate Weapon Evolutions:** Reaching Level 5 on any base weapon while holding its paired Synergy Passive unlocks its golden Evolution card (*Inferno Gatling*, *Solar Scourge*, *Supernova Corona*, *Blazing Striker Saw*, *Hellfire Cataclysm*, *Prism Obliterator*, *Pyroclastic Storm*, *The Grand Finale*).

### Persistent Meta-Progression ("The Matchbox Forge")
- Saved in `localStorage` (`novaki_still_smoldering_meta_v1`).
- Players earn **Ember Cinders** from enemies, Supply Matchboxes, Elite Chests, and Bosses to permanently upgrade 8 Forge attributes (5 ranks each) and unlock 3 **Matchstick Aspects** (*The Grumpy Stub*, *Hearth Cleaver*, *Static Sparkplug*) that alter starting builds.

### Performance Architecture & QA Interface
- Uses an offscreen-cached HTML5 Canvas 2D renderer with automatic chroma-key despill, precomputed white hit-flash silhouettes, and a `SpatialHashGrid` broadphase (`src/utils/rng.ts`) to maintain smooth frame rates with hundreds of active enemies and projectiles.
- Exposes the full `window.NOVAKI_QA` interface (`state`, `start`, `setInvincible`, `addXp`, `chooseUpgrade`, `skipTo`, `killBoss`, `spawnEnemies`) with deterministic `Mulberry32` seeded PRNG support.

---

## 3. What Would Be Improved With More Time
- **Multi-Frame Sprite Sheet Animations:** Currently Novaki and enemies use distinct pose sprites (`novaki_idle.png`, `novaki_run.png`, `novaki_overdrive.png`) combined with procedural squash-stretch, walk bobbing, and world-space smoke trail physics. With more time, full 6-to-8 frame hand-tuned sprite sheets per character and boss attack windup would make animations even richer.
- **Additional Arena Sub-Events:** Adding mini-objectives mid-stage (such as defending a dry matchbook cache or igniting beacon braziers across the map) would add even more tactical variety between boss fights.
- **Gamepad Menu Cursor Navigation:** While gamepad controls work in combat (Left Stick/D-Pad movement, Dash, Overdrive, Pause, and D-Pad level-up card selection), full directional focus cycling across all main-menu sub-modals (Meta-Shop and Settings sliders) would make couch controller play completely mouse-free.

---

## 4. Known Bugs / Limitations
- **Browser Autoplay Policy:** As required by modern browsers (Chrome/Safari/Firefox), background music and voice audio elements cannot play until the first user pointer/keyboard gesture occurs on the page. `AudioManager` queues the active track and automatically starts playback on the first interaction without throwing console errors.
- **Single-Level Cap per `addXp()` Call:** When a huge amount of XP is injected in a single `NOVAKI_QA.addXp(amount)` call, the game triggers one level-up immediately and clamps leftover XP just below the next level threshold after `chooseUpgrade(index)` so automated tests calling `addXp()` followed by a single `chooseUpgrade()` deterministically return to `screen === "playing"`.
