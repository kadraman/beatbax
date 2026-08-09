# Windows installers and SmartScreen

BeatBax Desktop **macOS** installers are Developer ID signed and notarized; **Windows** installers are intentionally unsigned for now.

Azure Trusted Signing Public Trust is not available to individual developers in the UK (US/Canada only for individuals; organization validation requires a legal entity). Until that changes—or another CI-friendly signing option fits—Windows builds ship unsigned.

## Downloads

1. **Preferred:** [https://kadraman.itch.io/beatbax](https://kadraman.itch.io/beatbax)
2. **Also:** [GitHub Releases](https://github.com/kadraman/beatbax/releases) (`desktop-v*` tags)

## What users see

On Windows 10/11, SmartScreen may show:

> **Windows protected your PC**  
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.  
> Running this app might put your PC at risk.

That warning is expected for unsigned `.exe` files from the internet. It does **not** mean the download is malware; BeatBax Desktop is built by the project’s public GitHub Actions workflow and the source is open.

## Workaround (install anyway)

1. Download `BeatBax-*-setup.exe` (or the portable `.exe`) from [itch.io](https://kadraman.itch.io/beatbax) (preferred) or [GitHub Releases](https://github.com/kadraman/beatbax/releases).
2. Run the file.
3. When SmartScreen appears, click **More info**.
4. Click **Run anyway**.
5. Continue through the installer (or run the portable build).

Optional checks (GitHub Releases):

- Confirm the release tag and asset name match what you intended.
- Verify the file hash against `SHA256SUMS` on the same release (see [desktop-release-checksums.md](desktop-release-checksums.md)).

Browsers may also quarantine downloads; if Windows blocks the file before SmartScreen, use **… → Keep** / **Keep anyway** in the browser download UI, then use the steps above.

## Trust notes for maintainers

| Platform | Current policy |
|----------|----------------|
| macOS | Signed + notarized in CI when Apple secrets are present |
| Windows | Unsigned; document SmartScreen **More info → Run anyway** |
| Linux | No OS Gatekeeper equivalent; publish `SHA256SUMS` (+ GPG / signed `.deb` when secrets set) on GitHub Releases |

Do not add Azure Trusted Signing GitHub secrets for the current maintainer setup unless eligibility changes (organization in an allowed region, or individual in US/Canada). Soft-fail Azure wiring may still exist in CI for future use; without secrets, Windows artifacts remain unsigned.

## Related

- [docs/releasing.md](releasing.md) — release tags and signing overview
- [apps/desktop/build/README.template.txt](../apps/desktop/build/README.template.txt) — user-facing install notes bundled with the app
- [desktop-release-checksums.md](desktop-release-checksums.md) — download integrity
