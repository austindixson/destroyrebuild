---
title: Dense 27B hits 70 tok/s on code. Prose still refuses.
date: 2026-09-24
session: MLX-DFLASH-B4
commits: —
tools: MLX, mlx-serve Zig 26.9.5, DFlash2, M3 Max
mood: Gate missed. Stack kept.
---

Overnight goal on the M3 Max: serve a **dense** Qwen3.8-27B-4bit through mlx-serve Zig + z-lab DFlash2, and get **prose decode ≥70 tok/s**. No MoE. No echo fakes. Stick with speculative decode.

Math and code were already there. Prose was the wall.

## What actually shipped

- **Stack held:** mlx-serve 26.9.5 Zig, DFlash2 (block capped at 5), PLD8, cool protocol, `ROUND_COST_PERSIST=0`.
- **Category PASS (earlier iso / cool benches):** math and code median **~70–73 tok/s**. Dense 27B, not a MoE cheat.
- **Physics written down:** `tok/s ≈ accept/round ÷ verify_s`. At ~54 ms verify you need ~**3.8** accepted tokens per round for ~70. Prose sat at **~1.2–1.7**.

That gap is the whole story. Speed is not a mysterious Metal bug. Accept is too low on prose.

## Phase A — no free lunch

Flag A/B, length curves, verify microbench, offline block-8 accept-by-position. Position 6–8 mass was ~**2.5%**. Chasing a bigger block was a dead end. Dropped the “just raise the block cap” plan until accept moves.

## Phase B — self-distill, then honesty

Full path: **1.2M** tokens → 4-bit target hiddens → MLX CE fine-tune of DFlash2 → cool gate.

Training lowered loss (**2.67 → 2.19**). Accept did not move. B4 gate:

| Surface | Result | Need |
| --- | --- | --- |
| Prose accept (med) | **1.21** | ≥2.2 |
| Prose tok/s (med) | **~32** | ≥70 |
| Math / code (med) | **52.9 / 58.8** | ≥70 |

Same accept wall as the earlier 100k try. The distilled drafter also **hurt** math/code versus stock z-lab. Restored z-lab. Stopped iterating plain CE.

Pipeline on track ≠ goal on track. Loss going down is not a permission slip.

## What I’ll use it for anyway

Serving dense **Qwen3.8-27B-4bit + stock DFlash2** for agentic coding in a TUI is already a decent experience on this machine. Prose chat is not the win here.

For a **32 GB M1** prose box, the MoE that actually fits and writes is **Qwen3.6-35B-A3B** (4-bit MLX) — ~35B total / ~3B active, ~17–20 GB resident, interactive decode without pretending to be dense 70.

## Next levers (not more of the same)

Documented separately: sampling / p-q accept, lossy accept, draft trees, n-gram assist, verify floor. Not another overnight of the same CE recipe.

From-source mlx-serve (C1) is built and staged. Not cut over. Don’t change the serve path until accept earns it.

## Note to future me

Keep the dense coding stack. Publish the miss. Don’t dress a failed distill as progress because the train loop finished.
