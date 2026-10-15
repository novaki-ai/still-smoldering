export type ScreenName =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'levelup'
  | 'gameover'
  | 'victory';

export type StageId = 1 | 2 | 3;

export interface QASnapshot {
  screen: ScreenName;
  stage: StageId;
  time: number;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
  };
  enemies: number;
  bossActive: boolean;
  upgrades: string[];
  meta: {
    currency: number;
    unlocks: string[];
    levels: Record<string, number>;
    runsPlayed: number;
    victories: number;
  };
}

export interface QAStartOptions {
  seed?: number;
  aspectId?: string;
}

export interface NovakiQAInterface {
  state: () => QASnapshot;
  start: (options?: QAStartOptions) => QASnapshot;
  setInvincible: (on: boolean) => void;
  addXp: (amount: number) => void;
  chooseUpgrade: (index: number) => void;
  skipTo: (stage: number, point: 'start' | 'boss') => void;
  killBoss: () => void;
  spawnEnemies: (count: number) => void;
}

export interface SettingsState {
  musicVolume: number; // 0 to 1
  soundVolume: number; // 0 to 1
  screenShake: boolean;
  damageNumbers: boolean;
}

export interface MetaState {
  currency: number;
  unlocks: string[];
  levels: Record<string, number>;
  runsPlayed: number;
  victories: number;
  totalKills: number;
  bestTime: number;
  selectedAspect: string;
}

export type UpgradeCategory = 'weapon' | 'passive' | 'evolution';

export interface UpgradeDef {
  id: string;
  name: string;
  category: UpgradeCategory;
  iconKey: string;
  color: string;
  maxLevel: number;
  description: string;
  levelDescriptions: string[];
  // Synergy / Evolution bindings
  synergyWithId?: string; // For base weapon -> passive id, or passive -> base weapon id
  evolvesIntoId?: string; // For base weapon -> evolution id
  evolvesFromWeaponId?: string; // For evolution -> base weapon id
  requiresPassiveId?: string; // For evolution -> required passive id
}

export type EnemyBehaviorType =
  | 'hop_puddle'       // Stage 1: Dewdrop Slime
  | 'sine_swarm'       // Stage 1: Mold Sporeling
  | 'shield_charge'    // Stage 1: Rusty Thimble Knight
  | 'ranged_kite'      // Stage 1: Spit-Bug Beetle
  | 'death_burst'      // Stage 1: Soaked Sponge Brute
  | 'kamikaze_fuse'    // Stage 2: Ticking Wick-Imp
  | 'dive_swoop'       // Stage 2: Wax Gargoyle
  | 'buffer_support'   // Stage 2: Censer Acolyte
  | 'splitter'         // Stage 2: Molten Blob
  | 'laser_pounce'     // Stage 2: Brass Snuff-Hound
  | 'blink_spread'     // Stage 3: Icicle Wraith
  | 'axis_slam'        // Stage 3: Cryo-Cube Golem
  | 'orbit_sniper'     // Stage 3: Blizzard Mote
  | 'mortar_lob'       // Stage 3: Hailstone Mortar
  | 'beam_sentinel';   // Stage 3: Frost-Coil Automaton

export interface EnemyDef {
  id: string;
  name: string;
  title: string;
  stage: StageId;
  behavior: EnemyBehaviorType;
  spriteKey: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xpValue: number;
  cinderChance: number;
  color: string;
  accentColor: string;
  description: string;
}

export interface BossDef {
  id: string;
  name: string;
  subtitle: string;
  stage: StageId;
  spriteKey: string;
  portraitKey: string;
  hp: number;
  speed: number;
  contactDamage: number;
  radius: number;
  color: string;
  accentColor: string;
  introVoiceKey: string;
  phase2VoiceKey: string;
  defeatVoiceKey: string;
  description: string;
}

export interface StageDef {
  id: StageId;
  name: string;
  subtitle: string;
  description: string;
  durationSeconds: number; // 300s per stage (15m total stage clock + boss fights)
  bgTileKey: string;
  musicKey: string;
  bossMusicKey: string;
  startVoiceKey: string;
  floorColor: string;
  gridColor: string;
  ambientColor: string;
  accentColor: string;
  hazardColor: string;
  enemyIds: string[];
  bossId: string;
}

export interface EnemyEntity {
  uid: number;
  defId: string;
  name: string;
  behavior: EnemyBehaviorType;
  spriteKey: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  xpValue: number;
  color: string;
  accentColor: string;
  isBoss: boolean;
  isElite: boolean;
  isMiniSplit?: boolean;
  // AI state
  aiTimer: number;
  attackCooldown: number;
  statePhase: number; // 0 = normal, 1 = windup, 2 = active action
  targetX: number;
  targetY: number;
  hitFlashTimer: number;
  burnTimer: number;
  burnDps: number;
  slowTimer: number;
  buffedTimer: number;
  facing: number; // -1 or 1
  animOffset: number;
  // Boss specific
  bossStage?: StageId;
  bossPhase?: 1 | 2;
  bossPatternIndex?: number;
  bossPatternTimer?: number;
  bossActionStep?: number;
}

export type ProjectileKind =
  | 'spark'
  | 'inferno_round'
  | 'whip_arc'
  | 'solar_tornado'
  | 'orbit_wisp'
  | 'boomerang'
  | 'buzzsaw'
  | 'molotov'
  | 'laser_beam'
  | 'lightning_chain'
  | 'mortar_rocket'
  | 'cluster_firework'
  | 'enemy_bullet'
  | 'boss_saucer'
  | 'boss_wave_orb'
  | 'boss_wax_fireball'
  | 'boss_ice_spear';

export interface ProjectileEntity {
  uid: number;
  kind: ProjectileKind;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  pierce: number;
  hitSet: Set<number>;
  color: string;
  glowColor: string;
  // Special behavior flags
  returning?: boolean;
  orbitAngle?: number;
  orbitDist?: number;
  isEvolved?: boolean;
  bouncesLeft?: number;
  targetX?: number;
  targetY?: number;
  homingStrength?: number;
  burnDamage?: number;
  explosionRadius?: number;
  beamEndX?: number;
  beamEndY?: number;
  chainPoints?: Array<{ x: number; y: number }>;
}

export type HazardKind =
  | 'player_napalm'
  | 'player_magma'
  | 'player_shock_field'
  | 'enemy_damp_puddle'
  | 'enemy_wax_pool'
  | 'enemy_mortar_target'
  | 'boss_slam_zone'
  | 'boss_laser_line'
  | 'boss_cryo_pylon';

export interface HazardEntity {
  uid: number;
  kind: HazardKind;
  fromPlayer: boolean;
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  tickTimer: number;
  color: string;
  armed: boolean;
}

export type PickupKind = 'xp_small' | 'xp_medium' | 'xp_large' | 'cinder' | 'heal_marshmallow' | 'magnet_spark' | 'boss_chest';

export interface PickupEntity {
  uid: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  radius: number;
  magnetized: boolean;
  life: number;
}

export interface PropEntity {
  uid: number;
  kind: 'matchbox_crate' | 'strike_strip';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  cooldown: number;
  hitFlash: number;
}

export interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  endSize: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  glow?: boolean;
}

export interface FloatingTextEntity {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  isCrit?: boolean;
}

export interface VoiceCue {
  id: string;
  speaker: string;
  speakerTitle: string;
  portraitKey: string;
  text: string;
  audioFile: string;
  themeColor: string;
}

export interface RunStats {
  stageReached: StageId;
  timeSurvived: number;
  levelReached: number;
  enemiesKilled: number;
  elitesKilled: number;
  bossesKilled: number;
  damageDealt: number;
  damageTaken: number;
  cindersEarned: number;
  evolutionsUnlocked: number;
  upgradesOwned: string[];
}
