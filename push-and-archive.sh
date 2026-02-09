#!/usr/bin/env bash
# push-and-archive.sh — Push to GitHub, download the full repo, compress & save
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_NAME="map2-audio"
ARCHIVE_DIR="${REPO_DIR}/archives"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_FILE="${ARCHIVE_DIR}/${REPO_NAME}-${TIMESTAMP}.tar.gz"

cd "$REPO_DIR"

# ── 1. Stage & commit any pending changes ──────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
    echo "▸ Staging all changes..."
    git add -A

    echo "▸ Committing..."
    read -rp "  Commit message [auto: snapshot ${TIMESTAMP}]: " MSG
    MSG="${MSG:-snapshot ${TIMESTAMP}}"
    git commit -m "$MSG"
else
    echo "▸ Working tree clean — nothing to commit."
fi

# ── 2. Push to origin/master using gh credential helper ────────────────────
echo "▸ Pushing to origin..."
GIT_ASKPASS= git -c credential.helper='!gh auth git-credential' push origin master
echo "  ✓ Push complete."

# ── 3. Download full repo archive from GitHub ──────────────────────────────
mkdir -p "$ARCHIVE_DIR"

REMOTE_URL="$(git remote get-url origin)"
# Extract owner/repo from HTTPS or SSH URL
OWNER_REPO="$(echo "$REMOTE_URL" | sed -E 's#(https://github\.com/|git@github\.com:)##; s#\.git$##')"

echo "▸ Downloading archive of ${OWNER_REPO} (master)..."
gh api "repos/${OWNER_REPO}/tarball/master" > "$ARCHIVE_FILE"

SIZE="$(du -h "$ARCHIVE_FILE" | cut -f1)"
echo "  ✓ Saved: ${ARCHIVE_FILE}  (${SIZE})"

# ── 4. Summary ─────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Push + Archive complete"
echo "  Archive : ${ARCHIVE_FILE}"
echo "  Size    : ${SIZE}"
echo "  SHA     : $(git rev-parse --short HEAD)"
echo "═══════════════════════════════════════════"
