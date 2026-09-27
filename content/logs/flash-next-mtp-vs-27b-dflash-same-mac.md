---
title: Flash Next MTP vs 27B+DFlash on the same Mac (~72 vs ~55 tok/s)
date: 2026-09-27
session: HOMEBASE-BLOG-2
commits: —
tools: mlx-serve, Flash Next, MTP, DFlash2, Home Base, OpenGrok
mood: Same Mac. Faster default.
---

Same Mac, same harness shape, two defaults.

Before: Qwen3.8-27B-4bit + DFlash2 drafter, `--ctx-size 150000`, coding bench ~55 tok/s.

After: Flash Next mixed 4/8-bit on `mlx-serve` with native MTP, same 150k ctx target, coding bench ~71.9 tok/s.

That swap is now the Home Base default on ghost128. The client that aims at this stack is [OpenGrok](/blog/grok-build-best-local-ai-harness). Hub layout is in [One Mac hub for routing, memory, and local inference](/blog/one-mac-hub-routing-memory-local-inference); concurrency caps are in [Speculative decode doesn't multiply GPUs](/blog/speculative-decode-doesnt-multiply-gpus).

## Why I left DFlash on this model

There is no MLX DFlash checkpoint for Flash Next. The old 27B+DFlash2 path does not transfer. Native MTP is the speculative path that exists for this serve stack, so that is what I tuned.

## Flags that are live

```text
--mtp
--pld
--pld-draft-len 5
--kv-quant 4
--ctx-size 150000
--prefix-cache-mem 8GB
--prefix-cache-disk 4GB
--no-vision
```

Model: `ddalcu/Qwen3.8-Flash-Next-MLX-Serve-mixed-4-8bit` (`model_max` 262k). Served by `mlx-serve` on `:11234` behind the Home Base brain on `:9081`.

Default is rolled via launchd `com.ghost128.homebase.flash38`. A rollback script exists if I need the prior 27B+DFlash default back.

## Numbers I trust (from FM-HOMEBASE-FLASH-2 + live Titan)

| Metric | Prior 27B+DFlash | Flash Next (live) |
| --- | --- | --- |
| Coding bench | ~55 tok/s | **~71.9 tok/s** |
| Live Titan decode | - | ~57-63 tok/s |
| Prefill (hot) | - | ~250-328 tok/s |
| Hot-cache reuse @ ~45k prompt | - | ~99% |
| Context flag | 150k | 150k (`model_max` 262k) |

I care more about the live Titan band than the peak bench number. ~57-63 decode with ~99% prefix reuse at ~45k prompt is what day-to-day coding feels like when the cache is warm.

## Prefix cache vs per-turn compact

The client (`auto_compact_threshold_percent = 40` in [OpenGrok](/blog/grok-build-best-local-ai-harness)) calls the brain `POST /v1/compact` (Jev keep/drop). I keep `chat_compact = false` per turn on purpose so we do not smash the prefix cache every message. Compaction at 40% is enough; eager per-turn compact was fighting the 8GB mem / 4GB disk prefix caches above.

## Honest failure modes

- Under fan-out, MTP still shares one GPU. Four concurrent streams at 45-65k context crushed decode to ~17 tok/s and looked hung. Speculative decode does not multiply GPUs. Caps are in the [fan-out post](/blog/speculative-decode-doesnt-multiply-gpus).
- No DFlash fallback on Flash Next. If MTP misbehaves, rollback is the 27B+DFlash launch path. There is no Flash Next DFlash checkpoint.
- Soft product note: this is the inference default behind a lot of local agent work I do for projects that show up on [destroyrebuild.xyz](/). Workshop log.

## Series

- [Grok Build might just be the best local AI harness](/blog/grok-build-best-local-ai-harness)
- [One Mac hub for routing, memory, and local inference](/blog/one-mac-hub-routing-memory-local-inference)
- **This post**
- [Speculative decode doesn't multiply GPUs](/blog/speculative-decode-doesnt-multiply-gpus)

