---
title: Make a structure that remembers its shape
date: 2026-09-09
video: PLACEHOLDER_YOUTUBE_URL
duration: 6 min
level: field guide / intermediate
---

A reconstruction animation is easier to reason about when every piece remembers where it belongs. Don’t integrate velocities and hope the fragments settle back into place. Give each one a home position and a direction of travel.

This guide describes the technique used in the workshop’s homepage sculpture. It assumes a Three.js scene, camera, renderer, and animation loop are already running.

## 01 / Store the home position

Arrange fragments around a hollow cylinder. A course is one horizontal ring; stacking courses produces the monument.

```ts
const angle = segment / 12 * Math.PI * 2;
const home = new THREE.Vector3(
  Math.cos(angle) * 1.3,
  (layer - 5.5) * 0.375,
  Math.sin(angle) * 1.3,
);
```

Keep `home` separate from the mesh’s mutable position. Otherwise, each frame starts from the result of the previous frame and small errors accumulate.

## 02 / Give the piece a direction

The horizontal direction points out from the center. The vertical component spreads the top and bottom courses apart.

```ts
const drift = new THREE.Vector3(
  Math.cos(angle) * (1 + layer * 0.07),
  (layer - 5.5) * 0.17,
  Math.sin(angle) * (1 + layer * 0.07),
);

mesh.position.copy(home).addScaledVector(drift, spread);
```

When `spread` is zero, the structure is intact. At one, it is fully separated. The same formula works going forward and backward, without a physics reset.

## 03 / Shape the rhythm

A raw sine wave spends equal time opening and closing. Raising its normalized value to a power gives the assembled shape more time to breathe.

```ts
const cycle = (Math.sin(time * 0.36) + 1) / 2;
const spread = Math.pow(cycle, 3) * 0.85;
```

Use the same spread value for small local rotations. Position and rotation then tell the same story, instead of looking like unrelated idle animations.

## 04 / Make motion optional

Read `prefers-reduced-motion` before starting the loop. Offer a visible pause control, and render a single composed frame when paused. Stop scheduling frames when the canvas is offscreen, the document is hidden, or a reading page is open.

These are three different states: a visitor choosing stillness, a browser tab becoming hidden, and an artwork moving out of view. Keep them separate so returning to the page doesn’t override the visitor’s choice.

## Try it

Change the vertical drift so the upper courses separate first. Then reverse it. Keep the home positions unchanged. Notice how much the same geometry can say with a different order of movement.

The full implementation lives in `src/world/RebuildCore.ts`; lifecycle and motion controls live in `src/world/World.ts`.
