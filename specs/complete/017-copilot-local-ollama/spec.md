---
title: "Copilot — Local models (Ollama, LM Studio)"
id: 17
slug: "copilot-local-ollama"
status: "complete"
authors:
  - "kadraman"
created: "2026-07-11"
updated: "2026-10-08"
issue: "https://github.com/kadraman/beatbax/issues/202"
area: "desktop"
related:
  - "docs/features/complete/ai-chatbot-assistant.md"
  - "docs/qa/copilot-test-scenarios.md"
  - "docs/ui/copilot-local-models.md"
---
## Summary

BeatBax Copilot (desktop only) works with any **OpenAI-compatible** endpoint. **Ollama** is a common choice for fully local, private inference; **LM Studio** works the same way from Copilot's side but needs more setup inside LM Studio (see [LM Studio](#lm-studio)). This guide covers recommended models, context sizes, and setup — especially for **Edit mode**, which requires the model to return the **entire updated song**, not a short snippet. The user-facing version is [docs/ui/copilot-local-models.md](../../../docs/ui/copilot-local-models.md).

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
| Larger local | `qwen2.5-coder:14b` | ~12 GB at 16k context (Q4) | Needs about 24 GB of memory (or a 16 GB GPU). On a 16 GB Apple M4 it spills partly to the CPU and a full-song Edit takes over 5 minutes (see Hardware notes); edit quality not yet compared with the 7B |
| Alternative | `deepseek-coder-v2:16b` | ~10 GB (Q4) | Strong coder; needs headroom on 8 GB cards |
| Cloud fallback | OpenAI `gpt-4.1-mini` | N/A | Use when local models truncate or return partial files |

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

Set the same value in **Settings → AI → Model token window** so the Copilot footer meter matches Ollama. When the meter turns amber, chat history is shrinking the reply budget: start a **New chat** rather than stacking more Edit turns. On a fresh Edit chat, `sample.bax` at 16k already shows about **93%** (instructions + song ~7k, reserved reply ~8k) with no warning, because the reply still fits. The meter turns red only when the song's reply will not fit (the same check as the pre-send warning); then raise the token window (and `num_ctx`) to 32k, set Reasoning effort to Off, or use a cloud model ([spec 088 FR-018, FR-019](../088-copilot-request-controls/spec.md)). The **Ask song excerpt** slider is unrelated — it only truncates the song pasted into Ask questions.

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

## LM Studio

Copilot has no LM Studio-specific code: the **LM Studio (local)** preset is an OpenAI-compatible endpoint (`http://localhost:1234/v1`) on a loopback host, so it gets the same treatment as Ollama — no API key, the 5-minute local timeout, the live **Refresh** model list, the same meter, Auto reply budget and pre-send warning. The differences are all on LM Studio's side (checked against LM Studio's docs and bug tracker, 2026-10-08; not yet covered by a QA run):

| Setting in LM Studio | What to do | Why |
| --- | --- | --- |
| **Server** | Start it in the **Developer** tab (port 1234) | Unlike Ollama, LM Studio does not serve the API until you start it |
| **Context Length** (model load setting) | Load the model with at least **16,384**, and set **Settings → AI → Model token window** to the same value | This is LM Studio's equivalent of `num_ctx`. Its default is often 2,048–4,096 depending on the model, far too small for Edit mode |
| **Context Overflow** (My Models → gear → Inference) | **Stop at Limit** | The default, **Truncate Middle**, silently drops the middle of an oversized prompt (which can be part of the song) and keeps generating, so Copilot receives a plausible but wrong edit instead of a cut-off reply it can explain |
| **Model** | Use **Refresh** in Settings → AI and pick the identifier of the loaded model | The preset's default `local-model` is a placeholder |

**Reasoning effort.** Copilot sends `reasoning_effort` (Auto = `low`). LM Studio accepts the field without an error, but on some engines (notably MLX on Apple silicon) it does not reach the model's chat template and is ignored ([lmstudio-bug-tracker#2413](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2413)). Copilot cannot detect this, so **Reasoning effort → Off** may have no effect and a thinking model can spend the whole reply budget on reasoning; the `finish_reason: "length"` diagnostics ([spec 088](../088-copilot-request-controls/spec.md) FR-002) still explain the failure. Prefer a non-thinking coder model (for example `qwen2.5-coder` 7B) in LM Studio.

The model recommendations, `num_ctx` sizing table and Edit-mode expectations above apply to LM Studio unchanged, with Context Length in place of `num_ctx`.

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
11. **Duplicate definitions.** A reply that defines a `pat` / `seq` / `inst` / `effect` name more than once, and more often than the current song does, is not merged (item 3 does not apply). It goes through the parse-repair loop with the duplicates and their line numbers listed (notice *Duplicate definitions — asking Copilot to fix (n/2)…* when they are the only problem); if they remain, the card shows **⚠ Not applied** with *Duplicate definition: `pat melody_vib` is defined more than once (lines A and B).* Duplicates already in the user's song do not count. See [spec 092](../092-duplicate-definition-warnings/spec.md).

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

## Hardware notes (example: Apple M4, 16 GB unified memory)

Measured 2026-10-08 with Ollama 0.40.0 (menu-bar app, default settings), `num_ctx` 16384, a 2,079-token prompt (`songs/sample.bax` plus a one-line Edit request) and 600 generated tokens:

| Model | Memory (`ollama ps`) | Placement | Load (cold) | Prompt | Generation |
| --- | --- | --- | --- | --- | --- |
| `qwen2.5-coder:7b` | 5.5 GB | 100% GPU | 4 s | 179 tokens/s | 21 tokens/s |
| `qwen2.5-coder:14b` | 12 GB | 91% GPU, 9% CPU | 18 s | 74 tokens/s | 8.6 tokens/s |

A real Edit on `sample.bax` is about 5k prompt tokens (instructions plus song) and a ~2k-token reply. That is roughly **2–2.5 minutes** on the 7B and **5–6 minutes** on the 14B, so the 14B reaches the 5-minute local timeout. Use the 7B on 16 GB Macs; the 14B needs more memory to stay on the GPU.

Song token density varies with the tokenizer and the song. With Qwen's tokenizer, `sample.bax` is 3.8 characters per token and hand-written NES songs 3.4–3.7, but the MIDI-imported cover `songs/covers/bax/nes/aha-take_on_me.bax` is 2.2. Copilot's estimate of 2 characters per token ([spec 088](../088-copilot-request-controls/spec.md) FR-016, FR-017) is therefore close for MIDI imports and about twice the real count for hand-written songs on Qwen models, so the meter and pre-send warning err on the cautious side there.

---

## Related docs

- [Copilot with local models (user guide)](../../../docs/ui/copilot-local-models.md)
- [AI Chatbot Assistant (architecture)](../../../docs/features/complete/ai-chatbot-assistant.md)
- [CoPilot test scenarios](../../../docs/qa/copilot-test-scenarios.md)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [LM Studio OpenAI-compatible endpoints](https://beta.lmstudio.ai/docs/developer/openai-compat)
