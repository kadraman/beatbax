#!/usr/bin/env bash
# Flatten packaged installer artifacts, optionally GPG-sign .deb files and SHA256SUMS.
set -euo pipefail

mkdir -p release-flat
find release-artifacts -type f \( \
  -name 'BeatBax-*.exe' -o \
  -name 'BeatBax-*.dmg' -o \
  -name 'BeatBax-*.zip' -o \
  -name 'BeatBax-*.AppImage' -o \
  -name 'BeatBax-*.deb' \
\) -exec cp -n {} release-flat/ \;
cd release-flat

if [ -z "${GPG_PRIVATE_KEY:-}" ]; then
  echo "GPG_PRIVATE_KEY not configured; publishing unsigned SHA256SUMS only"
  sha256sum BeatBax-* | tee SHA256SUMS
  exit 0
fi

sudo apt-get update
# dpkg-sig is not packaged on Ubuntu 24.04 (noble). Prefer it when
# available; otherwise skip embedded .deb signatures and still publish
# SHA256SUMS + detach signature (primary integrity path).
DEB_SIGN_TOOL=""
if sudo apt-get install -y dpkg-sig; then
  DEB_SIGN_TOOL="dpkg-sig"
else
  echo "Warning: dpkg-sig unavailable on this runner; skipping embedded .deb signatures"
fi

export GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"
printf '%s\n' "$GPG_PRIVATE_KEY" | gpg --batch --import

PASS_FILE=""
GPG_OPTS=(--batch --yes --pinentry-mode loopback)
GPG_OPTS_STR="--batch --yes --pinentry-mode loopback"
if [ -n "${GPG_PASSPHRASE:-}" ]; then
  PASS_FILE="$(mktemp)"
  printf '%s' "$GPG_PASSPHRASE" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  GPG_OPTS+=(--passphrase-file "$PASS_FILE")
  GPG_OPTS_STR="$GPG_OPTS_STR --passphrase-file $PASS_FILE"
fi

# 1) Sign .deb packages first (changes file hashes).
shopt -s nullglob
deb_files=(BeatBax-*.deb)
if [ ${#deb_files[@]} -gt 0 ] && [ "$DEB_SIGN_TOOL" = "dpkg-sig" ]; then
  for deb in "${deb_files[@]}"; do
    if [ -n "${GPG_KEY_ID:-}" ]; then
      dpkg-sig --sign builder -k "$GPG_KEY_ID" \
        --gpg-options "$GPG_OPTS_STR" \
        "$deb"
    else
      dpkg-sig --sign builder \
        --gpg-options "$GPG_OPTS_STR" \
        "$deb"
    fi
    echo "Signed $deb with dpkg-sig"
  done
elif [ ${#deb_files[@]} -gt 0 ]; then
  echo "Skipping embedded .deb signatures (dpkg-sig not installed)"
else
  echo "No .deb artifacts to sign"
fi

# 2) Checksums include signed .deb files.
sha256sum BeatBax-* | tee SHA256SUMS

# 3) Detach-sign the checksum file.
if [ -n "${GPG_KEY_ID:-}" ]; then
  gpg "${GPG_OPTS[@]}" --detach-sign --armor -u "$GPG_KEY_ID" -o SHA256SUMS.asc SHA256SUMS
  gpg --armor --export "$GPG_KEY_ID" > beatbax-release.asc
else
  gpg "${GPG_OPTS[@]}" --detach-sign --armor -o SHA256SUMS.asc SHA256SUMS
  gpg --armor --export > beatbax-release.asc
fi
echo "Wrote SHA256SUMS.asc and beatbax-release.asc"

if [ -n "$PASS_FILE" ]; then
  rm -f "$PASS_FILE"
fi
