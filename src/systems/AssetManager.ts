export interface ProcessedSprite {
  canvas: HTMLCanvasElement;
  flashCanvas: HTMLCanvasElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  aspect: number; // sw / sh
}

const IMAGE_MANIFEST: Record<string, { url: string; transparent: boolean }> = {
  // Novaki sprites & portraits
  novaki_idle: { url: './assets/images/novaki_idle.png', transparent: true },
  novaki_run: { url: './assets/images/novaki_run.png', transparent: true },
  novaki_overdrive: { url: './assets/images/novaki_overdrive.png', transparent: true },
  novaki_portrait: { url: './assets/images/novaki_portrait.png', transparent: false },

  // Story & Title art
  title_hero: { url: './assets/images/title_hero.jpg', transparent: false },
  story_intro: { url: './assets/images/story_intro.jpg', transparent: false },
  story_victory: { url: './assets/images/story_victory.jpg', transparent: false },

  // Stage tiles
  stage1_bg: { url: './assets/images/stage1_bg.jpg', transparent: false },
  stage2_bg: { url: './assets/images/stage2_bg.jpg', transparent: false },
  stage3_bg: { url: './assets/images/stage3_bg.jpg', transparent: false },

  // Bosses
  boss1_drip: { url: './assets/images/boss1_drip.png', transparent: true },
  boss2_tallow: { url: './assets/images/boss2_tallow.png', transparent: true },
  boss3_zero: { url: './assets/images/boss3_zero.png', transparent: true },

  // Stage 1 Enemies
  enemy_slime_dew: { url: './assets/images/enemy_slime_dew.png', transparent: true },
  enemy_spore_mold: { url: './assets/images/enemy_spore_mold.png', transparent: true },
  enemy_thimble_knight: { url: './assets/images/enemy_thimble_knight.png', transparent: true },
  enemy_spit_beetle: { url: './assets/images/enemy_spit_beetle.png', transparent: true },
  enemy_sponge_brute: { url: './assets/images/enemy_sponge_brute.png', transparent: true },

  // Stage 2 Enemies
  enemy_wick_imp: { url: './assets/images/enemy_wick_imp.png', transparent: true },
  enemy_wax_gargoyle: { url: './assets/images/enemy_wax_gargoyle.png', transparent: true },
  enemy_censer_acolyte: { url: './assets/images/enemy_censer_acolyte.png', transparent: true },
  enemy_molten_blob: { url: './assets/images/enemy_molten_blob.png', transparent: true },
  enemy_snuff_hound: { url: './assets/images/enemy_snuff_hound.png', transparent: true },

  // Stage 3 Enemies
  enemy_icicle_wraith: { url: './assets/images/enemy_icicle_wraith.png', transparent: true },
  enemy_cryo_golem: { url: './assets/images/enemy_cryo_golem.png', transparent: true },
  enemy_blizzard_mote: { url: './assets/images/enemy_blizzard_mote.png', transparent: true },
  enemy_hail_mortar: { url: './assets/images/enemy_hail_mortar.png', transparent: true },
  enemy_frost_automaton: { url: './assets/images/enemy_frost_automaton.png', transparent: true },
};

export class AssetManager {
  private sprites: Map<string, ProcessedSprite> = new Map();
  private patterns: Map<string, CanvasPattern> = new Map();
  private rawImages: Map<string, HTMLImageElement> = new Map();

  public preloadAll(): void {
    for (const [key, entry] of Object.entries(IMAGE_MANIFEST)) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.rawImages.set(key, img);
        if (entry.transparent) {
          this.sprites.set(key, this.processTransparentSprite(img));
        } else {
          this.sprites.set(key, this.processOpaqueImage(img));
        }
      };
      img.onerror = () => {
        // Keep fallback procedural rendering if asset is not yet ready
      };
      img.src = entry.url;
    }
  }

  public getSprite(key: string): ProcessedSprite | undefined {
    return this.sprites.get(key);
  }

  public getImageUrl(key: string): string {
    return IMAGE_MANIFEST[key]?.url || '';
  }

  public getPattern(ctx: CanvasRenderingContext2D, key: string): CanvasPattern | null {
    if (this.patterns.has(key)) {
      return this.patterns.get(key)!;
    }
    const sprite = this.sprites.get(key);
    if (!sprite) return null;
    const pat = ctx.createPattern(sprite.canvas, 'repeat');
    if (pat) {
      this.patterns.set(key, pat);
    }
    return pat;
  }

  private processOpaqueImage(img: HTMLImageElement): ProcessedSprite {
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return {
      canvas,
      flashCanvas: canvas,
      sx: 0,
      sy: 0,
      sw: w,
      sh: h,
      aspect: w / h,
    };
  }

  private processTransparentSprite(img: HTMLImageElement): ProcessedSprite {
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = w;
    flashCanvas.height = h;
    const flashCtx = flashCanvas.getContext('2d')!;

    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const flashData = flashCtx.createImageData(w, h);
      const fData = flashData.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];
          let a = data[idx + 3];

          if (a > 10) {
            // Despill residual magenta chroma-key halo
            const magentaExcess = Math.min(r, b) - g;
            if (magentaExcess > 42 && r > 130 && b > 130) {
              const avg = Math.round((r + g + b) / 3);
              r = avg;
              b = avg;
              a = Math.max(0, a - magentaExcess * 2);
              data[idx] = r;
              data[idx + 2] = b;
              data[idx + 3] = a;
            }
            // Despill residual bright green chroma-key halo on semi-transparent edges
            const greenExcess = g - Math.max(r, b);
            if (greenExcess > 48 && g > 140 && a < 220) {
              const avg = Math.round((r + b) / 2);
              g = avg;
              a = Math.max(0, a - greenExcess * 2);
              data[idx + 1] = g;
              data[idx + 3] = a;
            }
          }

          if (a > 24) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            // Prebuild white/warm hit-flash silhouette pixel
            fData[idx] = 255;
            fData[idx + 1] = 245;
            fData[idx + 2] = 220;
            fData[idx + 3] = a;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      flashCtx.putImageData(flashData, 0, 0);
    } catch {
      // Fallback if getImageData fails
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }

    if (maxX <= minX || maxY <= minY) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }

    const sw = Math.max(1, maxX - minX + 1);
    const sh = Math.max(1, maxY - minY + 1);

    return {
      canvas,
      flashCanvas,
      sx: minX,
      sy: minY,
      sw,
      sh,
      aspect: sw / sh,
    };
  }
}
