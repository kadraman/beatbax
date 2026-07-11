---
title: "Copilot — Local models (Ollama)"
status: active
authors: ["kadraman"]
created: 2026-07-11
related:
  - docs/features/complete/ai-chatbot-assistant.md
  - docs/copilot-test-scenarios.md
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

Avoid tiny models (`<7B`) for Edit mode on full songs like `songs/sample.bax` (~130 lines).

---

## Context size (`num_ctx`)

Ollama’s context window must fit **prompt + completion** together. BeatBax Edit mode sends a large system prompt (syntax reference + **full editor content**) and expects a **full song** back.

Rough budget for `songs/sample.bax`:

| Piece | Approx. size |
| ----- | ------------- |
| Copilot system prompt | ~11–12k characters (~3k–4k tokens) |
| User message | small |
| Model output (full song) | ~7k characters (~2k tokens) |
| Chat history (up to 10 turns) | variable |
| Parse-repair retry | extra assistant + user messages |

| `num_ctx` | Verdict |
| --------- | ------- |
| **8,192** | Too tight for `sample.bax` + history; models often return **snippets** instead of the full file |
| **16,384** | **Recommended minimum** — comfortable for `sample.bax`, one repair round, light history |
| **32,768** | Better for long Copilot threads or songs **>200 lines**; slower, more KV cache |

### Setting context in Ollama

**Environment variable (session):**

```bash
OLLAMA_CONTEXT_LENGTH=16384 ollama serve
```

**Modelfile (persistent custom model):**

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
- BeatBax validates parse errors before apply and **blocks incomplete responses** that would wipe most of the song (see [copilot-test-scenarios.md](../copilot-test-scenarios.md)).
- BeatBax waits up to **5 minutes** per request to a local endpoint. The **first request after restarting Ollama** is often slow (model load + 16k context) — a wait of 1–3 minutes is normal on a 7B model. If you see `⚠ AI request timed out`, retry once the model is warm, or check Task Manager that Ollama is using the GPU.
- Use **Discard** / Ctrl+Z if a bad edit slips through.

### Tips for local models

- **Clear Copilot chat** before a large Edit (saves context for the song).
- Prefer **Ask** for explanations; switch to **Edit** only when ready to apply.
- If edits keep failing, raise `num_ctx` to **32k** or use a cloud model for that session.

---

## Hardware notes (example: RX 6600 8 GB + 32 GB RAM)

- `qwen2.5-coder:7b` Q4 fits comfortably with **16k** context.
- **32k** may work but is slower; watch GPU memory in Task Manager.
- System RAM helps when VRAM is tight (Ollama can offload), at a speed cost.

---

## Related docs

- [AI Chatbot Assistant (architecture)](./complete/ai-chatbot-assistant.md)
- [CoPilot test scenarios](../copilot-test-scenarios.md)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
