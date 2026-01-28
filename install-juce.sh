#!/bin/bash
#
# MAP2 Audio Engine (JUCE-based) Build Script
# Builds the C++ audio engine with LV2 plugin support
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="${SCRIPT_DIR}/juce-engine"
BUILD_DIR="${ENGINE_DIR}/build"

echo "=============================================="
echo "MAP2 Audio Engine Build Script"
echo "=============================================="

# Check for required tools
echo ""
echo "[1/5] Checking dependencies..."

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "ERROR: $1 is required but not installed."
        return 1
    fi
    echo "  ✓ $1 found"
    return 0
}

check_command cmake || exit 1
check_command make || exit 1
check_command pkg-config || exit 1

# Check Python
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "ERROR: Python 3 is required but not found"
    exit 1
fi
echo "  ✓ Python: $($PYTHON_CMD --version)"

# Check for required libraries
echo ""
echo "[2/5] Checking required libraries..."

check_pkg() {
    if pkg-config --exists "$1" 2>/dev/null; then
        echo "  ✓ $1: $(pkg-config --modversion $1 2>/dev/null || echo 'found')"
        return 0
    else
        echo "  ✗ $1 NOT FOUND"
        return 1
    fi
}

MISSING=0
check_pkg alsa || MISSING=1
check_pkg lilv-0 || MISSING=1

# Optional
check_pkg jack || echo "    (JACK is optional)"

if [ $MISSING -eq 1 ]; then
    echo ""
    echo "Missing required packages. Install with:"
    echo "  Fedora: sudo dnf install alsa-lib-devel lilv-devel lv2-devel jack-audio-connection-kit-devel"
    echo "  Ubuntu: sudo apt install libasound2-dev liblilv-dev lv2-dev libjack-jackd2-dev"
    exit 1
fi

# Check for pybind11
echo ""
echo "[3/5] Checking pybind11..."
if $PYTHON_CMD -c "import pybind11" 2>/dev/null; then
    PYBIND11_CMAKE=$($PYTHON_CMD -c "import pybind11; print(pybind11.get_cmake_dir())")
    echo "  ✓ pybind11 found: $PYBIND11_CMAKE"
else
    echo "  Installing pybind11..."
    pip install pybind11
fi

# Create build directory
echo ""
echo "[4/5] Configuring CMake..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_PREFIX_PATH="$($PYTHON_CMD -c 'import pybind11; print(pybind11.get_cmake_dir())')" \
    -DPython3_EXECUTABLE="$(which $PYTHON_CMD)"

# Build
echo ""
echo "[5/5] Building..."
make -j$(nproc)

# Check if build succeeded
if [ -f "map2_audio_engine"*.so ]; then
    echo ""
    echo "=============================================="
    echo "✓ Build successful!"
    echo "=============================================="
    echo ""
    echo "Module built: $(ls map2_audio_engine*.so)"
    echo ""
    echo "To test:"
    echo "  cd $BUILD_DIR"
    echo "  $PYTHON_CMD -c 'import map2_audio_engine; print(map2_audio_engine.get_version())'"
    echo ""
    echo "To install system-wide:"
    echo "  sudo cp map2_audio_engine*.so /usr/local/lib/python3.*/site-packages/"
    echo ""
else
    echo ""
    echo "ERROR: Build failed - module not found"
    exit 1
fi
