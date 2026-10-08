# Copilot with local models (Ollama and LM Studio)

BeatBax Desktop's Copilot can use a model running on your own computer, so your songs never leave it and no API key is needed. This page covers setup for [Ollama](https://ollama.com/) and [LM Studio](https://lmstudio.ai/).

Local models work best in **Ask** mode. **Edit** mode is harder: the model has to read your whole song and write the whole song back with your change in it, so it needs a capable model and enough context.

## Choose a model

Use a code-oriented model. General chat models often reply with a snippet instead of the full song.

| Model | Memory (approx.) | Notes |
| ----- | ---------------- | ----- |
| `qwen2.5-coder` 7B | ~5 GB (Q4) | Best starting point on an 8 GB GPU |
| `qwen2.5-coder` 14B | ~12 GB at 16k context (Q4) | Needs about 24 GB of memory or a 16 GB GPU. On a 16 GB Mac it runs partly on the CPU and a full-song Edit takes over 5 minutes, so requests time out |
| `deepseek-coder-v2` 16B | ~10 GB (Q4) | Strong, needs headroom on 8 GB cards |

Avoid models smaller than 7B for Edit mode. Thinking models (they reason before answering) use part of the reply budget for reasoning; on a 16k context, set **Settings → AI → Advanced → Reasoning effort** to **Off**.

## Context size

The model's context must hold the instructions, your song, the chat so far and the reply. For a song like `songs/sample.bax` (about 140 lines):

| Context | Verdict |
| ------- | ------- |
| 8,192 | Too small; expect snippets instead of full songs |
| **16,384** | Recommended minimum |
| 32,768 | Better for long chats or songs over 200 lines; slower and uses more memory |

Whatever you choose, set **Settings → AI → Model token window** to the same number. BeatBax cannot read the server's real context size, so this setting is what the footer meter and the reply budget are based on.

## Ollama

1. Install Ollama and make sure it is running.
2. Pull a model, for example `ollama pull qwen2.5-coder:7b`.
3. Give it a 16k context. Either start the server with `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`, or create a model with the context built in (recommended on macOS, where the menu-bar app ignores shell variables):

   ```
   FROM qwen2.5-coder:7b
   PARAMETER num_ctx 16384
   ```

   Save that as `Modelfile`, run `ollama create beatbax-coder -f Modelfile`, and restart Ollama. A ready-made copy is in [`docs/ollama/beatbax-coder.Modelfile`](../ollama/beatbax-coder.Modelfile).
4. In BeatBax: **Settings → Features** → turn on **AI Copilot**.
5. **Settings → AI** → Provider preset **Ollama (local)**. Press **Refresh** next to Model and pick your model (for example `beatbax-coder`).
6. Set **Model token window** to the context you chose (16384).

## LM Studio

LM Studio works the same way from BeatBax's side, but three of its defaults need changing.

1. In LM Studio, download a model (see the table above).
2. Open the **Developer** tab and start the server. It listens on port 1234. Unlike Ollama, LM Studio does not serve the API until you start it.
3. Load the model with **Context Length** set to at least **16384**. LM Studio's default is often 2,048–4,096, which is far too small for Edit mode.
4. Set **Context Overflow** to **Stop at Limit** (**My Models** → gear icon next to the model → **Inference**). The default, *Truncate Middle*, quietly cuts out the middle of a prompt that is too long, which can be part of your song, and the edit that comes back looks fine but is wrong. With *Stop at Limit*, the reply stops short instead, so you see a failed edit rather than a wrong one.
5. In BeatBax: **Settings → Features** → turn on **AI Copilot**.
6. **Settings → AI** → Provider preset **LM Studio (local)**. Press **Refresh** next to Model and pick the loaded model. The preset's default name, `local-model`, is only a placeholder.
7. Set **Model token window** to the Context Length you loaded the model with.

Prefer a non-thinking model in LM Studio. On some of its engines (notably MLX on Apple silicon) the **Reasoning effort** setting is ignored, so turning it **Off** may not stop a thinking model from using its whole reply budget on reasoning.

## The footer meter

The bar and percentage next to the mode picker show how much of the model's context the next request will use, including the room kept for the reply. A high percentage on its own is normal: the reply budget grows to fill the room it is given.

- **No colour:** the reply fits.
- **Amber:** chat history is shrinking the room for the reply. Start a new chat.
- **Red:** the song's reply will not fit. Raise the context (in Ollama or LM Studio, and the Model token window to match), set Reasoning effort to Off, or switch to a cloud model.

Hover the meter for a breakdown.

## Troubleshooting

- **The first request is very slow.** The first request after starting the server loads the model; 1–3 minutes on a 7B model is normal. BeatBax waits at least 5 minutes for a local reply.
- **Every request times out.** Check that the model is running on the GPU. With Ollama, look for leftover `llama-server` processes from an earlier session (they hold GPU memory but do not show in `ollama ps`); quit Ollama, end them, and start again.
- **Replies are snippets, or edits keep failing.** Raise the context to 32k, start a new chat before a big edit, or try a larger model.
- **An edit is missing parts of the song (LM Studio).** Check that Context Overflow is set to *Stop at Limit* and that the Context Length matches the Model token window.
- **"Not applied — editor unchanged".** Copilot refused a reply that would have broken or wiped the song. The card says why; try again, simplify the request, or use a cloud model for that edit.

More detail for maintainers is in [spec 017](../../specs/complete/017-copilot-local-ollama/spec.md). To check a model or provider end to end, run the [Copilot test scenarios](../qa/copilot-test-scenarios.md).
