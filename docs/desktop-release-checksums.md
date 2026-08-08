# Verifying desktop release downloads

Each `desktop-v*` GitHub Release attaches installer files plus **`SHA256SUMS`**.

When GitHub Actions secrets `GPG_PRIVATE_KEY` (and optionally `GPG_PASSPHRASE` / `GPG_KEY_ID`) are configured, the release job also:

1. Signs `.deb` packages with **`dpkg-sig`** (GPG `builder` signature inside the package)
2. Detach-signs **`SHA256SUMS.asc`**
3. Uploads **`beatbax-release.asc`** (public key for that release)

Linux has no Gatekeeper/SmartScreen equivalent for direct GitHub downloads; checksums and GPG are the recommended integrity checks (and are useful on every platform).

## 1. Checksums

Download the installer(s) you want plus `SHA256SUMS` from the same release:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

`--ignore-missing` verifies only the files you downloaded.

On macOS without GNU coreutils:

```bash
shasum -a 256 -c SHA256SUMS
```

## 2. Verify SHA256SUMS with GPG (when `SHA256SUMS.asc` is present)

Import the BeatBax release public key (prefer the copy in this repo once committed; otherwise download `beatbax-release.asc` from the release):

```bash
# From a clone of this repository (after docs/keys/beatbax-release.asc exists):
gpg --import docs/keys/beatbax-release.asc

# Or from the release asset:
gpg --import beatbax-release.asc
```

Then:

```bash
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing
```

A good result shows a valid signature from the BeatBax release key, then `OK` for each file you have.

## 3. Verify a signed `.deb` (when GPG was enabled for that release)

```bash
# Debian/Ubuntu:
sudo apt-get install -y dpkg-sig
gpg --import docs/keys/beatbax-release.asc   # or beatbax-release.asc from the release
dpkg-sig --verify BeatBax-*-linux-amd64.deb
```

You should see a valid `builder` signature. Then install as usual:

```bash
sudo dpkg -i BeatBax-*-linux-amd64.deb
```

AppImage builds are covered by `SHA256SUMS` / `SHA256SUMS.asc` (no embedded deb signature).

## Enabling GPG in CI (maintainers)

1. Create a signing key and commit the public key — see [keys/README.md](keys/README.md).
2. Add GitHub Actions secrets:

| Secret | Purpose |
|--------|---------|
| `GPG_PRIVATE_KEY` | Armored private key |
| `GPG_PASSPHRASE` | Passphrase (omit if unprotected) |
| `GPG_KEY_ID` | Key ID / fingerprint (recommended) |

3. Tag a `desktop-v*` release. The release job will sign `.deb` files, write `SHA256SUMS` **after** that, detach-sign the sums file, and upload `beatbax-release.asc`.

Without `GPG_PRIVATE_KEY`, only unsigned `SHA256SUMS` is published (installers still ship).
