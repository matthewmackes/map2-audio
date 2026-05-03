"""
T2492-1 — Mixxx VID:PID + USB-IF lookup.

MixxxLookup loads `device-packs/_lookup-index/mixxx-controllers.json`
once at construction; lookups are O(1) via a (vid, pid) → entry dict.

UsbIfLookup parses `device-packs/_lookup-index/usb.ids` lazily on first
use and caches the vendor-name table in memory.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
LOOKUP_DIR = REPO_ROOT / "device-packs" / "_lookup-index"
MIXXX_INDEX_PATH = LOOKUP_DIR / "mixxx-controllers.json"
USB_IDS_PATH = LOOKUP_DIR / "usb.ids"


def _normalize_hex(value: str | int | None) -> Optional[str]:
    """Normalize VID/PID to '0xNNNN' lowercase hex format."""
    if value is None:
        return None
    if isinstance(value, int):
        return f"0x{value:04x}"
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return f"0x{int(raw, 16):04x}"
    except ValueError:
        return None


@dataclass(frozen=True)
class MixxxMatch:
    """Single Mixxx controller match for a USB VID:PID."""
    vid: str
    pid: str
    device_name: str
    mapping_file: str
    script_files: tuple[str, ...]
    protocol: str
    upstream_commit: str


@dataclass(frozen=True)
class UsbIfMatch:
    """USB-IF vendor + product name lookup."""
    vid: str
    pid: Optional[str]
    vendor_name: Optional[str]
    product_name: Optional[str]


@dataclass
class LookupResult:
    """Combined Mixxx + USB-IF lookup result for a single VID:PID."""
    vid: str
    pid: str
    mixxx_match: Optional[MixxxMatch]
    usbif_match: Optional[UsbIfMatch]


class MixxxLookup:
    """O(1) VID:PID lookup against the Mixxx HID/bulk corpus."""

    def __init__(self, index_path: Path = MIXXX_INDEX_PATH) -> None:
        self._index_path = index_path
        self._by_vid_pid: dict[tuple[str, str], MixxxMatch] = {}
        self._upstream_commit = "unknown"
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        if not self._index_path.is_file():
            logger.warning("Mixxx lookup index missing at %s", self._index_path)
            self._loaded = True
            return
        try:
            data = json.loads(self._index_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            logger.error("Failed to load Mixxx index: %s", exc)
            self._loaded = True
            return
        self._upstream_commit = str(data.get("mixxx_upstream_commit", "unknown"))
        for entry in data.get("entries", []):
            vid = _normalize_hex(entry.get("vid"))
            pid = _normalize_hex(entry.get("pid"))
            if vid is None or pid is None:
                continue
            scripts = tuple(str(s) for s in (entry.get("script_files") or []))
            self._by_vid_pid[(vid, pid)] = MixxxMatch(
                vid=vid,
                pid=pid,
                device_name=str(entry.get("device_name", "")),
                mapping_file=str(entry.get("mapping_file", "")),
                script_files=scripts,
                protocol=str(entry.get("protocol", "hid")),
                upstream_commit=self._upstream_commit,
            )
        self._loaded = True

    def lookup(self, vid: str | int, pid: str | int) -> Optional[MixxxMatch]:
        self._ensure_loaded()
        v = _normalize_hex(vid)
        p = _normalize_hex(pid)
        if v is None or p is None:
            return None
        return self._by_vid_pid.get((v, p))

    @property
    def entry_count(self) -> int:
        self._ensure_loaded()
        return len(self._by_vid_pid)


class UsbIfLookup:
    """USB-IF vendor + product name lookup from the linux-usb.org table."""

    def __init__(self, ids_path: Path = USB_IDS_PATH) -> None:
        self._ids_path = ids_path
        # vid -> (vendor_name, {pid: product_name})
        self._vendors: dict[str, tuple[str, dict[str, str]]] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        if not self._ids_path.is_file():
            logger.warning("USB-IF table missing at %s", self._ids_path)
            self._loaded = True
            return
        try:
            text = self._ids_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            logger.error("Failed to read usb.ids: %s", exc)
            self._loaded = True
            return

        current_vid: Optional[str] = None
        for raw_line in text.splitlines():
            if not raw_line or raw_line.startswith("#"):
                continue
            # Vendor lines: "VVVV  Vendor Name" (no leading whitespace).
            if not raw_line.startswith("\t"):
                if "  " not in raw_line:
                    current_vid = None
                    continue
                vid_str, _, name = raw_line.partition("  ")
                vid_norm = _normalize_hex(vid_str.strip())
                if vid_norm is None:
                    current_vid = None
                    continue
                current_vid = vid_norm
                self._vendors[current_vid] = (name.strip(), {})
            # Product lines: "\tPPPP  Product Name" (one tab).
            elif raw_line.startswith("\t") and not raw_line.startswith("\t\t"):
                if current_vid is None:
                    continue
                product = raw_line.lstrip("\t")
                if "  " not in product:
                    continue
                pid_str, _, name = product.partition("  ")
                pid_norm = _normalize_hex(pid_str.strip())
                if pid_norm is None:
                    continue
                self._vendors[current_vid][1][pid_norm] = name.strip()
            # Anything else (sub-class, interface) — ignored.
        self._loaded = True

    def lookup(self, vid: str | int, pid: str | int | None = None) -> Optional[UsbIfMatch]:
        self._ensure_loaded()
        v = _normalize_hex(vid)
        if v is None:
            return None
        record = self._vendors.get(v)
        if record is None:
            return None
        vendor_name, products = record
        p = _normalize_hex(pid) if pid is not None else None
        product_name = products.get(p) if p is not None else None
        return UsbIfMatch(vid=v, pid=p, vendor_name=vendor_name, product_name=product_name)

    @property
    def vendor_count(self) -> int:
        self._ensure_loaded()
        return len(self._vendors)


@lru_cache(maxsize=1)
def get_mixxx_lookup() -> MixxxLookup:
    return MixxxLookup()


@lru_cache(maxsize=1)
def get_usbif_lookup() -> UsbIfLookup:
    return UsbIfLookup()


def perform_lookup(vid: str | int, pid: str | int) -> LookupResult:
    """Run both lookups and return the combined result."""
    v = _normalize_hex(vid)
    p = _normalize_hex(pid)
    if v is None or p is None:
        return LookupResult(vid=str(vid), pid=str(pid), mixxx_match=None, usbif_match=None)
    return LookupResult(
        vid=v,
        pid=p,
        mixxx_match=get_mixxx_lookup().lookup(v, p),
        usbif_match=get_usbif_lookup().lookup(v, p),
    )
