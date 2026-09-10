import * as THREE from 'three';

type Fragment = { mesh: THREE.Mesh; home: THREE.Vector3; drift: THREE.Vector3; spin: THREE.Vector3 };

/** A machined, hollow monument: 12 courses × 12 individually cut fragments. */
export class RebuildCore {
  readonly group = new THREE.Group();
  private readonly fragments: Fragment[] = [];
  private readonly assembly = new THREE.Group();

  constructor() {
    const concrete = this.material();
    const dark = new THREE.MeshStandardMaterial({ color: 0x272a28, roughness: 0.64, metalness: 0.65 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff541d, roughness: 0.45, metalness: 0.3, emissive: 0xaa2100, emissiveIntensity: 0.25 });
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
    const home = new THREE.Vector3(Math.cos(angle) * 1.3, (layer - 5.5) * 0.375, Math.sin(angle) * 1.3);
    mesh.position.copy(home);
    mesh.rotation.y = -angle;
    const drift = new THREE.Vector3(Math.cos(angle) * (1 + layer * 0.07), (layer - 5.5) * 0.17, Math.sin(angle) * (1 + layer * 0.07));
    const spin = new THREE.Vector3(Math.sin(layer + segment) * 0.5, -angle, Math.cos(segment * 4) * 0.5);
    this.fragments.push({ mesh, home, drift, spin });
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

  update(time: number, spread: number, pointer: THREE.Vector2): void {
    this.assembly.rotation.y = -0.3 + time * 0.065 + pointer.x * 0.18;
    this.assembly.rotation.x = 0.12 + pointer.y * 0.12;
    for (const { mesh, home, drift, spin } of this.fragments) {
      mesh.position.copy(home).addScaledVector(drift, spread);
      mesh.rotation.set(spin.x * spread, spin.y + spread * 0.3, spin.z * spread);
    }
  }
}
