export const coreVertex = /* glsl */ `
attribute vec3 aBurst;
attribute float aSeed;
attribute float aKind;

uniform float uExplode;
uniform float uWeld;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vKind;
varying float vExplode;

void main() {
  vSeed = aSeed;
  vKind = aKind;

  float delay = aKind > 0.5 ? aSeed * 0.12 : aSeed * 0.28;
  float local = smoothstep(delay, delay + 0.55, uExplode);
  vExplode = local;

  float angle = local * (2.2 + aSeed * 3.8);
  float cs = cos(angle);
  float sn = sin(angle);
  mat3 tumble = mat3(
    cs, 0.0, sn,
    0.0, 1.0, 0.0,
    -sn, 0.0, cs
  );

  vec3 transformed = tumble * position;
  float swell = 1.0 + local * 0.18 + uWeld * 0.06;
  transformed *= swell;

  vec4 world = instanceMatrix * vec4(transformed, 1.0);
  world.xyz += aBurst * local;

  vWorld = world.xyz;
  vNormal = normalize(mat3(instanceMatrix) * tumble * normal);

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const coreFragment = /* glsl */ `
uniform float uCrack;
uniform float uWeld;
uniform float uTime;
uniform vec3 uSteel;
uniform vec3 uEmber;
uniform vec3 uWeldColor;
uniform vec3 uLightDir;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vKind;
varying float vExplode;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

void main() {
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
  float rim = pow(1.0 - abs(dot(n, vec3(0.0, 0.35, 0.94))), 2.2);

  float cracks = noise(vWorld * 0.55 + vec3(0.0, uTime * 0.08, 0.0));
  float crackMask = smoothstep(0.58, 0.78, cracks) * uCrack;
  crackMask *= mix(1.0, 0.45, vKind);

  vec3 steel = mix(uSteel * 0.55, uSteel * 1.25, lambert);
  if (vKind > 0.5) {
    steel *= 0.72;
  }

  vec3 col = steel;
  col += uEmber * crackMask * (1.1 + 0.4 * sin(uTime * 8.0 + vSeed * 20.0));
  col += uWeldColor * uWeld * (0.55 + rim);
  col += vec3(0.55, 0.22, 0.08) * vExplode * 0.35;
  col += vec3(0.12, 0.14, 0.16) * rim;

  float alpha = 1.0;
  gl_FragColor = vec4(col, alpha);
}
`;

export const sparkVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uExplode;
uniform float uSize;

void main() {
  vec3 p = position;
  float t = uTime * (0.25 + aSeed * 0.6) + aSeed * 12.0;
  p.x += sin(t) * (0.18 + aSeed * 0.3);
  p.y += cos(t * 0.7) * 0.22 + uExplode * (1.4 + aSeed * 2.4);
  p.z += sin(t * 0.55) * 0.16;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (140.0 / -mv.z) * (0.6 + aSeed);
  gl_Position = projectionMatrix * mv;
}
`;

export const sparkFragment = /* glsl */ `
uniform vec3 uEmber;
uniform vec3 uWeld;
uniform float uWeldFlash;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float glow = exp(-d * 3.2);
  vec3 col = mix(uEmber, uWeld, uWeldFlash);
  gl_FragColor = vec4(col * glow, glow);
}
`;

export const groundVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const groundFragment = /* glsl */ `
uniform float uTime;
uniform float uCrack;
uniform float uWeld;
uniform vec3 uEmber;

varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec2 p = vWorld.xz;
  float dist = length(p);

  float g1 = abs(fract(p.x * 0.25) - 0.5);
  float g2 = abs(fract(p.z * 0.25) - 0.5);
  float grid = 1.0 - smoothstep(0.02, 0.045, min(g1, g2));

  float ring = abs(dist - (4.2 + uCrack * 1.8));
  float scar = 1.0 - smoothstep(0.04, 0.28, ring);

  float fade = 1.0 - smoothstep(8.0, 28.0, dist);
  vec3 col = vec3(0.07, 0.08, 0.09) * fade;
  col += vec3(0.18, 0.2, 0.22) * grid * fade * 0.45;
  col += uEmber * scar * (0.25 + uCrack * 0.55 + uWeld * 0.7);
  col += uEmber * (0.03 + 0.02 * sin(uTime * 2.0)) * fade * (1.0 - smoothstep(0.0, 6.0, dist));

  float alpha = fade * 0.92;
  gl_FragColor = vec4(col, alpha);
}
`;
