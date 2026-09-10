import * as THREE from 'three';

export type Pose = { position: THREE.Vector3; rotation: THREE.Quaternion };
export const FORM_NAMES = ['MONUMENT', 'ORBIT', 'MÖBIUS'] as const;
export const FORM_FRAMING = [1, 1, 1.4] as const;
export const FRAGMENT_COUNT = 144;
const turn = Math.PI * 2;

function pose(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Pose {
  return {
    position: new THREE.Vector3(x, y, z),
    rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
  };
}

function mobius(index: number): Pose {
  // Twenty-four stations, three across and two deep. The symmetric section
  // joins itself after a half twist: both width and depth reverse at the seam.
  const u = Math.floor(index / 6) / 24 * turn;
  const width = (index % 3 - 1) * 0.69;
  const depth = (Math.floor(index / 3) % 2 - 0.5) * 0.41;
  const radial = new THREE.Vector3(Math.cos(u), Math.sin(u), 0);
  const around = new THREE.Vector3(-Math.sin(u), Math.cos(u), 0);
  const across = radial.clone().multiplyScalar(Math.cos(u / 2));
  across.z = Math.sin(u / 2);
  const tangent = around.multiplyScalar(3.5 + width * Math.cos(u / 2))
    .addScaledVector(radial, -width * 0.5 * Math.sin(u / 2));
  tangent.z = width * 0.5 * Math.cos(u / 2);
  tangent.normalize();
  const normal = new THREE.Vector3().crossVectors(across, tangent).normalize();
  across.crossVectors(tangent, normal).normalize();
  return {
    position: radial.multiplyScalar(3.5).addScaledVector(across, width).addScaledVector(normal, depth),
    rotation: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, normal, across)),
  };
}

/** Every form is built from the same 144 unscaled pieces. */
export function fragmentForms(index: number): Pose[] {
  const layer = Math.floor(index / 12);
  const segment = index % 12;
  const angle = segment / 12 * turn;
  const monument = pose(Math.cos(angle) * 1.3, (layer - 5.5) * 0.375, Math.sin(angle) * 1.3, 0, -angle);

  // A toroidal machine: twelve ribs, each with twelve pieces around its tube.
  const tube = layer / 12 * turn;
  const radius = 1.65 + Math.cos(tube) * 0.68;
  const orbit = pose(Math.cos(angle) * radius, Math.sin(tube) * 0.68, Math.sin(angle) * radius, 0, -angle, tube);

  return [monument, orbit, mobius(index)];
}
