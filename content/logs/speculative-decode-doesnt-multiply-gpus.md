---
title: Speculative decode doesn't multiply GPUs
date: 2026-09-27
session: HOMEBASE-BLOG-3
commits: —
tools: OpenGrok, Home Base, Flash Next, MTP, homebase-concurrency
mood: Parent plus one. Fail closed.
---

**Symptom:** four concurrent streams at 45-65k context on one Apple Silicon box, decode ~17 tok/s. The UI sat there long enough that it felt dead. Flash Next was time-slicing four fat contexts and losing.

The client in this series is [OpenGrok](/blog/grok-build-best-local-ai-harness). Hub and model posts: [One Mac hub for routing, memory, and local inference](/blog/one-mac-hub-routing-memory-local-inference), [Flash Next MTP vs 27B+DFlash on the same Mac (~72 vs ~55 tok/s)](/blog/flash-next-mtp-vs-27b-dflash-same-mac).

## Why local subagents and a single GPU don't mix

Home Base serves one Flash Next process on ghost128 (`mlx-serve` on `:11234`). Speculative decode here is native MTP (there is no MLX DFlash checkpoint for Flash Next). That speeds a single stream on that process.

When the client fans out local kids:

- Each kid carries a fat context (we were at 45-65k).
- Prefill and KV for those contexts fight on the same serve process.
- MTP still shares that one queue. It does not parallelize across kids.
- Decode fell to ~17 tok/s. The session looked hung even though the box was busy.

The bottleneck is concurrency on one serve process. The same stack still posts ~71.9 tok/s on the coding bench and ~57-63 decode on live Titan when it is not sharing the GPU with three siblings ([opts post](/blog/flash-next-mtp-vs-27b-dflash-same-mac)).

## The rule I shipped

**Parent + 1.** One in-flight child alongside the parent.

### Client settings ([OpenGrok](/blog/grok-build-best-local-ai-harness))

| Setting | Value |
| --- | --- |
| `max_concurrent` | `1` |
| `sampling_limit` | `1` |
| `limit_behavior` | `fail` |
| `max_depth` | `1` |

I also keep `cancel_subagents_on_turn_cancel` on so a cancelled parent turn does not leave kids chewing the GPU.

Explore/plan stays pinned to `gpt-5.6-luna` (off-box). Local coding stays on Home Base / Flash Next. Documented in the `homebase-concurrency` skill.

### Brain

Max **2** in-flight chat completions (parent + 1). Same idea at the proxy: do not let the client queue four fat local completions behind one serve port.

## Why it felt frozen

At ~45-65k prompt with four streams, prefill and KV fight each other, decode falls to ~17 tok/s, and the client looks hung. Capping concurrency made the same hardware feel responsive again because each turn actually finished.

## What stayed out of scope

I stayed on one local GPU and skipped a multi-node orchestrator. `limit_behavior` is **`fail`** on purpose: a clear refusal beats a silent crawl that looks like a hang.

## Series

- [Grok Build might just be the best local AI harness](/blog/grok-build-best-local-ai-harness)
- [One Mac hub for routing, memory, and local inference](/blog/one-mac-hub-routing-memory-local-inference)
- [Flash Next MTP vs 27B+DFlash on the same Mac (~72 vs ~55 tok/s)](/blog/flash-next-mtp-vs-27b-dflash-same-mac)
- **This post**

