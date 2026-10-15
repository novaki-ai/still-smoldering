import {
  BOSS_DEFS,
  ENEMY_DEFS,
  META_UPGRADES,
  STAGE_DEFS,
  STARTER_ASPECTS,
  UPGRADE_DEFS,
  VOICE_CUES,
} from '../data/content';
import { GameEngine, OfferedUpgradeCard } from '../game/GameEngine';
import { ScreenName, StageId, VoiceCue } from '../types';
import { getUpgradeIconSvg } from './IconSvg';

export class UIManager {
  private root: HTMLElement;
  private engine: GameEngine;
  private voiceTimeout: number | null = null;
  private introStepIndex: number = 0;
  private victoryStepIndex: number = 0;

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.buildDOM();
    this.bindEvents();
    this.syncScreen('menu');
    this.renderMetaShop();
    this.renderAspectSelector();
  }

  private buildDOM(): void {
    this.root.innerHTML = `
      <!-- IN-GAME HUD -->
      <div id="hud-overlay" class="hud-overlay hidden">
        <div class="hud-top">
          <!-- Left: Player Vitals & Abilities -->
          <div class="hud-vitals-card">
            <div class="hud-avatar-wrap">
              <img id="hud-avatar-img" src="./assets/images/novaki_portrait.png" alt="Novaki" />
              <span id="hud-level-badge" class="hud-level-badge">LV 1</span>
            </div>
            <div class="hud-bars">
              <div class="bar-row">
                <div class="bar-track hp-track">
                  <div id="hud-hp-fill" class="bar-fill hp-fill" style="width: 100%"></div>
                  <span id="hud-hp-text" class="bar-label">120 / 120 HP</span>
                </div>
              </div>
              <div class="bar-row">
                <div class="bar-track xp-track">
                  <div id="hud-xp-fill" class="bar-fill xp-fill" style="width: 0%"></div>
                  <span id="hud-xp-text" class="bar-label">XP 0 / 24</span>
                </div>
              </div>
              <div class="hud-ability-row">
                <button id="hud-dash-pill" class="ability-pill ready" type="button" title="Space / Shift to Flame-Step Dash">
                  <span class="pill-key">SPACE</span>
                  <span id="hud-dash-text">FLAME-STEP READY</span>
                </button>
                <button id="hud-overdrive-pill" class="ability-pill overdrive" type="button" title="Press E or Q when 100% charged">
                  <span class="pill-key">E</span>
                  <span id="hud-overdrive-text">IGNITE 25%</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Center: Stage Clock & Boss Health Bar -->
          <div class="hud-center-col">
            <div class="stage-clock-pill">
              <span id="hud-stage-label" class="stage-tag">STAGE I • THE SOGGY CELLAR</span>
              <span id="hud-time-label" class="clock-time">00:00</span>
              <span id="hud-wave-sub" class="wave-sub">BOSS IN 05:00</span>
            </div>

            <div id="hud-boss-bar" class="boss-bar-container hidden">
              <div class="boss-bar-header">
                <span id="hud-boss-name" class="boss-name">BARON VON DRIP</span>
                <span id="hud-boss-hp-text" class="boss-hp-text">3200 / 3200</span>
              </div>
              <div class="boss-bar-track">
                <div id="hud-boss-fill" class="boss-bar-fill" style="width: 100%"></div>
                <div class="boss-phase-marker" title="Phase 2 Enrage"></div>
              </div>
            </div>
          </div>

          <!-- Right: Currency, Kills & Pause -->
          <div class="hud-right-col">
            <div class="stat-pill cinder-pill" title="Ember Cinders (Persistent Meta Currency)">
              <span class="stat-dot cinder-dot"></span>
              <span id="hud-cinders-text">0</span>
              <span class="stat-unit">CINDERS</span>
            </div>
            <div class="stat-pill kill-pill">
              <span id="hud-kills-text">0</span>
              <span class="stat-unit">KILLS</span>
            </div>
            <button id="btn-pause" class="hud-icon-btn" type="button" aria-label="Pause Game">
              II PAUSE
            </button>
          </div>
        </div>

        <!-- Voiced Story / Boss Comms Subtitle Banner -->
        <div id="voice-comms-banner" class="voice-comms-banner hidden">
          <img id="voice-comms-avatar" src="./assets/images/novaki_portrait.png" alt="Speaker" />
          <div class="voice-comms-body">
            <div class="voice-comms-header">
              <span id="voice-comms-speaker" class="voice-speaker">NOVAKI</span>
              <span id="voice-comms-title" class="voice-title">Still Smoldering</span>
            </div>
            <p id="voice-comms-text" class="voice-text"></p>
          </div>
        </div>

        <!-- Stage Transition Title Banner -->
        <div id="stage-banner" class="stage-banner hidden">
          <div id="stage-banner-sub" class="stage-banner-sub">STAGE I</div>
          <div id="stage-banner-title" class="stage-banner-title">THE SOGGY CELLAR</div>
          <div id="stage-banner-desc" class="stage-banner-desc"></div>
        </div>

        <!-- Bottom Loadout Tray -->
        <div id="hud-loadout-tray" class="hud-loadout-tray"></div>

        <!-- Mobile / Touch On-Screen Joystick & Action Buttons -->
        <div id="touch-controls" class="touch-controls">
          <div id="touch-joystick-zone" class="touch-joystick-zone">
            <div id="touch-joystick-base" class="touch-joystick-base">
              <div id="touch-joystick-knob" class="touch-joystick-knob"></div>
            </div>
          </div>
          <div class="touch-actions">
            <button id="touch-dash-btn" class="touch-action-btn dash-btn" type="button">DASH</button>
            <button id="touch-overdrive-btn" class="touch-action-btn overdrive-btn" type="button">IGNITE</button>
          </div>
        </div>
      </div>

      <!-- MAIN MENU SCREEN -->
      <div id="screen-menu" class="menu-screen">
        <div class="menu-bg-art" style="background-image: url('./assets/images/title_hero.jpg')"></div>
        <div class="menu-scrim"></div>

        <div class="menu-content">
          <div class="menu-left-col">
            <div class="brand-kicker">A TOP-DOWN ACTION ROGUELITE • NOVAKI.LOL ARENA</div>
            <h1 class="game-title">NOVAKI<span>STILL SMOLDERING</span></h1>
            <p class="game-tagline">
              Every other match in Kindlewick was drowned by the Great Damp. One grumpy, burnt-out charcoal stub with crooked glasses refuses to go out cold.
            </p>

            <!-- Starter Aspect Selector -->
            <div class="aspect-panel">
              <div class="aspect-panel-header">
                <span>SELECT MATCHSTICK ASPECT</span>
                <span id="menu-cinder-balance" class="cinder-badge">0 EMBER CINDERS</span>
              </div>
              <div id="aspect-list" class="aspect-list"></div>
            </div>

            <div class="menu-cta-group">
              <button id="btn-start-run" class="btn-primary btn-ignite" type="button">
                STRIKE MATCH • START RUN
              </button>
              <button id="btn-story-intro" class="btn-secondary" type="button">
                VOICED STORY INTRO
              </button>
            </div>

            <div class="menu-sub-buttons">
              <button id="btn-open-meta" class="btn-outline" type="button">
                MATCHBOX FORGE (UPGRADES)
              </button>
              <button id="btn-open-howto" class="btn-outline" type="button">
                HOW TO PLAY & EVOLUTIONS
              </button>
              <button id="btn-open-settings" class="btn-outline" type="button">
                SETTINGS
              </button>
            </div>
          </div>

          <div class="menu-right-col">
            <div id="menu-hero-card" class="menu-hero-card" title="Click Novaki to hear him complain!">
              <div class="hero-glow"></div>
              <img id="menu-novaki-sprite" src="./assets/images/novaki_idle.png" alt="Novaki" />
              <div class="hero-speech-bubble" id="menu-speech-bubble">
                "Stop staring at my charcoal hair and strike a match already."
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- LEVEL-UP SCREEN -->
      <div id="screen-levelup" class="modal-screen hidden">
        <div class="modal-card levelup-modal">
          <div class="levelup-header">
            <div class="levelup-kicker">EMBER INTENSIFIES!</div>
            <h2 id="levelup-title">LEVEL UP • CHOOSE AN UPGRADE</h2>
            <p class="levelup-hint">Pair a Level 5 Weapon with its Synergy Passive to unlock an Ultimate Evolution!</p>
          </div>

          <div id="levelup-cards-grid" class="levelup-cards-grid"></div>

          <div class="levelup-footer">
            <button id="btn-reroll" class="btn-secondary" type="button">
              REROLL OPTIONS (1 LEFT)
            </button>
          </div>
        </div>
      </div>

      <!-- PAUSE MENU SCREEN -->
      <div id="screen-paused" class="modal-screen hidden">
        <div class="modal-card pause-modal">
          <div class="modal-kicker">RUN PAUSED</div>
          <h2>CATCHING YOUR BREATH</h2>
          <div id="pause-build-summary" class="pause-build-summary"></div>
          <div class="pause-actions">
            <button id="btn-resume" class="btn-primary" type="button">RESUME RUN (ESC)</button>
            <button id="btn-pause-settings" class="btn-outline" type="button">SETTINGS</button>
            <button id="btn-pause-howto" class="btn-outline" type="button">HOW TO PLAY & SYNERGIES</button>
            <button id="btn-restart-run" class="btn-outline" type="button">RESTART RUN</button>
            <button id="btn-quit-menu" class="btn-danger" type="button">RETURN TO MAIN MENU</button>
          </div>
        </div>
      </div>

      <!-- GAME OVER SCREEN -->
      <div id="screen-gameover" class="modal-screen hidden">
        <div class="modal-card end-modal gameover-modal">
          <div class="end-header">
            <img src="./assets/images/novaki_portrait.png" alt="Novaki" class="end-portrait" />
            <div>
              <div class="modal-kicker danger-text">EMBER EXTINGUISHED</div>
              <h2>SNUFFED OUT!</h2>
              <p class="end-quote">"Snuffed out... Hand me the strike-strip, I'm going back in."</p>
            </div>
          </div>

          <div id="gameover-stats-grid" class="stats-grid"></div>
          <div id="gameover-build-row" class="end-build-row"></div>

          <div class="end-actions">
            <button id="btn-gameover-retry" class="btn-primary" type="button">STRIKE AGAIN (NEW RUN)</button>
            <button id="btn-gameover-forge" class="btn-secondary" type="button">MATCHBOX FORGE (SPEND CINDERS)</button>
            <button id="btn-gameover-menu" class="btn-outline" type="button">MAIN MENU</button>
          </div>
        </div>
      </div>

      <!-- VICTORY SCREEN (WITH VOICED ENDING STORY) -->
      <div id="screen-victory" class="modal-screen hidden">
        <div class="modal-card end-modal victory-modal">
          <div class="victory-story-banner">
            <img src="./assets/images/story_victory.jpg" alt="Novaki Victory" class="victory-art" />
            <div class="victory-story-overlay">
              <div class="modal-kicker gold-text">VICTORY • KINDLEWICK REIGNITED!</div>
              <h2>STILL SMOLDERING, FOREVER BRIGHT</h2>
              <div class="victory-dialogue-box">
                <strong id="victory-speaker">The Chronicler:</strong>
                <span id="victory-dialogue-text">
                  "As the Brass Snuffer shattered into glowing slag, the Great Icebox thawed, and a warm golden fire roared back to life across Kindlewick."
                </span>
              </div>
              <div class="victory-story-controls">
                <button id="btn-victory-next-voice" class="btn-small" type="button">NEXT VOICED LINE (1/3)</button>
              </div>
            </div>
          </div>

          <div id="victory-stats-grid" class="stats-grid"></div>
          <div id="victory-build-row" class="end-build-row"></div>

          <div class="end-actions">
            <button id="btn-victory-retry" class="btn-primary" type="button">PLAY ANOTHER RUN</button>
            <button id="btn-victory-forge" class="btn-secondary" type="button">MATCHBOX FORGE</button>
            <button id="btn-victory-menu" class="btn-outline" type="button">MAIN MENU</button>
          </div>
        </div>
      </div>

      <!-- STORY INTRO MODAL -->
      <div id="modal-story-intro" class="modal-screen hidden">
        <div class="modal-card story-modal">
          <img src="./assets/images/story_intro.jpg" alt="Story Intro" class="story-art" />
          <div class="story-body">
            <div id="intro-speaker-badge" class="modal-kicker gold-text">CHAPTER I • THE GREAT DAMP</div>
            <p id="intro-text" class="story-narration"></p>
            <div class="story-controls">
              <button id="btn-intro-next" class="btn-primary" type="button">NEXT (1/3)</button>
              <button id="btn-intro-start-game" class="btn-secondary" type="button">SKIP & START RUN</button>
              <button id="btn-intro-close" class="btn-outline" type="button">BACK TO MENU</button>
            </div>
          </div>
        </div>
      </div>

      <!-- MATCHBOX FORGE (META-PROGRESSION MODAL) -->
      <div id="modal-meta" class="modal-screen hidden">
        <div class="modal-card wide-modal">
          <div class="modal-top-bar">
            <div>
              <div class="modal-kicker">PERSISTENT META-PROGRESSION</div>
              <h2>THE MATCHBOX FORGE</h2>
            </div>
            <div class="forge-cinder-box">
              <span class="stat-dot cinder-dot"></span>
              <span id="forge-cinder-count">0</span> EMBER CINDERS
            </div>
            <button id="btn-close-meta" class="btn-outline" type="button">CLOSE</button>
          </div>
          <p class="modal-sub">Spend Ember Cinders recovered from your runs to permanently temper Novaki's wooden stem and sulfur head.</p>
          <div id="meta-upgrades-grid" class="meta-upgrades-grid"></div>
        </div>
      </div>

      <!-- SETTINGS MODAL -->
      <div id="modal-settings" class="modal-screen hidden">
        <div class="modal-card settings-modal">
          <div class="modal-top-bar">
            <div>
              <div class="modal-kicker">CONFIGURATION</div>
              <h2>GAME SETTINGS</h2>
            </div>
            <button id="btn-close-settings" class="btn-outline" type="button">CLOSE</button>
          </div>

          <div class="settings-list">
            <label class="setting-row">
              <span>Music Volume</span>
              <div class="slider-wrap">
                <input id="input-music-vol" type="range" min="0" max="100" step="1" />
                <span id="label-music-vol">65%</span>
              </div>
            </label>

            <label class="setting-row">
              <span>Sound & Voice Volume</span>
              <div class="slider-wrap">
                <input id="input-sound-vol" type="range" min="0" max="100" step="1" />
                <span id="label-sound-vol">80%</span>
              </div>
            </label>

            <label class="setting-row">
              <span>Screen Shake</span>
              <input id="input-screenshake" type="checkbox" class="toggle-checkbox" />
            </label>

            <label class="setting-row">
              <span>Floating Damage Numbers</span>
              <input id="input-dmg-numbers" type="checkbox" class="toggle-checkbox" />
            </label>
          </div>
        </div>
      </div>

      <!-- HOW TO PLAY & EVOLUTION CODEX MODAL -->
      <div id="modal-howto" class="modal-screen hidden">
        <div class="modal-card wide-modal howto-modal">
          <div class="modal-top-bar">
            <div>
              <div class="modal-kicker">SURVIVAL MANUAL & SYNERGY CODEX</div>
              <h2>HOW TO PLAY</h2>
            </div>
            <button id="btn-close-howto" class="btn-outline" type="button">CLOSE</button>
          </div>

          <div class="howto-columns">
            <div class="howto-box">
              <h3>CONTROLS (KEYBOARD, GAMEPAD & TOUCH)</h3>
              <ul>
                <li><strong>Move:</strong> <code>WASD</code> / <code>Arrow Keys</code> / Gamepad Left Stick / On-Screen Joystick</li>
                <li><strong>Flame-Step Dash:</strong> <code>Space</code> or <code>Shift</code> / Gamepad <code>A</code> or <code>RB</code> / Touch <strong>DASH</strong> button (Grants brief invincibility & leaves scorching napalm!)</li>
                <li><strong>Ignition Overdrive:</strong> <code>E</code> or <code>Q</code> / Gamepad <code>X</code> or <code>LB</code> / Touch <strong>IGNITE</strong> button at 100% Charge (Erupts Novaki's head into flames for 8s!)</li>
                <li><strong>Strike Pads & Matchboxes:</strong> Dash across orange <strong>Strike Pads</strong> for a 5.5s Strike Frenzy! Smash <strong>Supply Matchboxes</strong> for Marshmallow heals, Vacuum Sparks, and Cinders.</li>
              </ul>
            </div>

            <div class="howto-box">
              <h3>3 STAGES & OVERLORDS</h3>
              <ul>
                <li><strong>Stage I • The Soggy Cellar (0:00–5:00):</strong> Boss: <em>Baron Von Drip</em></li>
                <li><strong>Stage II • The Waxworks Cathedral (5:00–10:00):</strong> Boss: <em>Arch-Prelate Tallow</em></li>
                <li><strong>Stage III • The Frostbite Freezer (10:00–15:00):</strong> Boss: <em>General Absolute Zero</em></li>
              </ul>
            </div>
          </div>

          <h3 class="synergy-heading">8 WEAPON EVOLUTION RECIPES (LEVEL 5 WEAPON + SYNERGY PASSIVE)</h3>
          <div id="howto-evolutions-grid" class="synergy-grid"></div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Wire engine hooks
    this.engine.onScreenChange = (scr) => this.syncScreen(scr);
    this.engine.onStageTransition = (st) => this.showStageBanner(st);
    this.engine.onLevelUpOpen = (cards) => this.renderLevelUpCards(cards);
    this.engine.onHudUpdate = () => this.updateHUD();
    this.engine.audio.setOnVoiceCue((cue) => this.showVoiceComms(cue));

    // Bind touch joystick & buttons
    const joyZone = document.getElementById('touch-joystick-zone')!;
    const joyBase = document.getElementById('touch-joystick-base')!;
    const joyKnob = document.getElementById('touch-joystick-knob')!;
    const dashBtn = document.getElementById('touch-dash-btn')!;
    const odBtn = document.getElementById('touch-overdrive-btn')!;
    this.engine.input.bindTouchControls(joyZone, joyBase, joyKnob, dashBtn, odBtn);

    // HUD ability pills also clickable
    document.getElementById('hud-dash-pill')?.addEventListener('click', () => {
      this.engine.input.triggerDash();
    });
    document.getElementById('hud-overdrive-pill')?.addEventListener('click', () => {
      this.engine.input.triggerOverdrive();
    });

    // Main Menu buttons
    document.getElementById('btn-start-run')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.engine.startRun();
      this.showStageBanner(1);
    });

    document.getElementById('menu-hero-card')?.addEventListener('click', () => {
      this.engine.audio.playVoice('bark_menu_welcome');
    });

    document.getElementById('btn-story-intro')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.openStoryIntroModal();
    });

    document.getElementById('btn-open-meta')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.renderMetaShop();
      document.getElementById('modal-meta')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-meta')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      document.getElementById('modal-meta')?.classList.add('hidden');
      this.renderAspectSelector();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.syncSettingsControls();
      document.getElementById('modal-settings')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      document.getElementById('modal-settings')?.classList.add('hidden');
    });

    document.getElementById('btn-open-howto')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.renderHowToEvolutions();
      document.getElementById('modal-howto')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-howto')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      document.getElementById('modal-howto')?.classList.add('hidden');
    });

    // Story Intro Modal controls
    document.getElementById('btn-intro-next')?.addEventListener('click', () => {
      this.advanceStoryIntro();
    });
    document.getElementById('btn-intro-start-game')?.addEventListener('click', () => {
      document.getElementById('modal-story-intro')?.classList.add('hidden');
      this.engine.startRun();
      this.showStageBanner(1);
    });
    document.getElementById('btn-intro-close')?.addEventListener('click', () => {
      document.getElementById('modal-story-intro')?.classList.add('hidden');
      this.engine.audio.stopVoice();
    });

    // Pause Menu controls
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      if (this.engine.screen === 'playing') {
        this.engine.setScreen('paused');
      } else if (this.engine.screen === 'paused') {
        this.engine.setScreen('playing');
      }
    });
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.engine.audio.playSfx('ui_click');
      this.engine.setScreen('playing');
    });
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      this.syncSettingsControls();
      document.getElementById('modal-settings')?.classList.remove('hidden');
    });
    document.getElementById('btn-pause-howto')?.addEventListener('click', () => {
      this.renderHowToEvolutions();
      document.getElementById('modal-howto')?.classList.remove('hidden');
    });
    document.getElementById('btn-restart-run')?.addEventListener('click', () => {
      this.engine.startRun();
    });
    document.getElementById('btn-quit-menu')?.addEventListener('click', () => {
      this.engine.audio.playMusic('music_menu');
      this.engine.setScreen('menu');
      this.renderAspectSelector();
    });

    // Level-Up Reroll
    document.getElementById('btn-reroll')?.addEventListener('click', () => {
      this.engine.rerollLevelUpCards();
    });

    // Game Over & Victory Buttons
    document.getElementById('btn-gameover-retry')?.addEventListener('click', () => {
      this.engine.startRun();
    });
    document.getElementById('btn-gameover-forge')?.addEventListener('click', () => {
      this.engine.setScreen('menu');
      this.renderMetaShop();
      document.getElementById('modal-meta')?.classList.remove('hidden');
    });
    document.getElementById('btn-gameover-menu')?.addEventListener('click', () => {
      this.engine.audio.playMusic('music_menu');
      this.engine.setScreen('menu');
      this.renderAspectSelector();
    });

    document.getElementById('btn-victory-retry')?.addEventListener('click', () => {
      this.engine.startRun();
    });
    document.getElementById('btn-victory-forge')?.addEventListener('click', () => {
      this.engine.setScreen('menu');
      this.renderMetaShop();
      document.getElementById('modal-meta')?.classList.remove('hidden');
    });
    document.getElementById('btn-victory-menu')?.addEventListener('click', () => {
      this.engine.audio.playMusic('music_menu');
      this.engine.setScreen('menu');
      this.renderAspectSelector();
    });
    document.getElementById('btn-victory-next-voice')?.addEventListener('click', () => {
      this.advanceVictoryVoice();
    });

    // Settings Sliders & Checkboxes
    const musicInput = document.getElementById('input-music-vol') as HTMLInputElement;
    const soundInput = document.getElementById('input-sound-vol') as HTMLInputElement;
    const shakeInput = document.getElementById('input-screenshake') as HTMLInputElement;
    const dmgInput = document.getElementById('input-dmg-numbers') as HTMLInputElement;

    musicInput?.addEventListener('input', () => {
      const val = Number(musicInput.value) / 100;
      this.engine.save.settings.musicVolume = val;
      this.engine.save.saveSettings();
      this.engine.audio.updateSettings(this.engine.save.settings);
      const lbl = document.getElementById('label-music-vol');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
    });

    soundInput?.addEventListener('input', () => {
      const val = Number(soundInput.value) / 100;
      this.engine.save.settings.soundVolume = val;
      this.engine.save.saveSettings();
      this.engine.audio.updateSettings(this.engine.save.settings);
      const lbl = document.getElementById('label-sound-vol');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
    });

    shakeInput?.addEventListener('change', () => {
      this.engine.save.settings.screenShake = shakeInput.checked;
      this.engine.save.saveSettings();
    });

    dmgInput?.addEventListener('change', () => {
      this.engine.save.settings.damageNumbers = dmgInput.checked;
      this.engine.save.saveSettings();
    });
  }

  public syncScreen(screen: ScreenName): void {
    const menuEl = document.getElementById('screen-menu')!;
    const hudEl = document.getElementById('hud-overlay')!;
    const levelupEl = document.getElementById('screen-levelup')!;
    const pausedEl = document.getElementById('screen-paused')!;
    const gameoverEl = document.getElementById('screen-gameover')!;
    const victoryEl = document.getElementById('screen-victory')!;

    menuEl.classList.toggle('hidden', screen !== 'menu');
    hudEl.classList.toggle('hidden', screen === 'menu');
    levelupEl.classList.toggle('hidden', screen !== 'levelup');
    pausedEl.classList.toggle('hidden', screen !== 'paused');
    gameoverEl.classList.toggle('hidden', screen !== 'gameover');
    victoryEl.classList.toggle('hidden', screen !== 'victory');

    if (screen === 'menu') {
      this.engine.audio.playMusic('music_menu');
      this.renderAspectSelector();
    } else if (screen === 'paused') {
      this.renderPauseSummary();
    } else if (screen === 'gameover') {
      this.renderEndRunStats('gameover');
    } else if (screen === 'victory') {
      this.renderEndRunStats('victory');
      this.startVictoryStorySequence();
    }
  }

  public updateHUD(): void {
    if (this.engine.screen === 'menu') return;

    const p = this.engine.player;
    const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
    const xpPct = Math.max(0, Math.min(100, (p.xp / Math.max(1, p.xpToNext)) * 100));

    const hpFill = document.getElementById('hud-hp-fill');
    const hpText = document.getElementById('hud-hp-text');
    const xpFill = document.getElementById('hud-xp-fill');
    const xpText = document.getElementById('hud-xp-text');
    const lvlBadge = document.getElementById('hud-level-badge');

    if (hpFill) hpFill.style.width = `${hpPct.toFixed(1)}%`;
    if (hpText) {
      hpText.textContent = `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)} HP${p.invincible ? ' [INVINCIBLE]' : ''}`;
    }
    if (xpFill) xpFill.style.width = `${xpPct.toFixed(1)}%`;
    if (xpText) xpText.textContent = `XP ${Math.floor(p.xp)} / ${p.xpToNext}`;
    if (lvlBadge) lvlBadge.textContent = `LV ${p.level}`;

    // Dash & Overdrive indicators
    const dashPill = document.getElementById('hud-dash-pill');
    const dashText = document.getElementById('hud-dash-text');
    if (dashPill && dashText) {
      if (p.dashCooldown <= 0) {
        dashPill.classList.add('ready');
        dashText.textContent = 'FLAME-STEP READY';
      } else {
        dashPill.classList.remove('ready');
        dashText.textContent = `DASH ${p.dashCooldown.toFixed(1)}s`;
      }
    }

    const odPill = document.getElementById('hud-overdrive-pill');
    const odText = document.getElementById('hud-overdrive-text');
    if (odPill && odText) {
      if (p.overdriveTimer > 0) {
        odPill.classList.add('active-burn');
        odText.textContent = `BURNING! ${p.overdriveTimer.toFixed(1)}s`;
      } else if (p.overdriveCharge >= 100) {
        odPill.classList.add('ready');
        odPill.classList.remove('active-burn');
        odText.textContent = 'PRESS [E] IGNITE!';
      } else {
        odPill.classList.remove('ready', 'active-burn');
        odText.textContent = `IGNITE ${Math.floor(p.overdriveCharge)}%`;
      }
    }

    // Stage Clock & Boss countdown
    const stDef = STAGE_DEFS[this.engine.stage];
    const stageLabel = document.getElementById('hud-stage-label');
    const timeLabel = document.getElementById('hud-time-label');
    const waveSub = document.getElementById('hud-wave-sub');

    if (stageLabel) stageLabel.textContent = `STAGE ${this.engine.stage} • ${stDef.name.toUpperCase()}`;
    if (timeLabel) timeLabel.textContent = this.formatSeconds(this.engine.runTime);
    if (waveSub) {
      if (this.engine.bossActive) {
        waveSub.textContent = 'OVERLORD ENGAGED!';
      } else {
        const rem = Math.max(0, stDef.durationSeconds - this.engine.stageTime);
        waveSub.textContent = `BOSS IN ${this.formatSeconds(rem)}`;
      }
    }

    // Boss HP Bar
    const bossBar = document.getElementById('hud-boss-bar');
    const activeBoss = this.engine.enemies.find((e) => e.isBoss);
    if (bossBar) {
      if (this.engine.bossActive && activeBoss) {
        bossBar.classList.remove('hidden');
        const bName = document.getElementById('hud-boss-name');
        const bHpText = document.getElementById('hud-boss-hp-text');
        const bFill = document.getElementById('hud-boss-fill');
        if (bName) {
          bName.textContent = `${activeBoss.name.toUpperCase()}${activeBoss.bossPhase === 2 ? ' (ENRAGED!)' : ''}`;
        }
        if (bHpText) {
          bHpText.textContent = `${Math.max(0, Math.ceil(activeBoss.hp))} / ${activeBoss.maxHp}`;
        }
        if (bFill) {
          bFill.style.width = `${Math.max(0, Math.min(100, (activeBoss.hp / activeBoss.maxHp) * 100)).toFixed(1)}%`;
        }
      } else {
        bossBar.classList.add('hidden');
      }
    }

    // Right stats
    const cindersEl = document.getElementById('hud-cinders-text');
    const killsEl = document.getElementById('hud-kills-text');
    if (cindersEl) cindersEl.textContent = `${this.engine.save.meta.currency}`;
    if (killsEl) killsEl.textContent = `${this.engine.runStats.enemiesKilled}`;

    // Loadout tray
    const tray = document.getElementById('hud-loadout-tray');
    if (tray) {
      tray.innerHTML = this.engine.upgradesOwnedOrder
        .map((id) => {
          const def = UPGRADE_DEFS[id];
          if (!def) return '';
          const lvl = this.engine.getUpgradeLevel(id);
          const isEvo = def.category === 'evolution';
          return `
            <div class="tray-slot ${isEvo ? 'evo-slot' : ''}" title="${def.name} (Lv ${lvl})">
              <div class="tray-icon">${getUpgradeIconSvg(def.id, def.color)}</div>
              <span class="tray-lvl">${isEvo ? 'EVO' : `L${lvl}`}</span>
            </div>
          `;
        })
        .join('');
    }
  }

  private renderLevelUpCards(cards: OfferedUpgradeCard[]): void {
    const grid = document.getElementById('levelup-cards-grid');
    const rerollBtn = document.getElementById('btn-reroll') as HTMLButtonElement | null;
    if (!grid) return;

    if (rerollBtn) {
      rerollBtn.textContent = `REROLL OPTIONS (${this.engine.player.rerollsLeft} LEFT)`;
      rerollBtn.disabled = this.engine.player.rerollsLeft <= 0;
    }

    grid.innerHTML = cards
      .map((card, idx) => {
        const def = card.def;
        const desc = def.levelDescriptions[Math.min(def.levelDescriptions.length - 1, card.nextLevel - 1)] || def.description;
        const synergyDef = def.synergyWithId ? UPGRADE_DEFS[def.synergyWithId] : null;
        const badgeText = card.isEvolution
          ? 'ULTIMATE EVOLUTION!'
          : card.isNew
          ? `NEW ${def.category.toUpperCase()}`
          : `LEVEL ${card.nextLevel} / ${def.maxLevel}`;

        return `
          <button id="upgrade-card-${idx}" class="upgrade-card ${card.isEvolution ? 'card-evolution' : ''}" data-idx="${idx}" type="button">
            <div class="card-top-row">
              <span class="card-key-hint">[${idx + 1}]</span>
              <span class="card-badge" style="color: ${def.color}">${badgeText}</span>
            </div>
            <div class="card-icon-wrap">
              ${getUpgradeIconSvg(def.id, def.color)}
            </div>
            <h3 class="card-title">${def.name}</h3>
            <p class="card-desc">${desc}</p>
            ${
              synergyDef
                ? `<div class="card-synergy ${card.synergyOwned ? 'synergy-active' : ''}">
                    <span>Synergy: <strong>${synergyDef.name}</strong></span>
                    <span>${card.synergyOwned ? '✓ OWNED' : 'Not Owned'}</span>
                  </div>`
                : ''
            }
          </button>
        `;
      })
      .join('');

    cards.forEach((_, idx) => {
      document.getElementById(`upgrade-card-${idx}`)?.addEventListener('click', () => {
        this.engine.chooseUpgrade(idx);
      });
    });
  }

  public showVoiceComms(cue: VoiceCue | null): void {
    const banner = document.getElementById('voice-comms-banner');
    if (!banner) return;

    if (this.voiceTimeout) {
      window.clearTimeout(this.voiceTimeout);
      this.voiceTimeout = null;
    }

    if (!cue) {
      banner.classList.add('hidden');
      return;
    }

    const avatar = document.getElementById('voice-comms-avatar') as HTMLImageElement | null;
    const speaker = document.getElementById('voice-comms-speaker');
    const title = document.getElementById('voice-comms-title');
    const text = document.getElementById('voice-comms-text');

    if (avatar) {
      avatar.src = this.engine.assets.getImageUrl(cue.portraitKey) || './assets/images/novaki_portrait.png';
    }
    if (speaker) {
      speaker.textContent = cue.speaker.toUpperCase();
      speaker.style.color = cue.themeColor;
    }
    if (title) title.textContent = cue.speakerTitle;
    if (text) text.textContent = `"${cue.text}"`;

    banner.classList.remove('hidden');
    this.voiceTimeout = window.setTimeout(() => {
      banner.classList.add('hidden');
    }, 6200);
  }

  public showStageBanner(stageId: StageId): void {
    const st = STAGE_DEFS[stageId];
    const banner = document.getElementById('stage-banner');
    const sub = document.getElementById('stage-banner-sub');
    const title = document.getElementById('stage-banner-title');
    const desc = document.getElementById('stage-banner-desc');
    if (!banner || !sub || !title || !desc) return;

    sub.textContent = st.subtitle.toUpperCase();
    title.textContent = st.name.toUpperCase();
    desc.textContent = st.description;

    banner.classList.remove('hidden');
    window.setTimeout(() => {
      banner.classList.add('hidden');
    }, 3400);
  }

  private openStoryIntroModal(): void {
    const modal = document.getElementById('modal-story-intro');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.introStepIndex = 0;
    this.playIntroStep(0);
  }

  private playIntroStep(step: number): void {
    const keys = ['intro_1_narrator', 'intro_2_narrator', 'intro_3_novaki'];
    const cueKey = keys[step] || keys[0];
    const cue = VOICE_CUES[cueKey];
    const badge = document.getElementById('intro-speaker-badge');
    const text = document.getElementById('intro-text');
    const nextBtn = document.getElementById('btn-intro-next');

    if (badge) badge.textContent = `${cue.speaker.toUpperCase()} • ${cue.speakerTitle.toUpperCase()}`;
    if (text) text.textContent = `"${cue.text}"`;
    if (nextBtn) {
      nextBtn.textContent = step < 2 ? `NEXT LINE (${step + 1}/3)` : 'IGNITE RUN NOW!';
    }
    this.engine.audio.playVoice(cueKey);
  }

  private advanceStoryIntro(): void {
    if (this.introStepIndex < 2) {
      this.introStepIndex += 1;
      this.playIntroStep(this.introStepIndex);
    } else {
      document.getElementById('modal-story-intro')?.classList.add('hidden');
      this.engine.startRun();
      this.showStageBanner(1);
    }
  }

  private startVictoryStorySequence(): void {
    this.victoryStepIndex = 0;
    this.playVictoryStep(0);
  }

  private playVictoryStep(step: number): void {
    const keys = ['ending_1_narrator', 'ending_2_novaki', 'ending_3_narrator'];
    const cueKey = keys[step % keys.length];
    const cue = VOICE_CUES[cueKey];
    const speaker = document.getElementById('victory-speaker');
    const text = document.getElementById('victory-dialogue-text');
    const btn = document.getElementById('btn-victory-next-voice');

    if (speaker) speaker.textContent = `${cue.speaker}:`;
    if (text) text.textContent = `"${cue.text}"`;
    if (btn) btn.textContent = `NEXT VOICED EPILOGUE (${(step % 3) + 1}/3)`;
    this.engine.audio.playVoice(cueKey);
  }

  private advanceVictoryVoice(): void {
    this.victoryStepIndex = (this.victoryStepIndex + 1) % 3;
    this.playVictoryStep(this.victoryStepIndex);
  }

  private renderAspectSelector(): void {
    const container = document.getElementById('aspect-list');
    const balanceEl = document.getElementById('menu-cinder-balance');
    if (balanceEl) {
      balanceEl.textContent = `${this.engine.save.meta.currency} EMBER CINDERS`;
    }
    if (!container) return;

    container.innerHTML = STARTER_ASPECTS.map((asp) => {
      const unlocked = this.engine.save.meta.unlocks.includes(asp.id);
      const selected = this.engine.save.meta.selectedAspect === asp.id;
      return `
        <button class="aspect-card ${selected ? 'selected' : ''}" data-aspect="${asp.id}" type="button">
          <div class="aspect-card-top">
            <strong>${asp.name}</strong>
            <span class="aspect-status">${selected ? 'EQUIPPED' : unlocked ? 'UNLOCKED' : `${asp.cost} CINDERS`}</span>
          </div>
          <p>${asp.description}</p>
        </button>
      `;
    }).join('');

    STARTER_ASPECTS.forEach((asp) => {
      const btn = container.querySelector(`[data-aspect="${asp.id}"]`);
      btn?.addEventListener('click', () => {
        if (this.engine.save.buyOrSelectAspect(asp.id)) {
          this.engine.audio.playSfx('ui_click');
          this.renderAspectSelector();
        }
      });
    });
  }

  private renderMetaShop(): void {
    const grid = document.getElementById('meta-upgrades-grid');
    const countEl = document.getElementById('forge-cinder-count');
    if (countEl) countEl.textContent = `${this.engine.save.meta.currency}`;
    if (!grid) return;

    grid.innerHTML = META_UPGRADES.map((upg) => {
      const lvl = this.engine.save.getUpgradeLevel(upg.id);
      const isMax = lvl >= upg.maxLevel;
      const cost = this.engine.save.getUpgradeCost(upg.id);
      const canAfford = !isMax && this.engine.save.meta.currency >= cost;

      return `
        <div class="meta-card">
          <div class="meta-card-head">
            <strong style="color: ${upg.color}">${upg.name}</strong>
            <span class="meta-rank">RANK ${lvl} / ${upg.maxLevel}</span>
          </div>
          <p class="meta-desc">${upg.description}</p>
          <div class="meta-footer">
            <span class="meta-stat">${upg.statLabel(lvl)}</span>
            <button class="btn-meta-buy ${canAfford ? 'affordable' : ''}" data-meta="${upg.id}" ${!canAfford || isMax ? 'disabled' : ''} type="button">
              ${isMax ? 'MAXED' : `FORGE (${cost} CINDERS)`}
            </button>
          </div>
        </div>
      `;
    }).join('');

    META_UPGRADES.forEach((upg) => {
      const btn = grid.querySelector(`[data-meta="${upg.id}"]`);
      btn?.addEventListener('click', () => {
        if (this.engine.save.buyUpgrade(upg.id)) {
          this.engine.audio.playSfx('levelup');
          this.renderMetaShop();
        }
      });
    });
  }

  private renderPauseSummary(): void {
    const container = document.getElementById('pause-build-summary');
    if (!container) return;

    container.innerHTML = `
      <div class="pause-stats-line">
        <span>Stage ${this.engine.stage}</span> •
        <span>Time ${this.formatSeconds(this.engine.runTime)}</span> •
        <span>Level ${this.engine.player.level}</span> •
        <span>Kills ${this.engine.runStats.enemiesKilled}</span>
      </div>
      <div class="pause-upgrades-list">
        ${this.engine.upgradesOwnedOrder
          .map((id) => {
            const def = UPGRADE_DEFS[id];
            if (!def) return '';
            return `<span class="build-chip" style="border-color: ${def.color}">${def.name} (Lv ${this.engine.getUpgradeLevel(id)})</span>`;
          })
          .join('')}
      </div>
    `;
  }

  private renderEndRunStats(mode: 'gameover' | 'victory'): void {
    const stats = this.engine.runStats;
    const gridId = mode === 'victory' ? 'victory-stats-grid' : 'gameover-stats-grid';
    const buildId = mode === 'victory' ? 'victory-build-row' : 'gameover-build-row';
    const grid = document.getElementById(gridId);
    const buildRow = document.getElementById(buildId);

    if (grid) {
      grid.innerHTML = `
        <div class="stat-box"><span>STAGE REACHED</span><strong>Stage ${stats.stageReached} (${STAGE_DEFS[stats.stageReached].name})</strong></div>
        <div class="stat-box"><span>TIME SURVIVED</span><strong>${this.formatSeconds(stats.timeSurvived)}</strong></div>
        <div class="stat-box"><span>LEVEL REACHED</span><strong>Level ${stats.levelReached}</strong></div>
        <div class="stat-box"><span>ENEMIES VAPORIZED</span><strong>${stats.enemiesKilled} (${stats.bossesKilled} Bosses)</strong></div>
        <div class="stat-box"><span>TOTAL DAMAGE DEALT</span><strong>${stats.damageDealt.toLocaleString()}</strong></div>
        <div class="stat-box"><span>CINDERS BANKED</span><strong class="gold-text">+${stats.cindersEarned} Cinders (Total: ${this.engine.save.meta.currency})</strong></div>
      `;
    }

    if (buildRow) {
      buildRow.innerHTML = this.engine.upgradesOwnedOrder
        .map((id) => {
          const def = UPGRADE_DEFS[id];
          if (!def) return '';
          return `<span class="build-chip" style="border-color: ${def.color}">${def.name} Lv.${this.engine.getUpgradeLevel(id)}</span>`;
        })
        .join('');
    }
  }

  private renderHowToEvolutions(): void {
    const grid = document.getElementById('howto-evolutions-grid');
    if (!grid) return;

    const evos = Object.values(UPGRADE_DEFS).filter((u) => u.category === 'evolution');
    grid.innerHTML = evos
      .map((evo) => {
        const wpn = evo.evolvesFromWeaponId ? UPGRADE_DEFS[evo.evolvesFromWeaponId] : null;
        const pas = evo.requiresPassiveId ? UPGRADE_DEFS[evo.requiresPassiveId] : null;
        return `
          <div class="synergy-recipe-card">
            <div class="recipe-formula">
              <span>${wpn?.name || ''} (Lv 5)</span>
              <span class="plus">+</span>
              <span>${pas?.name || ''}</span>
              <span class="arrow">➔</span>
              <strong style="color: ${evo.color}">${evo.name}</strong>
            </div>
            <p>${evo.description}</p>
          </div>
        `;
      })
      .join('');
  }

  private syncSettingsControls(): void {
    const s = this.engine.save.settings;
    const musicInput = document.getElementById('input-music-vol') as HTMLInputElement | null;
    const soundInput = document.getElementById('input-sound-vol') as HTMLInputElement | null;
    const shakeInput = document.getElementById('input-screenshake') as HTMLInputElement | null;
    const dmgInput = document.getElementById('input-dmg-numbers') as HTMLInputElement | null;
    const musicLbl = document.getElementById('label-music-vol');
    const soundLbl = document.getElementById('label-sound-vol');

    if (musicInput) musicInput.value = `${Math.round(s.musicVolume * 100)}`;
    if (soundInput) soundInput.value = `${Math.round(s.soundVolume * 100)}`;
    if (shakeInput) shakeInput.checked = s.screenShake;
    if (dmgInput) dmgInput.checked = s.damageNumbers;
    if (musicLbl) musicLbl.textContent = `${Math.round(s.musicVolume * 100)}%`;
    if (soundLbl) soundLbl.textContent = `${Math.round(s.soundVolume * 100)}%`;
  }

  private formatSeconds(sec: number): string {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
