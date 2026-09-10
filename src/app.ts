import { parsePath, type Route } from './router';
import { Hud } from './ui/Hud';
import { World } from './world/World';

export class App {
  private world?: World;
  private readonly hud: Hud;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.hud = new Hud(root);
    this.hud.onNavigate = (path) => {
      if (path === location.pathname) return;
      history.pushState(null, '', path);
      this.apply(parsePath(path), true);
      window.scrollTo(0, 0);
    };
    this.hud.onFracture = () => this.world?.fracture();
    this.hud.onMotion = () => {
      this.world?.toggleMotion();
      this.hud.setMotion(this.world?.paused ?? true);
    };
    window.addEventListener('popstate', () => this.apply(parsePath(location.pathname), true));
    try {
      this.world = new World(canvas);
      this.world.onCycle = (label) => this.hud.setCycle(label);
      this.world.onForm = (label) => this.hud.setForm(label);
    } catch (error) {
      document.body.classList.add('no-webgl');
      console.error('WebGL sculpture unavailable:', error);
    }
  }

  start(): void {
    this.apply(parsePath(location.pathname));
    this.world?.start();
  }

  private apply(route: Route, focus = false): void {
    this.hud.render(route, focus);
    this.world?.setReading(route.view !== 'world');
    this.hud.setMotion(this.world?.paused ?? true);
    if (!this.world) this.hud.setCycle('WEBGL UNAVAILABLE');
  }
}
