import { App } from './app';
import './styles.css';

const canvas = document.querySelector('#world');
const hud = document.querySelector('#hud');

if (!(canvas instanceof HTMLCanvasElement) || !(hud instanceof HTMLElement)) {
  throw new Error('destroyrebuild: missing #world canvas or #hud root');
}

try {
  const app = new App(canvas, hud);
  app.start();
} catch (error) {
  const banner = document.createElement('p');
  banner.className = 'boot-fail';
  banner.textContent = error instanceof Error ? error.message : 'WebGL world failed to boot.';
  hud.append(banner);
  console.error(error);
}
