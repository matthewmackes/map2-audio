"""Shared MAP2 platform build-version helpers."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
VERSION_JSON_PATH = REPO_ROOT / "version.json"
VERSION_FILE_PATH = REPO_ROOT / "VERSION"

DEFAULT_PRODUCT = "MAP2 Audio Platform"
DEFAULT_VERSION = "0000000000000001"
DEFAULT_CHANNEL_CODE = "01"
DEFAULT_API_VERSION = "v1"
DEFAULT_VERSION_SOURCE = "scripts/generate_platform_version.py"


def digits_only(value: Any) -> str:
    """Return only the numeric characters from a value."""

    return "".join(ch for ch in str(value) if ch.isdigit())


def normalize_version_value(value: Any) -> str:
    """Return a canonical version only when it matches the full numeric format."""

    digits = digits_only(value)
    return digits if len(digits) >= 16 else ""


def normalize_channel_code(value: Any) -> str:
    """Normalize a channel/build suffix to a two-digit numeric code."""

    digits = digits_only(value)
    if not digits:
        return DEFAULT_CHANNEL_CODE
    return digits[-2:].zfill(2)


def split_version_components(version: str) -> tuple[str, str, str]:
    """Split a digits-only version into date, time, and channel parts."""

    digits = digits_only(version)
    build_date = digits[:8] if len(digits) >= 8 else "00000000"
    build_time = digits[8:14] if len(digits) >= 14 else "000000"
    build_channel = digits[14:16] if len(digits) >= 16 else DEFAULT_CHANNEL_CODE
    return build_date, build_time, normalize_channel_code(build_channel)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        data = json.loads(path.read_text())
    except Exception:
        return {}

    return data if isinstance(data, dict) else {}


def _read_version_file(path: Path) -> str:
    if not path.exists():
        return ""

    try:
        return digits_only(path.read_text().strip())
    except Exception:
        return ""


def detect_git_commit(repo_root: Path = REPO_ROOT) -> str | None:
    """Best-effort resolve the current git commit SHA."""

    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--short=12", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return None

    commit = result.stdout.strip()
    return commit or None


def detect_git_dirty(repo_root: Path = REPO_ROOT) -> bool:
    """Best-effort detect whether the repository has local modifications."""

    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "status", "--porcelain"],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return False

    return bool(result.stdout.strip())


@dataclass(frozen=True)
class PlatformVersionInfo:
    product: str
    version: str
    build_date: str
    build_time: str
    build_channel: str
    build_timestamp: str
    fallback_version: str
    version_source: str
    api_version: str = DEFAULT_API_VERSION
    commit: str | None = None
    dirty: bool = False

    @classmethod
    def from_mapping(
        cls,
        data: dict[str, Any],
        *,
        version_file_value: str = "",
    ) -> "PlatformVersionInfo":
        version = (
            normalize_version_value(data.get("version"))
            or normalize_version_value(version_file_value)
            or normalize_version_value(data.get("fallback_version"))
            or DEFAULT_VERSION
        )
        build_date, build_time, build_channel = split_version_components(version)
        product = str(data.get("product") or DEFAULT_PRODUCT).strip() or DEFAULT_PRODUCT
        api_version = str(data.get("api_version") or DEFAULT_API_VERSION).strip() or DEFAULT_API_VERSION
        build_timestamp = str(data.get("build_timestamp") or "").strip()
        version_source = str(data.get("version_source") or DEFAULT_VERSION_SOURCE).strip() or DEFAULT_VERSION_SOURCE
        commit = str(data.get("commit") or "").strip() or None
        dirty = bool(data.get("dirty", False))

        build_date_override = digits_only(data.get("build_date"))
        if build_date_override:
            build_date = build_date_override[:8].ljust(8, "0")

        build_time_override = digits_only(data.get("build_time"))
        if build_time_override:
            build_time = build_time_override[:6].ljust(6, "0")

        build_channel_override = data.get("build_channel")
        if build_channel_override is not None:
            build_channel = normalize_channel_code(build_channel_override)

        return cls(
            product=product,
            version=version,
            build_date=build_date,
            build_time=build_time,
            build_channel=build_channel,
            build_timestamp=build_timestamp,
            fallback_version=normalize_version_value(data.get("fallback_version")) or version,
            version_source=version_source,
            api_version=api_version,
            commit=commit,
            dirty=dirty,
        )

    def to_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "product": self.product,
            "version": self.version,
            "build_date": self.build_date,
            "build_time": self.build_time,
            "build_channel": self.build_channel,
            "build_timestamp": self.build_timestamp,
            "fallback_version": self.fallback_version,
            "version_source": self.version_source,
            "api_version": self.api_version,
            "dirty": self.dirty,
        }
        if self.commit:
            payload["commit"] = self.commit
        return payload

    def to_public_payload(self) -> dict[str, Any]:
        payload = {
            "app": self.product,
            "product": self.product,
            "version": self.version,
            "build_date": self.build_date,
            "build_time": self.build_time,
            "build_channel": self.build_channel,
            "build_timestamp": self.build_timestamp,
            "api_version": self.api_version,
            "dirty": self.dirty,
        }
        if self.commit:
            payload["commit"] = self.commit
        return payload


def load_platform_version(
    version_json_path: Path = VERSION_JSON_PATH,
    version_file_path: Path = VERSION_FILE_PATH,
) -> PlatformVersionInfo:
    """Load the canonical platform version from repository artifacts."""

    data = _read_json(version_json_path)
    version_file_value = _read_version_file(version_file_path)
    return PlatformVersionInfo.from_mapping(data, version_file_value=version_file_value)


def write_platform_version(
    info: PlatformVersionInfo,
    version_json_path: Path = VERSION_JSON_PATH,
    version_file_path: Path = VERSION_FILE_PATH,
) -> None:
    """Persist the canonical platform version to the tracked repo artifacts."""

    version_json_path.write_text(json.dumps(info.to_json(), indent=2) + "\n")
    version_file_path.write_text(f"{info.version}\n")


def generate_platform_version(
    *,
    now: datetime | None = None,
    product: str = DEFAULT_PRODUCT,
    channel_code: str = DEFAULT_CHANNEL_CODE,
    version_source: str = DEFAULT_VERSION_SOURCE,
    api_version: str = DEFAULT_API_VERSION,
    commit: str | None = None,
    dirty: bool | None = None,
) -> PlatformVersionInfo:
    """Generate a new digits-only date-time-beta platform version."""

    timestamp = now or datetime.now().astimezone()
    build_date = timestamp.strftime("%Y%m%d")
    build_time = timestamp.strftime("%H%M%S")
    build_channel = normalize_channel_code(channel_code)
    version = f"{build_date}{build_time}{build_channel}"

    if commit is None:
        commit = detect_git_commit()
    if dirty is None:
        dirty = detect_git_dirty()

    return PlatformVersionInfo(
        product=product.strip() or DEFAULT_PRODUCT,
        version=version,
        build_date=build_date,
        build_time=build_time,
        build_channel=build_channel,
        build_timestamp=timestamp.isoformat(timespec="seconds"),
        fallback_version=version,
        version_source=version_source,
        api_version=api_version.strip() or DEFAULT_API_VERSION,
        commit=commit,
        dirty=bool(dirty),
    )


def get_platform_product_name() -> str:
    """Return the current platform product name."""

    return load_platform_version().product


def get_platform_version() -> str:
    """Return the current canonical platform version string."""

    return load_platform_version().version


def get_platform_version_payload() -> dict[str, Any]:
    """Return the public API payload for platform version surfaces."""

    return load_platform_version().to_public_payload()
