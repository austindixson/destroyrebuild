export function clamp(v: number, a = 0, b = 1): number {
  return Math.min(b, Math.max(a, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export type CycleState = {
  phase: number;
  crack: number;
  explode: number;
  weld: number;
  label: string;
};

export function cycleState(elapsed: number, duration: number): CycleState {
  const phase = (elapsed % duration) / duration;
  let crack = 0.08;
  let explode = 0;
  let weld = 0;
  let label = 'HOLD';

  if (phase < 0.16) {
    crack = 0.08 + phase * 0.4;
    label = 'HOLD';
  } else if (phase < 0.3) {
    const t = smoothstep(0.16, 0.3, phase);
    crack = lerp(0.14, 1, t);
    label = 'CRACK';
  } else if (phase < 0.46) {
    crack = 1;
    explode = smoothstep(0.3, 0.46, phase);
    label = 'BREAK';
  } else if (phase < 0.6) {
    crack = 1;
    explode = 1;
    label = 'DRIFT';
  } else if (phase < 0.86) {
    const t = smoothstep(0.6, 0.86, phase);
    explode = 1 - t;
    crack = lerp(1, 0.2, t);
    label = 'REBUILD';
  } else if (phase < 0.94) {
    const t = smoothstep(0.86, 0.94, phase);
    weld = Math.sin(t * Math.PI);
    crack = 0.12;
    label = 'WELD';
  } else {
    crack = 0.08;
    label = 'HOLD';
  }

  return { phase, crack, explode, weld, label };
}
