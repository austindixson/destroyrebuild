import * as THREE from 'three';
import { COLORS } from '../config';
import { hash3 } from '../math';
import { coreFragment, coreVertex } from './shaders';

type Voxel = {
  x: number;
  y: number;
  z: number;
  kind: number;
};

function carveVoxels(): Voxel[] {
  const voxels: Voxel[] = [];
  const w = 7;
  const d = 7;
  const h = 12;

  for (let y = 0; y < h; y++) {
    for (let x = -w; x <= w; x++) {
      for (let z = -d; z <= d; z++) {
        const ax = Math.abs(x);
        const az = Math.abs(z);
        const onCorner = ax >= w - 1 && az >= d - 1;
        const onRing = y % 3 === 0 && (ax === w || az === d);
        const onColumn = (ax === w && az <= 1) || (az === d && ax <= 1) || onCorner;
        const cap = y === 0 || y === h - 1;
        const scaffold = onColumn || onRing || (cap && (ax === w || az === d || onCorner));

        const cx = x / w;
        const cz = z / d;
        const radial = Math.sqrt(cx * cx + cz * cz);
        const n = hash3(x + 3, y + 11, z + 7);
        const inner =
          radial < 0.62 &&
          y > 1 &&
          y < h - 2 &&
          n > 0.28 &&
          !(ax <= 1 && az <= 1 && y > 3 && y < h - 4 && n < 0.72);

        if (scaffold) {
          voxels.push({ x, y, z, kind: 1 });
        } else if (inner) {
          voxels.push({ x, y, z, kind: 0 });
        }
      }
    }
  }

  return voxels;
}

export class RebuildCore {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  readonly count: number;

  constructor() {
    const voxels = carveVoxels();
    this.count = voxels.length;

    const geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const burst = new Float32Array(this.count * 3);
    const seed = new Float32Array(this.count);
    const kind = new Float32Array(this.count);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCrack: { value: 0.1 },
        uExplode: { value: 0 },
        uWeld: { value: 0 },
        uSteel: { value: new THREE.Color(COLORS.steel) },
        uEmber: { value: new THREE.Color(COLORS.ember) },
        uWeldColor: { value: new THREE.Color(COLORS.weld) },
        uLightDir: { value: new THREE.Vector3(0.42, 0.86, 0.28).normalize() },
      },
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, this.count);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const gap = 0.5;
    const yLift = 0.35;

    voxels.forEach((vox, i) => {
      dummy.position.set(vox.x * gap, vox.y * gap + yLift, vox.z * gap);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(vox.kind > 0.5 ? 0.72 : 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);

      const dir = new THREE.Vector3(
        vox.x + (hash3(i, 1, 2) - 0.5) * 2.4,
        vox.y * 0.35 + hash3(i, 3, 4) * 6.5 + 1.2,
        vox.z + (hash3(i, 5, 6) - 0.5) * 2.4,
      );
      if (dir.lengthSq() < 0.001) dir.set(0.2, 1.4, -0.1);
      dir.normalize().multiplyScalar(3.4 + hash3(i, 7, 8) * 4.8);
      if (vox.kind > 0.5) dir.multiplyScalar(0.28);

      burst[i * 3] = dir.x;
      burst[i * 3 + 1] = dir.y;
      burst[i * 3 + 2] = dir.z;
      seed[i] = hash3(i, vox.x, vox.z);
      kind[i] = vox.kind;
    });

    this.mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aBurst', new THREE.InstancedBufferAttribute(burst, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));

    this.group.add(this.mesh);
  }

  update(time: number, crack: number, explode: number, weld: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCrack.value = crack;
    this.material.uniforms.uExplode.value = explode;
    this.material.uniforms.uWeld.value = weld;
  }
}
