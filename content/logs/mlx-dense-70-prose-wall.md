---
title: Dense 27B hits 70 tok/s on code. Prose still refuses.
date: 2026-09-24
session: MLX-DFLASH-B4
commits: —
tools: MLX, mlx-serve Zig 26.9.5, DFlash2, M3 Max
mood: Gate missed. Stack kept.
---

I locked the overnight on one number: prose decode ≥70 tok/s on dense Qwen3.8-27B-4bit, mlx-serve Zig + z-lab DFlash2, M3 Max. No MoE. No echo fakes. Speculative decode or nothing.

Math and code were already kissing 70. I wanted prose to follow. It didn’t.

## What I held

- mlx-serve 26.9.5 Zig, DFlash2 (block capped at 5), PLD8, cool protocol, `ROUND_COST_PERSIST=0`.
- Iso / cool benches I’d already cleared: math and code median ~70–73 tok/s on dense 27B.
- The equation I kept tattooing on the run: `tok/s ≈ accept/round ÷ verify_s`. At ~54 ms verify I need ~3.8 accepted tokens per round for ~70. Prose sat at ~1.2–1.7.

That gap is the obsession. Speed isn’t a Metal séance. Accept is the bottleneck, and I chased it.

## Phase A

I ran flag A/B, length curves, verify microbench, offline block-8 accept-by-position. Positions 6–8 held ~2.5% of the mass. Bigger blocks weren’t going to save me, so I killed that plan until accept moves.

## Phase B

I ran the full path because half-measures make me itch: 1.2M tokens → 4-bit target hiddens → MLX CE fine-tune of DFlash2 → cool gate.

Loss fell (2.67 → 2.19). Accept did not. B4:

| Surface | Result | Need |
| --- | --- | --- |
| Prose accept (med) | 1.21 | ≥2.2 |
| Prose tok/s (med) | ~32 | ≥70 |
| Math / code (med) | 52.9 / 58.8 | ≥70 |

Same wall as my earlier 100k try. The distilled drafter also dragged math/code under stock z-lab. I restored z-lab and stopped burning another CE night on the same recipe.

A green train exit is not the goal. The goal is 70 on prose. I missed it. I’m saying that out loud.

## What I’m using anyway

Dense Qwen3.8-27B-4bit + stock DFlash2 is already good enough for how I actually work: agents in a TUI, building software. Chatty prose isn’t the win on this box.

For a 32 GB M1 prose machine, I’m pointing at Qwen3.6-35B-A3B (4-bit MLX): ~35B total / ~3B active, ~17–20 GB resident. Different hunger, different hardware.

## Next

I’ve got the next levers written down: sampling / p-q accept, lossy accept, draft trees, n-gram assist, verify floor. Not another overnight of plain CE.

From-source mlx-serve (C1) is built and staged. I haven’t cut over. I don’t change the serve path until accept earns it.

## Note to me

Keep the dense coding stack. Publish the miss. Don’t cosplay progress because the job exited zero. I’m still after the number.
