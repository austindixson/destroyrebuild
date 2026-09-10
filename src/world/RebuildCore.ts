import * as THREE from 'three';
import { fragmentForms, type Pose } from './forms';
import { fractureMaterial, type FractureUniforms } from './fractureMaterial';
import type { RebuildCycle } from './RebuildCycle';

type Fragment = { mesh: THREE.Mesh; forms: Pose[]; drift: THREE.Vector3; tumble: THREE.Quaternion };

/** A machined, hollow monument: 12 courses × 12 individually cut fragments. */
export class RebuildCore {
  readonly group = new THREE.Group();
  private readonly fragments: Fragment[] = [];
  private readonly assembly = new THREE.Group();
  private readonly heat: FractureUniforms = { heat: { value: 0 }, time: { value: 0 } };
  private readonly rotation = new THREE.Quaternion();
  private readonly identity = new THREE.Quaternion();

  constructor() {
    const concrete = fractureMaterial(this.material(), this.heat);
    const dark = fractureMaterial(new THREE.MeshStandardMaterial({ color: 0x272a28, roughness: 0.64, metalness: 0.65 }), this.heat);
    const orange = fractureMaterial(new THREE.MeshStandardMaterial({ color: 0xff541d, roughness: 0.45, metalness: 0.3, emissive: 0xaa2100, emissiveIntensity: 0.25 }), this.heat);
    for (let layer = 0; layer < 12; layer++) {
      for (let segment = 0; segment < 12; segment++) {
        this.addFragment(layer, segment, layer === 7 ? orange : segment % 5 === 0 ? dark : concrete);
      }
    }
    this.group.add(this.assembly);
    this.addGuides();
    this.assembly.rotation.set(0.12, -0.3, -0.16);
  }

  private material(): THREE.MeshStandardMaterial {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const noise = Math.sin(i * 127.1) * 43758.5453;
      const shade = 125 + Math.floor((noise - Math.floor(noise)) * 65);
      data.set([shade, shade, shade, 255], i * 4);
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.needsUpdate = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ color: 0xb7b4a9, map: texture, bumpMap: texture, bumpScale: 0.045, roughness: 0.84, metalness: 0.22 });
  }

  private addFragment(layer: number, segment: number, material: THREE.Material): void {
    const angle = segment / 12 * Math.PI * 2;
    const geometry = new THREE.BoxGeometry(0.66, 0.34, 0.64, 1, 1, 1);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      vertices.setXYZ(i, x + Math.sin(y * 20 + layer) * 0.035, y + Math.sin(x * 9 + z * 8 + segment) * 0.035, z);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    const forms = fragmentForms(layer * 12 + segment);
    mesh.position.copy(forms[0].position);
    mesh.quaternion.copy(forms[0].rotation);
    const drift = new THREE.Vector3(Math.cos(angle + layer * 0.45) * 1.8, (layer - 5.5) * 0.23, Math.sin(angle + layer * 0.45) * 1.8);
    const tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(layer + segment) * 1.4, Math.cos(layer * 3 + segment) * 1.2, Math.cos(segment * 4) * 1.4));
    this.fragments.push({ mesh, forms, drift, tumble });
    this.assembly.add(mesh);
  }

  private addGuides(): void {
    const material = new THREE.LineBasicMaterial({ color: 0x6c756c, transparent: true, opacity: 0.23 });
    for (const radius of [2.8, 3.1]) {
      const points = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * radius, -3, Math.sin(i / 128 * Math.PI * 2) * radius));
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    const grid = new THREE.GridHelper(10, 20, 0x414840, 0x272d29);
    grid.position.y = -3.05;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.3;
    this.group.add(grid);
    const axis = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -3.5, 0), new THREE.Vector3(0, 3.5, 0)]);
    this.group.add(new THREE.Line(axis, new THREE.LineDashedMaterial({ color: 0xfe5624, dashSize: 0.08, gapSize: 0.12, transparent: true, opacity: 0.45 })).computeLineDistances());
  }

  update(time: number, cycle: RebuildCycle, pointer: THREE.Vector2): void {
    const { source, target, blend, spread } = cycle;
    this.heat.heat.value = spread;
    this.heat.time.value = time;
    this.assembly.rotation.y = -0.3 + time * 0.065 + pointer.x * 0.18;
    this.assembly.rotation.x = 0.12 + pointer.y * 0.12;
    for (const { mesh, forms, drift, tumble } of this.fragments) {
      mesh.position.lerpVectors(forms[source].position, forms[target].position, blend).addScaledVector(drift, spread);
      mesh.quaternion.slerpQuaternions(forms[source].rotation, forms[target].rotation, blend);
      this.rotation.slerpQuaternions(this.identity, tumble, spread);
      mesh.quaternion.multiply(this.rotation);
    }
  }
}
