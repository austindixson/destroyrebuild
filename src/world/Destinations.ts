import * as THREE from 'three';
import { DESTINATIONS, type DestinationId } from '../config';

type Node = {
  id: DestinationId;
  group: THREE.Group;
  plate: THREE.Mesh;
  baseY: number;
};

function plateTexture(index: string, label: string, kicker: string, external: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = external ? '#7a8b96' : '#ff4d1a';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 988, 476);

  ctx.fillStyle = '#ff4d1a';
  ctx.fillRect(48, 56, 120, 6);

  ctx.font = '600 54px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#8a8680';
  ctx.fillText(index, 48, 150);

  ctx.font = '700 120px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#e6e1d6';
  ctx.fillText(label, 48, 280);

  ctx.font = '500 36px "IBM Plex Mono", monospace';
  ctx.fillStyle = external ? '#7a8b96' : '#ffb347';
  ctx.fillText(kicker, 48, 360);

  ctx.font = '500 28px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#6b6a64';
  ctx.fillText(external ? 'PLACEHOLDER LINK' : 'ENTER THE BAY', 48, 430);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const LAYOUT: Record<DestinationId, { position: THREE.Vector3; rotationY: number; scale: number }> = {
  portfolio: { position: new THREE.Vector3(-5.6, 1.85, 1.4), rotationY: 0.55, scale: 1 },
  blog: { position: new THREE.Vector3(0.15, 1.45, 5.7), rotationY: 0, scale: 1 },
  tutorials: { position: new THREE.Vector3(5.6, 1.85, 1.25), rotationY: -0.55, scale: 1 },
  youtube: { position: new THREE.Vector3(-6.9, 0.95, -3.4), rotationY: 0.9, scale: 0.62 },
  patreon: { position: new THREE.Vector3(6.9, 0.95, -3.4), rotationY: -0.9, scale: 0.62 },
};

export class Destinations {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private readonly nodes: Node[] = [];
  private active: DestinationId | null = null;
  private hovered: DestinationId | null = null;

  constructor() {
    for (const dest of DESTINATIONS) {
      const layout = LAYOUT[dest.id];
      const texture = plateTexture(dest.index, dest.label, dest.kicker, dest.kind === 'external');
      const geo = new THREE.BoxGeometry(3.3, 1.65, 0.12);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.42,
        metalness: 0.55,
        emissive: new THREE.Color(dest.kind === 'external' ? 0x101318 : 0x1a0c08),
        emissiveIntensity: 0.35,
      });
      const plate = new THREE.Mesh(geo, mat);
      plate.userData.id = dest.id;

      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(3.38, 1.73, 0.04),
        new THREE.MeshBasicMaterial({
          color: dest.kind === 'external' ? 0x7a8b96 : 0xff4d1a,
          transparent: true,
          opacity: 0.22,
        }),
      );
      rim.position.z = -0.08;

      const group = new THREE.Group();
      group.position.copy(layout.position);
      group.rotation.y = layout.rotationY;
      group.scale.setScalar(layout.scale);
      group.add(plate, rim);
      group.userData.id = dest.id;

      this.group.add(group);
      this.pickables.push(plate);
      this.nodes.push({ id: dest.id, group, plate, baseY: layout.position.y });
    }
  }

  refreshLabels(): void {
    for (const dest of DESTINATIONS) {
      const node = this.nodes.find((item) => item.id === dest.id);
      if (!node) continue;
      const mat = node.plate.material as THREE.MeshStandardMaterial;
      const prev = mat.map;
      mat.map = plateTexture(dest.index, dest.label, dest.kicker, dest.kind === 'external');
      mat.needsUpdate = true;
      prev?.dispose();
    }
  }

  setHovered(id: DestinationId | null): void {
    this.hovered = id;
  }

  setActive(id: DestinationId | null): void {
    this.active = id;
  }

  update(time: number): void {
    for (const node of this.nodes) {
      const hot = this.hovered === node.id || this.active === node.id;
      const bob = Math.sin(time * 0.7 + node.baseY) * 0.06;
      const lift = hot ? 0.16 : 0;
      node.group.position.y = node.baseY + bob + lift;

      const mat = node.plate.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = hot ? 0.85 : 0.32;
    }
  }

  idFromObject(object: THREE.Object3D): DestinationId | null {
    const id = object.userData.id as DestinationId | undefined;
    return id ?? null;
  }
}
