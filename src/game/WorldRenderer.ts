import { STAGE_DEFS } from '../data/content';
import { AssetManager, ProcessedSprite } from '../systems/AssetManager';
import {
  EnemyEntity,
  FloatingTextEntity,
  HazardEntity,
  ParticleEntity,
  PickupEntity,
  ProjectileEntity,
  PropEntity,
  StageId,
} from '../types';

export interface RenderPlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  facing: number;
  invincible: boolean;
  iframeTimer: number;
  dashTimer: number;
  overdriveTimer: number;
  walkPhase: number;
  smokePoints: Array<{ x: number; y: number; age: number }>;
}

export class WorldRenderer {
  private ctx: CanvasRenderingContext2D;
  private assets: AssetManager;

  constructor(ctx: CanvasRenderingContext2D, assets: AssetManager) {
    this.ctx = ctx;
    this.assets = assets;
  }

  public render(
    width: number,
    height: number,
    stageId: StageId,
    time: number,
    camX: number,
    camY: number,
    shakeX: number,
    shakeY: number,
    arenaRadius: number,
    player: RenderPlayerState,
    enemies: EnemyEntity[],
    projectiles: ProjectileEntity[],
    hazards: HazardEntity[],
    pickups: PickupEntity[],
    props: PropEntity[],
    particles: ParticleEntity[],
    floatingTexts: FloatingTextEntity[],
    showDamageNumbers: boolean
  ): void {
    const ctx = this.ctx;
    const stage = STAGE_DEFS[stageId];

    ctx.save();
    // Background fill
    ctx.fillStyle = stage.floorColor;
    ctx.fillRect(0, 0, width, height);

    const viewX = width / 2 - camX + shakeX;
    const viewY = height / 2 - camY + shakeY;
    ctx.translate(viewX, viewY);

    // 1. Tiled stage background + grid
    this.drawStageFloor(ctx, stageId, camX, camY, width, height, arenaRadius, time);

    // 2. Ground hazards & boss telegraphs
    this.drawHazards(ctx, hazards, camX, camY, width, height, time);

    // 3. Interactive arena props (Matchbox Crates & Flint Strike-Strips)
    this.drawProps(ctx, props, camX, camY, width, height, time);

    // 4. Pickups (XP Gems, Cinders, Marshmallows, Magnet Sparks, Boss Chests)
    this.drawPickups(ctx, pickups, camX, camY, width, height, time);

    // 5. Enemies & Bosses (sorted lightly or culled to viewport)
    this.drawEnemies(ctx, enemies, camX, camY, width, height, time);

    // 6. Novaki Hero
    this.drawPlayer(ctx, player, time);

    // 7. Projectiles, Beams & Lightning Chains
    this.drawProjectiles(ctx, projectiles, camX, camY, width, height, time);

    // 8. Particles
    this.drawParticles(ctx, particles, camX, camY, width, height);

    // 9. Floating Damage Numbers
    if (showDamageNumbers) {
      this.drawFloatingTexts(ctx, floatingTexts, camX, camY, width, height);
    }

    ctx.restore();

    // 10. Atmospheric Warm Ember Lighting & Vignette
    this.drawAtmosphere(ctx, width, height, stageId, player, time);
  }

  private drawStageFloor(
    ctx: CanvasRenderingContext2D,
    stageId: StageId,
    camX: number,
    camY: number,
    width: number,
    height: number,
    arenaRadius: number,
    time: number
  ): void {
    const stage = STAGE_DEFS[stageId];
    const halfW = width / 2 + 120;
    const halfH = height / 2 + 120;
    const left = camX - halfW;
    const top = camY - halfH;
    const right = camX + halfW;
    const bottom = camY + halfH;

    const pattern = this.assets.getPattern(ctx, stage.bgTileKey);
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pattern;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.restore();
    }

    // Subtle geometric tabletop tile lines
    const tileSize = 128;
    const startX = Math.floor(left / tileSize) * tileSize;
    const startY = Math.floor(top / tileSize) * tileSize;

    ctx.strokeStyle = stage.gridColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = startX; x <= right; x += tileSize) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y <= bottom; y += tileSize) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    // Decorative stage floor motifs per tile
    for (let ty = startY; ty <= bottom; ty += tileSize * 2) {
      for (let tx = startX; tx <= right; tx += tileSize * 2) {
        const hash = Math.abs(((tx * 73856093) ^ (ty * 19349663)) % 100);
        if (hash < 28) {
          ctx.save();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = stage.accentColor;
          ctx.beginPath();
          ctx.arc(tx + 64, ty + 64, 10 + (hash % 14), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Arena Perimeter Ring (Kindlewick Boundary)
    ctx.save();
    ctx.strokeStyle = stage.accentColor;
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 12]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawHazards(
    ctx: CanvasRenderingContext2D,
    hazards: HazardEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number,
    time: number
  ): void {
    const cullX = width / 2 + 250;
    const cullY = height / 2 + 250;

    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h.kind !== 'boss_laser_line') {
        if (Math.abs(h.x - camX) > cullX + h.radius || Math.abs(h.y - camY) > cullY + h.radius) {
          continue;
        }
      }

      ctx.save();
      const progress = 1 - h.life / Math.max(0.01, h.maxLife);

      if (h.kind === 'player_napalm' || h.kind === 'player_magma') {
        const isEvo = h.kind === 'player_magma';
        const grad = ctx.createRadialGradient(h.x, h.y, h.radius * 0.15, h.x, h.y, h.radius);
        grad.addColorStop(0, isEvo ? 'rgba(56, 189, 248, 0.55)' : 'rgba(251, 146, 60, 0.5)');
        grad.addColorStop(0.7, isEvo ? 'rgba(14, 165, 233, 0.32)' : 'rgba(239, 68, 68, 0.28)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isEvo ? 'rgba(125, 211, 252, 0.65)' : 'rgba(253, 186, 116, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * (0.85 + Math.sin(time * 9 + h.uid) * 0.06), 0, Math.PI * 2);
        ctx.stroke();
      } else if (h.kind === 'player_shock_field') {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (h.kind === 'enemy_damp_puddle' || h.kind === 'enemy_wax_pool') {
        ctx.fillStyle = h.kind === 'enemy_damp_puddle' ? 'rgba(14, 165, 233, 0.34)' : 'rgba(217, 119, 6, 0.38)';
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (h.kind === 'enemy_mortar_target' || h.kind === 'boss_slam_zone') {
        // Red telegraph warning circle with filling inner circle
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.38)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * Math.min(1, progress), 0, Math.PI * 2);
        ctx.fill();
      } else if (h.kind === 'boss_laser_line' && h.endX !== undefined && h.endY !== undefined) {
        if (!h.armed) {
          // Pre-fire warning line
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(h.endX, h.endY);
          ctx.stroke();
        } else {
          // Active searing beam
          ctx.strokeStyle = h.color;
          ctx.lineWidth = h.radius * 2;
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(h.endX, h.endY);
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(4, h.radius * 0.75);
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(h.endX, h.endY);
          ctx.stroke();
        }
      } else if (h.kind === 'boss_cryo_pylon') {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pylon crystal center
        ctx.fillStyle = '#ecfeff';
        ctx.beginPath();
        ctx.moveTo(h.x, h.y - 22);
        ctx.lineTo(h.x + 14, h.y);
        ctx.lineTo(h.x, h.y + 22);
        ctx.lineTo(h.x - 14, h.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawProps(
    ctx: CanvasRenderingContext2D,
    props: PropEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number,
    time: number
  ): void {
    const cullX = width / 2 + 80;
    const cullY = height / 2 + 80;

    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (Math.abs(p.x - camX) > cullX || Math.abs(p.y - camY) > cullY) continue;

      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.kind === 'strike_strip') {
        const ready = p.cooldown <= 0;
        ctx.fillStyle = ready ? '#7c2d12' : '#334155';
        ctx.strokeStyle = ready ? '#f97316' : '#64748b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-28, -14, 56, 28, 6);
        ctx.fill();
        ctx.stroke();

        // Sandpaper grit texture dots
        ctx.fillStyle = ready ? '#fdba74' : '#94a3b8';
        for (let gx = -20; gx <= 20; gx += 10) {
          for (let gy = -6; gy <= 6; gy += 12) {
            ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
          }
        }
        if (ready) {
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('STRIKE PAD', 0, -19);
        }
      } else {
        // Supply Matchbox Crate
        const scale = p.hitFlash > 0 ? 1.12 : 1 + Math.sin(time * 3 + p.uid) * 0.02;
        ctx.scale(scale, scale);

        ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#b45309';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-20, -15, 40, 30, 5);
        ctx.fill();
        ctx.stroke();

        // Red matchbox label band
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-15, -9, 30, 18);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawPickups(
    ctx: CanvasRenderingContext2D,
    pickups: PickupEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number,
    time: number
  ): void {
    const cullX = width / 2 + 60;
    const cullY = height / 2 + 60;

    for (let i = 0; i < pickups.length; i++) {
      const pk = pickups[i];
      if (Math.abs(pk.x - camX) > cullX || Math.abs(pk.y - camY) > cullY) continue;

      ctx.save();
      const bob = Math.sin(time * 5 + pk.uid) * 2.5;
      ctx.translate(pk.x, pk.y + bob);

      if (pk.kind === 'xp_small' || pk.kind === 'xp_medium' || pk.kind === 'xp_large') {
        const color =
          pk.kind === 'xp_large' ? '#f43f5e' : pk.kind === 'xp_medium' ? '#38bdf8' : '#fbbf24';
        const r = pk.kind === 'xp_large' ? 8.5 : pk.kind === 'xp_medium' ? 7 : 5.5;

        ctx.fillStyle = color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.25);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r * 1.25);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (pk.kind === 'cinder') {
        // Glowing Ember Cinder coin
        ctx.fillStyle = '#f97316';
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (pk.kind === 'heal_marshmallow') {
        // Toasted Marshmallow heal pickup
        ctx.fillStyle = '#fffbeb';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-10, -8, 20, 16, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-2, -5, 4, 10);
        ctx.fillRect(-5, -2, 10, 4);
      } else if (pk.kind === 'magnet_spark') {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 9, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-10.5, 0, 4, 6);
        ctx.fillRect(6.5, 0, 4, 6);
      } else if (pk.kind === 'boss_chest') {
        ctx.fillStyle = '#eab308';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-18, -14, 36, 28, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-18, -3, 36, 5);
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawEnemies(
    ctx: CanvasRenderingContext2D,
    enemies: EnemyEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number,
    time: number
  ): void {
    const cullX = width / 2 + 120;
    const cullY = height / 2 + 120;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.isBoss && (Math.abs(e.x - camX) > cullX || Math.abs(e.y - camY) > cullY)) {
        continue;
      }

      ctx.save();
      ctx.translate(e.x, e.y);

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(0, e.radius * 0.82, e.radius * 0.85, e.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Elite or Boss golden/colored aura ring
      if (e.isBoss || e.isElite) {
        ctx.strokeStyle = e.isBoss ? e.accentColor : '#facc15';
        ctx.lineWidth = e.isBoss ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 1.12, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Laser pounce telegraph line for Snuff-Hound
      if (e.behavior === 'laser_pounce' && e.statePhase === 1) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(e.targetX - e.x, e.targetY - e.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Rotating beam for Frost-Coil Automaton
      if (e.behavior === 'beam_sentinel') {
        const beamAngle = time * 1.6 + e.animOffset;
        const bx = Math.cos(beamAngle) * 145;
        const by = Math.sin(beamAngle) * 145;
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // Kamikaze fuse warning circle
      if (e.behavior === 'kamikaze_fuse' && e.statePhase === 1) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 75, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Walk wobble & squash-stretch
      const wobble = Math.sin(time * 9 + e.animOffset) * 0.06;
      const scaleY = 1 + Math.sin(time * 12 + e.animOffset) * 0.05;
      const scaleX = (1 / scaleY) * (e.facing < 0 ? -1 : 1);

      ctx.save();
      ctx.rotate(wobble);
      ctx.scale(scaleX, scaleY);

      const sprite = this.assets.getSprite(e.spriteKey);
      if (sprite) {
        this.drawTrimmedSprite(ctx, sprite, e.radius * 2.35, e.hitFlashTimer > 0);
      } else {
        // Crisp stylized vector fallback if image is still generating/loading
        ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : e.color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Angry cartoon eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.radius * 0.28, -e.radius * 0.15, e.radius * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(e.radius * 0.34, -e.radius * 0.15, e.radius * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Burn flame indicator
      if (e.burnTimer > 0) {
        ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
        ctx.beginPath();
        ctx.arc(0, -e.radius * 0.9, 6 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Damaged enemy health bar
      if (!e.isBoss && (e.hp < e.maxHp || e.isElite)) {
        const bw = Math.max(28, e.radius * 1.6);
        const bh = 5;
        const bx = -bw / 2;
        const by = -e.radius - 14;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = e.isElite ? '#facc15' : '#ef4444';
        ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      }

      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: RenderPlayerState, time: number): void {
    // 1. Draw Novaki's signature thin curl of white smoke rising in world space
    if (player.smokePoints.length > 1) {
      ctx.save();
      for (let i = 0; i < player.smokePoints.length; i++) {
        const sp = player.smokePoints[i];
        const alpha = Math.max(0, 1 - sp.age / 1.1) * 0.55;
        const radius = 4 + sp.age * 11;
        ctx.fillStyle = player.overdriveTimer > 0
          ? `rgba(251, 146, 60, ${alpha.toFixed(2)})`
          : `rgba(241, 245, 249, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(player.x, player.y);

    // Warm ground glow under Novaki
    const glowRadius = player.overdriveTimer > 0 ? 115 : 72;
    const glowGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, glowRadius);
    glowGrad.addColorStop(0, player.overdriveTimer > 0 ? 'rgba(249, 115, 22, 0.42)' : 'rgba(251, 191, 36, 0.22)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Ground drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Overdrive blazing ring
    if (player.overdriveTimer > 0) {
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(time * 18) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Invincibility / Dash flash
    if (player.iframeTimer > 0 && Math.floor(time * 20) % 2 === 0) {
      ctx.globalAlpha = 0.65;
    }

    const isMoving = Math.hypot(player.vx, player.vy) > 12;
    const spriteKey =
      player.overdriveTimer > 0
        ? 'novaki_overdrive'
        : isMoving
        ? 'novaki_run'
        : 'novaki_idle';

    const bob = isMoving ? Math.sin(player.walkPhase * 12) * 3 : Math.sin(time * 4) * 1.5;
    const tilt = isMoving ? Math.sin(player.walkPhase * 12) * 0.08 : 0;

    ctx.translate(0, bob);
    ctx.rotate(tilt);
    ctx.scale(player.facing < 0 ? -1 : 1, 1);

    const sprite = this.assets.getSprite(spriteKey) || this.assets.getSprite('novaki_idle');
    if (sprite) {
      this.drawTrimmedSprite(ctx, sprite, 68, false);
    } else {
      // Faithful procedural rendition of Novaki matching reference images
      this.drawProceduralNovaki(ctx, player.overdriveTimer > 0, time);
    }

    ctx.restore();
  }

  private drawProceduralNovaki(ctx: CanvasRenderingContext2D, overdrive: boolean, time: number): void {
    // Legs & small black shoes
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-7, 14);
    ctx.lineTo(-9, 24);
    ctx.moveTo(7, 14);
    ctx.lineTo(9, 24);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(-10, 25, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(10, 25, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chunky wooden matchstick body
    ctx.fillStyle = '#f3cfa4';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.roundRect(-11, -10, 22, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Oversized burnt black charcoal match head
    if (overdrive) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(0, -18, 19 + Math.sin(time * 24) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crooked thick round black glasses
    ctx.save();
    ctx.rotate(0.11);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-5.5, -4, 5.5, 0, Math.PI * 2);
    ctx.arc(5.5, -3.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // White cartoon gloves
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(-15, 5, 4.5, 0, Math.PI * 2);
    ctx.arc(15, 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawTrimmedSprite(
    ctx: CanvasRenderingContext2D,
    sprite: ProcessedSprite,
    targetMaxDim: number,
    useFlash: boolean
  ): void {
    let drawW = targetMaxDim;
    let drawH = targetMaxDim;
    if (sprite.aspect >= 1) {
      drawH = targetMaxDim / sprite.aspect;
    } else {
      drawW = targetMaxDim * sprite.aspect;
    }

    const srcCanvas = useFlash ? sprite.flashCanvas : sprite.canvas;
    ctx.drawImage(
      srcCanvas,
      sprite.sx,
      sprite.sy,
      sprite.sw,
      sprite.sh,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
  }

  private drawProjectiles(
    ctx: CanvasRenderingContext2D,
    projectiles: ProjectileEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number,
    time: number
  ): void {
    const cullX = width / 2 + 160;
    const cullY = height / 2 + 160;

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];

      if (p.kind === 'laser_beam' && p.beamEndX !== undefined && p.beamEndY !== undefined) {
        ctx.save();
        ctx.strokeStyle = p.glowColor;
        ctx.lineWidth = p.radius * 2.2;
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, p.life / p.maxLife) * 0.55;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.beamEndX, p.beamEndY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(3, p.radius * 0.8);
        ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.beamEndX, p.beamEndY);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (p.kind === 'lightning_chain' && p.chainPoints && p.chainPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.isEvolved ? 5 : 3.5;
        ctx.lineJoin = 'round';
        ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
        ctx.beginPath();
        ctx.moveTo(p.chainPoints[0].x, p.chainPoints[0].y);
        for (let k = 1; k < p.chainPoints.length; k++) {
          const pt = p.chainPoints[k];
          const prev = p.chainPoints[k - 1];
          const midX = (prev.x + pt.x) / 2 + Math.sin(time * 40 + k * 7) * 9;
          const midY = (prev.y + pt.y) / 2 + Math.cos(time * 40 + k * 7) * 9;
          ctx.lineTo(midX, midY);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (Math.abs(p.x - camX) > cullX || Math.abs(p.y - camY) > cullY) continue;

      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.kind === 'whip_arc' || p.kind === 'solar_tornado') {
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.kind === 'solar_tornado' ? 14 : 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (p.kind === 'solar_tornado') {
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        } else {
          ctx.arc(0, 0, p.radius, -1.1, 1.1);
        }
        ctx.stroke();
      } else if (p.kind === 'boomerang' || p.kind === 'buzzsaw') {
        ctx.rotate(time * 18);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.2;
        const teeth = p.kind === 'buzzsaw' ? 8 : 4;
        ctx.beginPath();
        for (let t = 0; t < teeth * 2; t++) {
          const r = t % 2 === 0 ? p.radius * 1.25 : p.radius * 0.65;
          const a = (t * Math.PI) / teeth;
          if (t === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Glowing orb / spark / bullet / saucer
        ctx.fillStyle = p.glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 1.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.fromPlayer ? '#fff7ed' : '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    particles: ParticleEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number
  ): void {
    const cullX = width / 2 + 40;
    const cullY = height / 2 + 40;

    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      if (Math.abs(pt.x - camX) > cullX || Math.abs(pt.y - camY) > cullY) continue;

      const t = 1 - pt.life / Math.max(0.001, pt.maxLife);
      const size = pt.size + (pt.endSize - pt.size) * t;
      if (size <= 0.2) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, (1 - t) * pt.alpha);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFloatingTexts(
    ctx: CanvasRenderingContext2D,
    texts: FloatingTextEntity[],
    camX: number,
    camY: number,
    width: number,
    height: number
  ): void {
    const cullX = width / 2 + 80;
    const cullY = height / 2 + 80;

    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < texts.length; i++) {
      const ft = texts[i];
      if (Math.abs(ft.x - camX) > cullX || Math.abs(ft.y - camY) > cullY) continue;

      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `900 ${ft.size}px 'Inter', system-ui, sans-serif`;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  private drawAtmosphere(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    stageId: StageId,
    player: RenderPlayerState,
    time: number
  ): void {
    // Subtle dark edge vignette to frame the action
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.32,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(4, 7, 15, 0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Low HP red danger pulse on screen border
    if (player.hp > 0 && player.hp / player.maxHp < 0.3) {
      const pulse = 0.18 + Math.sin(time * 8) * 0.1;
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 18;
      ctx.strokeRect(0, 0, width, height);
    }
  }
}
