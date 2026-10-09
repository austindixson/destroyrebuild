# Changelog

Newest entries are first. Each entry comes from the commits on that pull request.

## 2026-10-09 — PR #22 — FM-REBUILD-YORK-8 — York AI chat

Commits on this branch run from 2026-10-08 through 2026-10-09, starting at `3a45cf9`. york-api serves the trainer chat from the signed-in CLIs.

### 2026-10-09 — YORK-8V

- A follow-up sends the full screen snapshot. Chiller rows, differential pressure, hall return, and the LCHLT setpoint stay in the prompt.
- A request turned away for too many calls in flight logs `york-api chat busy reason=inflight`.
- A checklist marker such as "3." is not an untraced number.

### 2026-10-09 — YORK-8U

- % FLA is for chiller motor current only. A valve uses % open. A fan uses % speed.
- A sentence that puts % FLA on a valve, a fan, or a tower is dropped.
- An orphaned Reason sentence is dropped when the step before it was removed.

### 2026-10-09 — YORK-8T

- Every follow-up starts on claude, then grok, then cursor. The echoed tier is logged and does not choose the order. A tier that timed out earlier is still skipped.
- A follow-up gives claude the shorter of 30 s and the time left minus 1 s. Grok and cursor run only when their full budget still fits. Round 0 stays 70 s, 15 s, and 50 s.
- The follow-up prompt states the active-voice rule and the 25 word sentence limit. A rewrite restates the same facts. An added sentence is dropped.

### 2026-10-09 — YORK-8S

- A follow-up tier holds back the next budget only when the time left covers both budgets. Otherwise it uses the time left, up to its own budget.
- A follow-up skips the last tier when less than 40 s remain.
- A follow-up starts on claude when round 0 has used more than half of the 135 s window. Otherwise it starts on the tier that answered.
- Round 1 sends the snapshot delta and the tool results. It does not send the passage set.
- An emptied answer logs `ste-drop`, `label-only`, `quote-drop`, `number-drop`, `leak`, or `parse`. The log line does not include the model text.

### 2026-10-09 — YORK-8R

- A follow-up round starts with the tier that answered the previous round. The tool response returns that tier. The trainer sends it back. The server accepts a known tier only, and that field cannot override the only-tier header.
- A follow-up tier runs for the shorter of its budget and the time left after the next tier's budget. A tier that timed out earlier in the question is skipped.
- Raw model text is logged only when `YORK_DEBUG_RAW=1`. The Mac installer does not set that flag.
- Round 0 counts the N+1 fleet numbers in the prompt as traced. The glossary chunk does not contain 17, 5, or 85.

### 2026-10-09 — YORK-8Q

- The last enabled tier runs when at least 40 s remain. The 135 s cap and the process-group kill stay. Grok plus claude plus that floor is 125 s.
- Round 0 gives grok 70 s and claude 15 s. With Codex on, grok is 60 s. Run 12 left cursor 49,503 ms after a 75 s grok timeout and a 10 s claude timeout, so cursor never started.
- An open case tells the model to reply with "I cannot give the answer while the case is open. Check the readings on screen, then make your pick."
- A sentence with an unmatched quote is dropped. An open case keeps that decline when the model wrote it.
- `YORK_LOG_CLIENT=1` logs the raw model text at debug level with tokens removed.
- The prompt asks for a plain label such as "IT load 4.2 MW".

### 2026-10-09 — YORK-8P

- Round 0 skips claude only when the time left is under claude's budget. A full cursor slot does not skip claude.
- The prompt tells the model to write "N+1 holds." or "N+1 does not hold."
- An open case uses a short decline and calls claude first. The reply still comes from the model.
- Grok does not pass `--tools`. `--disallowed-tools` is the removal list and includes `kill_command_or_subagent` and `get_command_or_subagent_output`.

### 2026-10-09 — YORK-8O

- The sandbox profile leaves the temp GROK_HOME off the deny list. A deny of that path stops grok from loading config.
- Grok keeps `--deny` `Read(<temp GROK_HOME>/**)`.
- Grok passes `--disallowed-tools`, and that list includes `use_tool` and `search_tool`.
- N+1 counts running chillers and standby chillers that can start, then subtracts the largest unit.
- The prompt gives a fleet example: 18 units at 5 MW and an 80 MW load, so 17 times 5 MW is 85 MW.
- An open case also drops `trainer:info:quiz-*`, `trainer:info:chaos-*`, and the KPI cards that name a fix.
- Grok confinement is `--sandbox york`, `--permission-mode dontAsk`, `--disallowed-tools`, and `--deny Read(<GROK_HOME>/**)`. No `--tools` flag.
- Claude confinement is empty `--tools`, `--safe-mode`, a temp home, the login keychain link, and no `CLAUDE_CONFIG_DIR`.
- Cursor confinement is `--sandbox enabled`, `--mode ask`, no `--force`, and `Read` denies in the temp permissions file.
- Codex confinement is `--sandbox read-only`, `--ignore-user-config`, `--ephemeral`, and `--ignore-rules`.

### 2026-10-09 — YORK-8N

- The N+1 glossary uses two sentences. The plant carries the IT load with any one chiller out of service.
- The prompt compares capacityMw with itLoadMw.
- `compactRow` copies fields from a key map. `scalarArgs` keeps only scalar tool args.
- Grok passes `--disallowed-tools` for file, shell, write, subagent, scheduler, workflow, image, and video tools.
- Grok passes `--deny` `Read(<temp GROK_HOME>/**)`.
- An open case drops `trainer:trouble:*`, `trainer:info:trouble-*`, and `trainer:quiz:*`. The prompt says not to give the trouble answer.
- Every round shares one 135 s deadline. The trainer sends `elapsedMs`.
- Round 0 skips a tier when that start would leave cursor under its budget.
- A unit id such as CH-01 is not a live number. Number checks use whole tokens.

### 2026-10-09 — Security notes for this pull request

- Commit `69b7581` removes the outer `sandbox-exec` wrapper.
- Caddy strips `X-York-Only`. The override also needs `YORK_ALLOW_TIER_OVERRIDE=1`.
- The client address comes from `X-Real-IP`. A missing, doubled, or non-IP value is rejected.
- The server requires a proxy secret of at least 16 characters.
- Leak patterns are wider. An answer with a secret shape returns "unavailable".
- The child environment strips the proxy secret, the canary, `PWD`, `OLDPWD`, and `INIT_CWD`.
- Grok confinement is `--sandbox york`, `--permission-mode dontAsk`, `--disallowed-tools`, and `--deny Read(<GROK_HOME>/**)`. No `--tools` flag.
- Claude confinement is empty `--tools`, `--safe-mode`, a temp home, the login keychain link, and no `CLAUDE_CONFIG_DIR`.
- Cursor confinement is `--sandbox enabled`, `--mode ask`, no `--force`, and `Read` denies in the temp permissions file.
- Codex confinement is `--sandbox read-only`, `--ignore-user-config`, `--ephemeral`, and `--ignore-rules`.
- The server kills the process group, caps CLI output at 256 KB, and counts every round.

### 2026-10-09 — YORK-8M

- The server drops a long STE sentence before it adds the trainer-model label. A label-only answer starts the rewrite.
- Trouble passages start with "Typical symptoms:" and end each symptom with a period.
- The prompt says passage symptoms are examples. State a live value only from the snapshot or the tool results.

### 2026-10-09 — YORK-8L

- A non-empty tool list returns a tool round. The server ignores the interim answer while the round is below 6.
- `plant.getActionLog` returns the last rows with time, actor, and action.
- `plant.getAlarms` lists each active alarm.
- A follow-up round sends a snapshot delta and the tool results. That prompt does not send the passage set again.
- The trainer sends the action-log rows and the alarm rows to the server.
- A follow-up round uses the time left on the 135 s request. The server does not start the tier budget again.
- Round 0 gives grok 75 s, claude 10 s, and cursor 50 s. Run 7 killed grok at 65 s. Cursor also hit 50 s, so that budget stays.
- The prompt tells the model to set answer to an empty string when tools is not empty.
- The coach states only a value that the snapshot, the tool results, or the passages show.
- The N+1 passage says the plant has N+1 when one chiller capacity is at least the IT load.
- The checklist treats `no file quote` and `have no` as refusals.

### Learner

- The trainer shows a chat panel on the same origin.
- The panel sends the live screen snapshot with each question.
- The coach answers from that snapshot and from the trainer passages.
- Live numbers stay trainer-model values.
- A stop, a fault, or a reset shows a confirm card before the plant changes.
- A request for alarms or the action log returns to the browser as a tool round.
- The coach keeps tools empty when the snapshot already answers the question.

### Operator

- york-api calls the signed-in grok, claude, and cursor CLIs on the Mac.
- The service does not use a provider API key.
- Codex runs only when `YORK_CODEX=1`.
- The server listens on 127.0.0.1. Caddy forwards chat with the proxy secret.
- Round 0 gives grok 70 s, claude 15 s, and cursor 50 s. The last tier still runs when at least 40 s remain. Every round shares the time left on one 135 s window.
- A follow-up starts on claude, then grok, then cursor. Claude gets at most 30 s. A later tier runs only when its full budget still fits. `YORK_DEBUG_RAW=1` logs the raw model text.
- The server stops the request at 135 s.
- The trainer stops at 145 s. Caddy waits 155 s.
- Grok allows 2 calls at once. Claude allows 3. Cursor allows 1. Codex allows 1.
- The cascade skips a tier that is already at its cap.
- The call does not wait in a queue.
- Grok uses its own york sandbox.
- Claude and Cursor use a temporary home and link the login keychain into that home.
- Startup marks a tier ready only after a reply that contains `YORKOK`.
- A budget kill logs `timeout budget=<ms>`. A client abort logs `aborted`.
- `X-York-Only` applies only on loopback when the proxy secret matches and `YORK_ALLOW_TIER_OVERRIDE=1` is set.
- The live checklist loads the plant snapshot from the trainer code.
- Merge `a3c813a` brings PR #21 and PR #24 into this branch. Those changes keep their own pull request numbers.

## 2026-10-08 — PR #23 — FM-REBUILD-YORK-10

- The York trainer gives each text job one style: title, label, value, lesson, glossary, alert, button, or quiz prompt.
- The lesson words stay the same.
- Mint, amber, and rose stay in front of the value color on the KPIs, the pipe delta P, and the chaos line.
- The active loop step uses title ink on a solid disc. The contrast stays above 4.5:1.
- The valve alert heading uses alert ink. The explanation uses body ink.
- The head KPI test waits until the color is amber or rose.
- Sim tests write each bundle in a private temporary directory.
- The sim test script deletes that directory after the run. It also deletes the directory after a failure.
- The valve alert paint function stays small. One helper writes the text. One helper keeps the glossary focus.
- Shift frequency labels use grey label ink. They do not use amber.
- A new test checks that status color stays in front of value color on the KPIs, the pipe delta P, and the chaos line.
- A new test checks that the active loop step uses title ink on the solid disc.
