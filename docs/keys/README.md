# BeatBax release signing keys

This directory holds the **public** GPG key used to:

1. Detach-sign `SHA256SUMS` on each `desktop-v*` GitHub Release (`SHA256SUMS.asc`)
2. Sign Debian packages with `dpkg-sig` (`builder` signature inside the `.deb`)

The private key must **never** be committed. Store it only as GitHub Actions secrets.

## Files


| File                  | Purpose                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `beatbax-release.asc` | Armored public key — **add and commit this** after you create the key (not in the repo until then) |


CI also attaches `beatbax-release.asc` to each release when GPG secrets are configured, so users can fetch it from the release assets if needed.

## Create a key (maintainers)

```bash
gpg --full-generate-key
# RSA and RSA, 4096 bits, expire 2y (or no expiration), name "BeatBax Release", email you control

gpg --list-secret-keys --keyid-format LONG
# note the key ID / fingerprint

gpg --armor --export YOUR_KEY_ID > docs/keys/beatbax-release.asc
git add docs/keys/beatbax-release.asc
```

Export the private key for CI (keep offline / password manager; do not commit):

```bash
gpg --armor --export-secret-keys YOUR_KEY_ID > beatbax-release-private.asc
```



## GitHub Actions secrets


| Secret            | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `GPG_PRIVATE_KEY` | Full armored private key (`beatbax-release-private.asc` contents) |
| `GPG_PASSPHRASE`  | Passphrase (omit secret if the key has none)                      |
| `GPG_KEY_ID`      | Long key ID or fingerprint (recommended)                          |




## User verification

See [desktop-release-checksums.md](../desktop-release-checksums.md).
