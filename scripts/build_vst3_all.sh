#!/usr/bin/env bash
# build_vst3_all.sh — Build all MAP2 VST3 plugin wrappers
#
# Usage:
#   ./scripts/build_vst3_all.sh                        # Linux builds
#   ./scripts/build_vst3_all.sh --windows              # Windows cross-compile
#   ./scripts/build_vst3_all.sh clean                  # wipe build dirs first
#   ./scripts/build_vst3_all.sh --windows clean        # wipe Windows build dirs
#   ./scripts/build_vst3_all.sh WDFAmpPlugin           # specific plugin (Linux)
#   ./scripts/build_vst3_all.sh --windows WDFAmpPlugin # specific plugin (Windows)
#
# Requirements (Linux):  clang, clang++, lld, cmake >= 3.22
# Requirements (Windows cross): x86_64-w64-mingw32-g++, cmake >= 3.22
# Output Linux:   VSTs-MAP2/
# Output Windows: VSTs-MAP2-Windows/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_DIR="$REPO_ROOT/juce-engine"
JOBS=$(nproc)

# ANSI colours
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
info() { echo -e "${YELLOW}[--]${NC}  $*"; }

# ── Detect --windows flag ─────────────────────────────────────────────────────
WINDOWS=0
NEW_ARGS=()
for arg in "$@"; do
    if [[ "$arg" == "--windows" ]]; then
        WINDOWS=1
    else
        NEW_ARGS+=("$arg")
    fi
done
set -- "${NEW_ARGS[@]+"${NEW_ARGS[@]}"}"

if [[ "$WINDOWS" == "1" ]]; then
    TOOLCHAIN="$REPO_ROOT/cmake/toolchains/mingw64.cmake"
    BUILD_SUBDIR="build-win"
    OUTPUT_DIR="$REPO_ROOT/VSTs-MAP2-Windows"
    CMAKE_OPTS=(
        -DCMAKE_BUILD_TYPE=Release
        -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN"
    )
    PLATFORM_LABEL="Windows (MinGW-w64 cross)"
    # juceaide requires the parent Linux build to have already run once
    # so JUCE source is present at juce-engine/build/_deps/juce-src
    if [[ ! -d "$ENGINE_DIR/build/_deps/juce-src" ]]; then
        fail "Windows cross-compile requires a prior Linux build to fetch JUCE."
        fail "Run: ./scripts/build_vst3_all.sh WDFAmpPlugin  (Linux) first."
        exit 1
    fi
else
    BUILD_SUBDIR="build"
    OUTPUT_DIR="$REPO_ROOT/VSTs-MAP2"
    CMAKE_OPTS=(
        -DCMAKE_BUILD_TYPE=Release
        -DCMAKE_C_COMPILER=clang
        -DCMAKE_CXX_COMPILER=clang++
    )
    PLATFORM_LABEL="Linux (clang)"
fi

# ── Discover plugin directories ──────────────────────────────────────────────
discover_plugins() {
    local dirs=()
    for d in "$ENGINE_DIR"/*/; do
        local name
        name="$(basename "$d")"
        if [[ -f "$d/CMakeLists.txt" && "$name" != "build" && "$name" != "Modules" ]]; then
            dirs+=("$name")
        fi
    done
    echo "${dirs[@]}"
}

# ── Build one plugin ─────────────────────────────────────────────────────────
build_plugin() {
    local name="$1"
    local src="$ENGINE_DIR/$name"
    local build_dir="$src/$BUILD_SUBDIR"
    local log_dir="$REPO_ROOT/build-logs"
    mkdir -p "$log_dir"

    local log_pfx="${name}-${BUILD_SUBDIR}"

    info "Building $name ..."

    # Optional clean
    if [[ "${CLEAN:-0}" == "1" && -d "$build_dir" ]]; then
        rm -rf "$build_dir"
        info "  Cleaned $build_dir"
    fi

    # Determine VST3 target name
    local target="${name}_VST3"

    # Configure
    if ! cmake -S "$src" -B "$build_dir" "${CMAKE_OPTS[@]}" \
            > "$log_dir/${log_pfx}-configure.log" 2>&1; then
        fail "$name — configure failed (see $log_dir/${log_pfx}-configure.log)"
        return 1
    fi

    # Build
    if ! cmake --build "$build_dir" --target "$target" -j"$JOBS" \
            > "$log_dir/${log_pfx}-build.log" 2>&1; then
        fail "$name — build failed (see $log_dir/${log_pfx}-build.log)"
        return 1
    fi

    # Copy artefact to output directory
    local artefact_dir
    artefact_dir=$(find "$build_dir" -maxdepth 5 -type d -name "*.vst3" 2>/dev/null | head -1)
    if [[ -z "$artefact_dir" ]]; then
        fail "$name — no .vst3 bundle found after build"
        return 1
    fi

    local bundle_name
    bundle_name="$(basename "$artefact_dir")"
    mkdir -p "$OUTPUT_DIR"
    cp -r "$artefact_dir" "$OUTPUT_DIR/"
    ok "$name → $OUTPUT_DIR/$bundle_name"
    return 0
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo "MAP2 VST3 Builder — $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Platform: $PLATFORM_LABEL"
    echo "Output:   $OUTPUT_DIR"
    echo "Jobs:     $JOBS"
    echo ""

    # Check for 'clean' flag
    if [[ "${1:-}" == "clean" ]]; then
        CLEAN=1
        shift
    else
        CLEAN=0
    fi
    export CLEAN

    # Determine list of plugins to build
    local plugins=()
    if [[ $# -gt 0 ]]; then
        plugins=("$@")
    else
        read -ra plugins <<< "$(discover_plugins)"
    fi

    if [[ ${#plugins[@]} -eq 0 ]]; then
        fail "No plugin directories found in $ENGINE_DIR"
        exit 1
    fi

    info "Plugins: ${plugins[*]}"
    echo ""

    local passed=0 failed=0 failed_names=()
    for plugin in "${plugins[@]}"; do
        if build_plugin "$plugin"; then
            ((passed++)) || true
        else
            ((failed++)) || true
            failed_names+=("$plugin")
        fi
        echo ""
    done

    echo "────────────────────────────────────────"
    echo "Results: ${passed} passed, ${failed} failed"
    if [[ ${#failed_names[@]} -gt 0 ]]; then
        fail "Failed: ${failed_names[*]}"
        exit 1
    fi
    echo ""
    ok "All plugins built successfully."
}

main "$@"
