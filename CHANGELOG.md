# Changelog

Newest entries are first. Each entry comes from the commits on that pull request.

## 2026-10-09 — PR #22 — FM-REBUILD-YORK-8 — York AI chat

Commits on this branch run from 2026-10-08 through 2026-10-09, starting at `3a45cf9`. york-api serves the trainer chat from the signed-in CLIs.

### 2026-10-09 — YORK-8Z12

- A plan object with lead-in or trailing text is read only when that object starts at the beginning of a line and ends at the end of a line, or when it is fenced. "The model replied {"answer":"x"} last time. CH-01 runs at 34% FLA." stays prose. "To read alarms, send {"tools":[...]} to the tool." stays prose and runs no tool. "Here is my reply:" and "Sure." before an object on the next line still parse. "Thanks." on the next line still parses.
- A # heading uses its # level for scope. "# Plant" stays above "## Pumps" and "## Chillers". "# Eight-hour checklist" stays when "## Shift start" is emptied and "## Mid shift" keeps its step, with or without blank lines.
- A plain title stays when a later subsection in its group keeps text. "Eight-hour checklist" stays when "Mid shift" keeps "2. Log it". "Shift start" stays when "Mid shift" keeps "2. ok". A blank line before "CHILLERS" still ends that group. The prompt tells the model to use a # heading for a section and a ## heading for a subsection.
- "Hour 0 to 1" directly under a heading is a sub-heading. It does not count as content.
- Once a shutdown starts, a flag blocks retryOnce and any new smoke check. Each retry's temp directory and process group stay tracked until the group exits.

### 2026-10-09 — YORK-8Z11

- A parent heading covers the consecutive sub-headings that follow it before any content. A blank line between those headings still keeps the group. A blank line before a later heading, or a CAPS heading after content, ends that group. "Eight-hour checklist" and "Shift start" drop when the step is untraced and a blank line before "CHILLERS" keeps "- CH-01". "CHECKLIST" above "SHIFT START" stays. "PUMPS" above "CHILLERS" stays when the bullet stays.
- One plan object may have 40 characters of lead-in and 80 characters of trailing text when that trail starts with whitespace. A tools object followed by "I will wait for the result." is a tool call. "Sure." before an answer object and "Thanks." after it is the answer. "It said {"answer":"x"}." stays prose. A trail of 81 characters stays prose.
- "Use the { key. The "answer": is on screen." does not ask for JSON again. An unclosed `{"` after a short lead-in still does.
- Smoke helpers are found with `pgrep -P` and `ps`. Each helper starts in its own process group. A stop sends SIGTERM, then SIGKILL after 2 seconds, on SIGTERM, SIGINT, and a restart. The temp directory is removed after the group exits.
- `guard.table.test.ts` and `parse.table.test.ts` lock the D8 through D25 examples.

### 2026-10-09 — YORK-8Z10

- A heading level is its # count. A heading directly above another heading, blank lines included, is one level above that heading. It drops when every content piece in that scope was removed, or when it is an empty leaf. It stays when kept text remains under that heading, including under a sub-heading in the same group. "CHECKLIST" stays above "SHIFT START". "EIGHT-HOUR CHECKLIST" stays above "Shift start". A blank line between them still keeps both. "PUMPS" above "CHILLERS" stays when the bullet stays. An emptied "**Pumps**" and "**Alarms**" drop.
- An unclosed object after a short lead-in asks for JSON again. "Sure." before `{"answer":"A.", "tools": [` is that case. "It said {"answer":"x"}." stays prose.
- A failed claude check sets YORK_CLAUDE_CLI to unavailable, including when the flag was ready. The key stays present.
- A restart during the startup check kills cursor helpers that still use the smoke directory and removes that directory.

### 2026-10-09 — YORK-8Z9

- A reply with one JSON object and 40 characters or less of other text is that object when the object has an "answer" or "tools" key. "Here is my reply:" before a tools object is a tool plan. "Sure." before an answer object is an answer. A longer sentence that quotes a JSON object stays prose. A broken object, or two plan objects, asks for one JSON object again.
- A parent heading stays when any later section under it keeps text. "Eight-hour checklist" stays when "Shift start" loses an untraced step and "Mid shift" keeps "2. Log it".
- A heading with nothing under it drops when the next heading is the same level. "PUMPS" above "CHILLERS" drops. "PUMPS" above its own step still stays.
- A claude smoke retry writes the saved YORK_CLAUDE_CLI value back. A success with no saved value sets ready. The key is not deleted.

### 2026-10-09 — YORK-8Z8

- A heading drops only when the guard removed the raw text under it. "Eight-hour checklist" stays above "Shift start" when that step stays. "PUMPS" drops when its own sentence was removed. An empty "PUMPS" or "**Pumps**" still drops.
- Grok startup accepts a reply that is the number 5 alone, with an optional final period.
- "401" and "authentication_error" are sign-in errors, with the same 10 min wait.
- A prose reply that quotes a JSON object stays prose. JSON is read only when the whole reply, or a fenced block, is the object.

### 2026-10-09 — YORK-8Z7

- A heading has a body only when real content sits under it before the next heading of the same or higher level. "PUMPS" above "CHILLERS" is dropped. An empty "**Pumps**" is dropped. A "#" heading above a "##" heading that has a step stays.
- An equation uses × and ÷ before + and −, and it accepts parentheses. "(4.2 + 5 * 2 = 14.2)" stays. "= 18.4" is dropped.
- Grok startup asks "What is 2 + 3? Answer with the number only." and looks for 5 in the text events. A failure is tried once more. A grok reprobe uses the same waits as claude: 60 s, 2 min, 5 min, then every 10 min.
- Stream parsing is only for that startup launch. A chat reply stays the raw text, including several JSON lines.
- "Please run /login", "not logged in", and "invalid api key" are sign-in errors, with the same 10 min wait.
- A label moves only onto a sentence that continues the same topic. "The hall is warm." does not take the previous label. A newline does not carry the label.

### 2026-10-09 — YORK-8Z6

- Grok startup reads the tool list from the available_commands event and joins text events for the smoke token. The end event does not decide either check.
- A bullet keeps its label on the next kept sentence. "Chilled-water loop:" and "0 to 1 h:" stay with the bullet marker.
- A heading above a sub-heading that has a body stays. "Eight-hour checklist" stays above "Shift start".
- An equation is the whole left side, evaluated left to right. "5 + 5 - 5 = 5" stays. "2 * 3 + 4 = 14" is dropped.
- A chat reply that is several JSON lines stays whole. A grok stream uses the joined text events, or the result event when one is present.
- A claude reprobe leaves the unavailable flag in place. The waits are 60 s, 2 min, 5 min, then every 10 min. An "OAuth session expired" failure waits 10 min and logs that claude needs sign-in.

### 2026-10-09 — YORK-8Z5

- An empty heading is judged only up to the next heading. "PUMPS" with nothing under it is dropped. A later section does not keep that heading. "Hour 0 to 1" still counts as body because it contains digits.
- A heading or a bare label is exempt from the STE sentence filter. "WHAT WAS DONE (from the OptiView log)" and "What was done:" stay. When a label moves onto the next sentence, the label itself is not checked again. "The valve was closed by the operator." is still dropped.
- Quote marks balance across a whole line or bullet. A multi-sentence quoted alarm stays. An unmatched quote on its own is still dropped.
- An untraced number inside a bullet drops that sentence. The bullet marker moves onto the next kept sentence. A numbered step still drops the whole step when its first sentence fails.
- An equation accepts a Unicode minus and the operators ×, ÷, *, and /.
- An orphaned Reason keeps the newline before the next step.
- Grok startup reads the tools list and the smoke token from the final reply JSON. An earlier stream event does not decide the check.
- A claude exit with empty stderr logs stdout and the exit code. A probe every 60 seconds marks claude ready again when it recovers.

### 2026-10-09 — YORK-8Z4

- A plain label line keeps its label on the next kept sentence of that line. "Chilled-water loop: valve at 40% open (untraced 99). Supply 42.5 psig, return 52 psig." keeps "Chilled-water loop" with the supply sentence. A line whose sentences are all dropped loses the label too.
- A computed number stays only when the same sentence shows the equation, both inputs trace to the data, and the arithmetic is right. "CHW dP is 7.5 psi below target (17 - 9.5 = 7.5)." stays. A bare 7.5 is dropped. Wrong arithmetic is dropped. The prompt states this rule.
- An untraced number drops the sentence that holds it. The rest of the step stays, unless that sentence is the step's first sentence.
- Stacked headings keep the top heading. "Eight-hour checklist" stays above "Hour 0 to 1" and above "Shift start".
- Hour 4, After 6 hours, Every 4 h, Hours 0-2, At hour 8, and Within 2 hours are schedule labels. An answer that uses only those labels stays.
- A heading with a blank line and then content stays. A heading with nothing left under it is still dropped.
- A fact line with no final period is content when it has a digit or a colon followed by a value. "Plant: outdoor air 75 F, free cooling 0%" stays when 75 and 0 are traced.
- The raw debug log keeps the full text, with newlines escaped, and only when YORK_DEBUG_RAW is 1. The leak check still runs first. A raw text that contains a secret is withheld.

### 2026-10-09 — YORK-8Z3

- A schedule label is not a plant reading. Hour 2 to 4, Hours 4-8, 4-8 h, every 2 hours, t=8, and next 2 hours stay on an hour-by-hour list. Hall supply is 80 F is still dropped when 80 is not a live reading.
- A newline starts a new piece. A "- " bullet drops its later sentences with it. A heading with nothing left under it is dropped.
- A command on the next line, such as "Start it later.", stays with the dropped step. A new fact on that line, such as "The hall is warm.", stays in the answer.

### 2026-10-09 — YORK-8Z2

- A dropped step takes its marker with it. The % FLA filter, the quote filter, and the STE filter use the same step span as the number check. "4. A. Reason: a. 5. Watch the CW valve at 78% FLA. Reason: b. 6. C." becomes "4. A. Reason: a. 6. C."
- A newline that follows a period stays in the answer.
- A blank line, or a paragraph that is not part of the step, ends a dropped step. The paragraph after the list stays.

### 2026-10-09 — YORK-8Z

- A number is a whole token after a unit id such as CH-01 is removed. 95MW, -7, and each side of 118-140 are checked.
- The N+1 example numbers are not a corpus. The server stores the spare count on the snapshot. "Hall supply is 80 F." is dropped when 80 is not a live reading.
- A dropped step takes every sentence up to the next step marker.
- The quote filter and the % FLA filter keep the newline in front of a numbered step. A heading on its own line stays apart from that step.
- Grok startup asks for a streaming JSON tool report and stays off unless that report is "tools":[].
- Quiz passages stay out while a quiz question is open.
- The leak check runs before the raw log. A line that contains secret material is withheld.
- Elapsed time and timed-out tiers come from the server clock.
- A 12,000-character snapshot cut stays valid JSON, including a fleet of 45 units.

### 2026-10-09 — YORK-8Y

- A checklist marker is not rewritten. A reading such as 4.2 or 9.5 stays as written. A dropped step still takes its marker and the Reason after it. Gaps in the numbers stay.
- A heading on its own line stays apart from the next numbered step.
- A follow-up names chilled-water differential pressure, its target, condenser-water differential pressure, and condenser pressure as separate readings. Every pressure names its loop.

### 2026-10-09 — YORK-8X

- A checklist marker stays with its step. A dropped step takes that marker and the Reason after it.
- A follow-up gives claude at least 36 s. When a later tier can still run, claude also receives the spare time in front of that tier.
- A follow-up snapshot includes blocksWrites, the incident, and condenser pressure on each chiller row.

### 2026-10-09 — YORK-8W

- A follow-up sends chiller rows, numeric plant readings, and the active alarm. The OptiView log, the reason text, the shown strings, and the duplicate chiller blocks stay off that prompt.
- A follow-up gives claude the time left minus 1 s when no later tier can take its full budget after the 30 s cap.
- On round 0, claude keeps 15 s when cursor's 50 s still fits after that cap. When cursor's 50 s does not fit, cursor is skipped and claude gets the time left minus 1 s.

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
