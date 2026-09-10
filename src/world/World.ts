import * as THREE from 'three';
import { RebuildCore } from './RebuildCore';

export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly core = new RebuildCore();
  private readonly pointer = new THREE.Vector2();
  private readonly displayPointer = new THREE.Vector2();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private reading = false;
  private visible = true;
  private frame = 0;
  private time = 3;
  private lastTime = 0;
  private impulse = 0;
  private spread = 0.15;
  paused = this.reducedMotion.matches;
  onCycle: ((label: string) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.camera.position.set(8, 6, 12);
    this.camera.lookAt(0, 0, 0);
    const key = new THREE.DirectionalLight(0xffead7, 5);
    key.position.set(-3, 8, 6);
    const rim = new THREE.DirectionalLight(0x98b5c8, 3);
    rim.position.set(6, 2, -4);
    const ember = new THREE.PointLight(0xff4a16, 28, 12);
    ember.position.set(-2, -1, 3);
    this.scene.add(new THREE.HemisphereLight(0xa6b2bb, 0x151110, 2), key, rim, ember, this.core.group);
    new ResizeObserver(this.resize).observe(canvas);
    new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.wake(); }).observe(canvas);
    window.addEventListener('pointermove', this.move, { passive: true });
    document.addEventListener('visibilitychange', this.wake);
    this.reducedMotion.addEventListener('change', () => {
      this.paused = this.reducedMotion.matches;
      document.querySelector('[data-motion]')?.setAttribute('aria-pressed', String(this.paused));
      const button = document.querySelector('[data-motion]');
      if (button) button.textContent = this.paused ? '↻ Resume motion' : 'Ⅱ Pause motion';
      this.wake();
    });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      document.body.classList.add('no-webgl');
      this.onCycle?.('WEBGL CONTEXT LOST');
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    });
    canvas.addEventListener('webglcontextrestored', () => { document.body.classList.remove('no-webgl'); this.wake(); });
    this.resize();
  }

  start(): void { this.wake(); }
  setReading(reading: boolean): void { this.reading = reading; this.wake(); }
  toggleMotion(): void { this.paused = !this.paused; this.wake(); }
  fracture(): void {
    this.impulse = 1;
    if (this.paused) this.spread = 1;
    this.wake();
  }

  private resize = (): void => {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.wake();
  };

  private move = (event: PointerEvent): void => {
    this.pointer.set(event.clientX / innerWidth - 0.5, event.clientY / innerHeight - 0.5);
  };

  private wake = (): void => {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = performance.now();
    if (!this.reading && this.visible && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  };

  private tick = (now: number): void => {
    this.frame = 0;
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (!this.paused) this.advance(delta);
    this.core.update(this.time, this.spread, this.displayPointer);
    this.onCycle?.(this.paused ? 'STILL / MOTION PAUSED' : this.spread > 0.55 ? 'DECONSTRUCTING' : 'REBUILDING');
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) this.frame = requestAnimationFrame(this.tick);
  };

  private advance(delta: number): void {
    this.time += delta;
    const cycle = (Math.sin(this.time * 0.36) + 1) / 2;
    this.spread = Math.max(Math.pow(cycle, 3) * 0.85, this.impulse);
    this.displayPointer.lerp(this.pointer, 1 - Math.exp(-delta * 3));
    this.impulse *= Math.exp(-delta * 0.9);
  }
}
