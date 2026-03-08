"""Repository scanner for AVB/TSN signals."""

from __future__ import annotations

from pathlib import Path
import os
import zipfile

from .models import ScanMatch, ScanResult

DEFAULT_INCLUDE_EXT = {
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".py",
    ".java",
    ".sh",
    ".cmake",
    ".txt",
    ".md",
    ".yaml",
    ".yml",
    ".json",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".xml",
    ".service",
    ".pdf",
    ".docx",
}

DEFAULT_SPECIAL_FILENAMES = {
    "Makefile",
    "CMakeLists.txt",
    "Dockerfile",
}

DEFAULT_EXCLUDE_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".idea",
    ".vscode",
    "tmp",
}

DEFAULT_KEYWORDS = [
    "avb",
    "tsn",
    "802.1as",
    "gptp",
    "802.1qav",
    "fqtss",
    "credit-based shaper",
    "cbs",
    "802.1qat",
    "802.1qcc",
    "srp",
    "msrp",
    "stream reservation",
    "class a",
    "class b",
    "talker",
    "listener",
    "presentation time",
    "max transit time",
    "ptp",
    "phc2sys",
    "ptp4l",
    "qdisc",
    "taprio",
    "etf",
    "mqprio",
    "vlan",
    "pcp",
    "timestamp",
    "preempt_rt",
    "sched_fifo",
    "xrun",
    "latency",
]


def _read_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return ""

    try:
        reader = PdfReader(str(path))
        chunks: list[str] = []
        for page in reader.pages[:20]:
            chunks.append(page.extract_text() or "")
        return "\n".join(chunks)
    except Exception:
        return ""


def _read_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as zf:
            with zf.open("word/document.xml") as handle:
                xml_text = handle.read().decode("utf-8", errors="ignore")
        # Lightweight text extraction from OOXML text nodes.
        return xml_text.replace("<w:t>", "\n").replace("</w:t>", "")
    except Exception:
        return ""


def _read_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _read_pdf_text(path)
    if suffix == ".docx":
        return _read_docx_text(path)

    try:
        raw = path.read_bytes()
    except Exception:
        return ""

    if b"\x00" in raw[:2048]:
        return ""

    return raw.decode("utf-8", errors="ignore")


def _should_include(path: Path, include_ext: set[str]) -> bool:
    name = path.name
    if name in DEFAULT_SPECIAL_FILENAMES:
        return True
    return path.suffix.lower() in include_ext


def scan_codebase(
    root_path: str,
    max_files: int = 10000,
    include_ext: list[str] | None = None,
    exclude_dirs: list[str] | None = None,
    keywords: list[str] | None = None,
) -> ScanResult:
    """Recursively scan repository files for AVB/TSN keywords."""

    root = Path(root_path).resolve()
    include = set(DEFAULT_INCLUDE_EXT)
    if include_ext:
        include.update(ext if ext.startswith(".") else f".{ext}" for ext in include_ext)

    exclude = set(DEFAULT_EXCLUDE_DIRS)
    if exclude_dirs:
        exclude.update(exclude_dirs)
    terms = [term.strip().lower() for term in (keywords or DEFAULT_KEYWORDS) if term.strip()]

    matches: list[ScanMatch] = []
    scanned_files: list[str] = []
    skipped_files: list[str] = []
    errors: list[str] = []

    files_seen = 0
    for current_root, dirs, files in os.walk(root, topdown=True):
        dirs[:] = sorted(d for d in dirs if d not in exclude)
        for filename in sorted(files):
            path = Path(current_root) / filename
            if not _should_include(path, include):
                continue
            rel = str(path.relative_to(root))
            if files_seen >= max_files:
                skipped_files.append(rel)
                continue

            files_seen += 1
            scanned_files.append(rel)
            text = _read_text(path)
            if not text:
                continue

            try:
                for idx, line in enumerate(text.splitlines(), start=1):
                    line_lower = line.lower()
                    for term in terms:
                        if term in line_lower:
                            matches.append(
                                ScanMatch(
                                    path=rel,
                                    line=idx,
                                    text=line.strip()[:500],
                                    keyword=term,
                                )
                            )
                            break
            except Exception as exc:  # pragma: no cover - defensive
                errors.append(f"{rel}: parse failure ({exc})")

    return ScanResult(
        root_path=str(root),
        total_files_scanned=len(scanned_files),
        scanned_files=sorted(scanned_files),
        matches=sorted(matches, key=lambda m: (m.path, m.line, m.keyword)),
        skipped_files=sorted(set(skipped_files)),
        errors=sorted(errors),
    )
