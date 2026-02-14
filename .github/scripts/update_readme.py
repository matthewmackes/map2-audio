#!/usr/bin/env python3
"""
Auto-update README.md dynamic sections from repo content.

Scans docs/, docs/images/, git log, and dependency files to generate
markdown sections, then replaces content between marker comments in README.md.

Runs in GitHub Actions (stdlib only, no pip dependencies).
"""

import glob
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
README_PATH = REPO_ROOT / "README.md"
DOCS_DIR = REPO_ROOT / "docs"
IMAGES_DIR = DOCS_DIR / "images"

GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "matthewmackes/map2-audio")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
DEFAULT_BRANCH = "master"
RAW_BASE = f"https://raw.githubusercontent.com/{GITHUB_REPO}/{DEFAULT_BRANCH}"
BLOB_BASE = f"https://github.com/{GITHUB_REPO}/blob/{DEFAULT_BRANCH}"
COMMIT_BASE = f"https://github.com/{GITHUB_REPO}/commit"


def run(cmd: str) -> str:
    """Run a shell command and return stripped stdout."""
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, cwd=REPO_ROOT
    )
    return result.stdout.strip()


def github_api(endpoint: str) -> dict | list | None:
    """Call GitHub REST API. Returns parsed JSON or None on failure."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}{endpoint}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    if GITHUB_TOKEN:
        req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Section generators
# ---------------------------------------------------------------------------


def generate_recent_docs(count: int = 6) -> str:
    """Generate a table of the most recently modified docs."""
    # Get docs sorted by last commit date
    md_files = sorted(DOCS_DIR.glob("*.md"))
    if not md_files:
        return "_No documentation files found._\n"

    # Collect (date, file) pairs
    dated = []
    for f in md_files:
        rel = f.relative_to(REPO_ROOT)
        date_str = run(f'git log -1 --format="%ai" -- "{rel}"')
        if date_str:
            date_short = date_str[:10]  # YYYY-MM-DD
        else:
            date_short = "unknown"

        # Extract first heading
        title = f.stem.replace("_", " ")
        try:
            with open(f, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("# "):
                        title = line.lstrip("# ").strip()
                        break
        except Exception:
            pass

        dated.append((date_short, title, rel))

    # Sort newest first
    dated.sort(key=lambda x: x[0], reverse=True)
    top = dated[:count]

    lines = [
        "| Document | Last Updated |",
        "|:---------|:------------|",
    ]
    for date, title, rel in top:
        link = f"[{title}]({BLOB_BASE}/{rel})"
        lines.append(f"| {link} | {date} |")

    return "\n".join(lines) + "\n"


def generate_gallery() -> str:
    """Generate an image grid from docs/images/."""
    extensions = ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp")
    images = []
    for ext in extensions:
        images.extend(IMAGES_DIR.glob(ext))

    if not images:
        return "_No images yet. Add screenshots to `docs/images/` and they will appear here automatically._\n"

    # Sort by modification time (newest first)
    images.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    images = images[:9]  # Max 9 thumbnails

    cols = 3
    rows = []
    # Header row
    rows.append("| " + " | ".join([""] * cols) + " |")
    rows.append("| " + " | ".join([":---:"] * cols) + " |")

    for i in range(0, len(images), cols):
        chunk = images[i : i + cols]
        cells = []
        for img in chunk:
            rel = img.relative_to(REPO_ROOT)
            raw_url = f"{RAW_BASE}/{rel}"
            name = img.stem.replace("_", " ").replace("-", " ")
            cells.append(f'<img src="{raw_url}" width="280" alt="{name}">')
        # Pad row if needed
        while len(cells) < cols:
            cells.append("")
        rows.append("| " + " | ".join(cells) + " |")

    return "\n".join(rows) + "\n"


def generate_recent_activity(count: int = 8) -> str:
    """Generate a table of recent commits."""
    fmt = "%H|%h|%s|%an|%ai"
    log = run(f'git log -{count} --pretty=format:"{fmt}"')
    if not log:
        return "_No commit history available._\n"

    lines = [
        "| Commit | Message | Author | Date |",
        "|:-------|:--------|:-------|:-----|",
    ]
    for entry in log.splitlines():
        entry = entry.strip('"')
        parts = entry.split("|", 4)
        if len(parts) < 5:
            continue
        full_hash, short_hash, msg, author, date = parts
        date_short = date[:10]
        # Truncate long messages
        if len(msg) > 60:
            msg = msg[:57] + "..."
        # Escape pipes in commit messages
        msg = msg.replace("|", "\\|")
        commit_link = f"[`{short_hash}`]({COMMIT_BASE}/{full_hash})"
        lines.append(f"| {commit_link} | {msg} | {author} | {date_short} |")

    return "\n".join(lines) + "\n"


def generate_project_stats() -> str:
    """Generate project statistics."""
    stats = []

    # File counts by type (exclude vendored dirs)
    exclude = {".venv", "node_modules", ".git", "build", "__pycache__", ".pytest_cache"}

    def count_files(*patterns):
        total = 0
        for pat in patterns:
            for f in REPO_ROOT.rglob(pat):
                if not any(ex in f.parts for ex in exclude):
                    total += 1
        return total

    py_count = count_files("*.py")
    ts_count = count_files("*.ts", "*.tsx")
    cpp_count = count_files("*.cpp", "*.h")
    md_count = len(list(DOCS_DIR.glob("*.md"))) if DOCS_DIR.exists() else 0

    stats.append(f"**{py_count}** Python | **{ts_count}** TypeScript | **{cpp_count}** C++/H | **{md_count}** Docs")

    # Total commits
    total_commits = run("git rev-list --count HEAD")
    if total_commits:
        stats.append(f"**{total_commits}** total commits")

    # GitHub API stats
    repo_info = github_api("")
    if repo_info:
        stars = repo_info.get("stargazers_count", 0)
        forks = repo_info.get("forks_count", 0)
        open_issues = repo_info.get("open_issues_count", 0)
        stats.append(f"**{stars}** stars | **{forks}** forks | **{open_issues}** open issues")

    return " | ".join(stats) + "\n" if stats else "_Stats unavailable._\n"


def generate_credits() -> str:
    """Generate credits table from dependency files."""
    deps = {}

    # Python requirements
    for req_file in REPO_ROOT.glob("requirements*.txt"):
        try:
            with open(req_file, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or line.startswith("-"):
                        continue
                    name = re.split(r"[>=<!\[\]~;]", line)[0].strip()
                    if name:
                        deps[name.lower()] = {
                            "name": name,
                            "url": f"https://pypi.org/project/{name}/",
                            "source": "Python",
                        }
        except Exception:
            pass

    # Node.js package.json
    pkg_path = REPO_ROOT / "package.json"
    if pkg_path.exists():
        try:
            with open(pkg_path, "r") as f:
                pkg = json.load(f)
            for section in ("dependencies", "devDependencies"):
                for name in pkg.get(section, {}):
                    clean = name.lstrip("@").split("/")[-1]
                    deps[name.lower()] = {
                        "name": name,
                        "url": f"https://www.npmjs.com/package/{name}",
                        "source": "JavaScript",
                    }
        except Exception:
            pass

    # Core system deps (manual)
    core = [
        ("JUCE", "https://juce.com/", "C++ audio framework"),
        ("PipeWire", "https://pipewire.org/", "Linux multimedia server"),
        ("JACK", "https://jackaudio.org/", "Audio connection kit"),
        ("FastAPI", "https://fastapi.tiangolo.com/", "Python web framework"),
        ("React", "https://react.dev/", "UI library"),
        ("Material UI", "https://mui.com/", "React component library"),
        ("Neural Amp Modeler", "https://github.com/sdatkinson/NeuralAmpModelerPlugin", "ML amp modeling"),
        ("Textual", "https://textual.textualize.io/", "Python TUI framework"),
    ]

    lines = [
        "| Project | Role |",
        "|:--------|:-----|",
    ]
    for name, url, desc in core:
        lines.append(f"| [{name}]({url}) | {desc} |")

    if deps:
        dep_count = len(deps)
        lines.append(f"\n...and **{dep_count}** more open-source packages from PyPI and npm.")

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Marker replacement
# ---------------------------------------------------------------------------


def replace_section(content: str, marker: str, replacement: str) -> str:
    """Replace text between <!-- MARKER:START --> and <!-- MARKER:END -->."""
    pattern = re.compile(
        rf"(<!-- {re.escape(marker)}:START -->)\n(.*?)(<!-- {re.escape(marker)}:END -->)",
        re.DOTALL,
    )
    new_block = f"\\1\n{replacement}\\3"
    return pattern.sub(new_block, content)


def main():
    if not README_PATH.exists():
        print("ERROR: README.md not found")
        return

    content = README_PATH.read_text(encoding="utf-8")
    original = content

    sections = {
        "RECENT-DOCS": generate_recent_docs,
        "GALLERY": generate_gallery,
        "RECENT-ACTIVITY": generate_recent_activity,
        "PROJECT-STATS": generate_project_stats,
        "CREDITS": generate_credits,
    }

    for marker, generator in sections.items():
        start_tag = f"<!-- {marker}:START -->"
        if start_tag in content:
            print(f"Updating section: {marker}")
            content = replace_section(content, marker, generator())
        else:
            print(f"Skipping section: {marker} (no marker found)")

    if content != original:
        README_PATH.write_text(content, encoding="utf-8")
        print("README.md updated successfully.")
    else:
        print("No changes needed.")


if __name__ == "__main__":
    main()
