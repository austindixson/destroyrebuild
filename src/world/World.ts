import * as THREE from 'three';
import { COLORS, CYCLE_SECONDS, type DestinationId } from '../config';
import { cycleState } from '../math';
import { Atmosphere } from './Atmosphere';
import { Destinations } from './Destinations';
import { RebuildCore } from './RebuildCore';

export type CycleHud = {
  label: string;
  phase: number;
};

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly core: RebuildCore;
  readonly destinations: Destinations;
  readonly atmosphere: Atmosphere;

  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-10, -10);
  private readonly camHome = new THREE.Vector3(1.1, 4.4, 12.8);
  private readonly lookHome = new THREE.Vector3(0, 2.15, 0);
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly camPosTarget = new THREE.Vector3();
  private readonly camLookTarget = new THREE.Vector3();
  private readonly parallax = new THREE.Vector2();
  private readonly focus: Record<DestinationId, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
    portfolio: { pos: new THREE.Vector3(-1.8, 3.4, 8.4), look: new THREE.Vector3(-3.6, 1.8, 1.2) },
    blog: { pos: new THREE.Vector3(2.8, 3.2, 9.4), look: new THREE.Vector3(0.1, 1.6, 4.2) },
    tutorials: { pos: new THREE.Vector3(1.6, 3.4, 8.4), look: new THREE.Vector3(3.8, 1.8, 1.1) },
    youtube: { pos: new THREE.Vector3(-2.4, 2.8, 7.2), look: new THREE.Vector3(-5.4, 1.1, -2.2) },
    patreon: { pos: new THREE.Vector3(2.4, 2.8, 7.2), look: new THREE.Vector3(5.4, 1.1, -2.2) },
  };

  private running = false;
  private reading = false;
  lastCycle: CycleHud = { label: 'HOLD', phase: 0 };
  onPick: ((id: DestinationId) => void) | null = null;
  onCycle: ((cycle: CycleHud) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(COLORS.void, 1);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 80);
    this.camPos.copy(this.camHome);
    this.camLook.copy(this.lookHome);
    this.camPosTarget.copy(this.camHome);
    this.camLookTarget.copy(this.lookHome);
    this.camera.position.copy(this.camHome);
    this.camera.lookAt(this.lookHome);

    this.scene.fog = new THREE.FogExp2(COLORS.void, 0.028);
    this.scene.background = new THREE.Color(COLORS.void);

    const hemi = new THREE.HemisphereLight(0x8a9aaa, 0x1a100c, 0.7);
    const key = new THREE.DirectionalLight(0xf2ebe0, 1.15);
    key.position.set(6, 10, 4);
    const fill = new THREE.DirectionalLight(0x4a2a1c, 0.35);
    fill.position.set(-8, 2, -4);
    this.scene.add(hemi, key, fill);

    this.core = new RebuildCore();
    this.destinations = new Destinations();
    this.atmosphere = new Atmosphere();
    this.scene.add(this.core.group, this.destinations.group, this.atmosphere.group);
    void document.fonts?.ready.then(() => this.destinations.refreshLabels());

    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('click', this.onClick);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  setReading(id: DestinationId | null): void {
    this.reading = id !== null;
    this.destinations.setActive(id);
    if (id) {
      const focus = this.focus[id];
      this.camPosTarget.copy(focus.pos);
      this.camLookTarget.copy(focus.look);
    } else {
      this.camPosTarget.copy(this.camHome);
      this.camLookTarget.copy(this.lookHome);
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);

    const time = this.clock.getElapsedTime();
    const cycle = cycleState(time, CYCLE_SECONDS);
    this.lastCycle = { label: cycle.label, phase: cycle.phase };
    this.onCycle?.(this.lastCycle);

    this.core.update(time, cycle.crack, cycle.explode, cycle.weld);
    this.atmosphere.update(time, cycle.crack, cycle.explode, cycle.weld);
    this.destinations.update(time);

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.destinations.pickables, false);
    const hoverId = hits[0] ? this.destinations.idFromObject(hits[0].object) : null;
    this.destinations.setHovered(hoverId);
    this.renderer.domElement.style.cursor = hoverId ? 'pointer' : 'default';

    const idleOrbit = this.reading ? 0.04 : 0.12;
    const ox = Math.sin(time * 0.12) * idleOrbit + this.parallax.x;
    const oy = Math.cos(time * 0.09) * 0.08 + this.parallax.y;

    this.camPos.lerp(this.camPosTarget, 0.045);
    this.camLook.lerp(this.camLookTarget, 0.05);
    this.camera.position.set(this.camPos.x + ox, this.camPos.y + oy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.parallax.set((event.clientX / window.innerWidth - 0.5) * 0.7, (event.clientY / window.innerHeight - 0.5) * -0.4);
  };

  private onPointerLeave = (): void => {
    this.pointer.set(-10, -10);
    this.parallax.set(0, 0);
  };

  private onClick = (): void => {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.destinations.pickables, false);
    const id = hits[0] ? this.destinations.idFromObject(hits[0].object) : null;
    if (id) this.onPick?.(id);
  };
}
