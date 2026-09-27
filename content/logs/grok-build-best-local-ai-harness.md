---
title: Grok Build might just be the best local AI harness
date: 2026-09-27
session: HOMEBASE-BLOG-0
commits: —
tools: OpenGrok, Grok Build, Home Base, Tailscale, mlx-serve, Flash Next
mood: Own the knobs. Name the client.
---

**Grok Build**, once modified for local models and other LLMs, is **OpenGrok**, the coding-agent client I actually use. I wanted one place to set which model gets the turn, when context gets compacted, and how hard local subagents are allowed to hit one Mac.

This is post 0 of 4 on the Home Base series. Next: [Mac hub](/blog/one-mac-hub-routing-memory-local-inference), [Flash Next MTP vs 27B+DFlash](/blog/flash-next-mtp-vs-27b-dflash-same-mac), [speculative decode / parent+1](/blog/speculative-decode-doesnt-multiply-gpus).

## What it is

OpenGrok runs on **gHost64** (and on **ghost128**). For local coding it points at the Home Base brain over Tailscale (`homebase-brain`), not straight at a raw model server. The brain owns routing, memory, and compaction; the client owns the session UI and the knobs below.

This series stays on what the stack actually uses. Soft note: workshop / build-in-public material for [destroyrebuild.xyz](/).

## Features this series actually uses

- Model picker / Home Base route: coding traffic goes through the brain; explore/plan can pin elsewhere (I pin those to `gpt-5.6-luna`).
- Auto-compact at 40%: `auto_compact_threshold_percent = 40` hits the brain `POST /v1/compact` (Jev keep/drop). Per-turn `chat_compact` stays off on purpose so prefix cache stays warm.
- Subagent settings: `max_concurrent`, `sampling_limit`, `max_depth`, `limit_behavior`, plus which models explore/plan use.
- `cancel_subagents_on_turn_cancel`: cancel the turn, cancel the kids.

Those concurrency knobs are why post 3 exists. Without them, four fat local streams looked hung.

## Why a client I own

Stock clients were fine until I needed one place to aim every coding turn at a local hub, compact through Jev instead of every message, and fail closed when fan-out would thrash a single GPU. OpenGrok is that client. Home Base is the Mac hub behind it.

## Series

- **This post**: Grok Build might just be the best local AI harness
- [One Mac hub for routing, memory, and local inference](/blog/one-mac-hub-routing-memory-local-inference)
- [Flash Next MTP vs 27B+DFlash on the same Mac (~72 vs ~55 tok/s)](/blog/flash-next-mtp-vs-27b-dflash-same-mac)
- [Speculative decode doesn't multiply GPUs](/blog/speculative-decode-doesnt-multiply-gpus)

