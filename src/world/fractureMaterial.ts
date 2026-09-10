import * as THREE from 'three';

export type FractureUniforms = { heat: { value: number }; time: { value: number } };

/** Keep standard PBR lighting; reveal a restrained hot edge only during fracture. */
export function fractureMaterial(material: THREE.MeshStandardMaterial, uniforms: FractureUniforms): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFractureHeat = uniforms.heat;
    shader.uniforms.uFractureTime = uniforms.time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFragmentPosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFragmentPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uFractureHeat;
      uniform float uFractureTime;
      varying vec3 vFragmentPosition;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 edgeDistance = abs(vFragmentPosition) / vec3(0.365, 0.205, 0.32);
      float edge = min(max(edgeDistance.x, edgeDistance.y), min(max(edgeDistance.y, edgeDistance.z), max(edgeDistance.z, edgeDistance.x)));
      float hotEdge = smoothstep(0.78, 0.98, edge);
      float grain = 0.78 + 0.22 * sin(vFragmentPosition.y * 31.0 + vFragmentPosition.x * 17.0 - uFractureTime * 1.4);
      totalEmissiveRadiance += vec3(1.0, 0.16, 0.025) * hotEdge * grain * uFractureHeat * 0.7;
    `);
  };
  material.customProgramCacheKey = () => 'workshop-fracture-v1';
  return material;
}
