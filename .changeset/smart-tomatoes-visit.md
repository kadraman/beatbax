---
"@beatbax/engine": patch
---

Reject insecure remote DMC sample URLs in `resolveDMCSample()` so remote sample loading stays consistent with the desktop allowlist policy.

- `http://` sample references are now rejected as unsupported.
- Remote sample URLs with embedded credentials or explicit ports are also rejected by desktop policy.
- Existing `https://`, `github:`, `local:`, and `@nes/` sample behavior is unchanged.
