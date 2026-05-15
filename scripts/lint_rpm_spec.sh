#!/usr/bin/env bash
# T2529-E1 — rpmlint baseline runner.
#
# Usage:    scripts/lint_rpm_spec.sh
# Exit:     0 if clean; nonzero on any error or warning.
#
# Requires the `rpmlint` package (Fedora: `dnf install rpmlint`).
#
# Per the T2529-E1 lock (2026-05-15), the spec file MUST emit zero errors
# AND zero warnings against rpmlint with the project's .rpmlintrc applied.
# Drift here would silently re-introduce the kind of packaging defects
# (typos in scriptlets, unfiled files, dangling symlinks) that block a
# clean Fedora-build acceptance.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="${REPO_ROOT}/packaging/rpm/map2.spec"
RC="${REPO_ROOT}/packaging/rpm/lint/.rpmlintrc"

if ! command -v rpmlint >/dev/null 2>&1; then
    echo "ERROR: rpmlint not installed."
    echo "  Fedora:  sudo dnf install rpmlint"
    echo "  Ubuntu:  sudo apt install rpmlint"
    echo
    echo "(T2529-E1 baseline; the CI image has rpmlint pre-installed)"
    exit 127
fi

if [[ ! -f "${SPEC}" ]]; then
    echo "ERROR: spec file missing at ${SPEC}"
    exit 2
fi

if [[ ! -f "${RC}" ]]; then
    echo "ERROR: rpmlint config missing at ${RC}"
    exit 2
fi

echo "==> Linting ${SPEC}"
echo "==> Using config ${RC}"
echo

# `-f <config>`: use project-specific config
# `-i`: print full info (rationale) for each issue
# `-T`: terse output for CI logs
# rpmlint returns 0 on clean, 1 on errors, 64 on warnings (we treat both as fail)
if rpmlint -f "${RC}" -i "${SPEC}"; then
    echo
    echo "✓ rpmlint clean (0 errors, 0 warnings)"
    exit 0
fi

echo
echo "✗ rpmlint reported issues — see output above"
echo
echo "T2529-E1 lock requires `0 errors + 0 warnings` against the spec."
echo "If the issue is a project-specific style choice (not a real defect),"
echo "add an addFilter to packaging/rpm/lint/.rpmlintrc and document why."

exit 1
