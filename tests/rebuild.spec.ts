import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { RebuildCycle } from '../src/world/RebuildCycle';
import { RebuildCore } from '../src/world/RebuildCore';
import { FORM_NAMES, FRAGMENT_COUNT, fragmentForms } from '../src/world/forms';

test('each rebuild lands on a distinct form and loops without a position or rotation jump', () => {
  const cycle = new RebuildCycle();
  const core = new RebuildCore();
  const pointer = new THREE.Vector2();
  const meshes = core.group.children[0].children as THREE.Mesh[];
  expect(meshes).toHaveLength(FRAGMENT_COUNT);
  for (let form = 0; form < FORM_NAMES.length; form++) {
    expect(cycle.source).toBe(form);
    cycle.advance(5.5);
    expect(cycle.spread).toBe(1);
    cycle.advance(5);
    expect(cycle.spread).toBe(0);
    expect(cycle.blend).toBe(1);
    core.update(0, cycle, pointer);
    const assembled = meshes.map((mesh) => ({ position: mesh.position.clone(), rotation: mesh.quaternion.clone() }));
    meshes.forEach((mesh, index) => {
      const destination = fragmentForms(index)[cycle.target];
      expect(mesh.position.distanceTo(destination.position)).toBeLessThan(1e-8);
      expect(mesh.quaternion.angleTo(destination.rotation)).toBeLessThan(1e-6);
      expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    });
    cycle.advance(3.5);
    core.update(0, cycle, pointer);
    meshes.forEach((mesh, index) => {
      expect(mesh.position.distanceTo(assembled[index].position)).toBeLessThan(1e-8);
      expect(mesh.quaternion.angleTo(assembled[index].rotation)).toBeLessThan(1e-6);
    });
  }
  expect(cycle.source).toBe(0);
  for (let form = 0; form < FORM_NAMES.length; form++) {
    const totalTravel = Array.from({ length: FRAGMENT_COUNT }, (_, index) => {
      const poses = fragmentForms(index);
      return poses[form].position.distanceTo(poses[(form + 1) % FORM_NAMES.length].position);
    }).reduce((sum, distance) => sum + distance, 0);
    expect(totalTravel / FRAGMENT_COUNT).toBeGreaterThan(1);
  }
});

test('manual fracture advances a settled form and repeated clicks do not interrupt reassembly', () => {
  const cycle = new RebuildCycle();
  cycle.fracture(false);
  expect(cycle.label).toBe('DECONSTRUCTING');
  cycle.advance(5);
  const blend = cycle.blend;
  cycle.fracture(false);
  expect(cycle.blend).toBe(blend);
  expect(cycle.label).toBe('REBUILDING');
  cycle.advance(3);
  cycle.fracture(false);
  expect(cycle.source).toBe(1);
  expect(cycle.label).toBe('DECONSTRUCTING');
});

test('paused interaction switches to the next completed form without animation', () => {
  const cycle = new RebuildCycle();
  for (const name of ['ORBIT', 'MÖBIUS', 'MONUMENT']) {
    cycle.fracture(true);
    expect(cycle.specimen).toBe(name);
    expect(cycle.spread).toBe(0);
    expect(cycle.blend).toBe(0);
  }
});

test('paused browser can explore all forms without WebGL shader errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-form]')).toHaveText('MONUMENT');
  for (const name of ['ORBIT', 'MÖBIUS', 'MONUMENT']) {
    await page.locator('[data-fracture]').click();
    await expect(page.locator('[data-form]')).toHaveText(name);
    await expect(page.locator('[data-cycle]')).toHaveText('STILL / MOTION PAUSED');
  }
  expect(errors).toEqual([]);
});
