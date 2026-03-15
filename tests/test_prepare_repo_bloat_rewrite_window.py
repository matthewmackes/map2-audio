from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_repo_bloat_rewrite_window.py"


def _git(path: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True)


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _seed_repo(repo: Path) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    _git(repo, "init")
    _git(repo, "config", "user.name", "Codex")
    _git(repo, "config", "user.email", "codex@example.com")

    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "leftpad.js").write_text("module.exports = 0;\n", encoding="utf-8")
    (repo / "juce-engine" / "build-debug").mkdir(parents=True)
    (repo / "juce-engine" / "build-debug" / "artifact.o").write_text("obj\n", encoding="utf-8")
    (repo / "data" / "repair-backups").mkdir(parents=True)
    (repo / "data" / "repair-backups" / "snapshot.txt").write_text("backup\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "seed tracked bloat")


def test_prepare_repo_bloat_rewrite_window_blocks_for_non_mirror_repo(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    _seed_repo(repo)
    _git(repo, "remote", "add", "origin", "https://github.com/example/map2-audio.git")
    _git(repo, "remote", "add", "gitlab", "git@gitlab.com:example/map2-audio.git")

    output_dir = tmp_path / "out"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--repo",
            str(repo),
            "--output-dir",
            str(output_dir),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert proc.returncode == 2, proc.stderr
    summary = json.loads((output_dir / "t082-rewrite-window-plan.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "BLOCKED"
    assert summary["repo"]["is_bare"] is False
    assert summary["tracked_bloat"]["unique_matched_files"] == 3
    helper_path = output_dir / "run_repo_bloat_rewrite_window.sh"
    assert helper_path.exists()
    assert os.access(helper_path, os.X_OK)
    notice = (output_dir / "T082_REPO_REWRITE_COLLABORATOR_NOTICE.md").read_text(encoding="utf-8")
    assert "https://github.com/example/map2-audio.git" in notice
    assert "git@gitlab.com:example/map2-audio.git" in notice


def test_prepare_repo_bloat_rewrite_window_is_ready_for_mirror_repo_with_tool(tmp_path: Path) -> None:
    source_repo = tmp_path / "source"
    _seed_repo(source_repo)
    _git(source_repo, "remote", "add", "origin", "https://github.com/example/map2-audio.git")

    mirror_repo = tmp_path / "mirror.git"
    subprocess.run(
        ["git", "clone", "--mirror", str(source_repo), str(mirror_repo)],
        check=True,
        capture_output=True,
        text=True,
    )
    _git(mirror_repo, "remote", "set-url", "origin", "https://github.com/example/map2-audio.git")
    _git(mirror_repo, "remote", "add", "gitlab", "git@gitlab.com:example/map2-audio.git")

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "git-filter-repo",
        """#!/usr/bin/env bash
echo "fake git-filter-repo"
""",
    )

    output_dir = tmp_path / "ready"
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--repo",
            str(mirror_repo),
            "--output-dir",
            str(output_dir),
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 0, proc.stderr
    summary = json.loads((output_dir / "t082-rewrite-window-plan.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "READY"
    assert summary["repo"]["is_bare"] is True
    assert summary["repo"]["is_mirror_clone"] is True
    assert summary["git_filter_repo"]["available"] is True
    helper = (output_dir / "run_repo_bloat_rewrite_window.sh").read_text(encoding="utf-8")
    assert 'git -C "$REPO_DIR" push origin --force --all' in helper
    assert 'git -C "$REPO_DIR" push gitlab --force --all' in helper
