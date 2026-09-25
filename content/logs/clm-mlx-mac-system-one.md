---
title: I ran CLM vs Jev on my Mac. Warm System One answers hit 3.7 ms.
date: 2026-09-24
session: CLM-MLX-PORTABLE
commits: —
tools: CLM-8B, MLX, Qwen3-8B-4bit, Kev-4B, TypeSafe Jev, M3 Max
mood: Beat Jev on warm latency. Quality still open.
---

Hosted Jev answered my warm System One calls in **92.9 ms** p50. Local CLM on Metal did the same payloads in **3.7 ms**. That is the headline. Local Kev sat at **210.8 ms**.

CLM is Contrastive-LM's System One model: frozen Qwen3-8B encoder, tiny projection heads (~20M), score = scaled cosine, softmax = answer. Upstream assumes Linux + NVIDIA + vLLM. Official install does not support Mac. I packed a portable tree, ported serve-only inference to Metal/MLX, and ran identical TypeSafe `/v1/systemone` requests against CLM, Kev, and hosted Jev.

## What I built

- `clm-embed-mlx`: Qwen3-8B-4bit last-token pooling over `/v1/embeddings`
- Heads on MLX (`device=mlx`) loading the same `.pt` as CUDA
- Vector arena cache that keeps state/action projections warm
- Memory preflight so jetsam doesn't eat a half-finished HF fetch next to a fat 35B serve
- `examples/mac_bench/` for apples-to-apples TypeSafe compares

Training stayed torch. This tree is serve + bench + Home Base scaffolding for ghost32.

## Mac numbers (2026-09-24)

Sequential serve on Apple Silicon. Same five cases, two repeats. Jev is hosted TypeSafe.

<figure>
<img src="/blog/clm-mlx-mac/mac-latency.svg" alt="Mac System One latency p50: CLM warm 3.7ms, Kev 210.8ms, Jev 92.9ms" />
<figcaption>Warm loops are where CLM's disaggregated cache pays rent. Cold encode still costs.</figcaption>
</figure>

| model | p50 ms | warm p50 | cold p50 | vs Jev argmax | vs Jev TV |
| --- | ---: | ---: | ---: | ---: | ---: |
| CLM MLX | 3.7 | 3.7 | 270.8 | 0.50 | 0.46 |
| Kev MLX | 210.8 | 210.8 | 281.0 | 0.70 | 0.20 |
| Jev hosted | 92.9 | 92.9 | 104.1 | — | — |

<figure>
<img src="/blog/clm-mlx-mac/warm-speedup.svg" alt="Warm speedup ~57x vs local Kev" />
</figure>

Vs hosted Jev that is ~25× on warm p50. Vs local Kev ~57×. I am chasing warm agent loops: fixed tool sets, revisited rooms, typed routing. Cold texts (new policy excerpt, new tides question) sit near Kev and slower than Jev. Cache miss = encode. Cache hit = cosine.

<figure>
<img src="/blog/clm-mlx-mac/agreement.svg" alt="Argmax agreement vs Jev: CLM 0.5, Kev 0.7" />
<figcaption>Tiny smoke pack. CLM disagreed with Jev on tides (picked "round") and on the long policy reason. Quantized encoder may drift from the bf16/CUDA head recipe. I am not selling quality off 20 question slots.</figcaption>
</figure>

## Upstream zero-shot (their charts, in the tree)

On CUDA they already published the speed story: on par with Jev, up to ~9× lower latency when candidates reuse.

<figure>
<img src="/blog/clm-mlx-mac/upstream-latency.svg" alt="Upstream zero-shot latency CLM vs Jev" />
</figure>

<figure>
<img src="/blog/clm-mlx-mac/zero-shot.png" alt="Upstream zero-shot latency and success rate charts" />
</figure>

T-Rex in this repo (5 seeds × 60s, shield on): both survived 5/5. CLM model_ms p50 median **2.6 ms** vs Jev **131.9 ms**. Planner agreement: CLM 0.66, Jev 0.99. Shield interventions are high on CLM. Survival measures the combined system.

<figure>
<img src="/blog/clm-mlx-mac/trex-realtime.svg" alt="T-Rex realtime model ms p50" />
</figure>

## Agentic verifier (finetuned heads)

With BoN candidates from Opus/Fable and a fine-tuned head, upstream reports SOTA as verifier:

<figure>
<img src="/blog/clm-mlx-mac/agentic-success.svg" alt="DeepSWE 81.6% and Terminal-Bench 87.6%" />
</figure>

<figure>
<img src="/blog/clm-mlx-mac/agentic-latency.svg" alt="Verifier latency 5.7x and 4.1x faster than Jev" />
</figure>

| bench | CLM | Jev | pass@1 ref |
| --- | ---: | ---: | ---: |
| DeepSWE heldout-38 | **81.6%** @ 79 ms | 71.1% @ 449 ms | 73.7% |
| Terminal-Bench 2.1 heldout-30 | **87.6%** @ 32 ms | 83.1% @ 131 ms | 84.0% |

<figure>
<img src="/blog/clm-mlx-mac/agentic.png" alt="Upstream agentic verifier charts" />
</figure>

## Memory coexistence

64 GB (and my 128 GB M3 Max) is enough on paper. A fat `mlx-serve` on Qwen 35B with huge ctx + prefix cache + drafter can leave only a few GiB reclaimable. CLM wants ~8–12 GiB comfortable. I watched jetsam when I stacked 35B ⊕ CLM-8B ⊕ Kev-4B. Bench ran sequential. Lean the chat serve or time-slice.

## How I run it

```bash
bash scripts/setup_mlx.sh
source .venv/bin/activate
# stop big Metal servers first
bash serve_mlx.sh   # :8090 embeddings + :8700 API
python examples/mac_bench/run.py --models clm,kev,jev
```

Interactive architecture walkthrough: [/blog/clm-mlx-mac/explainer.html](/blog/clm-mlx-mac/explainer.html)

Portable archive: `CLM-portable-20260924` on my Desktop. Upstream: [Contrastive-LM/CLM](https://github.com/Contrastive-LM/CLM).

## What I want next

1. Encoder parity suite vs CUDA bf16 (4-bit drift is the open question)
2. Larger agreement pack before any quality claim
3. ghost32 Home Base: CLM on Tailscale so client Macs hold ~0 model RSS
4. Lean 35B + CLM coexistence profile

Warm latency is real. Quality vs Jev on Mac is still a homework assignment. I'm publishing the numbers I have.
