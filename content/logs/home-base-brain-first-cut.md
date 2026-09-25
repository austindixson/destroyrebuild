---
title: Home Base brain — first cut (two Maxes, one System One)
date: 2026-09-24
session: HOMEBASE-BRAIN-0
commits: —
tools: CLM, MLX, mlx-serve, Tailscale, FastAPI, SQLite
mood: Split the mind. Keep the torch hot.
---

I have been trying to buy one bigger model with two Macs. That was the wrong question.

What I actually want is a **home base**: always-on inference on the desk, projects on a 5TB drive, and every phone / laptop / agent talking to the same Tailscale door. The generative stack I already love stays put — Qwen3.6-35B-A3B with DFlash2, MTP, kv8, and a 250k context window. The missing piece is a fast **System One** layer that decides what belongs in that window.

## The bet

TypeSafe’s Jev (and the open CLM / Kev family) are not chat models. They evaluate a *state* and return typed probabilities — noul / choice / score — without writing a paragraph. Community patterns around Jev are already clear: **filter context instead of summarizing it**, route cheap vs expensive models, guard dangerous tools, and run memory control (type → relate → retrieve → stop) without putting an autoregressive LLM on every edge.

So the architecture is fleet specialization, not shared Metal RAM:

- **ghost64 (64 GiB):** fat System Two — 35B + DFlash + MTP + big KV. Unchanged flags.
- **ghost32 (32 GiB + 5TB):** CLM as local System One, memory store, Tailscale front door.
- **Clients:** OpenGrok and anything else hit one URL; they never need to know which Mac holds the weights.

Exo / RDMA / “96 GiB pooled” stays a later spike. Today’s unlock is **running the full stack together**, which a single 64 GiB box cannot do once the 35B profile is loaded.

## What “Home Base brain” means in v1

A FastAPI proxy on ghost32 (`:9081`) sits in front of mlx-serve:

1. **AutoMode** — CLM noul on proposed tool calls; block the obvious catastrophes before they reach the MoE.
2. **Router** — choice between a light flash model, the 35B, or memory-only recall.
3. **Compaction** — Hermes-jev-compact style: pin system + recent user turns; ask CLM which old tool blobs still matter; drop the rest *verbatim-safe* (no rewrite).
4. **Mem-lite** — SQLite on the 5TB with Jev-Mem-lite write/read (type, relate, retrieve, adaptive stop). Inject top-K evidence as a pinned memory block before generation.
5. **Forward** — stream to the chosen upstream. Afterward, write the turn into memory asynchronously.

System Two keeps the measured decode path (~59 → ~102 tok/s with DFlash2 + MTP on this machine). We do not touch those flags to “make room” for ideology.

## First attempt — what actually happened

Phase 0 of Home Base is real: disk layout on `/Volumes/DRIVE/HomeBase`, Tailscale SSH, contract harness. CLM `[mlx]` is installed on ghost32. OpenGrok on this laptop is already wired to a Tailscale-served model.

Then the metal truth showed up. ghost32 with GLM-4.7-Flash resident had **~0.7 GiB reclaimable** on a 32 GiB box. CLM’s 8B-4bit encoder wants several free gigabytes or the OS jetsams the load — the same lesson we learned stacking CLM next to the 35B on ghost64. So the first attempt is not “brain online, tweet a dashboard.” It is:

- Stop pretending both fat Metal tenants fit casually on the 32 GiB node.
- Prefer **CLM + brain proxy** as the always-on System One tenant; treat flash as a router target when reclaimable RAM allows.
- Keep the 35B profile exclusive on ghost64 where the DFlash stack already earns its keep.

That is an honest first cut: architecture locked, install path green, coexistence budget documented in blood (and jetsam).

## Why this is the product

Bigger MoEs from exo are a research weekend. A Tailscale brain that **compacts, remembers, routes, and guards** before a long-context MoE generates is daily leverage — the same split Jev-Mem argues for in paper form, implemented with local CLM so the control plane is not a cloud meter.

Next sessions: start CLM clean on ghost32, land the brain package with TDD, point OpenGrok at `http://ghost32:9081/v1`, and measure whether compaction actually shrinks tokens without losing the error that mattered.

Destroy. Then rebuild the context window on purpose.
