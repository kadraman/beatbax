# Releasing BeatBax

BeatBax has two release channels: **npm packages** (engine, CLI, plugins) and **desktop installers** (GitHub Releases).

---

## npm packages

Published packages: `@beatbax/engine`, `@beatbax/cli`, and `@beatbax/plugin-*`.

Private workspace packages (`@beatbax/web-ui`, `@beatbax/app-core`, `@beatbax/desktop`) are listed in `.changeset/config.json` `ignore` and are **not** versioned or published via Changesets.

### Workflow

1. Add a changeset when changing a published package:

   ```powershell
   npx changeset
   ```

2. On `main`, apply version bumps and changelogs:

   ```powershell
   npm run version-packages
   ```

3. Build and publish to npm:

   ```powershell
   npm run release
   ```

`npm run release` runs `build-all` then `changeset publish`.

---

## Desktop installers

Desktop releases use the [Desktop: Build](https://github.com/kadraman/beatbax/actions/workflows/desktop-build.yaml) workflow.

There are two GitHub Release channels:

| Channel | Tag | When | GitHub “Latest” |
|---------|-----|------|-----------------|
| **Stable** | `desktop-v<semver>` (e.g. `desktop-v0.2.0`) | You push an annotated tag | Yes |
| **Development** | `desktop-dev` (rolling) | Desktop-related files land on `main` | No (pre-release) |

Development installers: [github.com/kadraman/beatbax/releases/tag/desktop-dev](https://github.com/kadraman/beatbax/releases/tag/desktop-dev). Stable changelog: [apps/desktop/CHANGELOG.md](../apps/desktop/CHANGELOG.md).

### Tag format (stable)

```
desktop-v<semver>
```

Example: `desktop-v0.1.0`, `desktop-v0.2.0`

### Publish a new stable desktop release

1. Ensure `main` is green (CI + desktop validate job).

2. Optionally edit `apps/desktop/build/release-notes.body.txt` with curated highlights. CI merges that file with GitHub’s auto-generated notes (PR titles since the previous `desktop-v*` tag) into the GitHub Release body and writes a new section into `apps/desktop/CHANGELOG.md` on `main`.

3. Create and push an annotated tag on the commit to release:

   ```powershell
   git tag -a desktop-v0.2.0 -m "BeatBax Desktop v0.2.0"
   git push origin desktop-v0.2.0
   ```

4. GitHub Actions runs automatically:
   - **Validate** — unit tests + Playwright e2e
   - **Package** — matrix build on ubuntu / windows / macos → installers
   - **Publish desktop release** — uploads assets to GitHub Releases
   - **CHANGELOG.md** — prepends GitHub-generated notes and pushes to `main` with `[skip ci]`

### Development pre-release

A push to `main` that touches desktop-related paths (see below) validates, packages all three OSes, then **deletes and recreates** the `desktop-dev` pre-release. It never replaces the latest stable release (`prerelease: true`, `make_latest: false`).

- App version inside the build: `<package.json version>-dev.<shortsha>` (not committed).
- Download names stay stable: `BeatBax-dev-setup.exe`, `BeatBax-dev.dmg`, `BeatBax-dev.AppImage`, and `BeatBax-dev-*` for the other artifacts.
- Release notes list pull requests **since the last `desktop-v*` tag**, not since the previous development pointer.
- Rapid pushes cancel the previous in-progress `main` run (macOS minutes are the expensive part). A commit that is already tagged `desktop-v*` does not also publish Development.

**Leave GitHub Immutable Releases off** for this repository. That feature forbids moving tags and overwriting assets, which this rolling channel requires.

Trigger paths (PRs and the development package job):

- `apps/desktop/**` (except `CHANGELOG.md`, which does not retrigger packaging)
- `packages/app-core/**`, `packages/engine/**`, `packages/ui-tokens/**`, `packages/plugins/**`
- `songs/**`
- `apps/web-ui/public/**`, `apps/web-ui/src/utils/browser-path.ts`
- `scripts/link-local-engine.cjs`, `scripts/link-local-plugins.cjs`
- `package.json`, `package-lock.json`
- `.github/workflows/desktop-build.yaml`

Unrelated `main` pushes skip desktop validate and packaging.

### Installer artifacts

| Platform | Stable | Development |
|----------|--------|-------------|
| Windows | `BeatBax-<version>-setup.exe` (NSIS), `BeatBax-<version>-win-x64.exe` (portable) | `BeatBax-dev-setup.exe`, `BeatBax-dev-win-x64.exe` |
| macOS | `BeatBax-<version>.dmg`, `BeatBax-<version>-mac-arm64.zip` | `BeatBax-dev.dmg`, `BeatBax-dev-mac-arm64.zip` |
| Linux | `BeatBax-<version>.AppImage`, `BeatBax-<version>-linux-amd64.deb` | `BeatBax-dev.AppImage`, `BeatBax-dev-linux-*.deb` |

Only top-level installer files are attached to the release (not unpacked app directories).

### Code signing

| Platform | Release CI (with secrets) | Local `npm run desktop:dist` |
|----------|---------------------------|------------------------------|
| macOS | Developer ID signed + notarized (`MACOS_CERTIFICATE` / `MACOS_CERTIFICATE_PWD`, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for `scripts/notarize.cjs`) | Unsigned unless those env vars are set locally |
| Windows | **Intentionally unsigned**. SmartScreen may warn — see [desktop-windows-signing-setup.md](desktop-windows-signing-setup.md) | Unsigned |
| Linux | No OS Gatekeeper equivalent. Releases always publish `SHA256SUMS`. With GPG secrets: also `SHA256SUMS.asc`, `beatbax-release.asc`, and `dpkg-sig`-signed `.deb` packages | N/A |

**Optional Linux/integrity secrets:** `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE`, `GPG_KEY_ID` — detach-sign `SHA256SUMS`, sign `.deb` with `dpkg-sig`, and publish the public key. See [keys/README.md](keys/README.md).

The package job verifies macOS artifacts with `codesign` / `spctl` when the certificate secret is present. Windows builds are not Authenticode-signed. Without Apple secrets, CI still builds installers but skips macOS signing and verification.

Desktop release assets always include `SHA256SUMS`. When GPG secrets are configured, `.deb` packages are signed before hashing, then `SHA256SUMS.asc` and `beatbax-release.asc` are attached. Details: [desktop-release-checksums.md](desktop-release-checksums.md).

`generate-install-docs.cjs` runs during `desktop:dist` / the CI package job and bundles `README.txt` plus `RELEASE-NOTES.txt`. Curated installer notes still come from `apps/desktop/build/release-notes.body.txt` (optional). GitHub Release notes merge that curated file with pull-request titles from GitHub’s generate-notes API (comparison base: last `desktop-v*` tag, so npm package tags are not used).

Windows SmartScreen workaround for users: [desktop-windows-signing-setup.md](desktop-windows-signing-setup.md).

### Re-run packaging without a new tag

To build installers on `main` without publishing a release:

1. Push the latest workflow to `main` (GitHub uses the workflow file from the branch you select).
2. Actions → **Desktop: Build** → **Run workflow**.
3. Leave **Build platform installers** checked.
4. Optionally check **Skip unit/e2e validate** for a faster signing smoke test.
5. Run on branch `main`.

Or from the CLI:

```bash
gh workflow run "Desktop: Build" --ref main -f build_installers=true -f skip_validate=true
```

Expect three **Package desktop** jobs (ubuntu / windows / macos). The **Publish desktop release** job stays skipped unless the ref is a `desktop-v*` tag. Manual dispatch does **not** publish the Development pre-release (that only happens on a path-filtered push to `main`).

### Local build

```powershell
npm run desktop:dist
```

Output: `apps/desktop/dist/`

---

## Web-lite deploy

The browser client at [app.beatbax.com](https://app.beatbax.com) is deployed separately via `.github/workflows/beatbax-build.yaml` when `apps/web-ui` changes land on `main`. It does not use desktop tags.

---

## Related docs

- [apps/desktop/README.md](../apps/desktop/README.md) — desktop dev and scope
- [apps/desktop/CHANGELOG.md](../apps/desktop/CHANGELOG.md) — stable desktop release notes
- [docs/qa/desktop-release-qa.md](qa/desktop-release-qa.md) — QA sign-off template
- [docs/features/complete/desktop-client-enhancements.md](features/complete/desktop-client-enhancements.md) — post-MVP desktop work (auto-update, etc.)
- [docs/desktop-windows-signing-setup.md](desktop-windows-signing-setup.md) — Windows unsigned policy + SmartScreen workaround
- [docs/desktop-release-checksums.md](desktop-release-checksums.md) — SHA256SUMS / GPG / `.deb` verify
- [docs/keys/README.md](keys/README.md) — create and publish the release GPG public key
