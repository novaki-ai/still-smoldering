import { VOICE_CUES } from '../data/content';
import { SettingsState, VoiceCue } from '../types';

const MUSIC_FILES: Record<string, string> = {
  music_menu: './assets/audio/music/music_menu.mp3',
  music_stage1: './assets/audio/music/music_stage1.mp3',
  music_boss1: './assets/audio/music/music_boss1.mp3',
  music_stage2: './assets/audio/music/music_stage2.mp3',
  music_boss2: './assets/audio/music/music_boss2.mp3',
  music_stage3: './assets/audio/music/music_stage3.mp3',
  music_boss3: './assets/audio/music/music_boss3.mp3',
  music_victory: './assets/audio/music/music_victory.mp3',
};

export type SfxType =
  | 'spark'
  | 'whip'
  | 'boomerang'
  | 'molotov'
  | 'beam'
  | 'lightning'
  | 'mortar'
  | 'explosion'
  | 'hit'
  | 'crit'
  | 'kill'
  | 'pickup_xp'
  | 'pickup_cinder'
  | 'heal'
  | 'dash'
  | 'overdrive'
  | 'levelup'
  | 'evolution'
  | 'boss_warning'
  | 'player_hurt'
  | 'ui_click'
  | 'ui_hover';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private settings: SettingsState;
  private currentMusicKey: string | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private voiceAudio: HTMLAudioElement | null = null;
  private isVoicePlaying: boolean = false;
  private lastSfxTime: Map<SfxType, number> = new Map();
  private xpPitchStreak: number = 0;
  private lastXpPickupAt: number = 0;
  private onVoiceCueCallback?: (cue: VoiceCue | null) => void;

  constructor(settings: SettingsState) {
    this.settings = settings;
    this.setupUnlockListeners();
  }

  public setOnVoiceCue(cb: (cue: VoiceCue | null) => void): void {
    this.onVoiceCueCallback = cb;
  }

  public updateSettings(settings: SettingsState): void {
    this.settings = settings;
    this.syncVolumes();
  }

  private setupUnlockListeners(): void {
    const unlock = () => {
      this.ensureContext();
      if (this.musicAudio && this.musicAudio.paused && this.currentMusicKey) {
        this.musicAudio.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private syncVolumes(): void {
    if (this.musicAudio) {
      const duckFactor = this.isVoicePlaying ? 0.32 : 0.75;
      this.musicAudio.volume = Math.max(0, Math.min(1, this.settings.musicVolume * duckFactor));
    }
    if (this.voiceAudio) {
      this.voiceAudio.volume = Math.max(0, Math.min(1, Math.max(this.settings.soundVolume, 0.7)));
    }
  }

  public playMusic(key: string): void {
    if (this.currentMusicKey === key && this.musicAudio) {
      this.syncVolumes();
      if (this.musicAudio.paused) {
        this.musicAudio.play().catch(() => {});
      }
      return;
    }

    const url = MUSIC_FILES[key];
    if (!url) return;

    this.currentMusicKey = key;
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
    }

    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = 'auto';
    this.musicAudio = audio;
    this.syncVolumes();
    audio.play().catch(() => {
      // Autoplay blocked until first interaction; unlock listener will resume it
    });
  }

  public stopMusic(): void {
    this.currentMusicKey = null;
    if (this.musicAudio) {
      this.musicAudio.pause();
    }
  }

  public playVoice(cueKey: string, onEnd?: () => void): void {
    const cue = VOICE_CUES[cueKey];
    if (!cue) {
      if (onEnd) onEnd();
      return;
    }

    if (this.voiceAudio) {
      this.voiceAudio.pause();
      this.voiceAudio.onended = null;
    }

    this.isVoicePlaying = true;
    this.syncVolumes();
    if (this.onVoiceCueCallback) {
      this.onVoiceCueCallback(cue);
    }

    const audio = new Audio(cue.audioFile);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, Math.max(this.settings.soundVolume, 0.75)));
    this.voiceAudio = audio;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.isVoicePlaying = false;
      this.syncVolumes();
      if (onEnd) onEnd();
    };

    audio.onended = finish;
    audio.onerror = () => {
      setTimeout(finish, 3600);
    };

    audio.play().catch(() => {
      // If browser blocks voice autoplay (e.g. headless test without gesture), still show subtitle for 3.8s
      setTimeout(finish, 3800);
    });
  }

  public stopVoice(): void {
    if (this.voiceAudio) {
      this.voiceAudio.pause();
      this.voiceAudio.onended = null;
      this.voiceAudio = null;
    }
    this.isVoicePlaying = false;
    this.syncVolumes();
    if (this.onVoiceCueCallback) {
      this.onVoiceCueCallback(null);
    }
  }

  public playSfx(type: SfxType): void {
    if (this.settings.soundVolume <= 0.01) return;

    const now = performance.now();
    const minGap = this.getMinSfxGap(type);
    const prev = this.lastSfxTime.get(type) || 0;
    if (now - prev < minGap) return;
    this.lastSfxTime.set(type, now);

    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    const t = ctx.currentTime;
    const vol = this.settings.soundVolume * 0.35;

    switch (type) {
      case 'spark':
        this.tone(ctx, 'triangle', 580, 220, 0.06, vol * 0.45, t);
        break;
      case 'whip':
        this.noiseBurst(ctx, 0.11, 1400, vol * 0.65, t);
        this.tone(ctx, 'sawtooth', 320, 95, 0.11, vol * 0.5, t);
        break;
      case 'boomerang':
        this.tone(ctx, 'sine', 380, 620, 0.09, vol * 0.45, t);
        break;
      case 'molotov':
        this.noiseBurst(ctx, 0.14, 2200, vol * 0.6, t);
        this.tone(ctx, 'triangle', 260, 110, 0.15, vol * 0.5, t);
        break;
      case 'beam':
        this.tone(ctx, 'sawtooth', 880, 310, 0.14, vol * 0.55, t);
        break;
      case 'lightning':
        this.noiseBurst(ctx, 0.09, 3200, vol * 0.55, t);
        this.tone(ctx, 'square', 740, 420, 0.08, vol * 0.4, t);
        break;
      case 'mortar':
        this.tone(ctx, 'sine', 240, 480, 0.1, vol * 0.45, t);
        break;
      case 'explosion':
        this.noiseBurst(ctx, 0.22, 650, vol * 0.85, t);
        this.tone(ctx, 'sawtooth', 150, 38, 0.22, vol * 0.75, t);
        break;
      case 'hit':
        this.tone(ctx, 'triangle', 190, 80, 0.045, vol * 0.38, t);
        break;
      case 'crit':
        this.tone(ctx, 'square', 460, 180, 0.07, vol * 0.55, t);
        this.tone(ctx, 'sine', 920, 620, 0.06, vol * 0.4, t);
        break;
      case 'kill':
        this.tone(ctx, 'sine', 280, 110, 0.065, vol * 0.42, t);
        break;
      case 'pickup_xp': {
        if (now - this.lastXpPickupAt < 450) {
          this.xpPitchStreak = Math.min(12, this.xpPitchStreak + 1);
        } else {
          this.xpPitchStreak = 0;
        }
        this.lastXpPickupAt = now;
        const baseFreq = 520 + this.xpPitchStreak * 45;
        this.tone(ctx, 'sine', baseFreq, baseFreq * 1.25, 0.065, vol * 0.45, t);
        break;
      }
      case 'pickup_cinder':
        this.tone(ctx, 'triangle', 660, 990, 0.09, vol * 0.55, t);
        this.tone(ctx, 'sine', 990, 1320, 0.11, vol * 0.45, t + 0.05);
        break;
      case 'heal':
        this.tone(ctx, 'sine', 440, 660, 0.12, vol * 0.55, t);
        this.tone(ctx, 'sine', 660, 880, 0.14, vol * 0.55, t + 0.07);
        break;
      case 'dash':
        this.noiseBurst(ctx, 0.12, 1800, vol * 0.65, t);
        this.tone(ctx, 'sine', 340, 140, 0.11, vol * 0.55, t);
        break;
      case 'overdrive':
        this.noiseBurst(ctx, 0.3, 1200, vol * 0.9, t);
        this.tone(ctx, 'sawtooth', 220, 660, 0.28, vol * 0.8, t);
        this.tone(ctx, 'triangle', 440, 880, 0.32, vol * 0.7, t + 0.05);
        break;
      case 'levelup':
        this.tone(ctx, 'triangle', 440, 440, 0.09, vol * 0.65, t);
        this.tone(ctx, 'triangle', 554, 554, 0.09, vol * 0.65, t + 0.08);
        this.tone(ctx, 'triangle', 659, 659, 0.11, vol * 0.65, t + 0.16);
        this.tone(ctx, 'triangle', 880, 880, 0.22, vol * 0.75, t + 0.24);
        break;
      case 'evolution':
        this.tone(ctx, 'sawtooth', 330, 660, 0.18, vol * 0.75, t);
        this.tone(ctx, 'triangle', 554, 1108, 0.25, vol * 0.8, t + 0.12);
        this.tone(ctx, 'sine', 880, 1320, 0.35, vol * 0.85, t + 0.24);
        break;
      case 'boss_warning':
        this.tone(ctx, 'sawtooth', 180, 130, 0.35, vol * 0.85, t);
        this.tone(ctx, 'sawtooth', 180, 130, 0.35, vol * 0.85, t + 0.42);
        break;
      case 'player_hurt':
        this.noiseBurst(ctx, 0.14, 900, vol * 0.8, t);
        this.tone(ctx, 'sawtooth', 210, 75, 0.15, vol * 0.75, t);
        break;
      case 'ui_click':
        this.tone(ctx, 'triangle', 620, 420, 0.04, vol * 0.45, t);
        break;
      case 'ui_hover':
        this.tone(ctx, 'sine', 480, 540, 0.025, vol * 0.22, t);
        break;
    }
  }

  private getMinSfxGap(type: SfxType): number {
    switch (type) {
      case 'hit':
      case 'kill':
      case 'pickup_xp':
        return 42;
      case 'spark':
      case 'crit':
        return 55;
      default:
        return 75;
    }
  }

  private tone(
    ctx: AudioContext,
    wave: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    gainVal: number,
    startTime: number
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

      gain.gain.setValueAtTime(Math.max(0.001, gainVal), startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    } catch {
      // Ignore oscillator schedule boundary errors
    }
  }

  private noiseBurst(
    ctx: AudioContext,
    duration: number,
    filterFreq: number,
    gainVal: number,
    startTime: number
  ): void {
    try {
      const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.001, gainVal), startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(startTime);
      src.stop(startTime + duration + 0.01);
    } catch {
      // Ignore audio errors
    }
  }
}
