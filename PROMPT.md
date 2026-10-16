# Build a game: an action roguelite starring Novaki

You are taking part in a public test. Four AI coding agents receive this exact same brief. Each one works alone, in its own folder, with the same tools, and gets no human help after this message. The finished games will be played, measured and published side by side on novaki.lol. Your logs, your code and the results will be published too.

Build the best game you can. There is no budget limit. Work until you are genuinely done; the session is stopped only after 8 hours, and whatever is in this folder at that point is what gets judged.

## The game

A complete, polished, top-down action roguelite for the web browser, in the spirit of Vampire Survivors, Hades and Brotato. Single player, in English.

The hero is **Novaki**: a short, chunky wooden matchstick with an oversized burnt black charcoal match head, a thin curl of smoke rising from it, thick round black glasses worn slightly crooked, thin black line arms and legs, white cartoon gloves and small black shoes. Reference images are in `reference/`. Keep him recognizable in every image of him. Everything else is yours to design: the world, the story, the enemies, the art direction and the name of the game.

## Minimum content (more, and better, is welcome)

- At least 3 stages, each with its own look, enemies and music, and a boss at the end. Beating the third boss wins the run.
- At least 12 enemy types with clearly different behavior.
- At least 3 bosses, each with several attack patterns.
- At least 20 weapons, upgrades and passives, chosen on level-up, with meaningful synergies or evolutions.
- Persistent meta-progression between runs, saved in the browser.
- Main menu, pause menu, settings (at least music volume, sound volume, screen shake on/off), how-to-play, game-over and victory screens with run stats.
- Story: an intro and an ending, with voiced lines (narrator and/or characters) and voiced boss lines.
- Music for every stage and for the bosses, plus sound effects.
- Controls: keyboard (WASD and arrow keys), gamepad, and touch (on-screen joystick) so it plays on phones.
- A full winning run takes roughly 15 to 25 minutes for a decent player.
- Stays smooth (target 60 FPS) with hundreds of enemies and projectiles on screen on an average laptop.

## Assets

Every image, voice line and music track in the game must be created with the `varlik` command, which is already on your PATH. Run `varlik --help` for details. Do not download assets from the internet and do not use any other generator, including image or audio tools built into your own environment. You may draw shapes, particles, UI and effects in code, and you may synthesize sound effects in code.

- `varlik image`: GPT image model. Any aspect ratio; optional transparent background; you can attach reference images (for example the Novaki references). One image takes about 1 to 2 minutes.
- `varlik voice`: Gemini text-to-speech (gemini-3.8-flash-lite-tts). Choose a voice and describe the delivery style. Your quota is 25 voice clips.
- `varlik music`: Lyria (lyria-3-clip). Each call returns a 30-second music clip from a text description.

Every call is logged.

## Technical requirements

- `npm install && npm run build` must produce `dist/`, a static site that works when served from any sub-path (use relative URLs). No server code, no network requests to other hosts at runtime; all assets ship inside `dist/`.
- Any open-source library from npm is allowed (Phaser, PixiJS, Kaplay or anything else).
- It must work in current desktop and mobile Chrome, Firefox and Safari, with no console errors during normal play.
- Use a browser to play-test your own game. The Chromium build for `playwright@1.62.1` is already downloaded on this machine, so `npm install -D playwright@1.62.1` works without a browser download.
- Work only inside this folder. Use git and commit as you go.

### QA interface (required)

Expose `window.NOVAKI_QA` with these functions. They are used by automated tests and by the judges, so they must report and control the real game. They must not change how the game plays for normal players.

- `state()` returns a plain object describing the current game:
  `{ screen, stage, time, player: { x, y, hp, maxHp, level, xp }, enemies, bossActive, upgrades, meta }`
  - `screen`: one of `"menu"`, `"playing"`, `"paused"`, `"levelup"`, `"gameover"`, `"victory"`, or another clearly named screen
  - `stage`: 1, 2 or 3
  - `time`: seconds into the current run
  - `enemies`: number of enemies alive
  - `bossActive`: true while a boss fight is on
  - `upgrades`: ids of everything the player owns in this run
  - `meta`: persistent progression, for example `{ currency, unlocks }`
- `start(options)` starts a new run from the menu. `options.seed` (a number) makes the run deterministic.
- `setInvincible(on)` turns damage to the player off or on.
- `addXp(amount)` gives the player experience.
- `chooseUpgrade(index)` picks an option while the level-up screen is open.
- `skipTo(stage, point)` jumps to the `"start"` or the `"boss"` of stage 1, 2 or 3.
- `killBoss()` defeats the current boss through the normal defeat path (rewards, transitions, story).
- `spawnEnemies(count)` adds that many normal enemies around the player, for performance testing.

## When you are done

Write `SUBMISSION.md`: the game's name, how to build and play it, what you built, what you would improve with more time, and any known bugs. Be honest; it will be checked against the game.
