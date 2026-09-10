import type { DestinationId } from './config';
import { destinationFromRoute, parsePath, pathFor, routeFromDestination, type Route } from './router';
import { Hud } from './ui/Hud';
import { World } from './world/World';

export class App {
  private readonly world: World;
  private readonly hud: Hud;
  private route: Route = { view: 'world' };

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.world = new World(canvas);
    this.hud = new Hud(hudRoot);

    this.world.onPick = (id) => this.go(pathFor(routeFromDestination(id)));
    this.world.onCycle = (cycle) => this.hud.setCycle(cycle.label);
    this.hud.onNavigate = (path) => this.go(path);

    window.addEventListener('popstate', () => {
      this.apply(parsePath(window.location.pathname), false);
    });
    window.addEventListener('keydown', this.onKey);
  }

  start(): void {
    this.apply(parsePath(window.location.pathname), false);
    this.world.start();
  }

  private go(path: string): void {
    const route = parsePath(path);
    if (pathFor(route) === pathFor(this.route) && path === window.location.pathname) {
      return;
    }
    this.apply(route, true);
  }

  private apply(route: Route, push: boolean): void {
    this.route = route;
    const path = pathFor(route);
    if (push && window.location.pathname !== path) {
      history.pushState(route, '', path);
    }
    this.hud.render(route);
    this.world.setReading(destinationFromRoute(route));
  }

  private onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const keys: Record<string, DestinationId> = {
      '1': 'portfolio',
      '2': 'blog',
      '3': 'tutorials',
    };
    if (event.key === 'Escape') {
      this.go('/');
      return;
    }
    const dest = keys[event.key];
    if (dest) this.go(pathFor(routeFromDestination(dest)));
  };
}
