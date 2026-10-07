---
title: "Copilot — Local models (Ollama)"
id: 17
slug: "copilot-local-ollama"
status: "complete"
authors:
  - "kadraman"
created: "2026-07-11"
updated: "2026-10-07"
issue: "https://github.com/kadraman/beatbax/issues/202"
area: "desktop"
related:
  - "docs/features/complete/ai-chatbot-assistant.md"
  - "docs/qa/copilot-test-scenarios.md"
---
## Summary

BeatBax Copilot (desktop only) works with any **OpenAI-compatible** endpoint. **Ollama** is a common choice for fully local, private inference. This guide covers recommended models, context sizes, and setup — especially for **Edit mode**, which requires the model to return the **entire updated song**, not a short snippet.

---

## Desktop setup

1. Install [Ollama](https://ollama.com/) and start the server (`ollama serve`).
2. Pull a model (see recommendations below).
3. In BeatBax: **Settings → Features** → enable **AI Copilot**.
4. **Settings → AI** → preset **Ollama (local)** → endpoint `http://localhost:11434/v1`.
5. Choose your model in the dropdown (use **Refresh** to list installed models). No API key is required.

---

## Recommended models

Prioritise **code-oriented** models. General chat models often return snippets or invalid BeatBax in Edit mode.

| Priority | Model | VRAM (approx.) | Notes |
| -------- | ----- | ---------------- | ----- |
| **Primary** | `qwen2.5-coder:7b` | ~5 GB (Q4) | Best balance on 8 GB GPUs; follow instructions reasonably well |
| Larger local | `qwen2.5-coder:14b` | ~9–10 GB (Q4) | Better full-song edits if it fits; slower |
| Alternative | `deepseek-coder-v2:16b` | ~10 GB (Q4) | Strong coder; needs headroom on 8 GB cards |
| Cloud fallback | OpenAI `gpt-4.1-mini` / Groq `openai/gpt-oss-120b` | N/A | Use when local models truncate or return partial files |

Avoid tiny models (`<7B`) for Edit mode on full songs like `songs/sample.bax` (~140 lines).

---

## Context size (`num_ctx`)

Ollama’s context window must fit **prompt + completion** together. BeatBax Edit mode sends a large system prompt (syntax reference + **full editor content**) and expects a **full song** back.

Rough budget for `songs/sample.bax` (142 lines, ~7.8k characters; measured 2026-10-02):

| Piece | Approx. size |
| ----- | ------------- |
| Copilot instructions + syntax reference | ~12k characters (~3k tokens) |
| Full song in the system prompt (Edit) | ~8k characters (~2k tokens) |
| User message | small |
| Model output (full song) | ~8k characters (~4k tokens; BeatBax notation is about 2 characters per token); the footer meter reserves the Edit reply budget, **8,192** tokens on Auto (2,048 for Ask), fitted to the room left in the window |
| Chat history (last 10 turns, soft cap ~2.5k tokens; prior full-song replies stubbed) | variable |
| Parse-repair retry | extra assistant + user messages |

The Copilot footer meter counts song text at ~2 characters per token and other text at ~4.

| `num_ctx` | Verdict |
| --------- | ------- |
| **8,192** | Too tight for `sample.bax` + history; models often return **snippets** instead of the full file |
| **16,384** | **Recommended minimum** — comfortable for `sample.bax`, one repair round, light history. This is the default **Model token window** for the Ollama and LM Studio presets |
| **32,768** | Better for long Copilot threads or songs **>200 lines**; slower, more KV cache |

Set the same value in **Settings → AI → Model token window** so the Copilot footer meter matches Ollama. When the meter is high or full, start a **New chat** rather than stacking more Edit turns (prior full-song replies are stubbed, but the system prompt + live song + reserved 8k completion still dominate). On a fresh Edit chat, `sample.bax` at 16k already shows about **93%** (instructions + song ~7k, reserved reply ~8k). A new chat cannot lower that, so the meter popup offers **Open AI settings** instead of **Start a new chat**; raise the token window (and `num_ctx`) to 32k if you want more headroom. The **Ask song excerpt** slider is unrelated — it only truncates the song pasted into Ask questions.

### Reply budget and reasoning on small windows

Request controls are specified in [spec 088](../088-copilot-request-controls/spec.md). For local models:

- **Fitted Edit reply budget.** On **Auto**, the Edit reply budget is 8,192 tokens, reduced to the room the prompt leaves in the **Model token window** (never below 2,048). A large song on a 16k window therefore gets a smaller budget, and the footer meter never shows more than 100%. **Settings → AI → Advanced** shows the value for the current chat, for example *Auto (about 5.2k for this chat)*.
- **Pre-send warning.** Before an Edit request, Copilot estimates the full-song reply (song characters ÷ 2, plus 1,024 tokens unless Reasoning effort is Off or Provider default). If that is larger than the budget, Copilot does not send and explains why, with **Send anyway** and **Open Settings**. Raise `num_ctx` and the Model token window together, set Reasoning effort to Off, or use a cloud model.
- **Reasoning effort Off for thinking models.** Thinking models such as `qwen3.5` spend hidden reasoning tokens from the same budget. On windows of **16k or less**, set **Reasoning effort → Off**. If the server rejects `none`, Copilot falls back to `minimal`, then `low`, then omits the field, and Settings shows the value that was sent. When a reply still runs out of budget, Copilot says whether reasoning used it up and leaves the editor unchanged.

### Setting context in Ollama

**Environment variable (session):**

```bash
OLLAMA_CONTEXT_LENGTH=16384 ollama serve
```

**Modelfile (persistent custom model):** recommended on macOS, where the menu-bar app ignores shell environment variables. Ready-made files are in [`docs/ollama/`](../../../docs/ollama/): `beatbax-coder.Modelfile` (below) and `beatbax-qwen3.Modelfile` (a thinking model for testing Reasoning effort).

```
FROM qwen2.5-coder:7b
PARAMETER num_ctx 16384
```

Then: `ollama create beatbax-coder -f Modelfile` and select `beatbax-coder` in BeatBax Settings → AI.

Restart Ollama after changing context length.

---

## Edit mode expectations

- Copilot **replaces the entire editor** with the model’s ` ```bax ` block.
- The model must return the **complete song** with your change integrated — not just the changed `pat` line.
- BeatBax validates parse errors before apply and **blocks incomplete responses** that would wipe most of the song (see [copilot-test-scenarios.md](../../../docs/qa/copilot-test-scenarios.md)).
- BeatBax waits at least **5 minutes** per request to a local endpoint (up to 10 minutes for reply budgets above 40k tokens). The **first request after restarting Ollama** is often slow (model load + 16k context) — a wait of 1–3 minutes is normal on a 7B model. If you see `⚠ AI request timed out`, retry once the model is warm, or check Task Manager that Ollama is using the GPU.
- If every request times out, look for **leftover `llama-server` processes** from an earlier Ollama session. `ollama ps` does not list them, but they keep their GPU memory, so the live model spills into shared system memory and generation drops to a few tokens per second while `ollama ps` still reports "100% GPU". Quit Ollama, end any remaining `llama-server.exe` in Task Manager, and start it again.
- Use **Discard** / Ctrl+Z if a bad edit slips through.

### Edit apply behaviour with local models

Small local models often reformat the whole song, leave definitions out, or need parse-repair retries. Desktop Copilot handles these replies as follows (QA findings 2026-10-03):

1. **Line endings.** The reply is converted to the editor's line endings (CRLF or LF) before diffing, merging, and applying. A CRLF song no longer counts every line as changed when the model replies with LF.
2. **Explanation on the card.** The explanation comes from the model's first Edit reply. A missing-`bax`-block, parse-repair, or incomplete-song retry reply is used only when the first reply had no explanation, because retry replies describe fixes to the model's own draft rather than the requested change. Lines the model copies from the previous-edit history summary (`[Previous Edit]`, `Stats:`, `Do not reuse the previous full file…`, and long lines repeated word for word) are dropped from the explanation.
3. **Definitions left out of the reply.** If the reply fails validation but merging its changed and new `pat` / `seq` / `inst` / `effect` / `channel` definitions into the current song produces a valid song, Copilot applies the merged song (card note: *Merged definition updates into your song*) instead of asking the model to repair. A repair is still requested when the merged song is also invalid. This stops a repair from removing references to definitions that exist in the user's song but were missing from the reply.
4. **Changes the merge cannot apply.** When the definition merge is used, other lines the reply added or changed (for example `play`, `bpm`, `song`, `subpat`) are not applied. The card lists them in a *Not merged* note so the explanation does not claim changes that never reached the editor.
5. **Blocked outcomes.** Every Edit turn that ends without applying a song shows **⚠ Not applied — editor unchanged** with the reason (parse errors, incomplete song, repair returned no song, no ` ```bax ` song in the reply, or a song identical to the current one). A reply with zero line changes is never shown as **✓ Kept in editor**, so the card cannot claim an edit the model did not make. The reply text stays available under the badge.
6. **Missing ` ```bax ` retry.** When the first Edit reply has no song, Copilot sends one follow-up with the current song and asks the model to apply the changes it described; returning the song unchanged is called out as invalid.
7. **Edit-mode history.** Edit requests do not send earlier Edit turns (the request and its full-song reply, or its `[Previous Edit]` summary). Small models copied that summary format and replied without a song (QA 2026-10-04). Instead the new request is prefixed with a note listing up to 3 distinct earlier Edit requests (200 characters each), marked as already applied and not to be repeated, so follow-ups such as "Now do the same for the bass" still resolve. Ask turns are still sent as history, and Ask mode is unchanged. The context meter counts Edit-mode history the same way.
8. **Reformat-only replies.** A large reply (more than 8 changed lines) that changes no definition and adds or changes no other song line (it only removes comments, reformats, or reorders lines) is blocked with **⚠ Not applied** and the reason *only removed comments, reformatted, or reordered lines*.
9. **Comment-only changes.** When every changed line is blank or a `#` / `//` comment, the card shows *⚠ Only comments or blank lines changed — no patterns, sequences, instruments, or other song lines were edited.* in place of the *Adjusted N lines* note. The change is still applied for review.
10. **Explanation mismatch.** When the explanation names `pat` / `seq` / `effect` definitions and none of them were added, updated, or removed (moving position does not count), the explanation ends with *⚠ The explanation mentions …, but those were not changed. The changes below are what reached the editor.* Instrument names are not checked because they are often ordinary words ("a snare hit").

### Tips for local models

- Use **New chat** before a large Edit so the window is spent on the song, not old turns.
- Prefer **Ask** for explanations; switch to **Edit** only when ready to apply.
- If edits keep failing, raise `num_ctx` to **32k** or use a cloud model for that session.
- With a thinking model on a 16k window, set **Reasoning effort → Off** (Settings → AI → Advanced).

---

## Hardware notes (example: RX 6600 8 GB + 32 GB RAM)

- `qwen2.5-coder:7b` Q4 fits comfortably with **16k** context.
- **32k** may work but is slower; watch GPU memory in Task Manager.
- System RAM helps when VRAM is tight (Ollama can offload), at a speed cost.

---

## Related docs

- [AI Chatbot Assistant (architecture)](../../../docs/features/complete/ai-chatbot-assistant.md)
- [CoPilot test scenarios](../../../docs/qa/copilot-test-scenarios.md)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
