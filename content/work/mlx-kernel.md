---
title: MLX Kernel / dense decode lab
year: 2026
status: research
role: builder — Austin Dixson
stack: Apple Silicon, MLX, mlx-serve Zig, DFlash2
summary: Field notes from pushing dense Qwen3.8-27B-4bit toward 70+ tok/s decode on M3 Max. Code and math cleared; prose accept stayed flat.
---

Local inference research on Apple Silicon. Goal: dense 27B decode fast enough for agentic coding without swapping to MoE or fake-speed tricks.

## Result (2026-09-24)

- Serve: `Qwen3.8-27B-4bit` + stock `z-lab/Qwen3.8-27B-DFlash2` on mlx-serve Zig 26.9.5.
- Win: math/code cool protocol about 70–73 tok/s.
- Miss: prose accept stuck near 1.2 after a full 1.2M-token self-distill; overnight B4 gate failed; stock drafter restored.
- Split use: dense + DFlash for coding agents on the Max; Qwen3.6-35B-A3B MoE for prose on a 32 GB M1.

## Why bother writing it down

Most local-LLM posts stop at “it runs.” This lab measures accept rate, verify cost, and category gates. When distill does not move accept, stop and say so.

Ship-log: [Dense 27B hits 70 tok/s on code. Prose still refuses.](/blog/mlx-dense-70-prose-wall)
