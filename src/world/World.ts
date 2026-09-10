import * as THREE from 'three';
import { RebuildCore } from './RebuildCore';
import { RebuildCycle } from './RebuildCycle';

export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly core = new RebuildCore();
  private readonly cycle = new RebuildCycle();
  private readonly rim = new THREE.DirectionalLight(0x98b5c8, 3);
  private readonly ember = new THREE.PointLight(0xff4a16, 20, 12);
  private readonly pointer = new THREE.Vector2();
  private readonly displayPointer = new THREE.Vector2();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private reading = false;
  private visible = true;
  private frame = 0;
  private time = 3;
  private lastTime = 0;
  paused = this.reducedMotion.matches;
  onCycle: ((label: string) => void) | null = null;
  onForm: ((label: string) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.camera.position.set(8, 6, 12);
    this.camera.lookAt(0, 0, 0);
    const key = new THREE.DirectionalLight(0xffead7, 5);
    key.position.set(-3, 8, 6);
    this.rim.position.set(6, 2, -4);
    this.ember.position.set(-2, -1, 3);
    this.scene.add(new THREE.HemisphereLight(0xa6b2bb, 0x151110, 1.6), key, this.rim, this.ember, this.core.group);
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
    this.cycle.fracture(this.paused);
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
    const delta = Math.max(0, Math.min((now - this.lastTime) / 1000, 0.05));
    this.lastTime = now;
    if (!this.paused) this.advance(delta);
    this.core.update(this.time, this.cycle, this.displayPointer);
    this.lightAndFrame();
    this.onCycle?.(this.paused ? 'STILL / MOTION PAUSED' : this.cycle.label);
    this.onForm?.(this.cycle.specimen);
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) this.frame = requestAnimationFrame(this.tick);
  };

  private advance(delta: number): void {
    this.time += delta;
    this.cycle.advance(delta);
    this.displayPointer.lerp(this.pointer, 1 - Math.exp(-delta * 3));
  }

  private lightAndFrame(): void {
    this.ember.intensity = 20 + this.cycle.spread * 32;
    this.ember.position.set(Math.cos(this.time * 0.18) * 3, -0.6 + this.cycle.spread, Math.sin(this.time * 0.18) * 3);
    this.rim.position.set(6 * Math.cos(this.time * 0.09), 3, -4 + Math.sin(this.time * 0.09) * 2);
    // Give the scattered pieces breathing room without changing their size or shape.
    this.camera.position.set(8, 6, 12).multiplyScalar(this.cycle.framing * (1 + this.cycle.spread * 0.18));
  }
}
