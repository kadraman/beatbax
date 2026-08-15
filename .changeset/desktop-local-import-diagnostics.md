---
"@beatbax/app-core": patch
---

Clear false "instrument is not defined" diagnostics after a successful `local:` import (monorepo internal).

The parser warns on channel lines such as `channel 2 => inst adv_harm` before `.ins` files are merged. Desktop now drops those issues once the resolved AST contains the imported names, matching CLI verify. Also inject Electron `readFile`/`existsSync` into import resolver options so Desktop can load `local:` kits next to the saved song.
