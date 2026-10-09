# Changelog

Newest entries are first. Each entry comes from the commits on that pull request.

## 2026-10-09 — PR #22 — FM-REBUILD-YORK-8 — York AI chat

Commits on this branch run from 2026-10-08 through 2026-10-09, starting at `3a45cf9`. york-api serves the trainer chat from the signed-in CLIs.

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
- Round 0 gives grok 75 s, claude 10 s, and cursor 50 s. A follow-up round uses the time left on the 135 s request.
- The server stops the request at 135 s.
- The trainer stops at 145 s. Caddy waits 155 s.
- Grok allows 2 calls at once. Claude allows 3. Cursor allows 1. Codex allows 1.
- The cascade skips a tier that is already at its cap.
- The call does not wait in a queue.
- Grok uses its own york sandbox.
- Claude and Cursor use a temporary home and link the login keychain into that home.
- Startup marks a tier ready only after a reply that contains `YORKOK`.
- A budget kill logs `timeout budget=<ms>`. A client abort logs `aborted`.
- `X-York-Only` applies only on loopback when the proxy secret matches.
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
