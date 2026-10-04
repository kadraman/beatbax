---
"@beatbax/desktop": patch
---

Make Copilot Edit results match what reaches the editor, especially with local models (monorepo internal).

The card explanation now comes from the model's first reply instead of a parse-repair retry, and lines the model copies from the previous turn's summary are dropped. Replies are converted to the editor's line endings before diffing, so CRLF songs no longer show every line as changed. A reply that fails to parse only because it left definitions out is merged into the song instead of being "repaired" by removing references. Changes the definition merge cannot apply (such as the `play` line) are listed in a *Not merged* note, and every Edit turn that leaves the editor unchanged shows the **Not applied** badge with a reason, including replies identical to the current song and replies that only strip comments or reformat.

Edit requests no longer send earlier Edit turns to the model, which small models imitated instead of returning a song; the earlier requests are listed in the new message so follow-ups like "do the same for the bass" still work. The card warns when only comments changed, and when the explanation names patterns or sequences that were not changed.

The context meter popup's **Start a new chat** is now a button, shown only when chat history is using the window. A fresh chat that is already high (instructions + song + reserved reply) offers **Open AI settings** instead.
