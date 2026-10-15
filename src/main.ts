import { GameEngine } from './game/GameEngine';
import { attachNovakiQA } from './qa/NovakiQA';
import './styles.css';
import { AssetManager } from './systems/AssetManager';
import { AudioManager } from './systems/AudioManager';
import { InputManager } from './systems/InputManager';
import { SaveManager } from './systems/SaveManager';
import { UIManager } from './ui/UIManager';

function bootstrap(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  const save = new SaveManager();
  const assets = new AssetManager();
  assets.preloadAll();

  const audio = new AudioManager(save.settings);
  const input = new InputManager();
  const engine = new GameEngine(canvas, assets, audio, input, save);
  const ui = new UIManager(uiRoot, engine);

  attachNovakiQA(engine);

  const resize = () => {
    canvas.width = Math.max(320, window.innerWidth);
    canvas.height = Math.max(240, window.innerHeight);
  };
  resize();
  window.addEventListener('resize', resize);

  let lastTime = performance.now();
  let hudAccum = 0;

  const frame = (now: number) => {
    const dt = Math.max(0.001, Math.min(0.1, (now - lastTime) / 1000));
    lastTime = now;

    engine.update(dt);
    engine.render();

    hudAccum += dt;
    if (hudAccum >= 0.08) {
      hudAccum = 0;
      ui.updateHUD();
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
