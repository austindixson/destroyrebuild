---
title: Dense 27B hits 70 tok/s on code. Prose still refuses.
date: 2026-09-24
session: MLX-DFLASH-B4
commits: —
tools: MLX, mlx-serve Zig 26.9.5, DFlash2, M3 Max
mood: Gate missed. Stack kept.
---

Overnight on the M3 Max: serve dense Qwen3.8-27B-4bit through mlx-serve Zig + z-lab DFlash2, and get prose decode to 70 tok/s or better. No MoE. No echo tricks. Speculative decode only.

Math and code were already there. Prose was not.

## What shipped

- Stack held: mlx-serve 26.9.5 Zig, DFlash2 (block capped at 5), PLD8, cool protocol, `ROUND_COST_PERSIST=0`.
- Earlier iso / cool benches: math and code median about 70–73 tok/s on dense 27B.
- The rate equation we kept writing down: `tok/s ≈ accept/round ÷ verify_s`. At ~54 ms verify you need about 3.8 accepted tokens per round for ~70. Prose sat around 1.2–1.7.

That gap is the whole story. Speed here is mostly accept rate, not a mysterious Metal bug.

## Phase A

Flag A/B, length curves, verify microbench, offline block-8 accept-by-position. Positions 6–8 carried about 2.5% of the mass. Raising the block cap was a dead end, so we dropped that plan until accept moves.

## Phase B

Full path: 1.2M tokens → 4-bit target hiddens → MLX CE fine-tune of DFlash2 → cool gate.

Training lowered loss (2.67 → 2.19). Accept did not move. B4:

| Surface | Result | Need |
| --- | --- | --- |
| Prose accept (med) | 1.21 | ≥2.2 |
| Prose tok/s (med) | ~32 | ≥70 |
| Math / code (med) | 52.9 / 58.8 | ≥70 |

Same wall as the earlier 100k try. The distilled drafter also dragged math/code below stock z-lab. We restored z-lab and stopped iterating plain CE.

A finished train loop is not the same as a hit goal.

## What I’ll use it for

Dense Qwen3.8-27B-4bit + stock DFlash2 is already usable for agentic coding in a TUI on this machine. Chatty prose is not the win.

On a 32 GB M1, the MoE that fits and still writes well is Qwen3.6-35B-A3B (4-bit MLX): ~35B total / ~3B active, roughly 17–20 GB resident.

## Next

Documented elsewhere: sampling / p-q accept, lossy accept, draft trees, n-gram assist, verify floor. Not another overnight of the same CE recipe.

From-source mlx-serve (C1) is built and staged. Not cut over. Leave the serve path alone until accept earns a change.

## Note

Keep the dense coding stack. Publish the miss. Don’t dress a failed distill as progress because the job exited zero.
