#!/bin/bash
# Local RPM build script for MAP2 Audio Platform
#
# Usage: ./build-rpm.sh [version] [release]
#
# Builds the MAP2 Audio RPM package locally.
# Output: dist/map2-audio-{version}-{release}.fc40.x86_64.rpm

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
VERSION="${1:-1.0.0}"
RELEASE="${2:-1}"
DIST="fc40"
ARCH="x86_64"
PKG_NAME="map2-audio"

echo -e "${GREEN}MAP2 Audio Platform - RPM Build Tool${NC}"
echo "Version: $VERSION"
echo "Release: $RELEASE"
echo ""

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"

for cmd in rpmbuild fedpkg; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}Error: $cmd not found${NC}"
        echo "Install with: sudo dnf install rpm-build fedora-packager"
        exit 1
    fi
done

# Prepare build environment
echo -e "${YELLOW}Preparing build environment...${NC}"

BUILD_DIR="/tmp/map2-build-$$"
SOURCES_DIR="$BUILD_DIR/SOURCES"
SPECS_DIR="$BUILD_DIR/SPECS"
RPMS_DIR="$BUILD_DIR/RPMS"
OUTPUT_DIR="./dist"

mkdir -p "$SOURCES_DIR" "$SPECS_DIR" "$RPMS_DIR" "$OUTPUT_DIR"

# Create source tarball
echo -e "${YELLOW}Creating source tarball...${NC}"

cd "$(git rev-parse --show-toplevel)"
GIT_COMMIT=$(git rev-parse --short HEAD)

git archive --format=tar.gz \
    --prefix="$PKG_NAME-$VERSION/" \
    -o "$SOURCES_DIR/$PKG_NAME-$VERSION.tar.gz" \
    HEAD

echo "Source: $SOURCES_DIR/$PKG_NAME-$VERSION.tar.gz ($(du -h "$SOURCES_DIR/$PKG_NAME-$VERSION.tar.gz" | cut -f1))"

# Update spec file with version
echo -e "${YELLOW}Updating spec file...${NC}"

SPEC_FILE="$SPECS_DIR/$PKG_NAME.spec"
cp "packaging/$PKG_NAME.spec" "$SPEC_FILE"

# Replace version in spec
sed -i "s/^Version:.*/Version:        $VERSION/" "$SPEC_FILE"
sed -i "s/^Release:.*/Release:        $RELEASE%{?dist}/" "$SPEC_FILE"

# Build RPM
echo -e "${YELLOW}Building RPM...${NC}"

rpmbuild \
    -ba \
    --define "_topdir $BUILD_DIR" \
    --define "dist .$DIST" \
    "$SPEC_FILE"

# Move built RPM to output directory
echo -e "${YELLOW}Moving artifacts...${NC}"

RPM_FILE="$RPMS_DIR/$ARCH/$PKG_NAME-$VERSION-$RELEASE.$DIST.$ARCH.rpm"
SRPM_FILE="$BUILD_DIR/SRPMS/$PKG_NAME-$VERSION-$RELEASE.$DIST.src.rpm"

if [ -f "$RPM_FILE" ]; then
    cp "$RPM_FILE" "$OUTPUT_DIR/"
    echo -e "${GREEN}✓ RPM: $(basename $RPM_FILE)${NC}"
else
    echo -e "${RED}Error: RPM file not found${NC}"
    exit 1
fi

if [ -f "$SRPM_FILE" ]; then
    cp "$SRPM_FILE" "$OUTPUT_DIR/"
    echo -e "${GREEN}✓ SRPM: $(basename $SRPM_FILE)${NC}"
else
    echo -e "${YELLOW}Warning: SRPM file not found${NC}"
fi

# Create SHA256 checksums
echo -e "${YELLOW}Creating checksums...${NC}"

cd "$OUTPUT_DIR"
sha256sum "$PKG_NAME-$VERSION-$RELEASE.$DIST.$ARCH.rpm" > "$PKG_NAME-$VERSION-$RELEASE.$DIST.$ARCH.rpm.sha256"

# Display summary
echo ""
echo -e "${GREEN}Build Complete!${NC}"
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""
ls -lh "$OUTPUT_DIR/$PKG_NAME-$VERSION"*

# Display installation instructions
echo ""
echo -e "${YELLOW}Installation:${NC}"
echo "  sudo dnf install -y $OUTPUT_DIR/$PKG_NAME-$VERSION-$RELEASE.$DIST.$ARCH.rpm"
echo ""
echo -e "${YELLOW}Test installation:${NC}"
echo "  rpm -qi map2-audio"
echo "  systemctl status map2-backend"
echo ""

# Cleanup
echo -e "${YELLOW}Cleaning up...${NC}"
rm -rf "$BUILD_DIR"

echo -e "${GREEN}Done!${NC}"
