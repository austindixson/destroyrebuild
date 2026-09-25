---
title: CLM on Apple Silicon / System One
year: 2026
status: research
role: builder — Austin Dixson
stack: CLM-8B, MLX, Qwen3-8B-4bit, TypeSafe wire, FastAPI
summary: I ported Contrastive-LM serve to Metal. Warm System One p50 hit 3.7 ms on M3 Max; agreement with hosted Jev on a tiny smoke pack stayed at 0.5.
---

I wanted local typed decisions (noul / choice / score) on the same wire as TypeSafe Jev, without NVIDIA and without a generative round-trip for every agent branch.

## Result (2026-09-24)

- Port: `clm-embed-mlx` + MLX projection heads + vector cache + memory preflight
- Bench: CLM warm p50 **3.7 ms** vs Kev MLX **210.8 ms** vs hosted Jev **92.9 ms**
- Caveat: argmax agreement vs Jev **0.50** on a 5-case smoke pack (Kev 0.70). Not a quality claim.
- Upstream (CUDA): zero-shot on par with Jev at lower latency; finetuned verifier DeepSWE **81.6%**, Terminal-Bench 2.1 **87.6%**

## Why it matters to me

Agent loops reuse action sets. CLM disaggregates state and action embeddings so warm hits skip the encoder. That is the hunger: System One on my laptop at sub-10 ms when the cache is hot.

Ship-log: [CLM on Metal hit 3.7 ms warm. Agreement with Jev is still smoke.](/blog/clm-mlx-mac-system-one)

Explainer: [/blog/clm-mlx-mac/explainer.html](/blog/clm-mlx-mac/explainer.html)
