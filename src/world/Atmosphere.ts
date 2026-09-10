import * as THREE from 'three';
import { COLORS } from '../config';
import { hash3 } from '../math';
import { groundFragment, groundVertex, sparkFragment, sparkVertex } from './shaders';

export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly sparks: THREE.Points;
  private readonly sparkMat: THREE.ShaderMaterial;
  private readonly groundMat: THREE.ShaderMaterial;
  private readonly brandMat: THREE.MeshBasicMaterial;
  readonly coreLight: THREE.PointLight;

  constructor() {
    this.groundMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCrack: { value: 0 },
        uWeld: { value: 0 },
        uEmber: { value: new THREE.Color(COLORS.ember) },
      },
      vertexShader: groundVertex,
      fragmentShader: groundFragment,
      transparent: true,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    const brand = makeBrandTexture();
    this.brandMat = new THREE.MeshBasicMaterial({
      map: brand,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.1), this.brandMat);
    stamp.rotation.x = -Math.PI / 2;
    stamp.position.y = 0.02;
    this.group.add(stamp);

    const count = 420;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = hash3(i, 1, 2) * Math.PI * 2;
      const r = 1.2 + hash3(i, 3, 4) * 7.5;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.3 + hash3(i, 5, 6) * 6.8;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i] = hash3(i, 7, 8);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uExplode: { value: 0 },
        uSize: { value: 1 },
        uEmber: { value: new THREE.Color(COLORS.ember) },
        uWeld: { value: new THREE.Color(COLORS.weld) },
        uWeldFlash: { value: 0 },
      },
      vertexShader: sparkVertex,
      fragmentShader: sparkFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Points(sparkGeo, this.sparkMat);
    this.group.add(this.sparks);

    this.coreLight = new THREE.PointLight(COLORS.ember, 4, 16, 2);
    this.coreLight.position.set(0, 2.6, 0);
    this.group.add(this.coreLight);
  }

  update(time: number, crack: number, explode: number, weld: number): void {
    this.groundMat.uniforms.uTime.value = time;
    this.groundMat.uniforms.uCrack.value = crack;
    this.groundMat.uniforms.uWeld.value = weld;
    this.sparkMat.uniforms.uTime.value = time;
    this.sparkMat.uniforms.uExplode.value = explode;
    this.sparkMat.uniforms.uWeldFlash.value = weld;
    this.coreLight.intensity = 2.2 + crack * 3.4 + weld * 8;
    this.coreLight.color.set(weld > 0.2 ? COLORS.weld : COLORS.ember);
    this.brandMat.opacity = 0.45 + weld * 0.4 + (1 - explode) * 0.2;
  }
}

function makeBrandTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 2048, 420);
    ctx.font = '700 210px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#e6e1d6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DESTROY  /  REBUILD', 1024, 210);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
