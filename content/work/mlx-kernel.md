---
title: MLX Kernel / dense decode lab
year: 2026
status: research
role: builder — Austin Dixson
stack: Apple Silicon, MLX, mlx-serve Zig, DFlash2
summary: I chased dense Qwen3.8-27B-4bit toward 70+ tok/s on M3 Max. Code and math cleared. Prose accept stayed flat, and I’m still watching that number.
---

I run local inference research on Apple Silicon because I want dense 27B decode fast enough for agentic coding without MoE cosplay or fake-speed tricks.

## Result (2026-09-24)

- Serve: `Qwen3.8-27B-4bit` + stock `z-lab/Qwen3.8-27B-DFlash2` on mlx-serve Zig 26.9.5.
- Win: math/code cool protocol ~70–73 tok/s.
- Miss: prose accept stuck near 1.2 after my full 1.2M-token self-distill; overnight B4 gate failed; I restored the stock drafter.
- Split: dense + DFlash for coding agents on the Max; Qwen3.6-35B-A3B MoE when I need prose on a 32 GB M1.

## Why I wrote it down

Most local-LLM posts stop at “it runs.” I measure accept rate, verify cost, and category gates because I’m hunting a specific speed. When distill doesn’t move accept, I stop and say so.

Ship-log: [Dense 27B hits 70 tok/s on code. Prose still refuses.](/blog/mlx-dense-70-prose-wall)
