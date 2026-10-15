import {
  BOSS_DEFS,
  ENEMY_DEFS,
  STAGE_DEFS,
  STARTER_ASPECTS,
  UPGRADE_DEFS,
} from '../data/content';
import { AssetManager } from '../systems/AssetManager';
import { AudioManager } from '../systems/AudioManager';
import { InputManager } from '../systems/InputManager';
import { SaveManager } from '../systems/SaveManager';
import {
  EnemyEntity,
  FloatingTextEntity,
  HazardEntity,
  ParticleEntity,
  PickupEntity,
  ProjectileEntity,
  PropEntity,
  QASnapshot,
  QAStartOptions,
  RunStats,
  ScreenName,
  StageId,
  UpgradeDef,
} from '../types';
import { SeededRNG, SpatialHashGrid } from '../utils/rng';
import { RenderPlayerState, WorldRenderer } from './WorldRenderer';

export interface OfferedUpgradeCard {
  def: UpgradeDef;
  nextLevel: number;
  isNew: boolean;
  isEvolution: boolean;
  synergyReady: boolean;
  synergyOwned: boolean;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: WorldRenderer;
  public assets: AssetManager;
  public audio: AudioManager;
  public input: InputManager;
  public save: SaveManager;
  public rng: SeededRNG;

  // Screen & Stage state
  public screen: ScreenName = 'menu';
  public stage: StageId = 1;
  public runTime: number = 0;
  public stageTime: number = 0;
  public bossActive: boolean = false;
  public bossSpawnedForStage: boolean = false;
  public arenaRadius: number = 1800;

  // Player state
  public player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 120,
    maxHp: 120,
    level: 1,
    xp: 0,
    xpToNext: 25,
    radius: 20,
    facing: 1,
    invincible: false,
    iframeTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashMaxCooldown: 2.2,
    overdriveCharge: 0, // 0..100
    overdriveTimer: 0,
    frenzyTimer: 0,
    walkPhase: 0,
    lowHpWarned: false,
    rerollsLeft: 1,
    smokePoints: [] as Array<{ x: number; y: number; age: number }>,
  };

  // Upgrades owned in current run: id -> current level (1..5, or 1 for evolutions)
  public upgradeLevels: Map<string, number> = new Map();
  // Ordered list of upgrade IDs owned in this run for QA state().upgrades
  public upgradesOwnedOrder: string[] = [];
  // Currently offered cards on the levelup screen
  public currentLevelUpCards: OfferedUpgradeCard[] = [];

  // Weapon internal cooldown timers
  private weaponTimers: Map<string, number> = new Map();
  private orbitAngle: number = 0;

  // World entities
  public enemies: EnemyEntity[] = [];
  public projectiles: ProjectileEntity[] = [];
  public hazards: HazardEntity[] = [];
  public pickups: PickupEntity[] = [];
  public props: PropEntity[] = [];
  public particles: ParticleEntity[] = [];
  public floatingTexts: FloatingTextEntity[] = [];

  private spatialGrid = new SpatialHashGrid<EnemyEntity>(110);
  private nextUid: number = 1;

  // Spawner & camera state
  private waveSpawnTimer: number = 0;
  private eliteSpawnTimer: number = 42;
  private propSpawnTimer: number = 10;
  private camX: number = 0;
  private camY: number = 0;
  private shakeIntensity: number = 0;
  private shakeTimer: number = 0;
  private smokeEmitTimer: number = 0;

  // Run statistics
  public runStats: RunStats = this.createEmptyStats();

  // UI Sync Callbacks
  public onScreenChange?: (screen: ScreenName) => void;
  public onStageTransition?: (stage: StageId) => void;
  public onLevelUpOpen?: (cards: OfferedUpgradeCard[]) => void;
  public onHudUpdate?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    assets: AssetManager,
    audio: AudioManager,
    input: InputManager,
    save: SaveManager
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.assets = assets;
    this.audio = audio;
    this.input = input;
    this.save = save;
    this.rng = new SeededRNG(Date.now());
    this.renderer = new WorldRenderer(this.ctx, this.assets);
  }

  private createEmptyStats(): RunStats {
    return {
      stageReached: 1,
      timeSurvived: 0,
      levelReached: 1,
      enemiesKilled: 0,
      elitesKilled: 0,
      bossesKilled: 0,
      damageDealt: 0,
      damageTaken: 0,
      cindersEarned: 0,
      evolutionsUnlocked: 0,
      upgradesOwned: [],
    };
  }

  public setScreen(nextScreen: ScreenName): void {
    this.screen = nextScreen;
    if (this.onScreenChange) {
      this.onScreenChange(nextScreen);
    }
  }

  // =========================================================================
  // QA INTERFACE & RUN INITIALIZATION
  // =========================================================================

  public getQASnapshot(): QASnapshot {
    return {
      screen: this.screen,
      stage: this.stage,
      time: Number(this.runTime.toFixed(2)),
      player: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hp: Math.max(0, Math.round(this.player.hp)),
        maxHp: Math.round(this.player.maxHp),
        level: this.player.level,
        xp: Math.floor(this.player.xp),
      },
      enemies: this.enemies.length,
      bossActive: this.bossActive,
      upgrades: [...this.upgradesOwnedOrder],
      meta: {
        currency: this.save.meta.currency,
        unlocks: [...this.save.meta.unlocks],
        levels: { ...this.save.meta.levels },
        runsPlayed: this.save.meta.runsPlayed,
        victories: this.save.meta.victories,
      },
    };
  }

  public startRun(options: QAStartOptions = {}): QASnapshot {
    const seed =
      typeof options?.seed === 'number' && Number.isFinite(options.seed)
        ? options.seed
        : Date.now();
    this.rng.setSeed(seed);

    this.save.meta.runsPlayed += 1;
    this.save.saveMeta();

    this.stage = 1;
    this.runTime = 0;
    this.stageTime = 0;
    this.bossActive = false;
    this.bossSpawnedForStage = false;

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.hazards.length = 0;
    this.pickups.length = 0;
    this.props.length = 0;
    this.particles.length = 0;
    this.floatingTexts.length = 0;
    this.upgradeLevels.clear();
    this.upgradesOwnedOrder.length = 0;
    this.weaponTimers.clear();
    this.currentLevelUpCards.length = 0;

    // Reset player position & base stats + meta bonuses
    const bonusHp = this.save.getUpgradeLevel('meta_vitality') * 20;
    const agilityLvl = this.save.getUpgradeLevel('meta_agility');
    const fortuneLvl = this.save.getUpgradeLevel('meta_fortune');

    this.player.x = 0;
    this.player.y = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.maxHp = 120 + bonusHp;
    this.player.hp = this.player.maxHp;
    this.player.level = 1;
    this.player.xp = 0;
    this.player.xpToNext = 24;
    this.player.facing = 1;
    this.player.iframeTimer = 0;
    this.player.dashTimer = 0;
    this.player.dashCooldown = 0;
    this.player.dashMaxCooldown = Math.max(1.1, 2.2 * (1 - agilityLvl * 0.08));
    this.player.overdriveCharge = 25;
    this.player.overdriveTimer = 0;
    this.player.frenzyTimer = 0;
    this.player.lowHpWarned = false;
    this.player.rerollsLeft = 1 + fortuneLvl;
    this.player.smokePoints.length = 0;

    this.camX = 0;
    this.camY = 0;

    // Apply selected Starter Aspect
    const aspectId = options.aspectId || this.save.meta.selectedAspect || 'aspect_classic';
    const aspect = STARTER_ASPECTS.find((a) => a.id === aspectId) || STARTER_ASPECTS[0];
    this.grantUpgrade(aspect.starterWeaponId);
    if (aspect.bonusPassiveId) {
      this.grantUpgrade(aspect.bonusPassiveId);
    }

    this.runStats = this.createEmptyStats();
    this.runStats.upgradesOwned = [...this.upgradesOwnedOrder];

    this.setupStageEnvironment(1);
    // Spawn initial wave of Stage 1 enemies so the arena is immediately alive
    this.spawnStageWave(6);

    this.setScreen('playing');
    this.audio.playMusic(STAGE_DEFS[1].musicKey);
    this.audio.playVoice(STAGE_DEFS[1].startVoiceKey);

    if (this.onHudUpdate) this.onHudUpdate();
    return this.getQASnapshot();
  }

  public setInvincible(on: boolean): void {
    this.player.invincible = Boolean(on);
    if (this.onHudUpdate) this.onHudUpdate();
  }

  public addXp(amount: number): void {
    if (amount <= 0) return;
    // Ensure we are in an active run if called from menu
    if (this.screen === 'menu') {
      this.startRun();
    }

    const xpMult =
      1 +
      this.save.getUpgradeLevel('meta_magnet') * 0.1 +
      this.getUpgradeLevel('pas_lodestone_ash') * 0.1;

    this.player.xp += amount * xpMult;

    if (this.player.xp >= this.player.xpToNext && this.screen !== 'levelup') {
      this.triggerLevelUp();
    }
    if (this.onHudUpdate) this.onHudUpdate();
  }

  private triggerLevelUp(): void {
    this.player.xp = Math.max(0, this.player.xp - this.player.xpToNext);
    this.player.level += 1;
    this.runStats.levelReached = Math.max(this.runStats.levelReached, this.player.level);
    this.player.xpToNext = Math.floor(24 + this.player.level * 14 + Math.pow(this.player.level, 1.35) * 4);

    // Small heal on level-up
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8);
    this.audio.playSfx('levelup');

    this.currentLevelUpCards = this.rollUpgradeCards(3);
    if (this.currentLevelUpCards.length > 0) {
      this.setScreen('levelup');
      if (this.onLevelUpOpen) {
        this.onLevelUpOpen(this.currentLevelUpCards);
      }
    }
  }

  public chooseUpgrade(index: number): void {
    if (this.screen !== 'levelup' && this.currentLevelUpCards.length === 0) {
      this.currentLevelUpCards = this.rollUpgradeCards(3);
    }
    if (this.currentLevelUpCards.length === 0) {
      this.setScreen('playing');
      return;
    }

    const safeIdx = Math.max(0, Math.min(this.currentLevelUpCards.length - 1, Math.floor(index || 0)));
    const chosen = this.currentLevelUpCards[safeIdx];
    if (chosen) {
      this.grantUpgrade(chosen.def.id);
      if (chosen.isEvolution) {
        this.runStats.evolutionsUnlocked += 1;
        this.audio.playSfx('evolution');
        this.audio.playVoice('bark_evolution');
        this.addScreenShake(10, 0.35);
      } else {
        this.audio.playSfx('ui_click');
      }
    }

    // Clamp excess XP after choosing an upgrade so single addXp() + chooseUpgrade() returns cleanly to 'playing'
    if (this.player.xp >= this.player.xpToNext) {
      this.player.xp = this.player.xpToNext - 1;
    }

    this.currentLevelUpCards = [];
    this.setScreen('playing');
    if (this.onHudUpdate) this.onHudUpdate();
  }

  public rerollLevelUpCards(): boolean {
    if (this.screen !== 'levelup' || this.player.rerollsLeft <= 0) return false;
    this.player.rerollsLeft -= 1;
    this.audio.playSfx('ui_click');
    this.currentLevelUpCards = this.rollUpgradeCards(3);
    if (this.onLevelUpOpen) {
      this.onLevelUpOpen(this.currentLevelUpCards);
    }
    return true;
  }

  public skipTo(stageNum: number, point: 'start' | 'boss'): void {
    const targetStage = Math.max(1, Math.min(3, Math.floor(Number(stageNum) || 1))) as StageId;

    if (this.screen === 'menu' || this.upgradesOwnedOrder.length === 0) {
      this.startRun();
    }

    this.stage = targetStage;
    this.runStats.stageReached = Math.max(this.runStats.stageReached, targetStage) as StageId;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.hazards.length = 0;
    this.player.x = 0;
    this.player.y = 0;
    this.camX = 0;
    this.camY = 0;

    this.setupStageEnvironment(targetStage);

    if (point === 'boss') {
      this.stageTime = STAGE_DEFS[targetStage].durationSeconds;
      this.runTime = (targetStage - 1) * 300 + this.stageTime;
      this.bossSpawnedForStage = false;
      this.spawnStageBoss(targetStage);
    } else {
      this.stageTime = 0;
      this.runTime = (targetStage - 1) * 300;
      this.bossActive = false;
      this.bossSpawnedForStage = false;
      this.spawnStageWave(8);
      this.audio.playMusic(STAGE_DEFS[targetStage].musicKey);
      this.audio.playVoice(STAGE_DEFS[targetStage].startVoiceKey);
      if (this.onStageTransition) this.onStageTransition(targetStage);
    }

    this.setScreen('playing');
    if (this.onHudUpdate) this.onHudUpdate();
  }

  public killBoss(): void {
    let boss = this.enemies.find((e) => e.isBoss);
    if (!boss) {
      this.spawnStageBoss(this.stage);
      boss = this.enemies.find((e) => e.isBoss);
    }
    if (boss) {
      boss.hp = 0;
      this.handleBossDefeat(boss);
    }
  }

  public spawnEnemies(count: number): void {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n <= 0) return;

    if (this.screen === 'menu' && this.upgradesOwnedOrder.length === 0) {
      this.startRun();
    }

    const stageDef = STAGE_DEFS[this.stage];
    for (let i = 0; i < n; i++) {
      const defId = stageDef.enemyIds[i % stageDef.enemyIds.length];
      const angle = (i / Math.max(1, n)) * Math.PI * 2 + this.rng.range(-0.15, 0.15);
      const dist = this.rng.range(240, 580);
      const ex = this.player.x + Math.cos(angle) * dist;
      const ey = this.player.y + Math.sin(angle) * dist;
      this.createEnemy(defId, ex, ey, false);
    }

    if (this.onHudUpdate) this.onHudUpdate();
  }

  // =========================================================================
  // UPGRADE & EVOLUTION SYSTEM
  // =========================================================================

  public getUpgradeLevel(id: string): number {
    return this.upgradeLevels.get(id) || 0;
  }

  public grantUpgrade(id: string): void {
    const def = UPGRADE_DEFS[id];
    if (!def) return;

    const current = this.getUpgradeLevel(id);
    const next = Math.min(def.maxLevel, current + 1);
    this.upgradeLevels.set(id, next);

    if (!this.upgradesOwnedOrder.includes(id)) {
      this.upgradesOwnedOrder.push(id);
    }
    this.runStats.upgradesOwned = [...this.upgradesOwnedOrder];

    // Apply immediate Max HP increase when picking Hardened Charcoal
    if (id === 'pas_charcoal_coat') {
      this.player.maxHp += 25;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    }
  }

  public rollUpgradeCards(count: number = 3): OfferedUpgradeCard[] {
    const evolutionCandidates: OfferedUpgradeCard[] = [];
    const regularCandidates: OfferedUpgradeCard[] = [];

    for (const def of Object.values(UPGRADE_DEFS)) {
      const currentLvl = this.getUpgradeLevel(def.id);

      if (def.category === 'evolution') {
        if (currentLvl > 0) continue; // Already evolved
        const baseWpnLvl = def.evolvesFromWeaponId ? this.getUpgradeLevel(def.evolvesFromWeaponId) : 0;
        const reqPasLvl = def.requiresPassiveId ? this.getUpgradeLevel(def.requiresPassiveId) : 0;
        if (baseWpnLvl >= 5 && reqPasLvl >= 1) {
          evolutionCandidates.push({
            def,
            nextLevel: 1,
            isNew: true,
            isEvolution: true,
            synergyReady: true,
            synergyOwned: true,
          });
        }
        continue;
      }

      if (currentLvl >= def.maxLevel) continue;

      const synergyId = def.synergyWithId;
      const synergyOwned = synergyId ? this.getUpgradeLevel(synergyId) > 0 : false;
      const synergyReady =
        def.category === 'weapon' &&
        currentLvl + 1 === def.maxLevel &&
        synergyOwned;

      regularCandidates.push({
        def,
        nextLevel: currentLvl + 1,
        isNew: currentLvl === 0,
        isEvolution: false,
        synergyReady,
        synergyOwned,
      });
    }

    const result: OfferedUpgradeCard[] = [];
    // Always prioritize ready Evolutions first!
    const shuffledEvos = this.rng.shuffle(evolutionCandidates);
    for (const evo of shuffledEvos) {
      if (result.length < count) {
        result.push(evo);
      }
    }

    const shuffledRegular = this.rng.shuffle(regularCandidates);
    // Weight owned upgrades slightly so players can reach Level 5 evolutions smoothly
    shuffledRegular.sort((a, b) => {
      const scoreA = (a.synergyOwned ? 2 : 0) + (!a.isNew ? 1 : 0) + this.rng.next() * 2.5;
      const scoreB = (b.synergyOwned ? 2 : 0) + (!b.isNew ? 1 : 0) + this.rng.next() * 2.5;
      return scoreB - scoreA;
    });

    for (const card of shuffledRegular) {
      if (result.length < count) {
        result.push(card);
      }
    }

    return result;
  }

  // =========================================================================
  // COMPUTED PLAYER STATS
  // =========================================================================

  public getDamageMultiplier(): number {
    let mult = 1.0;
    mult += this.save.getUpgradeLevel('meta_might') * 0.1;
    mult += this.getUpgradeLevel('pas_sulfur_powder') * 0.16;
    if (this.player.overdriveTimer > 0) mult += 0.35;
    if (this.player.frenzyTimer > 0) mult += 0.25;
    return mult;
  }

  public getAttackSpeedMultiplier(): number {
    let mult = 1.0;
    mult += this.save.getUpgradeLevel('meta_haste') * 0.08;
    mult += this.getUpgradeLevel('pas_bellows') * 0.13;
    if (this.player.overdriveTimer > 0) mult += 0.5;
    if (this.player.frenzyTimer > 0) mult += 0.35;
    return mult;
  }

  public getMoveSpeed(): number {
    let speed = 225;
    let mult = 1.0;
    mult += this.save.getUpgradeLevel('meta_agility') * 0.06;
    mult += this.getUpgradeLevel('pas_caffeine_match') * 0.1;
    if (this.player.overdriveTimer > 0) mult += 0.3;
    if (this.player.frenzyTimer > 0) mult += 0.25;
    return speed * mult;
  }

  public getArmor(): number {
    return (
      this.save.getUpgradeLevel('meta_armor') * 1.5 +
      this.getUpgradeLevel('pas_charcoal_coat') * 2.0
    );
  }

  public getHpRegenPerSec(): number {
    return (
      0.5 +
      this.save.getUpgradeLevel('meta_armor') * 0.6 +
      this.getUpgradeLevel('pas_caffeine_match') * 1.5
    );
  }

  public getCritChance(): number {
    return (
      0.06 +
      this.save.getUpgradeLevel('meta_fortune') * 0.05 +
      this.getUpgradeLevel('pas_crooked_lenses') * 0.1
    );
  }

  public getAreaMultiplier(): number {
    return 1.0 + this.getUpgradeLevel('pas_kerosene_flask') * 0.18;
  }

  public getBonusPierce(): number {
    return this.getUpgradeLevel('pas_phosphorus_core');
  }

  public getMagnetRadius(): number {
    const base = 95;
    const mult =
      1.0 +
      this.save.getUpgradeLevel('meta_magnet') * 0.25 +
      this.getUpgradeLevel('pas_lodestone_ash') * 0.4;
    return base * mult;
  }

  // =========================================================================
  // MAIN SIMULATION STEP (60 FPS)
  // =========================================================================

  public update(dt: number): void {
    // Handle pause key toggle in playing / paused states
    if (this.input.consumePause()) {
      if (this.screen === 'playing') {
        this.setScreen('paused');
        return;
      } else if (this.screen === 'paused') {
        this.setScreen('playing');
        return;
      }
    }

    // Handle 1/2/3 keyboard/gamepad quick select on level-up modal
    const numKey = this.input.consumeNumberKey();
    if (this.screen === 'levelup' && numKey !== null) {
      this.chooseUpgrade(numKey);
      return;
    }

    if (this.screen !== 'playing') {
      return;
    }

    const clampedDt = Math.min(dt, 0.05);
    this.runTime += clampedDt;
    this.stageTime += clampedDt;
    this.runStats.timeSurvived = this.runTime;

    // 1. Update Camera Shake
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - clampedDt);
    }

    // 2. Update Player Movement, Dash, Overdrive & Smoke Trail
    this.updatePlayer(clampedDt);

    // 3. Stage Wave Spawner & Boss Trigger (at 300s per stage)
    this.updateStageDirector(clampedDt);

    // 4. Rebuild Spatial Hash Grid for Enemies
    this.spatialGrid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      this.spatialGrid.insert(this.enemies[i]);
    }

    // 5. Fire Player Weapons (Base & Evolved)
    this.updateWeapons(clampedDt);

    // 6. Update Enemies & Bosses
    this.updateEnemies(clampedDt);

    // 7. Update Projectiles & Collisions
    this.updateProjectiles(clampedDt);

    // 8. Update Ground Hazards & Telegraphs
    this.updateHazards(clampedDt);

    // 9. Update Props & Pickups
    this.updateProps(clampedDt);
    this.updatePickups(clampedDt);

    // 10. Update Particles & Floating Damage Numbers
    this.updateParticlesAndTexts(clampedDt);

    // Smooth camera follow
    const camLerp = 1 - Math.exp(-10 * clampedDt);
    this.camX += (this.player.x - this.camX) * camLerp;
    this.camY += (this.player.y - this.camY) * camLerp;
  }

  private updatePlayer(dt: number): void {
    const p = this.player;

    if (p.iframeTimer > 0) p.iframeTimer = Math.max(0, p.iframeTimer - dt);
    if (p.dashTimer > 0) p.dashTimer = Math.max(0, p.dashTimer - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.overdriveTimer > 0) p.overdriveTimer = Math.max(0, p.overdriveTimer - dt);
    if (p.frenzyTimer > 0) p.frenzyTimer = Math.max(0, p.frenzyTimer - dt);

    // Passive HP Regeneration
    if (p.hp > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + this.getHpRegenPerSec() * dt);
    }

    const moveVec = this.input.getMovementVector();
    if (Math.abs(moveVec.x) > 0.05) {
      p.facing = moveVec.x < 0 ? -1 : 1;
    }

    // Flame-Step Dash activation
    if (this.input.consumeDash() && p.dashCooldown <= 0) {
      p.dashTimer = 0.2;
      p.iframeTimer = Math.max(p.iframeTimer, 0.28);
      p.dashCooldown = p.dashMaxCooldown;
      const dirX = moveVec.x !== 0 || moveVec.y !== 0 ? moveVec.x : p.facing;
      const dirY = moveVec.x !== 0 || moveVec.y !== 0 ? moveVec.y : 0;
      const len = Math.hypot(dirX, dirY) || 1;
      p.vx = (dirX / len) * 680;
      p.vy = (dirY / len) * 680;
      this.audio.playSfx('dash');
      this.spawnBurstParticles(p.x, p.y, 12, '#f97316', 180);

      // Leave a scorching napalm puff on dash start
      this.hazards.push({
        uid: this.nextUid++,
        kind: 'player_napalm',
        fromPlayer: true,
        x: p.x,
        y: p.y,
        radius: 44 * this.getAreaMultiplier(),
        life: 2.2,
        maxLife: 2.2,
        damage: 14 * this.getDamageMultiplier(),
        tickTimer: 0,
        color: '#f97316',
        armed: true,
      });
    }

    // Ignition Overdrive Ultimate activation
    if (this.input.consumeOverdrive() && p.overdriveCharge >= 100 && p.overdriveTimer <= 0) {
      this.activateOverdrive();
    }

    if (p.dashTimer <= 0) {
      let speed = this.getMoveSpeed();
      // Check if standing in enemy slowing hazard
      for (let i = 0; i < this.hazards.length; i++) {
        const h = this.hazards[i];
        if (!h.fromPlayer && (h.kind === 'enemy_damp_puddle' || h.kind === 'enemy_wax_pool')) {
          if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius) {
            speed *= 0.68;
            break;
          }
        }
      }
      p.vx = moveVec.x * speed;
      p.vy = moveVec.y * speed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Keep player inside the circular Kindlewick Arena
    const distFromCenter = Math.hypot(p.x, p.y);
    const maxAllowed = this.arenaRadius - p.radius - 10;
    if (distFromCenter > maxAllowed) {
      const scale = maxAllowed / distFromCenter;
      p.x *= scale;
      p.y *= scale;
    }

    if (Math.hypot(p.vx, p.vy) > 15) {
      p.walkPhase += dt;
    }

    // Update Novaki's signature charcoal head smoke curl
    this.smokeEmitTimer -= dt;
    if (this.smokeEmitTimer <= 0) {
      this.smokeEmitTimer = 0.06;
      p.smokePoints.push({
        x: p.x + this.rng.range(-3, 3),
        y: p.y - 26,
        age: 0,
      });
      if (p.smokePoints.length > 18) {
        p.smokePoints.shift();
      }
    }
    for (let i = p.smokePoints.length - 1; i >= 0; i--) {
      const sp = p.smokePoints[i];
      sp.age += dt;
      sp.y -= 28 * dt;
      sp.x += Math.sin(this.runTime * 6 + i) * 14 * dt;
      if (sp.age >= 1.1) {
        p.smokePoints.splice(i, 1);
      }
    }
  }

  public activateOverdrive(): void {
    const p = this.player;
    p.overdriveCharge = 0;
    p.overdriveTimer = 8.0;
    p.iframeTimer = Math.max(p.iframeTimer, 1.0);
    this.audio.playSfx('overdrive');
    this.audio.playVoice('bark_overheat');
    this.addScreenShake(12, 0.4);
    this.spawnBurstParticles(p.x, p.y, 28, '#f97316', 280);

    // Radial ignition shockwave knockback & damage around Novaki
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 260) {
        this.damageEnemy(e, 65 * this.getDamageMultiplier(), true, 18);
        if (!e.isBoss && dist > 1) {
          e.x += (dx / dist) * 90;
          e.y += (dy / dist) * 90;
        }
      }
    }
  }

  // =========================================================================
  // STAGE DIRECTOR, WAVES & BOSS SPAWNING
  // =========================================================================

  private setupStageEnvironment(stageId: StageId): void {
    this.props.length = 0;
    // Spawn 6 Strike-Strip flint pads and 8 Supply Matchboxes around the arena
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const dist = 360 + (i % 2) * 280;
      this.props.push({
        uid: this.nextUid++,
        kind: 'strike_strip',
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        hp: 999,
        maxHp: 999,
        radius: 28,
        cooldown: 0,
        hitFlash: 0,
      });
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 240 + (i % 3) * 220;
      this.props.push({
        uid: this.nextUid++,
        kind: 'matchbox_crate',
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        hp: 30 * stageId,
        maxHp: 30 * stageId,
        radius: 22,
        cooldown: 0,
        hitFlash: 0,
      });
    }
  }

  private updateStageDirector(dt: number): void {
    const stageDef = STAGE_DEFS[this.stage];

    // Spawn Stage Boss when stage clock reaches durationSeconds (300s per stage)
    if (!this.bossSpawnedForStage && this.stageTime >= stageDef.durationSeconds) {
      this.spawnStageBoss(this.stage);
    }

    // Normal wave spawning
    this.waveSpawnTimer -= dt;
    if (this.waveSpawnTimer <= 0) {
      const stageProgress = Math.min(1, this.stageTime / stageDef.durationSeconds);
      const maxActive = this.bossActive ? 28 : Math.floor(24 + stageProgress * 55 + (this.stage - 1) * 18);
      this.waveSpawnTimer = this.bossActive ? 3.2 : Math.max(0.85, 2.2 - stageProgress * 1.1);

      if (this.enemies.length < maxActive) {
        const batchCount = this.bossActive ? 2 : Math.floor(3 + stageProgress * 5);
        this.spawnStageWave(batchCount);
      }
    }

    // Elite mini-boss spawn every ~45 seconds
    if (!this.bossActive) {
      this.eliteSpawnTimer -= dt;
      if (this.eliteSpawnTimer <= 0) {
        this.eliteSpawnTimer = 45;
        const eliteId = this.rng.pick(stageDef.enemyIds);
        const angle = this.rng.range(0, Math.PI * 2);
        const ex = this.player.x + Math.cos(angle) * 480;
        const ey = this.player.y + Math.sin(angle) * 480;
        this.createEnemy(eliteId, ex, ey, true);
      }
    }

    // Replenish supply matchbox crates periodically
    this.propSpawnTimer -= dt;
    if (this.propSpawnTimer <= 0) {
      this.propSpawnTimer = 14;
      const crateCount = this.props.filter((p) => p.kind === 'matchbox_crate').length;
      if (crateCount < 8) {
        const angle = this.rng.range(0, Math.PI * 2);
        const dist = this.rng.range(220, 520);
        this.props.push({
          uid: this.nextUid++,
          kind: 'matchbox_crate',
          x: this.player.x + Math.cos(angle) * dist,
          y: this.player.y + Math.sin(angle) * dist,
          hp: 30 * this.stage,
          maxHp: 30 * this.stage,
          radius: 22,
          cooldown: 0,
          hitFlash: 0,
        });
      }
    }
  }

  private spawnStageWave(count: number): void {
    const stageDef = STAGE_DEFS[this.stage];
    const stageProgress = Math.min(1, this.stageTime / stageDef.durationSeconds);
    // Unlock deeper enemy pool as stage progresses, while allowing all 5 types
    const unlockedCount = Math.min(
      stageDef.enemyIds.length,
      Math.max(3, Math.ceil((stageProgress + 0.35) * stageDef.enemyIds.length))
    );
    const pool = stageDef.enemyIds.slice(0, unlockedCount);

    for (let i = 0; i < count; i++) {
      const defId = this.rng.pick(pool);
      const angle = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(430, 620);
      const ex = this.player.x + Math.cos(angle) * dist;
      const ey = this.player.y + Math.sin(angle) * dist;
      this.createEnemy(defId, ex, ey, false);
    }
  }

  public createEnemy(defId: string, x: number, y: number, isElite: boolean, isMiniSplit: boolean = false): EnemyEntity {
    const def = ENEMY_DEFS[defId] || ENEMY_DEFS.slime_dew;
    const timeScaling = 1 + (this.stageTime / 300) * 0.55 + (this.stage - 1) * 0.25;
    const eliteMult = isElite ? 4.2 : isMiniSplit ? 0.45 : 1.0;
    const radiusMult = isElite ? 1.38 : isMiniSplit ? 0.68 : 1.0;

    const enemy: EnemyEntity = {
      uid: this.nextUid++,
      defId: def.id,
      name: isElite ? `Elite ${def.name}` : isMiniSplit ? `Mini ${def.name}` : def.name,
      behavior: def.behavior,
      spriteKey: def.spriteKey,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: Math.round(def.hp * timeScaling * eliteMult),
      maxHp: Math.round(def.hp * timeScaling * eliteMult),
      speed: def.speed * (isElite ? 1.12 : isMiniSplit ? 1.3 : 1.0),
      damage: Math.round(def.damage * (isElite ? 1.35 : 1.0)),
      radius: Math.round(def.radius * radiusMult),
      xpValue: Math.round(def.xpValue * (isElite ? 5 : 1)),
      color: def.color,
      accentColor: def.accentColor,
      isBoss: false,
      isElite,
      isMiniSplit,
      aiTimer: this.rng.range(0, 1.5),
      attackCooldown: this.rng.range(0.8, 2.2),
      statePhase: 0,
      targetX: x,
      targetY: y,
      hitFlashTimer: 0,
      burnTimer: 0,
      burnDps: 0,
      slowTimer: 0,
      buffedTimer: 0,
      facing: 1,
      animOffset: this.rng.range(0, Math.PI * 2),
    };

    this.enemies.push(enemy);
    return enemy;
  }

  public spawnStageBoss(stageId: StageId): EnemyEntity {
    // Remove existing boss for cleanliness if any
    this.enemies = this.enemies.filter((e) => !e.isBoss);

    const bDef = BOSS_DEFS[stageId];
    this.bossActive = true;
    this.bossSpawnedForStage = true;

    const bx = this.player.x + 210;
    const by = this.player.y - 80;

    const boss: EnemyEntity = {
      uid: this.nextUid++,
      defId: bDef.id,
      name: bDef.name,
      behavior: 'shield_charge',
      spriteKey: bDef.spriteKey,
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      hp: bDef.hp,
      maxHp: bDef.hp,
      speed: bDef.speed,
      damage: bDef.contactDamage,
      radius: bDef.radius,
      xpValue: 180 * stageId,
      color: bDef.color,
      accentColor: bDef.accentColor,
      isBoss: true,
      isElite: false,
      aiTimer: 0,
      attackCooldown: 1.8,
      statePhase: 0,
      targetX: this.player.x,
      targetY: this.player.y,
      hitFlashTimer: 0,
      burnTimer: 0,
      burnDps: 0,
      slowTimer: 0,
      buffedTimer: 0,
      facing: 1,
      animOffset: 0,
      bossStage: stageId,
      bossPhase: 1,
      bossPatternIndex: 0,
      bossPatternTimer: 1.5,
      bossActionStep: 0,
    };

    this.enemies.push(boss);
    this.audio.playSfx('boss_warning');
    this.audio.playMusic(STAGE_DEFS[stageId].bossMusicKey);
    this.audio.playVoice(bDef.introVoiceKey);
    this.addScreenShake(12, 0.5);

    if (this.onHudUpdate) this.onHudUpdate();
    return boss;
  }

  // =========================================================================
  // WEAPON FIRING LOGIC (8 BASE WEAPONS + 8 EVOLUTIONS)
  // =========================================================================

  private updateWeapons(dt: number): void {
    const atkSpd = this.getAttackSpeedMultiplier();
    const dmgMult = this.getDamageMultiplier();
    const areaMult = this.getAreaMultiplier();
    const bonusPierce = this.getBonusPierce();

    // 1. Charcoal Sparkler / Inferno Gatling
    const hasGatling = this.getUpgradeLevel('evo_inferno_gatling') > 0;
    const sparkLvl = this.getUpgradeLevel('wpn_match_spark');
    if (hasGatling || sparkLvl > 0) {
      const cd = hasGatling ? 0.14 / atkSpd : Math.max(0.18, (0.55 - sparkLvl * 0.06) / atkSpd);
      if (this.tickWeaponTimer('wpn_match_spark', dt, cd)) {
        const target = this.findNearestEnemy(this.player.x, this.player.y, 620);
        const baseAngle = target
          ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
          : this.player.facing < 0
          ? Math.PI
          : 0;

        const shotCount = hasGatling ? 3 : sparkLvl >= 5 ? 3 : sparkLvl >= 3 ? 2 : 1;
        const speed = (hasGatling ? 680 : 480 + sparkLvl * 35) * (1 + this.getUpgradeLevel('pas_crooked_lenses') * 0.2);
        const baseDmg = (hasGatling ? 38 : 16 + sparkLvl * 7) * dmgMult;

        for (let s = 0; s < shotCount; s++) {
          const spread = (s - (shotCount - 1) / 2) * (hasGatling ? 0.11 : 0.14);
          const a = baseAngle + spread;
          this.projectiles.push({
            uid: this.nextUid++,
            kind: hasGatling ? 'inferno_round' : 'spark',
            fromPlayer: true,
            x: this.player.x,
            y: this.player.y - 6,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            radius: (hasGatling ? 8 : 6) * areaMult,
            damage: baseDmg,
            life: 1.35,
            maxLife: 1.35,
            pierce: (hasGatling ? 2 : sparkLvl >= 4 ? 1 : 0) + bonusPierce,
            hitSet: new Set(),
            color: hasGatling ? '#38bdf8' : '#f97316',
            glowColor: hasGatling ? 'rgba(56, 189, 248, 0.45)' : 'rgba(251, 146, 60, 0.45)',
            isEvolved: hasGatling,
            bouncesLeft: hasGatling ? 2 : 0,
            burnDamage: (hasGatling ? 16 : 6) * dmgMult,
          });
        }
        this.audio.playSfx('spark');
      }
    }

    // 2. Cinder Lash / Solar Scourge
    const hasScourge = this.getUpgradeLevel('evo_solar_scourge') > 0;
    const whipLvl = this.getUpgradeLevel('wpn_flame_whip');
    if (hasScourge || whipLvl > 0) {
      const cd = (hasScourge ? 0.95 : Math.max(0.75, 1.45 - whipLvl * 0.12)) / atkSpd;
      if (this.tickWeaponTimer('wpn_flame_whip', dt, cd)) {
        const radius = (hasScourge ? 135 : 85 + whipLvl * 12) * areaMult;
        const dmg = (hasScourge ? 64 : 26 + whipLvl * 9) * dmgMult;
        const dirs = hasScourge || whipLvl >= 3 ? [1, -1] : [this.player.facing];

        for (const dir of dirs) {
          const slashX = this.player.x + (hasScourge ? 0 : dir * radius * 0.45);
          const slashY = this.player.y;
          this.projectiles.push({
            uid: this.nextUid++,
            kind: hasScourge ? 'solar_tornado' : 'whip_arc',
            fromPlayer: true,
            x: slashX,
            y: slashY,
            vx: dir * 20,
            vy: 0,
            radius,
            damage: dmg,
            life: 0.22,
            maxLife: 0.22,
            pierce: 999,
            hitSet: new Set(),
            color: hasScourge ? '#facc15' : '#ef4444',
            glowColor: 'rgba(249, 115, 22, 0.4)',
            isEvolved: hasScourge,
            burnDamage: (hasScourge ? 24 : 12) * dmgMult,
          });
        }
        this.audio.playSfx('whip');
      }
    }

    // 3. Orbiting Will-o'-Wisps / Supernova Corona
    const hasSupernova = this.getUpgradeLevel('evo_supernova_ring') > 0;
    const orbitLvl = this.getUpgradeLevel('wpn_orbit_embers');
    if (hasSupernova || orbitLvl > 0) {
      this.orbitAngle += dt * (hasSupernova ? 3.8 : 2.3 + orbitLvl * 0.25) * atkSpd;
      const desiredCount = hasSupernova ? 7 : 1 + orbitLvl;
      const existing = this.projectiles.filter((p) => p.kind === 'orbit_wisp');

      while (existing.length < desiredCount) {
        const wisp: ProjectileEntity = {
          uid: this.nextUid++,
          kind: 'orbit_wisp',
          fromPlayer: true,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: 13 * areaMult,
          damage: 22 * dmgMult,
          life: 999999,
          maxLife: 999999,
          pierce: 999999,
          hitSet: new Set(),
          color: '#fbbf24',
          glowColor: 'rgba(251, 191, 36, 0.45)',
        };
        this.projectiles.push(wisp);
        existing.push(wisp);
      }

      const orbitDist = (hasSupernova ? 115 : 88) * areaMult;
      for (let i = 0; i < existing.length; i++) {
        const w = existing[i];
        const a = this.orbitAngle + (i / existing.length) * Math.PI * 2;
        const ringR = hasSupernova && i % 2 === 1 ? orbitDist * 1.38 : orbitDist;
        w.x = this.player.x + Math.cos(a) * ringR;
        w.y = this.player.y + Math.sin(a) * ringR;
        w.radius = (hasSupernova ? 16 : 11 + orbitLvl * 1.5) * areaMult;
        w.damage = (hasSupernova ? 42 : 18 + orbitLvl * 6) * dmgMult;
        w.color = hasSupernova ? '#fef08a' : '#fbbf24';
        w.isEvolved = hasSupernova;
      }

      // Periodically clear hitSet on orbiting wisps so they can damage enemies again every 0.35s
      if (this.tickWeaponTimer('wpn_orbit_embers_reset', dt, 0.35 / atkSpd)) {
        for (const w of existing) {
          w.hitSet.clear();
        }
      }
    }

    // 4. Sandpaper Chakram / Blazing Striker Saw
    const hasSaw = this.getUpgradeLevel('evo_guillotine_saw') > 0;
    const boomLvl = this.getUpgradeLevel('wpn_strike_boomerang');
    if (hasSaw || boomLvl > 0) {
      const cd = (hasSaw ? 1.05 : Math.max(0.85, 1.65 - boomLvl * 0.14)) / atkSpd;
      if (this.tickWeaponTimer('wpn_strike_boomerang', dt, cd)) {
        const target = this.findNearestEnemy(this.player.x, this.player.y, 650);
        const baseAngle = target
          ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
          : 0;
        const count = hasSaw ? 4 : boomLvl >= 5 ? 3 : boomLvl >= 3 ? 2 : 1;
        const speed = (hasSaw ? 540 : 420 + boomLvl * 25);

        for (let i = 0; i < count; i++) {
          const a = baseAngle + (i / count) * Math.PI * 2;
          this.projectiles.push({
            uid: this.nextUid++,
            kind: hasSaw ? 'buzzsaw' : 'boomerang',
            fromPlayer: true,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            radius: (hasSaw ? 22 : 15 + boomLvl * 1.5) * areaMult,
            damage: (hasSaw ? 55 : 24 + boomLvl * 8) * dmgMult,
            life: 1.9,
            maxLife: 1.9,
            pierce: 999,
            hitSet: new Set(),
            color: hasSaw ? '#f43f5e' : '#eab308',
            glowColor: hasSaw ? 'rgba(244, 63, 94, 0.45)' : 'rgba(234, 179, 8, 0.4)',
            returning: false,
            isEvolved: hasSaw,
          });
        }
        this.audio.playSfx('boomerang');
      }
    }

    // 5. Matchbox Molotov / Hellfire Cataclysm
    const hasCataclysm = this.getUpgradeLevel('evo_hellfire_cataclysm') > 0;
    const moloLvl = this.getUpgradeLevel('wpn_molotov_pitch');
    if (hasCataclysm || moloLvl > 0) {
      const cd = (hasCataclysm ? 1.4 : Math.max(1.2, 2.3 - moloLvl * 0.18)) / atkSpd;
      if (this.tickWeaponTimer('wpn_molotov_pitch', dt, cd)) {
        const count = hasCataclysm ? 4 : moloLvl >= 5 ? 3 : moloLvl >= 3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const angle = this.rng.range(0, Math.PI * 2);
          const dist = this.rng.range(90, 250);
          const tx = this.player.x + Math.cos(angle) * dist;
          const ty = this.player.y + Math.sin(angle) * dist;
          this.hazards.push({
            uid: this.nextUid++,
            kind: hasCataclysm ? 'player_magma' : 'player_napalm',
            fromPlayer: true,
            x: tx,
            y: ty,
            radius: (hasCataclysm ? 92 : 62 + moloLvl * 7) * areaMult,
            life: hasCataclysm ? 4.5 : 3.4 + (moloLvl >= 4 ? 1.2 : 0),
            maxLife: hasCataclysm ? 4.5 : 3.4 + (moloLvl >= 4 ? 1.2 : 0),
            damage: (hasCataclysm ? 34 : 15 + moloLvl * 5) * dmgMult,
            tickTimer: 0,
            color: hasCataclysm ? '#38bdf8' : '#fb923c',
            armed: true,
          });
          this.spawnBurstParticles(tx, ty, 10, hasCataclysm ? '#38bdf8' : '#fb923c', 140);
        }
        this.audio.playSfx('molotov');
      }
    }

    // 6. Magnesium Ray / Prism Obliterator
    const hasPrism = this.getUpgradeLevel('evo_prism_obliterator') > 0;
    const beamLvl = this.getUpgradeLevel('wpn_flare_beam');
    if (hasPrism || beamLvl > 0) {
      const cd = (hasPrism ? 1.25 : Math.max(1.15, 2.2 - beamLvl * 0.18)) / atkSpd;
      if (this.tickWeaponTimer('wpn_flare_beam', dt, cd)) {
        const target = this.findHighestHpEnemy(this.player.x, this.player.y, 700);
        const baseAngle = target
          ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
          : 0;
        const beamCount = hasPrism ? 3 : beamLvl >= 4 ? 2 : 1;
        const beamWidth = (hasPrism ? 18 : 10 + beamLvl * 2) * areaMult;
        const dmg = (hasPrism ? 92 : 42 + beamLvl * 14) * dmgMult;

        for (let b = 0; b < beamCount; b++) {
          const a = baseAngle + (b - (beamCount - 1) / 2) * 0.18;
          const endX = this.player.x + Math.cos(a) * 760;
          const endY = this.player.y + Math.sin(a) * 760;

          // Damage all enemies intersecting the ray line immediately
          for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (this.pointToSegmentDist(e.x, e.y, this.player.x, this.player.y, endX, endY) <= e.radius + beamWidth) {
              this.damageEnemy(e, dmg, true, 12, 18 * dmgMult);
            }
          }

          this.projectiles.push({
            uid: this.nextUid++,
            kind: 'laser_beam',
            fromPlayer: true,
            x: this.player.x,
            y: this.player.y,
            vx: 0,
            vy: 0,
            radius: beamWidth,
            damage: 0,
            life: 0.22,
            maxLife: 0.22,
            pierce: 999,
            hitSet: new Set(),
            color: '#ffffff',
            glowColor: hasPrism ? '#67e8f9' : '#38bdf8',
            beamEndX: endX,
            beamEndY: endY,
            isEvolved: hasPrism,
          });
        }
        this.audio.playSfx('beam');
      }
    }

    // 7. Static Soot Cloud / Pyroclastic Storm
    const hasStorm = this.getUpgradeLevel('evo_thunderhead_storm') > 0;
    const lightLvl = this.getUpgradeLevel('wpn_smoke_lightning');
    if (hasStorm || lightLvl > 0) {
      const cd = (hasStorm ? 0.95 : Math.max(0.9, 1.75 - lightLvl * 0.14)) / atkSpd;
      if (this.tickWeaponTimer('wpn_smoke_lightning', dt, cd)) {
        const maxBounces = (hasStorm ? 11 : 2 + lightLvl) + bonusPierce;
        const dmg = (hasStorm ? 56 : 22 + lightLvl * 7) * dmgMult;
        const chainPts: Array<{ x: number; y: number }> = [{ x: this.player.x, y: this.player.y - 10 }];
        const hitIds = new Set<number>();
        let curX = this.player.x;
        let curY = this.player.y;

        for (let b = 0; b < maxBounces; b++) {
          let best: EnemyEntity | null = null;
          let bestDist = 340 * areaMult;
          for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (hitIds.has(e.uid)) continue;
            const d = Math.hypot(e.x - curX, e.y - curY);
            if (d < bestDist) {
              bestDist = d;
              best = e;
            }
          }
          if (!best) break;
          hitIds.add(best.uid);
          chainPts.push({ x: best.x, y: best.y });
          this.damageEnemy(best, dmg, true, 6, 10 * dmgMult);
          curX = best.x;
          curY = best.y;

          if (hasStorm && b % 3 === 0) {
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'player_shock_field',
              fromPlayer: true,
              x: best.x,
              y: best.y,
              radius: 52 * areaMult,
              life: 2.0,
              maxLife: 2.0,
              damage: 18 * dmgMult,
              tickTimer: 0,
              color: '#a855f7',
              armed: true,
            });
          }
        }

        if (chainPts.length > 1) {
          this.projectiles.push({
            uid: this.nextUid++,
            kind: 'lightning_chain',
            fromPlayer: true,
            x: this.player.x,
            y: this.player.y,
            vx: 0,
            vy: 0,
            radius: 6,
            damage: 0,
            life: 0.24,
            maxLife: 0.24,
            pierce: 999,
            hitSet: new Set(),
            color: hasStorm ? '#c084fc' : '#a855f7',
            glowColor: '#e9d5ff',
            chainPoints: chainPts,
            isEvolved: hasStorm,
          });
          this.audio.playSfx('lightning');
        }
      }
    }

    // 8. Phosphorus Mortar / The Grand Finale
    const hasFinale = this.getUpgradeLevel('evo_grand_finale') > 0;
    const mortarLvl = this.getUpgradeLevel('wpn_ash_nova');
    if (hasFinale || mortarLvl > 0) {
      const cd = (hasFinale ? 1.2 : Math.max(1.1, 2.05 - mortarLvl * 0.15)) / atkSpd;
      if (this.tickWeaponTimer('wpn_ash_nova', dt, cd)) {
        const count = hasFinale ? 6 : 1 + mortarLvl;
        const speed = hasFinale ? 440 : 350;
        const dmg = (hasFinale ? 58 : 28 + mortarLvl * 9) * dmgMult;

        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
          this.projectiles.push({
            uid: this.nextUid++,
            kind: hasFinale ? 'cluster_firework' : 'mortar_rocket',
            fromPlayer: true,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            radius: (hasFinale ? 11 : 8.5) * areaMult,
            damage: dmg,
            life: 1.8,
            maxLife: 1.8,
            pierce: 0,
            hitSet: new Set(),
            color: hasFinale ? '#f472b6' : '#ec4899',
            glowColor: 'rgba(244, 114, 182, 0.5)',
            homingStrength: 4.5,
            explosionRadius: (hasFinale ? 95 : 68) * areaMult,
            isEvolved: hasFinale,
          });
        }
        this.audio.playSfx('mortar');
      }
    }
  }

  private tickWeaponTimer(key: string, dt: number, cooldown: number): boolean {
    const next = (this.weaponTimers.get(key) || 0) - dt;
    if (next <= 0) {
      this.weaponTimers.set(key, cooldown);
      return true;
    }
    this.weaponTimers.set(key, next);
    return false;
  }

  // =========================================================================
  // ENEMY & BOSS AI BEHAVIORS
  // =========================================================================

  private updateEnemies(dt: number): void {
    const px = this.player.x;
    const py = this.player.y;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;

      if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);
      if (e.buffedTimer > 0) e.buffedTimer = Math.max(0, e.buffedTimer - dt);

      // Burn Damage over Time tick
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) {
          this.killEnemyAtIndex(i);
          continue;
        }
      }

      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      e.facing = dx < 0 ? -1 : 1;

      if (e.isBoss) {
        this.updateBossBehavior(e, dt, nx, ny, dist);
      } else {
        this.updateNormalEnemyBehavior(e, dt, nx, ny, dist);
      }

      // Soft separation between nearby enemies
      const neighbors = this.spatialGrid.queryRadius(e.x, e.y, e.radius * 1.6);
      for (let n = 0; n < neighbors.length; n++) {
        const other = neighbors[n];
        if (other.uid === e.uid) continue;
        const sdx = e.x - other.x;
        const sdy = e.y - other.y;
        const sdist = Math.hypot(sdx, sdy);
        const minDist = e.radius + other.radius;
        if (sdist > 0.1 && sdist < minDist) {
          const push = ((minDist - sdist) / minDist) * 75 * dt;
          e.x += (sdx / sdist) * push;
          e.y += (sdy / sdist) * push;
        }
      }

      // Contact damage check against Novaki
      const playerDist = Math.hypot(px - e.x, py - e.y);
      if (playerDist < e.radius + this.player.radius - 2) {
        this.damagePlayer(e.damage);
      }
    }
  }

  private updateNormalEnemyBehavior(
    e: EnemyEntity,
    dt: number,
    nx: number,
    ny: number,
    dist: number
  ): void {
    e.aiTimer += dt;
    e.attackCooldown -= dt;
    const speedMult = (e.slowTimer > 0 ? 0.65 : 1.0) * (e.buffedTimer > 0 ? 1.28 : 1.0);
    const spd = e.speed * speedMult;

    switch (e.behavior) {
      case 'hop_puddle': {
        // Rhythmic hopping bursts
        const hopPulse = Math.max(0.25, Math.sin(e.aiTimer * 4.5) + 0.65);
        e.x += nx * spd * hopPulse * dt;
        e.y += ny * spd * hopPulse * dt;
        break;
      }
      case 'sine_swarm': {
        // Sine-wave flanking movement
        const perpX = -ny;
        const perpY = nx;
        const wave = Math.sin(e.aiTimer * 5.5 + e.animOffset) * 0.7;
        e.x += (nx + perpX * wave) * spd * dt;
        e.y += (ny + perpY * wave) * spd * dt;
        break;
      }
      case 'shield_charge': {
        if (e.statePhase === 0) {
          e.x += nx * spd * dt;
          e.y += ny * spd * dt;
          if (e.attackCooldown <= 0 && dist < 260) {
            e.statePhase = 1;
            e.attackCooldown = 0.55;
            e.targetX = nx;
            e.targetY = ny;
          }
        } else if (e.statePhase === 1) {
          // Bracing windup
          if (e.attackCooldown <= 0) {
            e.statePhase = 2;
            e.attackCooldown = 0.45;
          }
        } else {
          // Shield bash charge
          e.x += e.targetX * spd * 3.1 * dt;
          e.y += e.targetY * spd * 3.1 * dt;
          if (e.attackCooldown <= 0) {
            e.statePhase = 0;
            e.attackCooldown = 3.2;
          }
        }
        break;
      }
      case 'ranged_kite': {
        // Maintain medium range and spit acid water globules
        if (dist > 280) {
          e.x += nx * spd * dt;
          e.y += ny * spd * dt;
        } else if (dist < 170) {
          e.x -= nx * spd * 0.75 * dt;
          e.y -= ny * spd * 0.75 * dt;
        }
        if (e.attackCooldown <= 0 && dist < 440) {
          e.attackCooldown = 2.4;
          this.spawnEnemyProjectile(e.x, e.y, nx * 260, ny * 260, e.damage, 7, '#a3e635');
        }
        break;
      }
      case 'death_burst': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        break;
      }
      case 'kamikaze_fuse': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        if (dist < 85 && e.statePhase === 0) {
          e.statePhase = 1;
          e.attackCooldown = 0.65;
        }
        if (e.statePhase === 1) {
          if (e.attackCooldown <= 0) {
            // Detonate!
            this.spawnBurstParticles(e.x, e.y, 16, '#fb7185', 190);
            this.audio.playSfx('explosion');
            if (dist < 82) {
              this.damagePlayer(e.damage);
            }
            e.hp = 0;
          }
        }
        break;
      }
      case 'dive_swoop': {
        if (e.statePhase === 0) {
          e.x += nx * spd * dt;
          e.y += ny * spd * dt;
          if (e.attackCooldown <= 0 && dist < 340) {
            e.statePhase = 1;
            e.attackCooldown = 0.65;
            e.targetX = nx;
            e.targetY = ny;
          }
        } else {
          e.x += e.targetX * spd * 2.6 * dt;
          e.y += e.targetY * spd * 2.6 * dt;
          if (e.attackCooldown <= 0) {
            e.statePhase = 0;
            e.attackCooldown = 2.8;
          }
        }
        break;
      }
      case 'buffer_support': {
        e.x += nx * spd * 0.85 * dt;
        e.y += ny * spd * 0.85 * dt;
        if (e.attackCooldown <= 0) {
          e.attackCooldown = 2.6;
          // Buff nearby allies and fire an ash orb
          const allies = this.spatialGrid.queryRadius(e.x, e.y, 180);
          for (const ally of allies) {
            ally.buffedTimer = 3.0;
          }
          if (dist < 460) {
            this.spawnEnemyProjectile(e.x, e.y, nx * 230, ny * 230, e.damage, 8, '#c084fc');
          }
        }
        break;
      }
      case 'splitter': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        break;
      }
      case 'laser_pounce': {
        if (e.statePhase === 0) {
          e.x += nx * spd * dt;
          e.y += ny * spd * dt;
          if (e.attackCooldown <= 0 && dist < 360) {
            e.statePhase = 1;
            e.attackCooldown = 0.65;
            e.targetX = this.player.x + nx * 90;
            e.targetY = this.player.y + ny * 90;
          }
        } else if (e.statePhase === 1) {
          if (e.attackCooldown <= 0) {
            e.statePhase = 2;
            e.attackCooldown = 0.38;
            const pdx = e.targetX - e.x;
            const pdy = e.targetY - e.y;
            const plen = Math.hypot(pdx, pdy) || 1;
            e.vx = (pdx / plen) * spd * 3.6;
            e.vy = (pdy / plen) * spd * 3.6;
          }
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.attackCooldown <= 0) {
            e.statePhase = 0;
            e.attackCooldown = 3.0;
          }
        }
        break;
      }
      case 'blink_spread': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        if (e.attackCooldown <= 0 && dist < 420) {
          e.attackCooldown = 3.2;
          // Blink to flank angle and fire 3 ice shards
          const blinkAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x) + this.rng.range(-1.1, 1.1);
          e.x = this.player.x - Math.cos(blinkAngle) * 230;
          e.y = this.player.y - Math.sin(blinkAngle) * 230;
          this.spawnBurstParticles(e.x, e.y, 8, '#67e8f9', 110);
          const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
          for (let s = -1; s <= 1; s++) {
            const a = aim + s * 0.24;
            this.spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 270, Math.sin(a) * 270, e.damage, 6.5, '#67e8f9');
          }
        }
        break;
      }
      case 'axis_slam': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        if (e.attackCooldown <= 0 && dist < 190) {
          e.attackCooldown = 3.4;
          // Radial frost shockwave
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            this.spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 220, Math.sin(a) * 220, e.damage, 8, '#38bdf8');
          }
        }
        break;
      }
      case 'orbit_sniper': {
        const perpX = -ny;
        const perpY = nx;
        const approach = dist > 250 ? 0.7 : dist < 180 ? -0.5 : 0;
        e.x += (perpX * 0.85 + nx * approach) * spd * dt;
        e.y += (perpY * 0.85 + ny * approach) * spd * dt;
        if (e.attackCooldown <= 0 && dist < 450) {
          e.attackCooldown = 2.3;
          this.spawnEnemyProjectile(e.x, e.y, nx * 290, ny * 290, e.damage, 6, '#a5f3fc');
        }
        break;
      }
      case 'mortar_lob': {
        e.x += nx * spd * 0.8 * dt;
        e.y += ny * spd * 0.8 * dt;
        if (e.attackCooldown <= 0 && dist < 520) {
          e.attackCooldown = 3.2;
          this.hazards.push({
            uid: this.nextUid++,
            kind: 'enemy_mortar_target',
            fromPlayer: false,
            x: this.player.x + this.player.vx * 0.35,
            y: this.player.y + this.player.vy * 0.35,
            radius: 56,
            life: 1.15,
            maxLife: 1.15,
            damage: e.damage,
            tickTimer: 0,
            color: '#ef4444',
            armed: false,
          });
        }
        break;
      }
      case 'beam_sentinel': {
        e.x += nx * spd * dt;
        e.y += ny * spd * dt;
        const beamAngle = this.runTime * 1.6 + e.animOffset;
        const bx = e.x + Math.cos(beamAngle) * 145;
        const by = e.y + Math.sin(beamAngle) * 145;
        if (this.pointToSegmentDist(this.player.x, this.player.y, e.x, e.y, bx, by) < this.player.radius + 6) {
          this.damagePlayer(e.damage * 0.75);
        }
        break;
      }
    }
  }

  private updateBossBehavior(
    boss: EnemyEntity,
    dt: number,
    nx: number,
    ny: number,
    dist: number
  ): void {
    const bDef = BOSS_DEFS[boss.bossStage || this.stage];

    // Check Phase 2 Enrage transition (<50% HP)
    if (boss.bossPhase === 1 && boss.hp <= boss.maxHp * 0.5) {
      boss.bossPhase = 2;
      boss.speed *= 1.25;
      this.audio.playVoice(bDef.phase2VoiceKey);
      this.addScreenShake(14, 0.5);
      this.spawnBurstParticles(boss.x, boss.y, 35, boss.accentColor, 260);
    }

    const phaseMult = boss.bossPhase === 2 ? 1.35 : 1.0;

    // Move steadily toward Novaki when not locked in a cast
    if (dist > 140) {
      boss.x += nx * boss.speed * dt;
      boss.y += ny * boss.speed * dt;
    }

    boss.bossPatternTimer = (boss.bossPatternTimer || 0) - dt * phaseMult;
    if (boss.bossPatternTimer <= 0) {
      const pattern = (boss.bossPatternIndex || 0) % 4;
      boss.bossPatternIndex = pattern + 1;
      boss.bossPatternTimer = 2.8;

      const baseAim = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);

      if (boss.bossStage === 1) {
        // BARON VON DRIP (4 Patterns)
        if (pattern === 0) {
          // Pattern 1: Earl Grey Spiral Barrage
          const count = boss.bossPhase === 2 ? 14 : 10;
          for (let k = 0; k < count; k++) {
            const a = baseAim + (k / count) * Math.PI * 2;
            this.spawnEnemyProjectile(boss.x, boss.y, Math.cos(a) * 260, Math.sin(a) * 260, 16, 9, '#38bdf8', 'boss_wave_orb');
          }
        } else if (pattern === 1) {
          // Pattern 2: Ricocheting Porcelain Saucers
          for (let s = -1; s <= 1; s++) {
            const a = baseAim + s * 0.35;
            this.spawnEnemyProjectile(boss.x, boss.y, Math.cos(a) * 340, Math.sin(a) * 340, 20, 15, '#facc15', 'boss_saucer', 2);
          }
        } else if (pattern === 2) {
          // Pattern 3: Boiling Tidal Kettle Slam Zones
          const zones = boss.bossPhase === 2 ? 4 : 2;
          for (let z = 0; z < zones; z++) {
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_slam_zone',
              fromPlayer: false,
              x: this.player.x + (z === 0 ? 0 : this.rng.range(-160, 160)),
              y: this.player.y + (z === 0 ? 0 : this.rng.range(-160, 160)),
              radius: 85,
              life: 1.2,
              maxLife: 1.2,
              damage: 24,
              tickTimer: 0,
              color: '#38bdf8',
              armed: false,
            });
          }
        } else {
          // Pattern 4: Summon Cellar Retinue
          for (let m = 0; m < 3; m++) {
            const a = baseAim + (m - 1) * 0.8;
            this.createEnemy('slime_dew', boss.x + Math.cos(a) * 90, boss.y + Math.sin(a) * 90, false);
          }
        }
      } else if (boss.bossStage === 2) {
        // ARCH-PRELATE TALLOW (4 Patterns)
        if (pattern === 0) {
          // Pattern 1: Sacred Wax Flame Cross Laser Lines
          const beams = boss.bossPhase === 2 ? 6 : 4;
          for (let b = 0; b < beams; b++) {
            const a = baseAim + (b / beams) * Math.PI * 2;
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_laser_line',
              fromPlayer: false,
              x: boss.x,
              y: boss.y,
              endX: boss.x + Math.cos(a) * 680,
              endY: boss.y + Math.sin(a) * 680,
              radius: 12,
              life: 1.5,
              maxLife: 1.5,
              damage: 24,
              tickTimer: 0,
              color: '#f59e0b',
              armed: false,
            });
          }
        } else if (pattern === 1) {
          // Pattern 2: Paraffin Meteor Rain
          const meteors = boss.bossPhase === 2 ? 6 : 4;
          for (let m = 0; m < meteors; m++) {
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_slam_zone',
              fromPlayer: false,
              x: this.player.x + this.rng.range(-220, 220),
              y: this.player.y + this.rng.range(-220, 220),
              radius: 72,
              life: 1.15,
              maxLife: 1.15,
              damage: 25,
              tickTimer: 0,
              color: '#f59e0b',
              armed: false,
            });
          }
        } else if (pattern === 2) {
          // Pattern 3: Candelabra Fireball Nova
          const orbs = boss.bossPhase === 2 ? 16 : 12;
          for (let k = 0; k < orbs; k++) {
            const a = (k / orbs) * Math.PI * 2 + this.runTime;
            this.spawnEnemyProjectile(boss.x, boss.y, Math.cos(a) * 290, Math.sin(a) * 290, 20, 10, '#ef4444', 'boss_wax_fireball');
          }
        } else {
          // Pattern 4: Acolyte Procession
          for (let m = 0; m < 3; m++) {
            const a = (m / 3) * Math.PI * 2;
            this.createEnemy('wick_imp', boss.x + Math.cos(a) * 110, boss.y + Math.sin(a) * 110, false);
          }
        }
      } else {
        // GENERAL ABSOLUTE ZERO (4 Patterns)
        if (pattern === 0) {
          // Pattern 1: Extinction Bell Guillotine Slams
          for (let g = 0; g < 3; g++) {
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_slam_zone',
              fromPlayer: false,
              x: this.player.x + g * this.player.vx * 0.25,
              y: this.player.y + g * this.player.vy * 0.25,
              radius: 95,
              life: 1.0 + g * 0.25,
              maxLife: 1.0 + g * 0.25,
              damage: 28,
              tickTimer: 0,
              color: '#22d3ee',
              armed: false,
            });
          }
        } else if (pattern === 1) {
          // Pattern 2: Cryo-Grid Laser Matrix
          const lines = boss.bossPhase === 2 ? 4 : 3;
          for (let l = -1; l < lines - 1; l++) {
            const offset = l * 135;
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_laser_line',
              fromPlayer: false,
              x: this.player.x - 520,
              y: this.player.y + offset,
              endX: this.player.x + 520,
              endY: this.player.y + offset,
              radius: 11,
              life: 1.45,
              maxLife: 1.45,
              damage: 26,
              tickTimer: 0,
              color: '#22d3ee',
              armed: false,
            });
          }
        } else if (pattern === 2) {
          // Pattern 3: Absolute Zero Bullet Curtain
          const spears = boss.bossPhase === 2 ? 18 : 12;
          for (let k = 0; k < spears; k++) {
            const a = baseAim + (k / spears) * Math.PI * 2;
            this.spawnEnemyProjectile(boss.x, boss.y, Math.cos(a) * 320, Math.sin(a) * 320, 22, 9.5, '#67e8f9', 'boss_ice_spear');
          }
        } else {
          // Pattern 4: Cryo-Pylon Overcharge
          for (let p = 0; p < 2; p++) {
            const a = baseAim + (p === 0 ? -0.9 : 0.9);
            this.hazards.push({
              uid: this.nextUid++,
              kind: 'boss_cryo_pylon',
              fromPlayer: false,
              x: this.player.x + Math.cos(a) * 210,
              y: this.player.y + Math.sin(a) * 210,
              radius: 68,
              life: 4.5,
              maxLife: 4.5,
              damage: 16,
              tickTimer: 0,
              color: '#22d3ee',
              armed: true,
            });
          }
        }
      }
    }
  }

  private spawnEnemyProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    radius: number,
    color: string,
    kind: ProjectileEntity['kind'] = 'enemy_bullet',
    bouncesLeft: number = 0
  ): void {
    this.projectiles.push({
      uid: this.nextUid++,
      kind,
      fromPlayer: false,
      x,
      y,
      vx,
      vy,
      radius,
      damage,
      life: 3.4,
      maxLife: 3.4,
      pierce: 0,
      hitSet: new Set(),
      color,
      glowColor: 'rgba(239, 68, 68, 0.4)',
      bouncesLeft,
    });
  }

  // =========================================================================
  // PROJECTILE, HAZARD, PICKUP & DAMAGE RESOLUTION
  // =========================================================================

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p) continue;

      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.kind === 'orbit_wisp' || p.kind === 'laser_beam' || p.kind === 'lightning_chain') {
        if (p.kind === 'orbit_wisp') {
          const hits = this.spatialGrid.queryRadius(p.x, p.y, p.radius + 16);
          for (let h = 0; h < hits.length; h++) {
            const e = hits[h];
            if (!p.hitSet.has(e.uid)) {
              p.hitSet.add(e.uid);
              this.damageEnemy(e, p.damage, true, 10, p.isEvolved ? 16 : 6);
            }
          }
        }
        continue;
      }

      // Boomerang return flight after half life
      if ((p.kind === 'boomerang' || p.kind === 'buzzsaw') && p.life < p.maxLife * 0.55) {
        const dx = this.player.x - p.x;
        const dy = this.player.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const spd = p.kind === 'buzzsaw' ? 580 : 480;
        p.vx = (dx / dist) * spd;
        p.vy = (dy / dist) * spd;
        if (dist < 28 && p.life < p.maxLife * 0.4) {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Homing behavior for Phosphorus Mortar / Grand Finale
      if (p.homingStrength && p.fromPlayer) {
        const target = this.findNearestEnemy(p.x, p.y, 460);
        if (target) {
          const desiredAngle = Math.atan2(target.y - p.y, target.x - p.x);
          const curAngle = Math.atan2(p.vy, p.vx);
          const spd = Math.hypot(p.vx, p.vy);
          let diff = desiredAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const nextAngle = curAngle + Math.sign(diff) * Math.min(Math.abs(diff), p.homingStrength * dt);
          p.vx = Math.cos(nextAngle) * spd;
          p.vy = Math.sin(nextAngle) * spd;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.fromPlayer) {
        const hits = this.spatialGrid.queryRadius(p.x, p.y, p.radius + 14);
        let destroyed = false;

        for (let h = 0; h < hits.length; h++) {
          const e = hits[h];
          if (p.hitSet.has(e.uid)) continue;
          p.hitSet.add(e.uid);

          // Explosive mortar shell
          if (p.explosionRadius) {
            this.audio.playSfx('explosion');
            this.spawnBurstParticles(p.x, p.y, 16, p.color, 180);
            const blastHits = this.spatialGrid.queryRadius(p.x, p.y, p.explosionRadius);
            for (const be of blastHits) {
              this.damageEnemy(be, p.damage, true, 12, 10);
            }
            destroyed = true;
            break;
          }

          this.damageEnemy(e, p.damage, true, 6, p.burnDamage || 0);

          if (p.bouncesLeft && p.bouncesLeft > 0) {
            p.bouncesLeft -= 1;
            const nextTarget = this.findNearestEnemy(p.x, p.y, 320, p.hitSet);
            if (nextTarget) {
              const spd = Math.hypot(p.vx, p.vy);
              const a = Math.atan2(nextTarget.y - p.y, nextTarget.x - p.x);
              p.vx = Math.cos(a) * spd;
              p.vy = Math.sin(a) * spd;
              continue;
            }
          }

          if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            destroyed = true;
            break;
          }
        }

        if (destroyed) {
          this.projectiles.splice(i, 1);
        }
      } else {
        // Enemy projectile vs Novaki
        const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
        if (d < p.radius + this.player.radius - 3) {
          this.damagePlayer(p.damage);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private updateHazards(dt: number): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (!h) continue;

      h.life -= dt;
      h.tickTimer -= dt;

      if (h.kind === 'enemy_mortar_target' || h.kind === 'boss_slam_zone') {
        if (h.life <= 0) {
          // Detonate telegraph zone!
          this.spawnBurstParticles(h.x, h.y, 18, h.color, 210);
          this.audio.playSfx('explosion');
          if (Math.hypot(this.player.x - h.x, this.player.y - h.y) <= h.radius + this.player.radius * 0.6) {
            this.damagePlayer(h.damage);
          }
          this.hazards.splice(i, 1);
        }
        continue;
      }

      if (h.kind === 'boss_laser_line' && h.endX !== undefined && h.endY !== undefined) {
        if (h.life <= h.maxLife * 0.45 && !h.armed) {
          h.armed = true;
          this.audio.playSfx('beam');
        }
        if (h.armed && h.tickTimer <= 0) {
          h.tickTimer = 0.25;
          const dist = this.pointToSegmentDist(this.player.x, this.player.y, h.x, h.y, h.endX, h.endY);
          if (dist <= h.radius + this.player.radius * 0.6) {
            this.damagePlayer(h.damage);
          }
        }
        if (h.life <= 0) {
          this.hazards.splice(i, 1);
        }
        continue;
      }

      if (h.life <= 0) {
        this.hazards.splice(i, 1);
        continue;
      }

      if (h.tickTimer <= 0) {
        h.tickTimer = 0.35;
        if (h.fromPlayer) {
          const hits = this.spatialGrid.queryRadius(h.x, h.y, h.radius);
          for (const e of hits) {
            this.damageEnemy(e, h.damage, false, 0, h.damage * 0.5);
          }
        } else if (h.kind === 'boss_cryo_pylon') {
          if (Math.hypot(this.player.x - h.x, this.player.y - h.y) <= h.radius + this.player.radius) {
            this.damagePlayer(h.damage);
          }
        }
      }
    }
  }

  private updateProps(dt: number): void {
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i];
      if (prop.cooldown > 0) prop.cooldown = Math.max(0, prop.cooldown - dt);
      if (prop.hitFlash > 0) prop.hitFlash = Math.max(0, prop.hitFlash - dt);

      const d = Math.hypot(this.player.x - prop.x, this.player.y - prop.y);
      if (prop.kind === 'strike_strip') {
        if (d < prop.radius + this.player.radius && prop.cooldown <= 0 && this.player.dashTimer > 0) {
          prop.cooldown = 16;
          this.player.frenzyTimer = 5.5;
          this.player.overdriveCharge = Math.min(100, this.player.overdriveCharge + 25);
          this.audio.playSfx('overdrive');
          this.spawnBurstParticles(prop.x, prop.y, 20, '#facc15', 220);
          this.addFloatingText(prop.x, prop.y - 20, 'STRIKE FRENZY!', '#fef08a', 16, true);
        }
      } else if (prop.kind === 'matchbox_crate') {
        // Player weapons or contact can break supply matchboxes
        if (d < prop.radius + this.player.radius + 18) {
          prop.hp = 0;
        } else {
          for (const proj of this.projectiles) {
            if (proj.fromPlayer && Math.hypot(proj.x - prop.x, proj.y - prop.y) < prop.radius + proj.radius) {
              prop.hp -= proj.damage;
              prop.hitFlash = 0.12;
              break;
            }
          }
        }

        if (prop.hp <= 0) {
          this.spawnBurstParticles(prop.x, prop.y, 14, '#f97316', 150);
          this.audio.playSfx('kill');
          const roll = this.rng.next();
          if (roll < 0.45) {
            this.spawnPickup('heal_marshmallow', prop.x, prop.y, 35);
          } else if (roll < 0.75) {
            this.spawnPickup('cinder', prop.x, prop.y, 6);
          } else {
            this.spawnPickup('magnet_spark', prop.x, prop.y, 1);
          }
          this.props.splice(i, 1);
        }
      }
    }
  }

  private updatePickups(dt: number): void {
    const magnetRadius = this.getMagnetRadius();

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= dt;
      if (pk.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }

      const dx = this.player.x - pk.x;
      const dy = this.player.y - pk.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (dist <= magnetRadius) {
        pk.magnetized = true;
      }

      if (pk.magnetized) {
        const pullSpeed = 520;
        pk.x += (dx / dist) * pullSpeed * dt;
        pk.y += (dy / dist) * pullSpeed * dt;
      }

      if (dist <= this.player.radius + pk.radius + 6) {
        if (pk.kind === 'xp_small' || pk.kind === 'xp_medium' || pk.kind === 'xp_large') {
          this.audio.playSfx('pickup_xp');
          this.player.overdriveCharge = Math.min(100, this.player.overdriveCharge + 1.4);
          this.addXp(pk.value);
        } else if (pk.kind === 'cinder') {
          const greedMult = 1 + this.save.getUpgradeLevel('meta_greed') * 0.2;
          const amount = Math.max(1, Math.round(pk.value * greedMult));
          this.runStats.cindersEarned += amount;
          this.save.addCurrency(amount);
          this.audio.playSfx('pickup_cinder');
          this.addFloatingText(pk.x, pk.y - 12, `+${amount} CINDER`, '#fbbf24', 14, false);
        } else if (pk.kind === 'heal_marshmallow') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + pk.value);
          this.audio.playSfx('heal');
          this.addFloatingText(pk.x, pk.y - 12, `+${pk.value} HP`, '#22c55e', 15, false);
        } else if (pk.kind === 'magnet_spark') {
          this.audio.playSfx('pickup_cinder');
          for (const other of this.pickups) {
            if (other.kind.startsWith('xp_') || other.kind === 'cinder') {
              other.magnetized = true;
            }
          }
          this.addFloatingText(pk.x, pk.y - 12, 'VACUUM SPARK!', '#c084fc', 16, true);
        } else if (pk.kind === 'boss_chest') {
          this.audio.playSfx('evolution');
          const cinders = Math.round(20 * (1 + this.save.getUpgradeLevel('meta_greed') * 0.2));
          this.runStats.cindersEarned += cinders;
          this.save.addCurrency(cinders);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
          this.addFloatingText(pk.x, pk.y - 16, `CHEST! +${cinders} CINDERS`, '#fef08a', 17, true);
        }

        this.pickups.splice(i, 1);
      }
    }
  }

  public damageEnemy(
    enemy: EnemyEntity,
    baseDamage: number,
    canCrit: boolean,
    knockback: number = 6,
    burnDps: number = 0
  ): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;

    const isCrit = canCrit && this.rng.chance(this.getCritChance());
    const finalDmg = Math.max(1, Math.round(baseDamage * (isCrit ? 1.85 : 1.0)));

    enemy.hp -= finalDmg;
    enemy.hitFlashTimer = 0.09;
    this.runStats.damageDealt += finalDmg;
    this.player.overdriveCharge = Math.min(100, this.player.overdriveCharge + 0.45);

    if (burnDps > 0) {
      enemy.burnTimer = 3.0;
      enemy.burnDps = Math.max(enemy.burnDps, burnDps * (1 + this.getUpgradeLevel('pas_phosphorus_core') * 0.25));
    }

    if (knockback > 0 && !enemy.isBoss) {
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const d = Math.hypot(dx, dy) || 1;
      enemy.x += (dx / d) * knockback;
      enemy.y += (dy / d) * knockback;
    }

    this.audio.playSfx(isCrit ? 'crit' : 'hit');
    this.addFloatingText(
      enemy.x + this.rng.range(-10, 10),
      enemy.y - enemy.radius - 6,
      isCrit ? `${finalDmg}!` : `${finalDmg}`,
      isCrit ? '#fef08a' : '#f8fafc',
      isCrit ? 16 : 13,
      isCrit
    );

    if (enemy.hp <= 0) {
      this.killEnemyAtIndex(idx);
    }
  }

  private killEnemyAtIndex(index: number): void {
    const e = this.enemies[index];
    if (!e) return;

    if (e.isBoss) {
      this.handleBossDefeat(e);
      return;
    }

    this.enemies.splice(index, 1);
    this.runStats.enemiesKilled += 1;
    if (e.isElite) this.runStats.elitesKilled += 1;
    this.save.meta.totalKills += 1;

    this.audio.playSfx('kill');
    this.spawnBurstParticles(e.x, e.y, e.isElite ? 22 : 9, e.color, 150);

    // Special enemy death behaviors
    if (e.behavior === 'hop_puddle') {
      this.hazards.push({
        uid: this.nextUid++,
        kind: 'enemy_damp_puddle',
        fromPlayer: false,
        x: e.x,
        y: e.y,
        radius: 42,
        life: 3.5,
        maxLife: 3.5,
        damage: 0,
        tickTimer: 0,
        color: '#38bdf8',
        armed: true,
      });
    } else if (e.behavior === 'death_burst') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        this.spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 210, Math.sin(a) * 210, e.damage * 0.7, 6.5, '#38bdf8');
      }
    } else if (e.behavior === 'splitter' && !e.isMiniSplit) {
      for (let s = -1; s <= 1; s += 2) {
        this.createEnemy(e.defId, e.x + s * 22, e.y, false, true);
      }
    }

    // Drop XP gem
    const xpKind = e.xpValue >= 18 ? 'xp_large' : e.xpValue >= 8 ? 'xp_medium' : 'xp_small';
    this.spawnPickup(xpKind, e.x, e.y, e.xpValue);

    // Drop Cinders & Elite Chests
    if (e.isElite) {
      this.spawnPickup('boss_chest', e.x, e.y, 1);
    } else if (this.rng.chance(0.14)) {
      this.spawnPickup('cinder', e.x + this.rng.range(-12, 12), e.y + this.rng.range(-12, 12), this.stage * 2);
    }
  }

  private handleBossDefeat(boss: EnemyEntity): void {
    const idx = this.enemies.indexOf(boss);
    if (idx !== -1) {
      this.enemies.splice(idx, 1);
    }

    this.bossActive = false;
    this.runStats.bossesKilled += 1;
    this.runStats.enemiesKilled += 1;

    const defeatedStage = (boss.bossStage || this.stage) as StageId;
    const bDef = BOSS_DEFS[defeatedStage];

    this.audio.playSfx('explosion');
    this.audio.playVoice(bDef.defeatVoiceKey);
    this.addScreenShake(18, 0.7);
    this.spawnBurstParticles(boss.x, boss.y, 48, boss.color, 320);

    // Award Boss Cinder Bounty immediately
    const greedMult = 1 + this.save.getUpgradeLevel('meta_greed') * 0.2;
    const bossCinders = Math.round(45 * defeatedStage * greedMult);
    this.runStats.cindersEarned += bossCinders;
    this.save.addCurrency(bossCinders);

    // Clear enemy projectiles and enemy hazards
    this.projectiles = this.projectiles.filter((p) => p.fromPlayer);
    this.hazards = this.hazards.filter((h) => h.fromPlayer);

    if (defeatedStage < 3) {
      // Advance to next Stage!
      const nextStage = (defeatedStage + 1) as StageId;
      this.stage = nextStage;
      this.stageTime = 0;
      this.bossSpawnedForStage = false;
      this.runStats.stageReached = nextStage;

      // Clear remaining old stage normal enemies and spawn fresh stage wave
      this.enemies.length = 0;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
      this.setupStageEnvironment(nextStage);
      this.spawnStageWave(6);

      this.audio.playMusic(STAGE_DEFS[nextStage].musicKey);
      if (this.onStageTransition) this.onStageTransition(nextStage);
    } else {
      // Stage 3 Boss Defeated -> VICTORY!
      this.save.meta.victories += 1;
      if (this.runTime > this.save.meta.bestTime) {
        this.save.meta.bestTime = Math.round(this.runTime);
      }
      this.save.saveMeta();

      this.enemies.length = 0;
      this.audio.playMusic('music_victory');
      this.setScreen('victory');
    }

    if (this.onHudUpdate) this.onHudUpdate();
  }

  public damagePlayer(rawAmount: number): void {
    const p = this.player;
    if (p.invincible || p.iframeTimer > 0 || p.dashTimer > 0 || this.screen !== 'playing') {
      return;
    }

    const mitigated = Math.max(1, Math.round(rawAmount - this.getArmor()));
    p.hp = Math.max(0, p.hp - mitigated);
    p.iframeTimer = 0.55;
    this.runStats.damageTaken += mitigated;

    this.audio.playSfx('player_hurt');
    this.addScreenShake(9, 0.25);
    this.addFloatingText(p.x, p.y - 24, `-${mitigated}`, '#ef4444', 15, true);

    if (p.hp > 0 && p.hp / p.maxHp <= 0.3 && !p.lowHpWarned) {
      p.lowHpWarned = true;
      this.audio.playVoice('bark_lowhp');
    }

    if (p.hp <= 0) {
      this.handleGameOver();
    }
    if (this.onHudUpdate) this.onHudUpdate();
  }

  private handleGameOver(): void {
    if (this.runTime > this.save.meta.bestTime) {
      this.save.meta.bestTime = Math.round(this.runTime);
    }
    this.save.saveMeta();
    this.audio.playVoice('bark_gameover');
    this.setScreen('gameover');
  }

  // =========================================================================
  // HELPERS, PARTICLES, FLOATING TEXT & RENDER CALL
  // =========================================================================

  private spawnPickup(kind: PickupEntity['kind'], x: number, y: number, value: number): void {
    if (this.pickups.length > 260 && kind === 'xp_small') {
      // Merge excess small XP into an existing nearby gem to keep entity count bounded
      const last = this.pickups[this.pickups.length - 1];
      if (last && last.kind.startsWith('xp_')) {
        last.value += value;
        last.kind = 'xp_medium';
        return;
      }
    }
    this.pickups.push({
      uid: this.nextUid++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      value,
      radius: kind === 'boss_chest' ? 18 : 9,
      magnetized: false,
      life: 45,
    });
  }

  private spawnBurstParticles(x: number, y: number, count: number, color: string, speed: number): void {
    const allowed = Math.min(count, Math.max(2, 320 - this.particles.length));
    for (let i = 0; i < allowed; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(speed * 0.25, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: this.rng.range(3.5, 7.5),
        endSize: 0.5,
        color,
        alpha: 0.9,
        life: this.rng.range(0.22, 0.48),
        maxLife: 0.48,
        drag: 0.92,
      });
    }
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    isCrit: boolean
  ): void {
    if (this.floatingTexts.length > 60) {
      this.floatingTexts.shift();
    }
    this.floatingTexts.push({
      x,
      y,
      vy: -42,
      text,
      color,
      size,
      life: 0.65,
      maxLife: 0.65,
      isCrit,
    });
  }

  public addScreenShake(intensity: number, duration: number): void {
    if (!this.save.settings.screenShake) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  private updateParticlesAndTexts(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(pt.drag, dt * 60);
      pt.vy *= Math.pow(pt.drag, dt * 60);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
    }
  }

  private findNearestEnemy(
    x: number,
    y: number,
    maxDist: number,
    excludeIds?: Set<number>
  ): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestD = maxDist;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (excludeIds && excludeIds.has(e.uid)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private findHighestHpEnemy(x: number, y: number, maxDist: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestHp = -1;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= maxDist && e.hp > bestHp) {
        bestHp = e.hp;
        best = e;
      }
    }
    return best;
  }

  private pointToSegmentDist(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(px - projX, py - projY);
  }

  public render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0 && this.save.settings.screenShake) {
      const mag = this.shakeIntensity * (this.shakeTimer / 0.5);
      shakeX = (Math.random() * 2 - 1) * mag;
      shakeY = (Math.random() * 2 - 1) * mag;
    }

    const renderPlayer: RenderPlayerState = {
      x: this.player.x,
      y: this.player.y,
      vx: this.player.vx,
      vy: this.player.vy,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      radius: this.player.radius,
      facing: this.player.facing,
      invincible: this.player.invincible,
      iframeTimer: this.player.iframeTimer,
      dashTimer: this.player.dashTimer,
      overdriveTimer: this.player.overdriveTimer,
      walkPhase: this.player.walkPhase,
      smokePoints: this.player.smokePoints,
    };

    this.renderer.render(
      w,
      h,
      this.stage,
      this.runTime,
      this.camX,
      this.camY,
      shakeX,
      shakeY,
      this.arenaRadius,
      renderPlayer,
      this.enemies,
      this.projectiles,
      this.hazards,
      this.pickups,
      this.props,
      this.particles,
      this.floatingTexts,
      this.save.settings.damageNumbers
    );
  }
}
