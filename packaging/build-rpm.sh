#!/bin/bash
# Canonical RPM build script for the MAP2 Audio Platform.
#
# This is the SINGLE installer build path. It builds the FHS-compliant
# `map2` RPM from packaging/rpm/map2.spec — the dedicated-service-user,
# sandboxed, sysusers.d/tmpfiles.d package. All other installers
# (install_on_new_host.sh, installer/ TUI, web/install.sh, lcd/install_lcd.sh,
# and the legacy packaging/map2-audio.spec) have been retired.
#
# Usage: ./build-rpm.sh [version] [release]
# Output: dist/map2-{version}-{release}.<dist>.x86_64.rpm (+ .src.rpm + .sha256)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

VERSION="${1:-1.0.0}"
RELEASE="${2:-1}"
ARCH="x86_64"
PKG_NAME="map2"
SPEC_SRC="packaging/rpm/map2.spec"

echo -e "${GREEN}MAP2 Audio Platform - Canonical RPM Build${NC}"
echo "Package: $PKG_NAME  Version: $VERSION  Release: $RELEASE"
echo "Spec:    $SPEC_SRC"
echo ""

echo -e "${YELLOW}Checking dependencies...${NC}"
for cmd in rpmbuild git; do
    if ! command -v "$cmd" &>/dev/null; then
        echo -e "${RED}Error: $cmd not found${NC}"
        echo "Install with: sudo dnf install rpm-build fedora-packager"
        exit 1
    fi
done

cd "$(git rev-parse --show-toplevel)"
GIT_COMMIT=$(git rev-parse --short HEAD)

BUILD_DIR="/tmp/map2-build-$$"
SOURCES_DIR="$BUILD_DIR/SOURCES"
SPECS_DIR="$BUILD_DIR/SPECS"
RPMS_DIR="$BUILD_DIR/RPMS"
SRPMS_DIR="$BUILD_DIR/SRPMS"
OUTPUT_DIR="./dist"
mkdir -p "$SOURCES_DIR" "$SPECS_DIR" "$RPMS_DIR" "$OUTPUT_DIR"

PREFIX="$PKG_NAME-$VERSION"
TAR_UNCOMPRESSED="$SOURCES_DIR/$PREFIX.tar"

# Archive the WORKING TREE (tracked files in their current state), not just
# HEAD — so uncommitted edits to the spec, systemd units, frontend, etc. are
# included in the build. `git stash create` writes a throwaway commit object
# capturing the working tree + index without touching the actual stash; on a
# clean tree it returns empty and we fall back to HEAD. Either way the build is
# reproducible from a clean checkout (where working tree == HEAD).
ARCHIVE_REF=$(git stash create 2>/dev/null || true)
if [ -n "$ARCHIVE_REF" ]; then
    echo -e "${YELLOW}Creating source tarball from WORKING TREE (uncommitted changes included) + submodules...${NC}"
else
    ARCHIVE_REF=HEAD
    echo -e "${YELLOW}Creating source tarball from HEAD ($GIT_COMMIT, clean tree) + submodules...${NC}"
fi
git archive --format=tar --prefix="$PREFIX/" -o "$TAR_UNCOMPRESSED" "$ARCHIVE_REF"

# git archive does NOT include git-submodule contents. The native engine needs
# the NeuralAmpModelerCore submodule (HAS_NAM=1) to compile. Enumerate submodule
# paths from .gitmodules and append every checked-out tree so the package is
# self-contained. Tolerant of unregistered submodules (working-tree checkouts).
SUBMODULE_PATHS=$(git config --file .gitmodules --get-regexp '\.path$' 2>/dev/null | awk '{print $2}' || true)
for sm in $SUBMODULE_PATHS; do
    if [ -d "$sm" ] && [ -n "$(ls -A "$sm" 2>/dev/null)" ]; then
        echo "  + submodule: $sm"
        tar --append --file="$TAR_UNCOMPRESSED" \
            --transform="s,^,$PREFIX/," \
            --exclude='.git' --exclude='build' --exclude='*.o' --exclude='*.a' \
            "$sm"
    else
        echo "  ! submodule not checked out, skipping: $sm" >&2
    fi
done

gzip -f "$TAR_UNCOMPRESSED"
echo "Source: $SOURCES_DIR/$PREFIX.tar.gz ($(du -h "$SOURCES_DIR/$PREFIX.tar.gz" | cut -f1))"

echo -e "${YELLOW}Staging spec...${NC}"
SPEC_FILE="$SPECS_DIR/$PKG_NAME.spec"
cp "$SPEC_SRC" "$SPEC_FILE"
sed -i "s/^Version:.*/Version:        $VERSION/" "$SPEC_FILE"
sed -i "s/^Release:.*/Release:        $RELEASE%{?dist}/" "$SPEC_FILE"

echo -e "${YELLOW}Building RPM (rpmbuild -ba)...${NC}"
# The native engine carries a legitimate RUNPATH to PipeWire's drop-in JACK
# library (/usr/lib64/pipewire-0.3/jack — libjack.so.0 is not on the default
# loader path). CMake's link-directory handling also leaves a harmless empty
# trailing entry. Tell rpmbuild's check-rpaths QA gate to accept standard
# (0x0001) and empty (0x0010) RUNPATH entries rather than fail the build.
export QA_RPATHS=$(( 0x0001 | 0x0010 ))

rpmbuild -ba \
    --define "_topdir $BUILD_DIR" \
    "$SPEC_FILE"

DIST_TAG=$(rpm --eval '%{?dist}')
RPM_FILE="$RPMS_DIR/$ARCH/$PKG_NAME-$VERSION-$RELEASE$DIST_TAG.$ARCH.rpm"
SRPM_FILE="$SRPMS_DIR/$PKG_NAME-$VERSION-$RELEASE$DIST_TAG.src.rpm"

echo -e "${YELLOW}Collecting artifacts...${NC}"
if [ -f "$RPM_FILE" ]; then
    cp "$RPM_FILE" "$OUTPUT_DIR/"
    echo -e "${GREEN}✓ RPM:  $(basename "$RPM_FILE")${NC}"
else
    echo -e "${RED}Error: expected RPM not found at $RPM_FILE${NC}"
    echo "Built artifacts:"; find "$RPMS_DIR" -name '*.rpm' || true
    exit 1
fi
[ -f "$SRPM_FILE" ] && cp "$SRPM_FILE" "$OUTPUT_DIR/" && echo -e "${GREEN}✓ SRPM: $(basename "$SRPM_FILE")${NC}"

cd "$OUTPUT_DIR"
sha256sum "$(basename "$RPM_FILE")" > "$(basename "$RPM_FILE").sha256"

echo ""
echo -e "${GREEN}Build complete.${NC}"
ls -lh "$PKG_NAME-$VERSION"*
echo ""
echo -e "${YELLOW}Install on Fedora Server:${NC}"
echo "  sudo dnf install -y ./dist/$(basename "$RPM_FILE")"
echo "  systemctl status map2-backend map2-frontend"

rm -rf "$BUILD_DIR"
