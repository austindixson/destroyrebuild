---
title: One Mac hub for routing, memory, and local inference
date: 2026-09-27
session: HOMEBASE-BLOG-1
commits: —
tools: Home Base, Tailscale, mlx-serve, Flash Next, OpenGrok, Jev
mood: One door. One brain. One serve.
---

Day-to-day coding kept breaking when every session pointed straight at a raw model server and hoped routing, memory, and context compaction would sort themselves out. So I built **Home Base** on Apple Silicon: a hub between the coding-agent client and the model process.

The client in this series is [OpenGrok](/blog/grok-build-best-local-ai-harness). This post is the hub it aims at over Tailscale.

Series order: [OpenGrok](/blog/grok-build-best-local-ai-harness), then this post, then [Flash Next MTP vs 27B+DFlash](/blog/flash-next-mtp-vs-27b-dflash-same-mac), then [speculative decode / parent+1](/blog/speculative-decode-doesnt-multiply-gpus).

## The shape

| Layer | What it is |
| --- | --- |
| Hub | **ghost128**: 128 GB Apple Silicon, reachable over Tailscale |
| Brain | Home Base proxy on `:9081`: Jev routing, memory, compact endpoint |
| Serve | `mlx-serve` Flash Next mixed 4/8-bit on `:11234` |
| Client | [OpenGrok](/blog/grok-build-best-local-ai-harness) on **gHost64** → `homebase-brain` over Tailscale |

The model on the hub today is `ddalcu/Qwen3.8-Flash-Next-MLX-Serve-mixed-4-8bit` (`model_max` 262k). Before that default, Home Base ran Qwen3.8-27B-4bit with a DFlash2 drafter at `--ctx-size 150000`. Why I switched, and the tok/s numbers, live in [the Flash Next post](/blog/flash-next-mtp-vs-27b-dflash-same-mac).

## Why a brain in the middle

Pointing the client at raw `mlx-serve` worked until compaction and fan-out got messy. The brain owns:

- Jev routing: what stays in context vs what gets dropped
- Memory: durable state across turns without stuffing the prompt yourself
- `POST /v1/compact`: the client hits this when `auto_compact_threshold_percent = 40`

I deliberately keep per-turn `chat_compact = false`. Compacting every turn fights the prefix cache. Better to let the brain compact at the threshold and keep hot prefixes reusable. Live Titan sessions showed ~99% hot-cache reuse at ~45k prompt; details in the Flash Next write-up.

## How I use it day to day

1. ghost128 runs the brain (`:9081`) and Flash Next (`:11234`).
2. gHost64 runs [OpenGrok](/blog/grok-build-best-local-ai-harness) aimed at `homebase-brain` over Tailscale.
3. Coding traffic goes through one hub. Explore/plan can pin elsewhere (I pin those to `gpt-5.6-luna`); the local default is Flash Next.

Default launch is launchd `com.ghost128.homebase.flash38`, with a rollback script if the new default misbehaves.

## Failure modes I hit first

- Four concurrent streams at 45-65k context dropped decode to ~17 tok/s and looked hung. One GPU was doing the work of a cluster. Caps live in [the fan-out post](/blog/speculative-decode-doesnt-multiply-gpus).
- No MLX DFlash checkpoint for Flash Next. Speculative decode on this model is native MTP. The old DFlash2 path does not apply.
- Soft product note: this stack powers a lot of the local coding work behind projects I ship, including work featured on [destroyrebuild.xyz](/). Workshop setup.

## Series

- [Grok Build might just be the best local AI harness](/blog/grok-build-best-local-ai-harness)
- **This post**
- [Flash Next MTP vs 27B+DFlash on the same Mac (~72 vs ~55 tok/s)](/blog/flash-next-mtp-vs-27b-dflash-same-mac)
- [Speculative decode doesn't multiply GPUs](/blog/speculative-decode-doesnt-multiply-gpus)

