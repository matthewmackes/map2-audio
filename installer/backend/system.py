"""
installer/backend/system.py
============================
System / hardware detection — the MAP2 equivalent of Anaconda's hardware
detection layer (hal, udev probing, lshw queries, etc.).

Runs at Stage 00 (Welcome/Detect) to populate the environment detection panel,
and also used by Stage 05 (Audio) to populate the interface picker.

All detection is read-only: no system changes are made here.
"""

from __future__ import annotations

import os
import platform
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


# ─────────────────────────────────────────────────────────────────────────────
# Data classes returned by detectors
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CPUInfo:
    model:      str
    cores:      int
    threads:    int
    isolated:   List[int]   = field(default_factory=list)  # Current isolcpus (from /proc/cmdline)
    is_intel:   bool = False
    is_amd:     bool = False


@dataclass
class MemoryInfo:
    total_mb:  int
    avail_mb:  int

    @property
    def total_gb(self) -> float:
        return round(self.total_mb / 1024, 1)

    @property
    def avail_gb(self) -> float:
        return round(self.avail_mb / 1024, 1)


@dataclass
class DiskInfo:
    path:      str
    total_gb:  float
    free_gb:   float
    fs_type:   str = "unknown"


@dataclass
class AudioDevice:
    """
    An audio interface visible to ALSA / PipeWire.

    card_id:    ALSA card number (e.g. 0)
    name:       Human-readable name (e.g. "Edirol UA-1000")
    alsa_id:    ALSA card short ID (e.g. "UA1000")
    is_usb:     True for USB interfaces
    channels:   Number of output channels (if detectable)
    """
    card_id:  int
    name:     str
    alsa_id:  str
    is_usb:   bool = False
    channels: int  = 0

    @property
    def display_name(self) -> str:
        usb_tag = " [USB]" if self.is_usb else ""
        return f"Card {self.card_id}: {self.name}{usb_tag}"


@dataclass
class NetworkInterface:
    name:        str   # e.g. "enp0s25"
    mac:         str
    is_up:       bool
    has_avb_support: bool = False  # Requires ethtool + driver check


@dataclass
class SystemInfo:
    """Aggregated system snapshot returned by detect_system()."""
    os_name:     str
    os_version:  str
    kernel:      str
    hostname:    str
    cpu:         CPUInfo
    memory:      MemoryInfo
    disks:       List[DiskInfo]
    audio_devs:  List[AudioDevice]
    net_ifaces:  List[NetworkInterface]
    has_pipewire: bool
    has_jack:     bool
    has_rtkit:    bool
    python_ver:   str
    node_ver:     str
    cmake_ver:    str
    warnings:     List[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Detection functions
# ─────────────────────────────────────────────────────────────────────────────

def _run(cmd: list[str]) -> str:
    """Run a command and return stdout, or '' on any error."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception:
        return ""


def detect_cpu() -> CPUInfo:
    """Parse /proc/cpuinfo and /proc/cmdline for CPU and isolation info."""
    info_text  = Path("/proc/cpuinfo").read_text(errors="replace") if Path("/proc/cpuinfo").exists() else ""
    model_match = re.search(r"model name\s*:\s*(.+)", info_text)
    model       = model_match.group(1).strip() if model_match else platform.processor() or "Unknown"

    cores   = os.cpu_count() or 1
    threads = cores  # Simplified; accurate for most cases

    # Parse isolcpus from /proc/cmdline (what's currently active)
    isolated: List[int] = []
    cmdline = Path("/proc/cmdline").read_text(errors="replace") if Path("/proc/cmdline").exists() else ""
    iso_match = re.search(r"isolcpus=([\d,\-]+)", cmdline)
    if iso_match:
        isolated = _parse_core_list(iso_match.group(1))

    return CPUInfo(
        model=model,
        cores=cores,
        threads=threads,
        isolated=isolated,
        is_intel="Intel" in model or "intel" in model.lower(),
        is_amd="AMD" in model or "amd" in model.lower(),
    )


def _parse_core_list(spec: str) -> List[int]:
    """Parse '0-3,6,7' into [0,1,2,3,6,7]."""
    cores = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-", 1)
            cores.extend(range(int(lo), int(hi) + 1))
        elif part.isdigit():
            cores.append(int(part))
    return sorted(set(cores))


def detect_memory() -> MemoryInfo:
    """Read /proc/meminfo for total and available RAM."""
    meminfo_text = Path("/proc/meminfo").read_text(errors="replace") if Path("/proc/meminfo").exists() else ""
    total_match  = re.search(r"MemTotal:\s+(\d+)\s+kB",     meminfo_text)
    avail_match  = re.search(r"MemAvailable:\s+(\d+)\s+kB", meminfo_text)
    total_mb = int(total_match.group(1)) // 1024  if total_match else 0
    avail_mb = int(avail_match.group(1)) // 1024  if avail_match else 0
    return MemoryInfo(total_mb=total_mb, avail_mb=avail_mb)


def detect_disks(paths: List[str] = None) -> List[DiskInfo]:
    """Use df to check free space on key paths."""
    if paths is None:
        paths = ["/", "/home", "/var"]
    disks = []
    for p in paths:
        if not Path(p).exists():
            continue
        out = _run(["df", "-BG", "--output=size,avail,fstype", p])
        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 3:
                continue
            try:
                total_gb = float(parts[0].rstrip("G"))
                free_gb  = float(parts[1].rstrip("G"))
            except ValueError:
                continue  # skip header row (e.g. "1G-blocks  Avail  Type")
            disks.append(DiskInfo(path=p, total_gb=total_gb, free_gb=free_gb, fs_type=parts[2]))
            break
    return disks


def detect_audio_devices() -> List[AudioDevice]:
    """
    Probe ALSA for available audio cards.

    We read /proc/asound/cards (always available) rather than using aplay -l
    because the latter can hang if PipeWire intercepts it.

    Educational note:
      On a PipeWire system, ALSA is emulated via the pipewire-alsa compatibility
      layer.  The card names you see here may be PipeWire virtual devices rather
      than the raw hardware names.  The 'hw:N' device ID still works for JACK.
    """
    devices: List[AudioDevice] = []
    cards_file = Path("/proc/asound/cards")
    if not cards_file.exists():
        return devices

    # Format: " 0 [UA1000          ]: USB-Audio - EDIROL UA-1000"
    pattern = re.compile(r"^\s*(\d+)\s+\[(\S+)\s*\]:\s+\S+\s+-\s+(.+)$")
    for line in cards_file.read_text().splitlines():
        m = pattern.match(line)
        if m:
            card_id = int(m.group(1))
            alsa_id = m.group(2).strip()
            name    = m.group(3).strip()
            # Check if it's a USB device by looking at its modalias
            modalias_path = Path(f"/proc/asound/card{card_id}")
            is_usb = False
            if modalias_path.exists():
                # Check udev path for USB
                uevent = Path(f"/sys/class/sound/card{card_id}").glob("**/uevent")
                for e in uevent:
                    if "usb" in e.read_text(errors="replace").lower():
                        is_usb = True
                        break
            devices.append(AudioDevice(
                card_id=card_id, name=name, alsa_id=alsa_id, is_usb=is_usb
            ))
    return devices


def detect_network_interfaces() -> List[NetworkInterface]:
    """Detect network interfaces using /sys/class/net."""
    ifaces = []
    net_path = Path("/sys/class/net")
    if not net_path.exists():
        return ifaces
    for iface_dir in sorted(net_path.iterdir()):
        name = iface_dir.name
        if name == "lo":
            continue  # Skip loopback
        mac_file = iface_dir / "address"
        mac = mac_file.read_text().strip() if mac_file.exists() else "unknown"
        oper = (iface_dir / "operstate").read_text().strip() if (iface_dir / "operstate").exists() else "unknown"
        ifaces.append(NetworkInterface(
            name=name,
            mac=mac,
            is_up=(oper == "up"),
        ))
    return ifaces


def detect_tool_versions() -> tuple[str, str, str]:
    """Return (python_version, node_version, cmake_version)."""
    python_ver = platform.python_version()
    node_ver   = _run(["node", "--version"]).lstrip("v") or "not found"
    cmake_ver  = _run(["cmake", "--version"]).split("\n")[0].replace("cmake version ", "") or "not found"
    return python_ver, node_ver, cmake_ver


def detect_system() -> SystemInfo:
    """
    Full system detection — called at Stage 00 (Welcome).

    Returns a SystemInfo snapshot used to:
      1. Display the environment detection panel in the Welcome screen.
      2. Pre-populate audio interface choices in Stage 05.
      3. Validate prerequisites (enough RAM, disk, Python version, etc.).

    This function is read-only and safe to call as any user.
    """
    warnings: List[str] = []

    cpu    = detect_cpu()
    memory = detect_memory()
    disks  = detect_disks()
    audio  = detect_audio_devices()
    nets   = detect_network_interfaces()
    python_ver, node_ver, cmake_ver = detect_tool_versions()

    # ── Software availability checks ─────────────────────────────────────────
    has_pipewire = bool(_run(["pipewire", "--version"]))
    has_jack     = bool(_run(["jackd",    "--version"]) or _run(["pw-jack", "jackd", "--version"]))
    has_rtkit    = Path("/usr/lib/systemd/system/rtkit-daemon.service").exists()

    # ── Generate warnings for prerequisites ──────────────────────────────────
    if memory.total_mb < 4096:
        warnings.append(f"⚠ Only {memory.total_gb} GB RAM detected — 4 GB minimum recommended.")
    if not any(d.free_gb >= 20 for d in disks):
        warnings.append("⚠ Less than 20 GB free disk space — build may fail.")
    if not has_pipewire:
        warnings.append("⚠ PipeWire not found — will be installed during setup.")
    if not cpu.isolated:
        warnings.append("ℹ No isolcpus active — audio RT isolation requires GRUB update + reboot.")
    if len(audio) == 0:
        warnings.append("⚠ No ALSA audio devices detected — ensure USB interface is connected.")

    return SystemInfo(
        os_name=platform.system(),
        os_version=_run(["cat", "/etc/fedora-release"]) or platform.version(),
        kernel=platform.release(),
        hostname=platform.node(),
        cpu=cpu,
        memory=memory,
        disks=disks,
        audio_devs=audio,
        net_ifaces=nets,
        has_pipewire=has_pipewire,
        has_jack=has_jack,
        has_rtkit=has_rtkit,
        python_ver=python_ver,
        node_ver=node_ver,
        cmake_ver=cmake_ver,
        warnings=warnings,
    )
