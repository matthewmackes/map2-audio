"""
installer/backend/packages.py
==============================
Package manager abstraction — DNF (Fedora/RHEL) and apt (Debian/Ubuntu).

Anaconda analogy:
  Anaconda's payload module abstracts package installation (dnf, liveos, rpm-ostree).
  We provide a simpler two-backend abstraction focused on DNF (MAP2's primary
  target) with apt as a fallback.

Educational note on idempotency:
  Both `dnf install` and `apt-get install` are already idempotent for packages
  (they no-op if the package is already installed).  We add an explicit pre-check
  anyway because it avoids a network round-trip and gives the TUI a cleaner
  progress message ("already installed" vs "installing").
"""

from __future__ import annotations

import logging
import platform
import shutil
from dataclasses import dataclass, field
from typing import List, Optional

from .executor import CommandExecutor, CommandResult

logger = logging.getLogger("installer.packages")


# ─────────────────────────────────────────────────────────────────────────────
# Package manifests per component
# ─────────────────────────────────────────────────────────────────────────────

# Core system packages required by all modes
CORE_PACKAGES = [
    "git", "curl", "wget", "tar", "unzip",
    "python3", "python3-pip", "python3-devel",
    "gcc", "gcc-c++", "make", "cmake",
]

# Real-time audio packages (Fedora names)
RT_AUDIO_PACKAGES_FEDORA = [
    "pipewire", "pipewire-jack", "pipewire-alsa", "pipewire-pulseaudio",
    "wireplumber",
    "rtkit",
    "alsa-lib", "alsa-lib-devel", "alsa-utils",
    "jack-audio-connection-kit", "jack-audio-connection-kit-devel",
]

# Build dependencies for JUCE engine
JUCE_BUILD_PACKAGES_FEDORA = [
    "freetype-devel", "libX11-devel", "libXext-devel", "libXrandr-devel",
    "libXinerama-devel", "libXcursor-devel", "webkit2gtk4.0-devel",
    "gtk3-devel", "alsa-lib-devel",
]

# Node.js + frontend
NODE_PACKAGES_FEDORA = ["nodejs", "npm"]

# LV2 plugin dependencies
LV2_PACKAGES_FEDORA = [
    "lv2", "lv2-devel", "lilv", "lilv-devel",
    "suil", "suil-devel",
]

# AVB / network
AVB_PACKAGES_FEDORA = [
    "ethtool", "iproute", "net-tools",
]

# Mapping from Fedora → apt names (incomplete but covers the main ones)
FEDORA_TO_APT: dict[str, str] = {
    "python3-devel":          "python3-dev",
    "gcc-c++":                "g++",
    "freetype-devel":         "libfreetype6-dev",
    "libX11-devel":           "libx11-dev",
    "gtk3-devel":             "libgtk-3-dev",
    "alsa-lib-devel":         "libasound2-dev",
    "pipewire-jack":          "libpipewire-0.3-dev",
    "rtkit":                  "rtkit",
    "jack-audio-connection-kit": "jackd2",
    "jack-audio-connection-kit-devel": "libjack-dev",
    "lv2-devel":              "lv2-dev",
    "lilv-devel":             "liblilv-dev",
    "suil-devel":             "libsuil-dev",
}


@dataclass
class PackageManager:
    """
    Abstraction over DNF and apt-get.

    Detects which package manager is available at construction time
    and uses it consistently for all install/check operations.
    """
    executor: CommandExecutor
    _backend: str = field(init=False)

    def __post_init__(self):
        if shutil.which("dnf"):
            self._backend = "dnf"
        elif shutil.which("apt-get"):
            self._backend = "apt"
        else:
            self._backend = "unknown"
            logger.warning("No supported package manager found (dnf or apt-get).")

    @property
    def backend(self) -> str:
        return self._backend

    # ── High-level install methods ────────────────────────────────────────────

    def install(self, packages: List[str], *, description: str = "") -> CommandResult:
        """
        Install a list of packages idempotently.

        Translates package names for the detected backend, then runs the
        appropriate install command.  Already-installed packages are silently
        skipped by the package manager.

        Args:
            packages:    List of package names (Fedora names preferred).
            description: Human-readable label for TUI progress display.
        """
        if not packages:
            return CommandResult(0, "no packages", "", False, [])

        translated = [self._translate(p) for p in packages]
        logger.info("Installing packages (%s): %s", description or "misc", translated)

        if self._backend == "dnf":
            return self.executor.run(
                ["dnf", "install", "-y", "--setopt=install_weak_deps=False"] + translated,
                timeout=600,
                retries=2,
            )
        elif self._backend == "apt":
            # Update package lists first (idempotent in CI is fine)
            self.executor.run(["apt-get", "update", "-qq"], timeout=120)
            return self.executor.run(
                ["apt-get", "install", "-y", "--no-install-recommends"] + translated,
                timeout=600,
                retries=2,
            )
        else:
            return CommandResult(1, "", f"No package manager available", False, [])

    def is_installed(self, package: str) -> bool:
        """
        Check if a package is already installed (fast, no network).

        Used for idempotency: skip the install command if already present,
        which avoids unnecessary dnf/apt network traffic and gives cleaner
        TUI progress messages.
        """
        translated = self._translate(package)
        if self._backend == "dnf":
            result = self.executor.run(["rpm", "-q", translated])
            return result.ok
        elif self._backend == "apt":
            result = self.executor.run(
                ["dpkg-query", "-W", "-f=${Status}", translated]
            )
            return "install ok installed" in result.stdout
        return False

    def install_component(self, component: str) -> List[CommandResult]:
        """
        Install all packages for a named MAP2 component.

        Component names match the SoftwareConfig field names so the installer
        can call this generically: install_component("lv2") installs LV2_PACKAGES.

        Returns a list of CommandResult (one per batch, or per group if split).
        """
        component_map = {
            "core":     CORE_PACKAGES,
            "rt_audio": RT_AUDIO_PACKAGES_FEDORA,
            "juce":     JUCE_BUILD_PACKAGES_FEDORA,
            "node":     NODE_PACKAGES_FEDORA,
            "lv2":      LV2_PACKAGES_FEDORA,
            "avb":      AVB_PACKAGES_FEDORA,
        }
        pkgs = component_map.get(component, [])
        if not pkgs:
            logger.warning("Unknown component: %s", component)
            return []
        return [self.install(pkgs, description=f"{component} packages")]

    # ── Private helpers ───────────────────────────────────────────────────────

    def _translate(self, package: str) -> str:
        """Translate a Fedora package name to the current backend's name."""
        if self._backend == "apt":
            return FEDORA_TO_APT.get(package, package)
        return package
