#!/usr/bin/env bash
# T2529-E2 — cross-distro packaging compliance via lintian.
#
# Usage:    scripts/lint_deb_via_alien.sh <path-to-built-rpm>
#           (typically: rpmbuild --define '_topdir <tmpdir>' -bb packaging/rpm/map2.spec
#            then point this script at <tmpdir>/RPMS/x86_64/map2-*.rpm)
# Exit:     0 if clean; nonzero on any error or warning.
#
# Requires:
#   - `alien` (Fedora: `dnf install alien-deb`; Ubuntu: `apt install alien`)
#   - `lintian` (Fedora: `dnf install lintian-debian`; Ubuntu: `apt install lintian`)
#   - `dpkg-deb` (for Ubuntu only; alien on Fedora needs it via `dpkg`)
#
# Flow: rpmbuild → .rpm → alien --to-deb → .deb → lintian → check
#
# Per the T2529-E2 lock (2026-05-15), the .deb produced by alien-converting
# our .rpm MUST emit zero lintian errors AND zero warnings with the
# project-specific overrides applied. This is the cross-distro qualifier:
# even though we don't ship a native .deb (Q4 lock: fresh-install only,
# Fedora target), the converted package proves the file layout is
# Debian-Policy clean.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERRIDES="${REPO_ROOT}/packaging/deb/lint/lintian-overrides"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <path-to-built-rpm>"
    echo
    echo "Build the RPM first:"
    echo "  rpmbuild --define \"_topdir \$PWD/rpm-tmp\" -bb packaging/rpm/map2.spec"
    echo "Then pass the produced .rpm path, e.g.:"
    echo "  $0 rpm-tmp/RPMS/x86_64/map2-*.rpm"
    exit 2
fi

RPM_PATH="$1"

if [[ ! -f "${RPM_PATH}" ]]; then
    echo "ERROR: RPM not found at ${RPM_PATH}"
    exit 2
fi

if [[ ! -f "${OVERRIDES}" ]]; then
    echo "ERROR: lintian overrides missing at ${OVERRIDES}"
    exit 2
fi

for tool in alien lintian; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "ERROR: ${tool} not installed."
        case "${tool}" in
            alien)
                echo "  Fedora:  sudo dnf install alien-deb"
                echo "  Ubuntu:  sudo apt install alien"
                ;;
            lintian)
                echo "  Fedora:  sudo dnf install lintian-debian"
                echo "  Ubuntu:  sudo apt install lintian"
                ;;
        esac
        echo
        echo "(T2529-E2 baseline; the CI image has both pre-installed)"
        exit 127
    fi
done

WORK_DIR="$(mktemp -d -t map2-lintian-XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "==> Converting ${RPM_PATH} to .deb via alien"
cd "${WORK_DIR}"
sudo alien --to-deb --keep-version --scripts "${RPM_PATH}"

DEB_PATH="$(ls -1 *.deb 2>/dev/null | head -1 || true)"
if [[ -z "${DEB_PATH}" ]]; then
    echo "ERROR: alien did not produce a .deb"
    exit 1
fi

echo "==> Built ${WORK_DIR}/${DEB_PATH}"
echo "==> Running lintian with overrides ${OVERRIDES}"
echo

# `--fail-on warning` treats both errors AND warnings as fail (matches the
# rpmlint baseline target of `0 errors + 0 warnings`).
# `--override <file>` applies project-specific suppressions.
# `--display-info` shows the full rationale for each issue.
if lintian \
    --override "${OVERRIDES}" \
    --display-info \
    --fail-on warning \
    "${WORK_DIR}/${DEB_PATH}"; then
    echo
    echo "✓ lintian clean (0 errors, 0 warnings) — cross-distro packaging compliant"
    exit 0
fi

echo
echo "✗ lintian reported issues — see output above"
echo
echo "T2529-E2 lock requires 0 errors + 0 warnings against the alien-converted .deb."
echo "If the issue is an alien-conversion artefact (not a real packaging defect),"
echo "add a tag to packaging/deb/lint/lintian-overrides and document why."

exit 1
