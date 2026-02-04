#!/bin/bash

# Build script for WDF Amp Plugin
# Requires JUCE to be installed and accessible via CMake

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
BUILD_TYPE="${1:-Release}"

echo "=========================================="
echo "Building WDF Amp Plugin"
echo "Build type: ${BUILD_TYPE}"
echo "=========================================="

# Create build directory
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# Configure with CMake
echo "Configuring with CMake..."
cmake .. \
    -DCMAKE_BUILD_TYPE="${BUILD_TYPE}" \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

# Build
echo "Building..."
cmake --build . --config "${BUILD_TYPE}" -j$(nproc)

echo "=========================================="
echo "Build complete!"
echo "Plugin outputs are in: ${BUILD_DIR}/WDFAmpPlugin_artefacts/"
echo "=========================================="
