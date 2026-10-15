import { GameEngine } from '../game/GameEngine';
import { NovakiQAInterface, QAStartOptions } from '../types';

declare global {
  interface Window {
    NOVAKI_QA: NovakiQAInterface;
  }
}

export function attachNovakiQA(engine: GameEngine): NovakiQAInterface {
  const api: NovakiQAInterface = {
    state: () => engine.getQASnapshot(),
    start: (options?: QAStartOptions) => {
      // Close any auxiliary modals if open
      document.getElementById('modal-story-intro')?.classList.add('hidden');
      document.getElementById('modal-meta')?.classList.add('hidden');
      document.getElementById('modal-settings')?.classList.add('hidden');
      document.getElementById('modal-howto')?.classList.add('hidden');
      return engine.startRun(options || {});
    },
    setInvincible: (on: boolean) => {
      engine.setInvincible(on);
    },
    addXp: (amount: number) => {
      engine.addXp(Number(amount) || 0);
    },
    chooseUpgrade: (index: number) => {
      engine.chooseUpgrade(Number(index) || 0);
    },
    skipTo: (stage: number, point: 'start' | 'boss') => {
      engine.skipTo(stage, point === 'boss' ? 'boss' : 'start');
    },
    killBoss: () => {
      engine.killBoss();
    },
    spawnEnemies: (count: number) => {
      engine.spawnEnemies(Number(count) || 0);
    },
  };

  window.NOVAKI_QA = api;
  return api;
}
