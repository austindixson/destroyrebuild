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

type Bounds = {
  w: number;
  d: number;
  h: number;
};

const TOWER: Bounds = { w: 7, d: 7, h: 12 };

function isCorner(ax: number, az: number, bounds: Bounds): boolean {
  return ax >= bounds.w - 1 && az >= bounds.d - 1;
}

function isRing(y: number, ax: number, az: number, bounds: Bounds): boolean {
  if (y % 3 !== 0) return false;
  return ax === bounds.w || az === bounds.d;
}

function isColumn(ax: number, az: number, bounds: Bounds): boolean {
  if (ax === bounds.w && az <= 1) return true;
  if (az === bounds.d && ax <= 1) return true;
  return isCorner(ax, az, bounds);
}

function isCap(y: number, bounds: Bounds): boolean {
  return y === 0 || y === bounds.h - 1;
}

function isScaffold(x: number, y: number, z: number, bounds: Bounds): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (isColumn(ax, az, bounds)) return true;
  if (isRing(y, ax, az, bounds)) return true;
  if (!isCap(y, bounds)) return false;
  if (ax === bounds.w) return true;
  if (az === bounds.d) return true;
  return isCorner(ax, az, bounds);
}

function isHollowCore(ax: number, az: number, y: number, n: number, bounds: Bounds): boolean {
  if (ax > 1 || az > 1) return false;
  if (y <= 3 || y >= bounds.h - 4) return false;
  return n < 0.72;
}

function isInner(x: number, y: number, z: number, bounds: Bounds): boolean {
  const radial = Math.hypot(x / bounds.w, z / bounds.d);
  if (radial >= 0.62) return false;
  if (y <= 1 || y >= bounds.h - 2) return false;
  const n = hash3(x + 3, y + 11, z + 7);
  if (n <= 0.28) return false;
  return !isHollowCore(Math.abs(x), Math.abs(z), y, n, bounds);
}

function voxelAt(x: number, y: number, z: number, bounds: Bounds): Voxel | null {
  if (isScaffold(x, y, z, bounds)) return { x, y, z, kind: 1 };
  if (isInner(x, y, z, bounds)) return { x, y, z, kind: 0 };
  return null;
}

function burstDirection(vox: Voxel, index: number): THREE.Vector3 {
  const dir = new THREE.Vector3(
    vox.x + (hash3(index, 1, 2) - 0.5) * 2.4,
    vox.y * 0.35 + hash3(index, 3, 4) * 6.5 + 1.2,
    vox.z + (hash3(index, 5, 6) - 0.5) * 2.4,
  );
  if (dir.lengthSq() < 0.001) dir.set(0.2, 1.4, -0.1);
  dir.normalize().multiplyScalar(3.4 + hash3(index, 7, 8) * 4.8);
  if (vox.kind > 0.5) dir.multiplyScalar(0.28);
  return dir;
}

function plantInstance(
  mesh: THREE.InstancedMesh,
  dummy: THREE.Object3D,
  vox: Voxel,
  index: number,
  burst: Float32Array,
  seed: Float32Array,
  kind: Float32Array,
): void {
  dummy.position.set(vox.x * 0.5, vox.y * 0.5 + 0.35, vox.z * 0.5);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(vox.kind > 0.5 ? 0.72 : 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);

  const dir = burstDirection(vox, index);
  burst[index * 3] = dir.x;
  burst[index * 3 + 1] = dir.y;
  burst[index * 3 + 2] = dir.z;
  seed[index] = hash3(index, vox.x, vox.z);
  kind[index] = vox.kind;
}

function carveVoxels(): Voxel[] {
  const voxels: Voxel[] = [];
  const { w, d, h } = TOWER;
  for (let y = 0; y < h; y++) {
    for (let x = -w; x <= w; x++) {
      for (let z = -d; z <= d; z++) {
        const voxel = voxelAt(x, y, z, TOWER);
        if (voxel) voxels.push(voxel);
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
    voxels.forEach((vox, i) => {
      plantInstance(this.mesh, dummy, vox, i, burst, seed, kind);
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
