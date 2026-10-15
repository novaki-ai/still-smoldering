import { META_UPGRADES, STARTER_ASPECTS } from '../data/content';
import { MetaState, SettingsState } from '../types';

const META_STORAGE_KEY = 'novaki_still_smoldering_meta_v1';
const SETTINGS_STORAGE_KEY = 'novaki_still_smoldering_settings_v1';

export class SaveManager {
  public meta: MetaState;
  public settings: SettingsState;

  constructor() {
    this.meta = this.loadMeta();
    this.settings = this.loadSettings();
  }

  private getDefaultMeta(): MetaState {
    const levels: Record<string, number> = {};
    for (const upg of META_UPGRADES) {
      levels[upg.id] = 0;
    }
    return {
      currency: 0,
      unlocks: ['aspect_classic'],
      levels,
      runsPlayed: 0,
      victories: 0,
      totalKills: 0,
      bestTime: 0,
      selectedAspect: 'aspect_classic',
    };
  }

  private getDefaultSettings(): SettingsState {
    return {
      musicVolume: 0.65,
      soundVolume: 0.8,
      screenShake: true,
      damageNumbers: true,
    };
  }

  public loadMeta(): MetaState {
    const defaults = this.getDefaultMeta();
    try {
      const raw = window.localStorage.getItem(META_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        currency: typeof parsed.currency === 'number' ? Math.max(0, Math.floor(parsed.currency)) : 0,
        unlocks: Array.isArray(parsed.unlocks) && parsed.unlocks.length > 0
          ? Array.from(new Set(['aspect_classic', ...parsed.unlocks]))
          : ['aspect_classic'],
        levels: { ...defaults.levels, ...(parsed.levels || {}) },
        runsPlayed: typeof parsed.runsPlayed === 'number' ? parsed.runsPlayed : 0,
        victories: typeof parsed.victories === 'number' ? parsed.victories : 0,
        totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
        bestTime: typeof parsed.bestTime === 'number' ? parsed.bestTime : 0,
        selectedAspect: typeof parsed.selectedAspect === 'string' ? parsed.selectedAspect : 'aspect_classic',
      };
    } catch {
      return defaults;
    }
  }

  public saveMeta(): void {
    try {
      window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(this.meta));
    } catch {
      // Ignore storage quota / private mode errors
    }
  }

  public loadSettings(): SettingsState {
    const defaults = this.getDefaultSettings();
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        musicVolume: typeof parsed.musicVolume === 'number' ? Math.max(0, Math.min(1, parsed.musicVolume)) : defaults.musicVolume,
        soundVolume: typeof parsed.soundVolume === 'number' ? Math.max(0, Math.min(1, parsed.soundVolume)) : defaults.soundVolume,
        screenShake: typeof parsed.screenShake === 'boolean' ? parsed.screenShake : defaults.screenShake,
        damageNumbers: typeof parsed.damageNumbers === 'boolean' ? parsed.damageNumbers : defaults.damageNumbers,
      };
    } catch {
      return defaults;
    }
  }

  public saveSettings(): void {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage errors
    }
  }

  public addCurrency(amount: number): void {
    if (amount <= 0) return;
    this.meta.currency = Math.floor(this.meta.currency + amount);
    this.saveMeta();
  }

  public getUpgradeLevel(id: string): number {
    return this.meta.levels[id] || 0;
  }

  public getUpgradeCost(id: string): number {
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return 999999;
    const lvl = this.getUpgradeLevel(id);
    return def.baseCost + lvl * def.costStep;
  }

  public buyUpgrade(id: string): boolean {
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lvl = this.getUpgradeLevel(id);
    if (lvl >= def.maxLevel) return false;
    const cost = this.getUpgradeCost(id);
    if (this.meta.currency < cost) return false;

    this.meta.currency -= cost;
    this.meta.levels[id] = lvl + 1;
    if (!this.meta.unlocks.includes(id)) {
      this.meta.unlocks.push(id);
    }
    this.saveMeta();
    return true;
  }

  public buyOrSelectAspect(aspectId: string): boolean {
    const aspect = STARTER_ASPECTS.find((a) => a.id === aspectId);
    if (!aspect) return false;
    if (this.meta.unlocks.includes(aspectId)) {
      this.meta.selectedAspect = aspectId;
      this.saveMeta();
      return true;
    }
    if (this.meta.currency < aspect.cost) return false;
    this.meta.currency -= aspect.cost;
    this.meta.unlocks.push(aspectId);
    this.meta.selectedAspect = aspectId;
    this.saveMeta();
    return true;
  }

  public resetMeta(): void {
    this.meta = this.getDefaultMeta();
    this.saveMeta();
  }
}
