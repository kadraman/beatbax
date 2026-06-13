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

Desktop releases use **git tags** and the [Desktop: Build](https://github.com/kadraman/beatbax/actions/workflows/desktop-build.yaml) workflow.

### Tag format

```
desktop-v<semver>
```

Example: `desktop-v0.1.0`, `desktop-v0.2.0`

### Publish a new desktop release

1. Ensure `main` is green (CI + desktop validate job).

2. Create and push an annotated tag on the commit to release:

   ```powershell
   git tag -a desktop-v0.2.0 -m "BeatBax Desktop v0.2.0"
   git push origin desktop-v0.2.0
   ```

3. GitHub Actions runs automatically:
   - **Validate** — unit tests + Playwright e2e
   - **Package** — matrix build on ubuntu / windows / macos → installers
   - **Publish desktop release** — uploads assets to GitHub Releases

### Installer artifacts

| Platform | Files |
|----------|-------|
| Windows | `BeatBax-<version>-setup.exe` (NSIS), `BeatBax-<version>-win-x64.exe` (portable) |
| macOS | `BeatBax-<version>.dmg`, `BeatBax-<version>-mac-arm64.zip` |
| Linux | `BeatBax-<version>.AppImage`, `BeatBax-<version>-linux-amd64.deb` |

Only top-level installer files are attached to the release (not unpacked app directories).

### Re-run packaging without a new tag

To build installers on `main` without publishing a release:

```powershell
gh workflow run "Desktop: Build" --ref main
```

This runs validate + package jobs only (no release job — release requires a `desktop-v*` tag).

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
- [docs/qa/desktop-release-qa.md](qa/desktop-release-qa.md) — QA sign-off template
- [docs/features/desktop-client-enhancements.md](features/desktop-client-enhancements.md) — post-MVP desktop work (signing, auto-update)
