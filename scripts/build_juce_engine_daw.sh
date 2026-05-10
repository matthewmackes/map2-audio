#!/usr/bin/env bash
# T2503 Set 2 — convenience builder for the DAW-mode JUCE engine build.
# Usage:
#   ./scripts/build_juce_engine_daw.sh [extra cmake/build args]
#
# Configures the juce-engine with -DMAP2_DAW_MODE=ON in a separate build dir
# (build-daw/) so it doesn't disturb the live-mode build. Fetches Tracktion
# Engine on first run; combined work distributes as AGPLv3 (see
# docs/architecture/LICENSE_COMPATIBILITY.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="${REPO_ROOT}/juce-engine"
BUILD_DIR="${ENGINE_DIR}/build-daw"

cd "${ENGINE_DIR}"

echo "==> [T2503] Configuring DAW-mode build at ${BUILD_DIR}"
cmake -B "${BUILD_DIR}" -DMAP2_DAW_MODE=ON "$@"

echo "==> [T2503] Building map2_audio_engine + daw_tests"
cmake --build "${BUILD_DIR}" -j --target map2_audio_engine daw_tests

echo "==> [T2503] Running daw_tests smoke suite"
ctest --test-dir "${BUILD_DIR}" -R "daw_tests" --output-on-failure

echo "==> [T2503] Set 2 build complete. Tracktion source at ${BUILD_DIR}/_deps/tracktion_engine-src/"
